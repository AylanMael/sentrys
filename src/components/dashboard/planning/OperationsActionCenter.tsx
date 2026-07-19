"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck2,
  CheckCircle2,
  ClockAlert,
  Eye,
  MapPinOff,
  Send,
  ShieldAlert,
  UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { usePlanning, type VacationApiItem } from "./PlanningContext";

type ActionTone = "red" | "amber" | "emerald" | "sky";

interface ActionItem {
  id: string;
  priority: number;
  tone: ActionTone;
  icon: LucideIcon;
  title: string;
  description: string;
  meta: string;
  actionLabel: string;
  onAction: () => void;
  busyVacationId?: string;
}

const toneClasses: Record<ActionTone, string> = {
  red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  emerald:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const actionButtonClasses: Record<ActionTone, string> = {
  red: "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white",
  amber:
    "border-amber-600 bg-amber-600 text-white hover:bg-amber-700 hover:text-white",
  emerald:
    "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white",
  sky: "border-sky-600 bg-sky-600 text-white hover:bg-sky-700 hover:text-white",
};

function activeOnly(vacation: VacationApiItem) {
  return vacation.status !== "cancelled" && vacation.status !== "closed";
}

function missingAgents(vacation: VacationApiItem) {
  const required = Math.max(0, Number(vacation.requiredAgents ?? 1));
  const assigned = Array.isArray(vacation.assignedAgentIds)
    ? vacation.assignedAgentIds.length
    : 0;

  return Math.max(0, required - assigned);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "date a confirmer";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "date a confirmer";

  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getVacationLabel(vacation: VacationApiItem) {
  return (
    vacation.title ||
    vacation.missionType ||
    vacation.siteName ||
    "Vacation sans libelle"
  );
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function intervalOverlaps(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined
) {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  const startA = Date.parse(aStart);
  const endA = Date.parse(aEnd);
  const startB = Date.parse(bStart);
  const endB = Date.parse(bEnd);

  if (
    !Number.isFinite(startA) ||
    !Number.isFinite(endA) ||
    !Number.isFinite(startB) ||
    !Number.isFinite(endB)
  ) {
    return false;
  }

  return startA < endB && endA > startB;
}

export const OperationsActionCenter: React.FC = () => {
  const {
    vacations,
    filteredVacations,
    conflictIndex,
    stats,
    sites,
    agents,
    siteId,
    range,
    setActiveVacationId,
    setAssignOpen,
    setReplaceOpen,
    setDétailsOpen,
    setMode,
    setSiteId,
    setAgentId,
    setSortByUrgency,
    setTensionMode,
    setSelectedIds,
    setValidationOpen,
    publishRange,
    updateVacation,
  } = usePlanning();
  const { toast } = useToast();

  const [publishing, setPublishing] = React.useState(false);
  const [assigningId, setAssigningId] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const agentLabel = React.useCallback(
    (agentId: string) => {
      const agent = agents.find((entry) => entry.id === agentId);
      if (!agent) return agentId;

      const firstName = String(agent.firstName ?? "").trim();
      const lastName = String(agent.lastName ?? "").trim();
      const fullName = `${firstName} ${lastName}`.trim();

      return fullName || agent.email || agent.phone || agent.id;
    },
    [agents]
  );

  const openVacation = React.useCallback(
    (vacation: VacationApiItem, panel: "details" | "assign" | "replace") => {
      setActiveVacationId(vacation.id);
      setTensionMode(true);

      if (vacation.siteId) {
        setSiteId(vacation.siteId);
      }

      if (panel === "assign") {
        setMode("site");
        setAssignOpen(true);
        setDétailsOpen(false);
        return;
      }

      if (panel === "replace") {
        setMode("agent");
        setAgentId("all");
        setReplaceOpen(true);
        setDétailsOpen(false);
        return;
      }

      setDétailsOpen(true);
    },
    [
      setActiveVacationId,
      setAgentId,
      setAssignOpen,
      setDétailsOpen,
      setMode,
      setReplaceOpen,
      setSiteId,
      setTensionMode,
    ]
  );

  const handlePublish = React.useCallback(async () => {
    if (!range?.from || !range?.to) {
      setValidationOpen(true);
      return;
    }

    setPublishing(true);
    try {
      await publishRange(range.from, range.to);
    } finally {
      setPublishing(false);
    }
  }, [publishRange, range?.from, range?.to, setValidationOpen]);

  const findRecommendedAgent = React.useCallback(
    (vacation: VacationApiItem) => {
      const requiredQualification = normalizeText(vacation.requiredQualification);
      const alreadyAssigned = new Set(vacation.assignedAgentIds ?? []);

      const candidates = agents
        .filter((agent) => {
          if (String(agent.status ?? "active").toLowerCase() !== "active") {
            return false;
          }
          if (alreadyAssigned.has(agent.id)) return false;

          if (requiredQualification) {
            const qualifications = Array.isArray(agent.qualifications)
              ? agent.qualifications
              : [];
            const hasQualification = qualifications.some((qualification) => {
              const normalized = normalizeText(qualification);
              return (
                normalized === requiredQualification ||
                normalized.includes(requiredQualification) ||
                requiredQualification.includes(normalized)
              );
            });
            if (!hasQualification) return false;
          }

          return !vacations.some((existingVacation) => {
            if (existingVacation.id === vacation.id) return false;
            if (!activeOnly(existingVacation)) return false;
            if (!existingVacation.assignedAgentIds?.includes(agent.id)) return false;
            return intervalOverlaps(
              vacation.startAtIso,
              vacation.endAtIso,
              existingVacation.startAtIso,
              existingVacation.endAtIso
            );
          });
        })
        .map((agent) => ({
          id: agent.id,
          name: agentLabel(agent.id),
          monthlyHours: stats.agentMonthlyHours[agent.id] ?? 0,
          hasQualification: requiredQualification.length > 0,
        }))
        .sort((left, right) => {
          if (left.monthlyHours !== right.monthlyHours) {
            return left.monthlyHours - right.monthlyHours;
          }
          return left.name.localeCompare(right.name, "fr");
        });

      const candidate = candidates[0];
      if (!candidate) return null;

      return {
        id: candidate.id,
        name: candidate.name,
        reason: candidate.hasQualification
          ? "qualification compatible, aucun chevauchement"
          : "disponible, aucun chevauchement",
      };
    },
    [agentLabel, agents, stats.agentMonthlyHours, vacations]
  );

  const assignRecommendedAgent = React.useCallback(
    async (vacation: VacationApiItem, agentId: string, agentName: string) => {
      setAssigningId(vacation.id);
      try {
        const ok = await updateVacation(vacation.id, {
          assignedAgentIds: [agentId],
        });

        if (ok) {
          setActiveVacationId(vacation.id);
          setSelectedIds(new Set([vacation.id]));
          setTensionMode(false);
          setMode("site");
          setAgentId("all");
          if (vacation.siteId) {
            setSiteId(vacation.siteId);
          }
          setOpen(false);

          toast({
            title: "Agent affecte",
            description: `${agentName} couvre maintenant ${getVacationLabel(vacation)}. La vacation est selectionnee dans le planning.`,
          });
        }
      } finally {
        setAssigningId(null);
      }
    },
    [
      setActiveVacationId,
      setAgentId,
      setMode,
      setSelectedIds,
      setSiteId,
      setTensionMode,
      toast,
      updateVacation,
    ]
  );

  const actions = React.useMemo<ActionItem[]>(() => {
    const activeVacations = filteredVacations.filter(activeOnly);
    const activeVacationIds = new Set(activeVacations.map((vacation) => vacation.id));
    const nextActions: ActionItem[] = [];

    const uncoveredVacations = activeVacations
      .filter((vacation) => missingAgents(vacation) > 0)
      .sort(
        (left, right) =>
          new Date(left.startAtIso ?? 0).getTime() -
          new Date(right.startAtIso ?? 0).getTime()
      );

    uncoveredVacations.slice(0, 2).forEach((vacation, index) => {
      const recommendation = findRecommendedAgent(vacation);
      nextActions.push({
        id: `uncovered-${vacation.id}`,
        priority: 10 + index,
        tone: "red",
        icon: UserPlus,
        title: "Vacation a pourvoir",
        description: `${getVacationLabel(vacation)} - ${vacation.siteName || "site a definir"}`,
        meta: recommendation
          ? `Propose : ${recommendation.name} (${recommendation.reason})`
          : `${missingAgents(vacation)} agent(s) manquant(s) le ${formatDateTime(vacation.startAtIso)}`,
        actionLabel: recommendation
          ? `Affecter ${recommendation.name.split(" ")[0]}`
          : "Affecter",
        busyVacationId: vacation.id,
        onAction: recommendation
          ? () =>
              assignRecommendedAgent(
                vacation,
                recommendation.id,
                recommendation.name
              )
          : () => openVacation(vacation, "assign"),
      });
    });

    const conflictItems = Array.from(conflictIndex.entries())
      .filter(([eventId]) => activeVacationIds.has(eventId))
      .flatMap(([eventId, metas]) =>
        metas.map((meta) => ({
          eventId,
          meta,
          vacation: activeVacations.find((vacation) => vacation.id === eventId) ?? null,
        }))
      )
      .filter((entry) => entry.vacation)
      .sort((left, right) => {
        const leftScore = left.meta.severity === "critical" ? 0 : 1;
        const rightScore = right.meta.severity === "critical" ? 0 : 1;
        return leftScore - rightScore;
      });

    const maxDurationVacation = activeVacations.find((vacation) =>
      stats.maxDurationViolations.includes(vacation.id)
    );

    if (maxDurationVacation) {
      nextActions.push({
        id: `max-duration-${maxDurationVacation.id}`,
        priority: 28,
        tone: "red",
        icon: ClockAlert,
        title: "Vacation > 12h",
        description: `${getVacationLabel(maxDurationVacation)} depasse le plafond de reference de 12 heures.`,
        meta: formatDateTime(maxDurationVacation.startAtIso),
        actionLabel: "Ajuster",
        busyVacationId: maxDurationVacation.id,
        onAction: () => openVacation(maxDurationVacation, "details"),
      });
    }

    const sstWarningVacation = activeVacations.find((vacation) =>
      stats.sstCoverageWarnings.includes(vacation.id)
    );

    if (sstWarningVacation) {
      nextActions.push({
        id: `sst-${sstWarningVacation.id}`,
        priority: 42,
        tone: "amber",
        icon: ShieldAlert,
        title: "Presence SST à vérifier",
        description: `${getVacationLabel(sstWarningVacation)} est une vacation collective sans agent SST identifie.`,
        meta: sstWarningVacation.siteName || "Site à vérifier",
        actionLabel: "Affecter",
        busyVacationId: sstWarningVacation.id,
        onAction: () => openVacation(sstWarningVacation, "assign"),
      });
    }

    conflictItems.slice(0, 2).forEach((entry, index) => {
      const vacation = entry.vacation as VacationApiItem;
      const isCritical = entry.meta.severity === "critical";
      const recommendation = isCritical ? findRecommendedAgent(vacation) : null;
      nextActions.push({
        id: `conflict-${entry.eventId}-${entry.meta.type}-${index}`,
        priority: isCritical ? 20 + index : 35 + index,
        tone: isCritical ? "red" : "amber",
        icon: isCritical ? ShieldAlert : ClockAlert,
        title: isCritical ? "Conflit agent critique" : "Alerte repos agent",
        description: entry.meta.message,
        meta: recommendation
          ? `Remplacant propose : ${recommendation.name}`
          : `${getVacationLabel(vacation)} - ${formatDateTime(vacation.startAtIso)}`,
        actionLabel: recommendation
          ? `Remplacer par ${recommendation.name.split(" ")[0]}`
          : isCritical
            ? "Remplacer"
            : "Voir",
        busyVacationId: vacation.id,
        onAction: recommendation
          ? () =>
              assignRecommendedAgent(
                vacation,
                recommendation.id,
                recommendation.name
              )
          : () => openVacation(vacation, isCritical ? "replace" : "details"),
      });
    });

    const overtimeAgents = Object.entries(stats.agentMonthlyHours)
      .map(([agentId, hours]) => {
        const contract =
          stats.agentContractualHours[agentId] ??
          agents.find((agent) => agent.id === agentId)?.monthlyContractHours ??
          151.67;

        return {
          agentId,
          name: agentLabel(agentId),
          hours,
          contract,
          delta: hours - contract,
        };
      })
      .filter((entry) => entry.delta > 0.01)
      .sort((left, right) => right.delta - left.delta);

    if (overtimeAgents[0]) {
      const agent = overtimeAgents[0];
      nextActions.push({
        id: `overtime-${agent.agentId}`,
        priority: 50,
        tone: "amber",
        icon: CalendarCheck2,
        title: "Depassement horaire",
        description: `${agent.name} depasse son volume contractuel.`,
        meta: `${agent.hours.toFixed(1)}h / ${agent.contract.toFixed(1)}h (+${agent.delta.toFixed(1)}h)`,
        actionLabel: "Voir agent",
        onAction: () => {
          setMode("agent");
          setAgentId(agent.agentId);
          setTensionMode(true);
        },
      });
    }

    const scopedSites =
      siteId === "all" ? sites : sites.filter((site) => site.id === siteId);
    const coveredSiteIds = new Set(
      activeVacations
        .map((vacation) => vacation.siteId)
        .filter((id): id is string => Boolean(id))
    );
    const uncoveredSite = scopedSites.find((site) => !coveredSiteIds.has(site.id));

    if (uncoveredSite) {
      nextActions.push({
        id: `site-uncovered-${uncoveredSite.id}`,
        priority: 60,
        tone: "amber",
        icon: MapPinOff,
        title: "Site sans couverture",
        description: `${uncoveredSite.name} n'a aucune vacation sur la période visible.`,
        meta: "A vérifier avant publication",
        actionLabel: "Voir site",
        onAction: () => {
          setMode("site");
          setSiteId(uncoveredSite.id);
          setSortByUrgency(true);
        },
      });
    }

    const draftCount = activeVacations.filter(
      (vacation) => !vacation.isPublished
    ).length;
    const hasBlocking =
      uncoveredVacations.length > 0 ||
      Boolean(maxDurationVacation) ||
      conflictItems.some((entry) => entry.meta.severity === "critical");

    if (draftCount > 0) {
      nextActions.push({
        id: "draft-period",
        priority: hasBlocking ? 80 : 5,
        tone: hasBlocking ? "sky" : "emerald",
        icon: hasBlocking ? Eye : Send,
        title: hasBlocking ? "Periode a valider" : "Periode prête a publiér",
        description: `${draftCount} vacation(s) non publiée(s) dans la vue actuelle.`,
        meta: hasBlocking
          ? "Contrôle recommande avant envoi"
          : "Aucun blocage prioritaire détecté",
        actionLabel: hasBlocking ? "Valider" : "Publier",
        onAction: hasBlocking ? () => setValidationOpen(true) : handlePublish,
      });
    }

    return nextActions.sort((left, right) => left.priority - right.priority).slice(0, 5);
  }, [
    agentLabel,
    agents,
    conflictIndex,
    findRecommendedAgent,
    filteredVacations,
    handlePublish,
    openVacation,
    assignRecommendedAgent,
    setAgentId,
    setMode,
    setSiteId,
    setSortByUrgency,
    setTensionMode,
    setValidationOpen,
    siteId,
    sites,
    stats.agentContractualHours,
    stats.agentMonthlyHours,
    stats.maxDurationViolations,
    stats.sstCoverageWarnings,
  ]);

  if (actions.length === 0) {
    return (
      <div className="fixed bottom-5 right-5 z-40">
        <Button
          type="button"
          variant="outline"
          onClick={() => setValidationOpen(true)}
          className="h-12 rounded-2xl border-emerald-500/30 bg-background/95 px-4 font-black text-emerald-700 shadow-2xl shadow-slate-900/15 backdrop-blur-xl hover:bg-emerald-500/10 dark:text-emerald-300"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Tout est calme
        </Button>
      </div>
    );
  }

  const firstAction = actions[0];
  const FirstIcon = firstAction.icon;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2">
      {open && (
        <div className="w-[min(380px,calc(100vw-1.5rem))] overflow-hidden rounded-[1.5rem] border border-border/60 bg-background/95 shadow-2xl shadow-slate-900/20 backdrop-blur-xl">
          <div className="border-b border-border/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
                  Centre d&apos;actions exploitation
                </p>
                <h3 className="text-base font-black text-foreground">
                  Les urgences à traiter maintenant
                </h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
                className="h-8 rounded-xl px-3 text-xs font-bold"
              >
                Reduire
              </Button>
            </div>
          </div>

          <div className="max-h-[54vh] space-y-2 overflow-y-auto p-2.5">
            {actions.map((action) => {
              const Icon = action.icon;

              return (
                <div
                  key={action.id}
                  className={cn(
                    "rounded-2xl border p-3 shadow-sm",
                    toneClasses[action.tone]
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70">
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-black text-foreground">
                          {action.title}
                        </p>
                        <Badge
                          variant="outline"
                          className="shrink-0 rounded-full bg-background/70 text-[10px] font-black"
                        >
                          P{action.priority}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {action.description}
                      </p>
                      <p className="mt-2 text-[11px] font-bold text-current">
                        {action.meta}
                      </p>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={action.onAction}
                    disabled={publishing || assigningId === action.busyVacationId}
                    className={cn(
                      "mt-3 h-9 w-full rounded-xl border text-xs font-black shadow-sm",
                      actionButtonClasses[action.tone]
                    )}
                  >
                    {(publishing && action.id === "draft-period") ||
                    assigningId === action.busyVacationId ? (
                      <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : null}
                    {action.actionLabel}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "h-12 rounded-2xl px-4 font-black shadow-2xl shadow-slate-900/20 backdrop-blur-xl",
          !open && "animate-in fade-in slide-in-from-bottom-2",
          firstAction.tone === "red"
            ? "bg-red-600 text-white hover:bg-red-700"
            : firstAction.tone === "amber"
              ? "bg-amber-600 text-white hover:bg-amber-700"
              : firstAction.tone === "emerald"
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-sky-600 text-white hover:bg-sky-700"
        )}
      >
        <FirstIcon className="mr-2 h-4 w-4" />
        Actions {actions.length}
      </Button>
    </div>
  );
};

