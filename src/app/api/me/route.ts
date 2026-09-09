// src/app/api/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { normalizeRole } from "@/lib/auth/role";
import { appLogger } from "@/lib/observability/logger";
import { suspensionMode } from "@/lib/auth/tenant-suspension";

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
    const vérifiéd = await adminAuth.verifyIdToken(token, true);

    decoded = {
      uid: vérifiéd.uid,
      email: (vérifiéd as { email?: string }).email,
      name: (vérifiéd as { name?: string }).name,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
      const allowed = ["app/no-app", "app/invalid-credential", "auth/invalid-credential", "auth/argument-error", "auth/invalid-id-token", "auth/id-token-expired", "auth/user-not-found", "auth/internal-error"];
      return json(401, { ok: false, error: "Local emulator authentication failed", diagnostic: allowed.includes(code) ? code : "unknown", authEmulatorConfigured: process.env.FIREBASE_AUTH_EMULATOR_HOST === "127.0.0.1:9099", demoProjectConfigured: adminAuth.app.options.projectId === "demo-sentrys-accounts" });
    }
    appLogger.warning("auth.token.invalid", { route: "/api/me" });
    return unauthorized("Invalid or expired token");
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

    if (status !== "active" || !role) {
      return forbidden("User disabled");
    }

    let tenant: Record<string, unknown> | null = null;

    if (tenantId) {
      const tenantSnap = await adminDb.collection("tenants").doc(tenantId).get();

      if (tenantSnap.exists) {
        const tenantData = tenantSnap.data() as Record<string, unknown>;

        tenant = suspensionMode(tenantData) === "security" && !(tenantId === "platform" && role === "super_admin")
          ? { id: tenantSnap.id, status: "suspended", suspensionMode: "security" }
          : {
          id: tenantSnap.id,
          ...tenantData,
          createdAtIso: toIso(tenantData?.createdAt),
          updatedAtIso: toIso(tenantData?.updatedAt),
        };
      } else {
        tenant = { id: tenantId, status: "suspended", suspensionMode: "security" };
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
      agentId: normalizeText(tenantUser?.agentId),
      createdAtIso: toIso(tenantUser?.createdAt),
      updatedAtIso: toIso(tenantUser?.updatedAt),
      tenant,
    });
  } catch (error) {
    return serverError(error, "me.GET");
  }
}
