import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireTenantUser } from "@/app/api/_utils/withTenant";
import {
  canManagePlanning,
  isAdminLike,
} from "@/lib/auth/role";
import { logActivity } from "@/lib/activity/logger";
import { FieldValue } from "firebase-admin/firestore";
import {
  normalizeText,
  safeArr,
  uniq,
  toIso,
  asVacationStatus,
  isFinalStatusStr,
  computeStatus,
  canUserAccessSite,
  validateAssignedAgentsForSite,
  loadVacationOr404,
  syncAssignmentsForVacation,
  pickVacationApi,
} from "@/app/api/vacations/_shared";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(msg = "Bad request", extra?: any) {
  return json(400, { ok: false, error: msg, ...(extra ? { extra } : {}) });
}

function forbidden(msg = "Forbidden", extra?: any) {
  return json(403, { ok: false, error: msg, ...(extra ? { extra } : {}) });
}

function notFound(msg = "Not found") {
  return json(404, { ok: false, error: msg });
}

function conflict(msg = "Conflict", extra?: any) {
  return json(409, { ok: false, error: msg, ...(extra ? { extra } : {}) });
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

  const loaded = await loadVacationOr404(vacationId, auth.tenantId);
  if (!loaded.ok) return notFound(loaded.error);

  const allowed = await canUserAccessSite({
    tenantId: auth.tenantId,
    uid: auth.uid,
    role: auth.role,
    siteId: (loaded.data?.siteId as string | undefined) ?? null,
  });

  if (!allowed) return forbidden("Insufficient rights");

  const snap = await adminDb
    .collection("assignments")
    .where("tenantId", "==", auth.tenantId)
    .where("vacationId", "==", vacationId)
    .get();

  const assignments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return json(200, {
    ok: true,
    tenantId: auth.tenantId,
    assignments,
  });
}

/* ================= PUT ================= */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canManagePlanning(auth.role)) {
    return forbidden("Insufficient rights");
  }

  const { id } = await params;
  const vacationId = normalizeText(id);
  if (!vacationId) return bad("Missing vacation id");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const incoming = uniq(safeArr(body?.agentIds)).slice(0, 1);
  const ifMatchUpdatedAtIso =
    normalizeText(body?.ifMatchUpdatedAtIso) || null;

  try {
    const loaded = await loadVacationOr404(vacationId, auth.tenantId);
    if (!loaded.ok) return notFound(loaded.error);

    const prev = loaded.data as any;
    const prevStatusStr = String(asVacationStatus(prev?.status));

    if (prevStatusStr === "cancelled") {
      return bad("Cannot update cancelled vacation");
    }

    if (prevStatusStr === "closed" && !isAdminLike(auth.role)) {
      return forbidden(
        "Cannot change assigned agents for a closed vacation (admin/owner/super_admin only)"
      );
    }

    const siteId = normalizeText(prev?.siteId);
    if (!siteId) return bad("Vacation has no siteId");

    const prevAssigned = uniq(safeArr(prev?.assignedAgentIds));
    let nextAssigned = incoming;

    const validated = await validateAssignedAgentsForSite({
      tenantId: auth.tenantId,
      siteId,
      assignedAgentIds: nextAssigned,
      requiredQualification: prev?.requiredQualification,
    });

    if (!validated.ok) {
      return bad("Invalid agentIds", {
        details: validated.error,
        rejected: validated.rejected,
      });
    }

    nextAssigned = validated.validIds;

    const requiredAgents = 1;

      const patch: any = {
        assignedAgentIds: nextAssigned,
        requiredAgents: 1,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      };

    if (!isFinalStatusStr(prevStatusStr)) {
      patch.status = computeStatus(requiredAgents, nextAssigned.length);
    }

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

        if (curStatusStr === "closed" && !isAdminLike(auth.role)) {
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
      if (err?.code === "NOT_FOUND") return notFound("Vacation not found");
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
          hint: "Reload and retry with the latest updatedAtIso.",
        });
      }
      throw err;
    }

    const sync = await syncAssignmentsForVacation({
      tenantId: auth.tenantId,
      uid: auth.uid,
      vacationId,
      siteId,
      prevAssigned,
      nextAssigned,
    });

    const updatedSnap = await loaded.ref.get();
    const nextData = updatedSnap.data() as any;
    const name = nextData?.siteName ?? nextData?.title ?? "—";

    await safeLogActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "assignment.synced",
      entityType: "vacation",
      entityId: vacationId,
      message: `Affectations synchronisées : ${name}`,
      severity: sync.toAdd || sync.toCancel ? "warning" : "info",
      meta: {
        vacationId,
        siteId,
        prevAssignedCount: prevAssigned.length,
        nextAssignedCount: nextAssigned.length,
        sync,
        rejected: validated.rejected ?? [],
      },
    });

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      warnings: validated.rejected?.length
        ? [
            {
              code: "assigned_agents_rejected",
              rejected: validated.rejected,
              acceptedCount: nextAssigned.length,
            },
            ...(validated.warnings?.length
              ? [
                  {
                    code: "assigned_agents_compliance_warnings",
                    warnings: validated.warnings,
                  },
                ]
              : []),
          ]
        : validated.warnings?.length
          ? [
              {
                code: "assigned_agents_compliance_warnings",
                warnings: validated.warnings,
              },
            ]
        : undefined,
      sync,
      vacation: pickVacationApi(nextData, vacationId),
    });
  } catch (e: any) {
    return serverError(e, "vacations.[id].assignments.PUT", {
      vacationId,
    });
  }
}
