// src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PlusCircle,
  CreditCard,
  CalendarClock,
  Clock3,
  Users,
  MapPin,
  Building2,
  AlertTriangle,
  ArrowRight,
  AlertCircle,
  Loader2,
  FileWarning,
  ShieldCheck,
  Siren,
  BarChart3,
  Eye,
  EyeOff,
  Gauge,
  WalletCards,
} from "lucide-react";

import { DashboardStats } from "@/components/dashboard/stats-cards";
import { RecentIncidentsCard } from "@/components/dashboard/recent-incidents";
import { RecentActivityCard } from "@/components/dashboard/recent-activity";
import { AgentMissions } from "@/components/dashboard/agent-missions";
import { LiveMap } from "@/components/dashboard/live-map";
import { AnalyticsCharts } from "@/components/dashboard/analytics-charts";
import { AiRiskAlerts } from "@/components/dashboard/ai-risk-alerts";
import { OperationsOverview } from "@/components/dashboard/operations-overview";
import {
  ExploitationCockpit,
  type DashboardCockpitSnapshot,
} from "@/components/dashboard/exploitation-cockpit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isAgentRole } from "@/lib/auth/role";
import { useAuth } from "@/lib/auth-provider";
import { apiFetch } from "@/lib/api/client-fetch";

type BillingUsageResponse = {
  ok: boolean;
  tenantId?: string;
  plan?: {
    id?: string;
    name?: string;
    priceMonthlyCents?: number | null;
    features?: Record<string, boolean>;
  };
  subscription?: {
    planId?: string;
    status?: string;
    addons?: Record<string, unknown> | null;
    periodStart?: string | number | null;
    periodEnd?: string | number | null;
  };
  limits?: { agents?: number; sites?: number; tenants?: number };
  usage?: {
    agents?: number;
    sites?: number;
    tenants?: number;
    activeTenants?: number;
    updatedAt?: string | number | null;
  };
  progress?: { agentsPct?: number; sitesPct?: number; tenantsPct?: number };
  atLimit?: { agents?: boolean; sites?: boolean; tenants?: boolean };
  atLimitList?: string[];
  error?: string;
};

type SiteMapPoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: "active" | "inactive";
};

type SiteApiRow = {
  id: string;
  name?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  isActive?: boolean | null;
};

type ComplianceSummaryItem = {
  id: string;
  agentId: string;
  agentName: string;
  periodLabel: string;
  siteNames: string[];
  sentAtIso: string | null;
  complianceOverrideReason: string | null;
  complianceOverrideDétail: string | null;
  complianceResolutionStatus: "to_regularize" | "regularized" | "accepted_exception";
};

type ComplianceSummaryResponse = {
  ok: boolean;
  stats: {
    total: number;
    to_regularize: number;
    regularized: number;
    accepted_exception: number;
  };
  urgent: ComplianceSummaryItem[];
  error?: string;
};

type DashboardView = "realtime" | "analytics" | "account";

const DASHBOARD_VIEWS: {
  id: DashboardView;
  label: string;
  description: string;
  icon: typeof Gauge;
}[] = [
  {
    id: "realtime",
    label: "Temps r\u00e9el",
    description: "Urgences et actions du jour.",
    icon: Gauge,
  },
  {
    id: "analytics",
    label: "Analyses",
    description: "Tendances et historique.",
    icon: BarChart3,
  },
  {
    id: "account",
    label: "Compte",
    description: "Abonnement et quotas.",
    icon: WalletCards,
  },
];

function DashboardControlTower({
  snapshot,
}: {
  snapshot: DashboardCockpitSnapshot | null;
}) {
  const metrics = [
    {
      label: "Postes \u00e0 couvrir",
      value: snapshot ? snapshot.uncoveredPosts : "-",
      icon: CalendarClock,
      href: "/dashboard/planning",
      tone:
        snapshot && snapshot.uncoveredPosts > 0
          ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
          : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Incidents ouverts",
      value: snapshot ? snapshot.openIncidents : "-",
      icon: Siren,
      href: "/dashboard/incidents",
      tone:
        snapshot && snapshot.openIncidents > 0
          ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    {
      label: "Prises < 2h",
      value: snapshot ? snapshot.startsNextTwoHours : "-",
      icon: Clock3,
      href: "/dashboard/planning",
      tone: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon;

        return (
          <Link
            key={metric.label}
            href={metric.href}
            className={cn(
              "flex min-h-[72px] items-center justify-between rounded-2xl border px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-sm",
              metric.tone
            )}
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                {metric.label}
              </p>
              <p className="mt-1 text-xl font-black leading-none">
                {metric.value}
              </p>
            </div>
            <Icon className="h-5 w-5 opacity-80" />
          </Link>
        );
      })}

      <Link
        href={snapshot?.actionHref ?? "/dashboard/planning"}
        className={cn(
          "group flex min-h-[72px] items-center justify-between rounded-2xl border px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-sm",
          snapshot?.verdict === "critical"
            ? "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"
            : snapshot?.verdict === "warning"
              ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-primary/25 bg-primary/10 text-primary"
        )}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
            Action prioritaire
          </p>
          <p className="mt-1 truncate text-sm font-black">
            {snapshot?.actionTitle ?? "Lecture en cours"}
          </p>
          <p className="mt-0.5 text-xs font-semibold opacity-70">
            {snapshot?.actionLabel ?? "Encore quelques secondes"}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
      </Link>
    </div>
  );
}

function toAtLimitList(b: BillingUsageResponse | null): string[] {
  if (!b) return [];
  if (Array.isArray(b.atLimitList)) return b.atLimitList;

  const atLimit = b.atLimit ?? {};
  const out: string[] = [];
  if (atLimit.agents) out.push("agents");
  if (atLimit.sites) out.push("sites");
  if (atLimit.tenants) out.push("tenants");
  return out;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const isAgent = isAgentRole(user?.role);

  const [billing, setBilling] = useState<BillingUsageResponse | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteMapPoint[]>([]);
  const [complianceSummary, setComplianceSummary] =
    useState<ComplianceSummaryResponse | null>(null);
  const [complianceSummaryError, setComplianceSummaryError] =
    useState<string | null>(null);
  const [complianceSummaryLoading, setComplianceSummaryLoading] =
    useState(false);
  const [cockpitSnapshot, setCockpitSnapshot] =
    useState<DashboardCockpitSnapshot | null>(null);
  const [dashboardView, setDashboardView] =
    useState<DashboardView>("realtime");
  const [calmMode, setCalmMode] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [showAiRisk, setShowAiRisk] = useState(false);

  useEffect(() => {
    if (
      authLoading ||
      isAgent ||
      dashboardView !== "account" ||
      billing ||
      billingLoading ||
      billingError
    ) {
      return;
    }

    let mounted = true;
    const controller = new AbortController();

    async function loadBilling() {
      setBillingLoading(true);
      setBillingError(null);

      try {
        const billingRes = await apiFetch<BillingUsageResponse>(
          "/api/billing/usage",
          { signal: controller.signal }
        );

        if (!mounted) return;

        if (billingRes?.ok) {
          setBilling(billingRes);
        } else if (billingRes) {
          setBillingError(billingRes.error ?? "Erreur billing");
        }
      } catch (error: unknown) {
        if (!mounted || controller.signal.aborted) return;
        setBillingError(
          error instanceof Error ? error.message : "Erreur de chargement"
        );
      } finally {
        if (!mounted) return;
        setBillingLoading(false);
      }
    }

    void loadBilling();

    return () => {
      mounted = false;
      controller.abort();
      setBillingLoading(false);
    };
  }, [authLoading, billing, billingError, dashboardView, isAgent]);

  useEffect(() => {
    if (authLoading || isAgent || dashboardView !== "realtime") {
      return;
    }

    let mounted = true;

    async function loadRealtimeSupport() {
      setComplianceSummaryLoading(true);
      setComplianceSummaryError(null);

      try {
        const [sitesRes, complianceRes] = await Promise.all([
          apiFetch<{ ok: boolean; sites: SiteApiRow[] }>("/api/sites?limit=100"),
          apiFetch<ComplianceSummaryResponse>(
            "/api/compliance-overrides/summary"
          ),
        ]);

        if (!mounted) return;

        if (sitesRes?.ok) {
          const mapReadySites = (sitesRes.sites ?? [])
            .filter((site) => site.latitude && site.longitude)
            .map((site) => ({
              id: site.id,
              name: site.name ?? "Site sans nom",
              latitude: Number(site.latitude),
              longitude: Number(site.longitude),
              status: (site.isActive ? "active" : "inactive") as
                | "active"
                | "inactive",
            }));

          setSites(mapReadySites);
        }

        if (complianceRes?.ok) {
          setComplianceSummary(complianceRes);
        } else {
          setComplianceSummaryError(
            complianceRes?.error ?? "Erreur conformit\u00e9"
          );
        }
      } catch (error: unknown) {
        if (!mounted) return;
        setComplianceSummary(null);
        setComplianceSummaryError(
          error instanceof Error ? error.message : "Erreur conformit\u00e9"
        );
      } finally {
        if (!mounted) return;
        setComplianceSummaryLoading(false);
      }
    }

    void loadRealtimeSupport();

    return () => {
      mounted = false;
    };
  }, [authLoading, dashboardView, isAgent]);

  const handleCockpitSnapshot = useCallback(
    (snapshot: DashboardCockpitSnapshot) => {
      setCockpitSnapshot(snapshot);
    },
    []
  );

  const usedTenants = billing?.usage?.activeTenants ?? billing?.usage?.tenants ?? 0;
  const atLimitList = useMemo(() => toAtLimitList(billing), [billing]);

  return (
    <div className="mx-auto max-w-[1500px] animate-in space-y-3 fade-in duration-500 pb-8">
      <section className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-gradient-to-br from-background via-background to-primary/5 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary"
              >
                Vue d&apos;ensemble
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300"
              >
                Exploitation du jour
              </Badge>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground md:text-3xl">
              Votre journ&eacute;e, sans bruit.
            </h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-muted-foreground">
              Une lecture simple pour couvrir les postes, traiter les urgences
              et diffuser les informations. Les d&eacute;tails restent accessibles,
              jamais impos&eacute;s.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-10 rounded-xl px-3 font-black">
              <Link href="/dashboard/planning">
                <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
                Planning
              </Link>
            </Button>
            <Button asChild className="h-10 rounded-xl bg-primary px-3 font-black shadow-sm shadow-primary/15">
              <Link href="/dashboard/incidents">
                <PlusCircle className="mr-2 h-4 w-4" />
                Incident
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-xl px-3 font-black">
              <Link href="/dashboard/conduite">
                <FileWarning className="mr-2 h-4 w-4 text-amber-600" />
                Conduite
              </Link>
            </Button>
          </div>
        </div>

        {!isAgent ? (
          <div className="mt-4">
            <DashboardControlTower snapshot={cockpitSnapshot} />
          </div>
        ) : null}
      </section>

      {!isAgent && (
        <section className="rounded-[1.25rem] border border-border/60 bg-background/85 p-2 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1">
              {DASHBOARD_VIEWS.map((item) => {
                const Icon = item.icon;
                const isActive = dashboardView === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDashboardView(item.id)}
                    className={cn(
                      "group flex h-10 items-center gap-2 rounded-xl border px-3 text-left transition",
                      isActive
                        ? "border-primary/30 bg-primary/10 shadow-sm"
                        : "border-transparent bg-muted/35 hover:border-border hover:bg-background"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-sm font-black",
                            isActive ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          {item.label}
                        </p>
                        <p className="sr-only">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              variant={calmMode ? "default" : "outline"}
              onClick={() => {
                const nextCalmMode = !calmMode;
                setCalmMode(nextCalmMode);
                setShowMap(!nextCalmMode);
                setShowAiRisk(false);
              }}
              className={cn(
                "h-10 rounded-xl px-3 font-black",
                calmMode && "shadow-lg shadow-primary/15"
              )}
            >
              {calmMode ? (
                <EyeOff className="mr-2 h-4 w-4" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              {calmMode ? "Mode calme actif" : "Mode complet"}
            </Button>
          </div>
        </section>
      )}

      {!isAgent && dashboardView === "realtime" && (
        <div className="relative z-10 animate-in slide-in-from-top-6 duration-700">
          <ExploitationCockpit onSnapshot={handleCockpitSnapshot} variant="compact" />
        </div>
      )}

      {!isAgent && dashboardView === "realtime" && (
        <div className="relative z-10 animate-in slide-in-from-top-5 duration-700">
          <ComplianceSummaryAlert
            loading={complianceSummaryLoading && !complianceSummary}
            summary={complianceSummary}
            error={complianceSummaryError}
          />
        </div>
      )}

      {!isAgent && dashboardView === "realtime" && !calmMode && (
        <section className="relative z-10 animate-in slide-in-from-top-4 duration-700">
          <div className="mb-3 flex flex-col gap-1 px-1 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                Supervision terrain
              </p>
              <h2 className="text-xl font-black tracking-tight text-foreground">
                {"Situations \u00e0 surveiller"}
              </h2>
            </div>
            <p className="max-w-2xl text-sm font-semibold text-muted-foreground">
              Le cockpit donne la décision. Cette zone sert a approfondir les
              prises de service, incidents, sites en tension et remplacements.
            </p>
          </div>
          <OperationsOverview activeSitesCount={sites.length} />
        </section>
      )}

      {!isAgent && dashboardView === "realtime" && !calmMode && (
        <section className="rounded-[2rem] border border-border/60 bg-background/80 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                Modules secondaires
              </p>
              <h2 className="text-lg font-black tracking-tight text-foreground">
                Afficher seulement si necessaire
              </h2>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Le mode calme garde la conduite lisible. Carte et IA restent a
                portee de main sans envahir l'écran.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={showMap ? "default" : "outline"}
                onClick={() => setShowMap((value) => !value)}
                className="rounded-2xl font-black"
              >
                {showMap ? "Masquer carte" : "Afficher carte"}
              </Button>
              <Button
                type="button"
                variant={showAiRisk ? "default" : "outline"}
                onClick={() => setShowAiRisk((value) => !value)}
                className="rounded-2xl font-black"
              >
                {showAiRisk ? "Masquer IA" : "Afficher IA"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {!isAgent &&
        dashboardView === "realtime" &&
        !calmMode &&
        (showMap || showAiRisk) && (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            {showMap && (
              <div className="relative z-10 animate-in slide-in-from-top-4 duration-1000">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <div className="h-5 w-1 rounded-full bg-primary" />
                  <h2 className="text-lg font-black tracking-tight text-foreground">
                    Carte des sites
                  </h2>
                </div>
                <LiveMap sites={sites} height="390px" />
              </div>
            )}

            {showAiRisk && (
              <div className="relative z-10 animate-in slide-in-from-top-6 duration-700">
                <AiRiskAlerts />
              </div>
            )}
          </div>
        )}

      {!isAgent && dashboardView === "analytics" && (
        <div className="relative z-10">
          <DashboardStats />
        </div>
      )}

      {!isAgent && dashboardView === "analytics" && (
        <div className="relative z-10">
          <AnalyticsCharts />
        </div>
      )}

      {isAgent && (
        <div className="relative z-10">
          <AgentMissions />
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {((!isAgent && dashboardView === "realtime") || isAgent) && (
          <div className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-background/85 shadow-sm backdrop-blur">
            <RecentIncidentsCard />
          </div>
        )}

        {!isAgent && dashboardView === "analytics" && (
          <div className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-background/85 shadow-sm backdrop-blur">
            <RecentActivityCard />
          </div>
        )}

        {!isAgent && dashboardView === "account" && (
        <div className="flex h-full flex-col lg:col-span-2">
          <div className="glass-card group relative flex flex-1 flex-col overflow-hidden rounded-[1.75rem] border-none p-6">
            <div className="pointer-events-none absolute right-0 top-0 p-8 opacity-5 transition-opacity group-hover:opacity-10">
              <CreditCard className="h-40 w-40 rotate-12" />
            </div>

            <div className="relative z-10 mb-6 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl border border-primary/10 bg-primary/10 p-3 backdrop-blur-md">
                    <CreditCard className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tighter">
                      Abonnement
                    </h2>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                      Gestion des quotas
                    </p>
                  </div>
                </div>

                {!billingLoading && !billingError && (
                  <div className="flex items-center">
                    {atLimitList.length > 0 ? (
                      <Badge
                        variant="destructive"
                        className="animate-pulse rounded-full px-3 py-1 text-[10px] font-black uppercase shadow-lg shadow-destructive/20"
                      >
                        Alerte quota
                      </Badge>
                    ) : (
                      <Badge className="rounded-full border-transparent bg-green-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-green-500 hover:bg-green-500/20">
                        {"Op\u00e9rationnel"}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="relative z-10 flex flex-1 flex-col justify-center">
              {billingLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="mb-4 h-10 w-10 animate-spin text-primary opacity-50" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/30">
                    Synchronisation...
                  </p>
                </div>
              ) : billingError ? (
                <div className="flex flex-col items-center justify-center rounded-[2rem] border border-destructive/10 bg-destructive/5 p-6 py-12 text-center">
                  <AlertTriangle className="mb-4 h-10 w-10 text-destructive/50" />
                  <p className="text-sm font-black uppercase tracking-tight text-destructive/80">
                    {billingError}
                  </p>
                </div>
              ) : billing?.ok ? (
                <div className="space-y-5">
                  <div className="group/plan flex items-center justify-between rounded-3xl border border-white/5 bg-white/5 p-6 backdrop-blur-md transition-all hover:border-white/10">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                        Sentrys intelligence plan
                      </p>
                      <p className="mt-1 text-xl font-black capitalize tracking-tight text-foreground transition-all group-hover/plan:premium-gradient-text">
                        {billing.plan?.name ?? billing.subscription?.planId ?? "Standard"}
                      </p>
                    </div>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-10 rounded-xl border border-white/5 px-5 text-[10px] font-black uppercase tracking-widest hover:bg-white/10"
                    >
                      <Link href="/dashboard/billing">
                        Upgrade <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div
                      className={cn(
                        "rounded-2xl border p-4 transition-all duration-300",
                        atLimitList.includes("agents")
                          ? "border-destructive/20 bg-destructive/5"
                          : "border-white/5 bg-white/5 hover:border-white/10"
                      )}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                          Agents
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "text-3xl font-black tracking-tighter",
                            atLimitList.includes("agents")
                              ? "text-destructive"
                              : "text-foreground"
                          )}
                        >
                          {billing.usage?.agents ?? 0}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground/30">
                          / {billing.limits?.agents ?? "illimit\u00e9"}
                        </span>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "rounded-2xl border p-4 transition-all duration-300",
                        atLimitList.includes("sites")
                          ? "border-destructive/20 bg-destructive/5"
                          : "border-white/5 bg-white/5 hover:border-white/10"
                      )}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                          Sites
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "text-3xl font-black tracking-tighter",
                            atLimitList.includes("sites")
                              ? "text-destructive"
                              : "text-foreground"
                          )}
                        >
                          {billing.usage?.sites ?? 0}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground/30">
                          / {billing.limits?.sites ?? "illimit\u00e9"}
                        </span>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "col-span-2 rounded-2xl border p-4 transition-all duration-300",
                        atLimitList.includes("tenants")
                          ? "border-destructive/20 bg-destructive/5"
                          : "border-white/5 bg-white/5 hover:border-white/10"
                      )}
                    >
                      <div className="mb-3 flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40">
                          Unit&eacute;s op&eacute;rationnelles
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "text-3xl font-black tracking-tighter",
                            atLimitList.includes("tenants")
                              ? "text-destructive"
                              : "text-foreground"
                          )}
                        >
                          {usedTenants}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground/30">
                          / {billing.limits?.tenants ?? "illimit\u00e9"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {atLimitList.length > 0 && (
                    <div className="glass-card mt-2 flex animate-in items-start gap-4 rounded-3xl border-none bg-destructive/10 p-6 fade-in slide-in-from-bottom-4 duration-500">
                      <AlertCircle className="h-6 w-6 shrink-0 text-destructive" />
                      <div>
                        <p className="text-sm font-black uppercase tracking-tight text-destructive">
                          Capacit&eacute; maximale atteinte
                        </p>
                        <p className="mt-1 text-[11px] font-bold leading-relaxed text-destructive/70">
                          La plateforme tourne &agrave; flux tendu. Un passage au plan
                          sup&eacute;rieur est requis pour ajouter de nouveaux actifs.
                        </p>
                        <Button
                          asChild
                          variant="link"
                          className="mt-3 h-auto p-0 text-[11px] font-black uppercase tracking-widest text-destructive hover:text-destructive/80"
                        >
                          <Link href="/dashboard/billing">&Eacute;largir le quota</Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground/30">
                  Aucune donn&eacute;e d&apos;abonnement.
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function ComplianceSummaryAlert({
  loading,
  summary,
  error,
}: {
  loading: boolean;
  summary: ComplianceSummaryResponse | null;
  error: string | null;
}) {
  const openCount = summary?.stats.to_regularize ?? 0;
  const closedCount =
    (summary?.stats.regularized ?? 0) +
    (summary?.stats.accepted_exception ?? 0);

  if (loading) {
    return (
      <div className="glass-card flex items-center gap-4 rounded-[2rem] border-none p-5">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
          Contrôle conformité en cours...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[2rem] border border-amber-500/20 bg-amber-500/10 p-5 text-amber-800 dark:text-amber-200">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black">Registre conformité indisponible</p>
            <p className="mt-1 text-xs font-semibold opacity-80">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (openCount === 0) {
    return (
      <div className="rounded-[2rem] border border-emerald-500/25 bg-emerald-500/10 p-5 text-emerald-800 dark:text-emerald-200">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-emerald-500/15 p-3">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em]">
                Conformité planning maîtrisée
              </p>
              <p className="mt-1 text-sm font-semibold opacity-80">
                Aucune exception à régulariser. {closedCount} exception(s)
                deja fermée(s) ou acceptee(s).
              </p>
            </div>
          </div>

          <Button asChild variant="outline" className="rounded-2xl font-black">
            <Link href="/dashboard/conformite">
              Voir registre <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-background to-red-500/10 p-5 shadow-xl shadow-amber-500/5">
      <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <FileWarning className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <Badge
              variant="outline"
              className="rounded-full border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300"
            >
              Action exploitation
            </Badge>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">
              {openCount} exception(s) conformité à régulariser
            </h2>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-muted-foreground">
              Des plannings ont ete forces. Il faut régulariser les dossiers,
              accepter l'exception ou documenter la décision.
            </p>

            {summary?.urgent?.length ? (
              <div className="mt-4 grid gap-2 lg:grid-cols-3">
                {summary.urgent.map((item) => (
                  <Link
                    key={item.id}
                    href={`/dashboard/agents/${item.agentId}`}
                    className="rounded-2xl border border-amber-500/20 bg-background/80 p-3 transition hover:border-amber-500/40 hover:bg-background"
                  >
                    <p className="truncate text-sm font-black text-foreground">
                      {item.agentName}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-muted-foreground">
                      {item.complianceOverrideDétail ||
                        "Blocage conformité à vérifier"}
                    </p>
                    <p className="mt-2 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                      {item.periodLabel}
                    </p>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:flex-col">
          <Button asChild className="h-11 rounded-2xl bg-amber-600 px-5 font-black text-white hover:bg-amber-700">
            <Link href="/dashboard/conformite">
              Traiter maintenant <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-2xl font-black">
            <Link href="/dashboard/planning">Retour planning</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
