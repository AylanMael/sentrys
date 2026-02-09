// src/app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  const res = NextResponse.json(body, { status });
  // évite du cache browser/CDN sur une route "identity"
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function unauthorized(msg = "Unauthorized", extra?: any) {
  return json(401, { ok: false, error: msg, ...extra });
}

function serverError(e: any, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e?.message ?? String(e),
  });
}

function toIso(ts: any): string | null {
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function getToken(req: NextRequest) {
  const authHeader =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-auth-token") ||
    "";

  if (!authHeader) return null;

  const s = authHeader.trim();
  if (s.toLowerCase().startsWith("bearer ")) return s.slice(7).trim();
  return s; // fallback (rare), mais utile si tu envoies direct le token
}

/* ================= GET ================= */
/**
 * GET /api/me
 * Retourne l'utilisateur tenant (tenantUsers/:uid) si présent.
 */
export async function GET(req: NextRequest) {
  const token = getToken(req);
  if (!token) return unauthorized("Missing token");

  // 1) Verify token Firebase
  let decoded: { uid: string; email?: string; name?: string };
  try {
    const t = await getAuth().verifyIdToken(token);
    decoded = {
      uid: t.uid,
      email: (t as any).email,
      name: (t as any).name,
    };
  } catch (e: any) {
    console.error("[me] verifyIdToken failed", e);
    return unauthorized("Invalid token", { details: e?.message });
  }

  const uid = decoded.uid;

  try {
    // 2) tenantUsers/:uid
    const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();

    if (!tuSnap.exists) {
      // utilisateur auth OK mais pas provisionné tenant
      return json(200, {
        ok: true,
        uid,
        email: decoded.email ?? null,
        name: decoded.name ?? null,
        tenantId: null,
        role: null,
        status: null,
        hasTenant: false,
        createdAtIso: null,
        updatedAtIso: null,
        tenant: null,
      });
    }

    const tu = tuSnap.data() as any;

    // 2bis) sécurité/cohérence : status
    const status = normalizeText(tu?.status) || null;
    if (status && status !== "active") {
      // cohérent avec tes autres endpoints (sites/vacations/agents)
      return unauthorized("User disabled");
    }

    const tenantId = normalizeText(tu?.tenantId) || null;
    const role = normalizeText(tu?.role) || null;

    // 3) (optionnel) charger tenant
    let tenant: any = null;
    if (tenantId) {
      const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();
      if (tenantSnap.exists) {
        const td = tenantSnap.data() as any;
        tenant = {
          id: tenantSnap.id,
          ...td,
          createdAtIso: toIso(td?.createdAt),
          updatedAtIso: toIso(td?.updatedAt),
        };
      }
    }

    return json(200, {
      ok: true,
      uid,
      email: tu?.email ?? decoded.email ?? null,
      name: tu?.name ?? decoded.name ?? null,
      tenantId,
      role,
      status: "active", // si on est ici, on force "active"
      hasTenant: !!tenantId,
      createdAtIso: toIso(tu?.createdAt),
      updatedAtIso: toIso(tu?.updatedAt),
      tenant,
    });
  } catch (e: any) {
    return serverError(e, "me.GET");
  }
}
