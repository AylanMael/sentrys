"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyABPFu91CWi0LkdBXD-1OXgHgheFYLwZFE",
  authDomain: "sentrys.firebaseapp.com",
  projectId: "sentrys",
  storageBucket: "sentrys.appspot.com",
  messagingSenderId: "782055895046",
  appId: "1:782055895046:web:474cf111d4b4b759cb9387"
};

let app, auth, db;

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
