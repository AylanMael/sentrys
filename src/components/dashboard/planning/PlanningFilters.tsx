"use client";

import React from "react";
import { Users, Building2, MapPin, CalendarOff } from "lucide-react";
import {
  usePlanning,
  type AgentApiItem,
  type PublicationFilter,
} from "./PlanningContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const publicationFilters: Array<{ value: PublicationFilter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "draft", label: "Brouillons" },
  { value: "published", label: "Publies" },
  { value: "modified", label: "A republier" },
];

export const PlanningFilters: React.FC = () => {
  const {
    mode,
    setMode,
    siteId,
    setSiteId,
    agentId,
    setAgentId,
    sites,
    sitesLoading,
    agents,
    agentsLoading,
    clearSelection,
    showAbsences,
    setShowAbsences,
    publicationFilter,
    setPublicationFilter,
  } = usePlanning();

  const agentLabel = (a: AgentApiItem) => {
    const fn = String(a.firstName ?? "").trim();
    const ln = String(a.lastName ?? "").trim();
    const full = `${fn} ${ln}`.trim();
    return full || a.email || a.phone || a.id;
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 animate-in fade-in slide-in-from-left-4 duration-700">
      {/* Mode Toggle - Luxe Style */}
      <div className="flex items-center bg-white/40 dark:bg-slate-900/40 p-1 rounded-xl border border-white/20 dark:border-slate-800/50 backdrop-blur-xl shadow-inner shadow-black/5 ring-1 ring-black/5">
        <Button
          variant={mode === "site" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setMode("site")}
          className={cn(
            "h-8 text-[10px] uppercase font-bold tracking-widest px-4 rounded-lg transition-all duration-300",
            mode === "site"
              ? "shadow-md bg-white dark:bg-slate-900 shadow-sm text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-white/10"
          )}
        >
          <Building2 className={cn("h-3 w-3 mr-1.5 transition-transform", mode === "site" && "scale-110")} />
          Sites
        </Button>
        <Button
          variant={mode === "agent" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => setMode("agent")}
          className={cn(
            "h-8 text-[10px] uppercase font-bold tracking-widest px-4 rounded-lg transition-all duration-300",
            mode === "agent"
              ? "shadow-md bg-white dark:bg-slate-900 shadow-sm text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-white/10"
          )}
        >
          <Users className={cn("h-3 w-3 mr-1.5 transition-transform", mode === "agent" && "scale-110")} />
          Agents
        </Button>
      </div>

      <Separator orientation="vertical" className="h-6 mx-1 opacity-20 hidden sm:block" />


      {/* Site Selector */}
      <div className="flex items-center gap-2">
        <Select
          value={siteId}
          onValueChange={(v) => {
            if (v !== siteId) {
              setSiteId(v);
              clearSelection();
            }
          }}
        >
          <SelectTrigger
            disabled={sitesLoading}
            className="w-[200px] h-10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-white/20 dark:border-slate-800/50 focus:ring-primary/20 text-xs font-semibold rounded-xl shadow-sm transition-all hover:bg-white/60 dark:hover:bg-slate-900/60 group"
          >
            <div className="flex items-center gap-2.5 truncate">
              <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <MapPin className="h-3.5 w-3.5 text-primary" />
              </div>
              <SelectValue placeholder="Sélectionner Site" />
            </div>
          </SelectTrigger>
          <SelectContent className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-white/20 dark:border-slate-800/50 rounded-xl shadow-2xl overflow-hidden">
            <SelectItem value="all" className="text-xs font-bold py-2.5 focus:bg-primary/10">Tous les périmètres</SelectItem>
            <Separator className="my-1 opacity-50" />
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs py-2.5 transition-colors focus:bg-primary/5">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Agent Selector */}
      {mode === "agent" && (
        <div className="flex items-center gap-2 animate-in zoom-in-95 duration-500">
           <Select
            value={agentId}
            onValueChange={(v) => {
              if (v !== agentId) {
                setAgentId(v);
                clearSelection();
              }
            }}
          >
            <SelectTrigger
              disabled={agentsLoading}
              className="w-[200px] h-10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-white/20 dark:border-slate-800/50 focus:ring-primary/20 text-xs font-semibold rounded-xl shadow-sm transition-all hover:bg-white/60 dark:hover:bg-slate-900/60 group"
            >
              <div className="flex items-center gap-2.5 truncate">
                <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Users className="h-3.5 w-3.5 text-primary" />
                </div>
                <SelectValue placeholder="Sélectionner Agent" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-white/20 dark:border-slate-800/50 rounded-xl shadow-2xl overflow-hidden">
              <SelectItem value="all" className="text-xs font-bold py-2.5 focus:bg-primary/10">Tous les effectifs</SelectItem>
              <Separator className="my-1 opacity-50" />
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id} className="text-xs py-2.5 transition-colors focus:bg-primary/5">
                  {agentLabel(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Separator orientation="vertical" className="h-6 mx-1 opacity-20 hidden md:block" />

      {/* Absences Toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowAbsences(!showAbsences)}
        className={cn(
          "h-10 px-4 rounded-xl border border-border/40 transition-all font-bold text-xs gap-2",
          showAbsences
            ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/20 hover:bg-indigo-500/20"
            : "text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
        )}
      >
        <CalendarOff className={cn("h-4 w-4", showAbsences ? "opacity-100" : "opacity-40")} />
        {showAbsences ? "Absences Visibles" : "Absences Masquées"}
      </Button>

      <div className="flex items-center rounded-xl border border-border/40 bg-white/35 p-1 shadow-inner shadow-black/5 backdrop-blur-xl dark:bg-slate-900/35">
        {publicationFilters.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPublicationFilter(filter.value)}
            className={cn(
              "h-8 rounded-lg px-3 text-[10px] font-black uppercase tracking-[0.12em]",
              publicationFilter === filter.value
                ? "bg-white text-primary shadow-sm dark:bg-slate-900"
                : "text-muted-foreground hover:bg-white/30 hover:text-foreground"
            )}
          >
            {filter.label}
          </Button>
        ))}
      </div>
    </div>
  );
};
