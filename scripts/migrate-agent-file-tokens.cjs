#!/usr/bin/env node

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

const repair = process.argv.includes("--repair");
const tenantArg = process.argv.find((arg) => arg.startsWith("--tenant="));
const tenantFilter = tenantArg ? tenantArg.slice("--tenant=".length).trim() : null;

function ensureAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "sentrys";
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${projectId}.firebasestorage.app`;
  const credentialsPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;

  if (credentialsPath) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const serviceAccount = require(path.resolve(process.cwd(), credentialsPath));
    return initializeApp({
      credential: cert(serviceAccount),
      projectId,
      storageBucket,
    });
  }

  return initializeApp({ projectId, storageBucket });
}

function parseFirebaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.hostname !== "firebasestorage.googleapis.com") return null;
    const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) return null;
    return { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function validAgentPath(storagePath, tenantId, agentId) {
  return storagePath.startsWith(`tenants/${tenantId}/agents/${agentId}/`)
    && !storagePath.includes("..");
}

async function revokeToken(storage, target) {
  const file = storage.bucket(target.bucket).file(target.path);
  const [metadata] = await file.getMetadata();
  const customMetadata = { ...(metadata.metadata || {}) };
  delete customMetadata.firebaseStorageDownloadTokens;
  await file.setMetadata({
    cacheControl: "private, no-store, max-age=0",
    metadata: customMetadata,
  });
}

async function run() {
  ensureAdminApp();
  const db = getFirestore();
  const storage = getStorage();
  let query = db.collection("agents");
  if (tenantFilter) query = query.where("tenantId", "==", tenantFilter);

  const snapshot = await query.get();
  const report = {
    mode: repair ? "repair" : "audit",
    tenantFilter,
    scannedAgents: snapshot.size,
    affectedAgents: 0,
    affectedFiles: 0,
    repairedAgents: 0,
    revokedTokens: 0,
    errors: [],
  };

  for (const documentSnapshot of snapshot.docs) {
    const agent = documentSnapshot.data();
    const tenantId = String(agent.tenantId || "").trim();
    const agentId = documentSnapshot.id;
    const profile = agent.profile && typeof agent.profile === "object"
      ? { ...agent.profile }
      : {};
    const targets = [];
    let changed = false;

    const photoTarget = parseFirebaseUrl(profile.photoUrl);
    if (photoTarget && validAgentPath(photoTarget.path, tenantId, agentId)) {
      targets.push(photoTarget);
      profile.photoPath = photoTarget.path;
      delete profile.photoUrl;
      changed = true;
    }

    if (Array.isArray(profile.documents)) {
      profile.documents = profile.documents.map((item) => {
        if (!item || typeof item !== "object") return item;
        const next = { ...item };
        const target = parseFirebaseUrl(next.url);
        if (!target || !validAgentPath(target.path, tenantId, agentId)) return next;
        targets.push(target);
        next.path = target.path;
        delete next.url;
        changed = true;
        return next;
      });
    }

    if (!changed) continue;
    report.affectedAgents += 1;
    report.affectedFiles += targets.length;

    if (!repair) {
      console.log(JSON.stringify({ tenantId, agentId, files: targets.map((target) => target.path) }));
      continue;
    }

    try {
      for (const target of targets) {
        await revokeToken(storage, target);
        report.revokedTokens += 1;
      }

      await documentSnapshot.ref.update({
        profile,
        updatedAt: FieldValue.serverTimestamp(),
        migration: {
          agentFilesPrivateAt: FieldValue.serverTimestamp(),
          agentFilesPrivateVersion: 1,
        },
      });
      report.repairedAgents += 1;
    } catch (error) {
      report.errors.push({
        tenantId,
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error("Agent file migration failed", error);
  process.exitCode = 1;
});