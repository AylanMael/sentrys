import { NextRequest } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase/admin";

export type AuthCtx = {
  uid: string;
  tenantId: string;
  role: "owner" | "admin" | "manager" | "agent" | "viewer";
  email?: string;
};

function parseBearer(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer (.+)$/i);
  return m?.[1] ?? null;
}

async function fallbackTenantFromFirestore(uid: string) {
  // ✅ 1) Convention probable chez toi (vu ton AuthProvider) : tenantUsers/{uid}
  const tuRef = adminDb.collection("tenantUsers").doc(uid);
  const tuSnap = await tuRef.get();
  if (tuSnap.exists) {
    const d = tuSnap.data() as Record<string, unknown> | undefined;
    return {
      tenantId: (d?.tenantId ?? null) as string | null,
      role: (d?.role ?? null) as string | null,
      status: (d?.status ?? null) as string | null,
    };
  }

  // ✅ 2) Fallback optionnel si tu as une autre convention users/{uid}
  const uRef = adminDb.collection("users").doc(uid);
  const uSnap = await uRef.get();
  if (uSnap.exists) {
    const d = uSnap.data() as Record<string, unknown> | undefined;
    return {
      tenantId: (d?.tenantId ?? null) as string | null,
      role: (d?.role ?? null) as string | null,
      status: (d?.status ?? null) as string | null,
    };
  }

  return { tenantId: null, role: null, status: null };
}

export async function requireAuth(req: NextRequest): Promise<AuthCtx> {
  const token = parseBearer(req);
  if (!token) throw new Error("Missing token");

  const decoded = await getAuth().verifyIdToken(token);

  // 1) on tente d'abord les custom claims
  const decodedRecord = decoded as Record<string, unknown>;
  let tenantId = (decodedRecord.tenantId as string | undefined) ?? null;
  let role = ((decodedRecord.role as AuthCtx["role"] | undefined) ?? null) as
    | AuthCtx["role"]
    | null;

  // 2) fallback Firestore si claims absents
  if (!tenantId || !role) {
    const fb = await fallbackTenantFromFirestore(decoded.uid);

    if (!tenantId) tenantId = fb.tenantId;
    if (!role && fb.role) role = fb.role as AuthCtx["role"];

    // optionnel: si utilisateur disabled côté “tenantUsers”
    if (fb.status && fb.status !== "active") {
      const err = new Error("User disabled");
      Object.assign(err, { code: 403 });
      throw err;
    }
  }

  if (!tenantId) throw new Error("Missing tenantId (claims or tenantUsers)");
  if (!role) role = "viewer"; // par défaut ultra-safe

  return {
    uid: decoded.uid,
    tenantId,
    role,
    email: decoded.email,
  };
}

export function assertRole(ctx: AuthCtx, allowed: AuthCtx["role"][]) {
  if (!allowed.includes(ctx.role)) {
    const err = new Error("Forbidden");
    Object.assign(err, { code: 403 });
    throw err;
  }
}
