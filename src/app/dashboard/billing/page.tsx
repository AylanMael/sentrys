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
  Zap,
  ShieldCheck,
  Headset,
  Download,
  FileClock,
  Lock,
  PackagePlus,
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
import { cn } from "@/lib/utils";

/* ================= types & helpers (Identiques) ================= */

type BillingUsageResponse = {
  ok: boolean;
  tenantId?: string;
  plan?: { id?: string; name?: string; priceMonthlyCents?: number | null; features?: Record<string, boolean>; };
  subscription?: { planId?: string; status?: string; addons?: { extraAgents?: number; extraSites?: number; extraTenants?: number; multiTenant?: boolean; }; periodStart?: any; periodEnd?: any; };
  limits?: { agents?: number; sites?: number; tenants?: number };
  usage?: { agents?: number; sites?: number; tenants?: number; activeTenants?: number; updatedAt?: any; };
  progress?: { agentsPct?: number; sitesPct?: number; tenantsPct?: number };
  atLimit?: { agents?: boolean; sites?: boolean; tenants?: boolean };
  error?: string;
};

function moneyEUR(cents?: number | null) {
  if (cents === null || cents === undefined) return "—";
  if (cents <= 0) return "0€";
  const euros = cents / 100;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(euros);
}

function safePct(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}

function atLimitList(atLimit?: BillingUsageResponse["atLimit"]) {
  if (!atLimit) return [];
  const out: string[] = [];
  if (atLimit.agents) out.push("Agents");
  if (atLimit.sites) out.push("Sites");
  if (atLimit.tenants) out.push("Tenants");
  return out;
}

const CATALOG_PLANS = [
  { id: "free", name: "Free", priceMonthlyCents: 0, blurb: "Idéal pour tester le flux opérationnel.", highlight: false, bullets: ["10 Vacations / mois", "Incidents illimités", "Support communauté"] },
  { id: "starter", name: "Starter", priceMonthlyCents: 1900, blurb: "Pour les petites équipes en croissance.", highlight: false, bullets: ["Reporting PDF", "Quotas étendus", "Support par email"] },
  { id: "pro", name: "Pro", priceMonthlyCents: 4900, blurb: "La puissance complète pour votre société.", highlight: true, bullets: ["Analytics avancés", "Export Excel / CSV", "Support prioritaire 24/7"] },
  { id: "growth", name: "Growth", priceMonthlyCents: 9900, blurb: "Scalabilité maximale et multi-tenant.", highlight: false, bullets: ["Multi-sociétés", "API Access", "Accompagnement dédié"] },
];

type CatalogPlanId = "free" | "starter" | "pro" | "growth";

const PLAN_RANK: Record<CatalogPlanId, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  growth: 3,
};

function normalizeCatalogPlanId(planId?: string | null): CatalogPlanId {
  const value = String(planId ?? "free").toLowerCase();
  return value === "starter" || value === "pro" || value === "growth"
    ? value
    : "free";
}

function planAllows(currentPlanId: CatalogPlanId, minPlanId: CatalogPlanId) {
  return PLAN_RANK[currentPlanId] >= PLAN_RANK[minPlanId];
}

const ADDON_OFFERS = [
  {
    id: "agents-pack",
    title: "+5 agents",
    price: "5 EUR / mois",
    detail: "Renfort ponctuel pour evenement, remplacement ou saison haute.",
  },
  {
    id: "sites-pack",
    title: "+2 sites",
    price: "3 EUR / mois",
    detail: "Ajouter quelques sites client sans changer immediatement de plan.",
  },
  {
    id: "support-pack",
    title: "Support prioritaire",
    price: "Sur devis",
    detail: "Accompagnement exploitation pour les agences en forte croissance.",
  },
];

const FEATURE_GATES: Array<{
  label: string;
  detail: string;
  minPlan: CatalogPlanId;
  href?: string;
}> = [
  {
    label: "Exports pre-paie CSV / Excel",
    detail: "Fichiers exploitables par le cabinet de paie.",
    minPlan: "pro",
    href: "/dashboard/prepaie",
  },
  {
    label: "Analytics avancees",
    detail: "Pilotage des volumes, tendances et alertes d'exploitation.",
    minPlan: "pro",
    href: "/dashboard",
  },
  {
    label: "Multi-societes / filiales",
    detail: "Separations operationnelles pour agences regionales.",
    minPlan: "growth",
    href: "/platform",
  },
  {
    label: "Support prioritaire",
    detail: "Canal accelere pour incidents bloquants en production.",
    minPlan: "pro",
  },
];

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const res = await apiFetch<BillingUsageResponse>("/api/billing/usage");
      if (!res?.ok) { setBilling(null); setErr(res?.error ?? "Erreur de chargement."); return; }
      setBilling(res);
    } catch (e: any) { setBilling(null); setErr(e?.message ?? "Erreur inconnue."); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const { usedAgents, usedSites, usedTenants, limitAgents, limitSites, limitTenants, pctAgents, pctSites, pctTenants } = useMemo(() => ({
    usedAgents: billing?.usage?.agents ?? 0,
    usedSites: billing?.usage?.sites ?? 0,
    usedTenants: billing?.usage?.activeTenants ?? billing?.usage?.tenants ?? 0,
    limitAgents: billing?.limits?.agents ?? 0,
    limitSites: billing?.limits?.sites ?? 0,
    limitTenants: billing?.limits?.tenants ?? 0,
    pctAgents: safePct(billing?.progress?.agentsPct),
    pctSites: safePct(billing?.progress?.sitesPct),
    pctTenants: safePct(billing?.progress?.tenantsPct),
  }), [billing]);

  const planId = billing?.plan?.id ?? billing?.subscription?.planId ?? "free";
  const normalizedPlanId = normalizeCatalogPlanId(planId);
  const limitsReached = useMemo(() => atLimitList(billing?.atLimit), [billing?.atLimit]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10 w-full max-w-[1400px] mx-auto">

      {/* ===================== HEADER ===================== */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-5">
          <div className="bg-primary shadow-xl shadow-primary/20 p-4 rounded-2xl">
            <CreditCard className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Badge variant="outline" className="bg-background text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-full border-muted-foreground/30">
                Gestion financière
              </Badge>
              {limitsReached.length > 0 && <Badge variant="destructive" className="animate-pulse">Quota atteint</Badge>}
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-foreground">Abonnement</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <Button variant="outline" onClick={load} disabled={loading} className="h-11 rounded-xl px-5 font-bold border-muted-foreground/20 hover:bg-muted transition-all">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Actualiser
          </Button>
          <Button asChild className="h-11 rounded-xl px-6 font-black shadow-lg shadow-primary/20 hover:translate-y-[-2px] active:scale-95 transition-all">
            <Link href="#plans">Upgrade <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </div>

      {/* ERROR DISPLAY */}
      {err && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 flex items-center gap-4 animate-in slide-in-from-top-4">
          <ShieldAlert className="h-6 w-6 text-destructive shrink-0" />
          <p className="text-sm font-bold text-destructive leading-tight">{err}</p>
        </div>
      )}

      {/* ===================== TOP GRID: PLAN & QUOTAS ===================== */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">

        {/* PLAN ACTIF CARD */}
        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden lg:col-span-1">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-background p-2 rounded-xl shadow-sm"><BadgeCheck className="h-5 w-5 text-primary" /></div>
              <h2 className="text-lg font-black tracking-tight text-foreground">Plan Actif</h2>
            </div>
            <Badge className="bg-primary/10 text-primary border-transparent font-bold capitalize">{billing?.subscription?.status || "—"}</Badge>
          </div>
          <CardContent className="p-6 md:p-8 space-y-6">
            {loading && !billing ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-8 w-2/3 rounded-xl" />
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Offre</p>
                    <p className="text-3xl font-black tracking-tighter text-foreground">{billing?.plan?.name || "Free"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Coût</p>
                    <p className="text-2xl font-bold text-primary">{moneyEUR(billing?.plan?.priceMonthlyCents)}<span className="text-xs text-muted-foreground ml-1">/mo</span></p>
                  </div>
                </div>

                <Separator className="opacity-50" />

                <div className="space-y-4">
                   <div className="flex items-center gap-3 text-sm font-bold">
                      <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                      <span>Inclus dans votre plan :</span>
                   </div>
                   <div className="grid grid-cols-1 gap-2">
                      {Object.entries(billing?.plan?.features || {}).filter(([, v]) => v).slice(0, 4).map(([k]) => (
                        <div key={k} className="flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/30 p-2 rounded-lg border border-border/50">
                          <Check className="h-3.5 w-3.5 text-primary" /> {k.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                      ))}
                   </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* USAGE & QUOTAS CARD */}
        <Card className="rounded-[2.5rem] border-none shadow-xl shadow-black/[0.03] bg-background ring-1 ring-black/5 overflow-hidden lg:col-span-2 h-full">
          <div className="p-6 md:p-8 bg-muted/20 border-b flex items-center gap-3">
             <div className="bg-background p-2 rounded-xl shadow-sm"><Sparkles className="h-5 w-5 text-primary" /></div>
             <h2 className="text-lg font-black tracking-tight text-foreground">Utilisation des ressources</h2>
          </div>
          <CardContent className="p-6 md:p-8 grid gap-8 md:grid-cols-2">

            <div className="space-y-6">
              {[
                { label: "Agents", used: usedAgents, limit: limitAgents, pct: pctAgents, icon: Users },
                { label: "Sites", used: usedSites, limit: limitSites, pct: pctSites, icon: MapPin },
                { label: "Tenants", used: usedTenants, limit: limitTenants, pct: pctTenants, icon: Building2 },
              ].map((q) => (
                <div key={q.label} className="space-y-3 p-4 rounded-2xl bg-muted/10 border border-border/40 hover:border-primary/20 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <q.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{q.label}</span>
                    </div>
                    <Badge variant="outline" className="font-mono text-[10px] bg-background">{q.pct}%</Badge>
                  </div>
                  <Progress value={q.pct} className="h-2 bg-muted ring-1 ring-black/5" />
                  <div className="flex justify-between items-baseline">
                    <p className="text-sm font-bold text-foreground">{q.used} <span className="text-muted-foreground font-medium text-xs">sur {q.limit}</span></p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col justify-center gap-4">
              {limitsReached.length > 0 ? (
                <div className="p-6 rounded-3xl bg-destructive/10 border border-destructive/20 relative overflow-hidden group">
                  <ShieldAlert className="h-12 w-12 text-destructive absolute -bottom-2 -right-2 opacity-10 group-hover:scale-110 transition-transform" />
                  <p className="text-sm font-black text-destructive uppercase tracking-widest mb-2">Attention</p>
                  <p className="text-sm font-bold text-destructive/80 leading-relaxed italic">
                    Limite atteinte sur : {limitsReached.join(", ")}. Vos collaborateurs ne pourront plus ajouter de nouvelles données.
                  </p>
                  <Button asChild size="sm" variant="destructive" className="mt-4 rounded-lg font-black uppercase text-[10px] tracking-widest h-8 px-4">
                    <Link href="#plans">Débloquer</Link>
                  </Button>
                </div>
              ) : (
                <div className="p-6 rounded-3xl bg-green-500/5 border border-green-500/10 text-center">
                   <ShieldCheck className="h-10 w-10 text-green-500 mx-auto mb-3 opacity-60" />
                   <p className="text-sm font-bold text-green-700">Tous vos systèmes sont opérationnels</p>
                   <p className="text-xs text-green-600/70 mt-1 font-medium">Vous disposez de suffisamment de marge sur vos quotas.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ===================== CATALOG PLANS ===================== */}
      <div id="plans" className="pt-8 space-y-6">
        <div className="text-center space-y-2">
          <Badge variant="outline" className="rounded-full px-4 border-primary/30 text-primary font-black uppercase text-[10px] tracking-[0.2em]">Tarification</Badge>
          <h2 className="text-4xl font-black tracking-tighter">Évoluez avec votre activité</h2>
          <p className="text-muted-foreground font-medium max-w-lg mx-auto">Changez de plan à tout moment. Les fonctionnalités sont débloquées instantanément.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 pt-6">
          {CATALOG_PLANS.map((p) => {
            const isCurrent = normalizedPlanId === p.id;
            return (
              <div key={p.id} className={cn(
                "relative group flex flex-col p-6 rounded-[2rem] border transition-all duration-300",
                p.highlight ? "bg-primary text-primary-foreground shadow-2xl shadow-primary/20 border-primary scale-105 z-10" : "bg-card hover:border-primary/50 shadow-sm",
                isCurrent && "ring-2 ring-primary ring-offset-4 ring-offset-background"
              )}>
                {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-foreground text-background px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Recommandé</div>}

                <div className="mb-6 flex justify-between items-start">
                   <div>
                    <h3 className="text-lg font-black tracking-tight">{p.name}</h3>
                    <div className="flex items-baseline mt-1">
                      <span className="text-3xl font-black tracking-tighter">{moneyEUR(p.priceMonthlyCents)}</span>
                      <span className={cn("text-xs font-bold ml-1", p.highlight ? "text-primary-foreground/70" : "text-muted-foreground")}>/mois</span>
                    </div>
                   </div>
                   {isCurrent && <Badge className="bg-foreground text-background text-[9px] font-black border-transparent">ACTUEL</Badge>}
                </div>

                <p className={cn("text-sm font-medium leading-relaxed mb-6", p.highlight ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {p.blurb}
                </p>

                <div className="space-y-3 mb-8 flex-1">
                  {p.bullets.map((b) => (
                    <div key={b} className="flex items-center gap-3 text-xs font-bold uppercase tracking-tight">
                      <Check className={cn("h-4 w-4 shrink-0", p.highlight ? "text-primary-foreground" : "text-primary")} />
                      <span className="opacity-90">{b}</span>
                    </div>
                  ))}
                </div>

                <Button
                  className={cn("w-full h-12 rounded-xl font-black shadow-lg transition-all active:scale-95",
                    p.highlight ? "bg-background text-primary hover:bg-background/90 shadow-black/10" : "bg-primary"
                  )}
                  disabled={isCurrent}
                  onClick={() => alert("Connexion Stripe Checkout en cours...")}
                >
                  {isCurrent ? "Votre plan" : `Passer au plan ${p.name}`}
                </Button>
              </div>
            );
          })}
        </div>
      </div>


      {/* ===================== MANAGEMENT LAYER ===================== */}
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <CardHeader className="border-b bg-muted/20 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-background p-2 shadow-sm">
                  <FileClock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg font-black tracking-tight">
                    Historique des factures
                  </CardTitle>
                  <CardDescription className="font-medium">
                    Pret pour Stripe Billing: recus, statuts et PDF centralises.
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest">
                A brancher
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-6 md:p-8">
            <div className="overflow-hidden rounded-2xl border border-dashed bg-muted/10">
              <div className="grid grid-cols-[1fr_0.8fr_0.8fr_auto] gap-3 border-b bg-muted/30 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <span>Periode</span>
                <span>Montant</span>
                <span>Statut</span>
                <span className="text-right">PDF</span>
              </div>
              <div className="grid grid-cols-[1fr_0.8fr_0.8fr_auto] items-center gap-3 px-4 py-5 text-sm">
                <div>
                  <p className="font-black text-foreground">Aucune facture synchronisee</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    Les factures apparaitront ici apres connexion du compte Stripe.
                  </p>
                </div>
                <span className="font-bold text-muted-foreground">--</span>
                <Badge variant="secondary" className="w-fit rounded-full text-[10px] font-black uppercase">
                  En attente
                </Badge>
                <Button variant="outline" size="sm" disabled className="rounded-xl font-bold">
                  <Download className="mr-2 h-4 w-4" />
                  PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
          <CardHeader className="border-b bg-muted/20 p-6 md:p-8">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-background p-2 shadow-sm">
                <Lock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg font-black tracking-tight">
                  Fonctions selon forfait
                </CardTitle>
                <CardDescription className="font-medium">
                  Ce que l'agence peut utiliser aujourd'hui, sans surprise.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 p-6 md:p-8">
            {FEATURE_GATES.map((feature) => {
              const unlocked = planAllows(normalizedPlanId, feature.minPlan);

              return (
                <div
                  key={feature.label}
                  className={cn(
                    "flex flex-col gap-3 rounded-2xl border p-4 transition-all sm:flex-row sm:items-center sm:justify-between",
                    unlocked
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-muted-foreground/10 bg-muted/10"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-foreground">{feature.label}</p>
                      <Badge
                        variant={unlocked ? "default" : "secondary"}
                        className={cn(
                          "rounded-full text-[9px] font-black uppercase tracking-widest",
                          unlocked && "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15"
                        )}
                      >
                        {unlocked ? "Inclus" : `Plan ${feature.minPlan}`}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
                      {feature.detail}
                    </p>
                  </div>

                  {unlocked && feature.href ? (
                    <Button asChild variant="outline" size="sm" className="rounded-xl font-bold shrink-0">
                      <Link href={feature.href}>Ouvrir</Link>
                    </Button>
                  ) : unlocked ? (
                    <Button variant="outline" size="sm" disabled className="rounded-xl font-bold shrink-0">
                      Actif
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm" className="rounded-xl font-bold shrink-0">
                      <Link href="#plans">Debloquer</Link>
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[2rem] border-none shadow-xl shadow-black/[0.02] bg-background ring-1 ring-black/5 overflow-hidden">
        <CardHeader className="border-b bg-muted/20 p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-background p-2 shadow-sm">
                <PackagePlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg font-black tracking-tight">
                  Add-ons a la carte
                </CardTitle>
                <CardDescription className="font-medium">
                  Pour absorber un pic d'activite sans changer toute l'offre.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest">
              Stripe requis
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 p-6 md:grid-cols-3 md:p-8">
          {ADDON_OFFERS.map((addon) => (
            <div key={addon.id} className="flex h-full flex-col rounded-2xl border bg-muted/10 p-5">
              <div className="mb-5 flex-1">
                <p className="text-lg font-black tracking-tight text-foreground">{addon.title}</p>
                <p className="mt-1 text-sm font-black text-primary">{addon.price}</p>
                <p className="mt-3 text-xs font-medium leading-relaxed text-muted-foreground">
                  {addon.detail}
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-xl font-bold"
                onClick={() =>
                  alert("Les add-ons seront actives via Stripe Billing apres configuration du paiement.")
                }
              >
                Preparer l'option
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      {/* ===================== FOOTER / CUSTOM ===================== */}
      <Card className="rounded-[2rem] border-dashed bg-muted/10 p-8 border-2">
         <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-2 text-center md:text-left">
               <div className="flex items-center justify-center md:justify-start gap-2">
               <Headset className="h-5 w-5 text-primary" />
                  <h3 className="text-xl font-black tracking-tight uppercase">Besoin d'un plan sur-mesure ?</h3>
               </div>
               <p className="text-sm font-medium text-muted-foreground max-w-md">
                  Pour les organisations multi-sociétés avec des volumes importants ou des besoins SLA spécifiques.
               </p>
            </div>
            <div className="flex items-center gap-3">
               <Button variant="outline" className="rounded-xl h-12 px-6 font-bold">Contacter le support</Button>
               <Button className="rounded-xl h-12 px-6 font-black shadow-lg shadow-primary/20">Demander une démo</Button>
            </div>
         </div>
      </Card>
    </div>
  );
}
