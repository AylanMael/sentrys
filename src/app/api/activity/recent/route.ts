// src/app/api/activity/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function serverError(e: any, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e?.message ?? String(e),
  });
}

function toIso(ts: any) {
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
}

function parseLimit(v: string | null, def = 10) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(50, Math.floor(n));
}

/**
 * GET /api/activity/recent?limit=10
 * Auth: Firebase ID token
 */
export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"), 10);

  try {
    const snap = await adminDb
      .collection("activity")
      .where("tenantId", "==", auth.tenantId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const items = snap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        tenantId: x.tenantId,
        action: x.action ?? null,
        entityType: x.entityType ?? null,
        entityId: x.entityId ?? null,
        message: x.message ?? null,
        severity: x.severity ?? "info",
        actorEmail: x.actorEmail ?? null,
        actorRole: x.actorRole ?? null,
        createdAtIso: toIso(x.createdAt),
      };
    });

    return json(200, { ok: true, tenantId: auth.tenantId, count: items.length, items });
  } catch (e: any) {
    return serverError(e, "activity.recent.GET");
  }
}
