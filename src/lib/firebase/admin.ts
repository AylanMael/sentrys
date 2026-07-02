import "server-only";
import admin from "firebase-admin";
import { readFileSync } from "node:fs";

const defaultProjectId = "sentrys";
const defaultStorageBucket = `${defaultProjectId}.firebasestorage.app`;
const shouldLogFirebaseAdmin =
  process.env.NODE_ENV !== "production" ||
  process.env.FIREBASE_ADMIN_DEBUG === "true";

function logFirebaseAdmin(message: string, extra?: Record<string, unknown>) {
  if (!shouldLogFirebaseAdmin) return;

  if (extra) {
    console.log(`[Firebase Admin] ${message}`, extra);
    return;
  }

  console.log(`[Firebase Admin] ${message}`);
}

function nonEmptyEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseJsonEnv(name: string) {
  const raw = nonEmptyEnv(name);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveStorageBucket(projectId: string) {
  const firebaseConfig = parseJsonEnv("FIREBASE_CONFIG");
  const firebaseWebConfig = parseJsonEnv("FIREBASE_WEBAPP_CONFIG");

  return (
    nonEmptyEnv("FIREBASE_STORAGE_BUCKET") ??
    nonEmptyEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") ??
    stringValue(firebaseConfig?.storageBucket) ??
    stringValue(firebaseWebConfig?.storageBucket) ??
    (projectId === defaultProjectId
      ? defaultStorageBucket
      : `${projectId}.firebasestorage.app`)
  );
}

export function getAdminApp() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    stringValue(parseJsonEnv("FIREBASE_CONFIG")?.projectId) ??
    stringValue(parseJsonEnv("FIREBASE_WEBAPP_CONFIG")?.projectId) ??
    defaultProjectId;

  const storageBucket = resolveStorageBucket(projectId);

  if (admin.apps.length) {
    const app = admin.app();
    const activeId = app.options.projectId ?? projectId;
    logFirebaseAdmin("Using existing app", {
      projectId: activeId,
      storageBucket: app.options.storageBucket ?? storageBucket,
    });
    return app;
  }

  const p = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  logFirebaseAdmin("Initializing app", {
    projectId,
    storageBucket,
    credentialsPathConfigured: Boolean(p),
  });

  if (!p) {
    return admin.initializeApp({ projectId, storageBucket });
  }

  try {
    const raw = readFileSync(p, "utf8");
    const serviceAccount = JSON.parse(raw) as admin.ServiceAccount;

    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
      storageBucket,
    });
    logFirebaseAdmin("App initialized with service account", {
      serviceAccountProjectId: serviceAccount.projectId ?? null,
      projectId,
      storageBucket,
    });
    return app;
  } catch (err) {
    console.error("Failed to load Firebase credentials from path:", p, err);
    return admin.initializeApp({ projectId, storageBucket });
  }
}

export const adminApp = getAdminApp();
export const adminAuth = adminApp.auth();
export const adminDb = adminApp.firestore();
export const adminStorage = admin.storage(adminApp);
export const adminStorageBucketName =
  adminApp.options.storageBucket ??
  resolveStorageBucket(adminApp.options.projectId ?? defaultProjectId);
export const adminBucket = adminStorage.bucket(adminStorageBucketName);