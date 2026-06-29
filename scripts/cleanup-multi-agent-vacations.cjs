#!/usr/bin/env node

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const { getApps, initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldPath } = require("firebase-admin/firestore");

function ensureAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "sentrys";

  const credentialsPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;

  if (credentialsPath) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const serviceAccount = require(path.resolve(process.cwd(), credentialsPath));
    return initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }

  return initializeApp({ projectId });
}

function chunk(items, size = 10) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function run() {
  ensureAdminApp();
  const db = getFirestore();

  const vacationSnap = await db.collection("vacations").limit(2000).get();
  const allVacations = vacationSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const targets = allVacations.filter((vacation) => {
    const assigned = Array.isArray(vacation.assignedAgentIds) ? vacation.assignedAgentIds.length : 0;
    const required = Number.isFinite(Number(vacation.requiredAgents))
      ? Number(vacation.requiredAgents)
      : 1;
    return assigned > 1 || required > 1;
  });

  if (targets.length === 0) {
    console.log(JSON.stringify({ ok: true, deletedVacations: 0, deletedAssignments: 0 }));
    return;
  }

  const targetIds = targets.map((vacation) => vacation.id);

  const assignmentIds = [];
  for (const batchIds of chunk(targetIds, 10)) {
    const assignmentSnap = await db
      .collection("assignments")
      .where("vacationId", "in", batchIds)
      .get();

    assignmentSnap.forEach((doc) => assignmentIds.push(doc.id));
  }

  let batch = db.batch();
  let opCount = 0;
  const commits = [];

  const queueDelete = (ref) => {
    if (opCount >= 450) {
      commits.push(batch.commit());
      batch = db.batch();
      opCount = 0;
    }
    batch.delete(ref);
    opCount += 1;
  };

  targets.forEach((vacation) => {
    queueDelete(db.collection("vacations").doc(vacation.id));
  });

  assignmentIds.forEach((assignmentId) => {
    queueDelete(db.collection("assignments").doc(assignmentId));
  });

  if (opCount > 0) {
    commits.push(batch.commit());
  }

  await Promise.all(commits);

  console.log(
    JSON.stringify({
      ok: true,
      deletedVacations: targets.length,
      deletedAssignments: assignmentIds.length,
      sample: targets.slice(0, 10).map((vacation) => ({
        id: vacation.id,
        title: vacation.title || null,
        siteId: vacation.siteId || null,
        requiredAgents: vacation.requiredAgents || 1,
        assignedCount: Array.isArray(vacation.assignedAgentIds) ? vacation.assignedAgentIds.length : 0,
      })),
    })
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
