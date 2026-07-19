"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  UserPlus,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client-fetch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  usePlanning,
  type AgentApiItem,
  type VacationApiItem,
} from "./PlanningContext";

type BulkResponse = {
  ok: boolean;
  results?: Array<{ id?: string; ok?: boolean; error?: string }>;
};

function activeOnly(vacation: VacationApiItem) {
  return vacation.status !== "cancelled" && vacation.status !== "closed";
}

function missingAgents(vacation: VacationApiItem) {
  const required = Math.max(1, Number(vacation.requiredAgents ?? 1));
  const assigned = Array.isArray(vacation.assignedAgentIds)
    ? vacation.assignedAgentIds.length
    : 0;

  return Math.max(0, required - assigned);
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

function agentLabel(agent: AgentApiItem) {
  const firstName = String(agent.firstName ?? "").trim();
  const lastName = String(agent.lastName ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || agent.email || agent.phone || agent.id;
}

function formatRange(from?: string, to?: string) {
  if (!from || !to) return "Periode courante";

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
  });

  return `${formatter.format(new Date(from))} - ${formatter.format(new Date(to))}`;
}

function formatVacation(vacation: VacationApiItem) {
  const site = vacation.siteName || vacation.title || "Vacation";
  const start = vacation.startAtIso ? new Date(vacation.startAtIso) : null;

  if (!start || Number.isNaN(start.getTime())) return site;

  return `${site} - ${start.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })}`;
}

function getVacationHours(vacation: VacationApiItem) {
  if (!vacation.startAtIso || !vacation.endAtIso) return 0;

  const start = Date.parse(vacation.startAtIso);
  const end = Date.parse(vacation.endAtIso);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }

  return (end - start) / 3_600_000;
}

export const CoverageExpressSheet: React.FC = () => {
  const {
    coverageOpen,
    setCoverageOpen,
    filteredVacations,
    vacations,
    sites,
    agents,
    siteId,
    setSiteId,
    setMode,
    range,
    refresh,
  } = usePlanning();
  const { toast } = useToast();
  const [selectedSiteId, setSelectedSiteId] = React.useState("");
  const [selectedAgentId, setSelectedAgentId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const uncoveredBySite = React.useMemo(() => {
    const counts = new Map<string, number>();

    filteredVacations.forEach((vacation) => {
      if (!activeOnly(vacation)) return;
      if (!vacation.siteId) return;
      if (missingAgents(vacation) <= 0) return;

      counts.set(vacation.siteId, (counts.get(vacation.siteId) ?? 0) + 1);
    });

    return counts;
  }, [filteredVacations]);

  React.useEffect(() => {
    if (!coverageOpen) return;

    const fallbackSite =
      (siteId !== "all" && uncoveredBySite.has(siteId) ? siteId : "") ||
      Array.from(uncoveredBySite.keys())[0] ||
      (siteId !== "all" ? siteId : "") ||
      sites[0]?.id ||
      "";

    setSelectedSiteId(fallbackSite);
    setSelectedAgentId((current) => current || agents[0]?.id || "");
  }, [agents, coverageOpen, siteId, sites, uncoveredBySite]);

  const selectedSite = React.useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites]
  );

  const selectedAgent = React.useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  const targetVacations = React.useMemo(
    () =>
      filteredVacations
        .filter((vacation) => vacation.siteId === selectedSiteId)
        .filter(activeOnly)
        .filter((vacation) => missingAgents(vacation) > 0)
        .sort(
          (left, right) =>
            Date.parse(left.startAtIso ?? "") - Date.parse(right.startAtIso ?? "")
        ),
    [filteredVacations, selectedSiteId]
  );

  const analysis = React.useMemo(() => {
    if (!selectedAgentId) {
      return {
        safe: [] as VacationApiItem[],
        conflicts: targetVacations,
        hours: 0,
      };
    }

    const alreadyAssigned = vacations.filter(
      (vacation) =>
        activeOnly(vacation) &&
        vacation.assignedAgentIds?.includes(selectedAgentId)
    );
    const accepted: VacationApiItem[] = [];
    const rejected: VacationApiItem[] = [];

    targetVacations.forEach((vacation) => {
      const hasExternalConflict = alreadyAssigned.some((existingVacation) => {
        if (existingVacation.id === vacation.id) return false;
        return intervalOverlaps(
          vacation.startAtIso,
          vacation.endAtIso,
          existingVacation.startAtIso,
          existingVacation.endAtIso
        );
      });
      const hasBatchConflict = accepted.some((acceptedVacation) =>
        intervalOverlaps(
          vacation.startAtIso,
          vacation.endAtIso,
          acceptedVacation.startAtIso,
          acceptedVacation.endAtIso
        )
      );

      if (hasExternalConflict || hasBatchConflict) {
        rejected.push(vacation);
        return;
      }

      accepted.push(vacation);
    });

    return {
      safe: accepted,
      conflicts: rejected,
      hours: accepted.reduce(
        (total, vacation) => total + getVacationHours(vacation),
        0
      ),
    };
  }, [selectedAgentId, targetVacations, vacations]);

  const handleSubmit = React.useCallback(async () => {
    if (!selectedAgent || analysis.safe.length === 0) return;

    setSubmitting(true);
    try {
      const operations = analysis.safe.map((vacation) => ({
        type: "update",
        id: vacation.id,
        data: {
          assignedAgentIds: [selectedAgent.id],
        },
      }));

      const response = await apiFetch<BulkResponse>("/api/vacations/bulk", {
        method: "POST",
        body: { operations },
      });
      const failed = response.results?.filter((result) => !result.ok).length ?? 0;
      const success = operations.length - failed;

      setMode("site");
      if (selectedSiteId) setSiteId(selectedSiteId);
      await refresh();

      toast({
        title: "Couverture appliquee",
        description:
          failed > 0
            ? `${success} vacation(s) affectee(s), ${failed} erreur(s), ${analysis.conflicts.length} conflit(s) ignore(s).`
            : `${success} vacation(s) affectee(s) a ${agentLabel(selectedAgent)}. ${analysis.conflicts.length} conflit(s) ignore(s).`,
      });

      if (success > 0) {
        setCoverageOpen(false);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couverture impossible",
        description:
          error instanceof Error
            ? error.message
            : "Impossible d'affecter les vacations non couvertes.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    analysis.conflicts.length,
    analysis.safe,
    refresh,
    selectedAgent,
    selectedSiteId,
    setCoverageOpen,
    setMode,
    setSiteId,
    toast,
  ]);

  return (
    <Sheet open={coverageOpen} onOpenChange={setCoverageOpen}>
      <SheetContent className="overflow-y-auto border-l bg-white shadow-2xl dark:bg-slate-950 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl font-black">
            <UserPlus className="h-5 w-5 text-primary" />
            Couverture express
          </SheetTitle>
          <SheetDescription>
            Affecte un agent aux vacations non couvertes d&apos;un site, sans
            toucher aux vacations deja affectees.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-6">
          <div className="rounded-[1.5rem] border border-primary/20 bg-primary/5 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Periode visible
            </p>
            <p className="mt-1 text-xl font-black">
              {formatRange(range?.from, range?.to)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              On traite uniquement les vacations affichees par les filtres du
              planning.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-black">Site a couvrir</p>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Choisir un site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                      {uncoveredBySite.get(site.id)
                        ? ` - ${uncoveredBySite.get(site.id)} a pourvoir`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-black">Agent a affecter</p>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Choisir un agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agentLabel(agent)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                A couvrir
              </p>
              <p className="mt-1 text-2xl font-black">{targetVacations.length}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Sans conflit
              </p>
              <p className="mt-1 text-2xl font-black">{analysis.safe.length}</p>
            </div>
            <div
              className={cn(
                "rounded-2xl border p-4",
                analysis.conflicts.length > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-border/60 bg-background text-muted-foreground"
              )}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Ignores
              </p>
              <p className="mt-1 text-2xl font-black">
                {analysis.conflicts.length}
              </p>
            </div>
          </div>

          {selectedSite && selectedAgent && analysis.safe.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {agentLabel(selectedAgent)} couvrira {analysis.safe.length} vacation(s)
                  sur {selectedSite.name}, soit environ {analysis.hours.toFixed(1)}h.
                  Les chevauchements sont ignores automatiquement.
                </p>
              </div>
            </div>
          )}

          {analysis.conflicts.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-bold">
                    {analysis.conflicts.length} vacation(s) ignoree(s) pour éviter
                    un conflit horaire.
                  </p>
                  <div className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs">
                    {analysis.conflicts.slice(0, 6).map((vacation) => (
                      <p key={vacation.id}>- {formatVacation(vacation)}</p>
                    ))}
                    {analysis.conflicts.length > 6 && (
                      <p>+{analysis.conflicts.length - 6} autre(s)</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {targetVacations.length === 0 && (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-3 font-black">Rien a couvrir</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ce site n&apos;a pas de vacation non couverte dans la période visible.
              </p>
            </div>
          )}
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCoverageOpen(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedAgent || analysis.safe.length === 0 || submitting}
            className="font-black"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Affecter {analysis.safe.length || ""}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
