"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

export type UseSitesParams = {
  q?: string;
  isActive?: boolean | null; // null => tous
  clientId?: string | null;
  max?: number;
};

export type SiteApiItem = {
  id: string;
  tenantId: string;

  name: string | null;

  clientId?: string | null;
  clientName?: string | null;

  siteType?: string | null;
  riskLevel?: number | null;

  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  instructions?: string | null;
  isActive?: boolean;

  agentIds?: string[];
  managerIds?: string[];
  accessUids?: string[];

  createdBy?: string | null;
  updatedBy?: string | null;
  createdAtIso?: string | null;
  updatedAtIso?: string | null;
};

function safeNum(v: unknown, def: number) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export function useSites(params: UseSitesParams = {}) {
  const max = Math.min(safeNum(params.max, 100), 200);

  const [items, setItems] = useState<SiteApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams();
        qs.set("max", String(max));

        const q = (params.q ?? "").trim();
        if (q) qs.set("q", q);

        if (params.clientId) qs.set("clientId", params.clientId);

        // isActive = null => pas de filtre
        if (params.isActive === true) qs.set("isActive", "true");
        if (params.isActive === false) qs.set("isActive", "false");

        const res = await apiFetch<{
          ok: boolean;
          sites?: any[];
          items?: any[];
          error?: string;
        }>(`/api/sites?${qs.toString()}`);

        if (!res.ok) {
          if (!cancelled) {
            setItems([]);
            setError(res.error ?? "Impossible de charger les sites.");
          }
          return;
        }

        const arr = (res.sites ?? res.items ?? []) as any[];
        const normalized: SiteApiItem[] = arr.map((s: any) => ({
          id: String(s.id),
          tenantId: String(s.tenantId),

          name: s.name ?? null,

          clientId: typeof s.clientId === "string" ? s.clientId : null,
          clientName: typeof s.clientName === "string" ? s.clientName : null,

          siteType: s.siteType ?? null,
          riskLevel: typeof s.riskLevel === "number" ? s.riskLevel : null,

          address: s.address ?? null,
          city: s.city ?? null,
          postalCode: s.postalCode ?? null,
          instructions: s.instructions ?? null,
          isActive: typeof s.isActive === "boolean" ? s.isActive : true,

          agentIds: Array.isArray(s.agentIds) ? s.agentIds : [],
          managerIds: Array.isArray(s.managerIds) ? s.managerIds : [],
          accessUids: Array.isArray(s.accessUids) ? s.accessUids : [],

          createdBy: s.createdBy ?? null,
          updatedBy: s.updatedBy ?? null,
          createdAtIso: s.createdAtIso ?? null,
          updatedAtIso: s.updatedAtIso ?? null,
        }));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q, params.clientId, params.isActive, max, reloadKey]);

  const reload = () => setReloadKey((x) => x + 1);

  return useMemo(() => ({ items, loading, error, reload }), [items, loading, error]);
}
