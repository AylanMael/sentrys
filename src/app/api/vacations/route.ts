// src/app/api/vacations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { requireTenantUser, canWrite } from "@/app/api/_utils/withTenant";
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

function serverError(e: any, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e?.message ?? String(e),
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

function parseMax(v: string | null, def = 50) {
  const n = Number(v ?? "");
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), 200);
}

/* ================= domain ================= */

type VacationStatus = "planned" | "partially_filled" | "filled" | "closed" | "cancelled";

function asVacationStatus(v: any): VacationStatus {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "planned" || s === "partially_filled" || s === "filled" || s === "closed" || s === "cancelled") {
    return s;
  }
  return "planned";
}

function computeStatus(requiredAgents: number, assignedCount: number): VacationStatus {
  if (requiredAgents <= 0 || assignedCount <= 0) return "planned";
  if (assignedCount >= requiredAgents) return "filled";
  return "partially_filled";
}

/* ================= assignments (create) ================= */

type AssignmentStatus = "assigned" | "cancelled" | "present" | "absent" | "replaced";

function assignmentDocId(vacationId: string, agentId: string) {
  return `${vacationId}_${agentId}`;
}

async function createAssignmentsForVacation(input: {
  tenantId: string;
  uid: string;
  vacationId: string;
  siteId: string;
  assignedAgentIds: string[];
}) {
  const { tenantId, uid, vacationId, siteId } = input;
  const ids = uniq(input.assignedAgentIds);

  if (!ids.length) return { created: 0 };

  const now = FieldValue.serverTimestamp();
  const batch = adminDb.batch();

  ids.forEach((agentId) => {
    const ref = adminDb.collection("assignments").doc(assignmentDocId(vacationId, agentId));
    batch.set(
      ref,
      {
        tenantId,
        vacationId,
        siteId,
        agentId,
        status: "assigned" as AssignmentStatus,
        createdAt: now,
        createdBy: uid,
        updatedAt: now,
        updatedBy: uid,
      },
      { merge: true }
    );
  });

  await batch.commit();
  return { created: ids.length };
}

/* ================= validations métier ================= */

async function assertSiteBelongsToTenant(siteId: string, tenantId: string) {
  const snap = await adminDb.collection("sites").doc(siteId).get();
  if (!snap.exists) return { ok: false as const, error: "Site not found" };

  const data = snap.data() as any;
  if (data?.tenantId !== tenantId) return { ok: false as const, error: "Site not found" };

  return { ok: true as const, site: data };
}

async function validateAssignedAgentsForSite(input: {
  tenantId: string;
  siteId: string;
  assignedAgentIds: string[];
}) {
  const { tenantId, siteId } = input;

  const ids = uniq(input.assignedAgentIds).slice(0, 200);
  if (ids.length === 0) return { ok: true as const, validIds: [], rejected: [] as any[] };

  const siteCheck = await assertSiteBelongsToTenant(siteId, tenantId);
  if (!siteCheck.ok) {
    return {
      ok: false as const,
      error: siteCheck.error,
      rejected: ids.map((id) => ({ id, reason: "site_not_found" })),
    };
  }

  const allowedOnSite = new Set<string>(safeArr(siteCheck.site?.agentIds));
  const rejected: Array<{ id: string; reason: string }> = [];

  const idsAllowed = ids.filter((id) => {
    if (!allowedOnSite.has(id)) {
      rejected.push({ id, reason: "agent_not_allowed_on_site" });
      return false;
    }
    return true;
  });

  if (idsAllowed.length === 0) return { ok: true as const, validIds: [], rejected };

  const refs = idsAllowed.map((id) => adminDb.collection("agents").doc(id));
  const snaps = await adminDb.getAll(...refs);

  const valid: string[] = [];
  snaps.forEach((snap, i) => {
    const id = idsAllowed[i];

    if (!snap.exists) return rejected.push({ id, reason: "agent_not_found" });

    const a = snap.data() as any;
    if (a?.tenantId !== tenantId) return rejected.push({ id, reason: "agent_cross_tenant" });

    const st = String(a?.status ?? "active").toLowerCase();
    if (st !== "active") return rejected.push({ id, reason: "agent_inactive" });

    valid.push(id);
  });

  return { ok: true as const, validIds: valid, rejected };
}

/* ================= pick ================= */

function pickVacation(d: any, id: string) {
  const siteName = d.siteName ?? d.title ?? null;

  return {
    id,
    tenantId: d.tenantId,
    siteId: d.siteId ?? null,

    siteName,
    title: d.title ?? null,

    status: asVacationStatus(d.status),
    requiredAgents: Number.isFinite(Number(d.requiredAgents)) ? Number(d.requiredAgents) : 1,
    assignedAgentIds: safeArr(d.assignedAgentIds),

    startAtIso: toIso(d.startAt),
    endAtIso: toIso(d.endAt),
    createdAtIso: toIso(d.createdAt),
    updatedAtIso: toIso(d.updatedAt),

    notes: d.notes ?? null,
  };
}

/* ================= GET ================= */

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);

  const siteId = normalizeText(url.searchParams.get("siteId"));
  const statusParam = normalizeText(url.searchParams.get("status")).toLowerCase();
  const statusFilter = statusParam && statusParam !== "all" ? statusParam : "all";

  const max = parseMax(url.searchParams.get("max"), 50);

  const fromIso = normalizeText(url.searchParams.get("from"));
  const toIsoStr = normalizeText(url.searchParams.get("to"));

  const from = fromIso ? parseDateTimeIso(fromIso) : null;
  const to = toIsoStr ? parseDateTimeIso(toIsoStr) : null;

  if (fromIso && !from) return bad("from must be an ISO date");
  if (toIsoStr && !to) return bad("to must be an ISO date");
  if (from && to && to.getTime() < from.getTime()) return bad("to must be >= from");

  // ✅ filtre status : on refuse les valeurs inconnues (évite bugs silencieux)
  const allowedStatus = new Set(["planned", "partially_filled", "filled", "closed", "cancelled", "all"]);
  if (!allowedStatus.has(statusFilter)) {
    return bad("Invalid status filter", { allowed: Array.from(allowedStatus) });
  }

  try {
    let q: FirebaseFirestore.Query = adminDb
      .collection("vacations")
      .where("tenantId", "==", auth.tenantId);

    if (siteId) {
      const siteCheck = await assertSiteBelongsToTenant(siteId, auth.tenantId);
      if (!siteCheck.ok) return bad(siteCheck.error);
      q = q.where("siteId", "==", siteId);
    }

    if (from) q = q.where("startAt", ">=", Timestamp.fromDate(from));
    if (to) q = q.where("startAt", "<=", Timestamp.fromDate(to));

    q = q.orderBy("startAt", "desc").limit(max);

    const snap = await q.get();
    let vacations = snap.docs.map((d) => pickVacation(d.data(), d.id));

    if (statusFilter !== "all") vacations = vacations.filter((v) => String(v.status) === statusFilter);

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      count: vacations.length,
      vacations,
    });
  } catch (e: any) {
    return serverError(e, "vacations.GET");
  }
}

/* ================= POST ================= */

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const siteId = normalizeText(body.siteId);
  if (!siteId) return bad("siteId is required");

  const start = parseDateTimeIso(body.startAt);
  const end = parseDateTimeIso(body.endAt);
  if (!start) return bad("startAt must be an ISO date");
  if (!end) return bad("endAt must be an ISO date");
  if (end.getTime() <= start.getTime()) return bad("endAt must be > startAt");

  const requiredAgents = Math.max(1, parseIntSafe(body.requiredAgents, 1));

  const siteName = body.siteName !== undefined ? normalizeText(body.siteName) || null : null;
  const title = body.title !== undefined ? normalizeText(body.title) || null : null;

  const notes = body.notes !== undefined ? normalizeText(body.notes) || null : null;

  const rawAssigned = uniq(safeArr(body.assignedAgentIds)).slice(0, 200);

  try {
    const validated = await validateAssignedAgentsForSite({
      tenantId: auth.tenantId,
      siteId,
      assignedAgentIds: rawAssigned,
    });

    if (!validated.ok) {
      return bad("Invalid assignedAgentIds", {
        details: (validated as any).error,
        rejected: (validated as any).rejected,
      });
    }

    const assignedAgentIds = validated.validIds;
    const status = computeStatus(requiredAgents, assignedAgentIds.length);

    const payload: any = {
      tenantId: auth.tenantId,
      siteId,

      siteName: siteName ?? title ?? null,
      title: title ?? null,

      notes,

      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end),

      requiredAgents,
      assignedAgentIds,

      status,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      updatedBy: auth.uid,
    };

    const ref = await adminDb.collection("vacations").add(payload);

    // ✅ sync assignments dès la création (si assignedAgentIds > 0)
    const sync = await createAssignmentsForVacation({
      tenantId: auth.tenantId,
      uid: auth.uid,
      vacationId: ref.id,
      siteId,
      assignedAgentIds,
    });

    const created = await ref.get();
    const data = created.data() as any;

    // ✅ activity log
    const displayName = payload.siteName ?? payload.title ?? "—";
    await logActivity({
      tenantId: auth.tenantId,
      actorUid: auth.uid,
      actorEmail: auth.email ?? null,
      actorRole: auth.role ?? null,
      action: "vacation.created",
      entityType: "vacation",
      entityId: ref.id,
      message: `Vacation créée : ${displayName}`,
      meta: {
        vacationId: ref.id,
        siteId,
        siteName: payload.siteName ?? null,
        startAtIso: start.toISOString(),
        endAtIso: end.toISOString(),
        requiredAgents,
        assignedCount: assignedAgentIds.length,
        status,
        assignmentsCreated: sync.created,
        rejectedAssigned: validated.rejected ?? [],
      },
      severity: (validated.rejected?.length ?? 0) > 0 ? "warning" : "info",
    });

    const warnings =
      validated.rejected.length > 0
        ? [
            {
              code: "assigned_agents_rejected",
              rejected: validated.rejected,
              acceptedCount: assignedAgentIds.length,
            },
          ]
        : undefined;

    return json(201, {
      ok: true,
      tenantId: auth.tenantId,
      warnings,
      sync,
      id: ref.id,
      vacation: pickVacation(data, ref.id),
    });
  } catch (e: any) {
    return serverError(e, "vacations.POST");
  }
}
