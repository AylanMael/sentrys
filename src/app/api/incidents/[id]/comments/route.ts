import { NextRequest, NextResponse } from "next/server";

import { requireTenantUser, canReadBackoffice } from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function json(status: number, body: unknown) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
function parseLimit(value: string | null) {
  const parsed = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(parsed), MAX_PAGE_SIZE);
}
function encodeCursor(id: string) {
  return Buffer.from(JSON.stringify({ id }), "utf8").toString("base64url");
}
function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    return typeof parsed?.id === "string" && parsed.id ? parsed.id : null;
  } catch { return null; }
}
function toIso(value: unknown) {
  const timestamp = value as { toDate?: () => Date } | null | undefined;
  return typeof timestamp?.toDate === "function" ? timestamp.toDate().toISOString() : null;
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
async function canAccessIncident(
  auth: Extract<Awaited<ReturnType<typeof requireTenantUser>>, { ok: true }>,
  incident: FirebaseFirestore.DocumentSnapshot
) {
  const data = incident.data();
  if (!incident.exists || data?.tenantId !== auth.tenantId) return false;
  if (canReadBackoffice(auth.role)) return true;
  const siteId = typeof data?.siteId === "string" ? data.siteId : "";
  if (!siteId) return false;
  const site = await adminDb.collection("sites").doc(siteId).get();
  if (!site.exists || site.data()?.tenantId !== auth.tenantId) return false;
  const siteData = site.data() ?? {};
  return [siteData.accessUids, siteData.managerIds, siteData.agentIds].some(
    (ids) => isStringArray(ids) && ids.includes(auth.uid)
  );
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  const { id: incidentId } = await context.params;
  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const rawCursor = req.nextUrl.searchParams.get("cursor");
  const cursorId = decodeCursor(rawCursor);
  if (rawCursor && !cursorId) return json(400, { ok: false, error: "Curseur invalide." });

  try {
    const incidentRef = adminDb.collection("incidents").doc(incidentId);
    const incident = await incidentRef.get();
    if (!incident.exists) return json(404, { ok: false, error: "Incident introuvable." });
    if (!(await canAccessIncident(auth, incident))) return json(403, { ok: false, error: "Accès refusé." });

    const comments = incidentRef.collection("comments");
    let pageQuery: FirebaseFirestore.Query = comments.orderBy("createdAt", "desc");
    if (cursorId) {
      const cursor = await comments.doc(cursorId).get();
      if (!cursor.exists || cursor.ref.parent.parent?.id !== incidentId) {
        return json(400, { ok: false, error: "Curseur invalide." });
      }
      pageQuery = pageQuery.startAfter(cursor);
    }

    const snapshot = await pageQuery.limit(limit + 1).get();
    const page = snapshot.docs.slice(0, limit);
    const hasMore = snapshot.docs.length > limit;
    return json(200, {
      ok: true,
      items: page.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          text: typeof data.text === "string" ? data.text : "",
          createdAtIso: toIso(data.createdAt),
          createdBy: {
            uid: typeof data.createdBy?.uid === "string" ? data.createdBy.uid : "",
            email: typeof data.createdBy?.email === "string" ? data.createdBy.email : null,
          },
        };
      }),
      nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1].id) : null,
    });
  } catch (error) {
    console.error("[incident-comments.list]", error);
    return json(500, { ok: false, error: "Impossible de charger les commentaires." });
  }
}
