"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

type BillingUsageResponse = {
  ok: boolean;
  tenantId?: string;
  limits?: { agents?: number; sites?: number; tenants?: number };
  usage?: { agents?: number; sites?: number; tenants?: number; activeTenants?: number };
  atLimit?: { agents?: boolean; sites?: boolean; tenants?: boolean };
  error?: string;
};

export function useBillingUsage(enabled = true) {
  const [data, setData] = useState<BillingUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const res = await apiFetch<BillingUsageResponse>("/api/billing/usage");
        if (!mounted) return;
        setData(res);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [enabled]);

  const atLimitList = useMemo(() => {
    const a = data?.atLimit ?? {};
    const out: Array<"agents" | "sites" | "tenants"> = [];
    if (a.agents) out.push("agents");
    if (a.sites) out.push("sites");
    if (a.tenants) out.push("tenants");
    return out;
  }, [data]);

  const hasLimitIssue = atLimitList.length > 0;

  return { data, loading, atLimitList, hasLimitIssue };
}
