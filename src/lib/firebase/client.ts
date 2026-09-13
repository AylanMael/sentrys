"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { getStorage, connectStorageEmulator, type FirebaseStorage } from "firebase/storage";

function parseFirebaseWebAppConfig() {
  const raw = process.env.FIREBASE_WEBAPP_CONFIG;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, string | undefined>;
  } catch {
    return null;
  }
}

const firebaseWebConfig = parseFirebaseWebAppConfig();

const defaultFirebaseWebConfig: Record<string, string> = {
  apiKey: "AIzaSyABPFu91CWi0LkdBXD-1OXgHgheFYLwZFE",
  appId: "1:782055895046:web:474cf111d4b4b759cb9387",
  authDomain: "sentrys.firebaseapp.com",
  messagingSenderId: "782055895046",
  projectId: "sentrys",
  storageBucket: "sentrys.firebasestorage.app",
};

function nonEmpty(value: string | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function envValue(publicKey: string, firebaseConfigKey: string) {
  return (
    nonEmpty(process.env[publicKey]) ??
    nonEmpty(firebaseWebConfig?.[firebaseConfigKey]) ??
    defaultFirebaseWebConfig[firebaseConfigKey] ??
    undefined
  );
}

const firebaseConfig = {
  apiKey: envValue("NEXT_PUBLIC_FIREBASE_API_KEY", "apiKey"),
  authDomain: envValue("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "authDomain"),
  projectId: envValue("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "projectId"),
  storageBucket: envValue(
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "storageBucket"
  ),
  messagingSenderId: envValue(
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "messagingSenderId"
  ),
  appId: envValue("NEXT_PUBLIC_FIREBASE_APP_ID", "appId"),
  measurementId: envValue(
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    "measurementId"
  ),
};

if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
  throw new Error(
    "Firebase config manquante. Configure NEXT_PUBLIC_FIREBASE_* ou FIREBASE_WEBAPP_CONFIG."
  );
}

const localEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
if (localEmulators && (process.env.NODE_ENV !== "development"
  || (typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname)))) {
  throw new Error("Les émulateurs sont réservés au développement local.");
}
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(localEmulators ? {
  apiKey: "demo-local-only", projectId: "demo-sentrys-accounts",
  authDomain: "localhost", storageBucket: "demo-sentrys-accounts.appspot.com",
  appId: "demo-sentrys-local",
} : firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

// Keep the marker on the Firebase app across development hot reloads.
const emulatorApp = app as FirebaseApp & { sentrysEmulatorsConnected?: boolean };
if (localEmulators && !emulatorApp.sentrysEmulatorsConnected) {
  if (app.options.projectId !== "demo-sentrys-accounts") throw new Error("Projet émulateur incohérent : redémarrez la page.");
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFirestoreEmulator(db, "127.0.0.1", 8091);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  emulatorApp.sentrysEmulatorsConnected = true;
}

export { app, auth, db, storage };
