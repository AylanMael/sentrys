"use client";

import React from "react";
import { AlertCircle, GripVertical, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { PlanningStats } from "@/lib/planning/stats";

export type CalendarResourceInfo = {
  resource: {
    id: string;
    title: string;
    extendedProps: {
      type?: "agent" | "site" | "system";
      unassignedCount?: number;
      status?: string;
    };
  };
};

interface CalendarResourceProps {
  info: CalendarResourceInfo;
  mode: "site" | "agent";
  stats: PlanningStats;
  viewDensity?: "compact" | "comfortable";
}

export const CalendarResource: React.FC<CalendarResourceProps> = ({
  info,
  mode,
  stats,
  viewDensity = "comfortable",
}) => {
  void mode;
  const isCompact = viewDensity === "compact";
  const { type, unassignedCount, status: agentStatus } =
    info.resource.extendedProps;
  const pendingCount = unassignedCount ?? 0;

  if (type === "agent") {
    const initials =
      info.resource.title
        .split(" ")
        .map((name: string) => name[0])
        .join("")
        .slice(0, 2) || "AG";
    const monthlyHours = stats.agentMonthlyHours[info.resource.id] || 0;
    const contractHours = stats.agentContractualHours[info.resource.id] || 151.67;
    const delta = monthlyHours - contractHours;
    const isOver = delta > 0;

    return (
      <div
        className={cn(
          "flex h-full w-full items-center border-b border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-950",
          isCompact ? "gap-1 px-1.5 py-0.5" : "gap-2 px-2 py-1"
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-sm border font-black",
            isCompact ? "h-5 w-5 text-[7px]" : "h-6 w-6 text-[8px]",
            isOver
              ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              : "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
          )}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate uppercase tracking-tight text-slate-800 dark:text-slate-200",
              isCompact ? "text-[9px] font-bold" : "text-[10px] font-black"
            )}
          >
            {info.resource.title}
          </div>
          {!isCompact && (
            <div className="mt-0.5 flex items-center gap-2 text-[9px] font-semibold text-slate-500 dark:text-slate-400">
              <span>{monthlyHours.toFixed(1)} h</span>
              <span>contrat {contractHours.toFixed(1)} h</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "shrink-0 rounded-full",
            isCompact ? "h-2 w-2" : "h-2.5 w-2.5",
            agentStatus === "active" ? "bg-emerald-500" : "bg-slate-300"
          )}
        />
      </div>
    );
  }

  if (type === "system") {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center border-b border-red-200 bg-red-50 text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300",
          isCompact ? "gap-1 px-1.5 py-1" : "gap-2 px-2 py-2"
        )}
      >
        <AlertCircle className={cn("animate-pulse", isCompact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        <span className={cn("font-extrabold uppercase tracking-widest", isCompact ? "text-[8px]" : "text-[9px]")}>{info.resource.title}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center border-b border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-950",
        isCompact ? "gap-0 px-1.5 py-1" : "gap-1 px-2 py-2"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-sm border border-primary/20 bg-primary/10",
              isCompact ? "h-5 w-5" : "h-6 w-6"
            )}
          >
            <Users className={cn("text-primary", isCompact ? "h-2.5 w-2.5" : "h-3 w-3")} />
          </div>
          <span
            className={cn(
              "truncate uppercase tracking-tight text-slate-800 dark:text-slate-200",
              isCompact ? "text-[9px] font-bold" : "text-[10px] font-black"
            )}
          >
            {info.resource.title}
          </span>
        </div>
        {pendingCount > 0 && (
          <div
            className={cn(
              "flex min-w-[20px] items-center justify-center rounded-sm bg-red-600 font-black text-white",
              isCompact ? "px-1 py-0 text-[7px]" : "px-1.5 py-0.5 text-[8px]"
            )}
          >
            {pendingCount}
          </div>
        )}
      </div>
      {!isCompact && (
        <div className="pl-8 text-[8px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {pendingCount > 0
            ? `${pendingCount} vacation${pendingCount > 1 ? "s" : ""} a couvrir`
            : "Couverture maitrisee"}
        </div>
      )}
    </div>
  );
};

export const ResourceAreaHeader: React.FC<{ mode: "site" | "agent" }> = ({
  mode,
}) => (
  <div className="flex items-center gap-2 px-2">
    <GripVertical className="h-3 w-3 opacity-30" />
    <span className="text-[10px] font-black uppercase tracking-widest">
      {mode === "site" ? "Sites operationnels" : "Effectifs agents"}
    </span>
  </div>
);
