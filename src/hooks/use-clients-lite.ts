// src/hooks/use-clients-lite.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

export type ClientLite = {
  id: string;
  name: string;
  status?: "active" | "inactive";
};

type UseClientsLiteOpts = {
  status?: "active" | "inactive" | "all";
  limit?: number;
};

function isIndexErrorMessage(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("failed_precondition") ||
    m.includes("requires an index") ||
    m.includes("create_composite=") ||
    m.includes("the query requires an index")
  );
}

function extractIndexUrl(msg: string): string | null {
  const match = msg.match(/https:\/\/console\.firebase\.google\.com\/[^\s"]+/);
  return match?.[0] ?? null;
}

export function useClientsLite(opts?: UseClientsLiteOpts) {
  const status = opts?.status ?? "active";
  const limit = Math.min(opts?.limit ?? 200, 200);

  const [items, setItems] = useState<ClientLite[]>([]);
  const [loading, setLoading] = useState(true);

  // on garde un message + éventuellement un lien d’index
  const [error, setError] = useState<string | null>(null);
  const [indexUrl, setIndexUrl] = useState<string | null>(null);

  // permet de relancer manuellement sans changer les deps
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((x) => x + 1);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setIndexUrl(null);

      try {
        const qs = new URLSearchParams();
        qs.set("status", status);
        qs.set("limit", String(limit));

        const res = await apiFetch<{
          ok: boolean;
          items?: any[];
          error?: string;
        }>(`/api/clients?${qs.toString()}`);

        if (!res.ok) {
          const raw = res.error ?? "Impossible de charger les clients.";

          if (!cancelled) {
            setItems([]);

            // ✅ erreur index Firestore => message clair + lien
            if (isIndexErrorMessage(raw)) {
              setError(
                "Firestore requiert un index composite pour lister les clients. Crée l’index puis recharge."
              );
              setIndexUrl(extractIndexUrl(raw));
            } else {
              setError(raw);
            }
          }
          return;
        }

        const lite: ClientLite[] = (res.items ?? [])
          .map((c: any) => ({
            id: String(c.id),
            name: String(c.name ?? "").trim(),
            status: c.status,
          }))
          .filter((c) => c.id && c.name);

        lite.sort((a, b) => a.name.localeCompare(b.name, "fr"));

        if (!cancelled) setItems(lite);
      } catch (e: any) {
        const raw = e?.message ?? "Erreur réseau.";

        if (!cancelled) {
          setItems([]);

          // ✅ si apiFetch throw avec payload contenant error index
          if (isIndexErrorMessage(raw)) {
            setError(
              "Firestore requiert un index composite pour lister les clients. Crée l’index puis recharge."
            );
            setIndexUrl(extractIndexUrl(raw));
          } else {
            setError(raw);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, limit, refreshKey]);

  return useMemo(
    () => ({ items, loading, error, indexUrl, refresh }),
    [items, loading, error, indexUrl]
  );
}
