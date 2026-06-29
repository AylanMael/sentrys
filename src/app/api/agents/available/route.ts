import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

import { requireTenantUser } from "@/app/api/_utils/withTenant";
import { adminDb } from "@/lib/firebase/admin";
import { computeAgentCompliance } from "@/lib/agents/compliance";
import { calculateDistance } from "@/lib/geo/distance";

export const runtime = "nodejs";

const RULES = {
  weekMaxNormalHours: 48,
  weekMaxExceptionalHours: 60,
  minRestHours: 11,
};

const EXTRA_DAYS_AROUND = 2;
const MAX_VACATIONS_FETCH = 4000;

type AvailabilityReason =
  | "inactive"
  | "not_allowed_on_site"
  | "overlap"
  | "rest_11h"
  | "projected_over_60h"
  | "qualification_missing"
  | "compliance_blocking";

type AgentRow = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string;
  professionalCardNumber?: string | null;
  professionalCardExpiresAt?: string | null;
  qualifications: string[];
  documents: any[];
  monthlyContractHours?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

type VacationRow = {
  id: string;
  tenantId: string;
  siteId?: string | null;
  status?: string;
  startAt?: unknown;
  endAt?: unknown;
  assignedAgentIds?: string[];
  requiredAgents?: number;
  siteName?: string | null;
  title?: string | null;
};

type NormalizedVacation = VacationRow & {
  startDate: Date;
  endDate: Date;
  assignedAgentIds: string[];
  status: string;
};

type AvailableAgentItem = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  professionalCardExpiresAt?: string | null;
  qualifications: string[];
  weeklyMinutes: number;
  currentWeekHours: number;
  projectedWeekHours: number;
  weekHours: number;
  missionHours: number;
  hasConflict: boolean;
  restViolation: boolean;
  warningOver48: boolean;
  over60h: boolean;
  qualificationMatch: boolean;
  complianceStatus: "ok" | "info" | "warning" | "blocking";
  complianceAlerts: Array<{ code: string; title: string; severity: string }>;
  workloadLevel: "light" | "normal" | "high" | "critical";
  distanceKm: number | null;
  score: number;
  isAvailable: boolean;
  reasons: AvailabilityReason[];
  strengths: string[];
  warnings: string[];
  blocking: string[];
};

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function bad(msg: string, extra?: Record<string, unknown>) {
  return json(400, { ok: false, error: msg, ...(extra ? { extra } : {}) });
}

function forbidden(msg = "Forbidden", extra?: Record<string, unknown>) {
  return json(403, { ok: false, error: msg, ...(extra ? { extra } : {}) });
}

function serverError(e: unknown, tag: string) {
  console.error(`[${tag}]`, e);
  return json(500, {
    ok: false,
    error: "Internal error",
    details: e instanceof Error ? e.message : String(e),
  });
}

function normalizeText(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeRole(v: unknown) {
  return normalizeText(v).toLowerCase();
}

function normalizeNullableText(v: unknown) {
  const value = normalizeText(v);
  return value || null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function numberOrNull(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function canManagePlanning(role: string | null | undefined) {
  const r = normalizeRole(role);
  return ["super_admin", "owner", "admin", "manager"].includes(r);
}

function parseIso(v: string | null): Date | null {
  const s = normalizeText(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function tsToDate(ts: unknown): Date | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  const d = typeof t?.toDate === "function" ? t.toDate() : null;
  return d && Number.isFinite(d.getTime()) ? d : null;
}

function uniq<T extends string>(arr: T[]) {
  return Array.from(new Set(arr.map((x) => String(x)).filter(Boolean))) as T[];
}

function safeArr(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
}

function profileOf(data: Record<string, unknown>) {
  const profile = data.profile;
  return profile && typeof profile === "object" && !Array.isArray(profile)
    ? (profile as Record<string, unknown>)
    : {};
}

function profileValue(data: Record<string, unknown>, key: string) {
  const profile = profileOf(data);
  return data[key] ?? profile[key] ?? null;
}

function isoWeekRangeUtc(anchor: Date) {
  const d = new Date(anchor);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
  );
  start.setUTCDate(start.getUTCDate() - diffToMonday);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  return { weekStart: start, weekEnd: end };
}

function minutesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  const ms = e - s;
  if (ms <= 0) return 0;
  return ms / (60 * 1000);
}

function isMissingIndexError(e: unknown) {
  const err = e as { message?: string; details?: string; code?: number } | null | undefined;
  const msg = String(err?.message ?? "").toLowerCase();
  const details = String(err?.details ?? "").toLowerCase();
  const code = err?.code;
  return (
    code === 9 ||
    msg.includes("failed_precondition") ||
    details.includes("failed_precondition") ||
    msg.includes("requires an index") ||
    details.includes("requires an index") ||
    msg.includes("the query requires an index")
  );
}

function normalizedQualification(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function agentLabel(a: Pick<AgentRow, "id" | "firstName" | "lastName" | "email" | "phone">) {
  const full = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim();
  return full || a.email || a.phone || a.id || "Agent";
}

function workloadLevel(projectedWeekHours: number): AvailableAgentItem["workloadLevel"] {
  if (projectedWeekHours > RULES.weekMaxExceptionalHours) return "critical";
  if (projectedWeekHours > RULES.weekMaxNormalHours) return "high";
  if (projectedWeekHours >= 40) return "normal";
  return "light";
}

function reasonLabel(reason: AvailabilityReason) {
  const labels: Record<AvailabilityReason, string> = {
    inactive: "Agent inactif",
    not_allowed_on_site: "Non rattache au site",
    overlap: "Deja affecte sur ce creneau",
    rest_11h: "Repos legal 11h non respecte",
    projected_over_60h: "Depassement 60h semaine",
    qualification_missing: "Qualification requise absente",
    compliance_blocking: "Dossier agent bloquant",
  };

  return labels[reason];
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;

  if (!canManagePlanning(auth.role)) {
    return forbidden("Insufficient rights");
  }

  const url = new URL(req.url);
  const start =
    parseIso(url.searchParams.get("from")) ??
    parseIso(url.searchParams.get("start"));
  const end =
    parseIso(url.searchParams.get("to")) ??
    parseIso(url.searchParams.get("end"));
  const siteId = normalizeText(url.searchParams.get("siteId"));
  const excludeVacationId = normalizeText(url.searchParams.get("excludeVacationId"));
  const requiredQualification = normalizeText(
    url.searchParams.get("requiredQualification")
  );

  if (!start || !end) return bad("from/to are required (ISO date)");
  if (end.getTime() <= start.getTime()) return bad("end must be > start");

  const agentsSnap = await adminDb
    .collection("agents")
    .where("tenantId", "==", auth.tenantId)
    .get();

  let agents: AgentRow[] = agentsSnap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      id: doc.id,
      firstName: normalizeNullableText(profileValue(data, "firstName")),
      lastName: normalizeNullableText(profileValue(data, "lastName")),
      email: normalizeNullableText(profileValue(data, "email")),
      phone: normalizeNullableText(profileValue(data, "phone")),
      status: normalizeText(profileValue(data, "status") ?? "active") || "active",
      professionalCardNumber: normalizeNullableText(
        profileValue(data, "professionalCardNumber")
      ),
      professionalCardExpiresAt: normalizeNullableText(
        profileValue(data, "professionalCardExpiresAt")
      ),
      qualifications: normalizeStringArray(profileValue(data, "qualifications")),
      documents: Array.isArray(profileValue(data, "documents"))
        ? (profileValue(data, "documents") as any[])
        : [],
      monthlyContractHours: numberOrNull(profileValue(data, "monthlyContractHours")),
      latitude: numberOrNull(
        profileValue(data, "latitude") ?? profileValue(data, "homeLatitude")
      ),
      longitude: numberOrNull(
        profileValue(data, "longitude") ?? profileValue(data, "homeLongitude")
      ),
    };
  });

  let allowedOnSite: Set<string> | null = null;
  let siteLatitude: number | null = null;
  let siteLongitude: number | null = null;

  if (siteId) {
    const siteSnap = await adminDb.collection("sites").doc(siteId).get();
    if (!siteSnap.exists) {
      return json(200, { ok: true, tenantId: auth.tenantId, count: 0, agents: [], available: [] });
    }

    const site = siteSnap.data() as Record<string, unknown> | undefined;
    if (site?.tenantId !== auth.tenantId) {
      return json(200, { ok: true, tenantId: auth.tenantId, count: 0, agents: [], available: [] });
    }

    allowedOnSite = new Set<string>(safeArr(site.agentIds));
    agents = agents.filter((agent) => allowedOnSite!.has(agent.id));
    siteLatitude = numberOrNull(site.latitude);
    siteLongitude = numberOrNull(site.longitude);
  }

  const { weekStart, weekEnd } = isoWeekRangeUtc(start);
  const fetchFrom = addDays(weekStart, -EXTRA_DAYS_AROUND);
  const fetchTo = addDays(weekEnd, EXTRA_DAYS_AROUND);
  const warnings: any[] = [];
  let vacations: VacationRow[] = [];

  try {
    const q: FirebaseFirestore.Query = adminDb
      .collection("vacations")
      .where("tenantId", "==", auth.tenantId)
      .where("startAt", ">=", Timestamp.fromDate(fetchFrom))
      .where("startAt", "<", Timestamp.fromDate(fetchTo))
      .orderBy("startAt", "asc")
      .limit(MAX_VACATIONS_FETCH);

    const snap = await q.get();
    vacations = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as VacationRow[];
  } catch (e: unknown) {
    if (!isMissingIndexError(e)) return serverError(e, "agents.available.GET");

    warnings.push({
      code: "missing_index_fallback",
      message: "Index manquant sur vacations, fallback active.",
    });

    try {
      const snap = await adminDb
        .collection("vacations")
        .where("tenantId", "==", auth.tenantId)
        .orderBy("startAt", "desc")
        .limit(2000)
        .get();

      vacations = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as unknown as VacationRow[];
    } catch (e2: unknown) {
      return serverError(e2, "agents.available.GET.fallback");
    }
  }

  const normalized: NormalizedVacation[] = vacations
    .filter((v) => v && v.tenantId === auth.tenantId)
    .filter((v) => String(v.status ?? "planned").toLowerCase() !== "cancelled")
    .filter((v) => (excludeVacationId ? v.id !== excludeVacationId : true))
    .map((v) => {
      const startDate = tsToDate(v.startAt);
      const endDate = tsToDate(v.endAt);
      return {
        ...v,
        startDate,
        endDate,
        assignedAgentIds: safeArr(v.assignedAgentIds),
        status: String(v.status ?? "planned").toLowerCase(),
      } as unknown as NormalizedVacation;
    })
    .filter((v) => !!v.startDate && !!v.endDate);

  const vacByAgent = new Map<string, NormalizedVacation[]>();
  for (const agent of agents) vacByAgent.set(agent.id, []);

  for (const vacation of normalized) {
    for (const agentId of vacation.assignedAgentIds) {
      if (!vacByAgent.has(agentId)) continue;
      vacByAgent.get(agentId)!.push(vacation);
    }
  }

  const startMs = start.getTime();
  const endMs = end.getTime();
  const restMs = RULES.minRestHours * 60 * 60 * 1000;
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();
  const missionMinutes = Math.max(
    0,
    minutesOverlap(startMs, endMs, weekStartMs, weekEndMs)
  );
  const missionHours = Math.round((missionMinutes / 60) * 100) / 100;
  const requiredNormalized = normalizedQualification(requiredQualification);

  const items: AvailableAgentItem[] = agents
    .map((agent) => {
      const reasons: AvailabilityReason[] = [];
      const st = String(agent.status ?? "active").toLowerCase();

      if (st !== "active") reasons.push("inactive");
      if (allowedOnSite && !allowedOnSite.has(agent.id)) reasons.push("not_allowed_on_site");

      const assignedVacations = vacByAgent.get(agent.id) ?? [];
      let currentWeekMinutes = 0;

      for (const vacation of assignedVacations) {
        const vacationStart = vacation.startDate.getTime();
        const vacationEnd = vacation.endDate.getTime();
        currentWeekMinutes += minutesOverlap(
          vacationStart,
          vacationEnd,
          weekStartMs,
          weekEndMs
        );
      }

      const currentWeekHours = Math.round((currentWeekMinutes / 60) * 100) / 100;
      const projectedWeekHours = Math.round((currentWeekHours + missionHours) * 100) / 100;
      const warningOver48 = projectedWeekHours > RULES.weekMaxNormalHours;
      const over60h = projectedWeekHours > RULES.weekMaxExceptionalHours;
      if (over60h) reasons.push("projected_over_60h");

      let hasConflict = false;
      for (const vacation of assignedVacations) {
        const vacationStart = vacation.startDate.getTime();
        const vacationEnd = vacation.endDate.getTime();
        if (vacationStart < endMs && vacationEnd > startMs) {
          hasConflict = true;
          break;
        }
      }
      if (hasConflict) reasons.push("overlap");

      let restViolation = false;
      for (const vacation of assignedVacations) {
        const vacationEnd = vacation.endDate.getTime();
        if (vacationEnd <= startMs && startMs - vacationEnd < restMs) {
          restViolation = true;
          break;
        }
      }

      if (!restViolation) {
        for (const vacation of assignedVacations) {
          const vacationStart = vacation.startDate.getTime();
          if (vacationStart >= endMs && vacationStart - endMs < restMs) {
            restViolation = true;
            break;
          }
        }
      }
      if (restViolation) reasons.push("rest_11h");

      const qualificationMatch = requiredNormalized
        ? agent.qualifications.map((q) => q.toLowerCase()).includes(requiredNormalized)
        : true;
      if (!qualificationMatch) reasons.push("qualification_missing");

      const compliance = computeAgentCompliance(agent, { requiredQualification });
      if (compliance.status === "blocking") reasons.push("compliance_blocking");

      const distanceMeters =
        siteLatitude !== null &&
        siteLongitude !== null &&
        agent.latitude !== null &&
        agent.latitude !== undefined &&
        agent.longitude !== null &&
        agent.longitude !== undefined
          ? calculateDistance(agent.latitude, agent.longitude, siteLatitude, siteLongitude)
          : null;
      const distanceKm = distanceMeters === null ? null : Math.round((distanceMeters / 1000) * 10) / 10;

      const uniqueReasons = uniq(reasons);
      const blocking = uniqueReasons.map(reasonLabel);
      const isAvailable = uniqueReasons.length === 0;
      const complianceAlerts = compliance.alerts.map((alert) => ({
        code: alert.code,
        title: alert.title,
        severity: alert.severity,
      }));

      const strengths: string[] = [];
      if (!hasConflict) strengths.push("Disponible sur ce creneau");
      if (!restViolation) strengths.push("Repos 11h respecte");
      strengths.push(
        requiredQualification
          ? "Qualification compatible"
          : "Aucune qualification specifique requise"
      );
      if (compliance.status === "ok") strengths.push("Dossier agent conforme");
      if (distanceKm !== null) strengths.push(`${distanceKm} km du site`);
      strengths.push(`${projectedWeekHours}h projetees cette semaine`);

      const itemWarnings: string[] = [];
      if (warningOver48 && !over60h) {
        itemWarnings.push("Charge projetee au-dessus de 48h cette semaine");
      }
      if (compliance.status === "warning") {
        itemWarnings.push(...compliance.warningAlerts.map((alert) => alert.title));
      }
      if (distanceKm === null) {
        itemWarnings.push("Distance non calculee : coordonnees agent absentes");
      }

      let score = 82;
      if (isAvailable) score += 8;
      if (qualificationMatch) score += 6;
      if (compliance.status === "ok") score += 6;
      if (compliance.status === "info") score += 2;
      if (compliance.status === "warning") score -= 8;
      if (warningOver48) score -= 12;
      if (projectedWeekHours < 35) score += 5;
      if (projectedWeekHours >= 45) score -= 5;
      if (distanceKm !== null) {
        if (distanceKm <= 10) score += 6;
        else if (distanceKm <= 25) score += 3;
        else if (distanceKm > 50) score -= 5;
      }
      score -= uniqueReasons.length * 35;

      return {
        id: agent.id,
        firstName: agent.firstName ?? null,
        lastName: agent.lastName ?? null,
        email: agent.email ?? null,
        phone: agent.phone ?? null,
        professionalCardExpiresAt: agent.professionalCardExpiresAt ?? null,
        qualifications: agent.qualifications,
        weeklyMinutes: Math.round(currentWeekMinutes),
        currentWeekHours,
        projectedWeekHours,
        weekHours: projectedWeekHours,
        missionHours,
        hasConflict,
        restViolation,
        warningOver48,
        over60h,
        qualificationMatch,
        complianceStatus: compliance.status,
        complianceAlerts,
        workloadLevel: workloadLevel(projectedWeekHours),
        distanceKm,
        score: clampScore(score),
        isAvailable,
        reasons: uniqueReasons,
        strengths,
        warnings: itemWarnings,
        blocking,
      } satisfies AvailableAgentItem;
    })
    .sort((left, right) => {
      if (left.isAvailable !== right.isAvailable) return left.isAvailable ? -1 : 1;
      if (right.score !== left.score) return right.score - left.score;
      if (left.projectedWeekHours !== right.projectedWeekHours) {
        return left.projectedWeekHours - right.projectedWeekHours;
      }
      return agentLabel(left).localeCompare(agentLabel(right), "fr");
    });

  const available = items.filter((item) => item.isAvailable);

  return json(200, {
    ok: true,
    tenantId: auth.tenantId,
    rules: RULES,
    criteria: {
      from: start.toISOString(),
      to: end.toISOString(),
      siteId: siteId || null,
      requiredQualification: requiredQualification || null,
      missionHours,
    },
    week: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
    count: items.length,
    availableCount: available.length,
    agents: items,
    available,
    warnings: warnings.length ? warnings : undefined,
  });
}
