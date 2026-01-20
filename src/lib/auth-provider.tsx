
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
  const [firebaseError, setFirebaseError] = useState(false);

  useEffect(() => {
    // This effect only runs on the client, after the initial render.
    if (!auth || !db) {
        setFirebaseError(true);
        setLoading(false);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
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

  // On the server, and on the client's initial render, `loading` is true.
  // This will render the loading state inside `DashboardLayout`, ensuring no hydration mismatch.
  if (loading) {
    return (
        <AuthContext.Provider value={{ user: null, loading: true }}>
            {children}
        </AuthContext.Provider>
    );
  }

  // This part is only reached on the client after the effect has run.
  if (firebaseError) {
    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-background p-4 text-foreground">
            <div className="w-full max-w-lg rounded-lg border bg-card p-8 text-center shadow-lg">
                <h1 className="text-2xl font-bold text-destructive">Firebase Configuration Error</h1>
                <p className="mt-4 text-card-foreground">
                    Your Firebase environment variables are not set correctly. The application cannot connect to Firebase.
                </p>
                 <p className="mt-4 text-sm text-muted-foreground">
                    Please create a <code>.env.local</code> file in the root of your project and add your Firebase project credentials. You can find these in your Firebase project settings.
                </p>
                <pre className="mt-6 text-left bg-muted p-4 rounded-md text-sm overflow-x-auto">
                    <code>
{`# .env.local

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
`}
                    </code>
                </pre>
                <p className="mt-4 text-xs text-muted-foreground">
                    After creating the file, you must restart the development server.
                </p>
            </div>
        </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      <FirebaseErrorListener />
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
