import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { validDocumentId } from "@/lib/auth/mission-access";
import { suspensionMode } from "@/lib/auth/tenant-suspension";
import { terrainMission, type TerrainMission } from "@/lib/agents/terrain-mission";

export const runtime = "nodejs";
const PAGE_SIZE = 20;
const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (auth.role !== "agent") return json(403, { ok: false, error: "Accès réservé aux agents." });
  const agentId = auth.agentId || auth.uid;
  const cursor = req.nextUrl.searchParams.get("cursor");
  if (cursor && !validDocumentId(cursor)) return json(400, { ok: false, error: "Curseur invalide." });
  try {
    // Consistent snapshot: membership, suspension, assignment and site belong to
    // the same read transaction, including on paginated requests.
    const result = await adminDb.runTransaction(async tx => {
      const member = await tx.get(adminDb.collection("tenantUsers").doc(auth.uid));
      const tenant = await tx.get(adminDb.collection("tenants").doc(auth.tenantId));
      const m = member.data();
      if (!m || m.status !== "active" || m.role !== "agent" || m.tenantId !== auth.tenantId
        || (m.agentId || auth.uid) !== agentId || !tenant.exists || suspensionMode(tenant.data()) === "security") return null;
      let query = adminDb.collection("assignments").where("tenantId", "==", auth.tenantId)
        .where("agentId", "==", agentId).where("status", "in", ["assigned", "present", "completed"])
        .orderBy("updatedAt", "desc").limit(PAGE_SIZE + 1);
      if (cursor) {
        const snap = await tx.get(adminDb.collection("assignments").doc(cursor));
        if (!snap.exists || snap.data()?.tenantId !== auth.tenantId || snap.data()?.agentId !== agentId) return null;
        query = query.startAfter(snap);
      }
      const page = await tx.get(query);
      const now = Date.now();
      const missions: TerrainMission[] = [];
      for (const row of page.docs.slice(0, PAGE_SIZE)) {
        const assignment = row.data();
        if (!validDocumentId(assignment.vacationId) || !validDocumentId(assignment.siteId)) continue;
        const vacation = await tx.get(adminDb.collection("vacations").doc(assignment.vacationId));
        if (!vacation.exists || vacation.data()?.tenantId !== auth.tenantId
          || !Array.isArray(vacation.data()?.assignedAgentIds)
          || !vacation.data()?.assignedAgentIds.includes(agentId) || vacation.data()?.siteId !== assignment.siteId) continue;
        const site = await tx.get(adminDb.collection("sites").doc(assignment.siteId));
        if (!site.exists) continue;
        const dto = terrainMission({ id: row.id, tenantId: auth.tenantId, agentId, now,
          assignment, vacation: vacation.data()!, site: site.data()!, tenant: tenant.data()! });
        if (dto) missions.push(dto);
      }
      return { missions, nextCursor: page.size > PAGE_SIZE ? page.docs[PAGE_SIZE - 1].id : null, serverNow: now };
    });
    return result ? json(200, { ok: true, ...result }) : json(403, { ok: false, error: "Accès non autorisé." });
  } catch {
    return json(500, { ok: false, error: "Impossible de charger vos missions." });
  }
}
