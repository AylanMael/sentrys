"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Loader2,
  AlertTriangle,
  Search,
  Filter,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

function sevDot(sev: ActivityItem["severity"]) {
  if (sev === "critical") return "bg-red-500";
  if (sev === "warning") return "bg-amber-500";
  return "bg-emerald-500";
}

function sevBadge(sev: ActivityItem["severity"]) {
  if (sev === "critical") return { variant: "destructive" as const, label: "Critique" };
  if (sev === "warning") return { variant: "outline" as const, label: "Alerte" };
  return { variant: "secondary" as const, label: "Info" };
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

  const routeMap: Record<string, (id: string) => string> = {
    agent: (id) => `/dashboard/agents/${id}`,
    site: (id) => `/dashboard/sites/${id}`,
    vacation: (id) => `/dashboard/vacations/${id}`,
    incident: (id) => `/dashboard/incidents/${id}`,
    user: (id) => `/dashboard/users/${id}`,
    // billing/system => pas de détail
  };

  const fn = routeMap[entityType];
  return fn ? fn(entityId) : null;
}

const ENTITY_TYPES = [
  { value: "all", label: "Toutes" },
  { value: "agent", label: "Agents" },
  { value: "site", label: "Sites" },
  { value: "vacation", label: "Vacations" },
  { value: "incident", label: "Incidents" },
  { value: "user", label: "Utilisateurs" },
  { value: "billing", label: "Billing" },
  { value: "system", label: "Système" },
] as const;

const ACTIONS = [
  { value: "all", label: "Toutes" },

  // Agents
  { value: "agent.created", label: "Agent créé" },
  { value: "agent.updated", label: "Agent mis à jour" },
  { value: "agent.activated", label: "Agent activé" },
  { value: "agent.deactivated", label: "Agent désactivé" },

  // Sites
  { value: "site.created", label: "Site créé" },
  { value: "site.updated", label: "Site mis à jour" },
  { value: "site.archived", label: "Site archivé" },

  // Vacations / Assignments
  { value: "vacation.created", label: "Vacation créée" },
  { value: "vacation.updated", label: "Vacation mise à jour" },
  { value: "vacation.cancelled", label: "Vacation annulée" },
  { value: "assignment.synced", label: "Affectations synchronisées" },

  // Incidents
  { value: "incident.created", label: "Incident créé" },
  { value: "incident.updated", label: "Incident mis à jour" },
  { value: "incident.closed", label: "Incident clôturé" },

  // Billing / System
  { value: "billing.limit_reached", label: "Limite atteinte" },
  { value: "system.info", label: "Info système" },
] as const;

export default function ActivityPage() {
  const [entityType, setEntityType] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [limit, setLimit] = useState<number>(20);

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [canPaginate, setCanPaginate] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));

    if (entityType && entityType !== "all") p.set("entityType", entityType);
    if (action && action !== "all") p.set("action", action);

    return p.toString();
  }, [action, entityType, limit]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((it) => {
      const hay = `${it.message ?? ""} ${it.actorEmail ?? ""} ${it.action ?? ""} ${it.entityType ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  const hasMore = useMemo(
    () => !!cursor && canPaginate && items.length > 0,
    [cursor, canPaginate, items.length]
  );

  async function loadFirstPage() {
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<PagedRes>(`/api/activity?${qs}`);
      if (!res?.ok) {
        setItems([]);
        setCursor(null);
        setCanPaginate(false);
        setError(res?.error ?? "Impossible de charger l’activité.");
        return;
      }

      const list = Array.isArray(res.items) ? res.items : [];
      setItems(list);
      setCursor(res.nextCursor ?? (list.length ? list[list.length - 1].id : null));
      setCanPaginate(list.length >= limit && !!(res.nextCursor ?? (list.length ? list[list.length - 1].id : null)));
    } catch (e: any) {
      setItems([]);
      setCursor(null);
      setCanPaginate(false);
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
      const res = await apiFetch<PagedRes>(
        `/api/activity?${qs}&cursor=${encodeURIComponent(cursor)}`
      );

      if (!res?.ok) {
        setError(res?.error ?? "Impossible de charger plus d’activité.");
        return;
      }

      const next = Array.isArray(res.items) ? res.items : [];

      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...next.filter((x) => !seen.has(x.id))];
      });

      const nextCursor = res.nextCursor ?? (next.length ? next[next.length - 1].id : null);
      setCursor(nextCursor);
      setCanPaginate(next.length >= limit && !!nextCursor);
    } catch (e: any) {
      setError(e?.message ?? "Erreur lors du chargement.");
    } finally {
      setLoadingMore(false);
    }
  }

  // reload on filters change
  useEffect(() => {
    loadFirstPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activité</h1>
          <p className="text-sm text-muted-foreground">
            Historique des actions sur vos agents, sites, vacations et incidents.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadFirstPage} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Rafraîchir
          </Button>
          <Button asChild>
            <Link href="/dashboard">Retour au dashboard</Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-3xl">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtres
          </CardTitle>

          <div className="text-xs text-muted-foreground">
            Les filtres sont appliqués côté API (tenant + type + action).
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <div className="text-xs font-medium text-muted-foreground mb-2">Type</div>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-1">
              <div className="text-xs font-medium text-muted-foreground mb-2">Action</div>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-1">
              <div className="text-xs font-medium text-muted-foreground mb-2">Par page</div>
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger className="rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-1">
              <div className="text-xs font-medium text-muted-foreground mb-2">Recherche</div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 rounded-2xl"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="message, email, action…"
                />
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                La recherche est locale (sur la page chargée).
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="rounded-3xl">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Flux d’activité</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              {filteredItems.length} élément(s) affiché(s)
              {search.trim() ? " (filtrés)" : ""}.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={!hasMore || loadingMore || loading}
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
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement de l’activité…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
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
          ) : filteredItems.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">
              Aucune activité à afficher (avec ces filtres).
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((it) => {
                const href = getEntityHref(it.entityType, it.entityId);
                const role = roleLabel(it.actorRole);
                const sev = sevBadge(it.severity);

                return (
                  <div key={it.id} className="rounded-2xl border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("mt-1 h-2.5 w-2.5 rounded-full", sevDot(it.severity))} />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium leading-snug">
                            {it.message ?? "—"}
                          </div>
                          <Badge variant={sev.variant} className="rounded-full">
                            {sev.label}
                          </Badge>
                          {it.action ? (
                            <Badge variant="outline" className="rounded-full text-xs">
                              {it.action}
                            </Badge>
                          ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
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
                          {it.entityType ? (
                            <>
                              <span>•</span>
                              <span>{it.entityType}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      {href ? (
                        <Button asChild variant="outline" size="sm" className="rounded-full">
                          <Link href={href} className="inline-flex items-center">
                            Voir <ChevronRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="rounded-full" disabled>
                          Voir <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="pt-2 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {hasMore ? "Plus d’éléments disponibles." : "Fin du flux."}
                </div>

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
        </CardContent>
      </Card>
    </div>
  );
}
