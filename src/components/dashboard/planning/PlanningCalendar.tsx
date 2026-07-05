"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import resourceTimelinePlugin from "@fullcalendar/resource-timeline";
import frLocale from "@fullcalendar/core/locales/fr";
import { useToast } from "@/hooks/use-toast";
import {
  getVacationPublicationStatus,
  usePlanning,
  VacationApiItem,
} from "./PlanningContext";
import {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
  EventMountArg,
  SlotLabelContentArg,
  SlotLaneContentArg,
} from "@fullcalendar/core";
import type { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import { CalendarPlus, ClipboardList, GripVertical, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { CalendarEvent } from "./CalendarEvent";
import { CalendarResource, type CalendarResourceInfo } from "./CalendarResource";
import { CalendarContextMenu } from "./CalendarContextMenu";

function toLocalDateTimeValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

type CalendarResourceMetricInfo = {
  resource: { id: string };
};

type DateClickWithResource = DateClickArg & {
  resource?: { id?: string };
};

type EventChangeWithResource = (EventDropArg | EventResizeDoneArg) & {
  newResource?: { id: string };
  oldResource?: { id: string };
};

const DENSITY_SOURCE_STORAGE_KEY = "sentrys:display-density-source";
const DENSITY_EVENT = "sentrys:density-change";
const AUTO_COMPACT_RESOURCE_THRESHOLD = 10;
const AUTO_COMPACT_EVENT_THRESHOLD = 80;
const AUTO_COMPACT_HEIGHT_THRESHOLD = 820;

export const PlanningCalendar: React.FC = () => {
  const {
    filteredVacations,
    loading,
    siteId,
    agentId,
    range,
    setRange,
    selectedIds,
    setSelectedIds,
    mode,
    setMode,
    tensionMode,
    stats,
    conflictIndex,
    pasteMode,
    performPasteAt,
    pasteBusy,
    setDetailsOpen,
    setReplaceOpen,
    setActiveVacationId,
    setPropagationOpen,
    updateVacation,
    duplicateVacation,
    setCreateOpen,
    setInitialCreateData,
    viewDensity,
    setDeleteConfirmOpen,
    setIdsToDelete,
    setSiteTemplateOpen,
    sortByUrgency,
    sites,
    agents,
    magicFill,
  } = usePlanning();

  const calendarRef = useRef<FullCalendar>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingScrollRestoreRef = useRef(false);
  const scrollSnapshotRef = useRef<Array<{ left: number; top: number }>>([]);
  const [contextMenu, setContextMenu] = React.useState<{ x: number, y: number, eventId: string } | null>(null);
  const [currentView, setCurrentView] = React.useState<string>("resourceTimelineMonth");
  const { toast } = useToast();
  const [autoDensityAllowed, setAutoDensityAllowed] = useState(true);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    function refreshAutoDensityPreference() {
      const source = window.localStorage.getItem(DENSITY_SOURCE_STORAGE_KEY);
      setAutoDensityAllowed(source !== "manual");
    }

    function updateViewportHeight() {
      setViewportHeight(window.innerHeight);
    }

    refreshAutoDensityPreference();
    updateViewportHeight();

    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("storage", refreshAutoDensityPreference);
    window.addEventListener(DENSITY_EVENT, refreshAutoDensityPreference);

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("storage", refreshAutoDensityPreference);
      window.removeEventListener(DENSITY_EVENT, refreshAutoDensityPreference);
    };
  }, []);

  const getTimelineScrollers = useCallback(() => {
    const root = containerRef.current;
    if (!root) return null;

    const resourceScroller =
      root.querySelector<HTMLElement>(".fc-datagrid-body .fc-scroller");
    const timelineScroller =
      root.querySelector<HTMLElement>(".fc-timeline-body .fc-scroller");

    if (!resourceScroller && !timelineScroller) return null;

    return {
      resourceScroller,
      timelineScroller,
    };
  }, []);

  const captureScrollPosition = useCallback(() => {
    const scrollers = getTimelineScrollers();
    if (!scrollers) return;

    scrollSnapshotRef.current = [
      {
        left: 0,
        top: scrollers.resourceScroller?.scrollTop ?? 0,
      },
      {
        left: scrollers.timelineScroller?.scrollLeft ?? 0,
        top: scrollers.timelineScroller?.scrollTop ?? 0,
      },
    ];
    pendingScrollRestoreRef.current = true;
  }, [getTimelineScrollers]);

  const restoreScrollPosition = useCallback(() => {
    if (!pendingScrollRestoreRef.current) return;

    const scrollers = getTimelineScrollers();
    if (!scrollers) return;

    const [resourceSnapshot, timelineSnapshot] = scrollSnapshotRef.current;

    if (scrollers.resourceScroller && resourceSnapshot) {
      scrollers.resourceScroller.scrollTop = resourceSnapshot.top;
    }

    if (scrollers.timelineScroller && timelineSnapshot) {
      scrollers.timelineScroller.scrollLeft = timelineSnapshot.left;
      scrollers.timelineScroller.scrollTop = timelineSnapshot.top;
    }
  }, [getTimelineScrollers]);

  const scheduleScrollRestore = useCallback(() => {
    if (!pendingScrollRestoreRef.current) return;

    const delays = [0, 80, 220, 500, 900, 1400];
    delays.forEach((delay) => {
      window.setTimeout(() => {
        restoreScrollPosition();
      }, delay);
    });

    window.setTimeout(() => {
      pendingScrollRestoreRef.current = false;
    }, 1800);
  }, [restoreScrollPosition]);

  // --- Calendar Data ---
  const events: EventInput[] = useMemo(() => {
    return filteredVacations
      .filter((v) => v.startAtIso && v.endAtIso)
      .flatMap((v) => {
        const isSelected = selectedIds.has(v.id);

        const getBaseClass = () => {
          if (v.status === "cancelled") return "evt-cancelled";
          if (v.status === "closed") return "evt-closed";
          const absKeywords = ["absence", "congÃ©", "vacances", "maladie", "repos", "conge"];
          if (absKeywords.some(kw => (v.title || "").toLowerCase().includes(kw) || (v.notes || "").toLowerCase().includes(kw))) return "evt-absence";
          if (v.status === "filled") return "evt-filled";
          if (v.status === "partially_filled") return "evt-partial";
          return ((v.assignedAgentIds?.length ?? 0) === 0 && (v.requiredAgents ?? 1) > 0) ? "evt-uncovered" : "evt-planned";
        };

        const baseClass = getBaseClass();
        const publicationStatus = getVacationPublicationStatus(v);
        const metas = conflictIndex.get(v.id) || [];
        const hasConflict = metas.length > 0;
        const conflictMessages = metas.map(m => m.message).join(" | ");

        // --- LOGIQUE EXCEL SNAPPING ---
        // En vue mensuelle, on arrondit aux limites de journÃ©e pour un aspect "case de tableur"
        let displayStart = v.startAtIso!;
        let displayEnd = v.endAtIso!;

        if (currentView === "resourceTimelineMonth") {
           const s = new Date(v.startAtIso!);
           s.setHours(0, 0, 0, 0);
           displayStart = s.toISOString();

           const e = new Date(v.endAtIso!);
           if (e.getHours() !== 0 || e.getMinutes() !== 0) {
             e.setHours(23, 59, 59, 999);
             displayEnd = e.toISOString();
           }
        }

        const baseProps = {
          id: v.id,
          title: v.title || v.siteName || "Mission",
          start: displayStart,
          end: displayEnd,
          classNames: [
            baseClass,
            isSelected ? "evt-selected" : "",
            hasConflict ? "evt-conflict" : "",
            tensionMode && hasConflict ? "evt-tension" : "",
            publicationStatus === "draft" ? "evt-draft" : "",
            publicationStatus === "published" ? "evt-published" : "",
            publicationStatus === "modified" ? "evt-publication-stale" : "",
            stats.maxDurationViolations.includes(v.id) ? "evt-legal-block" : "",
            stats.sstCoverageWarnings.includes(v.id) ? "evt-sst-warning" : "",
          ].filter(Boolean),
          extendedProps: {
            v,
            filled: v.assignedAgentIds?.length ?? 0,
            need: v.requiredAgents ?? 1,
            hasConflict,
            conflictMessages,
            publicationStatus,
            violatesRest:
              stats.restPeriodViolations.includes(v.id) ||
              stats.weeklyRestViolations.includes(v.id) ||
              stats.consecutiveDayViolations.includes(v.id),
            legalWarning: stats.maxDurationViolations.includes(v.id),
            sstWarning: stats.sstCoverageWarnings.includes(v.id),
            originalStart: v.startAtIso!,
            originalEnd: v.endAtIso!
          },
          editable: v.status !== "cancelled" && v.status !== "closed",
        };

        if (mode === "agent") {
          if (!v.assignedAgentIds || v.assignedAgentIds.length === 0) {
            return [{ ...baseProps, resourceId: "unassigned" }];
          }
          return v.assignedAgentIds.map((aid: string) => ({
            ...baseProps,
            id: `${v.id}-${aid}`,
            resourceId: aid,
          }));
        }

        return [{
          ...baseProps,
          resourceId: v.siteId || "unassigned",
        }];
      });
  }, [filteredVacations, selectedIds, tensionMode, conflictIndex, mode, stats, currentView]);

  // --- External Resources (Axe Y) ---
  const calendarResources = useMemo(() => {
    if (mode === "agent") {
      let filteredAgents = agents;
      if (agentId !== "all") {
        filteredAgents = agents.filter(a => a.id === agentId);
      }

      const agentRes = filteredAgents.map(a => ({
        id: a.id,
        title: `${a.firstName || ""} ${a.lastName || ""}`.trim().toUpperCase() || a.email || "Agent",
        extendedProps: { type: "agent", status: a.status }
      }));

      if (agentId !== "all") {
        return agentRes;
      }

      return [
        { id: "unassigned", title: "MISSIONS Ã€ POURVOIR", extendedProps: { type: "system" } },
        ...agentRes
      ];
    }

    const siteMap = new Map<string, { name: string, unassignedCount: number }>();
    const visibleSites =
      siteId === "all" ? sites : sites.filter((site) => site.id === siteId);

    visibleSites.forEach((site) => {
      siteMap.set(site.id, { name: site.name, unassignedCount: 0 });
    });

    filteredVacations.forEach(v => {
      const sid = v.siteId || "unassigned";
      const sname = v.siteName || "SITES Ã€ DÃ‰FINIR";

      // If we're filtering by a specific site and this mission isn't part of it, skip
      if (siteId !== "all" && sid !== siteId) return;

      if (!siteMap.has(sid)) siteMap.set(sid, { name: sname, unassignedCount: 0 });
      const filled = v.assignedAgentIds?.length ?? 0;
      const need = v.requiredAgents ?? 1;
      if (filled < need && v.status !== "cancelled" && v.status !== "closed") {
        siteMap.get(sid)!.unassignedCount += (need - filled);
      }
    });

    const resList = Array.from(siteMap.entries()).map(([id, data]) => ({
      id,
      title: data.name.toUpperCase(),
      extendedProps: { unassignedCount: data.unassignedCount, type: "site" }
    }));

    if (siteId === "all") {
      resList.sort((a, b) => {
        if (sortByUrgency && a.extendedProps.unassignedCount !== b.extendedProps.unassignedCount) {
          return b.extendedProps.unassignedCount - a.extendedProps.unassignedCount;
        }
        return a.title.localeCompare(b.title);
      });
    }

    return resList;
  }, [agentId, filteredVacations, sortByUrgency, mode, agents, sites, siteId]);

  const densityPressure = useMemo(() => {
    return (
      calendarResources.length >= AUTO_COMPACT_RESOURCE_THRESHOLD ||
      filteredVacations.length >= AUTO_COMPACT_EVENT_THRESHOLD ||
      (viewportHeight !== null && viewportHeight < AUTO_COMPACT_HEIGHT_THRESHOLD)
    );
  }, [calendarResources.length, filteredVacations.length, viewportHeight]);

  const effectiveDensity: "compact" | "comfortable" =
    autoDensityAllowed && densityPressure ? "compact" : viewDensity;

  useLayoutEffect(() => {
    if (!pendingScrollRestoreRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      restoreScrollPosition();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [events, calendarResources, restoreScrollPosition]);

  // --- Handlers ---
  const handleEventClick = useCallback((arg: EventClickArg) => {
    const v = arg.event.extendedProps.v as VacationApiItem;
    const js = arg.jsEvent;
    setActiveVacationId(v.id);
    setDetailsOpen(true);
    setSelectedIds((prev: Set<string>) => {
      const next = new Set(prev);
      if (js.ctrlKey || js.metaKey) {
        if (next.has(v.id)) next.delete(v.id); else next.add(v.id);
      } else {
        next.clear(); next.add(v.id);
      }
      return next;
    });
  }, [setSelectedIds, setActiveVacationId, setDetailsOpen]);

  const handleDateClick = useCallback((arg: DateClickArg) => {
    if (pasteMode && !pasteBusy) {
      performPasteAt(arg.date);
    } else {
      const clickedDate = arg.date as Date;
      const start = new Date(
        clickedDate.getFullYear(),
        clickedDate.getMonth(),
        clickedDate.getDate(),
        8,
        0,
        0,
        0
      );
      const end = new Date(
        clickedDate.getFullYear(),
        clickedDate.getMonth(),
        clickedDate.getDate(),
        18,
        0,
        0,
        0
      );
      const dateClick = arg as DateClickWithResource;
      const clickedResourceId =
        mode === "site" && dateClick.resource?.id && dateClick.resource.id !== "unassigned"
          ? dateClick.resource.id
          : undefined;

      setInitialCreateData({
        startAt: toLocalDateTimeValue(start),
        endAt: toLocalDateTimeValue(end),
        siteId: clickedResourceId,
      });
      setCreateOpen(true);
    }
    setContextMenu(null);
  }, [mode, pasteMode, pasteBusy, performPasteAt, setInitialCreateData, setCreateOpen]);

  const handleEventChange = useCallback(async (arg: EventDropArg | EventResizeDoneArg) => {
    const v = arg.event.extendedProps.v as VacationApiItem;
    if (v.status === "cancelled" || v.status === "closed") { arg.revert(); return; }
    const id = arg.event.id.split("-")[0];
    const patch: Partial<VacationApiItem> = {
      startAt: arg.event.startStr,
      endAt: arg.event.endStr,
    };
    captureScrollPosition();

    const resourceChange = arg as EventChangeWithResource;
    if (mode === "agent" && resourceChange.newResource && resourceChange.oldResource) {
      const targetAgentId = resourceChange.newResource.id;
      patch.assignedAgentIds =
        targetAgentId === "unassigned" ? [] : [targetAgentId];
    }

    const ok = await updateVacation(id, patch);
    if (!ok) { arg.revert(); toast({ variant: "destructive", title: "Erreur", description: "Ã‰chec de sauvegarde." }); }
    else { toast({ title: "Planning mis Ã  jour" }); }
    if (ok) {
      scheduleScrollRestore();
    } else {
      pendingScrollRestoreRef.current = false;
    }
  }, [captureScrollPosition, scheduleScrollRestore, updateVacation, toast, mode]);

  const handleEventDidMount = useCallback((arg: EventMountArg) => {
    const el = arg.el;
    el.oncontextmenu = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, eventId: arg.event.id });
    };
  }, []);

  const renderEventContent = (arg: EventContentArg) => (
    <CalendarEvent arg={arg} viewDensity={effectiveDensity} mode={mode} agents={agents} />
  );

  const renderResourceLabel = (info: CalendarResourceInfo) => (
    <CalendarResource info={info} mode={mode} stats={stats} viewDensity={effectiveDensity} />
  );

  const handleOpenSiteTemplate = useCallback(() => {
    setMode("site");
    setSiteTemplateOpen(true);
  }, [setMode, setSiteTemplateOpen]);

  const handleQuickCreate = useCallback(() => {
    const baseDate = range?.from ? new Date(range.from) : new Date();
    const anchorDate = Number.isFinite(baseDate.getTime()) ? baseDate : new Date();
    const start = new Date(anchorDate);
    start.setHours(8, 0, 0, 0);

    const end = new Date(anchorDate);
    end.setHours(18, 0, 0, 0);

    const preferredSiteId = siteId !== "all" ? siteId : sites[0]?.id;

    setInitialCreateData({
      startAt: toLocalDateTimeValue(start),
      endAt: toLocalDateTimeValue(end),
      ...(preferredSiteId ? { siteId: preferredSiteId } : {}),
    });
    setCreateOpen(true);
  }, [range?.from, setCreateOpen, setInitialCreateData, siteId, sites]);

  const showEmptyStarter = !loading && filteredVacations.length === 0;

  return (
    <div ref={containerRef} className={cn(
      "flex-1 w-full bg-white/40 dark:bg-[#0f121e]/40 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-2xl overflow-hidden shadow-2xl relative group flex flex-col transition-all duration-500 excel-grid",
      effectiveDensity === "compact" ? "density-compact" : "density-comfortable"
    )}>
      {/* Operational Context Header (inspired by screenshot 1) */}
      {siteId !== "all" && (
        <div className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-border/10 p-4 flex flex-wrap items-center gap-6 animate-in slide-in-from-top duration-500">
           <div className="flex flex-col gap-1">
             <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Client</span>
             <div className="h-8 px-3 rounded bg-white dark:bg-slate-800 border border-border/50 flex items-center shadow-sm">
                <span className="text-xs font-bold text-primary truncate max-w-[200px]">SAMSIC SÃ‰CURITÃ‰</span>
             </div>
           </div>
           <div className="flex flex-col gap-1">
             <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Site</span>
             <div className="h-8 px-3 rounded bg-white dark:bg-slate-800 border border-border/50 flex items-center shadow-sm">
                <span className="text-xs font-bold truncate max-w-[200px]">{sites.find(s => s.id === siteId)?.name || "SITE"}</span>
             </div>
           </div>
           <div className="flex flex-col gap-1">
             <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Presta</span>
             <div className="h-8 px-3 rounded bg-white dark:bg-slate-800 border border-border/50 flex items-center shadow-sm">
                <span className="text-xs font-bold">SURVEILLANCE GARDIENNAGE</span>
             </div>
           </div>
           <div className="flex flex-col gap-1 ml-auto">
             <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Titre</span>
             <div className="h-8 px-3 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center shadow-sm">
                <span className="text-[10px] font-black text-indigo-600">ADS</span>
             </div>
           </div>
           <div className="flex flex-col gap-1">
             <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">ActivitÃ©</span>
             <div className="h-8 px-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center shadow-sm">
                <span className="text-[10px] font-black text-emerald-600 uppercase">Agent de SÃ©curitÃ©</span>
             </div>
           </div>
        </div>
      )}

      {showEmptyStarter && (
        <div className="pointer-events-none absolute inset-x-4 top-20 z-30 flex justify-center md:top-24">
          <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-[1.75rem] border border-primary/20 bg-background/95 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:bg-slate-950/95">
            <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">
                    Demarrage guide
                  </p>
                  <h3 className="mt-1 text-lg font-black text-foreground">
                    Planning vierge, on le remplit proprement.
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Utilise un planning type pour creer une semaine complete par site,
                    ou ajoute une premiere vacation standard 08h-18h. Le but : que
                    meme un novice sache quoi faire en moins de dix secondes.
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
                <Button
                  type="button"
                  onClick={handleOpenSiteTemplate}
                  className="h-11 rounded-xl px-4 text-xs font-black uppercase tracking-[0.16em]"
                >
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Remplir un site
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleQuickCreate}
                  className="h-11 rounded-xl px-4 text-xs font-bold"
                >
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  Vacation 08h-18h
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {autoDensityAllowed && densityPressure && viewDensity !== "compact" && (
        <span className="sr-only">Mode compact automatique actif.</span>
      )}

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, resourceTimelinePlugin]}
        initialView="resourceTimelineMonth"
        schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
        resourceAreaWidth={mode === "agent" ? (effectiveDensity === "compact" ? "470px" : "560px") : (effectiveDensity === "compact" ? "260px" : "320px")}
        resourceAreaColumns={mode === "agent" ? [
          {
            headerContent: () => <span className="text-[10px] font-black uppercase tracking-widest pl-2 font-mono">Effectifs Agents</span>,
            cellContent: renderResourceLabel,
            width: effectiveDensity === "compact" ? 185 : 220
          },
          {
            headerContent: () => <span className="text-[9px] font-black pointer-events-none opacity-60">RÃ‰ALISÃ‰</span>,
            cellContent: (info: CalendarResourceMetricInfo) => {
               const hours = stats.agentMonthlyHours[info.resource.id] || 0;
               return <div className="text-right pr-2 text-[10px] font-black tabular-nums">{hours.toFixed(1)}h</div>;
            },
            width: effectiveDensity === "compact" ? 58 : 70
          },
          {
            headerContent: () => <span className="text-[9px] font-black pointer-events-none opacity-60">CONTRAT</span>,
            cellContent: (info: CalendarResourceMetricInfo) => {
               const chours = stats.agentContractualHours[info.resource.id] || 151.67;
               return <div className="text-right pr-2 text-[10px] font-black tabular-nums">{chours.toFixed(1)}h</div>;
            },
            width: effectiveDensity === "compact" ? 62 : 75
          },
          {
            headerContent: () => <span className="text-[9px] font-black pointer-events-none opacity-60">DELTA</span>,
            cellContent: (info: CalendarResourceMetricInfo) => {
               const hours = stats.agentMonthlyHours[info.resource.id] || 0;
               const chours = stats.agentContractualHours[info.resource.id] || 151.67;
               const delta = hours - chours;
               return (
                 <div className={cn(
                   "text-right pr-2 text-[10px] font-black tabular-nums",
                   delta === 0 ? "text-slate-400" : (delta > 0 ? "text-red-500 font-bold" : "text-emerald-500 font-bold")
                 )}>
                   {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                 </div>
               );
            },
            width: effectiveDensity === "compact" ? 55 : 65
          },
          {
            headerContent: () => <span className="text-[9px] font-black pointer-events-none opacity-60">%</span>,
            cellContent: (info: CalendarResourceMetricInfo) => {
               const hours = stats.agentMonthlyHours[info.resource.id] || 0;
               const chours = stats.agentContractualHours[info.resource.id] || 151.67;
               const ratio = (hours / chours) * 100;
               return <div className="text-right pr-2 text-[10px] font-black tabular-nums">{Math.round(ratio)}%</div>;
            },
            width: effectiveDensity === "compact" ? 42 : 50
          },
          {
            headerContent: () => <span className="text-[9px] font-black pointer-events-none text-center opacity-60">JS</span>,
            cellContent: (info: CalendarResourceMetricInfo) => {
               const days = stats.agentWorkingDays[info.resource.id] || 0;
               return <div className="text-center text-[10px] font-black tabular-nums">{days}</div>;
            },
            width: effectiveDensity === "compact" ? 38 : 45
          }
        ] : undefined}
        resources={calendarResources}
        resourceLabelContent={mode === "site" ? renderResourceLabel : undefined}
        resourceAreaHeaderContent={mode === "site" ? () => (
           <div className="flex items-center gap-2 px-2">
             <GripVertical className="h-3 w-3 opacity-30" />
             <span className="font-black tracking-widest text-[10px] uppercase">
               SITES OPÃ‰RATIONNELS
             </span>
           </div>
        ) : undefined}
        eventMinHeight={effectiveDensity === "compact" ? 24 : 45}
        slotLaneClassNames={(arg: SlotLaneContentArg) => {
          if (!arg.date) return [];
          const hour = arg.date.getHours();
          const isNight = hour < 6 || hour >= 21;
          const isWeekend = arg.date.getDay() === 0 || arg.date.getDay() === 6;
          return [isNight ? "slot-night" : "", isWeekend ? "slot-weekend" : ""].filter(Boolean);
        }}
        slotLabelClassNames={(arg: SlotLabelContentArg) => {
          const isWeekend = arg.date.getDay() === 0 || arg.date.getDay() === 6;
          return isWeekend ? ["slot-weekend-label"] : [];
        }}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "resourceTimelineMonth,resourceTimelineWeek,resourceTimelineDay,dayGridMonth",
        }}
        buttonText={{
          resourceTimelineMonth: "Mois",
          resourceTimelineWeek: "Semaine",
          resourceTimelineDay: "Jour",
          dayGridMonth: "Grille",
          today: "Aujourd'hui"
        }}
        locales={[frLocale]}
        locale="fr"
        firstDay={1}
        nowIndicator
        height="100%"
        stickyHeaderDates
        views={{
          resourceTimelineMonth: {
            slotDuration: { days: 1 },
            slotLabelInterval: { days: 1 },
            slotLabelFormat: [
              { weekday: "short" },
              { day: "2-digit", month: "2-digit" },
            ],
            slotMinWidth: effectiveDensity === "compact" ? 88 : 120,
          },
          resourceTimelineWeek: {
            slotDuration: { days: 1 },
            slotLabelInterval: { days: 1 },
            slotLabelFormat: [
              { weekday: "short" },
              { day: "2-digit", month: "2-digit" },
            ],
            slotMinWidth: effectiveDensity === "compact" ? 110 : 150,
          },
          resourceTimelineDay: {
            slotDuration: "01:00:00",
            slotLabelInterval: "01:00:00",
            slotLabelFormat: {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            },
            slotMinWidth: effectiveDensity === "compact" ? 70 : 90,
          },
        }}
        slotLabelInterval="01:00:00"
        slotLabelFormat={{
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }}
        dayHeaderFormat={{
          weekday: "short",
        }}
        allDaySlot={false}
        slotDuration="00:30:00"
        slotMinWidth={effectiveDensity === "compact" ? 48 : 60}
        snapDuration="00:15:00"
        scrollTimeReset={false}
        editable={true}
        eventDurationEditable={true}
        selectable={true}
        selectMirror={true}
        unselectAuto={true}
        forceEventDuration={true}
        allDayMaintainDuration={true}
        eventLongPressDelay={0}
        selectLongPressDelay={0}
        dragRevertDuration={250}
        eventResourceEditable={mode === "agent"}
        eventStartEditable={true}
        eventResizableFromStart={true}
        events={events}
        eventContent={renderEventContent}
        eventDidMount={handleEventDidMount}
        eventClick={handleEventClick}
        dateClick={handleDateClick}
        eventDrop={handleEventChange}
        eventResize={handleEventChange}
        datesSet={(info: DatesSetArg) => {
          const start = info.start.toISOString();
          const end = info.end.toISOString();
          if (range?.from !== start || range?.to !== end) {
            setRange({ from: start, to: end });
          }
          if (currentView !== info.view.type) {
            setCurrentView(info.view.type);
          }
        }}
      />

      {contextMenu && (
        <CalendarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          eventId={contextMenu.eventId}
          onClose={() => setContextMenu(null)}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          filteredVacations={filteredVacations}
          setActiveVacationId={setActiveVacationId}
          setDetailsOpen={setDetailsOpen}
          setReplaceOpen={setReplaceOpen}
          duplicateVacation={duplicateVacation}
          openPropagation={(id) => {
            setActiveVacationId(id);
            setPropagationOpen(true);
          }}
          setIdsToDelete={setIdsToDelete}
          setDeleteConfirmOpen={setDeleteConfirmOpen}
          magicFill={magicFill}
        />
      )}

      <style jsx global>{`
        .fc {
          --fc-border-color: rgba(148, 163, 184, 0.28);
          --fc-today-bg-color: rgba(59, 130, 246, 0.06);
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f8fafc;
          font-family: inherit;
        }

        .dark .fc {
          --fc-border-color: rgba(255, 255, 255, 0.08);
          --fc-page-bg-color: #020617;
          --fc-neutral-bg-color: #0f172a;
        }

        .fc-license-message {
          display: none !important;
        }

        .fc-datagrid-cell {
          background: #ffffff;
          font-weight: 800;
          font-size: 0.75rem;
          color: hsl(var(--foreground));
        }

        .dark .fc-datagrid-cell {
          background: #020617;
        }

        .fc-timeline-slot {
          border-left: 1px solid var(--fc-border-color) !important;
        }

        .fc-theme-standard td, .fc-theme-standard th {
          border: 1px solid var(--fc-border-color) !important;
        }

        .fc-theme-standard .fc-scrollgrid {
          border: 1px solid var(--fc-border-color) !important;
          border-radius: 10px;
          overflow: hidden;
        }

        .fc .fc-col-header-cell {
          background: #f8fafc;
          padding: 12px 0 !important;
          text-transform: uppercase;
          font-size: 0.7rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          color: hsl(var(--muted-foreground));
          border-bottom: 2px solid var(--fc-border-color) !important;
        }

        .dark .fc .fc-col-header-cell {
          background: #0f172a;
        }

        .fc .fc-datagrid-header {
          background: #e2e8f0;
        }

        .dark .fc .fc-datagrid-header {
          background: #111827;
        }

        .fc .fc-timeline-slot-cushion,
        .fc .fc-col-header-cell-cushion,
        .fc .fc-timegrid-slot-label-cushion {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-weight: 800;
        }

        .fc .fc-timeline-header-row-chrono th {
          background: #eef2f7;
        }

        .dark .fc .fc-timeline-header-row-chrono th {
          background: #111827;
        }

        .fc .fc-timeline-body .fc-resource,
        .fc .fc-timeline-lane-frame {
          background: #ffffff;
        }

        .dark .fc .fc-timeline-body .fc-resource,
        .dark .fc .fc-timeline-lane-frame {
          background: #020617;
        }

        .fc .fc-timeline-lane:nth-child(even),
        .fc .fc-datagrid-row:nth-child(even) .fc-datagrid-cell-frame {
          background: rgba(148, 163, 184, 0.06);
        }

        .dark .fc .fc-timeline-lane:nth-child(even),
        .dark .fc .fc-datagrid-row:nth-child(even) .fc-datagrid-cell-frame {
          background: rgba(255, 255, 255, 0.02);
        }

        .density-compact .fc-resource { height: 28px !important; }
        .density-compact .fc .fc-col-header-cell { padding: 6px 0 !important; font-size: 0.62rem; }
        .density-compact .fc-datagrid-cell { font-size: 0.68rem; }
        .density-compact .fc-event { min-height: 22px !important; }
        .density-comfortable .fc-resource { height: 52px !important; }

        .fc-event {
          border-radius: 12px !important;
          border-width: 1px !important;
          background-clip: padding-box !important;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.2) !important;
          overflow: hidden !important;
          transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s !important;
          backdrop-filter: blur(16px) saturate(180%);
        }

        .excel-grid .fc-event {
          border-radius: 0 !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          border-width: 0 !important;
          margin: 0 !important;
        }

        .fc-event:hover {
          box-shadow: 0 10px 20px -3px rgba(0,0,0,0.1) !important;
          z-index: 50 !important;
        }

        .excel-grid .fc-event:hover {
          box-shadow: inset 0 0 0 2px rgba(255,255,255,0.3) !important;
        }

        .evt-filled {
          background-color: rgba(16, 185, 129, 0.1) !important;
          border-color: rgba(16, 185, 129, 0.3) !important;
          color: #059669 !important;
        }

        .excel-grid .evt-filled {
          background-color: rgb(16, 185, 129) !important;
          color: white !important;
        }

        .dark .evt-filled {
          background-color: rgba(16, 185, 129, 0.15) !important;
          border-color: rgba(16, 185, 129, 0.4) !important;
          color: #34d399 !important;
        }

        .excel-grid.dark .evt-filled {
          background-color: rgb(5, 150, 105) !important;
          color: white !important;
        }

        .evt-partial {
          background-color: rgba(245, 158, 11, 0.1) !important;
          border-color: rgba(245, 158, 11, 0.3) !important;
          color: #d97706 !important;
        }

        .excel-grid .evt-partial {
          background-color: rgb(245, 158, 11) !important;
          color: rgb(69, 26, 3) !important;
        }

        .dark .evt-partial {
          background-color: rgba(245, 158, 11, 0.15) !important;
          border-color: rgba(245, 158, 11, 0.4) !important;
          color: #fbbf24 !important;
        }

        .excel-grid.dark .evt-partial {
          background-color: rgb(217, 119, 6) !important;
          color: white !important;
        }

        .evt-uncovered {
          background-color: rgba(239, 68, 68, 0.1) !important;
          border-color: rgba(239, 68, 68, 0.4) !important;
          color: #dc2626 !important;
        }

        .excel-grid .evt-uncovered {
          background-color: rgb(239, 68, 68) !important;
          color: white !important;
        }

        .dark .evt-uncovered {
          background-color: rgba(239, 68, 68, 0.15) !important;
          border-color: rgba(239, 68, 68, 0.5) !important;
          color: #f87171 !important;
        }

        .excel-grid.dark .evt-uncovered {
          background-color: rgb(220, 38, 38) !important;
          color: white !important;
        }

        .evt-conflict {
          background-image: repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(245, 158, 11, 0.1) 5px, rgba(245, 158, 11, 0.1) 10px) !important;
          border-style: dashed !important;
        }

        .evt-legal-block {
          box-shadow: inset 0 0 0 2px rgba(220, 38, 38, 0.72), 0 8px 16px -8px rgba(220, 38, 38, 0.42) !important;
        }

        .excel-grid .evt-legal-block {
          box-shadow: inset 0 0 0 3px rgb(185, 28, 28) !important;
        }

        .evt-sst-warning {
          box-shadow: inset 0 -3px 0 rgba(245, 158, 11, 0.78), 0 6px 14px -8px rgba(245, 158, 11, 0.45) !important;
        }

        .excel-grid .evt-sst-warning {
          box-shadow: inset 0 -4px 0 rgb(245, 158, 11) !important;
        }

        .evt-draft {
          border-style: dashed !important;
          box-shadow: inset 0 0 0 1px rgba(100, 116, 139, 0.38), 0 4px 6px -1px rgba(0,0,0,0.05) !important;
        }

        .evt-published {
          box-shadow: inset 0 -3px 0 rgba(16, 185, 129, 0.48), 0 4px 6px -1px rgba(0,0,0,0.05) !important;
        }

        .evt-publication-stale {
          border-color: rgba(245, 158, 11, 0.7) !important;
          box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.44), 0 8px 16px -6px rgba(245, 158, 11, 0.28) !important;
        }

        .excel-grid .evt-draft {
          background-image: repeating-linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.16) 5px, transparent 5px, transparent 10px) !important;
        }

        .excel-grid .evt-published {
          box-shadow: inset 0 -3px 0 rgba(255, 255, 255, 0.55) !important;
        }

        .excel-grid .evt-publication-stale {
          box-shadow: inset 0 0 0 3px rgb(251, 191, 36) !important;
        }

        .evt-selected {
          border-color: hsl(var(--primary)) !important;
          border-width: 2px !important;
          box-shadow: 0 0 0 2px hsl(var(--primary) / 0.22), 0 0 18px hsl(var(--primary) / 0.55) !important;
          animation: sentrys-selected-pulse 1.8s ease-out 2;
        }

        @keyframes sentrys-selected-pulse {
          0% {
            box-shadow: 0 0 0 0 hsl(var(--primary) / 0.45), 0 0 18px hsl(var(--primary) / 0.5);
          }
          70% {
            box-shadow: 0 0 0 9px hsl(var(--primary) / 0), 0 0 18px hsl(var(--primary) / 0.5);
          }
          100% {
            box-shadow: 0 0 0 0 hsl(var(--primary) / 0), 0 0 18px hsl(var(--primary) / 0.5);
          }
        }

        .fc-event-dragging {
          opacity: 0.9 !important;
          transform: scale(1.03) !important;
          z-index: 1000 !important;
        }

        .fc .slot-weekend {
          background: rgba(148, 163, 184, 0.08) !important;
        }

        .dark .fc .slot-weekend {
          background: rgba(148, 163, 184, 0.10) !important;
        }

        .fc .slot-weekend-label {
          background: rgba(148, 163, 184, 0.14) !important;
        }

        .dark .fc .slot-weekend-label {
          background: rgba(148, 163, 184, 0.16) !important;
        }

        .fc .fc-timegrid-slot-label-cushion,
        .fc .fc-timeline-slot-cushion {
          font-size: 11px;
          color: #475569;
        }

        .dark .fc .fc-timegrid-slot-label-cushion,
        .dark .fc .fc-timeline-slot-cushion {
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
};



