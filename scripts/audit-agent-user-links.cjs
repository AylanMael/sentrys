#!/usr/bin/env node

const { createHash } = require("node:crypto");
const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const repair = process.argv.includes("--repair");
const tenantArg = process.argv.find((arg) => arg.startsWith("--tenant="));
const tenantFilter = tenantArg ? tenantArg.slice("--tenant=".length).trim() : null;

function ensureAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sentrys";
  const credentialsPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  if (credentialsPath) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const serviceAccount = require(path.resolve(process.cwd(), credentialsPath));
    return initializeApp({ credential: cert(serviceAccount), projectId });
  }
  return initializeApp({ projectId });
}

function text(value) {
  const result = String(value || "").trim();
  return result || null;
}

function email(value) {
  return text(value)?.toLowerCase() || null;
}

function linkId(tenantId, agentId) {
  return createHash("sha256").update(`${tenantId}\0${agentId}`).digest("hex");
}

async function run() {
  ensureAdminApp();
  const db = getFirestore();
  const [usersSnap, agentsSnap, linksSnap] = await Promise.all([
    tenantFilter
      ? db.collection("tenantUsers").where("tenantId", "==", tenantFilter).get()
      : db.collection("tenantUsers").get(),
    tenantFilter
      ? db.collection("agents").where("tenantId", "==", tenantFilter).get()
      : db.collection("agents").get(),
    tenantFilter
      ? db.collection("tenantAgentLinks").where("tenantId", "==", tenantFilter).get()
      : db.collection("tenantAgentLinks").get(),
  ]);

  const agents = new Map();
  const agentsByEmail = new Map();
  agentsSnap.forEach((doc) => {
    const data = doc.data();
    const tenantId = text(data.tenantId);
    if (!tenantId) return;
    const key = `${tenantId}\0${doc.id}`;
    agents.set(key, { id: doc.id, ...data });
    const agentEmail = email(data.email);
    if (agentEmail) {
      const emailKey = `${tenantId}\0${agentEmail}`;
      const list = agentsByEmail.get(emailKey) || [];
      list.push(doc.id);
      agentsByEmail.set(emailKey, list);
    }
  });

  const links = new Map();
  linksSnap.forEach((doc) => links.set(doc.id, doc.data()));
  const usedAgentKeys = new Map();
  const report = {
    mode: repair ? "repair" : "audit",
    tenantFilter,
    scannedUsers: usersSnap.size,
    agentUsers: 0,
    validLinks: 0,
    missingAgentId: [],
    inferredLinks: [],
    invalidLinks: [],
    duplicateLinks: [],
    missingReservations: [],
    repaired: 0,
    errors: [],
  };

  for (const userDoc of usersSnap.docs) {
    const user = userDoc.data();
    if (String(user.role || "") !== "agent") continue;
    report.agentUsers += 1;
    const tenantId = text(user.tenantId);
    let agentId = text(user.agentId);

    if (!tenantId) {
      report.invalidLinks.push({ uid: userDoc.id, reason: "missing_tenant" });
      continue;
    }

    if (!agentId) {
      const candidates = agentsByEmail.get(`${tenantId}\0${email(user.email)}`) || [];
      if (candidates.length === 1) {
        agentId = candidates[0];
        report.inferredLinks.push({ tenantId, uid: userDoc.id, agentId, source: "unique_email" });
      } else {
        report.missingAgentId.push({ tenantId, uid: userDoc.id, candidateCount: candidates.length });
        continue;
      }
    }

    const agentKey = `${tenantId}\0${agentId}`;
    const agent = agents.get(agentKey);
    if (!agent) {
      report.invalidLinks.push({ tenantId, uid: userDoc.id, agentId, reason: "agent_not_found" });
      continue;
    }

    const previousUid = usedAgentKeys.get(agentKey);
    if (previousUid && previousUid !== userDoc.id) {
      report.duplicateLinks.push({ tenantId, agentId, uids: [previousUid, userDoc.id] });
      continue;
    }
    usedAgentKeys.set(agentKey, userDoc.id);

    const reservationId = linkId(tenantId, agentId);
    const reservation = links.get(reservationId);
    if (!reservation || String(reservation.uid || "") !== userDoc.id) {
      report.missingReservations.push({ tenantId, uid: userDoc.id, agentId });
    } else {
      report.validLinks += 1;
    }

    if (!repair) continue;

    try {
      await db.runTransaction(async (tx) => {
        const userRef = db.collection("tenantUsers").doc(userDoc.id);
        const agentRef = db.collection("agents").doc(agentId);
        const linkRef = db.collection("tenantAgentLinks").doc(reservationId);
        const [freshUser, freshAgent, freshLink] = await Promise.all([
          tx.get(userRef),
          tx.get(agentRef),
          tx.get(linkRef),
        ]);
        if (!freshUser.exists || !freshAgent.exists) throw new Error("Source document missing");
        const currentUser = freshUser.data();
        const currentAgent = freshAgent.data();
        if (currentUser.tenantId !== tenantId || currentUser.role !== "agent") throw new Error("User changed during repair");
        if (currentAgent.tenantId !== tenantId) throw new Error("Agent tenant mismatch");
        if (freshLink.exists && freshLink.data().uid !== userDoc.id) throw new Error("Reservation already owned");

        const now = FieldValue.serverTimestamp();
        tx.update(userRef, { agentId, updatedAt: now });
        tx.set(linkRef, {
          tenantId,
          agentId,
          uid: userDoc.id,
          updatedAt: now,
          updatedBy: "audit-agent-user-links",
          ...(!freshLink.exists ? { createdAt: now, createdBy: "audit-agent-user-links" } : {}),
        }, { merge: true });
      });
      report.repaired += 1;
    } catch (error) {
      report.errors.push({ tenantId, uid: userDoc.id, agentId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.duplicateLinks.length || report.invalidLinks.length || report.errors.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error("Agent/user link audit failed", error);
  process.exitCode = 1;
});