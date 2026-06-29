"use client";

import React from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  ClockAlert,
  Loader2,
  PieChart,
  ShieldAlert,
  UserX,
} from "lucide-react";

import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePlanning } from "./PlanningContext";

export const OperationalSummary: React.FC = () => {
  const { ops, loading, stats, conflictIndex } = usePlanning();

  const coverage = ops.total > 0 ? Math.round((ops.full / ops.total) * 100) : 100;
  const conflictCount = conflictIndex.size;
  const restViolationCount = stats.restPeriodViolations.length;

  const StatBadge = ({
    label,
    value,
    icon: Icon,
    variant,
    description,
  }: {
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    variant: "emerald" | "amber" | "red" | "indigo";
    description: string;
  }) => {
    const variants = {
      emerald:
        "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 shadow-emerald-500/10",
      amber:
        "from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-700 dark:text-amber-400 shadow-amber-500/10",
      red:
        "from-red-500/20 to-red-500/5 border-red-500/30 text-red-700 dark:text-red-400 shadow-red-500/10",
      indigo:
        "from-indigo-500/20 to-indigo-500/5 border-indigo-500/30 text-indigo-700 dark:text-indigo-400 shadow-indigo-500/10",
    };

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                "group flex items-center gap-3 rounded-2xl border bg-gradient-to-br px-4 py-2 transition-all duration-500 hover:scale-[1.02] hover:shadow-lg",
                variants[variant]
              )}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/20 backdrop-blur-md transition-transform group-hover:rotate-12 dark:bg-black/20">
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-black leading-none tracking-tight">
                  {value}
                </span>
                <span className="mt-1 text-[10px] font-black uppercase leading-none tracking-widest opacity-60">
                  {label}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="border-white/10 bg-black/80 p-2 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur-xl"
          >
            {description}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="animate-in fade-in slide-in-from-top-4 flex flex-wrap items-center gap-4 rounded-[2rem] border border-white/20 bg-white/40 p-3 shadow-2xl shadow-black/10 backdrop-blur-2xl duration-700 dark:border-white/5 dark:bg-black/40">
      <div className="mr-2 flex items-center gap-4 px-4">
        <div className="relative">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/30 bg-primary/20 shadow-inner">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          {loading && (
            <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-primary dark:border-black">
              <Loader2 className="h-2 w-2 animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <span className="mb-1 text-[10px] font-black uppercase leading-none tracking-[0.2em] text-primary/80">
            Command Control
          </span>
          <span className="text-sm font-black leading-none text-slate-800 dark:text-slate-100">
            Planning opérationnel
          </span>
        </div>
      </div>

      <Separator orientation="vertical" className="hidden h-10 opacity-10 lg:block" />

      <div className="flex flex-1 flex-wrap gap-3 px-2">
        <StatBadge
          label="Complets"
          value={ops.full}
          icon={CheckCircle2}
          variant="emerald"
          description="Efficacité maximale : effectifs au complet"
        />
        <StatBadge
          label="Partiels"
          value={ops.partial}
          icon={PieChart}
          variant="amber"
          description="Couverture incomplète détectée"
        />
        <StatBadge
          label="À pourvoir"
          value={ops.uncovered}
          icon={CircleDashed}
          variant="red"
          description="Priorité haute : aucun agent affecté"
        />
        <StatBadge
          label="Absences"
          value={ops.absences}
          icon={UserX}
          variant="indigo"
          description="Absences et congés signalés"
        />
        <StatBadge
          label="Conflits"
          value={conflictCount}
          icon={ShieldAlert}
          variant={conflictCount > 0 ? "red" : "emerald"}
          description="Chevauchements, sous-effectifs et collisions détectés"
        />
        <StatBadge
          label="Repos"
          value={restViolationCount}
          icon={ClockAlert}
          variant={restViolationCount > 0 ? "amber" : "emerald"}
          description="Prises de service avec repos insuffisant"
        />
      </div>

      <div className="ml-auto flex items-center gap-4 rounded-2xl border border-black/5 bg-black/5 px-4 py-2 dark:border-white/5 dark:bg-white/5">
        <div className="flex flex-col items-end">
          <div
            className={cn(
              "flex items-center gap-2 text-xs font-black tracking-tighter",
              coverage < 80
                ? "text-red-500"
                : coverage < 100
                  ? "text-amber-500"
                  : "text-emerald-500"
            )}
          >
            <span className="text-[10px] uppercase opacity-50">
              Taux de couverture
            </span>
            <span className="text-lg">{coverage}%</span>
          </div>
          <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full border border-black/5 bg-slate-200 dark:border-white/5 dark:bg-slate-800">
            <div
              className={cn(
                "h-full transition-all duration-1000 ease-in-out shadow-[0_0_8px]",
                coverage < 80
                  ? "bg-red-500 shadow-red-500/50"
                  : coverage < 100
                    ? "bg-amber-500 shadow-amber-500/50"
                    : "bg-emerald-500 shadow-emerald-500/50"
              )}
              style={{ width: `${coverage}%` }}
            />
          </div>
        </div>

        {ops.missingAgents > 0 && (
          <div className="animate-pulse flex items-center gap-2 rounded-xl border border-white/20 bg-red-600 px-4 py-2 text-white shadow-xl shadow-red-500/30">
            <AlertTriangle className="h-4 w-4" />
            <div className="flex flex-col items-start leading-none">
              <span className="text-sm font-black">{ops.missingAgents}</span>
              <span className="text-[8px] font-black uppercase tracking-wider opacity-90">
                Postes critiques
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
