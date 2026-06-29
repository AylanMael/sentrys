"use client";

import React from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  ClipboardCheck,
  ClockAlert,
  Eye,
  Gauge,
  ListChecks,
  Loader2,
  MailCheck,
  MapPinned,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";
import { computeAgentCompliance } from "@/lib/agents/compliance";
import {
  getVacationPublicationStatus,
  usePlanning,
  type VacationApiItem,
} from "./PlanningContext";

type ValidationTone = "ok" | "warning" | "blocking" | "info";

interface ValidationItem {
  title: string;
  description: string;
  count: number;
  tone: ValidationTone;
  icon: React.ComponentType<{ className?: string }>;
}

interface PriorityAction {
  title: string;
  description: string;
  tone: ValidationTone;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
}

type ValidationLogAction =
  | "review"
  | "publish"
  | "forced_publish"
  | "agent_dispatch_open"
  | "site_dispatch_open";

type PlanningValidationLog = {
  id: string;
  fromIso: string;
  toIso: string;
  action: ValidationLogAction;
  verdict: Exclude<ValidationTone, "info">;
  score: number;
  coverage: number;
  vacationCount: number;
  agentCount: number;
  siteCount: number;
  draftCount: number;
  createdAtIso: string;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
};

type ComplianceValidationEntry = {
  agentId: string;
  name: string;
  vacationIds: string[];
  blockingAlerts: string[];
  warningAlerts: string[];
};

const toneStyles: Record<ValidationTone, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  blocking: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function formatRange(from?: string, to?: string) {
  if (!from || !to) return "Periode en cours";

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${formatter.format(new Date(from))} - ${formatter.format(new Date(to))}`;
}

function formatVacationMoment(startIso?: string | null, endIso?: string | null) {
  if (!startIso || !endIso) return "Horaire a definir";

  const start = new Date(startIso);
  const end = new Date(endIso);
  const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${dayFormatter.format(start)} ${timeFormatter.format(start)}-${timeFormatter.format(end)}`;
}

function formatValidationMoment(iso?: string | null) {
  if (!iso) return "Date inconnue";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function validationActionLabel(action: ValidationLogAction) {
  if (action === "publish") return "Publication";
  if (action === "forced_publish") return "Publication forcee";
  if (action === "agent_dispatch_open") return "Diffusion agents";
  if (action === "site_dispatch_open") return "Remise client";
  return "Controle";
}

function getMissingAgents(vacation: VacationApiItem) {
  const required = Math.max(0, Number(vacation.requiredAgents ?? 1));
  const assigned = Array.isArray(vacation.assignedAgentIds)
    ? vacation.assignedAgentIds.length
    : 0;

  return Math.max(0, required - assigned);
}

export const PeriodValidationSheet: React.FC = () => {
  const {
    validationOpen,
    setValidationOpen,
    filteredVacations,
    sites,
    agents,
    siteId,
    setAgentId,
    setMode,
    setSortByUrgency,
    setTensionMode,
    range,
    stats,
    ops,
    conflictIndex,
    publishRange,
    setDispatchOpen,
    setSiteDispatchOpen,
  } = usePlanning();

  const [publishing, setPublishing] = React.useState(false);
  const [publishPreviewOpen, setPublishPreviewOpen] = React.useState(false);
  const [validationHistory, setValidationHistory] = React.useState<
    PlanningValidationLog[]
  >([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  React.useEffect(() => {
    if (!validationOpen) {
      setPublishPreviewOpen(false);
    }
  }, [validationOpen]);

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

  const loadValidationHistory = React.useCallback(async () => {
    if (!range?.from || !range?.to) {
      setValidationHistory([]);
      return;
    }

    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      max: "8",
    });

    setHistoryLoading(true);
    try {
      const response = await apiFetch<{
        ok: boolean;
        validations: PlanningValidationLog[];
      }>(`/api/planning-validations?${params.toString()}`);
      setValidationHistory(
        response?.ok && Array.isArray(response.validations)
          ? response.validations
          : []
      );
    } catch {
      setValidationHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [range?.from, range?.to]);

  React.useEffect(() => {
    if (!validationOpen) return;
    void loadValidationHistory();
  }, [loadValidationHistory, validationOpen]);

  const activeVacations = React.useMemo(
    () =>
      filteredVacations.filter(
        (vacation) =>
          vacation.status !== "cancelled" && vacation.status !== "closed"
      ),
    [filteredVacations]
  );

  const activeVacationIds = React.useMemo(
    () => new Set(activeVacations.map((vacation) => vacation.id)),
    [activeVacations]
  );

  const conflictEntries = React.useMemo(
    () =>
      Array.from(conflictIndex.entries()).filter(([eventId]) =>
        activeVacationIds.has(eventId)
      ),
    [activeVacationIds, conflictIndex]
  );

  const uncoveredVacationIds = React.useMemo(
    () =>
      new Set(
        activeVacations
          .filter((vacation) => getMissingAgents(vacation) > 0)
          .map((vacation) => vacation.id)
      ),
    [activeVacations]
  );

  const restViolationIds = React.useMemo(
    () =>
      new Set(
        stats.restPeriodViolations.filter((eventId) =>
          activeVacationIds.has(eventId)
        )
      ),
    [activeVacationIds, stats.restPeriodViolations]
  );

  const criticalConflictCount = React.useMemo(
    () =>
      conflictEntries.filter(([, metas]) =>
        metas.some((meta) => meta.severity === "critical")
      ).length,
    [conflictEntries]
  );

  const warningConflictCount = React.useMemo(
    () =>
      conflictEntries.filter(
        ([, metas]) =>
          metas.some((meta) => meta.severity === "warn") &&
          !metas.some((meta) => meta.severity === "critical")
      ).length,
    [conflictEntries]
  );

  const restViolationCount = restViolationIds.size;

  const overtimeAgents = React.useMemo(
    () =>
      Object.entries(stats.agentMonthlyHours)
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
        .filter((item) => item.delta > 0.01)
        .sort((left, right) => right.delta - left.delta),
    [agentLabel, agents, stats.agentContractualHours, stats.agentMonthlyHours]
  );

  const sitesWithoutCoverage = React.useMemo(() => {
    const scopedSites =
      siteId === "all" ? sites : sites.filter((site) => site.id === siteId);
    const coveredSiteIds = new Set(
      activeVacations
        .map((vacation) => vacation.siteId)
        .filter((id): id is string => Boolean(id))
    );

    return scopedSites.filter((site) => !coveredSiteIds.has(site.id));
  }, [activeVacations, siteId, sites]);

  const complianceEntries = React.useMemo<ComplianceValidationEntry[]>(() => {
    const byAgent = new Map<
      string,
      {
        agentId: string;
        name: string;
        vacationIds: Set<string>;
        blockingAlerts: Set<string>;
        warningAlerts: Set<string>;
      }
    >();

    activeVacations.forEach((vacation) => {
      vacation.assignedAgentIds.forEach((assignedAgentId) => {
        const agent = agents.find((entry) => entry.id === assignedAgentId);
        if (!agent) return;

        const compliance = computeAgentCompliance(agent, {
          requiredQualification: vacation.requiredQualification,
        });

        if (
          compliance.blockingAlerts.length === 0 &&
          compliance.warningAlerts.length === 0
        ) {
          return;
        }

        const entry =
          byAgent.get(assignedAgentId) ??
          {
            agentId: assignedAgentId,
            name: agentLabel(assignedAgentId),
            vacationIds: new Set<string>(),
            blockingAlerts: new Set<string>(),
            warningAlerts: new Set<string>(),
          };

        entry.vacationIds.add(vacation.id);
        compliance.blockingAlerts.forEach((alert) =>
          entry.blockingAlerts.add(alert.title)
        );
        compliance.warningAlerts.forEach((alert) =>
          entry.warningAlerts.add(alert.title)
        );
        byAgent.set(assignedAgentId, entry);
      });
    });

    return Array.from(byAgent.values())
      .map((entry) => ({
        agentId: entry.agentId,
        name: entry.name,
        vacationIds: Array.from(entry.vacationIds),
        blockingAlerts: Array.from(entry.blockingAlerts),
        warningAlerts: Array.from(entry.warningAlerts),
      }))
      .sort((left, right) => {
        const leftBlocking = left.blockingAlerts.length > 0 ? 1 : 0;
        const rightBlocking = right.blockingAlerts.length > 0 ? 1 : 0;
        if (leftBlocking !== rightBlocking) return rightBlocking - leftBlocking;
        return left.name.localeCompare(right.name);
      });
  }, [activeVacations, agentLabel, agents]);

  const complianceBlockingAgents = React.useMemo(
    () => complianceEntries.filter((entry) => entry.blockingAlerts.length > 0),
    [complianceEntries]
  );
  const complianceWarningAgents = React.useMemo(
    () =>
      complianceEntries.filter(
        (entry) =>
          entry.blockingAlerts.length === 0 && entry.warningAlerts.length > 0
      ),
    [complianceEntries]
  );

  const vacationsToPublish = React.useMemo(
    () =>
      activeVacations.filter(
        (vacation) => getVacationPublicationStatus(vacation) !== "published"
      ),
    [activeVacations]
  );
  const draftCount = vacationsToPublish.length;
  const publicationAgentIds = React.useMemo(() => {
    const ids = new Set<string>();

    vacationsToPublish.forEach((vacation) => {
      vacation.assignedAgentIds?.forEach((agentId) => ids.add(agentId));
    });

    return ids;
  }, [vacationsToPublish]);
  const publicationSiteIds = React.useMemo(() => {
    const ids = new Set<string>();

    vacationsToPublish.forEach((vacation) => {
      if (vacation.siteId) ids.add(vacation.siteId);
    });

    return ids;
  }, [vacationsToPublish]);

  const activeAssignedAgentIds = React.useMemo(() => {
    const ids = new Set<string>();
    activeVacations.forEach((vacation) => {
      vacation.assignedAgentIds?.forEach((assignedAgentId) =>
        ids.add(assignedAgentId)
      );
    });
    return ids;
  }, [activeVacations]);

  const activeSiteIds = React.useMemo(() => {
    const ids = new Set<string>();
    activeVacations.forEach((vacation) => {
      if (vacation.siteId) ids.add(vacation.siteId);
    });
    return ids;
  }, [activeVacations]);

  const publicationRiskIds = React.useMemo(() => {
    const ids = new Set<string>();

    conflictEntries.forEach(([vacationId]) => ids.add(vacationId));
    uncoveredVacationIds.forEach((vacationId) => ids.add(vacationId));
    restViolationIds.forEach((vacationId) => ids.add(vacationId));
    complianceEntries.forEach((entry) => {
      entry.vacationIds.forEach((vacationId) => ids.add(vacationId));
    });

    return ids;
  }, [
    complianceEntries,
    conflictEntries,
    restViolationIds,
    uncoveredVacationIds,
  ]);
  const riskyVacationsToPublish = React.useMemo(
    () =>
      vacationsToPublish.filter((vacation) =>
        publicationRiskIds.has(vacation.id)
      ),
    [publicationRiskIds, vacationsToPublish]
  );
  const coverage =
    ops.total > 0 ? Math.round((ops.full / ops.total) * 100) : 0;
  const blockingCount =
    (ops.total === 0 ? 1 : 0) +
    (ops.missingAgents > 0 ? 1 : 0) +
    (criticalConflictCount > 0 ? 1 : 0) +
    (complianceBlockingAgents.length > 0 ? 1 : 0);
  const warningCount =
    (restViolationCount > 0 ? 1 : 0) +
    (overtimeAgents.length > 0 ? 1 : 0) +
    (sitesWithoutCoverage.length > 0 ? 1 : 0) +
    (warningConflictCount > 0 ? 1 : 0) +
    (complianceWarningAgents.length > 0 ? 1 : 0);

  const validationStatus = blockingCount > 0
    ? "blocking"
    : warningCount > 0
      ? "warning"
      : "ok";

  const readinessScore = React.useMemo(() => {
    if (ops.total === 0) return 0;

    const rawScore =
      100 -
      ops.missingAgents * 10 -
      criticalConflictCount * 25 -
      complianceBlockingAgents.length * 18 -
      restViolationCount * 5 -
      warningConflictCount * 8 -
      complianceWarningAgents.length * 4 -
      Math.min(overtimeAgents.length * 4, 12) -
      Math.min(sitesWithoutCoverage.length * 2, 10);

    return Math.max(0, Math.min(100, Math.round(rawScore)));
  }, [
    complianceBlockingAgents.length,
    complianceWarningAgents.length,
    criticalConflictCount,
    ops.missingAgents,
    ops.total,
    overtimeAgents.length,
    restViolationCount,
    sitesWithoutCoverage.length,
    warningConflictCount,
  ]);

  const readinessLabel =
    validationStatus === "ok"
      ? "Pret a diffuser"
      : validationStatus === "warning"
        ? "Diffusable avec vigilance"
        : "Bloque avant diffusion propre";

  const readinessDescription =
    validationStatus === "ok"
      ? "Le planning est lisible, couvert et exploitable. On peut publier puis diffuser."
      : validationStatus === "warning"
        ? "Le planning peut avancer, mais les points de vigilance doivent etre connus avant envoi."
        : "Le planning contient au moins un risque operationnel qui doit etre traite ou force avec justification.";

  const validationRiskSummary = React.useMemo(
    () =>
      [
        {
          title: "Postes manquants",
          description: "Des vacations restent sans agent affecte.",
          count: ops.missingAgents,
          tone: "blocking" as const,
        },
        {
          title: "Chevauchements critiques",
          description: "Un agent est planifie sur plusieurs missions qui se croisent.",
          count: criticalConflictCount,
          tone: "blocking" as const,
        },
        {
          title: "Dossiers agents bloquants",
          description: "Un agent planifie presente un point conformite bloquant.",
          count: complianceBlockingAgents.length,
          tone: "blocking" as const,
        },
        {
          title: "Repos insuffisants",
          description: "Certaines reprises sont trop rapprochees.",
          count: restViolationCount,
          tone: "warning" as const,
        },
        {
          title: "Volumes horaires",
          description: "Des agents depassent leur volume contractuel.",
          count: overtimeAgents.length,
          tone: "warning" as const,
        },
        {
          title: "Sites sans couverture",
          description: "Des sites du perimetre n'ont aucune vacation.",
          count: sitesWithoutCoverage.length,
          tone: "warning" as const,
        },
      ].filter((entry) => entry.count > 0),
    [
      complianceBlockingAgents.length,
      criticalConflictCount,
      ops.missingAgents,
      overtimeAgents.length,
      restViolationCount,
      sitesWithoutCoverage.length,
    ]
  );

  const validationItems: ValidationItem[] = [
    {
      title: "Vacations couvertes",
      description:
        ops.total > 0
          ? `${coverage}% de couverture sur le perimetre visible.`
          : "Aucune vacation active sur cette periode.",
      count: ops.full,
      tone: ops.total > 0 && ops.missingAgents === 0 ? "ok" : "blocking",
      icon: UserRoundCheck,
    },
    {
      title: "Postes a pourvoir",
      description:
        ops.missingAgents > 0
          ? "Des agents manquent encore avant publication."
          : "Aucun poste manquant detecte.",
      count: ops.missingAgents,
      tone: ops.missingAgents > 0 ? "blocking" : "ok",
      icon: AlertTriangle,
    },
    {
      title: "Conflits critiques",
      description:
        criticalConflictCount > 0
          ? "Au moins un agent est en chevauchement."
          : "Aucun chevauchement critique dans la periode visible.",
      count: criticalConflictCount,
      tone: criticalConflictCount > 0 ? "blocking" : "ok",
      icon: ShieldAlert,
    },
    {
      title: "Dossiers agents",
      description:
        complianceBlockingAgents.length > 0
          ? "Au moins un agent a un point bloquant avant diffusion."
          : complianceWarningAgents.length > 0
            ? "Des dossiers agents restent a completer."
            : "Aucun blocage conformite detecte.",
      count: complianceBlockingAgents.length + complianceWarningAgents.length,
      tone:
        complianceBlockingAgents.length > 0
          ? "blocking"
          : complianceWarningAgents.length > 0
            ? "warning"
            : "ok",
      icon: ShieldCheck,
    },
    {
      title: "Repos insuffisants",
      description:
        restViolationCount > 0
          ? "Certaines reprises ne respectent pas 11h de repos."
          : "Repos minimum respecte sur les vacations visibles.",
      count: restViolationCount,
      tone: restViolationCount > 0 ? "warning" : "ok",
      icon: ClockAlert,
    },
    {
      title: "Depassements horaires",
      description:
        overtimeAgents.length > 0
          ? "Des agents depassent leur volume contractuel."
          : "Aucun depassement agent detecte.",
      count: overtimeAgents.length,
      tone: overtimeAgents.length > 0 ? "warning" : "ok",
      icon: CalendarCheck2,
    },
    {
      title: "Sites sans couverture",
      description:
        sitesWithoutCoverage.length > 0
          ? "Certains sites du perimetre n'ont aucune vacation."
          : "Tous les sites du perimetre ont au moins une vacation.",
      count: sitesWithoutCoverage.length,
      tone: sitesWithoutCoverage.length > 0 ? "warning" : "ok",
      icon: ClipboardCheck,
    },
  ];

  const recordValidation = React.useCallback(
    async (action: ValidationLogAction) => {
      if (!range?.from || !range?.to) return null;

      try {
        const response = await apiFetch<{
          ok: boolean;
          validation?: PlanningValidationLog;
        }>("/api/planning-validations", {
          method: "POST",
          body: {
            from: range.from,
            to: range.to,
            action,
            verdict: validationStatus,
            score: readinessScore,
            coverage,
            vacationCount: activeVacations.length,
            agentCount: activeAssignedAgentIds.size,
            siteCount: activeSiteIds.size,
            draftCount,
            metrics: {
              missingAgentCount: ops.missingAgents,
              criticalConflictCount,
              warningConflictCount,
              restViolationCount,
              complianceBlockingAgentCount: complianceBlockingAgents.length,
              complianceWarningAgentCount: complianceWarningAgents.length,
              overtimeAgentCount: overtimeAgents.length,
              sitesWithoutCoverageCount: sitesWithoutCoverage.length,
              riskyVacationCount: riskyVacationsToPublish.length,
            },
            risks: validationRiskSummary,
          },
        });

        if (response?.ok && response.validation) {
          setValidationHistory((current) => [
            response.validation as PlanningValidationLog,
            ...current,
          ].slice(0, 8));
        }

        return response?.validation ?? null;
      } catch {
        return null;
      }
    },
    [
      activeAssignedAgentIds.size,
      activeSiteIds.size,
      activeVacations.length,
      complianceBlockingAgents.length,
      complianceWarningAgents.length,
      coverage,
      criticalConflictCount,
      draftCount,
      ops.missingAgents,
      overtimeAgents.length,
      range?.from,
      range?.to,
      readinessScore,
      restViolationCount,
      riskyVacationsToPublish.length,
      sitesWithoutCoverage.length,
      validationRiskSummary,
      validationStatus,
      warningConflictCount,
    ]
  );

  const handlePreviewPublish = React.useCallback(() => {
    setPublishPreviewOpen(true);
    void recordValidation("review");
  }, [recordValidation]);

  const focusCorrections = React.useCallback(() => {
    setMode("site");
    setAgentId("all");
    setSortByUrgency(true);
    setTensionMode(true);
    setValidationOpen(false);
  }, [
    setAgentId,
    setMode,
    setSortByUrgency,
    setTensionMode,
    setValidationOpen,
  ]);

  const focusConflicts = React.useCallback(() => {
    setMode("agent");
    setAgentId("all");
    setSortByUrgency(true);
    setTensionMode(true);
    setValidationOpen(false);
  }, [
    setAgentId,
    setMode,
    setSortByUrgency,
    setTensionMode,
    setValidationOpen,
  ]);

  const openAgentDispatch = React.useCallback(() => {
    void recordValidation("agent_dispatch_open");
    setValidationOpen(false);
    setDispatchOpen(true);
  }, [recordValidation, setDispatchOpen, setValidationOpen]);

  const openSiteDispatch = React.useCallback(() => {
    void recordValidation("site_dispatch_open");
    setValidationOpen(false);
    setSiteDispatchOpen(true);
  }, [recordValidation, setSiteDispatchOpen, setValidationOpen]);

  const priorityActions = React.useMemo<PriorityAction[]>(() => {
    const actions: PriorityAction[] = [];

    if (ops.total === 0) {
      actions.push({
        title: "Construire la periode",
        description:
          "Aucune vacation active n'est visible. Il faut creer ou pre-remplir le planning avant validation.",
        tone: "blocking",
        actionLabel: "Retour planning",
        onAction: () => setValidationOpen(false),
      });
    }

    if (ops.missingAgents > 0) {
      actions.push({
        title: "Affecter les postes manquants",
        description: `${ops.missingAgents} poste(s) restent sans agent. C'est le premier risque terrain.`,
        tone: "blocking",
        actionLabel: "Voir les trous",
        onAction: focusCorrections,
      });
    }

    if (criticalConflictCount > 0) {
      actions.push({
        title: "Resoudre les chevauchements",
        description: `${criticalConflictCount} conflit(s) critique(s) empechent un agent d'etre au bon endroit au bon moment.`,
        tone: "blocking",
        actionLabel: "Voir conflits",
        onAction: focusConflicts,
      });
    }

    if (complianceBlockingAgents.length > 0) {
      actions.push({
        title: "Regulariser les dossiers bloquants",
        description: `${complianceBlockingAgents.length} agent(s) ont un point conformite bloquant sur la periode.`,
        tone: "blocking",
        actionLabel: "Voir agents",
        onAction: focusConflicts,
      });
    }

    if (restViolationCount > 0) {
      actions.push({
        title: "Verifier les temps de repos",
        description: `${restViolationCount} vacation(s) exposent un repos inferieur au seuil de reference.`,
        tone: "warning",
        actionLabel: "Voir alertes",
        onAction: focusConflicts,
      });
    }

    if (overtimeAgents.length > 0) {
      actions.push({
        title: "Controler les volumes horaires",
        description: `${overtimeAgents.length} agent(s) depassent leur volume contractuel sur la periode.`,
        tone: "warning",
        actionLabel: "Voir details",
        onAction: focusCorrections,
      });
    }

    if (actions.length === 0) {
      actions.push({
        title: "Planning pret pour le terrain",
        description:
          "Tous les voyants principaux sont au vert. La prochaine action logique est la publication puis la diffusion.",
        tone: "ok",
        actionLabel: "Previsualiser",
        onAction: handlePreviewPublish,
        disabled: vacationsToPublish.length === 0,
      });
    }

    return actions.slice(0, 4);
  }, [
    complianceBlockingAgents.length,
    criticalConflictCount,
    focusConflicts,
    focusCorrections,
    handlePreviewPublish,
    ops.missingAgents,
    ops.total,
    overtimeAgents.length,
    restViolationCount,
    setValidationOpen,
    vacationsToPublish.length,
  ]);

  const handlePublish = React.useCallback(async () => {
    if (!range?.from || !range?.to) return;

    setPublishing(true);
    try {
      await recordValidation(
        validationStatus === "blocking" ? "forced_publish" : "publish"
      );
      await publishRange(range.from, range.to);
      setPublishPreviewOpen(false);
      setValidationOpen(false);
    } finally {
      setPublishing(false);
    }
  }, [publishRange, range?.from, range?.to, recordValidation, setValidationOpen, validationStatus]);

  return (
    <Sheet open={validationOpen} onOpenChange={setValidationOpen}>
      <SheetContent className="overflow-y-auto border-l bg-white shadow-2xl dark:bg-slate-950 sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl font-black">
            <Gauge className="h-5 w-5 text-primary" />
            Cockpit de validation
          </SheetTitle>
          <SheetDescription>
            Verdict exploitation avant publication : couverture, conflits,
            dossiers agents, repos, heures, PDF et diffusion.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div
            className={cn(
              "relative overflow-hidden rounded-[2rem] border p-5",
              validationStatus === "ok" && toneStyles.ok,
              validationStatus === "warning" && toneStyles.warning,
              validationStatus === "blocking" && toneStyles.blocking
            )}
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/30 blur-3xl dark:bg-white/10" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] opacity-80">
                  <Sparkles className="h-3.5 w-3.5" />
                  Tour de controle exploitation
                </p>
                <h3 className="mt-1 text-2xl font-black text-foreground">
                  {readinessLabel}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {readinessDescription} Periode controlee :{" "}
                  {formatRange(range?.from, range?.to)}.
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-border/50 bg-background/85 p-4 text-center shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Score sante
                </p>
                <p className="mt-1 text-5xl font-black text-foreground">
                  {readinessScore}
                </p>
                <div className="mt-3 h-2 w-40 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      readinessScore >= 90
                        ? "bg-emerald-500"
                        : readinessScore >= 70
                          ? "bg-amber-500"
                          : "bg-red-500"
                    )}
                    style={{ width: `${Math.min(readinessScore, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="relative mt-5 grid gap-2 sm:grid-cols-4">
              {[
                { label: "Vacations", value: activeVacations.length },
                { label: "Agents", value: activeAssignedAgentIds.size },
                { label: "Sites", value: activeSiteIds.size },
                { label: "A publier", value: draftCount },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-2xl border border-border/40 bg-background/70 p-3"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-2xl font-black text-foreground">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border/60 bg-background p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                  <ListChecks className="h-4 w-4" />
                  Priorites terrain
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Les actions sont triees comme le ferait un responsable
                  d'exploitation : d'abord ce qui peut mettre le service en
                  danger.
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full px-3 py-1 font-black",
                  validationStatus === "ok" &&
                    "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
                  validationStatus === "warning" &&
                    "border-amber-500/30 text-amber-700 dark:text-amber-300",
                  validationStatus === "blocking" &&
                    "border-red-500/30 text-red-700 dark:text-red-300"
                )}
              >
                {readinessLabel}
              </Badge>
            </div>

            <div className="mt-4 space-y-2">
              {priorityActions.map((action) => (
                <div
                  key={action.title}
                  className={cn(
                    "flex flex-col gap-3 rounded-2xl border p-3 sm:flex-row sm:items-center sm:justify-between",
                    toneStyles[action.tone]
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-black text-foreground">
                      {action.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={action.onAction}
                    disabled={action.disabled}
                    className="shrink-0 rounded-xl bg-background/80 font-bold"
                  >
                    {action.actionLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {validationItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className={cn(
                    "rounded-2xl border p-4",
                    toneStyles[item.tone]
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background/70">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-foreground">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full bg-background/70 px-3 py-1 font-black"
                    >
                      {item.count}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>

          {(complianceEntries.length > 0 ||
            overtimeAgents.length > 0 ||
            sitesWithoutCoverage.length > 0) && (
            <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                Details a surveiller
              </p>

              {complianceEntries.length > 0 && (
                <div className="mt-3 space-y-2">
                  {complianceEntries.slice(0, 4).map((entry) => {
                    const blocking = entry.blockingAlerts.length > 0;
                    const firstAlert =
                      entry.blockingAlerts[0] ?? entry.warningAlerts[0];

                    return (
                      <div
                        key={entry.agentId}
                        className={cn(
                          "rounded-xl border bg-background px-3 py-2 text-sm",
                          blocking
                            ? "border-red-500/20"
                            : "border-amber-500/20"
                        )}
                      >
                        <span className="font-bold">{entry.name}</span>
                        {" : "}
                        <span
                          className={cn(
                            "font-black",
                            blocking
                              ? "text-red-700 dark:text-red-300"
                              : "text-amber-700 dark:text-amber-300"
                          )}
                        >
                          {firstAlert}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {overtimeAgents.length > 0 && (
                <div className="mt-3 space-y-2">
                  {overtimeAgents.slice(0, 4).map((agent) => (
                    <div
                      key={agent.agentId}
                      className="rounded-xl border border-amber-500/20 bg-background px-3 py-2 text-sm"
                    >
                      <span className="font-bold">{agent.name}</span>
                      {" : "}
                      {agent.hours.toFixed(1)}h realisees / {agent.contract.toFixed(1)}h contrat
                      {" "}
                      <span className="font-black text-amber-700 dark:text-amber-300">
                        (+{agent.delta.toFixed(1)}h)
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {sitesWithoutCoverage.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sitesWithoutCoverage.slice(0, 8).map((site) => (
                    <span
                      key={site.id}
                      className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-bold text-muted-foreground"
                    >
                      {site.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-black text-foreground">
              Decision chef d&apos;exploitation
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {validationStatus === "ok"
                ? "La periode est propre. Tu peux publier et informer les agents."
                : validationStatus === "warning"
                  ? "La periode est publiable, mais les alertes doivent etre connues avant envoi."
              : "Je recommande de corriger les postes manquants et conflits avant publication."}
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-border/60 bg-background p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Journal validation & diffusion
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Trace utile en cas de question client, agent ou controle :
                  qui a controle, quand, avec quel niveau de risque.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadValidationHistory}
                disabled={historyLoading || !range?.from || !range?.to}
                className="shrink-0 rounded-xl"
              >
                {historyLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ListChecks className="mr-2 h-4 w-4" />
                )}
                Actualiser
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              {historyLoading && validationHistory.length === 0 ? (
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                  Chargement du journal...
                </div>
              ) : validationHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-3 text-sm text-muted-foreground">
                  Aucun controle journalise sur cette periode pour l&apos;instant.
                </div>
              ) : (
                validationHistory.slice(0, 5).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full bg-background px-3 py-1 font-black",
                            entry.verdict === "ok" &&
                              "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
                            entry.verdict === "warning" &&
                              "border-amber-500/30 text-amber-700 dark:text-amber-300",
                            entry.verdict === "blocking" &&
                              "border-red-500/30 text-red-700 dark:text-red-300"
                          )}
                        >
                          {validationActionLabel(entry.action)}
                        </Badge>
                        <span className="text-sm font-black text-foreground">
                          Score {entry.score}/100
                        </span>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-muted-foreground">
                        {formatValidationMoment(entry.createdAtIso)} par{" "}
                        {entry.actorName ||
                          entry.actorEmail ||
                          entry.actorRole ||
                          "utilisateur"}
                      </p>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs sm:w-64">
                      <div className="rounded-xl bg-background px-2 py-1">
                        <p className="font-black text-foreground">
                          {entry.vacationCount}
                        </p>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">
                          Vac.
                        </p>
                      </div>
                      <div className="rounded-xl bg-background px-2 py-1">
                        <p className="font-black text-foreground">
                          {entry.agentCount}
                        </p>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">
                          Ag.
                        </p>
                      </div>
                      <div className="rounded-xl bg-background px-2 py-1">
                        <p className="font-black text-foreground">
                          {entry.siteCount}
                        </p>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">
                          Sites
                        </p>
                      </div>
                      <div className="rounded-xl bg-background px-2 py-1">
                        <p className="font-black text-foreground">
                          {entry.draftCount}
                        </p>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">
                          Publ.
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {publishPreviewOpen && (
            <div className="rounded-[1.75rem] border border-sky-500/30 bg-sky-500/5 p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
                    <Send className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground">
                      Previsualisation de publication
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Dernier controle avant envoi : seules les vacations non
                      publiees ou modifiees depuis publication seront marquees
                      comme publiees.
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "w-fit rounded-full bg-background px-3 py-1 font-black",
                    riskyVacationsToPublish.length > 0 &&
                      "border-amber-500/40 text-amber-700 dark:text-amber-300"
                  )}
                >
                  {riskyVacationsToPublish.length} a risque
                </Badge>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-background p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Vacations
                  </p>
                  <p className="mt-1 text-2xl font-black text-foreground">
                    {vacationsToPublish.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Agents
                  </p>
                  <p className="mt-1 text-2xl font-black text-foreground">
                    {publicationAgentIds.size}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Sites
                  </p>
                  <p className="mt-1 text-2xl font-black text-foreground">
                    {publicationSiteIds.size}
                  </p>
                </div>
              </div>

              {riskyVacationsToPublish.length > 0 && (
                <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                  <span className="font-black">Attention :</span>{" "}
                  {riskyVacationsToPublish.length} vacation(s) partent avec un
                  point de vigilance : poste a pourvoir, conflit, repos
                  insuffisant ou dossier agent.
                </div>
              )}

              <div className="mt-4 max-h-72 overflow-y-auto rounded-2xl border border-border/60 bg-background">
                {vacationsToPublish.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    Aucune vacation non publiee dans cette periode.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {vacationsToPublish.slice(0, 6).map((vacation) => {
                      const assignedLabels =
                        vacation.assignedAgentIds
                          ?.map((assignedAgentId) => agentLabel(assignedAgentId))
                          .join(", ") || "A pourvoir";
                      const missingAgents = getMissingAgents(vacation);
                      const isRisky = publicationRiskIds.has(vacation.id);

                      return (
                        <div
                          key={vacation.id}
                          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-foreground">
                              {vacation.title ||
                                vacation.missionType ||
                                vacation.siteName ||
                                "Vacation"}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-muted-foreground">
                              {formatVacationMoment(
                                vacation.startAtIso,
                                vacation.endAtIso
                              )}{" "}
                              - {vacation.siteName || "Site non renseigne"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {assignedLabels}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {missingAgents > 0 && (
                              <Badge
                                variant="outline"
                                className="rounded-full border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                              >
                                {missingAgents} manquant
                              </Badge>
                            )}
                            {isRisky && (
                              <Badge
                                variant="outline"
                                className="rounded-full border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              >
                                A verifier
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {vacationsToPublish.length > 6 && (
                      <div className="p-3 text-xs font-bold text-muted-foreground">
                        +{vacationsToPublish.length - 6} autre(s) vacation(s)
                        incluses dans la publication.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-row">
          {publishPreviewOpen ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPublishPreviewOpen(false)}
                disabled={publishing}
              >
                Retour au controle
              </Button>
              <Button
                type="button"
                onClick={handlePublish}
                disabled={
                  !range?.from ||
                  !range?.to ||
                  publishing ||
                  vacationsToPublish.length === 0
                }
                className={cn(
                  validationStatus === "blocking" &&
                    "bg-amber-600 text-white hover:bg-amber-700"
                )}
              >
                {publishing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Publier maintenant
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setValidationOpen(false)}
                disabled={publishing}
              >
                Retour au planning
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={focusCorrections}
                disabled={
                  ops.missingAgents === 0 && sitesWithoutCoverage.length === 0
                }
              >
                <Eye className="mr-2 h-4 w-4" />
                Voir les corrections
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={focusConflicts}
                disabled={criticalConflictCount === 0 && restViolationCount === 0}
              >
                <ShieldAlert className="mr-2 h-4 w-4" />
                Voir les conflits
              </Button>
              <Button
                type="button"
                onClick={handlePreviewPublish}
                disabled={
                  !range?.from ||
                  !range?.to ||
                  publishing ||
                  vacationsToPublish.length === 0
                }
                className={cn(
                  validationStatus === "blocking" &&
                    "bg-amber-600 text-white hover:bg-amber-700"
                )}
              >
                <Send className="mr-2 h-4 w-4" />
                {validationStatus === "blocking"
                  ? "Previsualiser publication forcee"
                  : "Previsualiser publication"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openAgentDispatch}
                disabled={validationStatus === "blocking"}
              >
                <MailCheck className="mr-2 h-4 w-4" />
                Diffuser agents
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={openSiteDispatch}
                disabled={validationStatus === "blocking"}
              >
                <MapPinned className="mr-2 h-4 w-4" />
                Remise client
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
