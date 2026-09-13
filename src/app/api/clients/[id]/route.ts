// src/app/api/clients/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function errorDétails(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const authCtx = await requireTenantUser(req);
    if (!authCtx.ok) return authCtx.res;
    if (!["super_admin", "owner", "admin", "manager"].includes(authCtx.role)) {
      return json(403, { ok: false, error: "Forbidden" });
    }

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
    });
  }
}
