"use client";

import React from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  Eye,
  FileCheck2,
  History,
  Loader2,
  Mail,
  Printer,
  Send,
  Users,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api/client-fetch";
import { useToast } from "@/hooks/use-toast";
import type { AgencyDocumentProfile } from "@/lib/agency/profile";
import type { AgencyEmailSettings } from "@/lib/agency/email-settings";
import { computeAgentCompliance } from "@/lib/agents/compliance";
import {
  agencyEmailIdentity,
  previewPeriodLabel,
} from "@/lib/planning/email-preview";
import {
  dispatchChannelLabel,
  dispatchChannelNeedsEmail,
  dispatchChannelNeedsPhone,
  getDispatchDeliveryMode,
  getDispatchDeliveryStatus,
  type DispatchChannel,
  type DispatchDeliveryMode,
  type DispatchDeliveryStatus,
} from "@/lib/planning/dispatch";
import {
  EmailPreviewDialog,
  type EmailPreviewData,
} from "./EmailPreviewDialog";
import {
  getVacationPublicationStatus,
  usePlanning,
  type AgentApiItem,
  type VacationApiItem,
} from "./PlanningContext";

type DispatchVacationSummary = {
  id: string;
  siteName: string | null;
  title: string | null;
  missionType: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
};

type DispatchApiItem = {
  id?: string;
  agentId: string;
  agentName: string;
  agentEmail: string | null;
  agentPhone?: string | null;
  fromIso: string;
  toIso: string;
  vacationIds: string[];
  vacationCount: number;
  siteNames: string[];
  vacations: DispatchVacationSummary[];
  channel: DispatchChannel;
  deliveryMode?: DispatchDeliveryMode;
  deliveryStatus?: DispatchDeliveryStatus;
  deliveryTarget?: string | null;
  deliveryNote?: string | null;
  sentAtIso: string | null;
  sentBy: string;
  viewedAtIso?: string | null;
  lastViewedAtIso?: string | null;
  viewedCount?: number;
  printedAtIso?: string | null;
  lastPrintedAtIso?: string | null;
  printedCount?: number;
  acknowledgedAtIso: string | null;
  acknowledgedByUid: string | null;
  acknowledgedByName: string | null;
  acknowledgedByEmail: string | null;
  agencyProfile?: AgencyDocumentProfile;
  complianceOverride?: boolean;
  complianceOverrideReason?: string | null;
  complianceOverrideDétail?: string | null;
};

type DispatchListResponse = {
  ok: boolean;
  dispatches: DispatchApiItem[];
};

type DispatchPostResponse = {
  ok: boolean;
  created: number;
  blocked?: Array<{
    agentId: string;
    agentName: string;
    reason: "missing_email" | "missing_phone" | string;
    detail?: string | null;
  }>;
  dispatches: DispatchApiItem[];
};

type AgencyProfileResponse = {
  ok: boolean;
  profile: AgencyDocumentProfile;
  emailSettings: AgencyEmailSettings;
};

type AgentPlanningRow = {
  agent: AgentApiItem;
  label: string;
  vacations: VacationApiItem[];
};

type AgentDispatchComplianceIssue = {
  status: "blocking" | "warning";
  blockingAlerts: string[];
  warningAlerts: string[];
  vacationIds: string[];
};

const MONTHLY_WORKLOAD_ALERT_HOURS = 180;

function computeRowComplianceIssue(
  row: AgentPlanningRow
): AgentDispatchComplianceIssue | null {
  const blockingAlerts = new Set<string>();
  const warningAlerts = new Set<string>();
  const vacationIds = new Set<string>();

  row.vacations.forEach((vacation) => {
    const compliance = computeAgentCompliance(row.agent, {
      requiredQualification: vacation.requiredQualification,
    });

    if (
      compliance.blockingAlerts.length === 0 &&
      compliance.warningAlerts.length === 0
    ) {
      return;
    }

    vacationIds.add(vacation.id);
    compliance.blockingAlerts.forEach((alert) =>
      blockingAlerts.add(alert.title)
    );
    compliance.warningAlerts.forEach((alert) =>
      warningAlerts.add(alert.title)
    );
  });

  if (blockingAlerts.size === 0 && warningAlerts.size === 0) return null;

  return {
    status: blockingAlerts.size > 0 ? "blocking" : "warning",
    blockingAlerts: Array.from(blockingAlerts),
    warningAlerts: Array.from(warningAlerts),
    vacationIds: Array.from(vacationIds),
  };
}

function agentLabel(agent: AgentApiItem) {
  const firstName = String(agent.firstName ?? "").trim();
  const lastName = String(agent.lastName ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || agent.email || agent.phone || agent.id;
}

function formatRange(from?: string, to?: string) {
  if (!from || !to) return "Periode en cours";

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${formatter.format(new Date(from))} - ${formatter.format(new Date(to))}`;
}

function formatMoment(startIso?: string | null, endIso?: string | null) {
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

function formatSentAt(value?: string | null) {
  if (!value) return "Envoi enregistre";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatAcknowledgedAt(value?: string | null) {
  if (!value) return "En attente agent";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getVacationHours(
  vacation: Pick<VacationApiItem, "startAtIso" | "endAtIso">
) {
  if (!vacation.startAtIso || !vacation.endAtIso) return 0;

  const start = Date.parse(vacation.startAtIso);
  const end = Date.parse(vacation.endAtIso);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return (end - start) / 3_600_000;
}

function deliveryStatusLabel(entry: DispatchApiItem) {
  if (entry.channel === "portal") {
    if (entry.acknowledgedAtIso) return "Confirme";
    if (entry.printedAtIso || (entry.printedCount ?? 0) > 0) return "PDF ouvert";
    if (entry.viewedAtIso || (entry.viewedCount ?? 0) > 0) return "Consulte";
    return "A relancéer";
  }

  if (entry.printedAtIso || (entry.printedCount ?? 0) > 0) return "PDF prêt";
  if (entry.channel === "email" || entry.channel === "whatsapp") return "Simule";
  if (entry.channel === "internal") return "Journalise";
  if (entry.deliveryStatus === "simulated") return "Simule";
  if (entry.deliveryStatus === "logged") return "Journalise";
  if (entry.deliveryStatus === "blocked") return "Bloque";
  return "Prepare";
}

function statusBadgeTone(entry: DispatchApiItem) {
  if (entry.acknowledgedAtIso) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (entry.printedAtIso || (entry.printedCount ?? 0) > 0) {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
  }

  if (entry.viewedAtIso || (entry.viewedCount ?? 0) > 0) {
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }

  if (entry.deliveryStatus === "simulated") {
    return "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300";
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function dispatchNeedsFollowUp(entry: DispatchApiItem) {
  return entry.channel === "portal" && !entry.acknowledgedAtIso;
}

function channelDescription(channel: DispatchChannel) {
  if (channel === "portal") {
    return "Publie le planning dans le portail agent avec suivi de confirmation.";
  }

  if (channel === "email") {
    return "Simulation email : on tracé l'envoi et le PDF prêt, sans envoyer d'email réel.";
  }

  if (channel === "whatsapp") {
    return "Simulation WhatsApp : on tracé le message prêt, sans envoyer de WhatsApp réel.";
  }

  return "Journalisation interne uniquement, utile pour tests ou remise en main propre.";
}

function cacheDispatchForPrint(dispatch: DispatchApiItem) {
  if (!dispatch.id) return;

  try {
    window.localStorage.setItem(
      `sentrys:print-dispatch:${dispatch.id}`,
      JSON.stringify(dispatch)
    );
  } catch {
    // Non bloquant: on retombera sur l'API si le cache local échoue.
  }
}

function openPrintableDispatch(dispatch: DispatchApiItem) {
  if (!dispatch.id) return;
  cacheDispatchForPrint(dispatch);
  window.open(
    `/agent-planning/print/${dispatch.id}?autoprint=1`,
    "_blank",
    "noopener,noreferrer"
  );
}

function makePreviewDispatchId(
  agentId: string,
  fromIso: string,
  toIso: string,
  channel: DispatchChannel
) {
  const seed = `${agentId}-${fromIso}-${toIso}-${channel}`
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);

  return `preview-${seed}`;
}

function deliveryTargetForAgent(agent: AgentApiItem, channel: DispatchChannel) {
  if (channel === "email") return agent.email ?? null;
  if (channel === "whatsapp") return agent.phone ?? null;
  if (channel === "portal") return agent.email || agent.phone || null;
  return null;
}

function deliveryNoteForChannel(channel: DispatchChannel) {
  if (channel === "email") {
    return "Prévisualisation email : PDF prêt, aucun email réel n'a été envoyé.";
  }

  if (channel === "whatsapp") {
    return "Prévisualisation WhatsApp : PDF prêt, aucun message réel n'a été envoyé.";
  }

  if (channel === "portal") {
    return "Prévisualisation portail agent avant publication.";
  }

  return "Prévisualisation interne avant journalisation.";
}

export const AgentDispatchSheet: React.FC = () => {
  const {
    dispatchOpen,
    setDispatchOpen,
    filteredVacations,
    agents,
    range,
  } = usePlanning();
  const { toast } = useToast();
  const [history, setHistory] = React.useState<DispatchApiItem[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [emailPreview, setEmailPreview] =
    React.useState<EmailPreviewData | null>(null);
  const [agencyProfile, setAgencyProfile] =
    React.useState<AgencyDocumentProfile | null>(null);
  const [emailSettings, setEmailSettings] =
    React.useState<AgencyEmailSettings | null>(null);
  const [channel, setChannel] = React.useState<DispatchChannel>("portal");
  const [forceComplianceOverride, setForceComplianceOverride] =
    React.useState(false);
  const [forceComplianceReason, setForceComplianceReason] =
    React.useState("");
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<Set<string>>(
    new Set()
  );

  const activeVacations = React.useMemo(
    () =>
      filteredVacations.filter(
        (vacation) =>
          vacation.status !== "cancelled" && vacation.status !== "closed"
      ),
    [filteredVacations]
  );

  const readyVacations = React.useMemo(
    () =>
      activeVacations.filter(
        (vacation) =>
          getVacationPublicationStatus(vacation) === "published" &&
          vacation.assignedAgentIds.length > 0
      ),
    [activeVacations]
  );

  const blockedCounts = React.useMemo(
    () =>
      activeVacations.reduce(
        (acc, vacation) => {
          const status = getVacationPublicationStatus(vacation);
          if (status === "draft") acc.draft += 1;
          if (status === "modifiéd") acc.modifiéd += 1;
          if (vacation.assignedAgentIds.length === 0) acc.unassigned += 1;
          return acc;
        },
        { draft: 0, modifiéd: 0, unassigned: 0 }
      ),
    [activeVacations]
  );

  const agentRows = React.useMemo<AgentPlanningRow[]>(() => {
    return agents
      .map((agent) => {
        const vacations = readyVacations
          .filter((vacation) => vacation.assignedAgentIds.includes(agent.id))
          .sort((left, right) => {
            const l = left.startAtIso ? new Date(left.startAtIso).getTime() : 0;
            const r = right.startAtIso ? new Date(right.startAtIso).getTime() : 0;
            return l - r;
          });

        return {
          agent,
          label: agentLabel(agent),
          vacations,
        };
      })
      .filter((row) => row.vacations.length > 0)
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [agents, readyVacations]);

  const selectedRows = React.useMemo(
    () => agentRows.filter((row) => selectedAgentIds.has(row.agent.id)),
    [agentRows, selectedAgentIds]
  );

  const complianceIssueByAgentId = React.useMemo(() => {
    const issues = new Map<string, AgentDispatchComplianceIssue>();

    agentRows.forEach((row) => {
      const issue = computeRowComplianceIssue(row);
      if (issue) issues.set(row.agent.id, issue);
    });

    return issues;
  }, [agentRows]);

  const selectedRowsMissingContact = React.useMemo(() => {
    return selectedRows.filter((row) => {
      if (dispatchChannelNeedsEmail(channel)) return !row.agent.email;
      if (dispatchChannelNeedsPhone(channel)) return !row.agent.phone;
      return false;
    });
  }, [channel, selectedRows]);

  const selectedRowsComplianceBlocking = React.useMemo(
    () =>
      selectedRows.filter(
        (row) => complianceIssueByAgentId.get(row.agent.id)?.status === "blocking"
      ),
    [complianceIssueByAgentId, selectedRows]
  );

  const selectedRowsComplianceWarning = React.useMemo(
    () =>
      selectedRows.filter(
        (row) => complianceIssueByAgentId.get(row.agent.id)?.status === "warning"
      ),
    [complianceIssueByAgentId, selectedRows]
  );
  const forceComplianceReasonValue = forceComplianceReason.trim();
  const canForceCompliance =
    forceComplianceOverride &&
    selectedRowsComplianceBlocking.length > 0 &&
    forceComplianceReasonValue.length >= 8;

  const selectedRowsBlockedIds = React.useMemo(
    () =>
      new Set([
        ...selectedRowsMissingContact.map((row) => row.agent.id),
        ...(canForceCompliance
          ? []
          : selectedRowsComplianceBlocking.map((row) => row.agent.id)),
      ]),
    [canForceCompliance, selectedRowsComplianceBlocking, selectedRowsMissingContact]
  );

  const dispatchableSelectedRows = React.useMemo(
    () =>
      selectedRows.filter((row) => !selectedRowsBlockedIds.has(row.agent.id)),
    [selectedRows, selectedRowsBlockedIds]
  );
  const selectedRowsBlockedCount = selectedRows.filter((row) =>
    selectedRowsBlockedIds.has(row.agent.id)
  ).length;

  const selectedRowsWorkloadAlerts = React.useMemo(
    () =>
      selectedRows
        .map((row) => ({
          label: row.label,
          hours: row.vacations.reduce(
            (total, vacation) => total + getVacationHours(vacation),
            0
          ),
        }))
        .filter((row) => row.hours > MONTHLY_WORKLOAD_ALERT_HOURS)
        .sort((left, right) => right.hours - left.hours),
    [selectedRows]
  );

  const selectedVacationIds = React.useMemo(
    () =>
      Array.from(
        new Set(
          selectedRows.flatMap((row) =>
            row.vacations.map((vacation) => vacation.id)
          )
        )
      ),
    [selectedRows]
  );

  const dispatchHistoryStats = React.useMemo(
    () =>
      history.reduce(
        (acc, entry) => {
          acc.total += 1;
          if (entry.acknowledgedAtIso) acc.acknowledged += 1;
          if (entry.viewedAtIso || (entry.viewedCount ?? 0) > 0) acc.viewed += 1;
          if (entry.printedAtIso || (entry.printedCount ?? 0) > 0) acc.printed += 1;
          if (dispatchNeedsFollowUp(entry)) acc.followUp += 1;
          return acc;
        },
        { total: 0, acknowledged: 0, viewed: 0, printed: 0, followUp: 0 }
      ),
    [history]
  );

  const loadHistory = React.useCallback(async () => {
    if (!range?.from || !range?.to) return;

    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
      });
      const response = await apiFetch<DispatchListResponse>(
        `/api/planning-dispatches?${params.toString()}`
      );
      setHistory(response.dispatches ?? []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Historique indisponible",
        description:
          error instanceof Error
            ? error.message
            : "Impossible de charger les diffusions.",
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [range?.from, range?.to, toast]);

  const loadAgencyConfig = React.useCallback(async () => {
    try {
      const response = await apiFetch<AgencyProfileResponse>("/api/agency-profile");
      setAgencyProfile(response.profile ?? null);
      setEmailSettings(response.emailSettings ?? null);
    } catch {
      setAgencyProfile(null);
      setEmailSettings(null);
    }
  }, []);

  const buildPreviewDispatch = React.useCallback(
    (row: AgentPlanningRow): DispatchApiItem | null => {
      if (!range?.from || !range?.to) return null;

      const siteNames = Array.from(
        new Set(
          row.vacations
            .map((vacation) => vacation.siteName || vacation.title)
            .filter((value): value is string => Boolean(value))
        )
      ).slice(0, 12);

      return {
        id: makePreviewDispatchId(row.agent.id, range.from, range.to, channel),
        agentId: row.agent.id,
        agentName: row.label,
        agentEmail: row.agent.email ?? null,
        agentPhone: row.agent.phone ?? null,
        fromIso: range.from,
        toIso: range.to,
        vacationIds: row.vacations.map((vacation) => vacation.id),
        vacationCount: row.vacations.length,
        siteNames,
        vacations: row.vacations.map((vacation) => ({
          id: vacation.id,
          siteName: vacation.siteName,
          title: vacation.title,
          missionType: vacation.missionType ?? null,
          startAtIso: vacation.startAtIso,
          endAtIso: vacation.endAtIso,
        })),
        channel,
        deliveryMode: getDispatchDeliveryMode(channel),
        deliveryStatus: getDispatchDeliveryStatus(channel),
        deliveryTarget: deliveryTargetForAgent(row.agent, channel),
        deliveryNote: deliveryNoteForChannel(channel),
        sentAtIso: new Date().toISOString(),
        sentBy: "prévisualisation",
        viewedAtIso: null,
        lastViewedAtIso: null,
        viewedCount: 0,
        printedAtIso: null,
        lastPrintedAtIso: null,
        printedCount: 0,
        acknowledgedAtIso: null,
        acknowledgedByUid: null,
        acknowledgedByName: null,
        acknowledgedByEmail: null,
        agencyProfile: agencyProfile ?? undefined,
      };
    },
    [agencyProfile, channel, range?.from, range?.to]
  );

  const openPreviewForRow = React.useCallback(
    (row: AgentPlanningRow | undefined) => {
      if (!row) return;

      const dispatch = buildPreviewDispatch(row);
      if (!dispatch?.id) return;

      cacheDispatchForPrint(dispatch);
      window.open(
        `/agent-planning/print/${dispatch.id}`,
        "_blank",
        "noopener,noreferrer"
      );
    },
    [buildPreviewDispatch]
  );

  const openEmailPreviewForRow = React.useCallback(
    (row: AgentPlanningRow | undefined) => {
      if (!row || !range?.from || !range?.to) return;

      const dispatch = buildPreviewDispatch(row);
      if (!dispatch?.id) return;

      cacheDispatchForPrint(dispatch);

      const identity = agencyEmailIdentity(
        dispatch.agencyProfile ?? agencyProfile,
        emailSettings
      );
      const period = previewPeriodLabel(range.from, range.to);
      const sitesText =
        dispatch.siteNames.length > 0
          ? dispatch.siteNames.join(", ")
          : "sites planifies";
      const complianceIssue = complianceIssueByAgentId.get(row.agent.id);
      const hasComplianceBlock = complianceIssue?.status === "blocking";
      const firstComplianceAlert =
        complianceIssue?.blockingAlerts[0] ?? complianceIssue?.warningAlerts[0];
      const missingEmail = !row.agent.email;
      const hasForcedCompliance = hasComplianceBlock && canForceCompliance;

      setEmailPreview({
        kind: "agent",
        status:
          missingEmail || (hasComplianceBlock && !hasForcedCompliance)
            ? "blocked"
            : "ready",
        statusLabel: missingEmail
          ? "Email agent manquant"
          : hasComplianceBlock && !hasForcedCompliance
            ? "Dossier agent bloquant"
            : hasForcedCompliance
              ? "Pret avec forçage tracé"
            : "Pret pour envoi",
        fromName: identity.fromName,
        fromEmail: identity.fromEmail,
        replyTo: identity.replyTo,
        toName: row.label,
        toEmail: row.agent.email ?? null,
        subject: `Votre planning - ${period}`,
        preheader: `${row.vacations.length} vacation(s) planifiee(s) sur ${sitesText}.`,
        bodyLines: [
          `Bonjour ${row.label},`,
          `Votre planning pour la période du ${period} est prêt.`,
          `Vous etes planifie sur ${row.vacations.length} vacation(s). Sites concernés : ${sitesText}.`,
          "Le PDF joint fait foi pour vos horaires, lieux d'intervention et consignes opérationnelles.",
          "Merci de vérifier votre planning et de signaler rapidement toute anomalie a l'exploitation.",
          "Cordialement,",
          identity.fromName,
        ],
        attachments: [
          {
            label: `Planning agent - ${row.label}.pdf`,
            href: `/agent-planning/print/${dispatch.id}`,
            note: "PDF individuel, uniquement les vacations de cet agent.",
          },
        ],
        warnings: [
          missingEmail ? "L'agent n'a pas d'email renseigné." : "",
          hasComplianceBlock && firstComplianceAlert
            ? `Conformité bloquante : ${firstComplianceAlert}.`
            : "",
          hasForcedCompliance
            ? `Forçage exploitation tracé : ${forceComplianceReasonValue}.`
            : "",
          !hasComplianceBlock && firstComplianceAlert
            ? `Point dossier à vérifier : ${firstComplianceAlert}.`
            : "",
          identity.replyTo.includes("configurer")
            ? "L'email d'exploitation de l'agence n'est pas encore configure."
            : "",
        ].filter(Boolean),
      });
    },
    [
      agencyProfile,
      buildPreviewDispatch,
      canForceCompliance,
      complianceIssueByAgentId,
      emailSettings,
      forceComplianceReasonValue,
      range?.from,
      range?.to,
    ]
  );

  React.useEffect(() => {
    if (!dispatchOpen) return;

    setSelectedAgentIds(new Set(agentRows.map((row) => row.agent.id)));
    void loadHistory();
    void loadAgencyConfig();
  }, [agentRows, dispatchOpen, loadAgencyConfig, loadHistory]);

  React.useEffect(() => {
    if (selectedRowsComplianceBlocking.length > 0) return;

    setForceComplianceOverride(false);
    setForceComplianceReason("");
  }, [selectedRowsComplianceBlocking.length]);

  const toggleAgent = React.useCallback((agentId: string) => {
    setSelectedAgentIds((previous) => {
      const next = new Set(previous);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);

  const handleSend = React.useCallback(async () => {
    if (!range?.from || !range?.to || selectedRows.length === 0) return;

    setSending(true);
    try {
      const response = await apiFetch<DispatchPostResponse>(
        "/api/planning-dispatches",
        {
          method: "POST",
          body: {
            from: range.from,
            to: range.to,
            agentIds: selectedRows.map((row) => row.agent.id),
            vacationIds: selectedVacationIds,
            channel,
            forceComplianceOverride: canForceCompliance,
            forceComplianceReason: canForceCompliance
              ? forceComplianceReasonValue
              : null,
          },
        }
      );

      toast({
        title: "Planning diffusé",
        description:
          response.blocked && response.blocked.length > 0
            ? `${response.created} agent(s) préparé(s), ${response.blocked.length} bloqué(s) pour coordonnées ou conformité.`
            : channel === "portal"
              ? `${response.created} agent(s) ont reçu leur planning dans le portail agent.`
              : `${response.created} diffusion(s) simulée(s) et historisee(s).`,
      });
      await loadHistory();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Diffusion impossible",
        description:
          error instanceof Error
            ? error.message
            : "Impossible d'enregistrer la diffusion.",
      });
    } finally {
      setSending(false);
    }
  }, [
    loadHistory,
    range?.from,
    range?.to,
    selectedRows,
    selectedVacationIds,
    channel,
    canForceCompliance,
    forceComplianceReasonValue,
    toast,
  ]);

  const openHistoryPrintableDispatch = React.useCallback((entry: DispatchApiItem) => {
    openPrintableDispatch(entry);

    if (!entry.id || entry.id.startsWith("preview-")) return;

    const nowIso = new Date().toISOString();
    setHistory((previous) =>
      previous.map((item) =>
        item.id === entry.id
          ? {
              ...item,
              viewedAtIso: item.viewedAtIso ?? nowIso,
              lastViewedAtIso: nowIso,
              viewedCount: item.viewedCount ?? 0,
              printedAtIso: item.printedAtIso ?? nowIso,
              lastPrintedAtIso: nowIso,
              printedCount: (item.printedCount ?? 0) + 1,
            }
          : item
      )
    );
  }, []);

  return (
    <>
      <Sheet open={dispatchOpen} onOpenChange={setDispatchOpen}>
      <SheetContent className="overflow-y-auto border-l bg-white shadow-2xl dark:bg-slate-950 sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl font-black">
            <Send className="h-5 w-5 text-primary" />
            Diffusion agents
          </SheetTitle>
          <SheetDescription>
            Vue agent par agent avant envoi. On diffusé uniquement les vacations
            publiées, affectees et à jour.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          <div className="rounded-[1.75rem] border border-primary/20 bg-primary/5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">
                  Periode de diffusion
                </p>
                <h3 className="mt-1 text-2xl font-black">
                  {formatRange(range?.from, range?.to)}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedRows.length} agent(s) selectionne(s),{" "}
                  {selectedVacationIds.length} vacation(s) prêtes a envoyer.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl border border-border/60 bg-background p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Agents
                  </p>
                  <p className="mt-1 text-2xl font-black">
                    {agentRows.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Vacations
                  </p>
                  <p className="mt-1 text-2xl font-black">
                    {readyVacations.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Historique
                  </p>
                  <p className="mt-1 text-2xl font-black">{history.length}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black">Canal de diffusion</p>
                <p className="text-xs text-muted-foreground">
                  {channelDescription(channel)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/20 p-1 sm:grid-cols-4">
                {(["portal", "email", "whatsapp", "internal"] as DispatchChannel[]).map(
                  (item) => (
                    <Button
                      key={item}
                      type="button"
                      variant={channel === item ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setChannel(item)}
                      className="h-9 rounded-lg px-3 text-[10px] font-black uppercase tracking-[0.12em]"
                    >
                      {dispatchChannelLabel(item)}
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>

          {(channel === "email" || channel === "whatsapp") && (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-800 dark:text-sky-200">
              <div className="flex gap-3">
                <Send className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Mode simulation actif : aucun {channel === "email" ? "email" : "WhatsApp"} réel
                  ne partira aujourd&apos;hui. On crée l&apos;historique, la cible, et le PDF prêt a envoyer.
                </p>
              </div>
            </div>
          )}

          {selectedRowsMissingContact.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {selectedRowsMissingContact.length} agent(s) selectionne(s) n&apos;ont pas{" "}
                  {channel === "email" ? "d'email" : "de telephone"} et seront ignores
                  pour ce canal.
                </p>
              </div>
            </div>
          )}

          {selectedRowsComplianceBlocking.length > 0 && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-200">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-bold">
                    Dossier agent bloquant avant diffusion.
                  </p>
                  <p className="mt-1">
                    {selectedRowsComplianceBlocking
                      .slice(0, 3)
                      .map((row) => {
                        const issue = complianceIssueByAgentId.get(row.agent.id);
                        return `${row.label} : ${
                          issue?.blockingAlerts[0] ?? "conformité à corriger"
                        }`;
                      })
                      .join(" - ")}
                    {selectedRowsComplianceBlocking.length > 3
                      ? ` - +${selectedRowsComplianceBlocking.length - 3} autre(s)`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-red-500/25 bg-background/80 p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={forceComplianceOverride}
                    onCheckedChange={(checked) =>
                      setForceComplianceOverride(Boolean(checked))
                    }
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-black text-foreground">
                      Forcer la diffusion avec responsabilite exploitation
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      Le forçage sera tracé dans l&apos;historique et cote serveur.
                      Les agents sans email/telephone requis resteront bloqués.
                    </span>
                  </span>
                </label>

                {forceComplianceOverride && (
                  <div className="mt-3">
                    <Textarea
                      value={forceComplianceReason}
                      onChange={(event) =>
                        setForceComplianceReason(event.target.value)
                      }
                      rows={3}
                      placeholder="Motif obligatoire : ex. remplacement valide par le responsable, document fourni hors plateforme..."
                      className="resize-none rounded-2xl bg-background"
                    />
                    <p
                      className={cn(
                        "mt-2 text-xs font-bold",
                        canForceCompliance
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-red-700 dark:text-red-300"
                      )}
                    >
                      {canForceCompliance
                        ? "Forçage prêt : les dossiers bloquants seront diffusés et tracés."
                        : "Saisis un motif clair de 8 caracteres minimum pour forcer."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedRowsComplianceWarning.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {selectedRowsComplianceWarning.length} dossier(s) agent(s) restent
                  a compléter, sans blocage de diffusion.
                </p>
              </div>
            </div>
          )}

          {selectedRowsWorkloadAlerts.length > 0 && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-200">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-bold">
                    Volume horaire eleve détecté avant diffusion.
                  </p>
                  <p className="mt-1">
                    {selectedRowsWorkloadAlerts
                      .slice(0, 3)
                      .map((row) => `${row.label} : ${row.hours.toFixed(0)}h`)
                      .join(" - ")}
                    {selectedRowsWorkloadAlerts.length > 3
                      ? ` - +${selectedRowsWorkloadAlerts.length - 3} autre(s)`
                      : ""}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-[1.5rem] border border-emerald-500/25 bg-emerald-500/10 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <FileCheck2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">
                    Contrôle final avant diffusion
                  </p>
                  <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-100/80">
                    PDF, coordonnées et conformité sont vérifiés avant envoi.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openPreviewForRow(dispatchableSelectedRows[0] ?? selectedRows[0])}
                disabled={selectedRows.length === 0}
                className="border-emerald-500/30 bg-white/70 font-black text-emerald-800 hover:bg-white dark:bg-emerald-950/40 dark:text-emerald-100"
              >
                <Printer className="mr-2 h-4 w-4" />
                Voir un PDF
              </Button>
              {channel === "email" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    openEmailPreviewForRow(dispatchableSelectedRows[0] ?? selectedRows[0])
                  }
                  disabled={selectedRows.length === 0}
                  className="border-sky-500/30 bg-white/70 font-black text-sky-800 hover:bg-white dark:bg-sky-950/40 dark:text-sky-100"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  Voir email
                </Button>
              )}
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-emerald-500/20 bg-white/70 p-3 dark:bg-emerald-950/30">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800/70 dark:text-emerald-100/70">
                  Selection
                </p>
                <p className="mt-1 text-2xl font-black text-emerald-950 dark:text-emerald-50">
                  {selectedRows.length}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-white/70 p-3 dark:bg-emerald-950/30">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800/70 dark:text-emerald-100/70">
                  PDF prêts
                </p>
                <p className="mt-1 text-2xl font-black text-emerald-950 dark:text-emerald-50">
                  {selectedRows.length}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-white/70 p-3 dark:bg-emerald-950/30">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-800/70 dark:text-emerald-100/70">
                  Diffusables
                </p>
                <p className="mt-1 text-2xl font-black text-emerald-950 dark:text-emerald-50">
                  {dispatchableSelectedRows.length}
                </p>
              </div>
              <div
                className={cn(
                  "rounded-2xl border p-3",
                  selectedRowsBlockedCount > 0
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                    : "border-emerald-500/20 bg-white/70 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-50"
                )}
              >
                <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                  Bloques
                </p>
                <p className="mt-1 text-2xl font-black">
                  {selectedRowsBlockedCount}
                </p>
              </div>
            </div>
          </div>

          {(blockedCounts.draft > 0 ||
            blockedCounts.modifiéd > 0 ||
            blockedCounts.unassigned > 0) && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {blockedCounts.draft} brouillon(s),{" "}
                  {blockedCounts.modifiéd} a republiér et{" "}
                  {blockedCounts.unassigned} sans agent ne seront pas diffusés.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black">Vue planning agent</p>
                  <p className="text-xs text-muted-foreground">
                    Selectionne les agents a notifier.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelectedAgentIds(new Set(agentRows.map((row) => row.agent.id)))
                  }
                  disabled={agentRows.length === 0}
                >
                  Tout selectionner
                </Button>
              </div>

              {agentRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-8 text-center">
                  <Users className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 font-black">Aucun planning agent prêt</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Publie d&apos;abord les vacations et vérifié qu&apos;elles sont
                    affectees a un agent.
                  </p>
                </div>
              ) : (
                <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                  {agentRows.map((row) => {
                    const selected = selectedAgentIds.has(row.agent.id);
                    const missingChannelContact =
                      (channel === "email" && !row.agent.email) ||
                      (channel === "whatsapp" && !row.agent.phone);
                    const complianceIssue = complianceIssueByAgentId.get(row.agent.id);
                    const hasBlockingCompliance =
                      complianceIssue?.status === "blocking";
                    const hasWarningCompliance =
                      complianceIssue?.status === "warning";
                    const firstComplianceAlert =
                      complianceIssue?.blockingAlerts[0] ??
                      complianceIssue?.warningAlerts[0];

                    return (
                      <div
                        key={row.agent.id}
                        className={cn(
                          "rounded-2xl border p-4 transition",
                          selected
                            ? "border-primary/30 bg-primary/5"
                            : "border-border/60 bg-background"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => toggleAgent(row.agent.id)}
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background"
                              )}
                            >
                              {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-black">
                                {row.label}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {channel === "whatsapp"
                                  ? row.agent.phone || "Telephone manquant"
                                  : row.agent.email || row.agent.phone || "Canal interne"}
                              </span>
                              {selected && firstComplianceAlert && (
                                <span
                                  className={cn(
                                    "mt-1 block text-[11px] font-bold",
                                    hasBlockingCompliance
                                      ? "text-red-700 dark:text-red-300"
                                      : "text-amber-700 dark:text-amber-300"
                                  )}
                                >
                                  {firstComplianceAlert}
                                </span>
                              )}
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            {channel === "email" && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={() => openEmailPreviewForRow(row)}
                                title="Previsualiser l'email agent"
                              >
                                <Mail className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={() => openPreviewForRow(row)}
                              title="Previsualiser le PDF agent"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {missingChannelContact && selected && (
                              <Badge
                                variant="outline"
                                className="rounded-full border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300"
                              >
                                Coord. manquante
                              </Badge>
                            )}
                            {hasBlockingCompliance && selected && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]",
                                  canForceCompliance
                                    ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                    : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                                )}
                              >
                                {canForceCompliance ? "Forçage tracé" : "Dossier bloqué"}
                              </Badge>
                            )}
                            {hasWarningCompliance && selected && (
                              <Badge
                                variant="outline"
                                className="rounded-full border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300"
                              >
                                Dossier à vérifier
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className="rounded-full bg-background px-3 py-1 font-black"
                            >
                              {row.vacations.length}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {row.vacations.slice(0, 4).map((vacation) => (
                            <VacationLine key={vacation.id} vacation={vacation} />
                          ))}
                          {row.vacations.length > 4 && (
                            <p className="text-xs font-bold text-muted-foreground">
                              +{row.vacations.length - 4} autre(s) vacation(s)
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black">Historique</p>
                  <p className="text-xs text-muted-foreground">
                    Suivi lecture, PDF et confirmations.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {dispatchHistoryStats.total > 0 && (
                    <>
                      <Badge
                        variant="outline"
                        className="rounded-full border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300"
                      >
                        {dispatchHistoryStats.acknowledged} confirme(s)
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300"
                      >
                        {dispatchHistoryStats.viewed} consulte(s)
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300"
                      >
                        {dispatchHistoryStats.printed} PDF
                      </Badge>
                      <Badge
                        variant="outline"
                        className="rounded-full border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300"
                      >
                        {dispatchHistoryStats.followUp} relancée(s)
                      </Badge>
                    </>
                  )}
                  {historyLoading && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
                {history.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
                    Aucun envoi enregistre sur cette période.
                  </div>
                ) : (
                  history.slice(0, 18).map((entry) => (
                    <div
                      key={`${entry.agentId}-${entry.sentAtIso}-${entry.vacationCount}`}
                      className="rounded-2xl border border-border/60 bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">
                            {entry.agentName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {entry.vacationCount} vacation(s) -{" "}
                            {formatSentAt(entry.sentAtIso)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.id && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-full"
                              onClick={() => openHistoryPrintableDispatch(entry)}
                              title="Imprimer la fiche agent"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]",
                              entry.channel === "portal"
                                ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                : entry.channel === "email"
                                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                                  : entry.channel === "whatsapp"
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                            )}
                          >
                            {dispatchChannelLabel(entry.channel)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]",
                              statusBadgeTone(entry)
                            )}
                          >
                            {deliveryStatusLabel(entry)}
                          </Badge>
                          <History className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                      </div>
                      {entry.channel === "portal" && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {entry.acknowledgedAtIso
                            ? `Accuse le ${formatAcknowledgedAt(entry.acknowledgedAtIso)}`
                            : "Agent en attente de confirmation"}
                        </p>
                      )}
                      {entry.deliveryNote && entry.channel !== "portal" && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {entry.deliveryNote}
                          {entry.deliveryTarget ? ` Cible : ${entry.deliveryTarget}.` : ""}
                        </p>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] lg:grid-cols-4">
                        <DispatchTracePill
                          label="Envoye"
                          value={formatSentAt(entry.sentAtIso)}
                          active
                        >
                          <Send className="h-3.5 w-3.5" />
                        </DispatchTracePill>
                        <DispatchTracePill
                          label="Consulte"
                          value={
                            entry.lastViewedAtIso || entry.viewedAtIso
                              ? formatAcknowledgedAt(
                                  entry.lastViewedAtIso ?? entry.viewedAtIso
                                )
                              : "Non ouvert"
                          }
                          active={Boolean(
                            entry.lastViewedAtIso ||
                              entry.viewedAtIso ||
                              (entry.viewedCount ?? 0) > 0
                          )}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </DispatchTracePill>
                        <DispatchTracePill
                          label="PDF"
                          value={
                            entry.lastPrintedAtIso || entry.printedAtIso
                              ? formatAcknowledgedAt(
                                  entry.lastPrintedAtIso ?? entry.printedAtIso
                                )
                              : "Non imprime"
                          }
                          active={Boolean(
                            entry.lastPrintedAtIso ||
                              entry.printedAtIso ||
                              (entry.printedCount ?? 0) > 0
                          )}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </DispatchTracePill>
                        <DispatchTracePill
                          label="Accuse"
                          value={
                            entry.acknowledgedAtIso
                              ? formatAcknowledgedAt(entry.acknowledgedAtIso)
                              : "En attente"
                          }
                          active={Boolean(entry.acknowledgedAtIso)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </DispatchTracePill>
                      </div>
                      {dispatchNeedsFollowUp(entry) && (
                        <p className="mt-2 inline-flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                          <BellRing className="h-3.5 w-3.5" />
                          Relance a prevoir tant que l'agent n'a pas confirme.
                        </p>
                      )}
                      {entry.complianceOverride && (
                        <p className="mt-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-800 dark:text-sky-200">
                          Forçage conformité tracé :{" "}
                          {entry.complianceOverrideReason || "motif non renseigné"}
                        </p>
                      )}
                      {entry.siteNames.length > 0 && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {entry.siteNames.join(", ")}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDispatchOpen(false)}
            disabled={sending}
          >
            Retour au planning
          </Button>
          <Button
            type="button"
            onClick={handleSend}
            disabled={
              !range?.from ||
              !range?.to ||
              selectedRows.length === 0 ||
              dispatchableSelectedRows.length === 0 ||
              selectedVacationIds.length === 0 ||
              sending
            }
            className="bg-sky-600 text-white hover:bg-sky-700"
          >
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {channel === "portal"
              ? "Publier aux agents selectionnes"
              : channel === "internal"
                ? "Journaliser la diffusion"
                : "Simuler la diffusion"}
          </Button>
        </SheetFooter>
      </SheetContent>
      </Sheet>
      <EmailPreviewDialog
        open={Boolean(emailPreview)}
        preview={emailPreview}
        onOpenChange={(open) => {
          if (!open) setEmailPreview(null);
        }}
      />
    </>
  );
};

const DispatchTracePill: React.FC<{
  label: string;
  value: string;
  active?: boolean;
  children: React.ReactNode;
}> = ({ label, value, active = false, children }) => (
  <div
    className={cn(
      "rounded-xl border px-2.5 py-2",
      active
        ? "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200"
        : "border-border/60 bg-muted/20 text-muted-foreground"
    )}
  >
    <div className="flex items-center gap-1.5">
      {children}
      <span className="text-[9px] font-black uppercase tracking-[0.14em]">
        {label}
      </span>
    </div>
    <p className="mt-1 truncate font-bold">{value}</p>
  </div>
);

const VacationLine: React.FC<{ vacation: VacationApiItem }> = ({ vacation }) => (
  <div className="rounded-xl border border-border/50 bg-background/80 px-3 py-2">
    <div className="flex items-start gap-2">
      <CalendarCheck2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="truncate text-xs font-black">
          {vacation.siteName || vacation.title || "Vacation"}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {formatMoment(vacation.startAtIso, vacation.endAtIso)}
          {vacation.missionType ? ` - ${vacation.missionType}` : ""}
        </p>
      </div>
    </div>
  </div>
);
