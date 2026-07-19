// src/app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeRole } from "@/lib/auth/role";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function unauthorized(message = "Unauthorized", details?: unknown) {
  return json(401, {
    ok: false,
    error: message,
    ...(typeof details !== "undefined" ? { details } : {}),
  });
}

function forbidden(message = "Forbidden", details?: unknown) {
  return json(403, {
    ok: false,
    error: message,
    ...(typeof details !== "undefined" ? { details } : {}),
  });
}

function serverError(error: unknown, tag: string) {
  console.error(`[${tag}]`, error);

  return json(500, {
    ok: false,
    error: "Internal error",
    details: error instanceof Error ? error.message : String(error),
  });
}

function toIso(ts: unknown): string | null {
  if (
    ts &&
    typeof ts === "object" &&
    "toDate" in ts &&
    typeof (ts as { toDate: () => Date }).toDate === "function"
  ) {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }

  return null;
}

function normalizeText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function normalizeStatus(value: unknown): string | null {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : null;
}

function getToken(req: NextRequest): string | null {
  const authHeader =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-auth-token") ||
    "";

  if (!authHeader) return null;

  const raw = authHeader.trim();
  if (!raw) return null;

  if (raw.toLowerCase().startsWith("bearer ")) {
    return raw.slice(7).trim() || null;
  }

  return raw;
}

/**
 * GET /api/me
 * Retourne l'utilisateur tenant (tenantUsers/:uid) si présent.
 */
export async function GET(req: NextRequest) {
  const token = getToken(req);
  if (!token) {
    console.warn("[me] GET /api/me: Missing token in headers");
    return unauthorized("Missing token");
  }

  let decoded: { uid: string; email?: string; name?: string };

  try {
    const vérifiéd = await getAuth().verifyIdToken(token);

    decoded = {
      uid: vérifiéd.uid,
      email: (vérifiéd as { email?: string }).email,
      name: (vérifiéd as { name?: string }).name,
    };
  } catch (error) {
    console.error("[me] verifyIdToken failed for token:", token.slice(0, 10) + "...", error);
    return unauthorized(
      "Invalid token",
      error instanceof Error ? error.message : String(error)
    );
  }

  try {
    const tenantUserSnap = await adminDb.collection("tenantUsers").doc(decoded.uid).get();

    if (!tenantUserSnap.exists) {
      return json(200, {
        ok: true,
        uid: decoded.uid,
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

    const tenantUser = tenantUserSnap.data() as Record<string, unknown>;

    const tenantId = normalizeText(tenantUser?.tenantId);
    const role = normalizeRole(tenantUser?.role);
    const status = normalizeStatus(tenantUser?.status);

    if (status === "disabled") {
      return forbidden("User disabled");
    }

    let tenant: Record<string, unknown> | null = null;

    if (tenantId) {
      const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();

      if (tenantSnap.exists) {
        const tenantData = tenantSnap.data() as Record<string, unknown>;

        tenant = {
          id: tenantSnap.id,
          ...tenantData,
          createdAtIso: toIso(tenantData?.createdAt),
          updatedAtIso: toIso(tenantData?.updatedAt),
        };
      }
    }

    return json(200, {
      ok: true,
      uid: decoded.uid,
      email: normalizeText(tenantUser?.email) ?? decoded.email ?? null,
      name: normalizeText(tenantUser?.name) ?? decoded.name ?? null,
      tenantId,
      role,
      status,
      hasTenant: Boolean(tenantId),
      createdAtIso: toIso(tenantUser?.createdAt),
      updatedAtIso: toIso(tenantUser?.updatedAt),
      tenant,
    });
  } catch (error) {
    return serverError(error, "me.GET");
  }
}
