"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserPlus,
  Users,
} from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type VacationRow = {
  id: string;
  siteId?: string | null;
  siteName?: string | null;
  status?: "planned" | "partially_filled" | "filled" | "closed" | "cancelled";
  requiredAgents?: number;
  assignedAgentIds?: string[];
  startAtIso?: string | null;
  endAtIso?: string | null;
  requiredQualification?: string | null;
};

type IncidentRow = {
  id: string;
  title?: string | null;
  status?: "open" | "investigating" | "resolved" | "closed";
  severity?: "low" | "medium" | "high" | "critical";
  siteId?: string | null;
  vacationId?: string | null;
  createdAtIso?: string | null;
  updatedAtIso?: string | null;
};

type SiteRow = {
  id: string;
  name?: string | null;
  agentIds?: string[];
};

type AgentRow = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  status?: "active" | "inactive";
  qualifications?: string[];
};

type AssignmentRow = {
  id: string;
  vacationId?: string | null;
  siteId?: string | null;
  agentId?: string | null;
  status?: "assigned" | "cancelled" | "present" | "absent" | "replaced" | "completed" | "late";
  checkedInAtIso?: string | null;
  updatedAtIso?: string | null;
};

type UrgencyItem = {
  id: string;
  href: string;
  label: string;
  detail: string;
  actionLabel: string;
  tone: "critical" | "warning" | "info";
};

type ReplacementSuggestion = {
  id: string;
  name: string;
  qualificationMatch: boolean;
  siteQualified: boolean;
};

type ReplacementCard = {
  id: string;
  href: string;
  siteName: string;
  startsAtLabel: string;
  missingCount: number;
  suggestionCount: number;
  suggestions: ReplacementSuggestion[];
};

type TensionSite = {
  id: string;
  href: string;
  name: string;
  uncoveredPosts: number;
  partialVacations: number;
  openIncidents: number;
  score: number;
};

type MissingCheckInCard = {
  id: string;
  href: string;
  siteName: string;
  agentName: string;
  startsAtLabel: string;
  lateMinutes: number;
};

type CriticalIncidentCard = {
  id: string;
  href: string;
  actionLabel: string;
  title: string;
  siteName: string;
  severityLabel: string;
  freshnessLabel: string;
  statusLabel: string;
  tensionScore: number;
  tone: "critical" | "warning";
};

type OperationsOverviewProps = {
  activeSitesCount: number;
};

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

function formatHour(iso?: string | null) {
  if (!iso) return "Heure inconnue";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Heure inconnue";

  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRecency(iso?: string | null) {
  if (!iso) return "Horodatage indisponible";
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return "Horodatage indisponible";

  const deltaMinutes = Math.max(0, Math.round((Date.now() - value) / (60 * 1000)));

  if (deltaMinutes < 1) return "À l'instant";
  if (deltaMinutes < 60) return `Il y a ${deltaMinutes} min`;

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `Il y a ${deltaHours} h`;

  const deltaDays = Math.round(deltaHours / 24);
  return `Il y a ${deltaDays} j`;
}

function incidentStatusLabel(status?: IncidentRow["status"]) {
  switch (status) {
    case "investigating":
      return "En investigation";
    case "resolved":
      return "Résolu";
    case "closed":
      return "Clôturé";
    case "open":
    default:
      return "Ouvert";
  }
}

function severityLabel(severity?: IncidentRow["severity"]) {
  switch (severity) {
    case "critical":
      return "Critique";
    case "high":
      return "Élevée";
    case "medium":
      return "Moyenne";
    case "low":
      return "Faible";
    default:
      return "À qualifier";
  }
}

function toAgentName(agent: AgentRow) {
  const fullName = [agent.firstName, agent.lastName].filter(Boolean).join(" ").trim();
  return fullName || "Agent disponible";
}

function overlapsWindow(a: VacationRow, b: VacationRow) {
  const aStart = a.startAtIso ? Date.parse(a.startAtIso) : NaN;
  const aEnd = a.endAtIso ? Date.parse(a.endAtIso) : NaN;
  const bStart = b.startAtIso ? Date.parse(b.startAtIso) : NaN;
  const bEnd = b.endAtIso ? Date.parse(b.endAtIso) : NaN;

  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return false;
  return aStart < bEnd && aEnd > bStart;
}

export function OperationsOverview({
  activeSitesCount,
}: OperationsOverviewProps) {
  const [vacations, setVacations] = useState<VacationRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadOperations() {
      setLoading(true);
      setError(null);

      try {
        const from = startOfToday().toISOString();
        const to = startOfTomorrow().toISOString();

        const [vacationsRes, incidentsRes, sitesRes, agentsRes] = await Promise.all([
          apiFetch<{ ok: boolean; vacations?: VacationRow[] }>(
            `/api/vacations?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&max=200`
          ),
          apiFetch<{ ok: boolean; incidents?: IncidentRow[] }>(
            "/api/incidents?max=20"
          ),
          apiFetch<{ ok: boolean; sites?: SiteRow[] }>(
            "/api/sites?max=200&isActive=true"
          ),
          apiFetch<{ ok: boolean; agents?: AgentRow[] }>(
            "/api/agents?max=200&status=active"
          ),
        ]);

        if (!mounted) return;

        const vacationIds = (vacationsRes.vacations ?? [])
          .map((vacation) => vacation.id)
          .filter(Boolean);

        let assignmentsRes: { ok: boolean; assignments?: AssignmentRow[] } | null = null;

        if (vacationIds.length > 0) {
          assignmentsRes = await apiFetch<{ ok: boolean; assignments?: AssignmentRow[] }>(
            `/api/assignments?vacationIds=${encodeURIComponent(vacationIds.join(","))}`
          );
        }

        setVacations(vacationsRes.vacations ?? []);
        setIncidents(incidentsRes.incidents ?? []);
        setSites(sitesRes.sites ?? []);
        setAgents(agentsRes.agents ?? []);
        setAssignments(assignmentsRes?.assignments ?? []);
      } catch (err: unknown) {
        if (!mounted) return;
        setError(
          err instanceof Error
            ? err.message
            : "Impossible de charger la vue exploitation."
        );
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    loadOperations();
    const timer = window.setInterval(loadOperations, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const sitesById = new Map(sites.map((site) => [site.id, site]));
    const vacationsById = new Map(vacations.map((vacation) => [vacation.id, vacation]));
    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
    const activeAgents = agents.filter((agent) => agent.status !== "inactive");

    const activeVacations = vacations.filter(
      (vacation) =>
        vacation.status !== "closed" && vacation.status !== "cancelled"
    );

    const unresolvedIncidents = incidents.filter(
      (incident) =>
        incident.status !== "resolved" && incident.status !== "closed"
    );

    const criticalIncidents = unresolvedIncidents.filter(
      (incident) =>
        incident.severity === "critical" || incident.severity === "high"
    );

    const uncovered = activeVacations.filter(
      (vacation) => (vacation.assignedAgentIds?.length ?? 0) === 0
    );

    const partial = activeVacations.filter((vacation) => {
      const assigned = vacation.assignedAgentIds?.length ?? 0;
      const required = vacation.requiredAgents ?? 1;
      return assigned > 0 && assigned < required;
    });

    const startingSoon = activeVacations.filter((vacation) => {
      if (!vacation.startAtIso) return false;
      const start = new Date(vacation.startAtIso);
      return (
        Number.isFinite(start.getTime()) &&
        start >= now &&
        start <= soonThreshold
      );
    });

    const totalRequired = activeVacations.reduce(
      (sum, vacation) => sum + Math.max(vacation.requiredAgents ?? 1, 1),
      0
    );
    const totalAssigned = activeVacations.reduce((sum, vacation) => {
      const assigned = vacation.assignedAgentIds?.length ?? 0;
      const required = Math.max(vacation.requiredAgents ?? 1, 1);
      return sum + Math.min(assigned, required);
    }, 0);

    const coverageRate =
      totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 100;

    const urgentVacations = [...uncovered, ...partial]
      .sort((a, b) => {
        const aTime = a.startAtIso ? Date.parse(a.startAtIso) : Number.MAX_SAFE_INTEGER;
        const bTime = b.startAtIso ? Date.parse(b.startAtIso) : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 5);

    const fieldEscalations: UrgencyItem[] = assignments
      .filter(
        (assignment) =>
          assignment.status === "absent" || assignment.status === "late"
      )
      .map((assignment) => {
        const vacation = assignment.vacationId
          ? vacationsById.get(assignment.vacationId)
          : undefined;
        const agent = assignment.agentId
          ? agentsById.get(assignment.agentId)
          : undefined;
        const site =
          assignment.siteId || vacation?.siteId
            ? sitesById.get(assignment.siteId ?? vacation?.siteId ?? "")
            : undefined;

        const agentName = agent ? toAgentName(agent) : "Agent à confirmer";
        const siteName =
          vacation?.siteName ?? site?.name ?? "Site non renseigné";

        return {
          id: `assignment-${assignment.id}`,
          href: assignment.vacationId
            ? `/dashboard/planning?vacationId=${assignment.vacationId}&panel=assign`
            : "/dashboard/planning",
          label:
            assignment.status === "absent"
              ? `${agentName} absent`
              : `${agentName} en retard`,
          detail:
            assignment.status === "absent"
              ? `${siteName} • absence confirmée sur la mission en cours`
              : `${siteName} • prise de service en retard à traiter`,
          actionLabel:
            assignment.status === "absent"
              ? "Lancer le remplacement"
              : "Réaffecter la mission",
          tone: assignment.status === "absent" ? "critical" : "warning",
        } satisfies UrgencyItem;
      })
      .sort((a, b) => {
        if (a.tone !== b.tone) {
          return a.tone === "critical" ? -1 : 1;
        }
        return a.label.localeCompare(b.label, "fr");
      })
      .slice(0, 3);

    const urgencyItems: UrgencyItem[] = [
      ...fieldEscalations,
      ...criticalIncidents.slice(0, 3).map(
        (incident) =>
          ({
            id: `incident-${incident.id}`,
            href: `/dashboard/incidents/${incident.id}`,
            label: incident.title ?? "Incident critique",
            detail: `${severityLabel(incident.severity)} • traitement immédiat recommandé`,
            actionLabel: "Ouvrir l'incident",
            tone: incident.severity === "critical" ? "critical" : "warning",
          }) satisfies UrgencyItem
      ),
      ...urgentVacations.map((vacation) => {
        const assigned = vacation.assignedAgentIds?.length ?? 0;
        const required = Math.max(vacation.requiredAgents ?? 1, 1);
        const missing = Math.max(required - assigned, 0);
        const isCritical = assigned === 0;

        return {
          id: `vacation-${vacation.id}`,
          href: `/dashboard/planning?vacationId=${vacation.id}&panel=assign`,
          label: vacation.siteName ?? "Vacation à couvrir",
          detail: `${formatHour(vacation.startAtIso)} • ${missing} poste${missing > 1 ? "s" : ""} à pourvoir`,
          actionLabel: "Ouvrir le planning",
          tone: isCritical ? "critical" : "warning",
        } satisfies UrgencyItem;
      }),
    ].slice(0, 6);

    const replacementCards: ReplacementCard[] = urgentVacations.slice(0, 3).map((vacation) => {
      const assignedIds = new Set(vacation.assignedAgentIds ?? []);
      const required = Math.max(vacation.requiredAgents ?? 1, 1);
      const missingCount = Math.max(required - assignedIds.size, 0);
      const site = vacation.siteId ? sitesById.get(vacation.siteId) : null;
      const allowedAgentIds =
        site && Array.isArray(site.agentIds) && site.agentIds.length > 0
          ? new Set(site.agentIds)
          : null;

      const suggestions = activeAgents
        .filter((agent) => {
          if (!agent.id || assignedIds.has(agent.id)) return false;
          if (allowedAgentIds && !allowedAgentIds.has(agent.id)) return false;

          const hasOverlap = activeVacations.some(
            (otherVacation) =>
              otherVacation.id !== vacation.id &&
              overlapsWindow(vacation, otherVacation) &&
              (otherVacation.assignedAgentIds ?? []).includes(agent.id)
          );

          return !hasOverlap;
        })
        .map((agent) => {
          const qualifications = agent.qualifications ?? [];
          const requiredQualification = vacation.requiredQualification?.trim();
          const qualificationMatch = requiredQualification
            ? qualifications.includes(requiredQualification)
            : false;

          return {
            id: agent.id,
            name: toAgentName(agent),
            qualificationMatch,
            siteQualified: allowedAgentIds ? allowedAgentIds.has(agent.id) : true,
          } satisfies ReplacementSuggestion;
        })
        .sort((a, b) => {
          if (Number(b.qualificationMatch) !== Number(a.qualificationMatch)) {
            return Number(b.qualificationMatch) - Number(a.qualificationMatch);
          }
          if (Number(b.siteQualified) !== Number(a.siteQualified)) {
            return Number(b.siteQualified) - Number(a.siteQualified);
          }
          return a.name.localeCompare(b.name, "fr");
        });

      return {
        id: vacation.id,
        href: `/dashboard/planning?vacationId=${vacation.id}&panel=assign`,
        siteName: vacation.siteName ?? site?.name ?? "Site non renseigné",
        startsAtLabel: formatHour(vacation.startAtIso),
        missingCount,
        suggestionCount: suggestions.length,
        suggestions: suggestions.slice(0, 3),
      } satisfies ReplacementCard;
    });

    const missingCheckIns: MissingCheckInCard[] = assignments
      .filter((assignment) => assignment.status === "assigned" && assignment.agentId)
      .map((assignment) => {
        const vacation = assignment.vacationId
          ? vacationsById.get(assignment.vacationId)
          : undefined;

        if (!vacation?.startAtIso) return null;

        const startMs = Date.parse(vacation.startAtIso);
        if (!Number.isFinite(startMs) || startMs > now.getTime()) return null;

        const lateMinutes = Math.max(
          0,
          Math.round((now.getTime() - startMs) / (60 * 1000))
        );
        const agent = assignment.agentId ? agentsById.get(assignment.agentId) : undefined;
        const site = vacation.siteId ? sitesById.get(vacation.siteId) : null;

        return {
          id: assignment.id,
          href: assignment.vacationId
            ? `/dashboard/planning?vacationId=${assignment.vacationId}`
            : "/dashboard/planning",
          siteName: vacation.siteName ?? site?.name ?? "Site non renseigné",
          agentName: agent ? toAgentName(agent) : "Agent à confirmer",
          startsAtLabel: formatHour(vacation.startAtIso),
          lateMinutes,
        } satisfies MissingCheckInCard;
      })
      .filter((item): item is MissingCheckInCard => item !== null)
      .sort((a, b) => b.lateMinutes - a.lateMinutes)
      .slice(0, 4);

    const tensionSites: TensionSite[] = Array.from(
      activeVacations.reduce((acc, vacation) => {
        const siteId = vacation.siteId ?? `unknown-${vacation.id}`;
        const siteName =
          vacation.siteName ??
          (vacation.siteId ? sitesById.get(vacation.siteId)?.name : null) ??
          "Site non renseigné";
        const assigned = vacation.assignedAgentIds?.length ?? 0;
        const required = Math.max(vacation.requiredAgents ?? 1, 1);
        const uncoveredPosts = Math.max(required - assigned, 0);
        const partialVacations = assigned > 0 && assigned < required ? 1 : 0;

        const current = acc.get(siteId) ?? {
          id: siteId,
          href: vacation.siteId
            ? `/dashboard/sites/${vacation.siteId}`
            : "/dashboard/sites",
          name: siteName,
          uncoveredPosts: 0,
          partialVacations: 0,
          openIncidents: 0,
          score: 0,
        };

        current.uncoveredPosts += uncoveredPosts;
        current.partialVacations += partialVacations;
        current.score += uncoveredPosts * 3 + partialVacations * 2;

        acc.set(siteId, current);
        return acc;
      }, new Map<string, TensionSite>())
    )
      .map(([siteId, site]) => {
        const openIncidents = unresolvedIncidents.filter(
          (incident) => incident.siteId && incident.siteId === siteId
        ).length;

        return {
          ...site,
          openIncidents,
          score: site.score + openIncidents * 2,
        } satisfies TensionSite;
      })
      .filter((site) => site.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const tensionScoreBySite = new Map(
      tensionSites.map((site) => [site.id, site.score])
    );

    const criticalIncidentCards: CriticalIncidentCard[] = criticalIncidents
      .map((incident) => {
        const site = incident.siteId ? sitesById.get(incident.siteId) : null;
        const siteName = site?.name ?? "Site non renseigné";
        const tone = incident.severity === "critical" ? "critical" : "warning";

        return {
          id: incident.id,
          href: incident.vacationId
            ? `/dashboard/planning?vacationId=${incident.vacationId}&panel=assign`
            : `/dashboard/incidents/${incident.id}`,
          actionLabel: incident.vacationId
            ? "Coordonner la réponse"
            : "Ouvrir l'incident",
          title: incident.title ?? "Incident critique",
          siteName,
          severityLabel: severityLabel(incident.severity),
          freshnessLabel: formatRecency(
            incident.updatedAtIso ?? incident.createdAtIso
          ),
          statusLabel: incidentStatusLabel(incident.status),
          tensionScore: incident.siteId
            ? tensionScoreBySite.get(incident.siteId) ?? 0
            : 0,
          tone,
        } satisfies CriticalIncidentCard;
      })
      .sort((left, right) => {
        if (left.tone !== right.tone) {
          return left.tone === "critical" ? -1 : 1;
        }
        if (right.tensionScore !== left.tensionScore) {
          return right.tensionScore - left.tensionScore;
        }
        return left.title.localeCompare(right.title, "fr");
      })
      .slice(0, 4);

    return {
      activeVacationsCount: activeVacations.length,
      unresolvedIncidentsCount: unresolvedIncidents.length,
      criticalIncidentsCount: criticalIncidents.length,
      fieldEscalationsCount: fieldEscalations.length,
      uncoveredCount: uncovered.length,
      partialCount: partial.length,
      startingSoonCount: startingSoon.length,
      coverageRate,
      urgencyItems,
      missingCheckIns,
      replacementCards,
      tensionSites,
      criticalIncidentCards,
    };
  }, [agents, assignments, incidents, sites, vacations]);

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }, (_, index) => (
              <div
                key={`ops-skeleton-${index}`}
                className="rounded-[2rem] glass-card p-6"
              >
                <Skeleton className="h-4 w-32 rounded-full" />
                <Skeleton className="mt-4 h-10 w-20 rounded-xl" />
                <Skeleton className="mt-3 h-4 w-40 rounded-full" />
              </div>
            ))
          : [
              {
                label: "Incidents ouverts",
                value: summary.unresolvedIncidentsCount,
                hint: `${summary.criticalIncidentsCount} critiques ou élevés`,
                icon: Siren,
                tone: summary.criticalIncidentsCount > 0 ? "critical" : "info",
              },
              {
                label: "Vacations du jour",
                value: summary.activeVacationsCount,
                hint: `${summary.startingSoonCount} démarrent sous 2h`,
                icon: CalendarClock,
                tone: "info",
              },
              {
                label: "Postes à couvrir",
                value: summary.uncoveredCount + summary.partialCount,
                hint: `${summary.uncoveredCount} non couverts, ${summary.partialCount} partiels`,
                icon: Users,
                tone:
                  summary.uncoveredCount > 0
                    ? "critical"
                    : summary.partialCount > 0
                      ? "warning"
                      : "info",
              },
              {
                label: "Couverture active",
                value: summary.coverageRate,
                hint: `${activeSitesCount} sites actifs supervisés`,
                icon: CheckCircle2,
                suffix: "%",
                tone: summary.coverageRate < 85 ? "warning" : "info",
              },
            ].map((item) => (
              <div
                key={item.label}
                className={cn(
                  "rounded-[2rem] border p-6 transition-all duration-300",
                  item.tone === "critical"
                    ? "border-destructive/20 bg-destructive/5"
                    : item.tone === "warning"
                      ? "border-orange-500/20 bg-orange-500/5"
                      : "glass-card border-none"
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground/60">
                      {item.label}
                    </p>
                    <p className="mt-3 text-4xl font-black tracking-tighter text-foreground">
                      {item.value}
                      {"suffix" in item && item.suffix ? item.suffix : ""}
                    </p>
                    <p className="mt-3 text-xs font-bold text-muted-foreground/60">
                      {item.hint}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl p-3",
                      item.tone === "critical"
                        ? "bg-destructive/10 text-destructive"
                        : item.tone === "warning"
                          ? "bg-orange-500/10 text-orange-600"
                          : "bg-primary/10 text-primary"
                    )}
                  >
                    <item.icon className="h-6 w-6" />
                  </div>
                </div>
              </div>
            ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <div className="rounded-[2.5rem] glass-card p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black tracking-tight">
                  Urgences opérationnelles
                </h2>
                <Badge
                  className={cn(
                    "border-none px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]",
                    summary.urgencyItems.length > 0
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary"
                  )}
                >
                  {summary.urgencyItems.length > 0 ? "Action requise" : "Sous contrôle"}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
                Priorités du jour pour éviter les trous de couverture et traiter les incidents sensibles.
              </p>
            </div>

            <Button
              asChild
              variant="outline"
              className="h-11 rounded-2xl border-border/20 bg-background/40 px-5 font-black text-[10px] uppercase tracking-[0.2em]"
            >
              <Link href="/dashboard/planning">
                Ouvrir le planning
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-6 space-y-3">
            {loading ? (
              Array.from({ length: 4 }, (_, index) => (
                <Skeleton
                  key={`urgency-skeleton-${index}`}
                  className="h-20 rounded-[1.5rem]"
                />
              ))
            ) : error ? (
              <div className="rounded-[1.5rem] border border-destructive/20 bg-destructive/5 p-5 text-sm font-semibold text-destructive">
                {error}
              </div>
            ) : summary.urgencyItems.length === 0 ? (
              <div className="rounded-[1.75rem] border border-primary/10 bg-primary/5 p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">
                      Aucun point bloquant
                    </p>
                    <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
                      Là journee est couverte et aucun incident prioritaire n&apos;exige une action immediate.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              summary.urgencyItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between gap-4 rounded-[1.75rem] border p-5 transition-all duration-300 hover:-translate-y-0.5",
                    item.tone === "critical"
                      ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                      : item.tone === "warning"
                        ? "border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10"
                        : "border-border/40 bg-background/40 hover:bg-background/70"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        "rounded-2xl p-3",
                        item.tone === "critical"
                          ? "bg-destructive/10 text-destructive"
                          : item.tone === "warning"
                            ? "bg-orange-500/10 text-orange-600"
                            : "bg-primary/10 text-primary"
                      )}
                    >
                      {item.tone === "critical" ? (
                        <ShieldAlert className="h-5 w-5" />
                      ) : (
                        <AlertTriangle className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-black tracking-tight text-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground/70">
                        {item.detail}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                      {item.actionLabel}
                    </p>
                    <ArrowRight className="ml-auto mt-2 h-4 w-4 text-primary" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2.5rem] glass-card p-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black tracking-tight">
                Couverture du jour
              </h2>
              <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
                Répartition des vacations actives et niveau de tension opérationnelle.
              </p>
            </div>
            <Clock3 className="h-6 w-6 text-primary" />
          </div>

          <div className="mt-6 space-y-5">
            {[
              {
                label: "Couvertes",
                value:
                  summary.activeVacationsCount -
                  summary.uncoveredCount -
                  summary.partialCount,
                total: summary.activeVacationsCount,
                color: "bg-primary",
              },
              {
                label: "Partiellement couvertes",
                value: summary.partialCount,
                total: summary.activeVacationsCount,
                color: "bg-orange-500",
              },
              {
                label: "Non couvertes",
                value: summary.uncoveredCount,
                total: summary.activeVacationsCount,
                color: "bg-destructive",
              },
            ].map((item) => {
              const percent =
                item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;

              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm font-bold">
                    <span>{item.label}</span>
                    <span className="text-muted-foreground/70">
                      {item.value} / {item.total || 0}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted/30">
                    <div
                      className={cn("h-full rounded-full transition-all", item.color)}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-[1.75rem] border border-border/30 bg-background/40 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                  Décision rapide
                </p>
                <p className="mt-2 text-sm font-semibold text-muted-foreground/80">
                  Priorité immédiate : traiter les vacations non couvertes et les incidents critiques.
                </p>
              </div>
              <Button
                asChild
                size="sm"
                className="h-11 rounded-2xl px-5 font-black"
              >
                <Link href="/dashboard/incidents">
                  Main courante
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[2.5rem] glass-card p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight">
                Prises de service à confirmer
              </h2>
              <Badge className="border-none bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">
                Contrôle terrain
              </Badge>
            </div>
            <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
              Les agents affectes dont la prise de service n&apos;est pas encore confirmee.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            className="h-11 rounded-2xl border-border/20 bg-background/40 px-5 font-black text-[10px] uppercase tracking-[0.2em]"
          >
            <Link href="/dashboard/planning">
              Vérifier le planning
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <div
                key={`checkin-skeleton-${index}`}
                className="rounded-[1.75rem] border border-border/30 bg-background/30 p-5"
              >
                <Skeleton className="h-5 w-32 rounded-full" />
                <Skeleton className="mt-4 h-12 w-full rounded-2xl" />
                <Skeleton className="mt-3 h-5 w-24 rounded-full" />
              </div>
            ))
          ) : error ? (
            <div className="md:col-span-2 xl:col-span-4 rounded-[1.5rem] border border-destructive/20 bg-destructive/5 p-5 text-sm font-semibold text-destructive">
              {error}
            </div>
          ) : summary.missingCheckIns.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-4 rounded-[1.75rem] border border-primary/10 bg-primary/5 p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">
                    Tous les points clés sont confirmés
                  </p>
                  <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
                    Aucun agent démarre n&apos;apparaît en attente de pointage sur les vacations suivies.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            summary.missingCheckIns.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="rounded-[1.75rem] border border-border/30 bg-background/30 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-500/20 hover:bg-orange-500/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black tracking-tight text-foreground">
                      {item.agentName}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground/70">
                      {item.siteName}
                    </p>
                  </div>
                  <Badge className="border-none bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">
                    +{item.lateMinutes} min
                  </Badge>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/50 px-4 py-3 text-sm font-bold">
                    <span>Debut prevu</span>
                    <span>{item.startsAtLabel}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/50 px-4 py-3 text-sm font-bold">
                    <span>Statut</span>
                    <span className="text-orange-600">Pointage attendu</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-muted-foreground/70">
                    Vérifier la situation avec le site ou l&apos;agent concerné.
                  </p>
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="rounded-[2.5rem] glass-card p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight">
                Incidents critiques à arbitrer
              </h2>
              <Badge className="border-none bg-destructive/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-destructive">
                Arbitrage exploitation
              </Badge>
            </div>
            <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
              Les incidents prioritaires classés par gravité, fraîcheur et tension
              opérationnelle du site.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            className="h-11 rounded-2xl border-border/20 bg-background/40 px-5 font-black text-[10px] uppercase tracking-[0.2em]"
          >
            <Link href="/dashboard/incidents">
              Voir la main courante
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <div
                key={`critical-incident-skeleton-${index}`}
                className="rounded-[1.75rem] border border-border/30 bg-background/30 p-5"
              >
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="mt-4 h-12 w-full rounded-2xl" />
                <Skeleton className="mt-3 h-5 w-24 rounded-full" />
              </div>
            ))
          ) : error ? (
            <div className="rounded-[1.5rem] border border-destructive/20 bg-destructive/5 p-5 text-sm font-semibold text-destructive md:col-span-2 xl:col-span-4">
              {error}
            </div>
          ) : summary.criticalIncidentCards.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-4">
              <div className="rounded-[1.75rem] border border-primary/10 bg-primary/5 p-6">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">
                      Aucun incident critique à arbitrer
                    </p>
                    <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
                      Les incidents ouverts ne nécessitent pas d&apos;arbitrage
                      immédiat à ce niveau.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            summary.criticalIncidentCards.map((incident) => (
              <Link
                key={incident.id}
                href={incident.href}
                className={cn(
                  "rounded-[1.75rem] border p-5 transition-all duration-300 hover:-translate-y-0.5",
                  incident.tone === "critical"
                    ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                    : "border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black tracking-tight text-foreground">
                      {incident.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground/70">
                      {incident.siteName}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "border-none px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]",
                      incident.tone === "critical"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-orange-500/10 text-orange-600"
                    )}
                  >
                    {incident.severityLabel}
                  </Badge>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/50 px-4 py-3 text-sm font-bold">
                    <span>Statut</span>
                    <span>{incident.statusLabel}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/50 px-4 py-3 text-sm font-bold">
                    <span>Fraîcheur</span>
                    <span>{incident.freshnessLabel}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/50 px-4 py-3 text-sm font-bold">
                    <span>Tension du site</span>
                    <span className="text-primary">{incident.tensionScore}</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-muted-foreground/70">
                    Prioriser ce dossier avant qu&apos;il ne dégrade l&apos;exploitation du site.
                  </p>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                      {incident.actionLabel}
                    </p>
                    <ArrowRight className="ml-auto mt-2 h-4 w-4 text-primary" />
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="rounded-[2.5rem] glass-card p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight">
                Sites en tension
              </h2>
              <Badge className="border-none bg-destructive/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-destructive">
                Priorité exploitation
              </Badge>
            </div>
            <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
              Les sites qui concentrent les trous de couverture et les incidents ouverts.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            className="h-11 rounded-2xl border-border/20 bg-background/40 px-5 font-black text-[10px] uppercase tracking-[0.2em]"
          >
            <Link href="/dashboard/sites">
              Voir tous les sites
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <div
                key={`tension-skeleton-${index}`}
                className="rounded-[1.75rem] border border-border/30 bg-background/30 p-5"
              >
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="mt-4 h-12 w-full rounded-2xl" />
                <Skeleton className="mt-3 h-5 w-32 rounded-full" />
              </div>
            ))
          ) : error ? (
            <div className="md:col-span-2 xl:col-span-4 rounded-[1.5rem] border border-destructive/20 bg-destructive/5 p-5 text-sm font-semibold text-destructive">
              {error}
            </div>
          ) : summary.tensionSites.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-4 rounded-[1.75rem] border border-primary/10 bg-primary/5 p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">
                    Aucun site sous pression
                  </p>
                  <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
                    Aucun site n&apos;accumule actuellement de deficit de couverture ou d&apos;incident ouvert significatif.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            summary.tensionSites.map((site) => (
              <Link
                key={site.id}
                href={site.href}
                className="rounded-[1.75rem] border border-border/30 bg-background/30 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-destructive/20 hover:bg-destructive/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black tracking-tight text-foreground">
                      {site.name}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground/70">
                      Score de tension {site.score}
                    </p>
                  </div>
                  <Badge className="border-none bg-destructive/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-destructive">
                    Sous surveillance
                  </Badge>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/50 px-4 py-3 text-sm font-bold">
                    <span>Postes manquants</span>
                    <span className="text-destructive">{site.uncoveredPosts}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/50 px-4 py-3 text-sm font-bold">
                    <span>Vacations partielles</span>
                    <span className="text-orange-600">{site.partialVacations}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-background/50 px-4 py-3 text-sm font-bold">
                    <span>Incidents ouverts</span>
                    <span className="text-primary">{site.openIncidents}</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-muted-foreground/70">
                    Ouvrir la fiche site pour arbitrer rapidement.
                  </p>
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="rounded-[2.5rem] glass-card p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight">
                Remplacements rapides
              </h2>
              <Badge className="border-none bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                Action terrain
              </Badge>
            </div>
            <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
              Suggestions immédiates pour combler les vacations en tension sans quitter le dashboard.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            className="h-11 rounded-2xl border-border/20 bg-background/40 px-5 font-black text-[10px] uppercase tracking-[0.2em]"
          >
            <Link href="/dashboard/planning">
              Vue planning complète
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {loading ? (
            Array.from({ length: 3 }, (_, index) => (
              <div
                key={`replacement-skeleton-${index}`}
                className="rounded-[1.75rem] border border-border/30 bg-background/30 p-5"
              >
                <Skeleton className="h-5 w-32 rounded-full" />
                <Skeleton className="mt-4 h-10 w-full rounded-2xl" />
                <Skeleton className="mt-3 h-16 w-full rounded-2xl" />
              </div>
            ))
          ) : error ? (
            <div className="xl:col-span-3 rounded-[1.5rem] border border-destructive/20 bg-destructive/5 p-5 text-sm font-semibold text-destructive">
              {error}
            </div>
          ) : summary.replacementCards.length === 0 ? (
            <div className="xl:col-span-3 rounded-[1.75rem] border border-primary/10 bg-primary/5 p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-primary">
                    Aucun remplacement requis
                  </p>
                  <p className="mt-2 text-sm font-semibold text-muted-foreground/70">
                    Les vacations critiques du jour sont déjà couvertes ou ne nécessitent aucune réaffectation.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            summary.replacementCards.map((card) => (
              <div
                key={card.id}
                className="rounded-[1.75rem] border border-border/30 bg-background/30 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-black tracking-tight text-foreground">
                      {card.siteName}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-muted-foreground/70">
                      Début {card.startsAtLabel} • {card.missingCount} poste{card.missingCount > 1 ? "s" : ""} à pourvoir
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "border-none px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]",
                      card.missingCount > 1
                        ? "bg-destructive/10 text-destructive"
                        : "bg-orange-500/10 text-orange-600"
                    )}
                  >
                    {card.suggestionCount > 0
                      ? `${card.suggestionCount} suggestion${card.suggestionCount > 1 ? "s" : ""}`
                      : "A traiter"}
                  </Badge>
                </div>

                <div className="mt-5 space-y-3">
                  {card.suggestions.length > 0 ? (
                    card.suggestions.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="rounded-2xl border border-border/30 bg-background/50 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                              <UserPlus className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-black tracking-tight text-foreground">
                                {suggestion.name}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-2">
                                <Badge className="border-none bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                                  Disponible
                                </Badge>
                                {suggestion.siteQualified && (
                                  <Badge className="border-none bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">
                                    Habilité site
                                  </Badge>
                                )}
                                {suggestion.qualificationMatch && (
                                  <Badge className="border-none bg-orange-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-orange-600">
                                    Qualification OK
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
                      Aucun agent compatible n&apos;est libre sur ce creneau. Une escalade planning est recommandee.
                    </div>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-muted-foreground/70">
                    Priorisez cette vacation avant son heure de prise de service.
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className="h-10 rounded-2xl px-4 font-black"
                  >
                    <Link href={card.href}>
                      Affecter
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
