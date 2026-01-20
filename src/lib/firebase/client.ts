
"use client";

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyABPFu91CWi0LkdBXD-1OXgHgheFYLwZFE",
  authDomain: "sentrys.firebaseapp.com",
  projectId: "sentrys",
  storageBucket: "sentrys.firebasestorage.app",
  messagingSenderId: "782055895046",
  appId: "1:782055895046:web:474cf111d4b4b759cb9387",
  measurementId: "G-4XEPQK00MY"
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

// Initialize Firebase
try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase initialization failed:", e);
    // The AuthProvider will catch that auth and db are undefined and show an error.
}


export { app, auth, db };
