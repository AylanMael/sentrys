"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  LockKeyhole,
  RefreshCw,
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
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/utils";

type RiskLevel = "ok" | "watch" | "critical";
type SignalTone = "critical" | "warning" | "info";

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
  };
  tenants: PlatformTenant[];
  signals: Array<{
    id: string;
    tone: SignalTone;
    title: string;
    detail: string;
    href: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "Non renseigne";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Non renseigne";

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

function riskLabel(level: RiskLevel) {
  if (level === "critical") return "Critique";
  if (level === "watch") return "A surveiller";
  return "OK";
}

export default function PlatformPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<PlatformOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const role = normalizeRole(user?.role);
  const isSuperAdmin = role === "super_admin";

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

  useEffect(() => {
    if (authLoading) return;
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isSuperAdmin]);

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
        detail="Connectez-vous avec un compte super_admin pour acceder au backoffice SaaS."
        actionHref="/login?next=/platform"
        actionLabel="Se connecter"
      />
    );
  }

  if (!isSuperAdmin) {
    return (
      <AccessState
        title="Backoffice SaaS reserve"
        detail="Cette interface est reservee au role super_admin plateforme. Les admins agence restent dans l'espace dashboard."
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
                Sentrys platform
              </p>
              <h1 className="text-2xl font-black tracking-tight">
                Backoffice super admin SaaS
              </h1>
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
              type="button"
              variant="outline"
              onClick={() => void load(true)}
              className="rounded-2xl font-black"
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")}
              />
              Rafraichir
            </Button>
            <Button asChild className="rounded-2xl font-black">
              <Link href="/dashboard">
                Espace agence
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            detail={`${data?.summary.clients ?? 0} client(s) geres`}
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

        <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <Card className="rounded-[2rem] border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-black">
                <Wifi className="h-5 w-5 text-primary" />
                Sante plateforme
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

        <Card id="tenants" className="overflow-hidden rounded-[2rem] border-border/60">
          <CardHeader className="border-b bg-muted/25">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <CardTitle className="text-xl font-black">
                  Agences clientes
                </CardTitle>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Vue multi-tenant pour support, controle commercial et sante du parc.
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
                  <TableHead>Etat</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Agents</TableHead>
                  <TableHead className="text-right">Sites</TableHead>
                  <TableHead className="text-right">Vacations</TableHead>
                  <TableHead>Risque</TableHead>
                  <TableHead>Derniere maj</TableHead>
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
                  </TableRow>
                ))}

                {filteredTenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center">
                      <p className="font-black">Aucune agence trouvee</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Modifiez la recherche ou verifiez les tenants.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
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
