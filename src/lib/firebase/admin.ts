import "server-only";
import admin from "firebase-admin";
import { readFileSync } from "node:fs";

function loadServiceAccount() {
  const p = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  if (!p) throw new Error("Missing FIREBASE_ADMIN_CREDENTIALS_PATH");

  // Lecture runtime (compatible Turbopack)
  const raw = readFileSync(p, "utf8");
  return JSON.parse(raw);
}

export function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const serviceAccount = loadServiceAccount();

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const adminApp = getAdminApp();
export const adminAuth = adminApp.auth();
export const adminDb = adminApp.firestore();