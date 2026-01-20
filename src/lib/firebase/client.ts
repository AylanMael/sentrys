
"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  "projectId": "studio-2061399499-76ecb",
  "appId": "1:486767503857:web:844c4f20dcfd157eeb7c50",
  "apiKey": "AIzaSyCyXM0VA9DdheerlipvmCh2uLNRlu7Im10",
  "authDomain": "studio-2061399499-76ecb.firebaseapp.com",
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
