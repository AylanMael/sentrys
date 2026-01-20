
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import type { Role } from "@/lib/types";
import { FirebaseErrorListener } from "@/components/FirebaseErrorListener";

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        // Ensure db is initialized before trying to use it
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
                console.error("No tenant user document found for UID:", firebaseUser.uid);
                // This can happen briefly during signup before the tenantUser doc is created.
                // Or if the user exists in Auth but not in Firestore's tenantUsers collection.
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

  return (
    <AuthContext.Provider value={{ user, loading }}>
      <FirebaseErrorListener />
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
