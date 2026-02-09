// src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlusCircle, Siren } from "lucide-react";

import { DashboardStats } from "@/components/dashboard/stats-cards";
import { RecentIncidentsCard } from "@/components/dashboard/recent-incidents";
import { Button } from "@/components/ui/button";

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
    addons?: any;
    periodStart?: any;
    periodEnd?: any;
  };

  limits?: { agents?: number; sites?: number; tenants?: number };

  usage?: {
    agents?: number;
    sites?: number;
    // backend renvoie "tenants" (normalisé) => on supporte aussi activeTenants si jamais
    tenants?: number;
    activeTenants?: number;
    updatedAt?: any;
  };

  progress?: { agentsPct?: number; sitesPct?: number; tenantsPct?: number };

  // backend actuel = objet {agents:boolean,...}
  atLimit?: { agents?: boolean; sites?: boolean; tenants?: boolean };

  // optionnel si tu ajoutes un tableau côté API
  atLimitList?: string[];

  error?: string;
};

function toAtLimitList(b: BillingUsageResponse | null): string[] {
  if (!b) return [];
  if (Array.isArray(b.atLimitList)) return b.atLimitList;

  const a = b.atLimit ?? {};
  const out: string[] = [];
  if (a.agents) out.push("agents");
  if (a.sites) out.push("sites");
  if (a.tenants) out.push("tenants");
  return out;
}

export default function DashboardPage() {
  const [billing, setBilling] = useState<BillingUsageResponse | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadBilling() {
      setBillingLoading(true);
      setBillingError(null);

      try {
        const res = await apiFetch<BillingUsageResponse>("/api/billing/usage");

        if (!mounted) return;

        console.log("BILLING USAGE", res);

        if (!res?.ok) {
          setBilling(null);
          setBillingError(res?.error ?? "Impossible de charger les informations d’abonnement.");
          return;
        }

        setBilling(res);
      } catch (e: any) {
        if (!mounted) return;
        setBilling(null);
        setBillingError(e?.message ?? "Erreur inconnue lors du chargement billing.");
      } finally {
        if (!mounted) return;
        setBillingLoading(false);
      }
    }

    loadBilling();

    return () => {
      mounted = false;
    };
  }, []);

  // ✅ normalisations UI
  const usedTenants = billing?.usage?.activeTenants ?? billing?.usage?.tenants ?? 0;
  const atLimitList = useMemo(() => toAtLimitList(billing), [billing]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Vue d’ensemble et derniers incidents pour votre tenant.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/incidents">
              <Siren className="mr-2 h-4 w-4" />
              Voir les incidents
            </Link>
          </Button>

          <Button asChild>
            <Link href="/dashboard/incidents">
              <PlusCircle className="mr-2 h-4 w-4" />
              Nouvel incident
            </Link>
          </Button>
        </div>
      </div>

      <DashboardStats />

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentIncidentsCard />

        {/* Bloc billing temporaire (à remplacer par une vraie carte premium) */}
        <div className="rounded-3xl border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Abonnement & quotas</div>
              <div className="text-xs text-muted-foreground">
                Plan, limites et usage en temps réel.
              </div>
            </div>

            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/billing">Gérer</Link>
            </Button>
          </div>

          <div className="mt-4 text-sm">
            {billingLoading ? (
              <div className="text-muted-foreground">Chargement…</div>
            ) : billingError ? (
              <div className="text-destructive">
                {billingError}
                <div className="mt-2 text-xs text-muted-foreground">
                  Ouvre la console (F12) pour voir le log si besoin.
                </div>
              </div>
            ) : billing?.ok ? (
              <div className="space-y-3">
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">Plan :</span>{" "}
                  {billing.plan?.name ?? billing.subscription?.planId ?? "—"}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Agents</div>
                    <div className="text-sm font-semibold">
                      {billing.usage?.agents ?? 0} / {billing.limits?.agents ?? "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Sites</div>
                    <div className="text-sm font-semibold">
                      {billing.usage?.sites ?? 0} / {billing.limits?.sites ?? "—"}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">Tenants</div>
                    <div className="text-sm font-semibold">
                      {usedTenants} / {billing.limits?.tenants ?? "—"}
                    </div>
                  </div>
                </div>

                {atLimitList.length > 0 ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                    Quota atteint sur :{" "}
                    <span className="font-medium text-destructive">
                      {atLimitList.join(", ")}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-muted-foreground">Aucune donnée.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
