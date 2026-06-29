import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { calculateDistance } from "@/lib/geo/distance";
import { logActivity } from "@/lib/activity/logger";

import { checkInRequestSchema } from "@/lib/validators/assignment";
import { validateBody } from "@/app/api/_utils/validation";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const { id: assignmentId } = await params;

  // Utilize centralized validation
  const validation = await validateBody(req, checkInRequestSchema);
  if (!validation.ok) return validation.res;

  const { latitude, longitude } = validation.data;

  try {

    // 1. Load Assignment
    const assignmentRef = adminDb.collection("assignments").doc(assignmentId);
    const assignmentSnap = await assignmentRef.get();

    if (!assignmentSnap.exists) {
      return json(404, { ok: false, error: "Assignment not found" });
    }

    const assignment = assignmentSnap.data() as Record<string, unknown>;

    // 2. Auth Check: Only the assigned agent can check in
    if (assignment.agentId !== auth.uid) {
      return json(403, { ok: false, error: "You are not assigned to this mission" });
    }

    // 3. Status Check: Only "assigned" can check in
    if (assignment.status !== "assigned") {
      return json(400, { ok: false, error: `Invalid status: current status is ${assignment.status}` });
    }

    // 4. Load Site Geofencing
    const siteId = assignment.siteId as string;
    const siteSnap = await adminDb.collection("sites").doc(siteId).get();

    if (!siteSnap.exists) {
      return json(404, { ok: false, error: "Site associated with this assignment not found" });
    }

    const site = siteSnap.data() as Record<string, unknown>;
    const siteLat = site.latitude as number | null;
    const siteLng = site.longitude as number | null;

    // 5. Calculate Distance if site has coordinates
    if (siteLat !== null && siteLng !== null) {
      const distance = calculateDistance(latitude, longitude, siteLat, siteLng);
      const MAX_DISTANCE = 300; // 300 meters tolerance

      if (distance > MAX_DISTANCE) {
        await logActivity({
          tenantId: auth.tenantId,
          actorUid: auth.uid,
          actorEmail: auth.email,
          actorRole: auth.role,
          action: "assignment.checkin_failed_gps",
          entityType: "assignment",
          entityId: assignmentId,
          message: `Échec du pointage : Hors périmètre (${Math.round(distance)}m du site)`,
          severity: "warning",
          meta: {
            distance,
            maxAllowed: MAX_DISTANCE,
            clientLat: latitude,
            clientLng: longitude,
            siteLat,
            siteLng,
          }
        });

        return json(403, {
          ok: false,
          error: "Vous êtes trop loin du site pour pointer.",
          details: { distance: Math.round(distance), maxAllowed: MAX_DISTANCE }
        });
      }
    } else {
      console.warn(`[check-in] Site ${siteId} has no GPS coordinates. Skipping geofencing.`);
    }

    // 6. Update Assignment Status
    const now = FieldValue.serverTimestamp();
    await assignmentRef.update({
      status: "present",
      checkedInAt: now,
      checkInLat: latitude,
      checkInLng: longitude,
      updatedAt: now,
      updatedBy: auth.uid,
    });

    // 7. Log Activity
    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: "assignment.checked_in",
      entityType: "assignment",
      entityId: assignmentId,
      message: `Pointage effectué au site : ${site.name || siteId}`,
      severity: "info",
      meta: {
        siteId,
        siteName: site.name,
        latitude,
        longitude,
        assignmentId
      }
    });

    return json(200, {
      ok: true,
      message: "Check-in successful",
      checkedInAt: new Date().toISOString()
    });

  } catch (e: unknown) {
    console.error("[check-in.POST]", e);
    return json(500, {
      ok: false,
      error: "Internal server error",
      details: e instanceof Error ? e.message : String(e)
    });
  }
}
