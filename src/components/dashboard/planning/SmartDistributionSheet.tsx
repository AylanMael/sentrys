"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Scale,
  Shuffle,
  UsersRound,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  type PlanningDateRange,
  type VacationApiItem,
} from "./PlanningContext";

type BulkResponse = {
  ok: boolean;
  results?: Array<{ id?: string; ok?: boolean; error?: string }>;
};

type DistributionAssignment = {
  vacation: VacationApiItem;
  agent: AgentApiItem;
  hours: number;
};

type DistributionSkipped = {
  vacation: VacationApiItem;
  reason: string;
};

const DEFAULT_MAX_HOURS = 180;

function activeOnly(vacation: VacationApiItem) {
  return vacation.status !== "cancelled" && vacation.status !== "closed";
}

function assignedCount(vacation: VacationApiItem) {
  return Array.isArray(vacation.assignedAgentIds)
    ? vacation.assignedAgentIds.length
    : 0;
}

function isUnassigned(vacation: VacationApiItem) {
  const required = Math.max(1, Number(vacation.requiredAgents ?? 1));

  return required > 0 && assignedCount(vacation) === 0;
}

function isAgentActive(agent: AgentApiItem) {
  const status = String(agent.status ?? "active").toLowerCase();

  return !["inactive", "archived", "disabled", "suspended"].includes(status);
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

function isInsideRange(vacation: VacationApiItem, range: PlanningDateRange | null) {
  if (!range?.from || !range?.to) return true;
  if (!vacation.startAtIso || !vacation.endAtIso) return false;

  const start = Date.parse(vacation.startAtIso);
  const end = Date.parse(vacation.endAtIso);
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to)
  ) {
    return false;
  }

  return start <= to && end >= from;
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
  const start = vacation.startAtIso ? new Date(vacation.startAtIso) : null;

  if (!start || Number.isNaN(start.getTime())) {
    return vacation.siteName || vacation.title || "Vacation";
  }

  const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const date = start.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

  const end = vacation.endAtIso ? new Date(vacation.endAtIso) : null;
  const hours =
    end && !Number.isNaN(end.getTime())
      ? `${timeFormatter.format(start)}-${timeFormatter.format(end)}`
      : timeFormatter.format(start);

  return `${date} - ${hours}`;
}

function hasConflict(
  agentId: string,
  vacation: VacationApiItem,
  existingByAgent: Map<string, VacationApiItem[]>,
  plannedByAgent: Map<string, VacationApiItem[]>
) {
  const existing = existingByAgent.get(agentId) ?? [];
  const planned = plannedByAgent.get(agentId) ?? [];

  return [...existing, ...planned].some((candidate) => {
    if (candidate.id === vacation.id) return false;

    return intervalOverlaps(
      vacation.startAtIso,
      vacation.endAtIso,
      candidate.startAtIso,
      candidate.endAtIso
    );
  });
}

export const SmartDistributionSheet: React.FC = () => {
  const {
    distributionOpen,
    setDistributionOpen,
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
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [maxHoursInput, setMaxHoursInput] = React.useState(
    String(DEFAULT_MAX_HOURS)
  );
  const [submitting, setSubmitting] = React.useState(false);

  const activeAgents = React.useMemo(() => {
    const availableAgents = agents.filter(isAgentActive);

    return availableAgents.length > 0 ? availableAgents : agents;
  }, [agents]);

  const periodVacations = React.useMemo(
    () => vacations.filter((vacation) => isInsideRange(vacation, range)),
    [range, vacations]
  );

  const uncoveredBySite = React.useMemo(() => {
    const counts = new Map<string, number>();

    periodVacations.forEach((vacation) => {
      if (!activeOnly(vacation)) return;
      if (!vacation.siteId) return;
      if (!isUnassigned(vacation)) return;

      counts.set(vacation.siteId, (counts.get(vacation.siteId) ?? 0) + 1);
    });

    return counts;
  }, [periodVacations]);

  React.useEffect(() => {
    if (!distributionOpen) return;

    const fallbackSite =
      (siteId !== "all" && uncoveredBySite.has(siteId) ? siteId : "") ||
      Array.from(uncoveredBySite.keys())[0] ||
      (siteId !== "all" ? siteId : "") ||
      sites[0]?.id ||
      "";

    setSelectedSiteId(fallbackSite);
    setSelectedAgentIds((current) => {
      if (current.size > 0) return current;

      return new Set(activeAgents.map((agent) => agent.id));
    });
  }, [activeAgents, distributionOpen, siteId, sites, uncoveredBySite]);

  const selectedSite = React.useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites]
  );

  const selectedAgents = React.useMemo(
    () => activeAgents.filter((agent) => selectedAgentIds.has(agent.id)),
    [activeAgents, selectedAgentIds]
  );

  const targetVacations = React.useMemo(
    () =>
      periodVacations
        .filter((vacation) => vacation.siteId === selectedSiteId)
        .filter(activeOnly)
        .filter(isUnassigned)
        .sort(
          (left, right) =>
            Date.parse(left.startAtIso ?? "") - Date.parse(right.startAtIso ?? "")
        ),
    [periodVacations, selectedSiteId]
  );

  const maxHours = React.useMemo(() => {
    const parsed = Number(maxHoursInput);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
  }, [maxHoursInput]);

  const baseHoursByAgent = React.useMemo(() => {
    const hoursByAgent = new Map<string, number>();

    activeAgents.forEach((agent) => hoursByAgent.set(agent.id, 0));
    periodVacations.filter(activeOnly).forEach((vacation) => {
      const hours = getVacationHours(vacation);

      vacation.assignedAgentIds?.forEach((agentId) => {
        if (!hoursByAgent.has(agentId)) return;

        hoursByAgent.set(agentId, (hoursByAgent.get(agentId) ?? 0) + hours);
      });
    });

    return hoursByAgent;
  }, [activeAgents, periodVacations]);

  const existingByAgent = React.useMemo(() => {
    const byAgent = new Map<string, VacationApiItem[]>();

    selectedAgents.forEach((agent) => byAgent.set(agent.id, []));
    vacations.filter(activeOnly).forEach((vacation) => {
      vacation.assignedAgentIds?.forEach((agentId) => {
        if (!byAgent.has(agentId)) return;

        byAgent.get(agentId)?.push(vacation);
      });
    });

    return byAgent;
  }, [selectedAgents, vacations]);

  const plan = React.useMemo(() => {
    const assignments: DistributionAssignment[] = [];
    const skipped: DistributionSkipped[] = [];
    const plannedByAgent = new Map<string, VacationApiItem[]>();
    const projectedHoursByAgent = new Map(baseHoursByAgent);

    selectedAgents.forEach((agent) => plannedByAgent.set(agent.id, []));

    if (selectedAgents.length === 0) {
      return { assignments, skipped: targetVacations.map((vacation) => ({
        vacation,
        reason: "Aucun agent selectionne",
      })), projectedHoursByAgent };
    }

    targetVacations.forEach((vacation) => {
      const hours = getVacationHours(vacation);
      const availableAgents = selectedAgents.filter(
        (agent) =>
          !hasConflict(agent.id, vacation, existingByAgent, plannedByAgent)
      );
      const eligibleAgents = availableAgents.filter(
        (agent) => (projectedHoursByAgent.get(agent.id) ?? 0) + hours <= maxHours
      );

      if (eligibleAgents.length === 0) {
        skipped.push({
          vacation,
          reason:
            availableAgents.length > 0
              ? "Plafond horaire atteint"
              : "Conflit horaire",
        });
        return;
      }

      const selectedAgent = eligibleAgents
        .slice()
        .sort((left, right) => {
          const leftHours = projectedHoursByAgent.get(left.id) ?? 0;
          const rightHours = projectedHoursByAgent.get(right.id) ?? 0;

          if (leftHours !== rightHours) return leftHours - rightHours;

          return agentLabel(left).localeCompare(agentLabel(right), "fr");
        })[0];

      plannedByAgent.get(selectedAgent.id)?.push(vacation);
      projectedHoursByAgent.set(
        selectedAgent.id,
        (projectedHoursByAgent.get(selectedAgent.id) ?? 0) + hours
      );
      assignments.push({ vacation, agent: selectedAgent, hours });
    });

    return { assignments, skipped, projectedHoursByAgent };
  }, [
    baseHoursByAgent,
    existingByAgent,
    maxHours,
    selectedAgents,
    targetVacations,
  ]);

  const assignmentsByAgent = React.useMemo(() => {
    const counts = new Map<string, { count: number; hours: number }>();

    plan.assignments.forEach((assignment) => {
      const current = counts.get(assignment.agent.id) ?? { count: 0, hours: 0 };
      counts.set(assignment.agent.id, {
        count: current.count + 1,
        hours: current.hours + assignment.hours,
      });
    });

    return counts;
  }, [plan.assignments]);

  const toggleAgent = React.useCallback((agentId: string, checked: boolean) => {
    setSelectedAgentIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(agentId);
      } else {
        next.delete(agentId);
      }

      return next;
    });
  }, []);

  const handleSubmit = React.useCallback(async () => {
    if (plan.assignments.length === 0) return;

    setSubmitting(true);
    try {
      const operations = plan.assignments.map((assignment) => ({
        type: "update",
        id: assignment.vacation.id,
        data: {
          assignedAgentIds: [assignment.agent.id],
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
        title: "Repartition appliquee",
        description:
          failed > 0
            ? `${success} vacation(s) affectee(s), ${failed} erreur(s), ${plan.skipped.length} ignoree(s).`
            : `${success} vacation(s) repartie(s) sur ${selectedAgents.length} agent(s). ${plan.skipped.length} ignoree(s).`,
      });

      if (success > 0) {
        setDistributionOpen(false);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Repartition impossible",
        description:
          error instanceof Error
            ? error.message
            : "Impossible de repartir les vacations non couvertes.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    plan.assignments,
    plan.skipped.length,
    refresh,
    selectedAgents.length,
    selectedSiteId,
    setDistributionOpen,
    setMode,
    setSiteId,
    toast,
  ]);

  return (
    <Sheet open={distributionOpen} onOpenChange={setDistributionOpen}>
      <SheetContent className="overflow-y-auto border-l bg-white shadow-2xl dark:bg-slate-950 sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl font-black">
            <Shuffle className="h-5 w-5 text-primary" />
            Repartition intelligente
          </SheetTitle>
          <SheetDescription>
            Repartit les vacations non affectees d&apos;un site entre plusieurs
            agents, en evitant les chevauchements et les volumes excessifs.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-6">
          <div className="rounded-[1.5rem] border border-primary/20 bg-primary/5 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Periode de travail
            </p>
            <p className="mt-1 text-xl font-black">
              {formatRange(range?.from, range?.to)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              L&apos;assistant ne touche qu&apos;aux vacations vides du site choisi.
              Les vacations deja affectees restent intactes.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.5fr_0.8fr]">
            <div className="space-y-2">
              <p className="text-sm font-black">Site a repartir</p>
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Choisir un site" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                      {uncoveredBySite.get(site.id)
                        ? ` - ${uncoveredBySite.get(site.id)} a repartir`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-black">Plafond heures / agent</p>
              <Input
                min={1}
                step={1}
                type="number"
                value={maxHoursInput}
                onChange={(event) => setMaxHoursInput(event.target.value)}
                className="h-11 rounded-xl font-black"
              />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-border/60 bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-black">
                  <UsersRound className="h-4 w-4 text-primary" />
                  Vivier agents
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Selectionne les agents disponibles pour cette repartition.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSelectedAgentIds(new Set(activeAgents.map((agent) => agent.id)))
                  }
                >
                  Tous
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedAgentIds(new Set())}
                >
                  Aucun
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {activeAgents.map((agent) => {
                const projected = plan.projectedHoursByAgent.get(agent.id) ?? 0;
                const added = assignmentsByAgent.get(agent.id);
                const progress =
                  Number.isFinite(maxHours) && maxHours > 0
                    ? Math.min(100, (projected / maxHours) * 100)
                    : 0;
                const selected = selectedAgentIds.has(agent.id);

                return (
                  <label
                    key={agent.id}
                    htmlFor={`distribution-agent-${agent.id}`}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-2xl border p-3 transition hover:border-primary/30 hover:bg-primary/5",
                      selected
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/60 bg-muted/20"
                    )}
                  >
                    <Checkbox
                      id={`distribution-agent-${agent.id}`}
                      checked={selected}
                      onCheckedChange={(checked) =>
                        toggleAgent(agent.id, checked === true)
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-black">
                          {agentLabel(agent)}
                        </p>
                        <p className="shrink-0 text-xs font-black">
                          {projected.toFixed(0)}h
                        </p>
                      </div>
                      <Progress value={progress} className="mt-2 h-2" />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {added
                          ? `+${added.count} vacation(s), +${added.hours.toFixed(0)}h`
                          : "Aucune vacation ajoutee"}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                A repartir
              </p>
              <p className="mt-1 text-2xl font-black">{targetVacations.length}</p>
            </div>
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-700 dark:text-emerald-300">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Affectees
              </p>
              <p className="mt-1 text-2xl font-black">
                {plan.assignments.length}
              </p>
            </div>
            <div
              className={cn(
                "rounded-2xl border p-4",
                plan.skipped.length > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-border/60 bg-background text-muted-foreground"
              )}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Ignorees
              </p>
              <p className="mt-1 text-2xl font-black">{plan.skipped.length}</p>
            </div>
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sky-700 dark:text-sky-300">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                Agents
              </p>
              <p className="mt-1 text-2xl font-black">{selectedAgents.length}</p>
            </div>
          </div>

          {selectedSite && plan.assignments.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
              <div className="flex gap-3">
                <Scale className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Proposition prete pour {selectedSite.name} :{" "}
                  {plan.assignments.length} vacation(s) repartie(s), avec un
                  volume equilibre entre les agents selectionnes.
                </p>
              </div>
            </div>
          )}

          {plan.skipped.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-bold">
                    {plan.skipped.length} vacation(s) ne peuvent pas etre
                    affectees avec ces contraintes.
                  </p>
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
                    {plan.skipped.slice(0, 8).map((item) => (
                      <p key={item.vacation.id}>
                        - {formatVacation(item.vacation)} : {item.reason}
                      </p>
                    ))}
                    {plan.skipped.length > 8 && (
                      <p>+{plan.skipped.length - 8} autre(s)</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {targetVacations.length === 0 && (
            <div className="rounded-2xl border border-dashed p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="mt-3 font-black">Rien a repartir</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ce site n&apos;a aucune vacation vide sur la periode courante.
              </p>
            </div>
          )}
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDistributionOpen(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={plan.assignments.length === 0 || submitting}
            className="font-black"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Appliquer {plan.assignments.length || ""}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
