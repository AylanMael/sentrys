import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { authorizeMissionWrite, validDocumentId } from "@/lib/auth/mission-access";
import { checkInRequestSchema } from "@/lib/validators/assignment";
import { calculateDistance } from "@/lib/geo/distance";

const json = (status: number, body: unknown) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
export async function pointage(req: NextRequest, params: Promise<{ id: string }>, direction: "in" | "out") {
  const auth = await requireTenantUser(req, { access: "mission" });
  if (!auth.ok) return auth.res;
  if (auth.role !== "agent") return json(403, { ok: false, error: "Pointage réservé à l'agent affecté" });
  const { id } = await params;
  if (!validDocumentId(id)) return json(400, { ok: false, error: "Identifiant invalide" });
  const parsed = checkInRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, { ok: false, error: "Coordonnées invalides" });
  const { latitude, longitude } = parsed.data;
  try {
    const result = await adminDb.runTransaction(async tx => {
      const ref = adminDb.collection("assignments").doc(id);
      const snap = await tx.get(ref);
      const assignment = snap.data();
      if (!snap.exists || assignment?.tenantId !== auth.tenantId
        || assignment.agentId !== (auth.agentId || auth.uid)) return 403;
      if (!await authorizeMissionWrite(tx, auth, assignment.vacationId, assignment.siteId, true)) return 403;
      if (assignment.status !== (direction === "in" ? "assigned" : "present")) return 409;
      const site = await tx.get(adminDb.collection("sites").doc(assignment.siteId));
      if (!site.exists || site.data()?.tenantId !== auth.tenantId) return 403;
      const lat = site.data()?.latitude;
      const lng = site.data()?.longitude;
      if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)
        && calculateDistance(latitude, longitude, lat, lng) > 300) return 422;
      const agent = await tx.get(adminDb.collection("agents").doc(assignment.agentId));
      const agentData = agent.data();
      const actorName = agentData?.tenantId === auth.tenantId
        ? [agentData.firstName, agentData.lastName].filter(v => typeof v === "string" && v.trim()).join(" ") : null;
      const now = FieldValue.serverTimestamp();
      tx.update(ref, {
        status: direction === "in" ? "present" : "completed",
        [direction === "in" ? "checkedInAt" : "checkedOutAt"]: now,
        [direction === "in" ? "checkInLat" : "checkOutLat"]: latitude,
        [direction === "in" ? "checkInLng" : "checkOutLng"]: longitude,
        updatedAt: now, updatedBy: auth.uid,
      });
      tx.set(adminDb.collection("activity").doc(), {
        tenantId: auth.tenantId, actorUid: auth.uid, actorRole: auth.role,
        actorName: actorName || null, actorEmail: auth.email ?? null,
        action: direction === "in" ? "assignment.checked_in" : "assignment.checked_out",
        entityType: "assignment", entityId: id, createdAt: now,
        message: direction === "in" ? "Prise de service enregistrée" : "Fin de service enregistrée",
        severity: "info", meta: { agentId: assignment.agentId, siteId: assignment.siteId, siteName: typeof site.data()?.name === "string" ? site.data()?.name : null, vacationId: assignment.vacationId },
      });
      return 200;
    });
    if (result !== 200) return json(result, { ok: false, error: result === 409
      ? "Ce pointage a déjà été effectué ou son statut ne le permet pas."
      : result === 422 ? "Vous êtes trop loin du site pour pointer." : "Mission non autorisée ou terminée." });
    return json(200, { ok: true, message: "Pointage enregistré" });
  } catch {
    return json(500, { ok: false, error: "Impossible d'enregistrer le pointage" });
  }
}
