// src/app/api/clients/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { normLower, norm } from "@/lib/api/text";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function errorDetails(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getToken(req: NextRequest) {
  const h =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-auth-token") ||
    "";

  if (!h) return null;

  const s = h.trim();
  if (s.toLowerCase().startsWith("bearer ")) {
    return s.slice(7).trim();
  }

  return s;
}

async function getContext(req: NextRequest) {
  const token = getToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing token" };
  }

  const decoded = await getAuth().verifyIdToken(token);
  const uid = decoded.uid;

  const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();
  if (!tuSnap.exists) {
    return { ok: false as const, status: 401, error: "No tenant profile" };
  }

  const tu = tuSnap.data() as Record<string, unknown>;
  const status = normLower(tu?.status);
  if (status !== "active") {
    return { ok: false as const, status: 401, error: "User not active" };
  }

  const tenantId = norm(tu?.tenantId);
  const role = normLower(tu?.role);

  const canReadClients = ["super_admin", "owner", "admin", "manager"].includes(role);
  if (!canReadClients) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }

  return {
    ok: true as const,
    tenantId,
  };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const authCtx = await getContext(req);
    if (!authCtx.ok) return json(401, { ok: false, error: authCtx.error });

    const { id } = await ctx.params;

    const snap = await adminDb.collection("clients").doc(id).get();
    if (!snap.exists) return json(404, { ok: false, error: "Not found" });

    const data = snap.data() as Record<string, unknown>;
    if (data?.tenantId !== authCtx.tenantId) {
      return json(403, { ok: false, error: "Forbidden" });
    }

    return json(200, { ok: true, item: { id: snap.id, ...data } });
  } catch (e: unknown) {
    console.error("[api/clients/:id] GET error", e);
    return json(500, {
      ok: false,
      error: "Internal error",
      details: errorDetails(e),
    });
  }
}
