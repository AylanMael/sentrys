"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Loader2,
  ChevronRight,
  AlertTriangle,
  Filter,
  Calendar,
  RefreshCcw,
} from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

type PagedRes = {
  ok: boolean;
  tenantId?: string;
  count?: number;
  nextCursor?: string | null;
  items?: ActivityItem[];
  error?: string;
};

type SeverityFilter = "all" | "info" | "warning" | "critical";
type RangePreset = "7d" | "30d" | "custom";

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

function isoDateOnly(d: Date) {
  // YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function ActivityExplorer({ pageSize = 20 }: { pageSize?: number }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [preset, setPreset] = useState<RangePreset>("7d");

  const today = useMemo(() => new Date(), []);
  const defaultFrom7 = useMemo(() => isoDateOnly(addDays(today, -7)), [today]);
  const defaultFrom30 = useMemo(() => isoDateOnly(addDays(today, -30)), [today]);
  const defaultTo = useMemo(() => isoDateOnly(today), [today]);

  const [from, setFrom] = useState<string>(defaultFrom7);
  const [to, setTo] = useState<string>(defaultTo);

  // keep from/to aligned with preset
  useEffect(() => {
    if (preset === "7d") {
      setFrom(defaultFrom7);
      setTo(defaultTo);
    }
    if (preset === "30d") {
      setFrom(defaultFrom30);
      setTo(defaultTo);
    }
    // custom => ne touche pas
  }, [preset, defaultFrom7, defaultFrom30, defaultTo]);

  function buildUrl(input: { cursor?: string | null }) {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));

    if (severity !== "all") params.set("severity", severity);

    // from/to ISO date (YYYY-MM-DD) -> backend parseDate OK
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    if (input.cursor) params.set("cursor", input.cursor);

    return `/api/activity?${params.toString()}`;
  }

  async function loadFirstPage() {
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<PagedRes>(buildUrl({ cursor: null }));
      if (!res?.ok) {
        setItems([]);
        setCursor(null);
        setError(res?.error ?? "Impossible de charger l’activité.");
        return;
      }

      const list = Array.isArray(res.items) ? res.items : [];
      setItems(list);
      setCursor(res.nextCursor ?? (list.length ? list[list.length - 1].id : null));
    } catch (e: any) {
      setItems([]);
      setCursor(null);
      setError(e?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);

    try {
      const res = await apiFetch<PagedRes>(buildUrl({ cursor }));
      if (!res?.ok) {
        setError(res?.error ?? "Impossible de charger plus d’activité.");
        return;
      }

      const next = Array.isArray(res.items) ? res.items : [];
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...next.filter((x) => !seen.has(x.id))];
      });

      setCursor(res.nextCursor ?? (next.length ? next[next.length - 1].id : null));
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoadingMore(false);
    }
  }

  // Auto reload when filters change
  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, from, to, pageSize]);

  const hasMore = useMemo(() => !!cursor && items.length > 0, [cursor, items.length]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="rounded-3xl border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" />
              Filtres
            </div>
            <div className="text-xs text-muted-foreground">
              Filtre par sévérité et période (utile en prod, audit, support).
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            {/* Severity */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Sévérité</div>
              <Select value={severity} onValueChange={(v) => setSeverity(v as SeverityFilter)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Alerte</SelectItem>
                  <SelectItem value="critical">Critique</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preset */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Période</div>
              <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="7 jours" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 derniers jours</SelectItem>
                  <SelectItem value="30d">30 derniers jours</SelectItem>
                  <SelectItem value="custom">Personnalisé</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Du</div>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-10 pl-10"
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPreset("custom");
                    setFrom(e.target.value);
                  }}
                />
              </div>
            </div>

            {/* To */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Au</div>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-10 pl-10"
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPreset("custom");
                    setTo(e.target.value);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={loadFirstPage}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Rafraîchir
          </Button>
        </div>
      </Card>

      {/* List */}
      <Card className="rounded-3xl border bg-card p-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de l’activité…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Erreur
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{error}</div>

            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={loadFirstPage}>
                Réessayer
              </Button>
            </div>
          </div>
        ) : !items.length ? (
          <div className="py-8 text-sm text-muted-foreground">
            Aucune activité pour cette période.
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={it.id} className="rounded-2xl border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-1 h-2.5 w-2.5 rounded-full", sevDot(it.severity))} />

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug">
                        {it.message ?? "—"}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{when(it.createdAtIso)}</span>
                        <span>•</span>
                        <span>{it.actorEmail ?? "—"}</span>

                        {it.entityType && it.entityId ? (
                          <>
                            <span>•</span>
                            <Link
                              className="inline-flex items-center hover:underline"
                              href={`/dashboard/${it.entityType}s/${it.entityId}`}
                            >
                              Voir <ChevronRight className="ml-1 h-3.5 w-3.5" />
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={!hasMore || loadingMore}
              >
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
        )}
      </Card>
    </div>
  );
}
