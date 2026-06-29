import "server-only";
import admin from "firebase-admin";
import { readFileSync } from "node:fs";

const defaultProjectId = "sentrys";
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

export function getAdminApp() {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    defaultProjectId;

  if (admin.apps.length) {
    const app = admin.app();
    const activeId = app.options.projectId ?? projectId;
    logFirebaseAdmin("Using existing app", { projectId: activeId });
    return app;
  }

  const p = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  logFirebaseAdmin("Initializing app", {
    projectId,
    credentialsPathConfigured: Boolean(p),
  });

  if (!p) {
    return admin.initializeApp({ projectId });
  }

  try {
    const raw = readFileSync(p, "utf8");
    const serviceAccount = JSON.parse(raw) as admin.ServiceAccount;

    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
    logFirebaseAdmin("App initialized with service account", {
      serviceAccountProjectId: serviceAccount.projectId ?? null,
      projectId,
    });
    return app;
  } catch (err) {
    console.error("Failed to load Firebase credentials from path:", p, err);
    return admin.initializeApp({ projectId });
  }
}

export const adminApp = getAdminApp();
export const adminAuth = adminApp.auth();
export const adminDb = adminApp.firestore();
export const adminStorage = admin.storage(adminApp);
export const adminBucket = adminStorage.bucket(
  process.env.FIREBASE_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
);
