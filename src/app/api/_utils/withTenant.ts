// src/app/api/_utils/withTenant.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export type TenantAuth =
  | {
      ok: true;
      uid: string;
      tenantId: string;
      role?: string;
      email?: string | null;
      name?: string | null;
    }
  | { ok: false; res: NextResponse };

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export function unauthorized(msg = "Unauthorized", extra?: any) {
  return json(401, { ok: false, error: msg, ...extra });
}

function normalizeText(v: any) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

export async function requireTenantUser(req: NextRequest): Promise<TenantAuth> {
  const authHeader =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-auth-token") ||
    "";

  if (!authHeader) return { ok: false, res: unauthorized("Missing token") };

  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!token) return { ok: false, res: unauthorized("Missing token") };

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    // ⚡ on prend l’email directement du token si présent (pas de requête réseau)
    let email: string | null =
      normalizeText((decoded as any).email) ??
      normalizeText((decoded as any).firebase?.identities?.email?.[0]) ??
      null;

    // display name (souvent absent selon provider)
    let name: string | null =
      normalizeText((decoded as any).name) ??
      normalizeText((decoded as any).firebase?.sign_in_provider) ??
      null;

    // ✅ (optionnel) fallback hard si tu veux être sûr d’avoir l’email
    // Décommente si nécessaire (coût : 1 call Admin Auth).
    /*
    if (!email) {
      try {
        const ur = await getAuth().getUser(uid);
        email = normalizeText(ur.email) ?? null;
        name = normalizeText(ur.displayName) ?? name;
      } catch {
        // ignore
      }
    }
    */

    const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();
    if (!tuSnap.exists) return { ok: false, res: unauthorized("No tenant user") };

    const tu = tuSnap.data() as any;

    if (!tu?.tenantId) return { ok: false, res: unauthorized("No tenant assigned") };
    if (String(tu.status ?? "active") !== "active")
      return { ok: false, res: unauthorized("User disabled") };

    return {
      ok: true,
      uid,
      tenantId: String(tu.tenantId),
      role: String(tu.role ?? ""),
      email,
      name: normalizeText(tu?.name) ?? name, // si tu stockes name côté tenantUsers, priorité à ça
    };
  } catch (e: any) {
    return { ok: false, res: unauthorized("Invalid token", { details: e?.message }) };
  }
}

export function canWrite(role?: string) {
  const r = String(role ?? "");
  return r === "admin" || r === "manager";
}
