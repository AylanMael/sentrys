"use client";

import React from "react";
import { EventContentArg } from "@fullcalendar/core";
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { computeAgentCompliance } from "@/lib/agents/compliance";
import {
  AgentApiItem,
  VacationApiItem,
  type VacationPublicationStatus,
} from "./PlanningContext";

interface CalendarEventProps {
  arg: EventContentArg;
  viewDensity: "compact" | "comfortable";
  mode: "site" | "agent";
  agents: AgentApiItem[];
}

type ComplianceIssue = {
  agent: AgentApiItem;
  compliance: ReturnType<typeof computeAgentCompliance>;
};

export const CalendarEvent: React.FC<CalendarEventProps> = ({
  arg,
  viewDensity,
  mode,
  agents,
}) => {
  if (!arg.event.extendedProps?.v) {
    return null;
  }

  const isCompact = viewDensity === "compact";

  const {
    v,
    filled,
    need,
    hasConflict,
    conflictMessages,
    publicationStatus,
    violatesRest,
    legalWarning,
    sstWarning,
    originalStart,
    originalEnd,
  } = arg.event.extendedProps as {
    v: VacationApiItem;
    filled: number;
    need: number;
    hasConflict: boolean;
    conflictMessages: string;
    publicationStatus: VacationPublicationStatus;
    violatesRest: boolean;
    legalWarning?: boolean;
    sstWarning?: boolean;
    originalStart?: string;
    originalEnd?: string;
  };

  const sanitizeTitle = (title: string | null) => {
    if (!title) return "";
    return title.replace(/\s*\(Copie\)\s*/gi, "").trim();
  };

  const sanitizeAgentName = (name: string) => {
    if (!name.includes("@")) return name;
    return name.split("@")[0].replace(/[._-]+/g, " ").trim();
  };

  const assignedComplianceIssue = v.assignedAgentIds
    ?.map((agentId: string) => {
      const agent = agents.find((item) => item.id === agentId);
      if (!agent) return null;

      const compliance = computeAgentCompliance(agent, {
        requiredQualification: v.requiredQualification,
      });

      return compliance.status === "blocking" || compliance.status === "warning"
        ? { agent, compliance }
        : null;
    })
    .find((item): item is ComplianceIssue => item !== null);

  const hasComplianceIssue = !!assignedComplianceIssue;
  const complianceErrorMessage = assignedComplianceIssue
    ? `${assignedComplianceIssue.compliance.alerts[0]?.title ?? "Dossier agent a controler"} pour ${assignedComplianceIssue.agent.firstName} ${assignedComplianceIssue.agent.lastName}`
    : "";

  const isUncovered = filled === 0 && need > 0;
  const displayTitle = sanitizeTitle(v.siteName) || sanitizeTitle(v.title) || "Mission";
  const secondaryTitle =
    sanitizeTitle(v.title) && sanitizeTitle(v.title) !== displayTitle
      ? sanitizeTitle(v.title)
      : null;
  const assignedAgentNames =
    v.assignedAgentIds
      ?.map((agentId: string) => {
        const agent = agents.find((item) => item.id === agentId);
        if (!agent) return null;
        return sanitizeAgentName(`${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim());
      })
      .filter((name): name is string => Boolean(name)) ?? [];
  const timelineTitle =
    mode === "agent"
      ? displayTitle
      : assignedAgentNames.length > 0
        ? assignedAgentNames.join(", ")
        : "Ã€ affecter";
  const timelineMeta = [
    mode === "agent" ? secondaryTitle : null,
    v.missionType,
    isUncovered ? "Ã€ pourvoir" : null,
  ].filter((item): item is string => Boolean(item));

  const startSource = originalStart || arg.event.start;
  const endSource = originalEnd || arg.event.end;

  const startTime = startSource
    ? new Date(startSource).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";
  const endTime = endSource
    ? new Date(endSource).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  const statusLabel =
    v.status === "cancelled"
      ? "Annulee"
      : v.status === "closed"
        ? "Cloturee"
        : isUncovered
          ? "Ã€ pourvoir"
          : filled < need
            ? "Partielle"
            : "Complete";

  const isEditable = v.status !== "cancelled" && v.status !== "closed";
  const publicationLabel =
    publicationStatus === "draft"
      ? "Brouillon"
      : publicationStatus === "modified"
        ? "A republier"
        : "Publie";
  const publicationBadgeClass =
    publicationStatus === "draft"
      ? "border-slate-300 bg-white/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
      : publicationStatus === "modified"
        ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
        : "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200";
  const showPublicationBadge = publicationStatus === "draft" || publicationStatus === "modified";
  const legalWarningTitle = legalWarning
    ? "Vacation superieure a 12h"
    : sstWarning
      ? "Vacation collective sans agent SST identifie"
      : "";

  const MiniBadge = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <span
      className={cn(
        "rounded-sm border font-black uppercase tracking-wider",
        isCompact ? "px-1 py-0 text-[7px]" : "px-1.5 py-0.5 text-[8px]",
        className
      )}
    >
      {children}
    </span>
  );

  if (arg.view.type === "dayGridMonth") {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center gap-1 px-1.5 py-0.5",
          isEditable ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        )}
      >
        <span className="w-11 shrink-0 text-[9px] font-black tabular-nums opacity-80">
          {startTime}
        </span>
        <span className="truncate text-[10px] font-bold leading-none">
          {displayTitle}
        </span>
        <span className="ml-auto shrink-0 text-[8px] font-black opacity-70">
          {filled}/{need}
        </span>
        {publicationStatus === "modified" && (
          <span className="shrink-0 rounded-sm bg-amber-100 px-1 text-[8px] font-black text-amber-800">
            Maj
          </span>
        )}
      </div>
    );
  }

  const isTimeline = arg.view.type.includes("resourceTimeline");
  if (isTimeline) {
    const showTimelineBadges =
      hasConflict || violatesRest || legalWarning || sstWarning || hasComplianceIssue || showPublicationBadge;

    return (
      <div
        className={cn(
          "flex h-full w-full flex-col justify-center text-left",
          isCompact ? "gap-0 border-l-2 px-1 py-0.5" : "gap-0.5 border-l-4 px-2 py-1",
          isEditable ? "cursor-grab active:cursor-grabbing" : "cursor-default",
          isUncovered
            ? "border-l-red-700"
            : filled < need
              ? "border-l-amber-600"
              : "border-l-emerald-700"
        )}
      >
        <div className={cn("flex items-center justify-between", isCompact ? "gap-1" : "gap-2")}>
          <span
            className={cn(
              "truncate uppercase tracking-tight",
              isCompact ? "text-[9px] font-bold" : "text-[10px] font-black"
            )}
          >
            {timelineTitle}
          </span>
          {(need > 1 || filled < need) && (
            <span className={cn("shrink-0 font-black tabular-nums", isCompact ? "text-[8px]" : "text-[9px]")}>
              {filled}/{need}
            </span>
          )}
        </div>
        <div
          className={cn(
            "flex items-center font-bold uppercase tracking-wide opacity-85",
            isCompact ? "gap-1 text-[7px]" : "gap-2 text-[8px]"
          )}
        >
          <span className="shrink-0 tabular-nums">
            {startTime} - {endTime}
          </span>
          {timelineMeta.map((item) => (
            <span key={item} className="truncate">{item}</span>
          ))}
          {v.status === "cancelled" && <span>{statusLabel}</span>}
        </div>
        {showTimelineBadges && (
          <div className={cn("flex flex-wrap", isCompact ? "mt-0 gap-0.5" : "mt-0.5 gap-1")}>
            {hasConflict && (
              <MiniBadge className="border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                Conflit
              </MiniBadge>
            )}
            {violatesRest && (
              <MiniBadge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                Repos
              </MiniBadge>
            )}
            {legalWarning && (
              <MiniBadge className="border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                CCN
              </MiniBadge>
            )}
            {sstWarning && (
              <MiniBadge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                SST
              </MiniBadge>
            )}
            {hasComplianceIssue && (
              <MiniBadge className="border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">
                Agent
              </MiniBadge>
            )}
            {showPublicationBadge && (
              <MiniBadge className={publicationBadgeClass}>
                {publicationLabel}
              </MiniBadge>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col gap-1 bg-transparent text-inherit",
        isEditable ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        isCompact ? "p-1.5" : "p-2.5"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className={cn("truncate uppercase leading-tight tracking-tight", isCompact ? "text-[10px] font-bold" : "text-[11px] font-black")}>
            {displayTitle}
          </div>
          {secondaryTitle && !isCompact && (
            <div className="truncate text-[9px] font-semibold opacity-70">
              {secondaryTitle}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasConflict && (
            <span title={conflictMessages}>
              <AlertCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            </span>
          )}
          {violatesRest && (
            <span title={conflictMessages || "Repos minimum a controler"}>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            </span>
          )}
          {(legalWarning || sstWarning) && (
            <span title={legalWarningTitle}>
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            </span>
          )}
          {hasComplianceIssue && (
            <span title={complianceErrorMessage}>
              <ShieldAlert className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </span>
          )}
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {v.missionType && (
          <MiniBadge className="border-primary/20 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/15">
            {v.missionType}
          </MiniBadge>
        )}
        <MiniBadge className="border-white/20 bg-black/10 text-current dark:bg-white/10">
          {statusLabel}
        </MiniBadge>
        {showPublicationBadge && (
          <MiniBadge className={publicationBadgeClass}>
            {publicationLabel}
          </MiniBadge>
        )}
      </div>

      <div
        className={cn(
          "mt-auto flex items-center gap-3 rounded-sm bg-black/10 px-2 py-1 font-black dark:bg-white/10",
          isCompact ? "text-[8px]" : "text-[10px]"
        )}
      >
        <div className="flex items-center gap-1">
          <Clock className={isCompact ? "h-2.5 w-2.5" : "h-3 w-3"} />
          <span>
            {startTime} - {endTime}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Users className={isCompact ? "h-2.5 w-2.5" : "h-3 w-3"} />
          <span>
            {filled}/{need}
          </span>
        </div>
      </div>

      {isUncovered && (
        <div className="absolute inset-y-0 left-0 w-1 bg-red-700" />
      )}
    </div>
  );
};


