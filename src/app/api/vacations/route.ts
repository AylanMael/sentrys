import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

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
  parseMax,
  pickVacationApi,
  computeStatus,
  isMissingIndexError,
  extractIndexUrl,
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

function serverError(e: any, tag: string) {
  console.error(`[${tag}]`, e);

  const details = e?.message ?? String(e);
  const msg = String(details).toLowerCase();

  const isIndexError =
    msg.includes("requires an index") ||
    msg.includes("the query requires an index") ||
    msg.includes("failed_precondition");

  if (isIndexError) {
    const indexUrl = extractIndexUrl(e);

    return json(409, {
      ok: false,
      error: "Firestore index manquant pour cette requête (vacations).",
      details,
      indexUrl,
      hint:
        "Crée l’index composite demandé dans Firebase Console (le lien est parfois fourni). Ensuite, recharge le planning.",
    });
  }

  return json(500, {
    ok: false,
    error: "Internal error",
    details,
  });
}

/* ================= GET ================= */

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  const canReadAll = canReadBackoffice(auth.role);
  const isAgentUser = isAgent(auth.role);

  if (!canReadAll && !isAgentUser) {
    return forbidden("Insufficient rights");
  }

  const url = new URL(req.url);

  const siteId = normalizeText(url.searchParams.get("siteId"));
  const agentId = normalizeText(url.searchParams.get("agentId"));
  const statusParam = normalizeText(url.searchParams.get("status")).toLowerCase();
  const statusFilter = statusParam && statusParam !== "all" ? statusParam : "all";

  const max = parseMax(url.searchParams.get("max"), 50);
  const fetchLimit = canReadAll ? max : Math.min(Math.max(max * 10, 200), 1000);

  const fromIso = normalizeText(url.searchParams.get("from"));
  const toIsoStr = normalizeText(url.searchParams.get("to"));

  const from = fromIso ? parseDateTimeIso(fromIso) : null;
  const to = toIsoStr ? parseDateTimeIso(toIsoStr) : null;

  if (fromIso && !from) return bad("from must be an ISO date");
  if (toIsoStr && !to) return bad("to must be an ISO date");
  if (from && to && to.getTime() < from.getTime()) return bad("to must be >= from");

  const allowedStatus = new Set([
    "planned",
    "partially_filled",
    "filled",
    "closed",
    "cancelled",
    "all",
  ]);

  if (!allowedStatus.has(statusFilter)) {
    return bad("Invalid status filter", { allowed: Array.from(allowedStatus) });
  }

  let accessibleSiteIds: Set<string> | null = null;
  if (!canReadAll) {
    accessibleSiteIds = await listAccessibleSiteIdsForUser({
      tenantId: auth.tenantId,
      uid: auth.uid,
    });

    if (siteId && !accessibleSiteIds.has(siteId)) {
      return forbidden("Access denied for this site");
    }
  }

  const base: FirebaseFirestore.Query = adminDb
    .collection("vacations")
    .where("tenantId", "==", auth.tenantId);

  const warnings: any[] = [];

  try {
    let q = base;

    if (from && to) {
      q = q
        .where("startAt", "<", toTs(to))
        .where("endAt", ">", toTs(from))
        .orderBy("startAt", "desc")
        .limit(fetchLimit);
    } else if (from) {
      q = q
        .where("endAt", ">", toTs(from))
        .orderBy("endAt", "desc")
        .limit(fetchLimit);
    } else if (to) {
      q = q
        .where("startAt", "<", toTs(to))
        .orderBy("startAt", "desc")
        .limit(fetchLimit);
    } else {
      q = q.orderBy("startAt", "desc").limit(fetchLimit);
    }

    const snap = await q.get();
    let vacations = snap.docs.map((d) => pickVacationApi(d.data() as Record<string, unknown>, d.id));

    if (accessibleSiteIds) {
      vacations = vacations.filter(
        (v) => !!v.siteId && accessibleSiteIds!.has(v.siteId)
      );
    }

    if (siteId) {
      vacations = vacations.filter((v) => v.siteId === siteId);
    }

    if (agentId) {
      vacations = vacations.filter((v) => safeArr(v.assignedAgentIds).includes(agentId));
    }

    if (statusFilter !== "all") {
      vacations = vacations.filter((v) => String(v.status) === statusFilter);
    }

    vacations = vacations.slice(0, max);

    return json(200, {
      ok: true,
      tenantId: auth.tenantId,
      count: vacations.length,
      vacations,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (e: any) {
    if (!isMissingIndexError(e)) {
      return serverError(e, "vacations.GET");
    }

    const indexUrl = extractIndexUrl(e);

    warnings.push({
      code: "missing_index_fallback",
      message:
        "Firestore index manquant pour la requête overlap. Fallback activé (filtrage en mémoire).",
      indexUrl,
    });

    try {
      let q2: FirebaseFirestore.Query = base;

      const rangeTo = to ? toTs(to) : null;
      const fromMinus = from
        ? new Date(from.getTime() - 7 * 24 * 60 * 60 * 1000)
        : null;
      const rangeFrom = fromMinus ? toTs(fromMinus) : null;

      if (rangeFrom) q2 = q2.where("startAt", ">=", rangeFrom);
      if (rangeTo) q2 = q2.where("startAt", "<", rangeTo);

      q2 = q2.orderBy("startAt", "desc").limit(fetchLimit);

      const snap2 = await q2.get();
      let vacations = snap2.docs.map((d) => pickVacationApi(d.data() as Record<string, unknown>, d.id));

      if (from && to) {
        const fromMs = from.getTime();
        const toMs = to.getTime();

        vacations = vacations.filter((v) => {
          const s = v.startAtIso ? new Date(v.startAtIso).getTime() : 0;
          const en = v.endAtIso ? new Date(v.endAtIso).getTime() : 0;
          return s < toMs && en > fromMs;
        });
      } else if (from) {
        const fromMs = from.getTime();
        vacations = vacations.filter((v) => {
          const en = v.endAtIso ? new Date(v.endAtIso).getTime() : 0;
          return en > fromMs;
        });
      } else if (to) {
        const toMs = to.getTime();
        vacations = vacations.filter((v) => {
          const s = v.startAtIso ? new Date(v.startAtIso).getTime() : 0;
          return s < toMs;
        });
      }

      if (accessibleSiteIds) {
        vacations = vacations.filter(
          (v) => !!v.siteId && accessibleSiteIds!.has(v.siteId)
        );
      }

      if (siteId) {
        vacations = vacations.filter((v) => v.siteId === siteId);
      }

      if (agentId) {
        vacations = vacations.filter((v) => safeArr(v.assignedAgentIds).includes(agentId));
      }

      if (statusFilter !== "all") {
        vacations = vacations.filter((v) => String(v.status) === statusFilter);
      }

      vacations = vacations.slice(0, max);

      return json(200, {
        ok: true,
        tenantId: auth.tenantId,
        count: vacations.length,
        vacations,
        warnings,
      });
    } catch (e2: any) {
      // --- ULTRA FALLBACK (Zero index) ---
      // Si même la requête partitionnée sur startAt échoue (index manquant),
      // on récupère TOUTES les vacations du tenant et on filtre en mémoire.
      try {
        console.warn("[vacations.GET] Ultra-fallback activation (NO INDEX MODE)");
        const snap3 = await base.limit(1000).get();
        let vacations = snap3.docs.map((d) =>
          pickVacationApi(d.data() as Record<string, unknown>, d.id)
        );

        // Filtrage mémoire complet
        if (from || to) {
          const fromMs = from?.getTime() ?? 0;
          const toMs = to?.getTime() ?? Infinity;
          vacations = vacations.filter((v) => {
             const s = v.startAtIso ? new Date(v.startAtIso).getTime() : 0;
             const en = v.endAtIso ? new Date(v.endAtIso).getTime() : 0;
             // Overlap: start < to AND end > from
             return s < toMs && en > fromMs;
          });
        }

        if (accessibleSiteIds) {
          vacations = vacations.filter((v) => v.siteId && accessibleSiteIds!.has(v.siteId));
        }
        if (siteId) {
          vacations = vacations.filter((v) => v.siteId === siteId);
        }
        if (agentId) {
          vacations = vacations.filter((v) => safeArr(v.assignedAgentIds).includes(agentId));
        }
        if (statusFilter !== "all") {
          vacations = vacations.filter((v) => String(v.status) === statusFilter);
        }

        vacations = vacations.slice(0, max);

        return json(200, {
          ok: true,
          tenantId: auth.tenantId,
          count: vacations.length,
          vacations,
          warnings: [...warnings, { code: "ultra_fallback", message: "Filtrage 100% mémoire car les index Firestore sont absents." }],
        });
      } catch (e3: any) {
        return serverError(e3, "vacations.GET.ultra_fallback");
      }
    }
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
