// src/app/api/vacations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { requireTenantUser, canWrite as canWriteRole } from "@/app/api/_utils/withTenant";
import { logActivity } from "@/lib/activity/logger";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}
function bad(msg: string, extra?: any) {
  return json(400, { ok: false, error: msg, ...extra });
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
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}
function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean)));
}
function parseIntSafe(v: any, def: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.floor(n);
}
function displayNameFromVacation(v: any) {
  return v?.siteName ?? v?.title ?? "—";
}
function tsToDate(ts: any): Date | null {
  const d = ts?.toDate?.();
  return d && typeof d.getTime === "function" && Number.isFinite(d.getTime()) ? d : null;
}

/* ================= domain ================= */

type VacationStatusAll = "planned" | "partially_filled" | "filled" | "closed" | "cancelled";

function asVacationStatus(v: any): VacationStatusAll {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "planned" || s === "partially_filled" || s === "filled" || s === "closed" || s === "cancelled") {
    return s;
  }
  return "planned";
}

function computeStatus(requiredAgents: number, assignedCount: number): VacationStatusAll {
  if (requiredAgents <= 0 || assignedCount <= 0) return "planned";
  if (assignedCount >= requiredAgents) return "filled";
  return "partially_filled";
}

function isFinalStatusStr(s: string) {
  return s === "closed" || s === "cancelled";
}

/* ================= assignments ================= */

type AssignmentStatus = "assigned" | "cancelled" | "present" | "absent" | "replaced";

function assignmentDocId(vacationId: string, agentId: string) {
  return `${vacationId}_${agentId}`;
}

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

  const toAdd = [...next].filter((x) => !prev.has(x));
  const toCancel = [...prev].filter((x) => !next.has(x));

  if (!toAdd.length && !toCancel.length) return { toAdd: 0, toCancel: 0 };

  const now = FieldValue.serverTimestamp();
  const batch = adminDb.batch();

  toAdd.forEach((agentId) => {
    const ref = adminDb.collection("assignments").doc(assignmentDocId(vacationId, agentId));
    batch.set(
      ref,
      {
        tenantId,
        vacationId,
        siteId,
        agentId,
        status: "assigned" as AssignmentStatus,
        updatedAt: now,
        updatedBy: uid,
        createdAt: now,
        createdBy: uid,
      },
      { merge: true }
    );
  });

  toCancel.forEach((agentId) => {
    const ref = adminDb.collection("assignments").doc(assignmentDocId(vacationId, agentId));
    batch.set(
      ref,
      {
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

/* ================= loader ================= */

async function loadVacationOr404(id: string, tenantId: string) {
  const ref = adminDb.collection("vacations").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false as const, res: notFound() };

  const data = snap.data() as any;
  if (data?.tenantId !== tenantId) return { ok: false as const, res: notFound() };

  return { ok: true as const, ref, snap, data };
}

function pickVacationForApi(d: any, id: string) {
  return {
    id,
    ...d,
    startAtIso: toIso(d.startAt),
    endAtIso: toIso(d.endAt),
    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),
  };
}

/* ================= GET ================= */

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const id = normalizeText(params.id);
  if (!id) return bad("Missing vacation id");

  try {
    const loaded = await loadVacationOr404(id, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    return json(200, { ok: true, tenantId: auth.tenantId, vacation: pickVacationForApi(loaded.data, id) });
  } catch (e) {
    return serverError(e, "vacations.[id].GET");
  }
}

/* ================= PATCH ================= */

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWriteRole(auth.role)) return forbidden();

  const id = normalizeText(params.id);
  if (!id) return bad("Missing vacation id");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON");
  }

  try {
    const loaded = await loadVacationOr404(id, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data as any;

    const prevStatusUnion: VacationStatusAll = asVacationStatus(prev?.status);
    const prevStatusStr = String(prevStatusUnion);

    if (prevStatusStr === "cancelled") return bad("Cannot update cancelled vacation");

    const prevAssigned = uniq(safeArr(prev?.assignedAgentIds));
    let nextAssigned = prevAssigned;

    const patch: any = {};
    let didSync = false;

    if (body.startAt !== undefined) {
      const d = parseDateTimeIso(body.startAt);
      if (!d) return bad("Invalid startAt");
      patch.startAt = Timestamp.fromDate(d);
    }

    if (body.endAt !== undefined) {
      const d = parseDateTimeIso(body.endAt);
      if (!d) return bad("Invalid endAt");
      patch.endAt = Timestamp.fromDate(d);
    }

    if (body.requiredAgents !== undefined) {
      patch.requiredAgents = Math.max(1, parseIntSafe(body.requiredAgents, prev?.requiredAgents ?? 1));
    }

    if (body.notes !== undefined) {
      patch.notes = normalizeText(body.notes) || null;
    }

    let explicitFinalStatusStr: string | null = null;
    if (body.status !== undefined) {
      const s = String(asVacationStatus(body.status));
      if (s !== "closed" && s !== "cancelled") return bad("Only closed/cancelled allowed");
      patch.status = s;
      explicitFinalStatusStr = s;
    }

    if (body.assignedAgentIds !== undefined) {
      nextAssigned = uniq(safeArr(body.assignedAgentIds));
      patch.assignedAgentIds = nextAssigned;
      didSync = true;
    }

    const startDate = tsToDate(patch.startAt ?? prev?.startAt);
    const endDate = tsToDate(patch.endAt ?? prev?.endAt);
    if (!startDate || !endDate) return bad("Missing startAt/endAt");
    if (endDate.getTime() <= startDate.getTime()) return bad("endAt must be > startAt");

    // ✅ si on annule => on force nextAssigned=[] pour annuler toutes les affectations
    const isCancellingNow = explicitFinalStatusStr === "cancelled";
    if (isCancellingNow) {
      nextAssigned = []; // on annule tout côté assignments
      patch.assignedAgentIds = nextAssigned; // optionnel : tu peux aussi garder l’historique, mais là on aligne
      didSync = true;
    }

    if (!patch.status && !isFinalStatusStr(prevStatusStr)) {
      patch.status = computeStatus(patch.requiredAgents ?? prev?.requiredAgents ?? 1, nextAssigned.length);
    }

    patch.updatedAt = FieldValue.serverTimestamp();
    patch.updatedBy = auth.uid;

    await loaded.ref.set(patch, { merge: true });

    let syncResult: { toAdd: number; toCancel: number } | undefined;
    if (didSync && prev?.siteId) {
      syncResult = await syncAssignmentsForVacation({
        tenantId: auth.tenantId,
        uid: auth.uid,
        vacationId: id,
        siteId: prev.siteId,
        prevAssigned,
        nextAssigned,
      });
    }

    const updatedSnap = await loaded.ref.get();
    const nextData = updatedSnap.data() as any;

    const name = displayNameFromVacation(nextData ?? prev);
    const nextStatusStr = String(asVacationStatus(nextData?.status ?? patch.status ?? prevStatusUnion));
    const assignedDelta = nextAssigned.length - prevAssigned.length;

    const isCancelledNow =
      explicitFinalStatusStr === "cancelled" || (prevStatusStr !== "cancelled" && nextStatusStr === "cancelled");

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: isCancelledNow ? "vacation.cancelled" : "vacation.updated",
      entityType: "vacation",
      entityId: id,
      message: isCancelledNow ? `Vacation annulée : ${name}` : `Vacation mise à jour : ${name}`,
      severity: isCancelledNow ? "warning" : assignedDelta !== 0 ? "warning" : "info",
      meta: {
        vacationId: id,
        siteId: nextData?.siteId ?? prev?.siteId ?? null,
        siteName: nextData?.siteName ?? prev?.siteName ?? null,
        prevStatus: prevStatusStr,
        nextStatus: nextStatusStr,
        assignedPrevCount: prevAssigned.length,
        assignedNextCount: nextAssigned.length,
        assignedDelta,
        changed: Object.keys(patch),
        sync: syncResult ?? null,
      },
    });

    if (syncResult && (syncResult.toAdd > 0 || syncResult.toCancel > 0)) {
      await logActivity({
        tenantId: auth.tenantId,
        actorUid: auth.uid,
        actorEmail: auth.email ?? null,
        actorRole: auth.role ?? null,
        action: "assignment.synced",
        entityType: "vacation",
        entityId: id,
        message: `Affectations synchronisées : ${name}`,
        severity: "info",
        meta: {
          vacationId: id,
          siteId: nextData?.siteId ?? prev?.siteId ?? null,
          toAdd: syncResult.toAdd,
          toCancel: syncResult.toCancel,
        },
      });
    }

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      sync: syncResult,
      vacation: pickVacationForApi(nextData, id),
    });
  } catch (e) {
    return serverError(e, "vacations.[id].PATCH", { vacationId: id });
  }
}

/* ================= DELETE ================= */

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canWriteRole(auth.role)) return forbidden();

  const id = normalizeText(params.id);
  if (!id) return bad("Missing vacation id");

  try {
    const loaded = await loadVacationOr404(id, auth.tenantId);
    if (!loaded.ok) return loaded.res;

    const prev = loaded.data as any;
    const name = displayNameFromVacation(prev);

    const prevStatusStr = String(asVacationStatus(prev?.status));
    if (prevStatusStr === "cancelled") {
      return json(200, { ok: true, id, updated: { status: "cancelled" } });
    }

    // ✅ annule la vacation
    await loaded.ref.set(
      { status: "cancelled", updatedAt: FieldValue.serverTimestamp(), updatedBy: auth.uid },
      { merge: true }
    );

    // ✅ annule aussi les assignments existantes
    const prevAssigned = uniq(safeArr(prev?.assignedAgentIds));
    let syncResult: { toAdd: number; toCancel: number } | undefined;

    if (prev?.siteId && prevAssigned.length) {
      syncResult = await syncAssignmentsForVacation({
        tenantId: auth.tenantId,
        uid: auth.uid,
        vacationId: id,
        siteId: prev.siteId,
        prevAssigned,
        nextAssigned: [],
      });
    }

    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "vacation.cancelled",
      entityType: "vacation",
      entityId: id,
      message: `Vacation annulée : ${name}`,
      severity: "warning",
      meta: { vacationId: id, prevStatus: prevStatusStr, nextStatus: "cancelled", siteId: prev?.siteId ?? null, sync: syncResult ?? null },
    });

    return json(200, { ok: true, id, updated: { status: "cancelled" }, sync: syncResult });
  } catch (e) {
    return serverError(e, "vacations.[id].DELETE", { vacationId: id });
  }
}
