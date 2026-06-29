// src/app/api/activity/recent/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function serverError(e: unknown, tag: string) {
  console.error(`[${tag}]`, e);
  const message = e instanceof Error ? e.message : String(e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: message,
  });
}

function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === "function" ? t.toDate().toISOString() : null;
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
      const x = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        tenantId: x.tenantId as string,
        action: (x.action as string) ?? null,
        entityType: (x.entityType as string) ?? null,
        entityId: (x.entityId as string) ?? null,
        message: (x.message as string) ?? null,
        severity: (x.severity as string) ?? "info",
        actorEmail: (x.actorEmail as string) ?? null,
        actorRole: (x.actorRole as string) ?? null,
        createdAtIso: toIso(x.createdAt),
      };
    });

    return json(200, { ok: true, tenantId: auth.tenantId, count: items.length, items });
  } catch (e: unknown) {
    return serverError(e, "activity.recent.GET");
  }
}
