import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { createHash } from "node:crypto";
import { FieldPath, FieldValue, Timestamp } from "firebase-admin/firestore";

import {
  requireTenantUser,
  canReadBackoffice,
  canWrite,
  isAgent,
} from "@/app/api/_utils/withTenant";
import { logActivity } from "@/lib/activity/logger";

import {
  normalizeText,
  parseDateTimeIso,
  safeArr,
  uniq,
  pickVacationApi,
  computeStatus,
  toTs,
} from "@/app/api/vacations/_shared";
import { normalizeMissionType } from "@/lib/planning/mission-types";

import {
  validateAssignedAgentsForSite,
  createAssignmentsForVacation,
  listAccessibleSiteIdsForUser,
} from "@/app/api/vacations/_service";

export const runtime = "nodejs";

/* ================= helpers ================= */

function json(status: number, body: any) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(msg: string, extra?: any) {
  return json(400, { ok: false, error: msg, ...extra });
}

function forbidden(msg = "Forbidden", extra?: any) {
  return json(403, { ok: false, error: msg, ...extra });
}

function serverError(e: unknown, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
  });
}

/* ================= GET ================= */

const VACATION_PAGE_DEFAULT = 25;
const VACATION_PAGE_MAX = 50;

function parseVacationPageSize(raw: string | null) {
  if (!raw) return VACATION_PAGE_DEFAULT;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= VACATION_PAGE_MAX ? value : null;
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
type VacationCursor = {
  v: 1; id: string; seconds: number; nanoseconds: number;
  tenantHash: string; filtersHash: string; direction: "asc" | "desc";
};
function decodeVacationCursor(raw: string): VacationCursor | null {
  if (!raw || raw.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<VacationCursor>;
    if (value.v !== 1 || typeof value.id !== "string" || !value.id ||
      value.id.length > 1500 || value.id.includes("/") ||
      !Number.isSafeInteger(value.seconds) || !Number.isInteger(value.nanoseconds) ||
      (value.nanoseconds ?? -1) < 0 || (value.nanoseconds ?? 1_000_000_000) >= 1_000_000_000 ||
      typeof value.tenantHash !== "string" || typeof value.filtersHash !== "string" ||
      (value.direction !== "asc" && value.direction !== "desc")) return null;
    return value as VacationCursor;
  } catch { return null; }
}
function encodeVacationCursor(value: VacationCursor) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  const canReadAll = canReadBackoffice(auth.role);
  const isAgentUser = isAgent(auth.role);
  if (!canReadAll && !isAgentUser) return forbidden("Insufficient rights");
  const url = new URL(req.url);
  const siteId = normalizeText(url.searchParams.get("siteId"));
  const pageSize = parseVacationPageSize(url.searchParams.get("limit") ?? url.searchParams.get("max"));
  if (!pageSize) return bad("Invalid pagination parameters");
  for (const unsupported of ["q", "coverage", "agentId"]) {
    if (url.searchParams.has(unsupported)) return bad("Unsupported filter");
  }
  const status = normalizeText(url.searchParams.get("status"));
  if (status && status !== "all") return bad("Unsupported filter");
  const fromIso = normalizeText(url.searchParams.get("from"));
  const toIso = normalizeText(url.searchParams.get("to"));
  const from = fromIso ? parseDateTimeIso(fromIso) : null;
  const to = toIso ? parseDateTimeIso(toIso) : null;
  if ((fromIso && !from) || (toIso && !to) || (from && to && to.getTime() <= from.getTime())) return bad("Invalid date range");
  if (!canReadAll) {
    const accessibleSiteIds = await listAccessibleSiteIdsForUser({ tenantId: auth.tenantId, uid: auth.uid });
    if (!siteId) return bad("siteId is required for this role");
    if (!accessibleSiteIds.has(siteId)) return forbidden("Access denied for this site");
  }
  try {
    const sortDirection: "asc" | "desc" = siteId ? "asc" : "desc";
    const filtersHash = digest(JSON.stringify({
      siteId: siteId || null, from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null, sortDirection,
    }));
    const tenantHash = digest(auth.tenantId);
    const rawCursor = normalizeText(url.searchParams.get("cursor"));
    const cursor = rawCursor ? decodeVacationCursor(rawCursor) : null;
    if (rawCursor && (!cursor || cursor.tenantHash !== tenantHash ||
      cursor.filtersHash !== filtersHash || cursor.direction !== sortDirection)) return bad("Invalid cursor");
    let q: FirebaseFirestore.Query = adminDb.collection("vacations")
      .where("tenantId", "==", auth.tenantId);
    if (siteId) q = q.where("siteId", "==", siteId);
    if (from) q = q.where("startAt", ">=", Timestamp.fromDate(from));
    if (to) q = q.where("startAt", "<", Timestamp.fromDate(to));
    q = q.orderBy("startAt", sortDirection)
      .orderBy(FieldPath.documentId(), sortDirection);
    if (cursor) {
      const cursorSnap = await adminDb.collection("vacations").doc(cursor.id).get();
      if (!cursorSnap.exists || cursorSnap.data()?.tenantId !== auth.tenantId) return bad("Invalid cursor");
      const cursorData = cursorSnap.data();
      if (siteId && (typeof cursorData?.siteId !== "string" || cursorData.siteId !== siteId)) {
        console.warn("[vacations.GET] Cursor site mismatch");
        return bad("Invalid cursor");
      }
      const storedStart = cursorData?.startAt;
      if (!(storedStart instanceof Timestamp) || storedStart.seconds !== cursor.seconds ||
        storedStart.nanoseconds !== cursor.nanoseconds) return bad("Invalid cursor");
      q = q.startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), cursor.id);
    }
    const snap = await q.limit(pageSize + 1).get();
    const hasMore = snap.size > pageSize;
    const pageDocs = snap.docs.slice(0, pageSize);
    const items = pageDocs.map((doc) => pickVacationApi(doc.data() as Record<string, unknown>, doc.id));
    const last = hasMore ? pageDocs.at(-1) : null;
    const lastStart = last?.data().startAt;
    const nextCursor = last && lastStart instanceof Timestamp
      ? encodeVacationCursor({
          v: 1, id: last.id, seconds: lastStart.seconds, nanoseconds: lastStart.nanoseconds,
          tenantHash, filtersHash, direction: sortDirection,
        })
      : null;
    return json(200, { ok: true, items, nextCursor, hasMore });
  } catch (e: unknown) {
    return serverError(e, "vacations.GET");
  }
}

/* ================= POST ================= */

export async function POST(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canWrite(auth.role)) return forbidden("Insufficient rights");

  let body: Record<string, unknown>;
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

  const requiredAgents = 1;

  const siteName =
    body.siteName !== undefined ? normalizeText(body.siteName) || null : null;
  const title =
    body.title !== undefined ? normalizeText(body.title) || null : null;
  const missionType = normalizeMissionType(body.missionType);
  const notes =
    body.notes !== undefined ? normalizeText(body.notes) || null : null;
  const requiredQualification =
    body.requiredQualification !== undefined
      ? normalizeText(body.requiredQualification) || null
      : null;

  const rawAssigned = uniq(safeArr(body.assignedAgentIds)).slice(0, 1);

  try {
    const validated = await validateAssignedAgentsForSite({
      tenantId: auth.tenantId,
      siteId,
      assignedAgentIds: rawAssigned,
      requiredQualification,
    });

    if (!validated.ok) {
      return bad("Invalid assignedAgentIds", {
        details: validated.error,
        rejected: validated.rejected,
      });
    }

    const assignedAgentIds = validated.validIds;
    const status = computeStatus(requiredAgents, assignedAgentIds.length);
    const resolvedSiteName =
      siteName ?? title ?? (normalizeText(validated.site?.name) || null);

    const payload: any = {
      tenantId: auth.tenantId,
      siteId,
        siteName: resolvedSiteName,
        title: title ?? null,
        missionType,
        requiredQualification,
        notes,
        startAt: toTs(start),
      endAt: toTs(end),
      requiredAgents,
      assignedAgentIds,
      status,
      isPublished: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
      updatedBy: auth.uid,
    };

    const ref = await adminDb.collection("vacations").add(payload);

    const sync = await createAssignmentsForVacation({
      tenantId: auth.tenantId,
      uid: auth.uid,
      vacationId: ref.id,
      siteId,
      assignedAgentIds,
    });

    const created = await ref.get();
    const data = created.data() as any;

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
      validated.rejected.length > 0 || validated.warnings.length > 0
        ? [
            ...(validated.rejected.length > 0
              ? [
                  {
                    code: "assigned_agents_rejected",
                    rejected: validated.rejected,
                    acceptedCount: assignedAgentIds.length,
                  },
                ]
              : []),
            ...(validated.warnings.length > 0
              ? [
                  {
                    code: "assigned_agents_compliance_warnings",
                    warnings: validated.warnings,
                  },
                ]
              : []),
          ]
        : undefined;

    return json(201, {
      ok: true,
      tenantId: auth.tenantId,
      warnings,
      sync,
      id: ref.id,
      vacation: pickVacationApi(data, ref.id),
    });
  } catch (e: any) {
    return serverError(e, "vacations.POST");
  }
}
