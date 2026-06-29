"use client";

import React from "react";
import { PlanningProvider } from "@/components/dashboard/planning/PlanningContext";
import { PlanningHeader } from "@/components/dashboard/planning/PlanningHeader";
import { PlanningCalendar } from "@/components/dashboard/planning/PlanningCalendar";
import { CreateVacationSheet } from "@/components/dashboard/planning/CreateVacationSheet";
import { VacationDetailsSheet } from "@/components/dashboard/planning/VacationDetailsSheet";
import { AssignAgentsSheet } from "@/components/dashboard/planning/AssignAgentsSheet";
import { AIAssistSheet } from "@/components/dashboard/planning/AIAssistSheet";
import { BulkActionBar } from "@/components/dashboard/planning/BulkActionBar";
import { PropagateVacationSheet } from "@/components/dashboard/planning/PropagateVacationSheet";
import { PropagateWeekSheet } from "@/components/dashboard/planning/PropagateWeekSheet";
import { SiteTemplateSheet } from "@/components/dashboard/planning/SiteTemplateSheet";
import { PeriodValidationSheet } from "@/components/dashboard/planning/PeriodValidationSheet";
import { AgentDispatchSheet } from "@/components/dashboard/planning/AgentDispatchSheet";
import { CoverageExpressSheet } from "@/components/dashboard/planning/CoverageExpressSheet";
import { SmartDistributionSheet } from "@/components/dashboard/planning/SmartDistributionSheet";
import { SiteDispatchSheet } from "@/components/dashboard/planning/SiteDispatchSheet";

export default function PlanningPage() {
  return (
    <PlanningProvider>
      <div className="relative flex flex-col h-[calc(100vh-theme(spacing.16))] w-full overflow-hidden bg-slate-50 dark:bg-[#030712] antialiased font-sans">

        {/* --- Immersive Background pour Glassmorphism --- */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-indigo-500/10 dark:bg-indigo-600/20 blur-[120px] rounded-full mix-blend-multiply dark:mix-blend-screen opacity-70 animate-pulse duration-10000" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[60%] h-[60%] bg-sky-400/10 dark:bg-sky-800/20 blur-[130px] rounded-full mix-blend-multiply dark:mix-blend-screen opacity-70" />
          <div className="absolute top-[30%] left-[20%] w-[40%] h-[40%] bg-emerald-400/5 dark:bg-teal-900/10 blur-[100px] rounded-full mix-blend-multiply dark:mix-blend-screen opacity-50" />
        </div>

        {/* --- Main Content (Elevated above background) --- */}
        <div className="relative z-10 flex flex-col h-full w-full p-4 lg:p-6 gap-6">
          {/* Module Header & Summary (Contains Filters) */}
          <PlanningHeader />

          {/* Main Work Area: The Calendar */}
          <PlanningCalendar />
        </div>

        {/* Modals & Interaction Layers */}
        <CreateVacationSheet />
        <VacationDetailsSheet />
        <AssignAgentsSheet />
        <PropagateVacationSheet />
        <PropagateWeekSheet />
        <SiteTemplateSheet />
        <CoverageExpressSheet />
        <SmartDistributionSheet />
        <SiteDispatchSheet />
        <PeriodValidationSheet />
        <AgentDispatchSheet />
        <AIAssistSheet />
        <BulkActionBar />

        {/* Global Planning Styles (Glassmorphism & Micro-animations) */}
        <style jsx global>{`
          .glass-effect {
            background: rgba(var(--background-rgb), 0.7);
            backdrop-filter: blur(12px) saturate(180%);
            -webkit-backdrop-filter: blur(12px) saturate(180%);
            border: 1px solid rgba(var(--border-rgb), 0.3);
          }
          .glass-button {
            background: rgba(var(--muted-rgb), 0.4) !important;
            backdrop-filter: blur(8px) !important;
            border-color: rgba(var(--border-rgb), 0.2) !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          .glass-button:hover {
            background: rgba(var(--primary-rgb), 0.1) !important;
            border-color: rgba(var(--primary-rgb), 0.3) !important;
            box-shadow: 0 4px 12px rgba(var(--primary-rgb), 0.1);
          }
          .anim-pulse {
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}</style>
      </div>
    </PlanningProvider>
  );
}
