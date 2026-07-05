"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader2,
  Map as MapIcon,
  Radar,
  RefreshCw,
  ShieldCheck,
  Siren,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppFeedback } from "@/hooks/use-app-feedback";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";

const TacticalMap = dynamic(() => import("@/components/tactical-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[520px] w-full items-center justify-center rounded-[1.75rem] border bg-slate-950 text-slate-300">
      <Loader2 className="mr-3 h-5 w-5 animate-spin text-cyan-300" />
      Chargement de la carte...
    </div>
  ),
});

type CommandStats = {
  totalSites: number;
  activePatrols: number;
  recentIncidentsCount: number;
};

type CommandSite = {
  id: string;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location?: {
    latitude?: number | null;
    longitude?: number | null;
  } | null;
};

type CommandIncident = {
  id: string;
  type?: string | null;
  description?: string | null;
  priority?: "low" | "medium" | "high" | string | null;
  status?: string | null;
  createdAtIso?: string | null;
};

type CommandPatrol = {
  id: string;
  status?: string | null;
};

type CommandResponse = {
  ok: boolean;
  stats: CommandStats;
  sites: CommandSite[];
  activePatrols: CommandPatrol[];
  incidents: CommandIncident[];
};

type CommandView = "overview" | "map" | "alerts";

const COMMAND_VIEWS: Array<{
  id: CommandView;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { id: "overview", label: "Vue rapide", icon: Radar },
  { id: "map", label: "Carte", icon: MapIcon },
  { id: "alerts", label: "Alertes", icon: Siren },
];
type SituationTone = "clear" | "watch" | "alert";

function priorityLabel(priority: string | null | undefined) {
  if (priority === "high") return "Critique";
  if (priority === "low") return "Faible";
  return "A surveiller";
}

function priorityClass(priority: string | null | undefined) {
  if (priority === "high") {
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  }

  if (priority === "low") {
    return "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300";
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function formatSyncTime(date: Date | null) {
  if (!date) return "Jamais";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function incidentTitle(incident: CommandIncident) {
  return incident.type || "Signal terrain";
}

function incidentDetail(incident: CommandIncident) {
  return incident.description || "Aucun detail renseigne.";
}

function getSituation(data: CommandResponse | null): {
  tone: SituationTone;
  title: string;
  detail: string;
  action: string;
} {
  const highIncidents =
    data?.incidents?.filter((incident) => incident.priority === "high").length ?? 0;
  const incidents = data?.incidents?.length ?? 0;
  const activePatrols = data?.stats?.activePatrols ?? 0;

  if (highIncidents > 0) {
    return {
      tone: "alert",
      title: "Priorite terrain",
      detail: `${highIncidents} incident(s) critique(s) a traiter en premier.`,
      action: "Ouvrir les incidents",
    };
  }

  if (incidents > 0 || activePatrols > 0) {
    return {
      tone: "watch",
      title: "Situation a suivre",
      detail: `${incidents} signalement(s) recent(s), ${activePatrols} ronde(s) active(s).`,
      action: "Tracer dans la conduite",
    };
  }

  return {
    tone: "clear",
    title: "Situation calme",
    detail: "Aucune alerte critique remontee sur le perimetre charge.",
    action: "Voir la conduite",
  };
}

function situationClass(tone: SituationTone) {
  if (tone === "alert") return "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200";
  if (tone === "watch") return "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100";
}

function CommandSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-36 rounded-[2rem]" />
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-28 rounded-[1.5rem]" />
        <Skeleton className="h-28 rounded-[1.5rem]" />
        <Skeleton className="h-28 rounded-[1.5rem]" />
      </div>
      <Skeleton className="h-[520px] rounded-[2rem]" />
    </div>
  );
}

export default function CommandPage() {
  const feedback = useAppFeedback();
  const [data, setData] = useState<CommandResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [commandView, setCommandView] = useState<CommandView>("overview");

  const situation = useMemo(() => getSituation(data), [data]);
  const highIncidentCount = useMemo(
    () => data?.incidents?.filter((incident) => incident.priority === "high").length ?? 0,
    [data]
  );
  const watchIncidentCount = useMemo(
    () =>
      data?.incidents?.filter((incident) => incident.priority !== "high").length ?? 0,
    [data]
  );
  const situationHref =
    situation.tone === "alert" ? "/dashboard/incidents" : "/dashboard/conduite";

  const fetchStats = useCallback(
    async (options: { quiet?: boolean; refresh?: boolean } = {}) => {
      if (options.refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const response = await apiFetch<CommandResponse>("/api/command/stats");
        setData(response);
        setLastSync(new Date());

        if (!options.quiet) {
          feedback.info(
            "Supervision synchronisee",
            `${response.stats.totalSites} site(s), ${response.stats.activePatrols} ronde(s), ${response.incidents.length} incident(s) recent(s).`
          );
        }
      } catch (err) {
        const message = getApiErrorMessage(
          err,
          "Impossible de charger le centre de supervision."
        );
        setError(message);
        feedback.error(err, {
          title: "Supervision indisponible",
          fallback: message,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [feedback]
  );

  useEffect(() => {
    void fetchStats({ quiet: true });
    const interval = window.setInterval(() => {
      void fetchStats({ quiet: true, refresh: true });
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [fetchStats]);

  if (loading && !data) {
    return <CommandSkeleton />;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
      <section className="relative overflow-hidden rounded-[1.5rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4 text-white shadow-xl dark:border-white/10">
        <div className="pointer-events-none absolute right-[-6rem] top-[-7rem] h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />

        <div className="relative z-10 grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <Badge className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
              Supervision temps reel
            </Badge>
            <h1 className="mt-2 flex items-center gap-3 text-2xl font-black tracking-tight md:text-3xl">
              <Radar className="h-7 w-7 text-cyan-200" />
              Command Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              Vue courte pour savoir ce qui se passe maintenant : sites, rondes,
              incidents recents et priorites terrain. La conduite garde ensuite
              la trace des decisions prises.
            </p>
          </div>

          <div className={cn("rounded-2xl border p-4", situationClass(situation.tone))}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-75">
                  Etat operationnel
                </p>
                <p className="mt-2 text-xl font-black">{situation.title}</p>
                <p className="mt-1 text-sm font-semibold opacity-85">
                  {situation.detail}
                </p>
              </div>
              {situation.tone === "alert" ? (
                <Siren className="h-6 w-6 shrink-0" />
              ) : situation.tone === "watch" ? (
                <AlertTriangle className="h-6 w-6 shrink-0" />
              ) : (
                <CheckCircle2 className="h-6 w-6 shrink-0" />
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className={cn("rounded-2xl border p-4", situationClass(situation.tone))}>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
            Priorite terrain
          </p>
          <p className="mt-1 text-xl font-black">{situation.title}</p>
          <p className="mt-1 line-clamp-2 text-xs font-semibold opacity-75">
            {situation.detail}
          </p>
        </div>
        <div
          className={cn(
            "rounded-2xl border p-4",
            highIncidentCount > 0
              ? "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-100"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100"
          )}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
            Critiques
          </p>
          <p className="mt-1 text-2xl font-black">{highIncidentCount}</p>
          <p className="mt-1 text-xs font-semibold opacity-75">
            {watchIncidentCount} signalement(s) a surveiller
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-cyan-800 dark:text-cyan-100">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
            Rondes actives
          </p>
          <p className="mt-1 text-2xl font-black">{data?.stats.activePatrols ?? 0}</p>
          <p className="mt-1 text-xs font-semibold opacity-75">
            {data?.stats.totalSites ?? 0} site(s) suivis
          </p>
        </div>
        <Link
          href={situationHref}
          className="group rounded-2xl border border-primary/25 bg-primary/10 p-4 text-primary transition hover:-translate-y-0.5"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
            Action prioritaire
          </p>
          <p className="mt-1 text-sm font-black">{situation.action}</p>
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold opacity-75">
            Ouvrir maintenant
            <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
          </p>
        </Link>
      </div>

      <div className="rounded-[1.25rem] border border-border/60 bg-background/85 p-2 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1">
            {COMMAND_VIEWS.map((item) => {
              const Icon = item.icon;
              const active = commandView === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCommandView(item.id)}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-black transition",
                    active
                      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-800 shadow-sm dark:text-cyan-100"
                      : "border-transparent bg-muted/35 text-muted-foreground hover:border-border hover:bg-background"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1 font-black">
              Synchro : {formatSyncTime(lastSync)}
            </Badge>
            <Button
              type="button"
              variant="outline"
              onClick={() => void fetchStats({ refresh: true })}
              disabled={refreshing}
              className="h-10 rounded-xl font-black"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
              Rafraichir
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-xl font-black">
              <Link href="/dashboard/conduite">Conduite</Link>
            </Button>
            <Button asChild className="h-10 rounded-xl bg-slate-950 font-black text-white hover:bg-slate-800">
              <Link href="/dashboard/incidents">Incidents</Link>
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          tone="danger"
          title="Command Center indisponible"
          description={error}
          action={
            <Button
              type="button"
              onClick={() => void fetchStats({ refresh: true })}
              className="rounded-2xl font-black"
            >
              Reessayer
            </Button>
          }
        />
      ) : null}

      <div className={cn("grid gap-3 md:grid-cols-3", commandView !== "overview" && "hidden")}>
        <CommandKpi
          label="Sites suivis"
          value={data?.stats.totalSites ?? 0}
          detail="Perimetre operationnel charge"
          icon={ShieldCheck}
          tone="success"
        />
        <CommandKpi
          label="Rondes actives"
          value={data?.stats.activePatrols ?? 0}
          detail="Sessions terrain en cours"
          icon={Activity}
          tone="info"
        />
        <CommandKpi
          label="Incidents recents"
          value={data?.stats.recentIncidentsCount ?? 0}
          detail={
            highIncidentCount > 0
              ? `${highIncidentCount} critique(s) a traiter`
              : "Aucun critique detecte"
          }
          icon={Siren}
          tone={highIncidentCount > 0 ? "danger" : "warning"}
        />
      </div>

      <div className="grid gap-5">
        {commandView === "map" && (
        <Card className="overflow-hidden rounded-[1.5rem] border-border/60 shadow-sm">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl font-black">
                  <MapIcon className="h-5 w-5 text-primary" />
                  Carte terrain
                </CardTitle>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  Localisation des sites et incidents geolocalises.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-black">
                <MapLegendDot className="bg-blue-500" label="Site" />
                <MapLegendDot className="bg-red-500" label="Incident critique" />
                <MapLegendDot className="bg-amber-500" label="Incident a surveiller" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="h-[560px] min-h-[420px] overflow-hidden rounded-2xl border bg-slate-950">
              <TacticalMap
                sites={data?.sites ?? []}
                incidents={data?.incidents ?? []}
                activePatrols={data?.activePatrols ?? []}
              />
            </div>
          </CardContent>
        </Card>
        )}

        <div className="space-y-5">
          <Card className={cn("rounded-[1.5rem] border-border/60 shadow-sm", commandView !== "alerts" && commandView !== "overview" && "hidden")}>
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-xl font-black">
                <Siren className="h-5 w-5 text-primary" />
                A traiter maintenant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {(data?.incidents?.length ?? 0) === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  tone="success"
                  compact
                  title="Aucune alerte recente"
                  description="La supervision reste active en arriere-plan."
                />
              ) : (
                data?.incidents.slice(0, 6).map((incident) => (
                  <div
                    key={incident.id}
                    className="rounded-2xl border bg-background p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
                          priorityClass(incident.priority)
                        )}
                      >
                        {priorityLabel(incident.priority)}
                      </Badge>
                      <Clock3 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-3 font-black text-foreground">
                      {incidentTitle(incident)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm font-medium leading-6 text-muted-foreground">
                      {incidentDetail(incident)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className={cn("rounded-[1.5rem] border-cyan-500/20 bg-cyan-500/5 shadow-sm", commandView !== "overview" && "hidden")}>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-cyan-500/15 p-3 text-cyan-700 dark:text-cyan-200">
                  <Radar className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black text-foreground">Utilite du module</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">
                    Le Command Center sert a detecter vite. Si une action est
                    prise, elle doit ensuite etre tracee dans la conduite.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full rounded-xl font-black">
                <Link href="/dashboard/conduite">
                  Tracer une decision <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CommandKpi({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  tone: "success" | "info" | "warning" | "danger";
}) {
  return (
    <Card
      className={cn(
        "rounded-2xl border shadow-sm",
        tone === "success" && "border-emerald-500/25 bg-emerald-500/10",
        tone === "info" && "border-sky-500/25 bg-sky-500/10",
        tone === "warning" && "border-amber-500/30 bg-amber-500/10",
        tone === "danger" && "border-red-500/30 bg-red-500/10"
      )}
    >
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-black text-foreground">{value}</p>
          <p className="mt-1 text-xs font-bold text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-xl bg-background/70 p-2.5 shadow-sm">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function MapLegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-muted-foreground">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}
