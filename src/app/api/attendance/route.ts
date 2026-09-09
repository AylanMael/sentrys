import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { canReadBackoffice } from "@/lib/auth/role";
import { validDocumentId } from "@/lib/auth/mission-access";
import { suspensionMode } from "@/lib/auth/tenant-suspension";
import { attendanceRow, parisDayRange, type AttendanceRow } from "@/lib/agents/attendance";

export const runtime = "nodejs";
const PAGE_SIZE = 20;
const MAX_AGENTS_PER_VACATION = 50;
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) return json(403, { ok: false, error: "Accès réservé aux responsables autorisés." });
  const range = parisDayRange(req.nextUrl.searchParams.get("date") || "");
  const cursor = req.nextUrl.searchParams.get("cursor");
  if (!range || (cursor && !validDocumentId(cursor))) return json(400, { ok: false, error: "Date ou curseur invalide." });
  try {
    const result = await adminDb.runTransaction(async tx => {
      const member = (await tx.get(adminDb.collection("tenantUsers").doc(auth.uid))).data();
      const tenant = (await tx.get(adminDb.collection("tenants").doc(auth.tenantId))).data();
      if (!member || member.status !== "active" || member.tenantId !== auth.tenantId
        || !canReadBackoffice(member.role) || suspensionMode(tenant) === "security") return null;
      let query = adminDb.collection("vacations").where("tenantId", "==", auth.tenantId)
        .where("startAt", ">=", range.start).where("startAt", "<", range.end)
        .orderBy("startAt", "desc").orderBy("__name__", "desc").limit(PAGE_SIZE + 1);
      if (cursor) {
        const snap = await tx.get(adminDb.collection("vacations").doc(cursor));
        const data = snap.data();
        const ms = data?.startAt?.toMillis?.();
        if (!data || data.tenantId !== auth.tenantId || typeof ms !== "number"
          || ms < range.start.getTime() || ms >= range.end.getTime()) return null;
        query = query.startAfter(snap);
      }
      const page = await tx.get(query);
      const rows: AttendanceRow[] = [];
      let unavailable = 0;
      const now = Date.now();
      const cache = new Map<string, Promise<FirebaseFirestore.DocumentData | undefined>>();
      const read = (collection: string, id: string) => {
        const key = `${collection}/${id}`;
        if (!cache.has(key)) cache.set(key, tx.get(adminDb.collection(collection).doc(id)).then(s => s.data()));
        return cache.get(key)!;
      };
      for (const doc of page.docs.slice(0, PAGE_SIZE)) {
        const v = doc.data();
        if (v.tenantId !== auth.tenantId) { unavailable++; continue; }
        if (["cancelled", "canceled", "absence"].includes(v.status) || v.isDeleted || v.isAbsence) continue;
        const ids = Array.isArray(v.assignedAgentIds) ? [...new Set(v.assignedAgentIds)] : [];
        if (!validDocumentId(v.siteId) || ids.length > MAX_AGENTS_PER_VACATION) { unavailable++; continue; }
        const site = await read("sites", v.siteId);
        for (const agentId of ids) {
          if (!validDocumentId(agentId)) { unavailable++; continue; }
          const assignment = await read("assignments", `${doc.id}_${agentId}`);
          const agent = await read("agents", agentId);
          const row = attendanceRow({ tenantId: auth.tenantId, vacationId: doc.id, agentId, now, vacation: v, assignment, site, agent });
          if (row) rows.push(row); else unavailable++;
        }
      }
      return { rows, unavailable, serverNow: now, nextCursor: page.size > PAGE_SIZE ? page.docs[PAGE_SIZE - 1].id : null };
    });
    return result ? json(200, { ok: true, ...result }) : json(403, { ok: false, error: "Accès ou curseur non autorisé." });
  } catch {
    return json(500, { ok: false, error: "Impossible de charger les pointages." });
  }
}
