"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { usePathname } from "next/navigation";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";

import { auth } from "@/lib/firebase/client";
import type { Role } from "@/lib/types";
import { FirebaseErrorListener } from "@/components/FirebaseErrorListener";

/** Réponse attendue de GET /api/me */
type MeResponse = {
  ok: boolean;
  uid?: string;
  email?: string | null;
  name?: string | null;
  tenantId?: string | null;
  role?: string | null;
  status?: string | null; // "active" | "disabled" etc
  hasTenant?: boolean;
  tenant?: any | null;
  error?: string; // optionnel si /api/me renvoie une erreur
};

interface UserData {
  uid: string;
  email: string | null;
  tenantId: string | null;
  role: Role | null;
  isProvisioned: boolean; // true si tenantUsers/{uid} existe + tenantId présent
  status?: string | null;
  name?: string | null;
  tenant?: any | null;
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  refresh: () => Promise<UserData | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refresh: async () => null,
});

async function fetchMe(firebaseUser: FirebaseUser): Promise<MeResponse> {
  const token = await firebaseUser.getIdToken();

  const res = await fetch("/api/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  let data: MeResponse;
  try {
    data = (await res.json()) as MeResponse;
  } catch {
    // Si jamais la réponse n’est pas du JSON (proxy/CDN/erreur rare)
    return { ok: false, error: "Invalid JSON from /api/me" };
  }

  // ✅ FIX TS2783: spread d'abord puis override
  if (!res.ok) {
    return { ...data, ok: false };
  }

  return data;
}

function toUserData(firebaseUser: FirebaseUser, me: MeResponse): UserData {
  const role = (me.role ?? null) as Role | null;
  const tenantId = me.tenantId ?? null;

  // ✅ on ne considère provisionné que si me.ok ET tenantId présent
  const isProvisioned = Boolean(me.ok && tenantId);

  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name: me.name ?? null,
    tenantId,
    role,
    status: me.status ?? null,
    tenant: me.tenant ?? null,
    isProvisioned,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Anti race-condition si onAuthStateChanged se déclenche plusieurs fois
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      setUser(null);
      return null;
    }

    try {
      const me = await fetchMe(firebaseUser);
      const next = toUserData(firebaseUser, me);
      setUser(next);
      return next;
    } catch {
      // si /api/me échoue, on garde un état minimal (auth ok)
      const next: UserData = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: null,
        tenantId: null,
        role: null,
        status: null,
        tenant: null,
        isProvisioned: false,
      };
      setUser(next);
      return next;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: FirebaseUser | null) => {
        const requestId = ++requestIdRef.current;

        try {
          setLoading(true);

          if (!firebaseUser) {
            if (requestId !== requestIdRef.current) return;
            setUser(null);
            setLoading(false);
            return;
          }

          const isSignupRoute = (pathname ?? "").startsWith("/signup");

          const me = await fetchMe(firebaseUser);
          if (requestId !== requestIdRef.current) return;

          const next = toUserData(firebaseUser, me);
          setUser(next);

          if (!isSignupRoute && me.ok && me.hasTenant === false) {
            console.warn(
              "Authenticated user has no tenantUsers doc (provisioning incomplete). uid=",
              firebaseUser.uid
            );
          }

          setLoading(false);
        } catch (err) {
          console.error("AuthProvider error:", err);

          if (requestId !== requestIdRef.current) return;

          const current = auth.currentUser;
          setUser(
            current
              ? {
                  uid: current.uid,
                  email: current.email,
                  name: null,
                  tenantId: null,
                  role: null,
                  status: null,
                  tenant: null,
                  isProvisioned: false,
                }
              : null
          );

          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [pathname]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh }}>
      <FirebaseErrorListener />
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
