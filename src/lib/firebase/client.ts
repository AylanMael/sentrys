"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

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

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { app, auth, db, storage };
