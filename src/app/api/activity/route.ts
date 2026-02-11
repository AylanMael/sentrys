// src/app/api/activity/route.ts
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

function parseLimit(v: string | null, def = 20) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(100, Math.floor(n));
}

function normalize(v: any) {
  return String(v ?? "").trim();
}

/**
 * GET /api/activity?limit=20&entityType=agent&action=agent.updated&cursor=<docId>
 *
 * Pagination: cursor = lastDocId
 * Requête: where() d'abord, orderBy() ensuite (sinon Firestore casse / indexes).
 */
export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"), 20);

  const entityType = normalize(url.searchParams.get("entityType"));
  const action = normalize(url.searchParams.get("action"));
  const cursor = normalize(url.searchParams.get("cursor")); // last doc id

  try {
    // ✅ where() d'abord
    let q: FirebaseFirestore.Query = adminDb
      .collection("activity")
      .where("tenantId", "==", auth.tenantId);

    if (entityType) q = q.where("entityType", "==", entityType);
    if (action) q = q.where("action", "==", action);

    // ✅ orderBy ensuite
    q = q.orderBy("createdAt", "desc").orderBy("__name__", "desc");

    // Pagination: startAfter(createdAt, docId)
    if (cursor) {
      const cursorSnap = await adminDb.collection("activity").doc(cursor).get();
      if (cursorSnap.exists) {
        const d = cursorSnap.data() as any;
        q = q.startAfter(d?.createdAt ?? null, cursorSnap.id);
      }
    }

    const snap = await q.limit(limit).get();

    const items = snap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
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

    const nextCursor = snap.docs.length ? snap.docs[snap.docs.length - 1].id : null;

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      count: items.length,
      nextCursor,
      items,
    });
  } catch (e: any) {
    return serverError(e, "activity.GET");
  }
}
