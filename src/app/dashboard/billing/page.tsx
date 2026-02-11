// src/app/dashboard/billing/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CreditCard,
  Crown,
  Loader2,
  ShieldAlert,
  Sparkles,
  Users,
  MapPin,
  Building2,
  RefreshCw,
} from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    };
    periodStart?: any;
    periodEnd?: any;
  };

  limits?: { agents?: number; sites?: number; tenants?: number };

  usage?: {
    agents?: number;
    sites?: number;
    // backend normalize: tenants
    tenants?: number;
    // legacy: activeTenants
    activeTenants?: number;
    updatedAt?: any;
  };

  progress?: { agentsPct?: number; sitesPct?: number; tenantsPct?: number };

  atLimit?: { agents?: boolean; sites?: boolean; tenants?: boolean };

  error?: string;
};

function moneyEUR(cents?: number | null) {
  if (!cents || cents <= 0) return "0€";
  const euros = cents / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: euros % 1 === 0 ? 0 : 2,
  }).format(euros);
}

function safePct(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function atLimitList(atLimit?: BillingUsageResponse["atLimit"]) {
  if (!atLimit) return [];
  const out: string[] = [];
  if (atLimit.agents) out.push("agents");
  if (atLimit.sites) out.push("sites");
  if (atLimit.tenants) out.push("tenants");
  return out;
}

function featureLabel(key: string) {
  // tu peux enrichir au fur et à mesure
  const map: Record<string, string> = {
    vacations: "Planning & vacations",
    incidents: "Gestion des incidents",
    reporting: "Reporting & exports",
    multiTenant: "Multi-sociétés (multi-tenant)",
  };
  return map[key] ?? key;
}

const CATALOG_PLANS = [
  {
    id: "free",
    name: "Free",
    priceMonthlyCents: 0,
    blurb: "Pour démarrer et valider le flux.",
    highlight: false,
    bullets: ["Vacations", "Incidents", "Quotas de base"],
  },
  {
    id: "starter",
    name: "Starter",
    priceMonthlyCents: 1900,
    blurb: "Pour une petite équipe opérationnelle.",
    highlight: false,
    bullets: ["Plus d’agents & sites", "Reporting", "Support standard"],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthlyCents: 4900,
    blurb: "Le plan recommandé pour la majorité des sociétés.",
    highlight: true,
    bullets: ["Reporting avancé", "Plus de quotas", "Priorité support"],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthlyCents: 9900,
    blurb: "Pour scaler avec multi-tenant & volume.",
    highlight: false,
    bullets: ["Multi-tenant", "Gros volumes", "Accompagnement"],
  },
];

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch<BillingUsageResponse>("/api/billing/usage");
      if (!res?.ok) {
        setBilling(null);
        setErr(res?.error ?? "Impossible de charger les informations d’abonnement.");
        return;
      }
      setBilling(res);
    } catch (e: any) {
      setBilling(null);
      setErr(e?.message ?? "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usedAgents = billing?.usage?.agents ?? 0;
  const usedSites = billing?.usage?.sites ?? 0;
  const usedTenants = billing?.usage?.activeTenants ?? billing?.usage?.tenants ?? 0;

  const limitAgents = billing?.limits?.agents ?? 0;
  const limitSites = billing?.limits?.sites ?? 0;
  const limitTenants = billing?.limits?.tenants ?? 0;

  const pctAgents = safePct(billing?.progress?.agentsPct);
  const pctSites = safePct(billing?.progress?.sitesPct);
  const pctTenants = safePct(billing?.progress?.tenantsPct);

  const planName = billing?.plan?.name ?? billing?.subscription?.planId ?? "—";
  const planId = billing?.plan?.id ?? billing?.subscription?.planId ?? "free";
  const price = billing?.plan?.priceMonthlyCents ?? null;

  const limitsReached = useMemo(() => atLimitList(billing?.atLimit), [billing?.atLimit]);
  const hasLimitsReached = limitsReached.length > 0;

  const features = useMemo(() => {
    const f = billing?.plan?.features ?? {};
    return Object.entries(f)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => k);
  }, [billing?.plan?.features]);

  const multiTenantEnabled = Boolean(billing?.subscription?.addons?.multiTenant);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="inline-flex size-9 items-center justify-center rounded-2xl border bg-card">
              <CreditCard className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Abonnement</h1>
            <Badge variant={planId === "free" ? "outline" : "default"} className="ml-1">
              {planName}
            </Badge>
            {hasLimitsReached ? (
              <Badge variant="destructive" className="ml-1">
                Quota atteint
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Vue en temps réel : plan, quotas, usage, et options (multi-tenant, add-ons).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualiser
          </Button>

          <Button asChild className="gap-2">
            <Link href="#plans">
              Voir les plans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Error */}
      {err ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              Impossible de charger l’abonnement
            </CardTitle>
            <CardDescription className="text-destructive">{err}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Astuce : vérifie que tu es bien connecté et que <code>/api/billing/usage</code> répond côté serveur.
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Top grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Plan card */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BadgeCheck className="h-4 w-4" />
              Plan actif
            </CardTitle>
            <CardDescription>
              Statut :{" "}
              <span className="font-medium text-foreground">
                {billing?.subscription?.status ?? (loading ? "…" : "—")}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && !billing ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-[65%]" />
                <Skeleton className="h-4 w-[45%]" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Plan</div>
                    <div className="text-lg font-semibold">{planName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">Mensuel</div>
                    <div className="text-lg font-semibold">{moneyEUR(price)}</div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="text-sm font-medium">Options</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={multiTenantEnabled ? "default" : "outline"} className="gap-2">
                      <Building2 className="h-3.5 w-3.5" />
                      Multi-tenant {multiTenantEnabled ? "activé" : "non activé"}
                    </Badge>

                    {Number(billing?.subscription?.addons?.extraAgents ?? 0) > 0 ? (
                      <Badge variant="outline">+{billing?.subscription?.addons?.extraAgents} agents</Badge>
                    ) : null}

                    {Number(billing?.subscription?.addons?.extraSites ?? 0) > 0 ? (
                      <Badge variant="outline">+{billing?.subscription?.addons?.extraSites} sites</Badge>
                    ) : null}

                    {Number(billing?.subscription?.addons?.extraTenants ?? 0) > 0 ? (
                      <Badge variant="outline">+{billing?.subscription?.addons?.extraTenants} tenants</Badge>
                    ) : null}
                  </div>
                </div>

                {features.length ? (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Fonctionnalités incluses</div>
                    <div className="space-y-1">
                      {features.slice(0, 6).map((k) => (
                        <div key={k} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4" />
                          <span>{featureLabel(k)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Fonctionnalités : (chargement / non défini)
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Quotas card */}
        <Card className="rounded-3xl lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Quotas & usage
            </CardTitle>
            <CardDescription>
              Lecture simple et exploitable (avec taux d’utilisation).
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Agents */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Agents
                </div>
                <div className="text-sm">
                  <span className="font-semibold">{usedAgents}</span>{" "}
                  <span className="text-muted-foreground">/ {limitAgents}</span>
                </div>
              </div>
              <Progress value={pctAgents} />
              <div className="text-xs text-muted-foreground">{pctAgents}% utilisé</div>
            </div>

            {/* Sites */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4" />
                  Sites
                </div>
                <div className="text-sm">
                  <span className="font-semibold">{usedSites}</span>{" "}
                  <span className="text-muted-foreground">/ {limitSites}</span>
                </div>
              </div>
              <Progress value={pctSites} />
              <div className="text-xs text-muted-foreground">{pctSites}% utilisé</div>
            </div>

            {/* Tenants */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="h-4 w-4" />
                  Tenants (multi-sociétés)
                </div>
                <div className="text-sm">
                  <span className="font-semibold">{usedTenants}</span>{" "}
                  <span className="text-muted-foreground">/ {limitTenants}</span>
                </div>
              </div>
              <Progress value={pctTenants} />
              <div className="text-xs text-muted-foreground">{pctTenants}% utilisé</div>
            </div>

            {hasLimitsReached ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-destructive">
                      Quota atteint : {limitsReached.join(", ")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Pour débloquer : passer sur un plan supérieur ou ajouter des options.
                    </div>
                    <div className="pt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href="#plans">
                          Voir les plans <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/dashboard">
                          Retour dashboard
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Plans */}
      <Card id="plans" className="rounded-3xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4" />
            Plans (upgrade)
          </CardTitle>
          <CardDescription>
            UX prête : dès que Stripe est branché, on connecte les boutons.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid gap-4 lg:grid-cols-4">
            {CATALOG_PLANS.map((p) => {
              const isCurrent = String(planId).toLowerCase() === p.id;
              return (
                <div
                  key={p.id}
                  className={[
                    "rounded-3xl border bg-card p-5",
                    p.highlight ? "ring-1 ring-primary" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-muted-foreground">{p.name}</div>
                      <div className="text-2xl font-semibold">{moneyEUR(p.priceMonthlyCents)}</div>
                      <div className="text-xs text-muted-foreground">/ mois</div>
                    </div>
                    {isCurrent ? <Badge>Actuel</Badge> : p.highlight ? <Badge variant="secondary">Recommandé</Badge> : null}
                  </div>

                  <div className="mt-3 text-sm text-muted-foreground">{p.blurb}</div>

                  <div className="mt-4 space-y-2">
                    {p.bullets.map((b) => (
                      <div key={b} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-col gap-2">
                    {isCurrent ? (
                      <Button variant="outline" disabled>
                        Plan actuel
                      </Button>
                    ) : (
                      <Button
                        className="gap-2"
                        // ⚠️ prêt pour Stripe : brancher /api/billing/checkout
                        onClick={() => {
                          alert(
                            "Prochaine étape : brancher Stripe Checkout. Je te prépare l’API /api/billing/checkout + webhook."
                          );
                        }}
                      >
                        Choisir {p.name}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      onClick={() => {
                        alert(
                          "Prochaine étape : page d’info plan / comparatif détaillé."
                        );
                      }}
                    >
                      Détails
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator className="my-6" />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold">Besoin d’un plan sur-mesure ?</div>
              <div className="text-sm text-muted-foreground">
                Multi-sociétés, gros volumes, intégrations paie / reporting avancé, SLA…
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => alert("À brancher: lien mail/CRM/support.")}>
                Contacter le support
              </Button>
              <Button onClick={() => alert("À brancher: prise de RDV / Calendly / formulaire.")}>
                Demander une démo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer helper */}
      <div className="text-xs text-muted-foreground">
        Conseil : si tu veux un rendu encore plus “premium”, je te fais la version avec “cards animées”, comparatif en tableau,
        et un vrai flux Checkout Stripe + webhooks + mise à jour Firestore <code>subscriptions</code>.
      </div>
    </div>
  );
}
