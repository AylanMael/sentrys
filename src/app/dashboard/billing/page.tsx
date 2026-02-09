// src/app/dashboard/billing/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CreditCard,
  Crown,
  Loader2,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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
    addons?: {
      extraAgents?: number;
      extraSites?: number;
      extraTenants?: number;
      multiTenant?: boolean;
      [k: string]: any;
    };
    periodStart?: any;
    periodEnd?: any;
  };

  limits?: { agents?: number; sites?: number; tenants?: number };
  usage?: { agents?: number; sites?: number; tenants?: number; activeTenants?: number; updatedAt?: any };
  progress?: { agentsPct?: number; sitesPct?: number; tenantsPct?: number };

  // backend actuel: objet booléen
  atLimit?: { agents?: boolean; sites?: boolean; tenants?: boolean };

  error?: string;
};

function centsToEuro(cents?: number | null) {
  if (cents == null || !Number.isFinite(cents)) return null;
  return (cents / 100).toFixed(2).replace(".", ",");
}

function clampPct(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

type LimitKey = "agents" | "sites" | "tenants";

function toAtLimitList(billing: BillingUsageResponse | null): LimitKey[] {
  const a = billing?.atLimit ?? {};
  const out: LimitKey[] = [];
  if (a.agents) out.push("agents");
  if (a.sites) out.push("sites");
  if (a.tenants) out.push("tenants");
  return out;
}

function labelKind(k: LimitKey) {
  if (k === "agents") return "Agents";
  if (k === "sites") return "Sites";
  return "Sociétés (tenants)";
}

function statusBadge(status?: string) {
  const s = String(status ?? "").toLowerCase();
  const isActive = s === "active" || s === "trialing";
  const isPastDue = s === "past_due";
  const isCanceled = s === "canceled" || s === "cancelled";

  if (isActive) return <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Actif</Badge>;
  if (isPastDue) return <Badge variant="secondary" className="gap-1"><ShieldAlert className="h-3.5 w-3.5" />Paiement en retard</Badge>;
  if (isCanceled) return <Badge variant="destructive" className="gap-1"><ShieldAlert className="h-3.5 w-3.5" />Annulé</Badge>;

  return <Badge variant="outline">{s || "—"}</Badge>;
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setErr(null);

      try {
        const res = await apiFetch<BillingUsageResponse>("/api/billing/usage");
        if (!mounted) return;

        if (!res?.ok) {
          setBilling(null);
          setErr(res?.error ?? "Impossible de charger les informations d’abonnement.");
          return;
        }

        setBilling(res);
      } catch (e: any) {
        if (!mounted) return;
        setBilling(null);
        setErr(e?.message ?? "Erreur inconnue lors du chargement.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const usedTenants = billing?.usage?.activeTenants ?? billing?.usage?.tenants ?? 0;

  const limits = billing?.limits ?? {};
  const usage = billing?.usage ?? {};
  const progress = billing?.progress ?? {};

  const atLimitList = useMemo(() => toAtLimitList(billing), [billing]);

  const planName = billing?.plan?.name ?? billing?.subscription?.planId ?? "—";
  const planPrice = centsToEuro(billing?.plan?.priceMonthlyCents ?? null);
  const subStatus = billing?.subscription?.status ?? "—";

  const multiTenantEnabled = Boolean(billing?.subscription?.addons?.multiTenant);
  const extraAgents = Number(billing?.subscription?.addons?.extraAgents ?? 0);
  const extraSites = Number(billing?.subscription?.addons?.extraSites ?? 0);
  const extraTenants = Number(billing?.subscription?.addons?.extraTenants ?? 0);

  const showTenantsHint = !multiTenantEnabled && (limits?.tenants ?? 1) <= 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour
              </Link>
            </Button>
          </div>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Abonnement & Quotas</h1>
          <p className="text-sm text-muted-foreground">
            Plan, options, limites et usage (agents / sites / sociétés).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* CTA placeholders — tu brancheras Stripe plus tard */}
          <Button variant="outline" className="gap-2" disabled>
            <CreditCard className="h-4 w-4" />
            Gérer le paiement
          </Button>
          <Button className="gap-2" disabled>
            <Crown className="h-4 w-4" />
            Upgrade
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement des informations d’abonnement…
          </div>
        </div>
      ) : err ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="space-y-1">
              <div className="text-sm font-medium text-destructive">Erreur</div>
              <div className="text-sm text-muted-foreground">{err}</div>
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={() => location.reload()}>
                  Recharger
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : billing?.ok ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* ====== PLAN ====== */}
          <Card className="rounded-3xl lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Plan
              </CardTitle>
              <CardDescription>Infos principales de l’abonnement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-muted-foreground">Plan actuel</div>
                  <div className="text-lg font-semibold">{planName}</div>
                </div>
                {statusBadge(subStatus)}
              </div>

              <Separator />

              <div className="flex items-center justify-between text-sm">
                <div className="text-muted-foreground">Prix mensuel</div>
                <div className="font-medium">{planPrice ? `${planPrice} €` : "—"}</div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="text-muted-foreground">Tenant</div>
                <div className="font-medium">{billing.tenantId ?? "—"}</div>
              </div>

              {atLimitList.length > 0 ? (
                <div className="mt-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
                  <div className="font-medium text-destructive">Quota atteint</div>
                  <div className="text-muted-foreground">
                    {atLimitList.map(labelKind).join(", ")}
                  </div>
                </div>
              ) : (
                <div className="mt-2 rounded-2xl border bg-muted/20 p-3 text-sm">
                  <div className="font-medium">Tout est OK</div>
                  <div className="text-muted-foreground">Aucun quota n’est atteint.</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ====== QUOTAS ====== */}
          <Card className="rounded-3xl lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Quotas & usage
              </CardTitle>
              <CardDescription>Suivi en temps réel par ressource.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Agents */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Agents</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{usage.agents ?? 0}</span>{" "}
                    / {limits.agents ?? "—"}
                  </div>
                </div>
                <Progress value={clampPct(progress.agentsPct)} />
                <div className="text-xs text-muted-foreground">
                  Add-on : +{extraAgents} agent(s)
                </div>
              </div>

              {/* Sites */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">Sites</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{usage.sites ?? 0}</span>{" "}
                    / {limits.sites ?? "—"}
                  </div>
                </div>
                <Progress value={clampPct(progress.sitesPct)} />
                <div className="text-xs text-muted-foreground">
                  Add-on : +{extraSites} site(s)
                </div>
              </div>

              {/* Tenants */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Building2 className="h-4 w-4" />
                    Sociétés (tenants)
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{usedTenants}</span>{" "}
                    / {limits.tenants ?? "—"}
                  </div>
                </div>
                <Progress value={clampPct(progress.tenantsPct)} />
                <div className="text-xs text-muted-foreground">
                  Add-on : +{extraTenants} tenant(s)
                </div>

                {showTenantsHint ? (
                  <div className="rounded-2xl border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">Option multi-tenant</div>
                    <div className="text-muted-foreground">
                      Sur ce plan, vous êtes limité à <span className="font-medium">1 société</span>.
                      Activez l’option multi-tenant (vendable) ou upgradez votre plan.
                    </div>
                  </div>
                ) : null}
              </div>

              <Separator />

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  Dernière mise à jour :{" "}
                  <span className="font-medium">
                    {billing.usage?.updatedAt ? "ok" : "—"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled>
                    Acheter des add-ons
                  </Button>
                  <Button size="sm" disabled>
                    Upgrade plan
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ====== OPTIONS ====== */}
          <Card className="rounded-3xl lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5" />
                Options & fonctionnalités
              </CardTitle>
              <CardDescription>Ce qui est inclus et ce qui est vendable.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {multiTenantEnabled ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Multi-tenant activé
                  </Badge>
                ) : (
                  <Badge variant="outline">Multi-tenant désactivé</Badge>
                )}

                {/* exemples de features */}
                {billing.plan?.features?.reporting ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Reporting
                  </Badge>
                ) : (
                  <Badge variant="outline">Reporting</Badge>
                )}

                {billing.plan?.features?.incidents ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Incidents
                  </Badge>
                ) : (
                  <Badge variant="outline">Incidents</Badge>
                )}

                {billing.plan?.features?.vacations ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Vacations
                  </Badge>
                ) : (
                  <Badge variant="outline">Vacations</Badge>
                )}
              </div>

              <div className="rounded-2xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">Roadmap Billing (prochaine étape)</div>
                <ul className="mt-2 list-disc pl-5 space-y-1">
                  <li>Brancher Stripe (checkout + portail client)</li>
                  <li>Écran upgrade + achat d’add-ons (+agents/+sites/+tenants)</li>
                  <li>Activation option Multi-tenant (vendable)</li>
                  <li>Logs & events (audit des changements d’abonnement)</li>
                </ul>
              </div>

              <div className="flex items-center gap-2">
                <Button asChild variant="outline">
                  <Link href="/dashboard">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Retour dashboard
                  </Link>
                </Button>

                {/* placeholders */}
                <Button disabled className="gap-2">
                  <Crown className="h-4 w-4" />
                  Passer Pro
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="rounded-3xl border bg-card p-6 text-sm text-muted-foreground">
          Aucune donnée disponible.
        </div>
      )}
    </div>
  );
}
