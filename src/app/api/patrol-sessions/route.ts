import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { PatrolSessionSchema } from "@/lib/api/schemas";
import { isWithinGeofence } from "@/lib/utils/geo";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

/**
 * POST /api/patrol-sessions
 * Démarrer une session de ronde
 */
export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  try {
    const body = await req.json();
    // On force l'agentId à être l'utilisateur connecté s'il n'est pas fourni
    const payloadRaw = { ...body, agentId: body.agentId || auth.uid };

    const validation = PatrolSessionSchema.safeParse(payloadRaw);
    if (!validation.success) {
      return json(400, { ok: false, error: "Validation failed", details: validation.error.format() });
    }

    const data = validation.data;

    const sessionPayload = {
      ...data,
      tenantId: auth.tenantId,
      status: "active",
      startedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const ref = await adminDb.collection("patrolSessions").add(sessionPayload);

    return json(201, { ok: true, id: ref.id });
  } catch (e: any) {
    return json(500, { ok: false, error: e.message });
  }
}

/**
 * PATCH /api/patrol-sessions/:id
 * Valider un point de passage ou terminer la session
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const id = url.pathname.split("/").pop(); // Simplification pour l'exemple
  if (!id || id === "patrol-sessions") return json(400, { ok: false, error: "Missing ID" });

  try {
    const { action, checkpointId, lat, lng } = await req.json();
    const sessionRef = adminDb.collection("patrolSessions").doc(id);
    const sessionSnap = await sessionRef.get();

    if (!sessionSnap.exists) return json(404, { ok: false, error: "Session not found" });
    const sessionData = sessionSnap.data();

    if (action === "validate_checkpoint") {
      // Récupérer le template pour avoir les coordonnées du checkpoint
      const templateSnap = await adminDb.collection("patrolTemplates").doc(sessionData?.templateId).get();
      const templateData = templateSnap.data();
      const checkpoint = templateData?.checkpoints?.find((c: any) => c.id === checkpointId);

      if (!checkpoint) return json(400, { ok: false, error: "Checkpoint not found in template" });

      // Vérification Geofencing (100m pour les rondes certifiées)
      if (lat && lng) {
        const within = isWithinGeofence(lat, lng, checkpoint.latitude, checkpoint.longitude, 100);
        if (!within) return json(400, { ok: false, error: "Hors périmètre (100m requis)" });
      }

      const pointUpdate = {
        checkpointId,
        validatedAt: new Date().toISOString(),
        lat: lat || null,
        lng: lng || null,
      };

      await sessionRef.update({
        validatedPoints: FieldValue.arrayUnion(pointUpdate),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return json(200, { ok: true, message: "Checkpoint validated" });
    }

    if (action === "complete") {
      await sessionRef.update({
        status: "completed",
        endedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return json(200, { ok: true, message: "Session completed" });
    }

    return json(400, { ok: false, error: "Invalid action" });
  } catch (e: any) {
    return json(500, { ok: false, error: e.message });
  }
}
