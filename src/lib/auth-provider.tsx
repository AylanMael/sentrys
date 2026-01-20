
"use client";

import React, { createContext, useContext, useEffect, useState }from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type { Role } from "@/lib/types";
import { FirebaseErrorListener } from "@/components/FirebaseErrorListener";
import { Button } from "@/components/ui/button";
import Logo from "@/components/logo";
import { Card } from "@/components/ui/card";

interface UserData {
  uid: string;
  email: string | null;
  tenantId: string | null;
  role: Role | null;
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  firebaseError: string | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, firebaseError: null });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth || !db) {
        setFirebaseError("Firebase is not initialized. Please check your configuration.");
        setLoading(false);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        if (!db) {
          console.error("Firestore is not initialized.");
          setUser(null);
          setLoading(false);
          return;
        }
        const tenantUserRef = doc(db, `tenantUsers/${firebaseUser.uid}`);
        try {
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
                // This can happen briefly during signup before the tenantUser doc is created,
                // or if the user exists in Auth but not in Firestore's tenantUsers collection.
                setUser(null);
            }
        } catch (error) {
            console.error("Error fetching tenant user data:", error);
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
            <Card className="w-full max-w-lg rounded-lg border bg-card p-8 text-center shadow-lg">
                 <div className="mb-6 flex justify-center">
                    <Logo />
                </div>
                <h1 className="text-2xl font-bold text-destructive">Firebase Configuration Error</h1>
                <p className="mt-2 text-muted-foreground">
                    {firebaseError}
                </p>
                <p className="mt-6 text-left text-sm text-muted-foreground">
                    Please ensure your Firebase project is correctly set up and that the security rules have been deployed. If you have just created the project, it may take a moment for the services to be available.
                </p>
                 <Button onClick={() => window.location.reload()} className="mt-6">
                    Retry Connection
                </Button>
            </Card>
        </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, firebaseError }}>
      <FirebaseErrorListener />
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
