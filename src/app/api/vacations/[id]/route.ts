import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
import { isAdminLike } from "@/lib/auth/role";
import { logActivity } from "@/lib/activity/logger";

import {
  normalizeText,
  parseDateTimeIso,
  safeArr,
  uniq,
  displayNameFromVacation,
  tsToDate,
  asVacationStatus,
  computeStatus,
  isFinalStatusStr,
  canUserAccessSite,
  validateAssignedAgentsForSite,
  detectOverlapsForAgents,
  loadVacationOr404,
  syncAssignmentsForVacation,
  pickVacationApi,
  toTs,
  toIso,
} from "@/app/api/vacations/_shared";
import { normalizeMissionType } from "@/lib/planning/mission-types";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(msg = "Bad request", extra?: any) {
  return json(400, { ok: false, error: msg, ...extra });
}

function forbidden(msg = "Forbidden", extra?: any) {
  return json(403, { ok: false, error: msg, ...extra });
}

function conflict(msg = "Conflict", extra?: any) {
  return json(409, { ok: false, error: msg, ...extra });
}

function notFound(msg = "Not found") {
  return json(404, { ok: false, error: msg });
}

function serverError(e: any, tag: string, extra?: any) {
  console.error(`[${tag}]`, e, extra ?? "");
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e?.message ?? String(e),
    ...(extra ? { extra } : {}),
  });
}

async function safeLogActivity(payload: any) {
  try {
    await logActivity(payload);
  } catch (e) {
    console.warn("[activity.log] failed (non-blocking)", e);
  }
}

/* ================= GET ================= */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const vacationId = normalizeText(id);
  if (!vacationId) return bad("Missing vacation id");

  try {
    const loaded = await loadVacationOr404(vacationId, auth.tenantId);
    if (!loaded.ok) return notFound(loaded.error);

    const allowed = await canUserAccessSite({
      tenantId: auth.tenantId,
      uid: auth.uid,
      role: auth.role,
      siteId: (loaded.data?.siteId as string | undefined) ?? null,
    });

    if (!allowed) return forbidden("Insufficient rights");

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      vacation: pickVacationApi(loaded.data, vacationId),
    });
  } catch (e) {
    return serverError(e, "vacations.[id].GET");
  }
}

/* ================= PATCH ================= */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return forbidden();

  const { id } = await params;
  const vacationId = normalizeText(id);
  if (!vacationId) return bad("Missing vacation id");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  try {
    const loaded = await loadVacationOr404(vacationId, auth.tenantId);
    if (!loaded.ok) return notFound(loaded.error);

    const prev = loaded.data as any;
    const prevStatusStr = String(asVacationStatus(prev?.status));
    if (prevStatusStr === "cancelled") {
      return bad("Cannot update cancelled vacation");
    }

    const canBypassClosedAssignments = isAdminLike(auth.role);
    const wantsToChangeAssignments = body.assignedAgentIds !== undefined;

    const prevAssigned = uniq(safeArr(prev?.assignedAgentIds));
    let nextAssigned = prevAssigned;

    const patch: any = {};
    const warnings: any[] = [];
    let didSync = false;

    const ifMatchUpdatedAtIso =
      normalizeText(body?.ifMatchUpdatedAtIso) || null;

    if (body.startAt !== undefined) {
      const d = parseDateTimeIso(body.startAt);
      if (!d) return bad("Invalid startAt");
      patch.startAt = toTs(d);
    }

    if (body.endAt !== undefined) {
      const d = parseDateTimeIso(body.endAt);
      if (!d) return bad("Invalid endAt");
      patch.endAt = toTs(d);
    }

    if (body.requiredAgents !== undefined) {
      patch.requiredAgents = 1;
    }

    if (body.notes !== undefined) {
      patch.notes = normalizeText(body.notes) || null;
    }

    if (body.title !== undefined) {
      patch.title = normalizeText(body.title) || null;
    }

    if (body.missionType !== undefined) {
      patch.missionType = normalizeMissionType(body.missionType);
    }

    if (body.requiredQualification !== undefined) {
      patch.requiredQualification =
        normalizeText(body.requiredQualification) || null;
    }

    let explicitFinalStatusStr: string | null = null;
    if (body.status !== undefined) {
      const s = String(asVacationStatus(body.status));
      if (s !== "closed" && s !== "cancelled") {
        return bad("Only closed/cancelled allowed");
      }
      patch.status = s;
      explicitFinalStatusStr = s;
    }

    if (wantsToChangeAssignments) {
      if (prevStatusStr === "closed" && !canBypassClosedAssignments) {
        return forbidden(
          "Cannot change assigned agents for a closed vacation (admin/owner/super_admin only)"
        );
      }

      const siteId = String(prev?.siteId ?? "").trim();
      if (!siteId) return bad("Vacation has no siteId");

      const raw = uniq(safeArr(body.assignedAgentIds)).slice(0, 1);

      const validated = await validateAssignedAgentsForSite({
        tenantId: auth.tenantId,
        siteId,
        assignedAgentIds: raw,
        requiredQualification:
          patch.requiredQualification !== undefined
            ? patch.requiredQualification
            : prev?.requiredQualification,
      });

      if (!validated.ok) {
        return bad("Invalid assignedAgentIds", {
          details: validated.error,
          rejected: validated.rejected,
        });
      }

      nextAssigned = validated.validIds;
      patch.assignedAgentIds = nextAssigned;
      patch.requiredAgents = 1;
      didSync = true;

      if (validated.rejected.length) {
        warnings.push({
          code: "assigned_agents_rejected",
          rejected: validated.rejected,
          acceptedCount: nextAssigned.length,
        });
      }

      if (validated.warnings.length) {
        warnings.push({
          code: "assigned_agents_compliance_warnings",
          warnings: validated.warnings,
        });
      }
    }

    const startDate = tsToDate(patch.startAt ?? prev?.startAt);
    const endDate = tsToDate(patch.endAt ?? prev?.endAt);

    if (!startDate || !endDate) return bad("Missing startAt/endAt");
    if (endDate.getTime() <= startDate.getTime()) {
      return bad("endAt must be > startAt");
    }

    const overlapCheckNeeded =
      wantsToChangeAssignments ||
      body.startAt !== undefined ||
      body.endAt !== undefined;

    if (overlapCheckNeeded) {
      const overlaps = await detectOverlapsForAgents({
        tenantId: auth.tenantId,
        vacationId,
        agentIds: nextAssigned,
        startAt: startDate,
        endAt: endDate,
      });

      if (overlaps.length) {
        const ignore =
          body.ignoreOverlaps === true && isAdminLike(auth.role);

        if (!ignore) {
          return bad("Overlapping agent assignments", {
            code: "overlap_détectéd",
            overlaps,
            hint: "Set ignoreOverlaps:true (admin/owner/super_admin only) to bypass as warning.",
          });
        }

        warnings.push({
          code: "overlap_détectéd",
          overlaps,
          bypassed: true,
        });
      }
    }

    const isCancellingNow = explicitFinalStatusStr === "cancelled";
    if (isCancellingNow) {
      nextAssigned = [];
      patch.assignedAgentIds = [];
      didSync = true;
    }

    if (!patch.status && !isFinalStatusStr(prevStatusStr)) {
      patch.status = computeStatus(1, nextAssigned.length);
    }

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedBy = auth.uid;

    try {
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(loaded.ref);

        if (!snap.exists) {
          throw Object.assign(new Error("Not found"), {
            code: "NOT_FOUND",
          });
        }

        const cur = snap.data() as any;
        if (cur?.tenantId !== auth.tenantId) {
          throw Object.assign(new Error("Not found"), {
            code: "NOT_FOUND",
          });
        }

        const curStatusStr = String(asVacationStatus(cur?.status));

        if (curStatusStr === "cancelled") {
          throw Object.assign(
            new Error("Cannot update cancelled vacation"),
            { code: "CANCELLED" }
          );
        }

        if (
          wantsToChangeAssignments &&
          curStatusStr === "closed" &&
          !canBypassClosedAssignments
        ) {
          throw Object.assign(
            new Error("Cannot change assigned agents for a closed vacation"),
            { code: "CLOSED_FORBIDDEN" }
          );
        }

        const curUpdatedAtIso = toIso(cur?.updatedAt);

        if (ifMatchUpdatedAtIso) {
          if (!curUpdatedAtIso || curUpdatedAtIso !== ifMatchUpdatedAtIso) {
            throw Object.assign(new Error("Optimistic lock conflict"), {
              code: "OPT_LOCK",
              currentUpdatedAtIso: curUpdatedAtIso,
            });
          }
        }

        tx.set(loaded.ref, patch, { merge: true });
      });
    } catch (err: any) {
      if (err?.code === "NOT_FOUND") return notFound();
      if (err?.code === "CANCELLED") {
        return bad("Cannot update cancelled vacation");
      }
      if (err?.code === "CLOSED_FORBIDDEN") {
        return forbidden(
          "Cannot change assigned agents for a closed vacation (admin/owner/super_admin only)"
        );
      }
      if (err?.code === "OPT_LOCK") {
        return conflict("Vacation modifiéd by someone else", {
          code: "optimistic_lock",
          currentUpdatedAtIso: err?.currentUpdatedAtIso ?? null,
          hint: "Reload the vacation and retry with the latest updatedAtIso.",
        });
      }
      throw err;
    }

    let syncResult: { toAdd: number; toCancel: number } | undefined;
    if (didSync && prev?.siteId) {
      syncResult = await syncAssignmentsForVacation({
        tenantId: auth.tenantId,
        uid: auth.uid,
        vacationId,
        siteId: prev.siteId,
        prevAssigned,
        nextAssigned,
      });
    }

    const updatedSnap = await loaded.ref.get();
    const nextData = updatedSnap.data() as any;

    const name = displayNameFromVacation(nextData ?? prev);
    const nextStatusStr = String(
      asVacationStatus(nextData?.status ?? patch.status ?? prevStatusStr)
    );
    const assignedDelta = nextAssigned.length - prevAssigned.length;

    const isCancelledNow2 =
      explicitFinalStatusStr === "cancelled" ||
      (prevStatusStr !== "cancelled" && nextStatusStr === "cancelled");

    await safeLogActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: isCancelledNow2 ? "vacation.cancelled" : "vacation.updated",
      entityType: "vacation",
      entityId: vacationId,
      message: isCancelledNow2
        ? `Vacation annulée : ${name}`
        : `Vacation mise à jour : ${name}`,
      severity:
        isCancelledNow2 ? "warning" : assignedDelta !== 0 ? "warning" : "info",
      meta: {
        vacationId,
        siteId: nextData?.siteId ?? prev?.siteId ?? null,
        siteName: nextData?.siteName ?? prev?.siteName ?? null,
        prevStatus: prevStatusStr,
        nextStatus: nextStatusStr,
        assignedPrevCount: prevAssigned.length,
        assignedNextCount: nextAssigned.length,
        assignedDelta,
        changed: Object.keys(patch),
        warnings: warnings.length ? warnings : undefined,
        sync: syncResult ?? null,
      },
    });

    if (syncResult && (syncResult.toAdd > 0 || syncResult.toCancel > 0)) {
      await safeLogActivity({
        tenantId: auth.tenantId,
        actorUid: auth.uid,
        actorEmail: auth.email ?? null,
        actorRole: auth.role ?? null,
        action: "assignment.synced",
        entityType: "vacation",
        entityId: vacationId,
        message: `Affectations synchronisées : ${name}`,
        severity: "info",
        meta: {
          vacationId,
          siteId: nextData?.siteId ?? prev?.siteId ?? null,
          toAdd: syncResult.toAdd,
          toCancel: syncResult.toCancel,
        },
      });
    }

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      warnings: warnings.length ? warnings : undefined,
      sync: syncResult,
      vacation: pickVacationApi(nextData, vacationId),
    });
  } catch (e) {
    return serverError(e, "vacations.[id].PATCH", { vacationId });
  }
}

/* ================= DELETE ================= */

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWrite(auth.role)) return forbidden();

  const { id } = await params;
  const vacationId = normalizeText(id);
  if (!vacationId) return bad("Missing vacation id");

  try {
    const loaded = await loadVacationOr404(vacationId, auth.tenantId);
    if (!loaded.ok) return notFound(loaded.error);

    const prev = loaded.data as any;
    const name = displayNameFromVacation(prev);

    const prevStatusStr = String(asVacationStatus(prev?.status));
    if (prevStatusStr === "cancelled") {
      return json(200, {
        ok: true,
        id: vacationId,
        updated: { status: "cancelled" },
      });
    }

    await loaded.ref.set(
      {
        status: "cancelled",
        assignedAgentIds: [],
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    const prevAssigned = uniq(safeArr(prev?.assignedAgentIds));
    let syncResult: { toAdd: number; toCancel: number } | undefined;

    if (prev?.siteId && prevAssigned.length) {
      syncResult = await syncAssignmentsForVacation({
        tenantId: auth.tenantId,
        uid: auth.uid,
        vacationId,
        siteId: prev.siteId,
        prevAssigned,
        nextAssigned: [],
      });
    }

    await safeLogActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "vacation.cancelled",
      entityType: "vacation",
      entityId: vacationId,
      message: `Vacation annulée : ${name}`,
      severity: "warning",
      meta: {
        vacationId,
        prevStatus: prevStatusStr,
        nextStatus: "cancelled",
        siteId: prev?.siteId ?? null,
        sync: syncResult ?? null,
      },
    });

    return json(200, {
      ok: true,
      id: vacationId,
      updated: { status: "cancelled" },
      sync: syncResult,
    });
  } catch (e) {
    return serverError(e, "vacations.[id].DELETE", { vacationId });
  }
}
