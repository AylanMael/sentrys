"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";
import type { Site } from "@/lib/sites/types";

type UseSitesByClientOptions = {
  max?: number; // max sites
  includeInactive?: boolean;
};

function safeNum(v: unknown, def: number) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export function useSitesByClientApi(
  clientId: string | null | undefined,
  options: UseSitesByClientOptions = {}
) {
  const max = Math.min(safeNum(options.max, 50), 200);
  const includeInactive = Boolean(options.includeInactive);

  const [items, setItems] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setItems([]);
    setError(null);

    if (!clientId) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("clientId", clientId);
        qs.set("max", String(max));
        if (!includeInactive) qs.set("isActive", "true");

        const res = await apiFetch<{
          ok: boolean;
          items?: any[];
          sites?: any[];
          error?: string;
        }>(`/api/sites?${qs.toString()}`);

        if (!res.ok) {
          if (!cancelled) {
            setItems([]);
            setError(res.error ?? "Impossible de charger les sites liés.");
          }
          return;
        }

        const raw = (res.items ?? res.sites ?? []) as any[];

        const normalized = raw.map((s: any) => ({
          ...s,
          id: String(s.id),
          name: String(s.name ?? ""),
          clientId: typeof s.clientId === "string" ? s.clientId : null,
          clientName: typeof s.clientName === "string" ? s.clientName : undefined,
          isActive: typeof s.isActive === "boolean" ? s.isActive : true,
          riskLevel: (s.riskLevel ?? 3) as any,
          siteType: (s.siteType ?? "bureaux") as any,
        })) as Site[];

        if (!cancelled) setItems(normalized);
      } catch (e: any) {
        if (!cancelled) {
          setItems([]);
          setError(e?.message ?? "Erreur réseau.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId, max, includeInactive]);

  return useMemo(() => ({ items, loading, error }), [items, loading, error]);
}
