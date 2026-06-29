"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { apiFetch } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";
import { usePlanning } from "./PlanningContext";

type ComplianceStatus = "ok" | "info" | "warning" | "blocking";

type AvailabilityAgent = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  isAvailable?: boolean;
  score?: number;
  strengths?: string[];
  warnings?: string[];
  blocking?: string[];
  distanceKm?: number | null;
  currentWeekHours?: number;
  projectedWeekHours?: number;
  missionHours?: number;
  qualificationMatch?: boolean;
  complianceStatus?: ComplianceStatus;
  workloadLevel?: "light" | "normal" | "high" | "critical";
};

interface AvailableAgentsResponse {
  ok?: boolean;
  available?: AvailabilityAgent[];
  agents?: AvailabilityAgent[];
  count?: number;
  availableCount?: number;
  error?: string;
}

type Suggestion = {
  id: string;
  name: string;
  score: number;
  strengths: string[];
  warnings: string[];
  blocking: string[];
  available: boolean;
  distanceKm: number | null;
  projectedWeekHours: number | null;
  currentWeekHours: number | null;
  complianceStatus: ComplianceStatus;
  workloadLevel?: "light" | "normal" | "high" | "critical";
};

function agentName(agent: AvailabilityAgent) {
  return (
    `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim() ||
    agent.email ||
    agent.phone ||
    "Agent"
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function statusLabel(status: ComplianceStatus) {
  if (status === "ok") return "Dossier OK";
  if (status === "info") return "A suivre";
  if (status === "warning") return "A controler";
  return "Bloquant";
}

function scoreTone(score: number) {
  if (score >= 90) return "text-emerald-300";
  if (score >= 78) return "text-cyan-300";
  if (score >= 65) return "text-amber-300";
  return "text-rose-300";
}

export const AIAssistSheet: React.FC = () => {
  const {
    replaceOpen,
    setReplaceOpen,
    activeVacation,
    updateVacation,
    refresh,
  } = usePlanning();

  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const { toast } = useToast();

  const loadSuggestions = useCallback(async () => {
    if (!activeVacation) return;

    setLoading(true);
    setDiagnostic(null);
    setSuggestions([]);
    setAnalyzedCount(0);

    try {
      if (!activeVacation.startAtIso || !activeVacation.endAtIso) {
        setDiagnostic("Vacation sans horaire exploitable.");
        return;
      }

      const params = new URLSearchParams({
        from: activeVacation.startAtIso,
        to: activeVacation.endAtIso,
        excludeVacationId: activeVacation.id,
      });

      if (activeVacation.siteId) params.set("siteId", activeVacation.siteId);
      if (activeVacation.requiredQualification?.trim()) {
        params.set("requiredQualification", activeVacation.requiredQualification.trim());
      }

      const response = await apiFetch<AvailableAgentsResponse>(
        `/api/agents/available?${params.toString()}`
      );

      if (!response?.ok) {
        setDiagnostic(response?.error ?? "Analyse indisponible.");
        return;
      }

      const allAgents = Array.isArray(response.agents) ? response.agents : [];
      const availableAgents = Array.isArray(response.available)
        ? response.available
        : allAgents.filter((agent) => agent.isAvailable);

      setAnalyzedCount(Number(response.count ?? allAgents.length));

      const transformed = availableAgents.map<Suggestion>((agent, index) => ({
        id: agent.id,
        name: agentName(agent),
        score: Number(agent.score ?? Math.max(70, 95 - index * 5)),
        strengths:
          agent.strengths?.length
            ? agent.strengths
            : ["Disponible sur le creneau", "Dossier compatible"],
        warnings: agent.warnings ?? [],
        blocking: agent.blocking ?? [],
        available: agent.isAvailable !== false,
        distanceKm: typeof agent.distanceKm === "number" ? agent.distanceKm : null,
        projectedWeekHours:
          typeof agent.projectedWeekHours === "number"
            ? agent.projectedWeekHours
            : null,
        currentWeekHours:
          typeof agent.currentWeekHours === "number" ? agent.currentWeekHours : null,
        complianceStatus: agent.complianceStatus ?? "ok",
        workloadLevel: agent.workloadLevel,
      }));

      setSuggestions(transformed);

      if (transformed.length === 0) {
        const blockedCount = allAgents.filter((agent) => !agent.isAvailable).length;
        setDiagnostic(
          blockedCount > 0
            ? `${blockedCount} profil(s) analyse(s), aucun agent strictement affectable sans risque.`
            : "Aucun agent rattache au site ou disponible pour cette plage."
        );
      }
    } catch (error) {
      console.error("[ReliefAssistant] load error", error);
      setDiagnostic(
        error instanceof Error
          ? error.message
          : "Impossible de calculer les releves disponibles."
      );
    } finally {
      setLoading(false);
    }
  }, [activeVacation]);

  useEffect(() => {
    if (replaceOpen && activeVacation) {
      void loadSuggestions();
    }
  }, [replaceOpen, activeVacation, loadSuggestions]);

  const safeSuggestions = useMemo(
    () => suggestions.filter((suggestion) => suggestion.available),
    [suggestions]
  );

  const handleApply = async (agentId: string) => {
    if (!activeVacation) return;

    setSavingAgentId(agentId);
    try {
      const ok = await updateVacation(activeVacation.id, {
        assignedAgentIds: [agentId],
      });

      if (ok) {
        toast({
          title: "Releve affectee",
          description: "La vacation est maintenant couverte par l'agent recommande.",
        });
        setReplaceOpen(false);
        await refresh();
      }
    } finally {
      setSavingAgentId(null);
    }
  };

  if (!activeVacation) return null;

  return (
    <Sheet open={replaceOpen} onOpenChange={setReplaceOpen}>
      <SheetContent className="flex h-full flex-col border-l border-slate-800 bg-slate-950 text-slate-50 shadow-2xl sm:max-w-lg">
        <SheetHeader className="pb-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-2">
              <BrainCircuit className="h-5 w-5 text-cyan-300" />
            </div>
            <Badge
              variant="outline"
              className="rounded-full border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200"
            >
              Moteur de releve
            </Badge>
          </div>
          <SheetTitle className="text-2xl font-black tracking-tight text-white">
            Proposition de releve intelligente
          </SheetTitle>
          <SheetDescription className="text-sm font-semibold leading-relaxed text-slate-400">
            Sentrys filtre les agents selon disponibilite, repos 11h,
            qualification, dossier agent et charge hebdomadaire projetee.
          </SheetDescription>
        </SheetHeader>

        <div className="mb-4 rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-4">
          <div className="flex items-start gap-3">
            <Zap className="mt-0.5 h-5 w-5 text-cyan-300" />
            <div className="min-w-0">
              <p className="text-sm font-black text-cyan-100">
                Analyse prudente
              </p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-400">
                {loading
                  ? "Calcul des profils affectables..."
                  : `${safeSuggestions.length} agent(s) affectable(s) sur ${analyzedCount || suggestions.length} profil(s) analyse(s).`}
              </p>
            </div>
          </div>
        </div>

        <ScrollArea className="-mx-2 flex-1 px-2">
          <div className="space-y-4 pb-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-4 py-20">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400/60" />
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200/60">
                  Analyse disponibilite...
                </p>
              </div>
            ) : safeSuggestions.length === 0 ? (
              <div className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-6 text-center">
                <ShieldAlert className="mx-auto h-8 w-8 text-amber-300" />
                <p className="mt-3 text-sm font-black text-amber-100">
                  Aucun remplaçant sur a proposer
                </p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-100/70">
                  {diagnostic ?? "Les agents analyses presentent au moins un blocage."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void loadSuggestions()}
                  className="mt-5 rounded-2xl border-amber-300/30 bg-transparent text-amber-100 hover:bg-amber-300/10"
                >
                  Relancer l'analyse
                </Button>
              </div>
            ) : (
              safeSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="relative group">
                  <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-r from-cyan-400 to-emerald-400 opacity-0 blur transition duration-500 group-hover:opacity-20" />
                  <div className="relative rounded-3xl border border-slate-800 bg-slate-900/85 p-4 transition-all duration-300 group-hover:border-cyan-400/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="h-11 w-11 border-2 border-slate-800">
                          <AvatarFallback className="bg-slate-800 text-xs font-black text-slate-200">
                            {initials(suggestion.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">
                            {suggestion.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge className="border-none bg-emerald-400/10 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-200">
                              Affectable
                            </Badge>
                            <Badge
                              className={cn(
                                "border-none text-[9px] font-black uppercase tracking-[0.12em]",
                                suggestion.complianceStatus === "ok"
                                  ? "bg-emerald-400/10 text-emerald-200"
                                  : "bg-amber-400/10 text-amber-200"
                              )}
                            >
                              {statusLabel(suggestion.complianceStatus)}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className={cn("text-3xl font-black leading-none", scoreTone(suggestion.score))}>
                          {suggestion.score}%
                        </p>
                        <p className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Score
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-[11px] font-semibold text-slate-300 sm:grid-cols-2">
                      {suggestion.projectedWeekHours !== null && (
                        <div className="flex items-center gap-2 rounded-2xl bg-slate-950/60 px-3 py-2">
                          <Clock3 className="h-3.5 w-3.5 text-cyan-300" />
                          {suggestion.projectedWeekHours}h projetees/semaine
                        </div>
                      )}
                      <div className="flex items-center gap-2 rounded-2xl bg-slate-950/60 px-3 py-2">
                        <MapPin className="h-3.5 w-3.5 text-cyan-300" />
                        {suggestion.distanceKm !== null
                          ? `${suggestion.distanceKm} km du site`
                          : "Distance non calculee"}
                      </div>
                    </div>

                    <div className="mt-4 space-y-1.5">
                      {suggestion.strengths.slice(0, 4).map((reason) => (
                        <div key={reason} className="flex items-start gap-2 text-[11px] font-semibold text-slate-300">
                          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>

                    {suggestion.warnings.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3">
                        <div className="flex items-start gap-2 text-[11px] font-semibold text-amber-100/85">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                          <span>{suggestion.warnings.slice(0, 2).join(" · ")}</span>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={() => handleApply(suggestion.id)}
                      disabled={savingAgentId !== null}
                      className="mt-4 h-10 w-full rounded-2xl bg-cyan-400 font-black text-slate-950 shadow-lg shadow-cyan-400/15 hover:bg-cyan-300"
                    >
                      {savingAgentId === suggestion.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      Affecter cette releve
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="mt-auto border-t border-slate-800 pt-4">
          <Button
            variant="ghost"
            className="w-full rounded-2xl text-slate-400 hover:bg-slate-900 hover:text-white"
            onClick={() => setReplaceOpen(false)}
          >
            Fermer l'assistant
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
