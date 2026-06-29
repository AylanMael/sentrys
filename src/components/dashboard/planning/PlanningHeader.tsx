"use client";

import React from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronsUpDown,
  ClipboardPaste,
  Copy,
  FileText,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Wand2,
  Layout,
  LayoutList,
  TestTube2,
  UserPlus,
} from "lucide-react";
import {
  getVacationPublicationStatus,
  usePlanning,
} from "./PlanningContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OperationalSummary } from "./OperationalSummary";
import { OperationsActionCenter } from "./OperationsActionCenter";
import { cn } from "@/lib/utils";
import { PlanningFilters } from "./PlanningFilters";
import { PlanningLegend } from "./PlanningLegend";
import { apiFetch } from "@/lib/api/client-fetch";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const PlanningHeader: React.FC = () => {
  const {
    filteredVacations,
    vacations,
    sites,
    agents,
    siteId,
    selectedIds,
    handleCopy,
    handleStartPaste,
    handleCancelPaste,
    pasteMode,
    pasteBusy,
    tensionMode,
    setTensionMode,
    setInsightsOpen,
    setWeekPropagationOpen,
    setSiteTemplateOpen,
    setValidationOpen,
    setDispatchOpen,
    setSiteDispatchOpen,
    setCoverageOpen,
    setDistributionOpen,
    setCreateOpen,
    refresh,
    loading,
    magicFill,
    viewDensity,
    setViewDensity,
    sortByUrgency,
    setSortByUrgency,
    duplicateWeek,
    range,
  } = usePlanning();
  const { toast } = useToast();

  const handleSeed = async () => {
    if (sites.length === 0) {
      toast({
        variant: "destructive",
        title: "Action impossible",
        description: "Crée d'abord un site dans l'onglet Sites.",
      });
      return;
    }

    const site = sites[0];
    const agent = agents[0];

    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0);

      const res = await apiFetch<{ ok?: boolean }>("/api/vacations", {
        method: "POST",
        body: {
          siteId: site.id,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          title: "Mission de Test",
          status: "planned",
          assignedAgentIds: agent ? [agent.id] : [],
          requiredAgents: 1,
        },
      });

      if (res?.ok) {
        toast({
          title: "Données créées",
          description: "Une vacation de test a été ajoutée.",
        });
        await refresh();
      }
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description:
          error instanceof Error
            ? error.message
            : "Impossible de créer la vacation de test.",
      });
    }
  };

  const shownCount = filteredVacations.length;
  const publicationCounts = React.useMemo(
    () =>
      filteredVacations.reduce(
        (acc, vacation) => {
          const status = getVacationPublicationStatus(vacation);
          acc[status] += 1;
          return acc;
        },
        { draft: 0, published: 0, modified: 0 }
      ),
    [filteredVacations]
  );

  const rangeLabel = React.useMemo(() => {
    if (!range?.from || !range?.to) return "Période en cours";

    const formatter = new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    return `${formatter.format(new Date(range.from))} - ${formatter.format(new Date(range.to))}`;
  }, [range?.from, range?.to]);

  const selectionLabel = React.useMemo(() => {
    if (pasteMode) return "Mode collage actif";
    if (selectedIds.size <= 0) return null;
    return `${selectedIds.size} mission${selectedIds.size > 1 ? "s" : ""} sélectionnée${selectedIds.size > 1 ? "s" : ""}`;
  }, [pasteMode, selectedIds]);

  const canDuplicate = Boolean(range?.from);
  const canPublish = Boolean(range?.from && range?.to);
  const canPrintSitePlanning = Boolean(range?.from && range?.to);
  const showSeed = vacations.length === 0 && !loading;

  const openSitePlanningPrint = React.useCallback(() => {
    if (!range?.from || !range?.to) {
      toast({
        variant: "destructive",
        title: "Periode manquante",
        description: "Choisis une periode dans le planning avant d'imprimer.",
      });
      return;
    }

    if (sites.length === 0) {
      toast({
        variant: "destructive",
        title: "Aucun site",
        description: "Cree au moins un site avant de generer un PDF site.",
      });
      return;
    }

    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
    });

    if (siteId && siteId !== "all") {
      params.set("siteId", siteId);
    }

    window.open(
      `/site-planning/print?${params.toString()}`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [range?.from, range?.to, siteId, sites.length, toast]);

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-6 duration-700 ease-out">
      <div className="rounded-[1.75rem] border border-border/50 bg-background/90 shadow-sm">
        <div className="flex flex-col gap-4 p-4 md:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <CalendarClock className="h-5 w-5" />
              </div>

              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-foreground">
                    Planning
                  </h1>
                  <Badge
                    variant="outline"
                    className="h-6 rounded-full border-primary/20 bg-primary/5 px-2.5 text-[11px] font-bold text-primary"
                  >
                    {shownCount} mission{shownCount > 1 ? "s" : ""}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="h-6 rounded-full border-border/60 bg-muted/40 px-2.5 text-[11px] font-semibold text-muted-foreground"
                  >
                    {rangeLabel}
                  </Badge>
                  {publicationCounts.draft > 0 && (
                    <Badge
                      variant="outline"
                      className="h-6 rounded-full border-slate-300 bg-slate-100 px-2.5 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {publicationCounts.draft} brouillon
                      {publicationCounts.draft > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {publicationCounts.modified > 0 && (
                    <Badge
                      variant="outline"
                      className="h-6 rounded-full border-amber-500/30 bg-amber-500/10 px-2.5 text-[11px] font-black text-amber-700 dark:text-amber-300"
                    >
                      {publicationCounts.modified} a republier
                    </Badge>
                  )}
                  {selectionLabel && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-6 rounded-full px-2.5 text-[11px] font-semibold",
                        pasteMode
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-700"
                      )}
                    >
                      {selectionLabel}
                    </Badge>
                  )}
                </div>

                <p className="max-w-2xl text-sm text-muted-foreground">
                  Organise les vacations, affecte les agents et traite les urgences
                  sans te perdre dans des outils secondaires.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {(selectedIds.size > 0 || pasteMode) && (
                <div className="flex items-center gap-1 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-1">
                  {!pasteMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopy}
                      disabled={selectedIds.size === 0}
                      className="h-9 rounded-xl px-3 text-xs font-bold text-amber-700 hover:bg-amber-500/10"
                    >
                      <Copy className="mr-2 h-3.5 w-3.5" />
                      Copier
                    </Button>
                  )}
                  <Button
                    variant={pasteMode ? "default" : "ghost"}
                    size="sm"
                    onClick={() => (pasteMode ? handleCancelPaste() : handleStartPaste())}
                    disabled={pasteBusy}
                    className={cn(
                      "h-9 rounded-xl px-3 text-xs font-bold",
                      pasteMode
                        ? "bg-primary text-primary-foreground"
                        : "text-amber-700 hover:bg-amber-500/10"
                    )}
                  >
                    <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
                    {pasteMode ? "Annuler le collage" : "Coller"}
                  </Button>
                </div>
              )}

              <Button
                variant={tensionMode ? "destructive" : "outline"}
                size="sm"
                onClick={() => setTensionMode(!tensionMode)}
                className={cn(
                  "h-10 rounded-xl px-4 text-xs font-bold",
                  !tensionMode && "border-border/60 bg-background"
                )}
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                {tensionMode ? "Mode tension actif" : "Mode tension"}
              </Button>

              <Button
                variant="outline"
                onClick={() => setSiteTemplateOpen(true)}
                size="sm"
                className="h-10 rounded-xl border-primary/30 bg-primary/5 px-4 text-xs font-black uppercase tracking-[0.14em] text-primary hover:bg-primary/10"
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Remplir
              </Button>

              <Button
                variant="outline"
                onClick={() => setValidationOpen(true)}
                size="sm"
                disabled={!canPublish}
                className="h-10 rounded-xl border-emerald-500/30 bg-emerald-500/5 px-4 text-xs font-black uppercase tracking-[0.14em] text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Cockpit
              </Button>

              <Button
                variant="outline"
                onClick={() => setDispatchOpen(true)}
                size="sm"
                disabled={!canPublish}
                className="h-10 rounded-xl border-sky-500/30 bg-sky-500/5 px-4 text-xs font-black uppercase tracking-[0.14em] text-sky-700 hover:bg-sky-500/10 dark:text-sky-300"
              >
                <Send className="mr-2 h-4 w-4" />
                Diffuser
              </Button>

              <Button
                onClick={() => setCreateOpen(true)}
                size="sm"
                className="h-10 rounded-xl px-5 text-xs font-black uppercase tracking-[0.16em]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Créer
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={refresh}
                disabled={loading}
                className="h-10 w-10 rounded-xl border border-border/50 text-muted-foreground"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-xl border-border/60"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-[240px] rounded-2xl border-border/60 bg-background/95 p-2 shadow-xl backdrop-blur"
                >
                  <DropdownMenuLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    Actions avancées
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => setSiteTemplateOpen(true)}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Planning type par site
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canDuplicate}
                    onSelect={() => setCoverageOpen(true)}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <UserPlus className="h-4 w-4" />
                    Couverture express
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canDuplicate}
                    onSelect={() => setDistributionOpen(true)}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <Shuffle className="h-4 w-4" />
                    Repartition intelligente
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canDuplicate}
                    onSelect={() => {
                      if (range?.from) duplicateWeek(new Date(range.from));
                    }}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Reconduire la semaine
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canDuplicate}
                    onSelect={() => setWeekPropagationOpen(true)}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Reproduire sur une période
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canPublish}
                    onSelect={() => setValidationOpen(true)}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Cockpit validation
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canPublish}
                    onSelect={() => setDispatchOpen(true)}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <Send className="h-4 w-4" />
                    Diffuser aux agents
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canPrintSitePlanning}
                    onSelect={() => setSiteDispatchOpen(true)}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <Building2 className="h-4 w-4" />
                    Preparer remise client
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canPrintSitePlanning}
                    onSelect={openSitePlanningPrint}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <FileText className="h-4 w-4" />
                    {siteId && siteId !== "all"
                      ? "PDF du site filtre"
                      : "PDF des sites"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={loading}
                    onSelect={() => {
                      void magicFill();
                    }}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <Wand2 className="h-4 w-4 text-amber-600" />
                    Magic Fill
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setInsightsOpen(true)}
                    className="rounded-xl px-3 py-3 font-semibold"
                  >
                    <Sparkles className="h-4 w-4 text-indigo-500" />
                    Ouvrir les insights
                  </DropdownMenuItem>
                  {showSeed && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          void handleSeed();
                        }}
                        className="rounded-xl px-3 py-3 font-semibold"
                      >
                        <TestTube2 className="h-4 w-4" />
                        Générer une mission test
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <PlanningFilters />

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <div className="flex items-center gap-1 rounded-2xl border border-border/50 bg-muted/20 p-1">
                <PlanningLegend />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewDensity("comfortable")}
                  className={cn(
                    "h-8 w-8 rounded-xl",
                    viewDensity === "comfortable"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground"
                  )}
                >
                  <Layout className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewDensity("compact")}
                  className={cn(
                    "h-8 w-8 rounded-xl",
                    viewDensity === "compact"
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground"
                  )}
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortByUrgency(!sortByUrgency)}
                className={cn(
                  "h-10 rounded-xl px-4 text-xs font-bold",
                  sortByUrgency
                    ? "border-red-500/30 bg-red-500/10 text-red-600"
                    : "border-border/60 text-muted-foreground"
                )}
              >
                <ChevronsUpDown
                  className={cn("mr-2 h-3.5 w-3.5", sortByUrgency && "rotate-180")}
                />
                {sortByUrgency ? "Triage auto" : "Tri alpha"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <OperationalSummary />
      <OperationsActionCenter />
    </div>
  );
};
