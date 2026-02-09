// src/app/api/vacations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { requireTenantUser, canWrite as canWriteRole } from "@/app/api/_utils/withTenant";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function bad(msg: string, extra?: any) {
  return json(400, { ok: false, error: msg, ...extra });
}

function unauthorized(msg = "Unauthorized", extra?: any) {
  return json(401, { ok: false, error: msg, ...extra });
}

function forbidden(msg = "Forbidden", extra?: any) {
  return json(403, { ok: false, error: msg, ...extra });
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

function toIso(ts: any) {
  return ts && typeof ts.toDate === "function" ? ts.toDate().toISOString() : null;
}

function normalizeText(v: any) {
  return String(v ?? "").trim();
}

function parseDateTimeIso(v: any): Date | null {
  const s = normalizeText(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean)));
}

function parseIntSafe(v: any, def: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}

/* ================= domain types ================= */

type VacationStatus =
  | "planned"
  | "partially_filled"
  | "filled"
  | "closed"
  | "cancelled";

function asVacationStatus(v: any): VacationStatus {
  const s = String(v ?? "").toLowerCase().trim();
  if (
    s === "planned" ||
    s === "partially_filled" ||
    s === "filled" ||
    s === "closed" ||
    s === "cancelled"
  ) {
    return s;
  }
  return "planned";
}

function computeStatus(requiredAgents: number, assignedCount: number): VacationStatus {
  if (requiredAgents <= 0) return "planned";
  if (assignedCount <= 0) return "planned";
  if (assignedCount >= requiredAgents) return "filled";
  return "partially_filled";
}

function isFinalStatus(s: VacationStatus): s is "closed" | "cancelled" {
  return s === "closed" || s === "cancelled";
}

/* ================= assignments sync ================= */

type AssignmentStatus =
  | "assigned"
  | "cancelled"
  | "present"
  | "absent"
  | "replaced";

function assignmentDocId(vacationId: string, agentId: string) {
  // ID déterministe => pas de doublons
  return `${vacationId}_${agentId}`;
}

/**
 * Sync "assignments" à partir de la différence prev/next.
 * - crée/active pour toAdd (sans écraser createdAt/createdBy si déjà existant)
 * - soft-cancel pour toCancel
 */
async function syncAssignmentsForVacation(input: {
  tenantId: string;
  uid: string;
  vacationId: string;
  siteId: string;
  prevAssigned: string[];
  nextAssigned: string[];
}) {
  const { tenantId, uid, vacationId, siteId } = input;

  const prev = new Set(uniq(input.prevAssigned));
  const next = new Set(uniq(input.nextAssigned));

  const toAdd: string[] = [];
  const toCancel: string[] = [];

  for (const agentId of next) if (!prev.has(agentId)) toAdd.push(agentId);
  for (const agentId of prev) if (!next.has(agentId)) toCancel.push(agentId);

  if (toAdd.length === 0 && toCancel.length === 0) {
    return { toAdd: 0, toCancel: 0 };
  }

  const now = FieldValue.serverTimestamp();

  // ✅ pour éviter d’écraser createdAt/createdBy, on regarde l’existence seulement pour toAdd
  const addRefs = toAdd.map((agentId) =>
    adminDb.collection("assignments").doc(assignmentDocId(vacationId, agentId))
  );
  const addSnaps = addRefs.length ? await adminDb.getAll(...addRefs) : [];

  const batch = adminDb.batch();

  // Ajouts / réactivations
  addSnaps.forEach((snap, idx) => {
    const agentId = toAdd[idx];
    const ref = addRefs[idx];

    const base = {
      tenantId,
      vacationId,
      siteId,
      agentId,
      status: "assigned" as AssignmentStatus,
      updatedAt: now,
      updatedBy: uid,
    };

    if (!snap.exists) {
      // création
      batch.set(ref, { ...base, createdAt: now, createdBy: uid }, { merge: true });
    } else {
      // réactivation sans toucher createdAt/createdBy
      batch.set(ref, base, { merge: true });
    }
  });

  // Retraits => soft-cancel
  toCancel.forEach((agentId) => {
    const ref = adminDb.collection("assignments").doc(assignmentDocId(vacationId, agentId));
    batch.set(
      ref,
      {
        tenantId,
        vacationId,
        siteId,
        agentId,
        status: "cancelled" as AssignmentStatus,
        updatedAt: now,
        updatedBy: uid,
      },
      { merge: true }
    );
  });

  await batch.commit();
  return { toAdd: toAdd.length, toCancel: toCancel.length };
}

/* ================= data loaders ================= */

async function loadVacationOr404(id: string, tenantId: string) {
  const ref = adminDb.collection("vacations").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false as const, res: notFound("Vacation not found") };

  const data = snap.data() as any;
  if (data?.tenantId !== tenantId) {
    // anti fuite cross-tenant
    return { ok: false as const, res: notFound("Vacation not found") };
  }

  return { ok: true as const, ref, snap, data };
}

/* ================= validations métier ================= */

async function validateAssignedAgentsForVacation(input: {
  tenantId: string;
  vacation: any;
  assignedAgentIds: string[];
}) {
  const { tenantId, vacation } = input;

  const ids = uniq(input.assignedAgentIds).slice(0, 200);
  if (ids.length === 0) {
    return { ok: true as const, validIds: [], rejected: [] as any[] };
  }

  const siteId = normalizeText(vacation?.siteId);
  if (!siteId) {
    return {
      ok: false as const,
      error: "Vacation has no siteId",
      rejected: ids.map((id) => ({ id, reason: "vacation_missing_siteId" })),
    };
  }

  const siteSnap = await adminDb.collection("sites").doc(siteId).get();
  if (!siteSnap.exists) {
    return {
      ok: false as const,
      error: "Site not found for this vacation",
      rejected: ids.map((id) => ({ id, reason: "site_not_found" })),
    };
  }

  const site = siteSnap.data() as any;
  if (site?.tenantId !== tenantId) {
    return {
      ok: false as const,
      error: "Site not found for this vacation",
      rejected: ids.map((id) => ({ id, reason: "site_cross_tenant" })),
    };
  }

  // ✅ seuls les agents affectés au site
  const allowedOnSite = new Set<string>(safeArr(site?.agentIds));
  const rejected: Array<{ id: string; reason: string }> = [];

  const idsAllowed = ids.filter((id) => {
    if (!allowedOnSite.has(id)) {
      rejected.push({ id, reason: "agent_not_allowed_on_site" });
      return false;
    }
    return true;
  });

  if (idsAllowed.length === 0) {
    return { ok: true as const, validIds: [], rejected };
  }

  // ✅ existence + tenant + status
  const refs = idsAllowed.map((id) => adminDb.collection("agents").doc(id));
  const snaps = await adminDb.getAll(...refs);

  const valid: string[] = [];

  snaps.forEach((snap, i) => {
    const id = idsAllowed[i];

    if (!snap.exists) {
      rejected.push({ id, reason: "agent_not_found" });
      return;
    }

    const a = snap.data() as any;
    if (a?.tenantId !== tenantId) {
      rejected.push({ id, reason: "agent_cross_tenant" });
      return;
    }

    const st = String(a?.status ?? "active").toLowerCase();
    if (st !== "active") {
      rejected.push({ id, reason: "agent_inactive" });
      return;
    }

    valid.push(id);
  });

  return { ok: true as const, validIds: valid, rejected };
}

/* ================= GET ================= */

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const vacationId = normalizeText(params?.id);
  if (!vacationId) return bad("Missing vacation id");

  try {
    const loaded = await loadVacationOr404(vacationId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const data = loaded.data;

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      vacation: {
        id: loaded.snap.id,
        ...data,
        startAtIso: toIso(data.startAt),
        endAtIso: toIso(data.endAt),
        createdAtIso: toIso(data.createdAt),
        updatedAtIso: toIso(data.updatedAt),
      },
    });
  } catch (e: any) {
    return serverError(e, "vacations.[id].GET");
  }
}

/* ================= PATCH ================= */

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWriteRole(auth.role)) {
    return forbidden("Insufficient rights");
  }

  const vacationId = normalizeText(params?.id);
  if (!vacationId) return bad("Missing vacation id");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  try {
    const loaded = await loadVacationOr404(vacationId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data as any;

    const prevStatus: VacationStatus = asVacationStatus(prev.status);
    const prevAssigned = uniq(safeArr(prev.assignedAgentIds));
    let nextAssigned = prevAssigned;

    if (prevStatus === "cancelled") {
      return bad("Cannot update a cancelled vacation");
    }

    const patch: any = {};
    const warnings: any[] = [];

    /* ========= Dates ========= */
    if (body.startAt !== undefined) {
      const d = parseDateTimeIso(body.startAt);
      if (!d) return bad("startAt must be an ISO date");
      patch.startAt = Timestamp.fromDate(d);
    }

    if (body.endAt !== undefined) {
      const d = parseDateTimeIso(body.endAt);
      if (!d) return bad("endAt must be an ISO date");
      patch.endAt = Timestamp.fromDate(d);
    }

    /* ========= Required agents ========= */
    if (body.requiredAgents !== undefined) {
      patch.requiredAgents = Math.max(
        1,
        parseIntSafe(body.requiredAgents, prev.requiredAgents ?? 1)
      );
    }

    /* ========= Notes ========= */
    if (body.notes !== undefined) {
      patch.notes = normalizeText(body.notes) || null;
    }

    /* ========= Status manuel ========= */
    if (body.status !== undefined) {
      const s = asVacationStatus(body.status);
      if (s !== "closed" && s !== "cancelled") {
        return bad("Only status 'closed' or 'cancelled' can be set manually");
      }
      patch.status = s;
    }

    /* ========= Affectations ========= */
    let doSyncAssignments = false;

    if (body.assignedAgentIds !== undefined) {
      doSyncAssignments = true;

      const raw = uniq(safeArr(body.assignedAgentIds)).slice(0, 200);

      const validated = await validateAssignedAgentsForVacation({
        tenantId: auth.tenantId,
        vacation: prev,
        assignedAgentIds: raw,
      });

      if (!validated.ok) {
        return bad("Invalid assignedAgentIds", {
          details: (validated as any).error,
          rejected: (validated as any).rejected,
        });
      }

      nextAssigned = uniq(validated.validIds);
      patch.assignedAgentIds = nextAssigned;

      if (validated.rejected.length > 0) {
        warnings.push({
          code: "assigned_agents_rejected",
          rejected: validated.rejected,
          acceptedCount: nextAssigned.length,
        });
      }
    }

    /* ========= Cohérence dates ========= */
    const start = patch.startAt ?? prev.startAt;
    const end = patch.endAt ?? prev.endAt;

    const startMs = start?.toDate?.()?.getTime?.() ?? 0;
    const endMs = end?.toDate?.()?.getTime?.() ?? 0;

    if (endMs <= startMs) {
      return bad("endAt must be > startAt");
    }

    /* ========= Status auto ========= */
    if (!patch.status && !isFinalStatus(prevStatus)) {
      const required = patch.requiredAgents ?? prev.requiredAgents ?? 1;
      patch.status = computeStatus(required, nextAssigned.length);
    }

    /* ========= Métadonnées ========= */
    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedBy = auth.uid;

    /* ========= Écriture vacation ========= */
    await loaded.ref.set(patch, { merge: true });

    /* ========= Sync assignments (après succès) ========= */
    let syncResult: { toAdd: number; toCancel: number } | undefined;

    if (doSyncAssignments) {
      const siteId = normalizeText(prev.siteId);
      if (!siteId) {
        warnings.push({ code: "assignments_sync_skipped", reason: "vacation_missing_siteId" });
      } else {
        try {
          syncResult = await syncAssignmentsForVacation({
            tenantId: auth.tenantId,
            uid: auth.uid,
            vacationId,
            siteId,
            prevAssigned,
            nextAssigned,
          });
        } catch (e: any) {
          // On ne casse pas la vacation si la sync échoue, mais on remonte un warning exploitable
          console.error("[vacations.[id].PATCH] assignments sync failed", e);
          warnings.push({
            code: "assignments_sync_failed",
            message: e?.message ?? String(e),
          });
        }
      }
    }

    const updated = await loaded.ref.get();
    const data = updated.data() as any;

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      warnings: warnings.length ? warnings : undefined,
      sync: syncResult,
      vacation: {
        id: updated.id,
        ...data,
        startAtIso: toIso(data.startAt),
        endAtIso: toIso(data.endAt),
        createdAtIso: toIso(data.createdAt),
        updatedAtIso: toIso(data.updatedAt),
      },
    });
  } catch (e: any) {
    return serverError(e, "vacations.[id].PATCH", {
      vacationId,
    });
  }
}

/* ================= DELETE ================= */

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWriteRole(auth.role)) return forbidden("Insufficient rights");

  const vacationId = normalizeText(params?.id);
  if (!vacationId) return bad("Missing vacation id");

  try {
    const loaded = await loadVacationOr404(vacationId, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    await loaded.ref.set(
      {
        status: "cancelled" as VacationStatus,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: auth.uid,
      },
      { merge: true }
    );

    return json(200, { ok: true, id: vacationId, updated: { status: "cancelled" } });
  } catch (e: any) {
    return serverError(e, "vacations.[id].DELETE", { vacationId });
  }
}
