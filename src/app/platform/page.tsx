"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Database,
  LockKeyhole,
  Mail,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Users,
  Wifi,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api/client-fetch";
import { normalizeRole } from "@/lib/auth/role";
import { PLATFORM_ADMIN } from "@/lib/platform/admin";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/utils";

type RiskLevel = "ok" | "watch" | "critical";
type SignalTone = "critical" | "warning" | "info";
type PlatformPlanId = "free" | "starter" | "pro" | "growth";
type PlatformView = "overview" | "onboarding" | "tenants" | "guardrails" | "audit";

type PlatformAuditEvent = {
  id: string;
  action: string;
  actionLabel: string;
  tenantId: string | null;
  tenantName: string | null;
  actorEmail: string | null;
  reason: string | null;
  status: string;
  tone: SignalTone;
  createdAtIso: string | null;
};


type PlatformTenant = {
  id: string;
  name: string;
  status: string;
  plan: string;
  ownerEmail: string | null;
  createdAtIso: string | null;
  updatedAtIso: string | null;
  counters: {
    users: number;
    agents: number;
    sites: number;
    clients: number;
    vacationsMonth: number;
    openIncidents: number;
  };
  riskLevel: RiskLevel;
  riskReasons: string[];
  onboarding: {
    status: string;
    completion: number;
    activationRequested: boolean;
    readyToActivate: boolean;
  };
};

type PlatformOverviewResponse = {
  ok: true;
  generatedAtIso: string;
  requester: {
    uid: string;
    email: string | null;
    role: string;
  };
  health: {
    firestore: string;
    auth: string;
    storage: string;
    email: string;
    environment: string;
  };
  summary: {
    tenants: number;
    activeTenants: number;
    watchTenants: number;
    criticalTenants: number;
    users: number;
    agents: number;
    sites: number;
    clients: number;
    vacationsMonth: number;
    openIncidents: number;
    activationRequests: number;
    onboardingTenants: number;
  };
  tenants: PlatformTenant[];
  signals: Array<{
    id: string;
    tone: SignalTone;
    title: string;
    detail: string;
    href: string;
  }>;
  auditLog: PlatformAuditEvent[];
};

function formatDate(value: string | null) {
  if (!value) return "Non renseigné";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Non renseigné";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function riskClass(level: RiskLevel) {
  if (level === "critical") {
    return "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-100";
  }
  if (level === "watch") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-100";
  }
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-100";
}

function signalClass(tone: SignalTone) {
  if (tone === "critical") {
    return "border-red-500/25 bg-red-500/10 text-red-900 dark:text-red-100";
  }
  if (tone === "warning") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-100";
  }
  return "border-sky-500/25 bg-sky-500/10 text-sky-900 dark:text-sky-100";
}

const PLATFORM_PLAN_OPTIONS: Array<{
  id: PlatformPlanId;
  name: string;
  detail: string;
}> = [
  { id: "free", name: "Free", detail: "Découverte ou démo" },
  { id: "starter", name: "Starter", detail: "Petite agence locale" },
  { id: "pro", name: "Pro", detail: "Agence opérationnelle standard" },
  { id: "growth", name: "Growth", detail: "Croissance et multi-sites" },
];

const PLATFORM_VIEW_IDS = [
  "overview",
  "onboarding",
  "tenants",
  "guardrails",
  "audit",
] as const satisfies readonly PlatformView[];

const PLATFORM_VIEW_META: Record<
  PlatformView,
  { label: string; eyebrow: string; title: string; detail: string }
> = {
  overview: {
    label: "Vue SaaS",
    eyebrow: "Pilotage global",
    title: "Tour de contrôle plateforme",
    detail:
      "Une synthèse courte pour savoir si le SaaS, les agences et les services critiques sont sous contrôle.",
  },
  onboarding: {
    label: "Onboarding",
    eyebrow: "Mise en service",
    title: "Agences à activer",
    detail:
      "Les demandes d'activation et les pré-requis à contrôler avant d'ouvrir une agence cliente.",
  },
  tenants: {
    label: "Agences",
    eyebrow: "Parc clients",
    title: "Annuaire des agences clientes",
    detail:
      "Recherche, supervision et ouverture rapide des fiches agence sans mélanger l'exploitation terrain.",
  },
  guardrails: {
    label: "Garde-fous",
    eyebrow: "Santé et risques",
    title: "Signaux de surveillance",
    detail:
      "État technique, quotas, risques et alertes qui demandent une action VSW Digital.",
  },
  audit: {
    label: "Audit",
    eyebrow: "Traçabilité",
    title: "Journal des actions sensibles",
    detail:
      "Mémoire des décisions plateforme : qui a fait quoi, quand, pourquoi et avec quel résultat.",
  },
};

function normalizePlatformView(hash: string | null | undefined): PlatformView {
  const value = (hash ?? "").replace(/^#/, "").trim().toLowerCase();
  if (value === "onboarding-requests") return "onboarding";
  if (value === "platform-audit") return "audit";
  if (PLATFORM_VIEW_IDS.includes(value as PlatformView)) {
    return value as PlatformView;
  }
  return "overview";
}

function riskLabel(level: RiskLevel) {
  if (level === "critical") return "Critique";
  if (level === "watch") return "À surveiller";
  return "OK";
}

export default function PlatformPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<PlatformOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createTenantName, setCreateTenantName] = useState("");
  const [createOwnerEmail, setCreateOwnerEmail] = useState("");
  const [createPlanId, setCreatePlanId] = useState<PlatformPlanId>("starter");
  const [createReason, setCreateReason] = useState("");
  const [createConfirmation, setCreateConfirmation] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<PlatformView>("overview");
  const deferredQuery = useDeferredValue(query);

  const role = normalizeRole(user?.role);
  const isSuperAdmin = role === "super_admin" && user?.tenantId === "platform";

  async function load(isRefresh = false) {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const response = await apiFetch<PlatformOverviewResponse>(
        "/api/platform/overview"
      );
      setData(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger le backoffice SaaS."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function submitCreateTenant() {
    setCreateSubmitting(true);
    setCreateError(null);
    setCreateSuccess(null);
    setCreatedTenantId(null);

    try {
      const response = await apiFetch<{
        ok: true;
        tenant: { id: string; name: string };
      }>("/api/platform/tenants", {
        method: "POST",
        body: {
          name: createTenantName,
          ownerEmail: createOwnerEmail,
          planId: createPlanId,
          reason: createReason,
          confirmation: createConfirmation,
        },
      });

      setCreateSuccess("Agence " + response.tenant.name + " pré-provisionnée.");
      setCreatedTenantId(response.tenant.id);
      setCreateTenantName("");
      setCreateOwnerEmail("");
      setCreateReason("");
      setCreateConfirmation("");
      await load(true);
    } catch (err) {
      setCreateError(
        err instanceof Error
          ? err.message
          : "Impossible de créer l'agence SaaS."
      );
    } finally {
      setCreateSubmitting(false);
    }
  }

  useEffect(() => {
    const syncView = () => {
      setActiveView(normalizePlatformView(window.location.hash));
    };
    const handleViewChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      setActiveView(normalizePlatformView(detail ? "#" + detail : window.location.hash));
    };

    syncView();
    window.addEventListener("hashchange", syncView);
    window.addEventListener("popstate", syncView);
    window.addEventListener("platform:view-change", handleViewChange);
    return () => {
      window.removeEventListener("hashchange", syncView);
      window.removeEventListener("popstate", syncView);
      window.removeEventListener("platform:view-change", handleViewChange);
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isSuperAdmin]);

  const onboardingRequests = useMemo(() => {
    return (data?.tenants ?? []).filter((tenant) => {
      return tenant.onboarding.activationRequested;
    });
  }, [data?.tenants]);

  const filteredTenants = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return data?.tenants ?? [];

    return (data?.tenants ?? []).filter((tenant) => {
      return [
        tenant.name,
        tenant.id,
        tenant.ownerEmail ?? "",
        tenant.plan,
        tenant.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data?.tenants, deferredQuery]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-6 p-6">
        <Skeleton className="h-48 rounded-[2rem]" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-[2rem]" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-[2rem]" />
      </div>
    );
  }

  if (!user) {
    return (
      <AccessState
        title="Connexion requise"
        detail={`Connectez-vous avec un compte super_admin ${PLATFORM_ADMIN.name} pour accéder au backoffice SaaS.`}
        actionHref="/login?next=/platform"
        actionLabel="Se connecter"
      />
    );
  }

  if (!isSuperAdmin) {
    return (
      <AccessState
        title="Backoffice SaaS réservé"
        detail={`Cette interface est réservée au rôle super_admin plateforme ${PLATFORM_ADMIN.name}. Les admins agence restent dans l'espace dashboard.`}
        actionHref="/dashboard"
        actionLabel="Retour espace agence"
      />
    );
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_32%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted))/0.35)]">
      <header className="sticky top-0 z-30 border-b bg-background/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg dark:bg-white dark:text-slate-950">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
                {PLATFORM_ADMIN.name}
              </p>
              <h1 className="text-2xl font-black tracking-tight">
                Administration SaaS Sentrys
              </h1>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {PLATFORM_ADMIN.ownerLabel} - {PLATFORM_ADMIN.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
            >
              Synchro {formatTime(data?.generatedAtIso)}
            </Badge>
            <Button
              asChild
              variant="outline"
              className="rounded-2xl font-black"
            >
              <a href={`mailto:${PLATFORM_ADMIN.email}`}>
                <Mail className="mr-2 h-4 w-4" />
                Contact VSW
              </a>
            </Button>
            <Button
              type="button"
              variant={createOpen ? "default" : "outline"}
              onClick={() => {
                setCreateOpen((current) => !current);
                setCreateError(null);
              }}
              className="rounded-2xl font-black"
            >
              <Building2 className="mr-2 h-4 w-4" />
              Nouvelle agence
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void load(true)}
              className="rounded-2xl font-black"
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")}
              />
              Rafraîchir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-6 px-6 py-6">
        {error ? (
          <div className="rounded-[2rem] border border-red-500/25 bg-red-500/10 p-5 text-red-900 dark:text-red-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-black">Backoffice indisponible</p>
                <p className="mt-1 text-sm font-semibold opacity-80">{error}</p>
              </div>
            </div>
          </div>
        ) : null}

        <CreateTenantPanel
          open={createOpen}
          name={createTenantName}
          ownerEmail={createOwnerEmail}
          planId={createPlanId}
          reason={createReason}
          confirmation={createConfirmation}
          submitting={createSubmitting}
          error={createError}
          success={createSuccess}
          createdTenantId={createdTenantId}
          onNameChange={setCreateTenantName}
          onOwnerEmailChange={setCreateOwnerEmail}
          onPlanChange={setCreatePlanId}
          onReasonChange={setCreateReason}
          onConfirmationChange={setCreateConfirmation}
          onSubmit={submitCreateTenant}
        />

        <PlatformViewTabs activeView={activeView} />

        {activeView === "onboarding" ? (
          <OnboardingRequestsCard tenants={onboardingRequests} />
        ) : null}

        {activeView === "overview" ? (
          <section id="overview" className="rounded-[2rem] border border-primary/20 bg-primary/5 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Badge className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary hover:bg-primary/10">
                Gouvernance plateforme
              </Badge>
              <h2 className="mt-3 text-2xl font-black tracking-tight">
                {PLATFORM_ADMIN.name} pilote le SaaS Sentrys
              </h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-muted-foreground">
                Cette interface sert à superviser les agences clientes, contrôler la santé
                technique, suivre les risques et préparer les actions support avec traçabilité.
              </p>
            </div>
            <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Contact administrateur
              </p>
              <a
                href={`mailto:${PLATFORM_ADMIN.email}`}
                className="mt-2 inline-flex items-center gap-2 text-sm font-black text-primary"
              >
                <Mail className="h-4 w-4" />
                {PLATFORM_ADMIN.email}
              </a>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                Rôle : {PLATFORM_ADMIN.role}
              </p>
            </div>
          </div>
          </section>
        ) : null}

        {activeView === "overview" ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            icon={Building2}
            label="Agences clientes"
            value={data?.summary.tenants ?? 0}
            detail={`${data?.summary.activeTenants ?? 0} active(s)`}
          />
          <MetricCard
            icon={Users}
            label="Utilisateurs"
            value={data?.summary.users ?? 0}
            detail={`${data?.summary.agents ?? 0} agent(s), ${data?.summary.sites ?? 0} site(s)`}
          />
          <MetricCard
            icon={Activity}
            label="Vacations mois"
            value={data?.summary.vacationsMonth ?? 0}
            detail={`${data?.summary.clients ?? 0} client(s) géré(s)`}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Surveillance"
            value={(data?.summary.criticalTenants ?? 0) + (data?.summary.watchTenants ?? 0)}
            detail={`${data?.summary.openIncidents ?? 0} incident(s) ouvert(s)`}
            tone={
              (data?.summary.criticalTenants ?? 0) > 0 ? "critical" : "warning"
            }
          />
          </section>
        ) : null}

        {activeView === "guardrails" ? (
          <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="rounded-[2rem] border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-black">
                <Wifi className="h-5 w-5 text-primary" />
                Santé plateforme
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {[
                ["Firestore", data?.health.firestore ?? "unknown", Database],
                ["Auth", data?.health.auth ?? "unknown", LockKeyhole],
                ["Storage", data?.health.storage ?? "unknown", Database],
                ["Email", data?.health.email ?? "unknown", Wifi],
              ].map(([label, value, Icon]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border bg-muted/25 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                      {label as string}
                    </p>
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="mt-2 text-sm font-black">{String(value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card id="guardrails" className="rounded-[2rem] border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-black">
                <LockKeyhole className="h-5 w-5 text-primary" />
                Signaux et garde-fous
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {(data?.signals ?? []).map((signal) => (
                <Link
                  key={signal.id}
                  href={signal.href}
                  className={cn(
                    "rounded-2xl border p-4 transition hover:-translate-y-0.5",
                    signalClass(signal.tone)
                  )}
                >
                  <p className="font-black">{signal.title}</p>
                  <p className="mt-2 text-sm font-semibold leading-5 opacity-80">
                    {signal.detail}
                  </p>
                </Link>
              ))}
            </CardContent>
          </Card>
          </section>
        ) : null}

        {activeView === "audit" ? (
          <AuditLogCard events={data?.auditLog ?? []} />
        ) : null}

        {activeView === "tenants" ? (
          <Card id="tenants" className="overflow-hidden rounded-[2rem] border-border/60">
          <CardHeader className="border-b bg-muted/25">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <CardTitle className="text-xl font-black">
                  Agences clientes
                </CardTitle>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Vue multi-tenant pour support, contrôle commercial et santé du parc.
                </p>
              </div>

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher agence, email, plan..."
                className="h-11 w-full rounded-2xl border bg-background px-4 text-sm font-semibold outline-none transition focus:border-primary xl:w-[360px]"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agence</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Agents</TableHead>
                  <TableHead className="text-right">Sites</TableHead>
                  <TableHead className="text-right">Vacations</TableHead>
                  <TableHead>Risque</TableHead>
                  <TableHead>Dernière maj</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div className="min-w-[220px]">
                        <p className="font-black">{tenant.name}</p>
                        <p className="mt-1 text-xs font-semibold text-muted-foreground">
                          {tenant.ownerEmail ?? tenant.id}
                        </p>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">
                          Plan {tenant.plan}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full capitalize">
                        {tenant.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-black">
                      {tenant.counters.users}
                    </TableCell>
                    <TableCell className="text-right font-black">
                      {tenant.counters.agents}
                    </TableCell>
                    <TableCell className="text-right font-black">
                      {tenant.counters.sites}
                    </TableCell>
                    <TableCell className="text-right font-black">
                      {tenant.counters.vacationsMonth}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[180px]">
                        <Badge
                          className={cn(
                            "rounded-full border px-3 py-1 font-black",
                            riskClass(tenant.riskLevel)
                          )}
                        >
                          {riskLabel(tenant.riskLevel)}
                        </Badge>
                        {tenant.riskReasons.length > 0 ? (
                          <p className="mt-2 line-clamp-2 text-xs font-semibold text-muted-foreground">
                            {tenant.riskReasons.join(" | ")}
                          </p>
                        ) : (
                          <p className="mt-2 text-xs font-semibold text-muted-foreground">
                            Aucun signal bloquant.
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-muted-foreground">
                      {formatDate(tenant.updatedAtIso ?? tenant.createdAtIso)}
                    </TableCell>
                    <TableCell>
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="rounded-2xl font-black"
                      >
                        <Link href={`/platform/tenants/${encodeURIComponent(tenant.id)}`}>
                          Ouvrir
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {filteredTenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center">
                      <p className="font-black">Aucune agence trouvée</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Modifiez la recherche ou vérifiez les tenants.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}

function PlatformViewTabs({ activeView }: { activeView: PlatformView }) {
  const current = PLATFORM_VIEW_META[activeView];

  function activateView(viewId: PlatformView) {
    window.history.pushState(null, "", "/platform#" + viewId);
    window.dispatchEvent(new CustomEvent("platform:view-change", { detail: viewId }));
  }

  return (
    <section className="rounded-[2rem] border bg-card/92 p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary">
            {current.eyebrow}
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">
            {current.title}
          </h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-muted-foreground">
            {current.detail}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_VIEW_IDS.map((viewId) => (
            <Button
              key={viewId}
              asChild
              variant={activeView === viewId ? "default" : "outline"}
              className="rounded-full font-black"
            >
              <Link
                href={"/platform#" + viewId}
                onClick={(event) => {
                  event.preventDefault();
                  activateView(viewId);
                }}
              >
                {PLATFORM_VIEW_META[viewId].label}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}

function OnboardingRequestsCard({ tenants }: { tenants: PlatformTenant[] }) {
  return (
    <Card id="onboarding" className="overflow-hidden rounded-[2rem] border-border/60">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <Rocket className="h-5 w-5 text-primary" />
              Onboarding agences
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Validation des agences clientes avant mise en production. Cette zone appartient au backoffice SaaS VSW Digital.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {tenants.length} demande(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {tenants.length > 0 ? (
          tenants.map((tenant) => (
            <Link
              key={tenant.id}
              href={`/platform/tenants/${encodeURIComponent(tenant.id)}`}
              className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-amber-900 transition hover:-translate-y-0.5 hover:shadow-sm dark:text-amber-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-black">{tenant.name}</p>
                  <p className="mt-1 truncate text-sm font-semibold opacity-80">
                    {tenant.ownerEmail ?? tenant.id}
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full bg-background/70">
                  {tenant.onboarding.completion}%
                </Badge>
              </div>
              <p className="mt-3 text-sm font-semibold leading-5 opacity-80">
                Demande reçue. Vérifiez la checklist, les premiers actifs et activez si tout est conforme.
              </p>
            </Link>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-5 md:col-span-2 xl:col-span-3">
            <p className="font-black">Aucune demande d'activation</p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Les demandes envoyées depuis les agences apparaîtront ici.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateTenantPanel({
  open,
  name,
  ownerEmail,
  planId,
  reason,
  confirmation,
  submitting,
  error,
  success,
  createdTenantId,
  onNameChange,
  onOwnerEmailChange,
  onPlanChange,
  onReasonChange,
  onConfirmationChange,
  onSubmit,
}: {
  open: boolean;
  name: string;
  ownerEmail: string;
  planId: PlatformPlanId;
  reason: string;
  confirmation: string;
  submitting: boolean;
  error: string | null;
  success: string | null;
  createdTenantId: string | null;
  onNameChange: (name: string) => void;
  onOwnerEmailChange: (email: string) => void;
  onPlanChange: (planId: PlatformPlanId) => void;
  onReasonChange: (reason: string) => void;
  onConfirmationChange: (confirmation: string) => void;
  onSubmit: () => Promise<void>;
}) {
  if (!open) return null;

  const expectedConfirmation = "CREER AGENCE";
  const canSubmit =
    name.trim().length >= 2 &&
    ownerEmail.includes("@") &&
    reason.trim().length >= 12 &&
    confirmation.trim().toUpperCase() === expectedConfirmation &&
    !submitting;

  return (
    <Card className="overflow-hidden rounded-[2rem] border-primary/20 bg-primary/5 shadow-sm">
      <CardHeader className="border-b bg-background/60">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <Building2 className="h-5 w-5 text-primary" />
              Nouvelle agence cliente
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Pré-provisionne le tenant, l'abonnement, les quotas et l'audit. Le compte propriétaire sera invité dans l'étape suivante.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            Confirmation : {expectedConfirmation}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_220px]">
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Nom agence
            </span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Exemple : Alpha Sécurité"
              className="h-11 w-full rounded-2xl border bg-background px-4 text-sm font-semibold outline-none transition focus:border-primary"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Email propriétaire
            </span>
            <input
              value={ownerEmail}
              onChange={(event) => onOwnerEmailChange(event.target.value)}
              placeholder="direction@agence.fr"
              className="h-11 w-full rounded-2xl border bg-background px-4 text-sm font-semibold outline-none transition focus:border-primary"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Plan initial
            </span>
            <select
              value={planId}
              onChange={(event) => onPlanChange(event.target.value as PlatformPlanId)}
              className="h-11 w-full rounded-2xl border bg-background px-4 text-sm font-black outline-none transition focus:border-primary"
            >
              {PLATFORM_PLAN_OPTIONS.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Motif commercial / support
            </span>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Exemple : nouveau client valide par VSW Digital, création initiale pour recette et parametrage."
              className="min-h-24 w-full rounded-2xl border bg-background px-4 py-3 text-sm font-semibold outline-none transition focus:border-primary"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              Double confirmation
            </span>
            <input
              value={confirmation}
              onChange={(event) => onConfirmationChange(event.target.value)}
              placeholder={expectedConfirmation}
              className="h-11 w-full rounded-2xl border bg-background px-4 text-sm font-black uppercase outline-none transition focus:border-primary"
            />
            <p className="text-xs font-semibold text-muted-foreground">
              Tapez {expectedConfirmation}.
            </p>
          </label>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          {PLATFORM_PLAN_OPTIONS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "rounded-2xl border bg-background/80 p-3",
                planId === plan.id && "border-primary bg-primary/10"
              )}
            >
              <p className="font-black">{plan.name}</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {plan.detail}
              </p>
            </div>
          ))}
        </div>

        {error ? (
          <p className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-800 dark:text-red-100">
            {error}
          </p>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-800 dark:text-emerald-100">
            <p>{success}</p>
            {createdTenantId ? (
              <Button asChild variant="outline" size="sm" className="mt-2 rounded-2xl font-black">
                <Link href={`/platform/tenants/${encodeURIComponent(createdTenantId)}`}>
                  Ouvrir la fiche
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            className="rounded-2xl font-black"
            disabled={!canSubmit}
            onClick={() => void onSubmit()}
          >
            {submitting ? "Création..." : "Créer l'agence"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditLogCard({ events }: { events: PlatformAuditEvent[] }) {
  return (
    <Card id="audit" className="overflow-hidden rounded-[2rem] border-border/60">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-black">
              <Clock className="h-5 w-5 text-primary" />
              Registre audit plateforme
            </CardTitle>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Mémoire des actions sensibles VSW Digital avant activation des pouvoirs support.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]">
            {events.length} événement(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        {events.length > 0 ? (
          events.map((event) => (
            <div key={event.id} className={cn("rounded-2xl border p-4", signalClass(event.tone))}>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
                {formatDate(event.createdAtIso)}
              </p>
              <p className="mt-2 font-black">{event.actionLabel}</p>
              <p className="mt-1 text-sm font-semibold leading-5 opacity-80">
                {event.tenantName ?? event.tenantId ?? "Plateforme"}
              </p>
              <p className="mt-2 line-clamp-2 text-xs font-semibold opacity-75">
                {event.reason ?? "Motif non renseigné"}
              </p>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] opacity-60">
                {event.actorEmail ?? "system"}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-5 md:col-span-2 xl:col-span-4">
            <p className="font-black">Aucun événement plateforme journalisé</p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Le registre est prêt. Les prochaines actions support exigeant un motif y seront inscrites.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "warning" | "critical";
}) {
  return (
    <Card
      className={cn(
        "rounded-[2rem] border-border/60",
        tone === "warning" && "border-amber-500/25 bg-amber-500/10",
        tone === "critical" && "border-red-500/25 bg-red-500/10"
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-4xl font-black tracking-tight">{value}</p>
          </div>
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          {detail}
        </p>
      </CardContent>
    </Card>
  );
}

function AccessState({
  title,
  detail,
  actionHref,
  actionLabel,
}: {
  title: string;
  detail: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/25 p-6">
      <Card className="max-w-xl rounded-[2rem] border-border/60">
        <CardContent className="p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-black tracking-tight">{title}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
            {detail}
          </p>
          <Button asChild className="mt-6 h-11 rounded-2xl font-black">
            <Link href={actionHref}>
              {actionLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
