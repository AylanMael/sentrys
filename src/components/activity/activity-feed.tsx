"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, ChevronRight, AlertTriangle } from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ActivityItem = {
  id: string;
  action: string | null;
  entityType: string | null;
  entityId: string | null;
  message: string | null;
  severity: "info" | "warning" | "critical";
  actorEmail: string | null;
  actorRole: string | null;
  createdAtIso: string | null;
};

type RecentRes = {
  ok: boolean;
  tenantId?: string;
  count?: number;
  items?: ActivityItem[];
  error?: string;
};

type PagedRes = {
  ok: boolean;
  tenantId?: string;
  count?: number;
  nextCursor?: string | null;
  items?: ActivityItem[];
  error?: string;
};

function sevDot(sev: ActivityItem["severity"]) {
  if (sev === "critical") return "bg-red-500";
  if (sev === "warning") return "bg-amber-500";
  return "bg-emerald-500";
}

function when(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return formatDistanceToNow(d, { addSuffix: true, locale: fr });
}

function roleLabel(role: string | null) {
  const r = String(role ?? "").trim().toLowerCase();
  if (!r) return null;
  if (r === "admin") return "Admin";
  if (r === "manager") return "Manager";
  if (r === "agent") return "Agent";
  return r;
}

function getEntityHref(entityType: string | null, entityId: string | null) {
  if (!entityType || !entityId) return null;

  // ✅ routes réelles (et extensibles)
  const routeMap: Record<string, (id: string) => string> = {
    agent: (id) => `/dashboard/agents/${id}`,
    site: (id) => `/dashboard/sites/${id}`,
    vacation: (id) => `/dashboard/vacations/${id}`,
    incident: (id) => `/dashboard/incidents/${id}`,
    user: (id) => `/dashboard/users/${id}`,
    // billing / system => pas de page détail
  };

  const fn = routeMap[entityType];
  return fn ? fn(entityId) : null;
}

export function ActivityFeed({ limit = 6 }: { limit?: number }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ on affiche “Charger plus” si on a une page complète (donc probable suite)
  const [canPaginate, setCanPaginate] = useState(false);

  const hasMore = useMemo(
    () => !!cursor && canPaginate && items.length > 0,
    [cursor, canPaginate, items.length]
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await apiFetch<RecentRes>(`/api/activity/recent?limit=${limit}`);
        if (!mounted) return;

        if (!res?.ok) {
          setItems([]);
          setCursor(null);
          setCanPaginate(false);
          setError(res?.error ?? "Impossible de charger l’activité.");
          return;
        }

        const list = Array.isArray(res.items) ? res.items : [];
        setItems(list);

        // cursor = dernier doc id (sert de startAfter côté /api/activity)
        const lastId = list.length ? list[list.length - 1].id : null;
        setCursor(lastId);

        // ✅ si on a reçu moins que limit, il n’y a probablement pas de suite
        setCanPaginate(list.length >= limit);
      } catch (e: unknown) {
        if (!mounted) return;
        setItems([]);
        setCursor(null);
        setCanPaginate(false);
        const message = e instanceof Error ? e.message : "Erreur lors du chargement.";
        setError(message);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [limit]);

  async function loadMore() {
    if (!cursor) return;

    setLoadingMore(true);
    setError(null);

    try {
      const res = await apiFetch<PagedRes>(`/api/activity?limit=${limit}&cursor=${cursor}`);
      if (!res?.ok) {
        setError(res?.error ?? "Impossible de charger plus d’activité.");
        return;
      }

      const next = Array.isArray(res.items) ? res.items : [];

      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...next.filter((x) => !seen.has(x.id))];
      });

      // si l’API renvoie nextCursor=null => fin
      const nextCursor = res.nextCursor ?? (next.length ? next[next.length - 1].id : null);
      setCursor(nextCursor);

      // ✅ on continue à proposer “Charger plus” seulement si on a une page pleine
      setCanPaginate(next.length >= limit && !!nextCursor);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur lors du chargement.";
      setError(message);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de l’activité…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Erreur
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{error}</div>

        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => location.reload()}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  if (!items.length) {
    return <div className="py-6 text-sm text-muted-foreground">Aucune activité pour le moment.</div>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((it) => {
          const href = getEntityHref(it.entityType, it.entityId);
          const role = roleLabel(it.actorRole);

          return (
            <li key={it.id} className="rounded-2xl border bg-card p-3">
              <div className="flex items-start gap-3">
                <div className={cn("mt-1 h-2.5 w-2.5 rounded-full", sevDot(it.severity))} />

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-snug">{it.message ?? "—"}</div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{when(it.createdAtIso)}</span>
                    <span>•</span>
                    <span>{it.actorEmail ?? "—"}</span>
                    {role ? (
                      <>
                        <span>•</span>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-foreground/80">
                          {role}
                        </span>
                      </>
                    ) : null}

                    {href ? (
                      <>
                        <span>•</span>
                        <Link className="inline-flex items-center hover:underline" href={href}>
                          Voir <ChevronRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/activity">Tout voir</Link>
        </Button>

        <Button variant="outline" size="sm" onClick={loadMore} disabled={!hasMore || loadingMore}>
          {loadingMore ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Chargement…
            </>
          ) : (
            "Charger plus"
          )}
        </Button>
      </div>
    </div>
  );
}
