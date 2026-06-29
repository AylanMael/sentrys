// src/hooks/use-clients.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

type ClientItem = any;

type UseClientsArgs = {
  q?: string;
  status?: string; // "all" | "active" | "inactive" ...
  limit?: number;
  enabled?: boolean;
};

type ApiListResponse = {
  ok: true;
  items: ClientItem[];
  nextCursor: string | null;
};

export function useClients(args: UseClientsArgs) {
  const q = args.q ?? "";
  const status = args.status ?? "all";
  const limit = args.limit ?? 20;
  const enabled = args.enabled ?? true;

  const [items, setItems] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const paramsKey = useMemo(() => JSON.stringify({ q, status, limit }), [q, status, limit]);
  const lastParamsKeyRef = useRef<string>("");

  const fetchPage = useCallback(
    async (cursor?: string | null, mode: "replace" | "append" = "replace") => {
      if (!enabled) return;

      setLoading(true);
      setError(null);

      try {
        const sp = new URLSearchParams();
        if (q) sp.set("q", q);
        if (status) sp.set("status", status);
        sp.set("limit", String(limit));
        if (cursor) sp.set("cursor", cursor);

        const data = await apiFetch<ApiListResponse>(`/api/clients?${sp.toString()}`);

        setItems((prev) => (mode === "append" ? [...prev, ...data.items] : data.items));
        setNextCursor(data.nextCursor);
      } catch (e: any) {
        setError(e?.message ?? "Erreur lors du chargement");
      } finally {
        setLoading(false);
      }
    },
    [q, status, limit, enabled]
  );

  // auto load when params change
  useEffect(() => {
    if (!enabled) {
      lastParamsKeyRef.current = "";
      setItems([]);
      setNextCursor(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (lastParamsKeyRef.current === paramsKey) return;
    lastParamsKeyRef.current = paramsKey;
    fetchPage(null, "replace");
  }, [enabled, paramsKey, fetchPage]);

  const loadMore = useCallback(async () => {
    if (!enabled || !nextCursor || loading) return;
    await fetchPage(nextCursor, "append");
  }, [enabled, nextCursor, loading, fetchPage]);

  const reload = useCallback(async () => {
    if (!enabled || loading) return;
    await fetchPage(null, "replace");
  }, [enabled, loading, fetchPage]);

  return { items, loading, error, nextCursor, loadMore, reload };
}
