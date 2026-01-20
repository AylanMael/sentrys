
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type { Role } from "@/lib/types";

interface UserData {
  uid: string;
  email: string | null;
  tenantId: string | null;
  role: Role | null;
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [firebaseError, setFirebaseError] = useState(false);

  useEffect(() => {
    // If Firebase is not configured, display an error message instead of the app.
    // This prevents the app from crashing and guides the user to fix the configuration.
    if (!auth || !db) {
        setFirebaseError(true);
        setLoading(false);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        // Look for user data in tenantUsers collection
        const tenantUserRef = doc(db, `tenantUsers/${firebaseUser.uid}`);
        const tenantUserSnap = await getDoc(tenantUserRef);

        if (tenantUserSnap.exists()) {
            const tenantUserData = tenantUserSnap.data();
            setUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                tenantId: tenantUserData.tenantId,
                role: tenantUserData.role,
            });
        } else {
            // This case might happen if tenant user doc creation fails during signup
            // Or if user exists in Auth but not in our tenantUsers collection
            console.error("No tenant user document found for UID:", firebaseUser.uid);
            setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (firebaseError) {
    return (
        <div className="flex min-h-dvh w-full items-center justify-center bg-background p-4 text-foreground">
            <div className="w-full max-w-lg rounded-lg border bg-card p-8 text-center shadow-lg">
                <h1 className="text-2xl font-bold text-destructive">Firebase Initialization Error</h1>
                <p className="mt-4 text-card-foreground">
                    The application could not connect to Firebase. This might be a temporary issue or a problem with the provided configuration.
                </p>
                 <p className="mt-4 text-sm text-muted-foreground">
                    Please try refreshing the page. If the problem persists, contact support.
                </p>
            </div>
        </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
