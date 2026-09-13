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
import { suspensionMode } from "@/lib/auth/tenant-suspension";
import { AccessUnavailable } from "@/components/auth/access-unavailable";
import { readAccessResponse, withAccessDeadline } from "@/lib/auth/access-verification";

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
  agentId?: string | null;
  tenant?: any | null;
  error?: string; // optionnel si /api/me renvoie une erreur
};

interface UserData {
  agentId?: string | null;
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

  /**
   * Le FirebaseUser brut (utile pour getIdToken, emailVerified, etc.)
   * Sans casser ton modèle UserData.
   */
  firebaseUser: FirebaseUser | null;

  loading: boolean;

  /** Rafraîchit /api/me et met à jour user */
  refresh: () => Promise<UserData | null>;

  /**
   * Récupère un Bearer token Firebase pour appeler tes routes /api/*
   * forceRefresh=true si tu viens de mettre à jour des custom claims.
   */
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  loading: true,
  refresh: async () => null,
  getToken: async () => null,
});

async function fetchMe(firebaseUser: FirebaseUser): Promise<MeResponse> {
  return withAccessDeadline(async (signal) => {
  const token = await firebaseUser.getIdToken();

  const res = await fetch("/api/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
  });

  return readAccessResponse(res);
  });
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
    agentId: me.agentId ?? null,
    isProvisioned,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [user, setUser] = useState<UserData | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationUnavailable, setVerificationUnavailable] = useState(false);

  // Anti race-condition si onAuthStateChanged se déclenche plusieurs fois
  const requestIdRef = useRef(0);
  const refreshInFlight = useRef<{ uid: string; promise: Promise<UserData | null> } | null>(null);

  const getToken = useCallback(async (forceRefresh = false) => {
    const u = auth.currentUser;
    if (!u) return null;
    return u.getIdToken(forceRefresh);
  }, []);

  const performRefresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const current = auth.currentUser;
    if (!current) {
      setFirebaseUser(null);
      setUser(null);
      setVerificationUnavailable(false);
      setLoading(false);
      return null;
    }

    try {
      const me = await fetchMe(current);
      if (requestId !== requestIdRef.current || auth.currentUser?.uid !== current.uid) return null;
      const next = toUserData(current, me);
      setVerificationUnavailable(false);
      setFirebaseUser(current);
      setUser(next);
      return next;
    } catch {
      if (requestId !== requestIdRef.current || auth.currentUser?.uid !== current.uid) return null;
      setVerificationUnavailable(true);
      // si /api/me échoue, on garde un état minimal (auth ok)
      const next: UserData = {
        uid: current.uid,
        email: current.email,
        name: null,
        tenantId: null,
        role: null,
        status: null,
        tenant: null,
        isProvisioned: false,
      };
      setFirebaseUser(current);
      setUser(next);
      return next;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    const uid = auth.currentUser?.uid;
    if (uid && refreshInFlight.current?.uid === uid) return refreshInFlight.current.promise;
    const promise = performRefresh();
    const entry = uid ? { uid, promise } : null;
    refreshInFlight.current = entry;
    void promise.finally(() => {
      if (refreshInFlight.current === entry) refreshInFlight.current = null;
    });
    return promise;
  }, [performRefresh]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (nextFirebaseUser: FirebaseUser | null) => {
        refreshInFlight.current = null;
        const requestId = ++requestIdRef.current;

        try {
          setLoading(true);

          if (!nextFirebaseUser) {
            if (requestId !== requestIdRef.current) return;
            setFirebaseUser(null);
            setUser(null);
            setVerificationUnavailable(false);
            setLoading(false);
            return;
          }

          setFirebaseUser(nextFirebaseUser);

          const isSignupRoute = (pathname ?? "").startsWith("/signup");

          const me = await fetchMe(nextFirebaseUser);
          if (requestId !== requestIdRef.current) return;

          const next = toUserData(nextFirebaseUser, me);
          setVerificationUnavailable(false);
          setUser(next);

          if (!isSignupRoute && me.ok && me.hasTenant === false) {
            console.warn(
              "Authenticated user has no tenantUsers doc (provisioning incomplète). uid=",
              nextFirebaseUser.uid
            );
          }

          setLoading(false);
        } catch (err) {
          console.error("AuthProvider error:", err);

          if (requestId !== requestIdRef.current) return;

          setVerificationUnavailable(true);

          const current = auth.currentUser;

          setFirebaseUser(current ?? null);

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

    return () => { ++requestIdRef.current; unsubscribe(); };
  }, [pathname]);

  const privatePage = /^\/(dashboard|platform|agent-planning|site-planning|prepay|conduite)(\/|$)/.test(pathname ?? "");
  useEffect(() => {
    if (!privatePage || !firebaseUser) return;
    const onFocus = () => { void refresh(); };
    const timer = window.setInterval(onFocus, 30000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus); };
  }, [privatePage, firebaseUser, refresh]);
  const blocked = privatePage && firebaseUser && !loading
    && (verificationUnavailable || user?.status !== "active" || !user?.isProvisioned
      || (!(user?.role === "super_admin" && user?.tenantId === "platform")
        && suspensionMode(user?.tenant) === "security"));

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, refresh, getToken }}>
      <FirebaseErrorListener />
      {privatePage && loading ? <p role="status" className="p-6">Vérification de votre accès…</p> : blocked ? (
        <AccessUnavailable reason={verificationUnavailable ? "verification-unavailable" : "denied"} onCheck={refresh} onSignOut={() => auth.signOut()} />
      ) : children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
