// src/hooks/use-me.ts
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

export type Me = {
  ok: boolean;
  uid?: string;
  email?: string | null;
  name?: string | null;
  tenantId?: string | null;
  role?: string | null;
  status?: string | null;
  hasTenant?: boolean;
  tenant?: any; // optionnel si tu l’utilisés
};

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<Me>("/api/me");
      setMe(data);
      return data;
    } catch (e: any) {
      const msg = e?.message ?? "Failed to load /api/me";
      setMe({ ok: false });
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { me, loading, error, refresh };
}
