// src/app/api/vacations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

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
  return Array.isArray(v)
    ? (v.filter((x) => typeof x === "string") as string[])
    : [];
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
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

/* ================= auth tenant ================= */

async function requireTenantUser(
  req: NextRequest
): Promise<
  | { ok: true; uid: string; tenantId: string; role?: string }
  | { ok: false; res: NextResponse }
> {
  const authHeader =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    req.headers.get("x-auth-token") ||
    "";

  if (!authHeader) return { ok: false, res: unauthorized("Missing token") };

  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!token) return { ok: false, res: unauthorized("Missing token") };

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const tuSnap = await adminDb.collection("tenantUsers").doc(uid).get();
    if (!tuSnap.exists) return { ok: false, res: unauthorized("No tenant user") };

    const tu = tuSnap.data() as any;
    if (!tu?.tenantId) return { ok: false, res: unauthorized("No tenant assigned") };
    if (tu.status !== "active") return { ok: false, res: unauthorized("User disabled") };

    return { ok: true, uid, tenantId: tu.tenantId, role: tu.role };
  } catch (e: any) {
    return { ok: false, res: unauthorized("Invalid token", { details: e?.message }) };
  }
}

/* ================= validations métier ================= */

async function assertSiteBelongsToTenant(siteId: string, tenantId: string) {
  const snap = await adminDb.collection("sites").doc(siteId).get();
  if (!snap.exists) return { ok: false as const, error: "Site not found" };

  const data = snap.data() as any;
  if (data?.tenantId !== tenantId) {
    // anti fuite cross-tenant
    return { ok: false as const, error: "Site not found" };
  }

  return { ok: true as const, site: data };
}

async function validateAssignedAgentsForSite(input: {
  tenantId: string;
  siteId: string;
  assignedAgentIds: string[];
}) {
  const { tenantId, siteId, assignedAgentIds } = input;

  const ids = uniq(assignedAgentIds).slice(0, 200);
  if (ids.length === 0) {
    return { ok: true as const, validIds: [], rejected: [] as any[] };
  }

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

  // 1) autorisé sur le site
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

  // 2) existence + tenant + status active
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

/* ================= pick ================= */

function pickVacation(d: any, id: string) {
  // compat: certains endroits utilisent siteName, d'autres title
  const siteName = d.siteName ?? d.title ?? null;

  return {
    id,
    tenantId: d.tenantId,
    siteId: d.siteId ?? null,

    // ✅ important pour ton UI dashboard/vacations
    siteName,

    // on garde title si tu veux (non utilisé par ton UI actuellement)
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
/**
 * GET /api/vacations?siteId=...&status=...&from=ISO&to=ISO&max=50
 *
 * - listing index-friendly: tenantId + (siteId?) + (startAt range?) + orderBy(startAt)
 * - status filtré en mémoire pour éviter index composites
 */
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

  // validations dates
  if (fromIso && !from) return bad("from must be an ISO date");
  if (toIsoStr && !to) return bad("to must be an ISO date");
  if (from && to && to.getTime() < from.getTime()) return bad("to must be >= from");

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

    if (statusFilter !== "all") {
      vacations = vacations.filter((v) => String(v.status) === statusFilter);
    }

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
/**
 * POST /api/vacations
 * body: {
 *   siteId: string,
 *   siteName?: string|null,   // ✅ utilisé par ton UI
 *   title?: string|null,      // fallback
 *   startAt: ISO,
 *   endAt: ISO,
 *   requiredAgents?: number,
 *   assignedAgentIds?: string[],
 *   notes?: string|null
 * }
 */
export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const role = String(auth.role ?? "");
  const canWrite = role === "admin" || role === "manager";
  if (!canWrite) return unauthorized("Insufficient rights");

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

  // compat UI: siteName (préféré) sinon title
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

      // ✅ on stocke les deux (au choix), mais au minimum siteName pour ton UI
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
    const created = await ref.get();
    const data = created.data() as any;

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
      id: ref.id, // ✅ utile (ta page create l'utilise aussi)
      vacation: pickVacation(data, ref.id),
    });
  } catch (e: any) {
    return serverError(e, "vacations.POST");
  }
}
