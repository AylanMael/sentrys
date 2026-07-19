import { NextRequest, NextResponse } from "next/server";

import {
  canReadBackoffice,
  requireTenantUser,
} from "@/app/api/_utils/withTenant";
import { safeArr } from "@/app/api/vacations/_shared";
import { adminDb } from "@/lib/firebase/admin";
import {
  pickOperationSignalState,
  type OperationSignalStatus,
} from "@/lib/operations/cockpit-signals";
import {
  normalizePrepayPeriodStatus,
  prepayPeriodDocId,
} from "@/lib/payroll/workflow";

export const runtime = "nodejs";

type PriorityTone = "critical" | "warning" | "info" | "success";
type TimelineKind =
  | "coverage"
  | "start"
  | "incident"
  | "dispatch"
  | "compliance"
  | "publication"
  | "all_clear";

function json(status: number, body: unknown) {
  const res = NextResponse.json(body, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  if (value instanceof Date) return value.toISOString();

  const timestamp = value as { toDate?: () => Date };
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toISOString();
  }

  return null;
}

function toDate(value: unknown): Date | null {
  const iso = toIso(value);
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfTomorrow() {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

function overlaps(start: Date | null, end: Date | null, from: Date, to: Date) {
  if (!start || !end) return false;
  return start.getTime() < to.getTime() && end.getTime() > from.getTime();
}

function isActiveVacation(data: Record<string, unknown>) {
  const status = text(data.status).toLowerCase();
  return status !== "closed" && status !== "cancelled";
}

function isPublishedFresh(data: Record<string, unknown>) {
  if (data.isPublished !== true) return false;

  const publishedAt = toDate(data.publishedAt);
  const updatedAt = toDate(data.updatedAt);
  if (!publishedAt || !updatedAt) return true;

  return updatedAt.getTime() <= publishedAt.getTime() + 1000;
}

function requiredAgents(data: Record<string, unknown>) {
  const value = Number(data.requiredAgents ?? 1);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 1;
}

function agentName(data: Record<string, unknown> | undefined, fallback: string) {
  if (!data) return fallback;
  const fullName = [text(data.firstName), text(data.lastName)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || text(data.email) || text(data.phone) || fallback;
}

function siteName(data: Record<string, unknown> | undefined, fallback: string) {
  if (!data) return fallback;
  return text(data.name) || fallback;
}

function formatHour(iso: string | null) {
  if (!iso) return "heure inconnue";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "heure inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function priority(input: {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: PriorityTone;
  actionLabel: string;
  rank: number;
}) {
  return input;
}

function timelineItem(input: {
  id: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  timeIso: string | null;
  href: string;
  tone: PriorityTone;
  actionLabel: string;
  rank: number;
}) {
  return input;
}

export async function GET(req: NextRequest) {
  const auth = await requireTenantUser(req);
  if (!auth.ok) return auth.res;
  if (!canReadBackoffice(auth.role)) {
    return json(403, { ok: false, error: "Forbidden" });
  }

  const now = new Date();
  const todayStart = startOfToday();
  const tomorrowStart = startOfTomorrow();
  const nextTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const monthRange = currentMonthRange();

  const [
    vacationsSnap,
    agentsSnap,
    sitesSnap,
    incidentsSnap,
    dispatchesSnap,
    prepayPeriodSnap,
  ] = await Promise.all([
    adminDb
      .collection("vacations")
      .where("tenantId", "==", auth.tenantId)
      .limit(5000)
      .get(),
    adminDb
      .collection("agents")
      .where("tenantId", "==", auth.tenantId)
      .limit(1000)
      .get(),
    adminDb
      .collection("sites")
      .where("tenantId", "==", auth.tenantId)
      .limit(1000)
      .get(),
    adminDb
      .collection("incidents")
      .where("tenantId", "==", auth.tenantId)
      .limit(500)
      .get(),
    adminDb
      .collection("planningDispatches")
      .where("tenantId", "==", auth.tenantId)
      .limit(500)
      .get(),
    adminDb
      .collection("prepayPeriods")
      .doc(
        prepayPeriodDocId(
          auth.tenantId,
          monthRange.fromIso,
          monthRange.toIso
        )
      )
      .get(),
  ]);

  const agents = agentsSnap.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as Record<string, unknown>,
  }));
  const sites = sitesSnap.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as Record<string, unknown>,
  }));
  const sitesById = new Map(sites.map((site) => [site.id, site.data]));
  const agentsById = new Map(agents.map((agent) => [agent.id, agent.data]));

  const activeAgents = agents.filter((agent) => {
    return text(agent.data.status).toLowerCase() !== "inactive";
  });
  const activeSites = sites.filter((site) => site.data.isActive !== false);

  const todayVacations = vacationsSnap.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() as Record<string, unknown>,
      start: toDate(doc.data().startAt),
      end: toDate(doc.data().endAt),
    }))
    .filter(
      (vacation) =>
        isActiveVacation(vacation.data) &&
        overlaps(vacation.start, vacation.end, todayStart, tomorrowStart)
    );

  let requiredPosts = 0;
  let assignedPosts = 0;
  let uncoveredPosts = 0;
  let draftOrModified = 0;
  let startsNextTwoHours = 0;
  const upcomingStarts: typeof todayVacations = [];
  const modifiédVacations: typeof todayVacations = [];

  const uncoveredVacations = todayVacations.filter((vacation) => {
    const required = requiredAgents(vacation.data);
    const assigned = safeArr(vacation.data.assignedAgentIds).length;
    const missing = Math.max(0, required - assigned);

    requiredPosts += required;
    assignedPosts += Math.min(required, assigned);
    uncoveredPosts += missing;

    if (!isPublishedFresh(vacation.data)) {
      draftOrModified += 1;
      modifiédVacations.push(vacation);
    }

    if (
      vacation.start &&
      vacation.start.getTime() >= now.getTime() &&
      vacation.start.getTime() <= nextTwoHours.getTime()
    ) {
      startsNextTwoHours += 1;
      upcomingStarts.push(vacation);
    }

    return missing > 0;
  });

  const coverageRate =
    requiredPosts > 0 ? Math.round((assignedPosts / requiredPosts) * 100) : 100;

  const unresolvedIncidents = incidentsSnap.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() as Record<string, unknown>,
      updatedAtIso: toIso(doc.data().updatedAt) || toIso(doc.data().createdAt),
    }))
    .filter((incident) => {
      const status = text(incident.data.status).toLowerCase();
      const isDeleted = incident.data.isDeleted === true;
      return !isDeleted && status !== "resolved" && status !== "closed";
    });

  const criticalIncidents = unresolvedIncidents.filter((incident) => {
    const severity = text(incident.data.severity).toLowerCase();
    return severity === "critical" || severity === "high";
  });

  const complianceOpenDispatches = dispatchesSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
    .filter((dispatch) => {
      if (dispatch.data.complianceOverride !== true) return false;
      const status = text(dispatch.data.complianceResolutionStatus);
      return !status || status === "to_regularize";
    });

  const unacknowledgedDispatches = dispatchesSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
    .filter((dispatch) => {
      const sentAt = toIso(dispatch.data.sentAt) || text(dispatch.data.sentAtIso);
      const acknowledgedAt =
        toIso(dispatch.data.acknowledgedAt) ||
        text(dispatch.data.acknowledgedAtIso);
      const from = new Date(text(dispatch.data.fromIso));
      const to = new Date(text(dispatch.data.toIso));
      const inPeriod =
        Number.isFinite(from.getTime()) &&
        Number.isFinite(to.getTime()) &&
        overlaps(from, to, todayStart, tomorrowStart);

      return Boolean(sentAt) && !acknowledgedAt && inPeriod;
    });

  const prepayStatus = prepayPeriodSnap.exists
    ? normalizePrepayPeriodStatus(prepayPeriodSnap.data()?.status)
    : "draft";

  const priorities = [
    ...uncoveredVacations.slice(0, 5).map((vacation) => {
      const required = requiredAgents(vacation.data);
      const assigned = safeArr(vacation.data.assignedAgentIds).length;
      const missing = Math.max(0, required - assigned);
      const label =
        text(vacation.data.siteName) ||
        (text(vacation.data.siteId)
          ? siteName(sitesById.get(text(vacation.data.siteId)), "Site")
          : "Site non renseigné");

      return priority({
        id: `coverage-${vacation.id}`,
        title: `${missing} poste${missing > 1 ? "s" : ""} a couvrir`,
        detail: `${label} - prise de service ${formatHour(toIso(vacation.data.startAt))}`,
        href: `/dashboard/planning?vacationId=${vacation.id}&panel=assign`,
        tone: assigned === 0 ? "critical" : "warning",
        actionLabel: "Affecter",
        rank: assigned === 0 ? 10 : 20,
      });
    }),
    ...criticalIncidents.slice(0, 4).map((incident) =>
      priority({
        id: `incident-${incident.id}`,
        title: text(incident.data.title) || "Incident critique",
        detail: `${text(incident.data.severity) || "high"} - ${incident.updatedAtIso ? "mis à jour " + formatHour(incident.updatedAtIso) : "à traiter"}`,
        href: `/dashboard/incidents/${incident.id}`,
        tone:
          text(incident.data.severity).toLowerCase() === "critical"
            ? "critical"
            : "warning",
        actionLabel: "Traiter",
        rank:
          text(incident.data.severity).toLowerCase() === "critical" ? 5 : 15,
      })
    ),
    ...complianceOpenDispatches.slice(0, 3).map((dispatch) =>
      priority({
        id: `compliance-${dispatch.id}`,
        title: "Forçage conformité à régulariser",
        detail:
          text(dispatch.data.agentName) ||
          agentName(agentsById.get(text(dispatch.data.agentId)), "Agent"),
        href: "/dashboard/conformite",
        tone: "warning",
        actionLabel: "Régulariser",
        rank: 30,
      })
    ),
    ...unacknowledgedDispatches.slice(0, 3).map((dispatch) =>
      priority({
        id: `ack-${dispatch.id}`,
        title: "Planning non accusé",
        detail: `${text(dispatch.data.agentName) || "Agent"} n'a pas confirme la réception.`,
        href: "/dashboard/planning",
        tone: "info",
        actionLabel: "Relancer",
        rank: 40,
      })
    ),
  ]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 8);

  if (priorities.length === 0) {
    priorities.push(
      priority({
        id: "all-clear",
        title: "Exploitation sous contrôle",
        detail: "Aucun blocage majeur détecté sur le planning du jour.",
        href: "/dashboard/planning",
        tone: "success",
        actionLabel: "Voir planning",
        rank: 100,
      })
    );
  }

  const vacationSiteLabel = (data: Record<string, unknown>) => {
    return (
      text(data.siteName) ||
      (text(data.siteId)
        ? siteName(sitesById.get(text(data.siteId)), "Site")
        : "Site non renseigné")
    );
  };

  const operationFeed = [
    ...uncoveredVacations.slice(0, 6).map((vacation) => {
      const required = requiredAgents(vacation.data);
      const assigned = safeArr(vacation.data.assignedAgentIds).length;
      const missing = Math.max(0, required - assigned);
      const startIso = toIso(vacation.data.startAt);

      return timelineItem({
        id: `feed-coverage-${vacation.id}`,
        kind: "coverage",
        title: `${missing} poste${missing > 1 ? "s" : ""} non couvert${missing > 1 ? "s" : ""}`,
        detail: `${vacationSiteLabel(vacation.data)} - debut ${formatHour(startIso)}`,
        timeIso: startIso,
        href: `/dashboard/planning?vacationId=${vacation.id}&panel=assign`,
        tone: assigned === 0 ? "critical" : "warning",
        actionLabel: "Affecter",
        rank: assigned === 0 ? 10 : 20,
      });
    }),
    ...upcomingStarts
      .sort((left, right) => {
        return (left.start?.getTime() ?? 0) - (right.start?.getTime() ?? 0);
      })
      .slice(0, 6)
      .map((vacation) => {
        const assignedIds = safeArr(vacation.data.assignedAgentIds);
        const firstAgentId = assignedIds[0] ?? "";
        const assignedLabel = firstAgentId
          ? agentName(agentsById.get(firstAgentId), "Agent")
          : "Aucun agent affecte";
        const startIso = toIso(vacation.data.startAt);

        return timelineItem({
          id: `feed-start-${vacation.id}`,
          kind: "start",
          title: "Prise de service imminente",
          detail: `${formatHour(startIso)} - ${vacationSiteLabel(vacation.data)} - ${assignedLabel}`,
          timeIso: startIso,
          href: `/dashboard/planning?vacationId=${vacation.id}`,
          tone: firstAgentId ? "info" : "critical",
          actionLabel: firstAgentId ? "Vérifier" : "Affecter",
          rank: firstAgentId ? 45 : 15,
        });
      }),
    ...criticalIncidents.slice(0, 5).map((incident) =>
      timelineItem({
        id: `feed-incident-${incident.id}`,
        kind: "incident",
        title: text(incident.data.title) || "Incident à traiter",
        detail: `${text(incident.data.severity) || "high"} - ${text(incident.data.siteName) || "site à vérifier"}`,
        timeIso: incident.updatedAtIso,
        href: `/dashboard/incidents/${incident.id}`,
        tone:
          text(incident.data.severity).toLowerCase() === "critical"
            ? "critical"
            : "warning",
        actionLabel: "Traiter",
        rank:
          text(incident.data.severity).toLowerCase() === "critical" ? 5 : 18,
      })
    ),
    ...complianceOpenDispatches.slice(0, 4).map((dispatch) =>
      timelineItem({
        id: `feed-compliance-${dispatch.id}`,
        kind: "compliance",
        title: "Forçage conformité ouvert",
        detail:
          text(dispatch.data.agentName) ||
          agentName(agentsById.get(text(dispatch.data.agentId)), "Agent"),
        timeIso: toIso(dispatch.data.sentAt) || text(dispatch.data.sentAtIso),
        href: "/dashboard/conformite",
        tone: "warning",
        actionLabel: "Régulariser",
        rank: 30,
      })
    ),
    ...unacknowledgedDispatches.slice(0, 4).map((dispatch) =>
      timelineItem({
        id: `feed-dispatch-${dispatch.id}`,
        kind: "dispatch",
        title: "Planning envoyé non accusé",
        detail: `${text(dispatch.data.agentName) || "Agent"} - relancée conseillee`,
        timeIso: toIso(dispatch.data.sentAt) || text(dispatch.data.sentAtIso),
        href: "/dashboard/planning",
        tone: "info",
        actionLabel: "Relancer",
        rank: 55,
      })
    ),
    ...modifiédVacations.slice(0, 4).map((vacation) =>
      timelineItem({
        id: `feed-publication-${vacation.id}`,
        kind: "publication",
        title: "Vacation a publiér",
        detail: `${vacationSiteLabel(vacation.data)} - ${formatHour(toIso(vacation.data.startAt))}`,
        timeIso: toIso(vacation.data.updatedAt) || toIso(vacation.data.startAt),
        href: `/dashboard/planning?vacationId=${vacation.id}`,
        tone: "info",
        actionLabel: "Publier",
        rank: 65,
      })
    ),
  ]
    .sort((left, right) => {
      const rankDelta = left.rank - right.rank;
      if (rankDelta !== 0) return rankDelta;
      const leftTime = left.timeIso ? Date.parse(left.timeIso) : 0;
      const rightTime = right.timeIso ? Date.parse(right.timeIso) : 0;
      return leftTime - rightTime;
    })
    .slice(0, 10);

  if (operationFeed.length === 0) {
    operationFeed.push(
      timelineItem({
        id: "feed-all-clear",
        kind: "all_clear",
        title: "Rien d'urgent sur la conduite de journee",
        detail: "Le planning, les diffusions et les alertes critiques sont sous contrôle.",
        timeIso: new Date().toISOString(),
        href: "/dashboard/planning",
        tone: "success",
        actionLabel: "Surveiller",
        rank: 100,
      })
    );
  }

  const signalStatesSnap = await adminDb
    .collection("operationSignalStates")
    .where("tenantId", "==", auth.tenantId)
    .limit(1000)
    .get();
  const signalStatesById = new Map(
    signalStatesSnap.docs.map((doc) => {
      const state = pickOperationSignalState(
        doc.data() as Record<string, unknown>,
        doc.id
      );
      return [state.signalId, state] as const;
    })
  );
  const operationFeedWithStates = operationFeed.map((item) => {
    const state = signalStatesById.get(item.id) ?? null;
    return {
      ...item,
      status: state?.status ?? ("new" as OperationSignalStatus),
      state,
    };
  });
  const operationSignalSummary = operationFeedWithStates.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    {
      new: 0,
      seen: 0,
      in_progress: 0,
      done: 0,
    } as Record<OperationSignalStatus, number>
  );

  const blockingScore =
    uncoveredPosts * 12 +
    criticalIncidents.length * 18 +
    complianceOpenDispatches.length * 8 +
    (coverageRate < 90 ? 15 : 0);
  const verdict =
    blockingScore >= 45 || uncoveredPosts >= 3 || criticalIncidents.length > 0
      ? "critical"
      : blockingScore >= 15 || coverageRate < 100
        ? "warning"
        : "ready";

  return json(200, {
    ok: true,
    generatedAtIso: new Date().toISOString(),
    window: {
      fromIso: todayStart.toISOString(),
      toIso: tomorrowStart.toISOString(),
      label: "Aujourd'hui",
    },
    verdict,
    headline:
      verdict === "critical"
        ? "Action immediate requise"
        : verdict === "warning"
          ? "Exploitation a surveiller"
          : "Exploitation sous contrôle",
    kpis: {
      coverageRate,
      todayVacations: todayVacations.length,
      requiredPosts,
      assignedPosts,
      uncoveredPosts,
      startsNextTwoHours,
      activeAgents: activeAgents.length,
      activeSites: activeSites.length,
      criticalIncidents: criticalIncidents.length,
      openIncidents: unresolvedIncidents.length,
      complianceToRegularize: complianceOpenDispatches.length,
      unacknowledgedDispatches: unacknowledgedDispatches.length,
      draftOrModifiedVacations: draftOrModified,
      prepayStatus,
    },
    priorities,
    operationFeed: operationFeedWithStates,
    operationSignalSummary,
    links: {
      planning: "/dashboard/planning",
      conformite: "/dashboard/conformite",
      prepaie: "/dashboard/prepaie",
      incidents: "/dashboard/incidents",
      agents: "/dashboard/agents",
    },
  });
}
