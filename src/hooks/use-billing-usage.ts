"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

export type BillingUsageResponse = {
  ok: boolean;
  tenantId?: string;

  plan?: { id?: string; name?: string; priceMonthlyCents?: number | null };
  subscription?: { planId?: string; status?: string; addons?: any };

  limits?: { agents?: number; sites?: number; tenants?: number };
  usage?: { agents?: number; sites?: number; tenants?: number; activeTenants?: number };

  progress?: { agentsPct?: number; sitesPct?: number; tenantsPct?: number };

  atLimit?: { agents?: boolean; sites?: boolean; tenants?: boolean };
  error?: string;
};

export function useBillingUsage(enabled = true) {
  const [data, setData] = useState<BillingUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLimitList = useMemo(() => {
    const a = data?.atLimit;
    if (!a) return [];
    const out: string[] = [];
    if (a.agents) out.push("agents");
    if (a.sites) out.push("sites");
    if (a.tenants) out.push("tenants");
    return out;
  }, [data?.atLimit]);

  const hasLimitIssue = atLimitList.length > 0;

  const usedAgents = data?.usage?.agents ?? 0;
  const usedSites = data?.usage?.sites ?? 0;
  const usedTenants = data?.usage?.activeTenants ?? data?.usage?.tenants ?? 0;

  const planLabel = data?.plan?.name ?? data?.subscription?.planId ?? "—";
  const isFree = String(data?.plan?.id ?? data?.subscription?.planId ?? "")
    .toLowerCase()
    .includes("free");

  async function refresh() {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<BillingUsageResponse>("/api/billing/usage");
      if (!res?.ok) {
        setData(null);
        setError(res?.error ?? "Impossible de charger billing.");
        return;
      }
      setData(res);
    } catch (e: any) {
      setData(null);
      setError(e?.message ?? "Erreur billing.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    data,
    loading,
    error,
    refresh,

    planLabel,
    isFree,

    usedAgents,
    usedSites,
    usedTenants,

    atLimitList,
    hasLimitIssue,
  };
}
