// src/hooks/use-billing-usage.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

type BillingUsageResponse = {
  isFree?: boolean;
  hasLimitIssue?: boolean;
  atLimitList?: string[];
};

type BillingUsage = {
  loading: boolean;
  isFree: boolean;
  hasLimitIssue: boolean;
  atLimitList: string[];
  error?: string | null;
  reload: () => Promise<void>;
};

const EMPTY: Omit<BillingUsage, "reload"> = {
  loading: false,
  isFree: true,
  hasLimitIssue: false,
  atLimitList: [],
  error: null,
};

export function useBillingUsage(enabled: boolean): BillingUsage {
  const [state, setState] = useState<Omit<BillingUsage, "reload">>({
    ...EMPTY,
    loading: Boolean(enabled),
  });

  const fetchUsage = useCallback(async () => {
    if (!enabled) {
      setState({ ...EMPTY, loading: false });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const data = await apiFetch<BillingUsageResponse>("/api/billing/usage");

      const isFree = Boolean(data?.isFree);
      const atLimitList = Array.isArray(data?.atLimitList) ? data.atLimitList : [];
      const hasLimitIssue = Boolean(
        data?.hasLimitIssue ?? atLimitList.length > 0
      );

      setState({
        loading: false,
        isFree,
        atLimitList,
        hasLimitIssue,
        error: null,
      });
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Erreur billing";

      setState((s) => ({
        ...s,
        loading: false,
        error: message,
      }));
    }
  }, [enabled]);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  const reload = useCallback(async () => {
    await fetchUsage();
  }, [fetchUsage]);

  return useMemo(
    () => ({
      ...state,
      reload,
    }),
    [state, reload]
  );
}
