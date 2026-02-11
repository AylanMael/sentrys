// src/app/api/_utils/withTenant.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export type TenantAuth =
  | {
      ok: true;
      uid: string;
      tenantId: string;
      role: string;
      email: string | null;
      name: string | null;
    }
  | { ok: false; res: NextResponse };

/* ================= helpers ================= */

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

export function unauthorized(msg = "Unauthorized", extra?: any) {
  return json(401, { ok: false, error: msg, ...extra });
}

export function forbidden(msg = "Forbidden", extra?: any) {
  return json(403, { ok: false, error: msg, ...extra });
}

function normalizeText(v: any): string | null {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function normalizeEmail(v: any): string | null {
  const s = normalizeText(v);
  if (!s) return null;
  // email pas forcément “validé” ici, mais on nettoie
  return s.toLowerCase();
}

function readAuthHeader(req: NextRequest): string | null {
  const authHeader =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-auth-token") ||
    "";

  const raw = String(authHeader ?? "").trim();
  if (!raw) return null;

  const token = raw.toLowerCase().startsWith("bearer ")
    ? raw.slice(7).trim()
    : raw.trim();

  if (!token) return null;

  // garde-fou contre des valeurs “stringifiées”
  if (token === "null" || token === "undefined") return null;

  return token;
}

/* ================= main ================= */

export async function requireTenantUser(req: NextRequest): Promise<TenantAuth> {
  const token = readAuthHeader(req);
  if (!token) return { ok: false, res: unauthorized("Missing token") };

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    // ⚡ email depuis le token si présent
    let email: string | null =
      normalizeEmail((decoded as any).email) ??
      normalizeEmail((decoded as any).firebase?.identities?.email?.[0]) ??
      null;

    // display name (souvent absent selon provider)
    let name: string | null =
      normalizeText((decoded as any).name) ??
      normalizeText((decoded as any).firebase?.identities?.name?.[0]) ??
      normalizeText((decoded as any).firebase?.sign_in_provider) ??
      null;

    // ✅ fallback hard si tu veux être sûr d’avoir l’email
    // (coût : 1 appel Admin Auth)
    /*
    if (!email) {
      try {
        const ur = await getAuth().getUser(uid);
        email = normalizeEmail(ur.email) ?? null;
        name = normalizeText(ur.displayName) ?? name;
      } catch {
        // ignore
      }
    }
    */

    const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();
    if (!tuSnap.exists) return { ok: false, res: unauthorized("No tenant user") };

    const tu = tuSnap.data() as any;

    const tenantId = normalizeText(tu?.tenantId);
    if (!tenantId) return { ok: false, res: unauthorized("No tenant assigned") };

    if (String(tu?.status ?? "active") !== "active") {
      return { ok: false, res: unauthorized("User disabled") };
    }

    const role = String(tu?.role ?? "").trim();

    // priorité au nom stocké côté tenantUsers si présent
    const nameFromTu = normalizeText(tu?.name);
    if (nameFromTu) name = nameFromTu;

    return {
      ok: true,
      uid,
      tenantId,
      role,
      email,
      name,
    };
  } catch (e: any) {
    return {
      ok: false,
      res: unauthorized("Invalid token", { details: e?.message }),
    };
  }
}

export function canWrite(role?: string) {
  const r = String(role ?? "").trim();
  return r === "admin" || r === "manager";
}
