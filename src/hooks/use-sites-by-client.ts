"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";
import type { Site } from "@/lib/sites/types";

type UseSitesByClientOptions = {
  /** nombre max de sites renvoyés */
  limit?: number;
  /** inclure les sites inactifs */
  includeInactive?: boolean;
};

function safeNum(v: unknown, def: number) {
  const n = typeof v === "number" ? v : parseInt(String(v || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function normalizeSites(raw: any[]): Site[] {
  const rows = (raw ?? []).map((s: any) => ({
    id: String(s.id),
    tenantId: String(s.tenantId ?? ""),

    name: String(s.name ?? ""),
    clientName: s.clientName ?? undefined,

    siteType: (s.siteType ?? "bureaux") as Site["siteType"],
    riskLevel: (s.riskLevel ?? 3) as Site["riskLevel"],

    address: s.address ?? undefined,
    city: s.city ?? undefined,
    postalCode: s.postalCode ?? undefined,

    instructions: s.instructions ?? undefined,
    isActive: Boolean(typeof s.isActive === "boolean" ? s.isActive : true),

    managerIds: Array.isArray(s.managerIds) ? s.managerIds : undefined,
    agentIds: Array.isArray(s.agentIds) ? s.agentIds : undefined,

    createdAt: s.createdAt ?? undefined,
    updatedAt: s.updatedAt ?? undefined,

    createdBy: s.createdBy ?? undefined,
    updatedBy: s.updatedBy ?? undefined,
  })) as Site[];

  // tri robuste: updatedAtIso / createdAtIso si dispo, sinon rien
  rows.sort((a: any, b: any) => {
    const au = a.updatedAtIso ? Date.parse(a.updatedAtIso) : 0;
    const bu = b.updatedAtIso ? Date.parse(b.updatedAtIso) : 0;
    if (bu !== au) return bu - au;

    const ac = a.createdAtIso ? Date.parse(a.createdAtIso) : 0;
    const bc = b.createdAtIso ? Date.parse(b.createdAtIso) : 0;
    return bc - ac;
  });

  return rows.filter((x) => x.id && x.tenantId && x.name);
}

export function useSitesByClient(
  clientId: string | null | undefined,
  options: UseSitesByClientOptions = {}
) {
  const lim = useMemo(() => Math.min(safeNum(options.limit, 20), 200), [options.limit]);
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
        qs.set("clientId", String(clientId));
        qs.set("max", String(lim));

        // par défaut: on ne veut que les actifs
        if (!includeInactive) qs.set("isActive", "true");

        const res = await apiFetch<{
          ok: boolean;
          sites?: any[];
          items?: any[]; // compat
          error?: string;
        }>(`/api/sites?${qs.toString()}`);

        if (!res.ok) {
          if (!cancelled) {
            setItems([]);
            setError(res.error ?? "Impossible de charger les sites du client.");
          }
          return;
        }

        const raw = res.sites ?? res.items ?? [];
        const next = normalizeSites(raw);

        if (!cancelled) setItems(next);
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
  }, [clientId, lim, includeInactive]);

  return { items, loading, error };
}
