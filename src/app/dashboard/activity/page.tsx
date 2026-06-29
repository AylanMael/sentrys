// src/app/dashboard/activity/page.tsx
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
  Activity,
  ArrowLeft
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
  if (sev === "critical") return "bg-destructive border-destructive/20 ring-destructive/10";
  if (sev === "warning") return "bg-orange-500 border-orange-500/20 ring-orange-500/10";
  return "bg-primary border-primary/20 ring-primary/10";
}

function sevBadge(sev: ActivityItem["severity"]) {
  if (sev === "critical") return { variant: "destructive" as const, label: "Critique" };
  if (sev === "warning") return { variant: "outline" as const, label: "Alerte", className: "text-orange-600 border-orange-200 bg-orange-50" };
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
  };
  const fn = routeMap[entityType];
  return fn ? fn(entityId) : null;
}

const ENTITY_TYPES = [
  { value: "all", label: "Toutes les entités" },
  { value: "agent", label: "Agents" },
  { value: "site", label: "Sites" },
  { value: "vacation", label: "Vacations" },
  { value: "incident", label: "Incidents" },
  { value: "user", label: "Utilisateurs" },
  { value: "billing", label: "Abonnement (Billing)" },
  { value: "system", label: "Système" },
] as const;

const ACTIONS = [
  { value: "all", label: "Toutes les actions" },
  { value: "agent.created", label: "Agent créé" },
  { value: "agent.updated", label: "Agent mis à jour" },
  { value: "agent.activated", label: "Agent activé" },
  { value: "agent.deactivated", label: "Agent désactivé" },
  { value: "site.created", label: "Site créé" },
  { value: "site.updated", label: "Site mis à jour" },
  { value: "site.archived", label: "Site archivé" },
  { value: "vacation.created", label: "Vacation créée" },
  { value: "vacation.updated", label: "Vacation mise à jour" },
  { value: "vacation.cancelled", label: "Vacation annulée" },
  { value: "assignment.synced", label: "Affectations synchronisées" },
  { value: "incident.created", label: "Incident créé" },
  { value: "incident.updated", label: "Incident mis à jour" },
  { value: "incident.closed", label: "Incident clôturé" },
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
        setItems([]); setCursor(null); setCanPaginate(false);
        setError(res?.error ?? "Impossible de charger l’activité.");
        return;
      }
      const list = Array.isArray(res.items) ? res.items : [];
      setItems(list);
      setCursor(res.nextCursor ?? (list.length ? list[list.length - 1].id : null));
      setCanPaginate(list.length >= limit && !!(res.nextCursor ?? (list.length ? list[list.length - 1].id : null)));
    } catch (e: any) {
      setItems([]); setCursor(null); setCanPaginate(false);
      setError(e?.message ?? "Erreur lors du chargement.");
    } finally { setLoading(false); }
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await apiFetch<PagedRes>(`/api/activity?${qs}&cursor=${encodeURIComponent(cursor)}`);
      if (!res?.ok) { setError(res?.error ?? "Impossible de charger plus d’activité."); return; }
      const next = Array.isArray(res.items) ? res.items : [];
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...next.filter((x) => !seen.has(x.id))];
      });
      const nextCursor = res.nextCursor ?? (next.length ? next[next.length - 1].id : null);
      setCursor(nextCursor);
      setCanPaginate(next.length >= limit && !!nextCursor);
    } catch (e: any) { setError(e?.message ?? "Erreur lors du chargement."); } finally { setLoadingMore(false); }
  }

  useEffect(() => { loadFirstPage(); }, [qs]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-10 max-w-[1600px] mx-auto w-full">

      {/* ===================== HEADER ===================== */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-card p-6 md:p-8 rounded-[2rem] border shadow-sm ring-1 ring-black/5 bg-gradient-to-br from-card to-muted/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-5">
          <div className="bg-primary shadow-xl shadow-primary/20 p-4 rounded-2xl">
            <Activity className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Badge variant="outline" className="bg-background text-[10px] font-black uppercase tracking-widest py-1 px-3 rounded-full border-muted-foreground/30">
                Audit Log
              </Badge>
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-foreground">
              Historique d'Activité
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <Button variant="outline" onClick={loadFirstPage} className="h-11 rounded-xl px-5 font-bold border-muted-foreground/20 hover:bg-muted transition-all">
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Actualiser
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-xl px-5 font-bold border-muted-foreground/20 hover:bg-muted transition-all">
            <Link href="/dashboard"><ArrowLeft className="h-4 w-4 mr-2" /> Retour</Link>
          </Button>
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-black/[0.03] overflow-hidden bg-background ring-1 ring-black/5">

        {/* ===================== FILTRES ===================== */}
        <div className="p-6 md:p-8 border-b border-border/50 bg-muted/10 flex flex-col xl:flex-row gap-4 xl:items-center justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Recherche textuelle locale (email, action...)"
              className="pl-12 h-12 rounded-2xl bg-card border-border/50 font-medium text-base shadow-sm focus-visible:ring-primary/30"
            />
          </div>

          <div className="w-full xl:w-auto flex flex-col sm:flex-row items-center gap-3">
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger className="w-full sm:w-[220px] h-12 rounded-2xl bg-card border-border/50 font-bold shadow-sm">
                <SelectValue placeholder="Type d'entité" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border shadow-2xl">
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="font-medium">{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-full sm:w-[220px] h-12 rounded-2xl bg-card border-border/50 font-bold shadow-sm">
                <SelectValue placeholder="Action précise" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border shadow-2xl">
                {ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value} className="font-medium">{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger className="w-full sm:w-[120px] h-12 rounded-2xl bg-card border-border/50 font-bold shadow-sm">
                <SelectValue placeholder="Limite" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border shadow-2xl">
                <SelectItem value="10" className="font-medium">10 / page</SelectItem>
                <SelectItem value="20" className="font-medium">20 / page</SelectItem>
                <SelectItem value="50" className="font-medium">50 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ===================== LISTE (TIMELINE) ===================== */}
        <CardContent className="p-0">
          {loading ? (
             <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
               <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
               <p className="text-xs font-semibold uppercase tracking-widest">Recherche des logs...</p>
             </div>
          ) : error ? (
            <div className="m-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-6 flex flex-col items-center text-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm font-bold text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={loadFirstPage} className="mt-2 bg-background">Réessayer</Button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="bg-muted p-6 rounded-full mb-4">
                <Filter className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">Aucune activité trouvée</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                Il n'y a pas de logs correspondant à ces filtres pour le moment.
              </p>
            </div>
          ) : (
            <div className="p-6 md:p-8">
              <div className="relative border-l-2 border-muted-foreground/20 ml-4 space-y-8 pb-4">
                {filteredItems.map((it, idx) => {
                  const href = getEntityHref(it.entityType, it.entityId);
                  const role = roleLabel(it.actorRole);
                  const sev = sevBadge(it.severity);

                  return (
                    <div key={it.id} className="relative pl-8 sm:pl-10 group">
                      {/* Point sur la ligne du temps */}
                      <div className={cn("absolute -left-[11px] top-1.5 h-5 w-5 rounded-full border-4 ring-4 ring-background", sevDot(it.severity))} />

                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-5 rounded-2xl border border-border/50 bg-card hover:bg-muted/30 transition-colors shadow-sm group-hover:shadow-md">
                        <div className="space-y-3 flex-1 min-w-0">

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={sev.variant} className={cn("text-[10px] font-black uppercase tracking-widest", sev.className)}>
                              {sev.label}
                            </Badge>
                            {it.action && (
                              <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground bg-muted/50 border-border/50">
                                {it.action}
                              </Badge>
                            )}
                            <span className="text-xs font-semibold text-muted-foreground ml-auto sm:ml-2">
                              {when(it.createdAtIso)}
                            </span>
                          </div>

                          <p className="text-base font-medium text-foreground leading-snug">
                            {it.message ?? "Action non détaillée"}
                          </p>

                          <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/50 w-fit">
                            <span className="text-foreground">{it.actorEmail ?? "Système / Inconnu"}</span>
                            {role && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                <span className="uppercase tracking-widest text-[10px] font-black">{role}</span>
                              </>
                            )}
                            {it.entityType && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                                <span>Entité : <strong className="text-foreground capitalize">{it.entityType}</strong></span>
                              </>
                            )}
                          </div>
                        </div>

                        {href && (
                          <div className="shrink-0 mt-2 sm:mt-0">
                            <Button asChild variant="ghost" className="h-10 rounded-xl px-4 font-semibold text-primary hover:bg-primary/10">
                              <Link href={href}>
                                Consulter <ChevronRight className="ml-1 h-4 w-4" />
                              </Link>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PAGINATION BOTTOM */}
              <div className="mt-8 pt-8 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-sm font-semibold text-muted-foreground">
                  <strong className="text-foreground">{filteredItems.length}</strong> événements affichés
                </p>
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={!hasMore || loadingMore}
                  className="h-12 rounded-xl px-8 font-bold shadow-sm w-full sm:w-auto"
                >
                  {loadingMore ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement...</>
                  ) : hasMore ? (
                    "Charger les précédents"
                  ) : (
                    "Fin de l'historique"
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
