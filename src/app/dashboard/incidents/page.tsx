"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Siren,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-provider";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";
import { useAppFeedback } from "@/hooks/use-app-feedback";

type IncidentStatus = "open" | "investigating" | "resolved" | "closed";
type IncidentSeverity = "low" | "medium" | "high" | "critical";
type IncidentFilter = "all" | "critical" | IncidentStatus;

type IncidentRow = {
  id: string;
  title: string | null;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  siteId: string | null;
  tags?: string[];
  createdAtIso: string | null;
  updatedAtIso: string | null;
};

type SiteRow = {
  id: string;
  name?: string | null;
  address?: string | null;
  city?: string | null;
};

type IncidentsListResponse = {
  ok: boolean;
  incidents?: IncidentRow[];
};

type SitesListResponse = {
  ok: boolean;
  sites?: SiteRow[];
  items?: SiteRow[];
};

type IncidentCreateResponse = {
  ok: boolean;
  incident?: IncidentRow;
};

type IncidentPatchResponse = {
  ok: boolean;
  incident?: IncidentRow;
};

type QuickStatusAction = {
  status: IncidentStatus;
  label: string;
  loadingLabel: string;
  className: string;
};

const STATUS_OPTIONS: Array<{ id: IncidentFilter; label: string }> = [
  { id: "all", label: "Tous" },
  { id: "critical", label: "Critiques" },
  { id: "open", label: "Ouverts" },
  { id: "investigating", label: "En cours" },
  { id: "resolved", label: "Resolus" },
  { id: "closed", label: "Clos" },
];

const SEVERITY_OPTIONS: Array<{ value: IncidentSeverity; label: string; detail: string }> = [
  { value: "low", label: "Faible", detail: "Information ou anomalie mineure" },
  { value: "medium", label: "Moyenne", detail: "A surveiller et documenter" },
  { value: "high", label: "Elevee", detail: "Prioritaire pour l'exploitation" },
  { value: "critical", label: "Critique", detail: "Action immediate requise" },
];

function normalizeStatus(value: unknown): IncidentStatus {
  const status = String(value ?? "").toLowerCase().trim();
  if (status === "investigating" || status === "resolved" || status === "closed") {
    return status;
  }
  return "open";
}

function normalizeSeverity(value: unknown): IncidentSeverity {
  const severity = String(value ?? "").toLowerCase().trim();
  if (severity === "low" || severity === "high" || severity === "critical") {
    return severity;
  }
  return "medium";
}

function statusLabel(status: IncidentStatus) {
  if (status === "investigating") return "En cours";
  if (status === "resolved") return "Resolu";
  if (status === "closed") return "Clos";
  return "Ouvert";
}

function severityLabel(severity: IncidentSeverity) {
  if (severity === "critical") return "Critique";
  if (severity === "high") return "Elevee";
  if (severity === "low") return "Faible";
  return "Moyenne";
}

function statusClass(status: IncidentStatus) {
  if (status === "closed") {
    return "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300";
  }
  if (status === "resolved") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "investigating") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
}

function severityClass(severity: IncidentSeverity) {
  if (severity === "critical") {
    return "border-red-600/30 bg-red-600/10 text-red-700 dark:text-red-300";
  }
  if (severity === "high") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  }
  if (severity === "low") {
    return "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300";
  }
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function incidentTimestamp(incident: IncidentRow) {
  const value = incident.updatedAtIso || incident.createdAtIso;
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function sortIncidents(list: IncidentRow[]) {
  return [...list].sort((a, b) => incidentTimestamp(b) - incidentTimestamp(a));
}

function formatMoment(iso: string | null) {
  if (!iso) return "Non horodate";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date invalide";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function cleanIncident(raw: IncidentRow): IncidentRow {
  return {
    ...raw,
    title: raw.title ?? "Incident terrain",
    description: raw.description ?? "",
    siteId: raw.siteId ?? null,
    status: normalizeStatus(raw.status),
    severity: normalizeSeverity(raw.severity),
    createdAtIso: raw.createdAtIso ?? null,
    updatedAtIso: raw.updatedAtIso ?? null,
  };
}

function quickStatusAction(incident: IncidentRow): QuickStatusAction | null {
  if (incident.status === "open") {
    return {
      status: "investigating",
      label: "Prendre en charge",
      loadingLabel: "Prise en charge...",
      className:
        "border-amber-500/35 bg-amber-500/10 text-amber-800 hover:bg-amber-500/15 dark:text-amber-200",
    };
  }

  if (incident.status === "investigating") {
    return {
      status: "resolved",
      label: "Marquer resolu",
      loadingLabel: "Resolution...",
      className:
        "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-200",
    };
  }

  if (incident.status === "resolved") {
    return {
      status: "closed",
      label: "Clore",
      loadingLabel: "Cloture...",
      className:
        "border-slate-500/30 bg-slate-500/10 text-slate-800 hover:bg-slate-500/15 dark:text-slate-200",
    };
  }

  return null;
}

function quickStatusSuccessTitle(status: IncidentStatus) {
  if (status === "investigating") return "Incident pris en charge";
  if (status === "resolved") return "Incident marque resolu";
  if (status === "closed") return "Incident clos";
  return "Incident mis à jour";
}

function IncidentsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 rounded-[2rem]" />
      <div className="grid gap-4 md:grid-cols-4">
        <Skeleton className="h-28 rounded-[1.5rem]" />
        <Skeleton className="h-28 rounded-[1.5rem]" />
        <Skeleton className="h-28 rounded-[1.5rem]" />
        <Skeleton className="h-28 rounded-[1.5rem]" />
      </div>
      <Skeleton className="h-96 rounded-[2rem]" />
    </div>
  );
}

export default function IncidentsPage() {
  const { loading: authLoading } = useAuth();
  const feedback = useAppFeedback();

  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [queryText, setQueryText] = useState("");
  const [filter, setFilter] = useState<IncidentFilter>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSiteId, setNewSiteId] = useState("");
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>("medium");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingIncidentId, setUpdatingIncidentId] = useState<string | null>(null);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [reportedLat, setReportedLat] = useState<number | null>(null);
  const [reportedLng, setReportedLng] = useState<number | null>(null);

  const siteById = useMemo(() => {
    return new Map(sites.map((site) => [site.id, site]));
  }, [sites]);

  const selectedSite = useMemo(() => {
    return sites.find((site) => site.id === newSiteId) ?? null;
  }, [newSiteId, sites]);

  const stats = useMemo(() => {
    const critical = incidents.filter((incident) => incident.severity === "critical").length;
    const active = incidents.filter(
      (incident) => incident.status === "open" || incident.status === "investigating"
    ).length;
    const resolved = incidents.filter((incident) => incident.status === "resolved").length;
    const closed = incidents.filter((incident) => incident.status === "closed").length;

    return {
      total: incidents.length,
      critical,
      active,
      resolved,
      closed,
    };
  }, [incidents]);

  const situation = useMemo(() => {
    if (stats.critical > 0) {
      return {
        title: "Priorite critique",
        detail: `${stats.critical} incident(s) critique(s) à traiter avant toute autre action.`,
        tone: "danger" as const,
      };
    }

    if (stats.active > 0) {
      return {
        title: "Suivi opérationnel",
        detail: `${stats.active} incident(s) ouvert(s) ou en cours attendent une décision.`,
        tone: "warning" as const,
      };
    }

    return {
      title: "Situation maîtrisée",
      detail: "Aucun incident actif dans le périmètre charge.",
      tone: "success" as const,
    };
  }, [stats.active, stats.critical]);

  const filterItems = useMemo(() => {
    return STATUS_OPTIONS.map((item) => {
      let count = incidents.length;
      if (item.id === "critical") {
        count = incidents.filter((incident) => incident.severity === "critical").length;
      } else if (item.id !== "all") {
        count = incidents.filter((incident) => incident.status === item.id).length;
      }

      return { ...item, count };
    });
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    const filteredByStatus = incidents.filter((incident) => {
      if (filter === "all") return true;
      if (filter === "critical") return incident.severity === "critical";
      return incident.status === filter;
    });

    const q = queryText.trim().toLowerCase();
    if (!q) return filteredByStatus;

    return filteredByStatus.filter((incident) => {
      const site = incident.siteId ? siteById.get(incident.siteId) : null;
      const haystack = [
        site?.name,
        site?.city,
        incident.title,
        incident.description,
        severityLabel(incident.severity),
        statusLabel(incident.status),
        ...(incident.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [filter, incidents, queryText, siteById]);

  const resetCreateForm = useCallback(() => {
    setNewSiteId("");
    setNewSeverity("medium");
    setDescription("");
    setReportedLat(null);
    setReportedLng(null);
    setCapturingLocation(false);
  }, []);

  const loadData = useCallback(
    async (options: { quiet?: boolean; refresh?: boolean } = {}) => {
      if (authLoading) return;

      if (options.refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const [incidentsResponse, sitesResponse] = await Promise.all([
          apiFetch<IncidentsListResponse>("/api/incidents?max=200"),
          apiFetch<SitesListResponse>("/api/sites?max=200"),
        ]);

        const nextSites = sitesResponse.sites ?? sitesResponse.items ?? [];
        const nextIncidents = sortIncidents((incidentsResponse.incidents ?? []).map(cleanIncident));

        setSites(nextSites);
        setIncidents(nextIncidents);
        setLastSync(new Date());

        if (!options.quiet) {
          feedback.info(
            "Incidents synchronises",
            `${nextIncidents.length} incident(s), ${nextSites.length} site(s) opérationnel(s).`
          );
        }
      } catch (err) {
        const message = getApiErrorMessage(err, "Impossible de charger les incidents.");
        setError(message);
        feedback.error(err, {
          title: "Incidents indisponibles",
          fallback: message,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authLoading, feedback]
  );

  useEffect(() => {
    void loadData({ quiet: true });
  }, [loadData]);

  const captureLocation = useCallback(() => {
    if (!navigator.geolocation) {
      feedback.warning("Position non disponible", "Le navigateur ne permet pas la geolocalisation.");
      return;
    }

    setCapturingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReportedLat(position.coords.latitude);
        setReportedLng(position.coords.longitude);
        setCapturingLocation(false);
        feedback.success("Position ajoutee", "La position terrain sera jointe a la declaration.");
      },
      () => {
        setCapturingLocation(false);
        feedback.warning("Position non ajoutee", "Vous pouvez declarer l'incident sans coordonnées GPS.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [feedback]);

  async function updateIncidentStatus(incident: IncidentRow, status: IncidentStatus) {
    if (updatingIncidentId) return;

    const site = incident.siteId ? siteById.get(incident.siteId) : null;
    setUpdatingIncidentId(incident.id);

    try {
      const response = await apiFetch<IncidentPatchResponse>(`/api/incidents/${incident.id}`, {
        method: "PATCH",
        body: { status },
      });

      if (response.incident) {
        const nextIncident = cleanIncident(response.incident);
        setIncidents((current) =>
          sortIncidents(current.map((item) => (item.id === incident.id ? nextIncident : item)))
        );
        setLastSync(new Date());
      } else {
        await loadData({ quiet: true });
      }

      feedback.success(
        quickStatusSuccessTitle(status),
        `${site?.name ?? "Site"} : la main courante est mise à jour et tracée.`
      );
    } catch (err) {
      feedback.error(err, {
        title: "Traitement impossible",
        fallback: "Le statut de l'incident n'a pas pu être mis à jour.",
      });
    } finally {
      setUpdatingIncidentId(null);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newSiteId || !description.trim()) {
      feedback.warning("Declaration incomplète", "Choisissez un site et decrivez les faits.");
      return;
    }

    setSaving(true);

    try {
      await apiFetch<IncidentCreateResponse>("/api/incidents", {
        method: "POST",
        body: {
          title: `Incident - ${selectedSite?.name ?? "site"}`,
          description: description.trim(),
          severity: newSeverity,
          status: "open",
          siteId: newSiteId,
          tags: [],
          reportedLat,
          reportedLng,
        },
      });

      feedback.success(
        "Incident enregistre",
        `${selectedSite?.name ?? "Site"} passe dans la conduite opérationnelle.`
      );
      setDialogOpen(false);
      resetCreateForm();
      await loadData({ quiet: true });
    } catch (err) {
      feedback.error(err, {
        title: "Declaration impossible",
        fallback: "Vérifiez le site, la description et vos droits.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <IncidentsSkeleton />;
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 px-4 pb-20 md:px-0">
      <section className="relative overflow-hidden rounded-[2rem] border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-8 text-white shadow-2xl shadow-slate-950/10 md:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-red-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-cyan-400/10 blur-2xl" />

        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge className="mb-5 border-white/10 bg-white/10 text-[10px] font-black uppercase tracking-[0.25em] text-white hover:bg-white/10">
              Main courante exploitation
            </Badge>
            <div className="flex items-start gap-5">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-4 shadow-xl">
                <Siren className="h-8 w-8 text-red-200" />
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-tight md:text-5xl">
                  Incidents terrain
                </h1>
                <p className="mt-3 max-w-2xl text-base font-medium leading-relaxed text-slate-300">
                  Prioriser, traiter et documenter les signaux terrain sans perdre le fil
                  exploitation.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="h-12 rounded-2xl bg-white/10 px-5 font-black text-white hover:bg-white/20"
              disabled={refreshing}
              onClick={() => void loadData({ refresh: true })}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Actualiser
            </Button>

            <Dialog
              open={dialogOpen}
              onOpenChange={(next) => {
                setDialogOpen(next);
                if (!next) resetCreateForm();
              }}
            >
              <DialogTrigger asChild>
                <Button className="h-12 rounded-2xl px-5 font-black shadow-xl shadow-red-950/20">
                  <PlusCircle className="h-4 w-4" />
                  Nouvel incident
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl rounded-[2rem] p-0">
                <DialogHeader className="border-b bg-muted/30 p-8">
                  <DialogTitle className="flex items-center gap-3 text-2xl font-black">
                    <ShieldAlert className="h-6 w-6 text-red-600" />
                    Declarer un incident
                  </DialogTitle>
                  <DialogDescription className="font-medium">
                    Une declaration courte, propre et exploitable vaut mieux qu'un long
                    rapport flou. Le detail pourra être enrichi ensuite.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCreate} className="space-y-6 p-8">
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Site concerné</Label>
                      <Select value={newSiteId} onValueChange={setNewSiteId}>
                        <SelectTrigger className="h-12 rounded-xl">
                          <SelectValue placeholder="Choisir un site" />
                        </SelectTrigger>
                        <SelectContent>
                          {sites.map((site) => (
                            <SelectItem key={site.id} value={site.id}>
                              {site.name ?? "Site sans nom"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Gravite</Label>
                      <Select
                        value={newSeverity}
                        onValueChange={(value) => setNewSeverity(value as IncidentSeverity)}
                      >
                        <SelectTrigger className="h-12 rounded-xl">
                          <SelectValue placeholder="Choisir la gravité" />
                        </SelectTrigger>
                        <SelectContent>
                          {SEVERITY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label} - {option.detail}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Faits constatés</Label>
                    <Textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={6}
                      className="rounded-xl"
                      placeholder="Exemple : altercation a l'accueil, appel du responsable site, agent reste en surveillance..."
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-3 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-black">Position terrain optionnelle</p>
                      <p className="text-sm font-medium text-muted-foreground">
                        Utile si l'incident est declare depuis le site.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl font-black"
                      onClick={captureLocation}
                      disabled={capturingLocation}
                    >
                      {capturingLocation ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MapPin className="h-4 w-4" />
                      )}
                      {reportedLat && reportedLng ? "Position ajoutee" : "Ajouter ma position"}
                    </Button>
                  </div>

                  <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-xl font-black"
                      onClick={() => setDialogOpen(false)}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-xl font-black"
                      disabled={saving || !newSiteId || !description.trim()}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Enregistrer
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          tone="danger"
          title="Incidents indisponibles"
          description={error}
          action={
            <Button className="rounded-xl font-black" onClick={() => void loadData({ refresh: true })}>
              Reessayer
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-[1.5rem] border-slate-200/70">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                Total
              </p>
              <p className="mt-2 text-3xl font-black">{stats.total}</p>
            </div>
            <FileText className="h-7 w-7 text-slate-400" />
          </CardContent>
        </Card>
        <Card className="rounded-[1.5rem] border-red-500/25 bg-red-500/5">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-700 dark:text-red-300">
                Critiques
              </p>
              <p className="mt-2 text-3xl font-black text-red-700 dark:text-red-300">
                {stats.critical}
              </p>
            </div>
            <ShieldAlert className="h-7 w-7 text-red-500" />
          </CardContent>
        </Card>
        <Card className="rounded-[1.5rem] border-amber-500/25 bg-amber-500/5">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                A traiter
              </p>
              <p className="mt-2 text-3xl font-black text-amber-700 dark:text-amber-300">
                {stats.active}
              </p>
            </div>
            <Clock3 className="h-7 w-7 text-amber-500" />
          </CardContent>
        </Card>
        <Card className="rounded-[1.5rem] border-emerald-500/25 bg-emerald-500/5">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                Resolus / clos
              </p>
              <p className="mt-2 text-3xl font-black text-emerald-700 dark:text-emerald-300">
                {stats.resolved + stats.closed}
              </p>
            </div>
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </CardContent>
        </Card>
      </div>

      <Card className={cn("rounded-[1.5rem] border p-0", statusClass(stats.critical > 0 ? "open" : stats.active > 0 ? "investigating" : "resolved"))}>
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] opacity-70">
              Lecture exploitation
            </p>
            <h2 className="mt-2 text-2xl font-black">{situation.title}</h2>
            <p className="mt-1 font-medium opacity-80">{situation.detail}</p>
            <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] opacity-60">
              Chaque action est journalisee avec date, utilisateur et changement de statut.
            </p>
          </div>
          <div className="text-sm font-black opacity-75">
            Derniere synchro :{" "}
            {lastSync
              ? new Intl.DateTimeFormat("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }).format(lastSync)
              : "jamais"}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[2rem]">
        <div className="flex flex-col gap-4 border-b bg-muted/20 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {filterItems.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={filter === item.id ? "default" : "outline"}
                className="rounded-xl font-black"
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                <Badge
                  className={cn(
                    "ml-1 border-none",
                    filter === item.id
                      ? "bg-white/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {item.count}
                </Badge>
              </Button>
            ))}
          </div>

          <div className="relative w-full xl:w-[360px]">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="Rechercher site, statut, gravité..."
              className="h-12 rounded-xl pl-11 font-bold"
            />
          </div>
        </div>

        {sites.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={MapPin}
              tone="warning"
              title="Aucun site opérationnel charge"
              description="Un incident doit être rattaché a un site pour rester exploitable."
              action={
                <Button asChild className="rounded-xl font-black">
                  <Link href="/dashboard/sites">Ouvrir les sites</Link>
                </Button>
              }
            />
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Siren}
              tone={incidents.length === 0 ? "success" : "neutral"}
              title={incidents.length === 0 ? "Aucun incident declare" : "Aucun incident dans ce filtre"}
              description={
                incidents.length === 0
                  ? "La main courante incidents est propre. Vous pouvez declarer le premier signal terrain si necessaire."
                  : "Essayez un autre filtre ou une recherche moins precise."
              }
              action={
                <Button className="rounded-xl font-black" onClick={() => setDialogOpen(true)}>
                  Declarer un incident
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[220px] pl-6">Site</TableHead>
                  <TableHead className="min-w-[360px]">Incident</TableHead>
                  <TableHead>Gravite</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="min-w-[180px]">Mise à jour</TableHead>
                  <TableHead className="min-w-[280px] pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncidents.map((incident) => {
                  const site = incident.siteId ? siteById.get(incident.siteId) : null;
                  const siteLabel = site?.name ?? "Site inconnu";
                  const quickAction = quickStatusAction(incident);
                  const isUpdating = updatingIncidentId === incident.id;

                  return (
                    <TableRow key={incident.id} className="group">
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-black">{siteLabel}</p>
                            <p className="text-xs font-medium text-muted-foreground">
                              {site?.city || site?.address || "Localisation non renseignée"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xl">
                          <p className="font-black tracking-tight text-foreground">
                            {incident.title || "Incident terrain"}
                          </p>
                          <p className="mt-1 line-clamp-2 text-sm font-medium leading-relaxed text-muted-foreground">
                            {incident.description || "Aucun detail renseigné."}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("font-black", severityClass(incident.severity))}>
                          {severityLabel(incident.severity)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("font-black", statusClass(incident.status))}>
                          {statusLabel(incident.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-muted-foreground">
                        {formatMoment(incident.updatedAtIso || incident.createdAtIso)}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex flex-col items-stretch justify-end gap-2 sm:flex-row sm:items-center">
                          {quickAction ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn("rounded-xl font-black", quickAction.className)}
                              disabled={Boolean(updatingIncidentId)}
                              onClick={() => void updateIncidentStatus(incident, quickAction.status)}
                            >
                              {isUpdating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : quickAction.status === "resolved" ? (
                                <CheckCircle2 className="h-4 w-4" />
                              ) : quickAction.status === "closed" ? (
                                <FileText className="h-4 w-4" />
                              ) : (
                                <Clock3 className="h-4 w-4" />
                              )}
                              {isUpdating ? quickAction.loadingLabel : quickAction.label}
                            </Button>
                          ) : (
                            <Badge variant="outline" className="rounded-xl px-3 py-1.5 font-black text-muted-foreground">
                              Traite
                            </Badge>
                          )}

                          <Button asChild size="sm" className="rounded-xl font-black">
                            <Link href={`/dashboard/incidents/${incident.id}`}>
                              Ouvrir
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
