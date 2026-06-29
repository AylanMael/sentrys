"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Search,
  ShieldAlert,
  UserPlus,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { computeAgentCompliance } from "@/lib/agents/compliance";
import { overlaps } from "@/lib/planning/time";
import { cn } from "@/lib/utils";
import { usePlanning } from "./PlanningContext";

const DEFAULT_MONTHLY_CONTRACT_HOURS = 151.67;
const MIN_REST_HOURS = 11;

function hoursBetween(startIso?: string | null, endIso?: string | null) {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / (1000 * 60 * 60);
}

function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

export const AssignAgentsSheet: React.FC = () => {
  const {
    assignOpen,
    setAssignOpen,
    activeVacation,
    agents,
    agentsLoading,
    updateVacation,
    vacations,
  } = usePlanning();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (assignOpen && activeVacation) {
      setLocalSelection(new Set((activeVacation.assignedAgentIds || []).slice(0, 1)));
    }
  }, [assignOpen, activeVacation]);

  const missionHours = useMemo(
    () => hoursBetween(activeVacation?.startAtIso, activeVacation?.endAtIso),
    [activeVacation?.endAtIso, activeVacation?.startAtIso]
  );

  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) return agents;

    return agents.filter((agent) => {
      const fullName = `${agent.firstName} ${agent.lastName}`.toLowerCase();
      return (
        fullName.includes(normalizedQuery) ||
        agent.email?.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [agents, query]);

  const toggleAgent = (id: string) => {
    setLocalSelection((previous) => {
      if (previous.has(id)) return new Set<string>();
      return new Set([id]);
    });
  };

  const checkAgentConflict = useCallback(
    (agentId: string) => {
      if (
        !activeVacation ||
        !activeVacation.startAtIso ||
        !activeVacation.endAtIso
      ) {
        return null;
      }

      return vacations.find(
        (vacation) =>
          vacation.id !== activeVacation.id &&
          vacation.status !== "cancelled" &&
          vacation.assignedAgentIds.includes(agentId) &&
          vacation.startAtIso &&
          vacation.endAtIso &&
          overlaps(
            activeVacation.startAtIso,
            activeVacation.endAtIso,
            vacation.startAtIso,
            vacation.endAtIso
          )
      );
    },
    [activeVacation, vacations]
  );

  const rankedAgents = useMemo(() => {
    if (!activeVacation) return [];

    const requiredQualification = activeVacation.requiredQualification?.trim();

    return filteredAgents
      .map((agent) => {
        const fullName =
          `${agent.firstName} ${agent.lastName}`.trim() ||
          agent.email ||
          "Agent";
        const conflict = checkAgentConflict(agent.id);
        const qualificationMatch = requiredQualification
          ? agent.qualifications.includes(requiredQualification)
          : false;
        const compliance = computeAgentCompliance(agent, {
          requiredQualification,
        });
        const alreadyAssigned = activeVacation.assignedAgentIds.includes(agent.id);
        const dayAssignments = vacations.filter(
          (vacation) =>
            vacation.id !== activeVacation.id &&
            vacation.status !== "cancelled" &&
            vacation.assignedAgentIds.includes(agent.id)
        ).length;

        const contractHours = Number(agent.monthlyContractHours || DEFAULT_MONTHLY_CONTRACT_HOURS);
        const activeStart = activeVacation.startAtIso ? new Date(activeVacation.startAtIso) : null;
        const monthStart = activeStart
          ? new Date(activeStart.getFullYear(), activeStart.getMonth(), 1, 0, 0, 0, 0)
          : null;
        const monthEnd = activeStart
          ? new Date(activeStart.getFullYear(), activeStart.getMonth() + 1, 1, 0, 0, 0, 0)
          : null;
        const activeStartMs = activeVacation.startAtIso ? new Date(activeVacation.startAtIso).getTime() : NaN;
        const activeEndMs = activeVacation.endAtIso ? new Date(activeVacation.endAtIso).getTime() : NaN;
        let currentMonthHours = 0;
        const restWarnings: string[] = [];

        vacations.forEach((vacation) => {
          if (vacation.id === activeVacation.id) return;
          if (vacation.status === "cancelled" || vacation.status === "closed") return;
          if (!vacation.startAtIso || !vacation.endAtIso) return;
          if (!vacation.assignedAgentIds.includes(agent.id)) return;

          const startMs = new Date(vacation.startAtIso).getTime();
          const endMs = new Date(vacation.endAtIso).getTime();
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;

          if (monthStart && monthEnd) {
            const overlapStart = Math.max(startMs, monthStart.getTime());
            const overlapEnd = Math.min(endMs, monthEnd.getTime());
            if (overlapEnd > overlapStart) {
              currentMonthHours += (overlapEnd - overlapStart) / (1000 * 60 * 60);
            }
          }

          if (Number.isFinite(activeStartMs) && endMs <= activeStartMs) {
            const restHours = (activeStartMs - endMs) / (1000 * 60 * 60);
            if (restHours < MIN_REST_HOURS) {
              restWarnings.push(`Repos ${formatHours(restHours)} apres ${vacation.siteName || "mission precedente"}`);
            }
          }

          if (Number.isFinite(activeEndMs) && startMs >= activeEndMs) {
            const restHours = (startMs - activeEndMs) / (1000 * 60 * 60);
            if (restHours < MIN_REST_HOURS) {
              restWarnings.push(`Repos ${formatHours(restHours)} avant ${vacation.siteName || "mission suivante"}`);
            }
          }
        });

        const projectedMonthHours = currentMonthHours + (alreadyAssigned ? 0 : missionHours);
        const overtimeHours = Math.max(0, projectedMonthHours - contractHours);
        const assignmentImpact = {
          currentMonthHours,
          projectedMonthHours,
          contractHours,
          overtimeHours,
          restWarnings: restWarnings.slice(0, 2),
          severity: restWarnings.length > 0 || overtimeHours > 0 ? "warning" : projectedMonthHours / contractHours >= 0.9 ? "info" : "ok",
        } as const;

        const score =
          (alreadyAssigned ? 500 : 0) +
          (compliance.status === "blocking" ? -1000 : 0) +
          (!conflict ? 180 : 0) +
          (qualificationMatch ? 120 : 0) +
          (compliance.status === "ok" ? 80 : 0) +
          (compliance.status === "warning" ? -40 : 0) +
          (assignmentImpact.severity === "warning" ? -90 : 0) +
          (assignmentImpact.severity === "ok" ? 35 : 0) +
          Math.max(0, 20 - dayAssignments * 5);

        return {
          agent,
          fullName,
          conflict,
          qualificationMatch,
          compliance,
          alreadyAssigned,
          dayAssignments,
          assignmentImpact,
          score,
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.fullName.localeCompare(right.fullName, "fr");
      });
  }, [activeVacation, checkAgentConflict, filteredAgents, missionHours, vacations]);

  const recommendedAgents = useMemo(() => {
    if (!activeVacation) return [];

    return rankedAgents
      .filter(
        (item) =>
          !item.conflict &&
          !item.alreadyAssigned &&
          item.compliance.status !== "blocking" &&
          item.assignmentImpact.severity !== "warning"
      )
      .slice(0, 4);
  }, [activeVacation, rankedAgents]);

  const selectedConflictedAgents = useMemo(() => {
    return Array.from(localSelection)
      .map((id) => {
        const agent = agents.find((item) => item.id === id);
        const conflict = checkAgentConflict(id);
        return conflict ? { agent, conflict } : null;
      })
      .filter(
        (
          item
        ): item is {
          agent: (typeof agents)[number] | undefined;
          conflict: (typeof vacations)[number];
        } => item !== null
      );
  }, [agents, checkAgentConflict, localSelection]);

  const selectedBlockingAgents = useMemo(() => {
    if (!activeVacation) return [];

    return Array.from(localSelection)
      .map((id) => {
        const agent = agents.find((item) => item.id === id);
        if (!agent) return null;

        const compliance = computeAgentCompliance(agent, {
          requiredQualification: activeVacation.requiredQualification,
        });

        return compliance.status === "blocking"
          ? { agent, compliance }
          : null;
      })
      .filter(
        (
          item
        ): item is {
          agent: (typeof agents)[number];
          compliance: ReturnType<typeof computeAgentCompliance>;
        } => item !== null
      );
  }, [activeVacation, agents, localSelection]);

  const selectedAssignmentWarnings = useMemo(() => {
    return Array.from(localSelection)
      .map((id) => rankedAgents.find((candidate) => candidate.agent.id === id) ?? null)
      .filter(
        (item): item is (typeof rankedAgents)[number] =>
          item !== null && item.assignmentImpact.severity === "warning"
      );
  }, [localSelection, rankedAgents]);

  const handleSave = async () => {
    if (!activeVacation || activeVacation.status === "cancelled") return;

    setSaving(true);
    try {
      const ok = await updateVacation(activeVacation.id, {
        assignedAgentIds: Array.from(localSelection),
      });

      if (ok) {
        toast({
          title: "Affectation mise à jour",
          description: "La liste des agents a été enregistrée avec succès.",
        });
        setAssignOpen(false);
      }
    } catch (error: unknown) {
      console.error("[AssignAgents] Save Error:", error);
      toast({
        variant: "destructive",
        title: "Erreur d'enregistrement",
        description:
          error instanceof Error
            ? error.message
            : "Une erreur est survenue lors de l'affectation.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!activeVacation) return null;

  return (
    <Sheet open={assignOpen} onOpenChange={setAssignOpen}>
      <SheetContent className="flex h-full flex-col border-l bg-white shadow-2xl sm:max-w-md dark:bg-slate-950">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <UserPlus className="h-5 w-5 text-primary" />
            Affectation opérationnelle
          </SheetTitle>
          <SheetDescription>
            Choisissez les agents pour la mission sur{" "}
            <strong>{activeVacation.siteName}</strong>.
          </SheetDescription>
        </SheetHeader>

        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un agent..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-background/50 pl-10"
          />
        </div>

        <ScrollArea className="-mx-2 mt-4 flex-1 px-2">
          <div className="space-y-1 pb-4">
            {agentsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
              </div>
            ) : rankedAgents.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Aucun agent trouvé.
              </div>
            ) : (
              <>
                {!query && recommendedAgents.length > 0 && (
                  <div className="mb-3 rounded-2xl border border-primary/15 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                          Recommandés pour cette mission
                        </p>
                        <p className="mt-1 text-xs font-semibold text-muted-foreground">
                          Agents disponibles priorisés selon les qualifications et
                          la charge visible.
                        </p>
                      </div>
                      <Badge className="border-none bg-primary/10 text-[10px] font-black uppercase tracking-[0.16em] text-primary">
                        {recommendedAgents.length} suggestion
                        {recommendedAgents.length > 1 ? "s" : ""}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {recommendedAgents.map(
                        ({
                          agent,
                          fullName,
                          qualificationMatch,
                          assignmentImpact,
                        }) => {
                          const isSelected = localSelection.has(agent.id);

                          return (
                            <button
                              key={`recommended-${agent.id}`}
                              type="button"
                              onClick={() => toggleAgent(agent.id)}
                              className={cn(
                                "rounded-2xl border px-3 py-2 text-left transition-all",
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-primary/20 bg-background/80 hover:border-primary/40 hover:bg-primary/5"
                              )}
                            >
                              <div className="text-xs font-black">{fullName}</div>
                              <div
                                className={cn(
                                  "mt-1 text-[10px] font-semibold",
                                  isSelected
                                    ? "text-primary-foreground/80"
                                    : "text-muted-foreground"
                                )}
                              >
                                {qualificationMatch
                                  ? "Qualification compatible"
                                  : `Projet ${formatHours(assignmentImpact.projectedMonthHours)} / ${formatHours(assignmentImpact.contractHours)}`}
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

                {rankedAgents.map(
                  ({
                    agent,
                    fullName,
                    conflict,
                    qualificationMatch,
                    compliance,
                    dayAssignments,
                    assignmentImpact,
                  }) => {
                    const isSelected = localSelection.has(agent.id);
                    const isBlocked = compliance.status === "blocking";
                    const firstComplianceAlert = compliance.alerts[0] ?? null;
                    const initials =
                      (
                        (agent.firstName?.[0] || "") +
                        (agent.lastName?.[0] || "")
                      ).toUpperCase() || "?";
                    const hasOvertime = assignmentImpact.overtimeHours > 0;
                    const hasRestWarning = assignmentImpact.restWarnings.length > 0;

                    return (
                      <button
                        key={agent.id}
                        onClick={() => {
                          if (!isBlocked || isSelected) toggleAgent(agent.id);
                        }}
                        disabled={isBlocked && !isSelected}
                        className={cn(
                          "group mb-1 flex w-full items-center justify-between rounded-xl border p-3 transition-all duration-200",
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-transparent bg-background/40 hover:border-border hover:bg-accent/50",
                          isBlocked &&
                            !isSelected &&
                            "cursor-not-allowed opacity-70 hover:border-transparent hover:bg-background/40"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border shadow-sm ring-1 ring-border/50">
                            <AvatarFallback
                              className={cn(
                                "text-xs font-bold",
                                isSelected
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "bg-muted text-muted-foreground"
                              )}
                            >
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-left">
                            <div
                              className={cn(
                                "text-sm font-semibold transition-colors",
                                isSelected
                                  ? "text-primary"
                                  : "group-hover:text-primary"
                              )}
                            >
                              {fullName}
                            </div>
                            {conflict ? (
                              <div className="animate-in fade-in slide-in-from-left-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-tighter text-amber-600 duration-300">
                                <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                Occupé : {conflict.siteName}
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-muted-foreground">
                                <span>{agent.email || "Accès opérationnel"}</span>
                                {compliance.status === "blocking" && (
                                  <Badge className="border-none bg-destructive/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-destructive">
                                    Bloquant
                                  </Badge>
                                )}
                                {compliance.status === "warning" && (
                                  <Badge className="border-none bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-600">
                                    A controler
                                  </Badge>
                                )}
                                {compliance.status === "ok" && (
                                  <Badge className="border-none bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-600">
                                    Dossier OK
                                  </Badge>
                                )}
                                {qualificationMatch && (
                                  <Badge className="border-none bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-600">
                                    Qualifié
                                  </Badge>
                                )}
                                {!qualificationMatch && dayAssignments === 0 && (
                                  <Badge className="border-none bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-primary">
                                    Disponible
                                  </Badge>
                                )}
                              </div>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge
                                className={cn(
                                  "border-none px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]",
                                  assignmentImpact.severity === "warning"
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                    : assignmentImpact.severity === "info"
                                      ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                )}
                              >
                                {formatHours(assignmentImpact.projectedMonthHours)} / {formatHours(assignmentImpact.contractHours)}
                              </Badge>
                              {hasOvertime && (
                                <Badge className="border-none bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                                  Contrat +{formatHours(assignmentImpact.overtimeHours)}
                                </Badge>
                              )}
                              {hasRestWarning && (
                                <Badge className="border-none bg-orange-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-orange-700 dark:text-orange-300">
                                  Repos &lt; {MIN_REST_HOURS}h
                                </Badge>
                              )}
                            </div>

                            {assignmentImpact.restWarnings.length > 0 && (
                              <div className="mt-1 flex items-start gap-1 text-[9px] font-bold uppercase tracking-tighter text-orange-600 dark:text-orange-300">
                                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                                <span className="line-clamp-2">
                                  {assignmentImpact.restWarnings.join(" / ")}
                                </span>
                              </div>
                            )}
                            {firstComplianceAlert && (
                              <div
                                className={cn(
                                  "mt-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-tighter",
                                  firstComplianceAlert.severity === "blocking"
                                    ? "text-destructive"
                                    : firstComplianceAlert.severity === "warning"
                                      ? "text-amber-600"
                                      : "text-sky-600"
                                )}
                              >
                                {firstComplianceAlert.severity === "blocking" ? (
                                  <ShieldAlert className="h-2.5 w-2.5 shrink-0" />
                                ) : firstComplianceAlert.severity === "warning" ? (
                                  <Clock3 className="h-2.5 w-2.5 shrink-0" />
                                ) : (
                                  <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                                )}
                                {firstComplianceAlert.title}
                              </div>
                            )}
                          </div>
                        </div>

                        {isSelected ? (
                          <div className="animate-in zoom-in-50 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground duration-200">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        ) : (
                          <UserPlus className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        )}
                      </button>
                    );
                  }
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="mt-auto border-t pt-4">
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center justify-between px-1 text-xs">
              <span className="text-muted-foreground">
                {localSelection.size} agent(s) sélectionnés
              </span>
              {localSelection.size > (activeVacation.requiredAgents || 0) && (
                <Badge
                  variant="outline"
                  className="anim-pulse border-amber-500/20 bg-amber-500/5 text-[9px] text-amber-500"
                >
                  Capacité dépassée
                </Badge>
              )}
            </div>

            {selectedConflictedAgents.length > 0 && (
              <div className="animate-in slide-in-from-bottom-2 flex flex-col gap-1.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-destructive duration-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-tight">
                    Chevauchement détecté
                  </span>
                </div>
                <div className="space-y-1 pl-6 text-[10px]">
                  {selectedConflictedAgents.map(({ agent, conflict }) => (
                    <div key={agent?.id} className="leading-tight opacity-80">
                      <strong>
                        {agent?.firstName} {agent?.lastName}
                      </strong>{" "}
                      est déjà affecté sur{" "}
                      <strong>{conflict?.siteName || "un autre site"}</strong>.
                    </div>
                  ))}
                  <p className="mt-1 font-bold italic opacity-100">
                    Désélectionnez ces agents pour pouvoir enregistrer.
                  </p>
                </div>
              </div>
            )}

            {selectedBlockingAgents.length > 0 && (
              <div className="animate-in slide-in-from-bottom-2 flex flex-col gap-1.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-destructive duration-300">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-tight">
                    Conformite bloquante
                  </span>
                </div>
                <div className="space-y-1 pl-6 text-[10px]">
                  {selectedBlockingAgents.map(({ agent, compliance }) => (
                    <div key={agent.id} className="leading-tight opacity-80">
                      <strong>
                        {agent.firstName} {agent.lastName}
                      </strong>{" "}
                      : {compliance.blockingAlerts[0]?.title ?? "dossier non conforme"}.
                    </div>
                  ))}
                  <p className="mt-1 font-bold italic opacity-100">
                    Corrigez la fiche agent ou choisissez un autre agent.
                  </p>
                </div>
              </div>
            )}

            {selectedAssignmentWarnings.length > 0 && (
              <div className="animate-in slide-in-from-bottom-2 flex flex-col gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-700 duration-300 dark:text-amber-300">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-tight">
                    Attention avant affectation
                  </span>
                </div>
                <div className="space-y-1 pl-6 text-[10px]">
                  {selectedAssignmentWarnings.map(({ agent, fullName, assignmentImpact }) => (
                    <div key={agent.id} className="leading-tight opacity-90">
                      <strong>{fullName}</strong> : {formatHours(assignmentImpact.projectedMonthHours)} / {formatHours(assignmentImpact.contractHours)}
                      {assignmentImpact.overtimeHours > 0
                        ? `, depassement +${formatHours(assignmentImpact.overtimeHours)}`
                        : ""}
                      {assignmentImpact.restWarnings.length > 0
                        ? `, ${assignmentImpact.restWarnings.join(" / ")}`
                        : ""}
                    </div>
                  ))}
                  <p className="mt-1 font-bold italic opacity-100">
                    Non bloquant, mais a arbitrer avant de confirmer.
                  </p>
                </div>
              </div>
            )}
            {activeVacation.status === "cancelled" && (
              <div className="animate-in slide-in-from-bottom-2 flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-rose-600 duration-300 dark:text-rose-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span className="text-[10px] font-bold uppercase italic leading-tight">
                  Cette mission est annulée. L&apos;action est désactivée.
                </span>
              </div>
            )}

            <Button
              onClick={handleSave}
              disabled={
                saving ||
                activeVacation.status === "cancelled" ||
                selectedConflictedAgents.length > 0 ||
                selectedBlockingAgents.length > 0
              }
              className={cn(
                "w-full font-bold shadow-lg shadow-primary/20",
                activeVacation.status === "cancelled" &&
                  "cursor-not-allowed grayscale opacity-50"
              )}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Confirmer l'affectation"
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
