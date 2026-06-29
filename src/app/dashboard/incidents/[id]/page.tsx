// src/app/dashboard/incidents/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  MessageSquarePlus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";

import { IncidentComments } from "@/components/incidents/incident-comments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppFeedback } from "@/hooks/use-app-feedback";
import { useAuth } from "@/lib/auth-provider";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client-fetch";
import { canManageIncidents, normalizeRole } from "@/lib/auth/role";
import { cn } from "@/lib/utils";

type IncidentStatus = "open" | "investigating" | "resolved" | "closed";
type IncidentSeverity = "low" | "medium" | "high" | "critical";

type IncidentRow = {
  id: string;
  tenantId: string;
  title: string | null;
  description: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  siteId: string | null;
  vacationId: string | null;
  agentId: string | null;
  tags: string[];
  createdBy: string | null;
  updatedBy: string | null;
  createdAtIso: string | null;
  updatedAtIso: string | null;
};

type IncidentResponse = {
  ok: boolean;
  incident: IncidentRow;
};

type SiteRow = {
  id: string;
  name?: string | null;
  address?: string | null;
  city?: string | null;
};

type SitesResponse = {
  ok: boolean;
  sites?: SiteRow[];
};

const STATUS_FLOW: Array<{
  status: IncidentStatus;
  label: string;
  detail: string;
}> = [
  {
    status: "open",
    label: "Ouvert",
    detail: "Le signal est connu, mais pas encore pris en charge.",
  },
  {
    status: "investigating",
    label: "En cours",
    detail: "Un responsable traite le dossier et suit les actions terrain.",
  },
  {
    status: "resolved",
    label: "Resolu",
    detail: "La situation est reglee, il reste a cloturer proprement.",
  },
  {
    status: "closed",
    label: "Clos",
    detail: "Le dossier est termine et conserve pour historique.",
  },
];

function statusLabel(status: IncidentStatus) {
  return STATUS_FLOW.find((item) => item.status === status)?.label ?? "Ouvert";
}

function statusClass(status: IncidentStatus) {
  if (status === "closed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "resolved") return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  if (status === "investigating") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
}

function severityLabel(severity: IncidentSeverity) {
  if (severity === "critical") return "Critique";
  if (severity === "high") return "Elevee";
  if (severity === "medium") return "Moyenne";
  return "Faible";
}

function severityClass(severity: IncidentSeverity) {
  if (severity === "critical") return "border-red-600/40 bg-red-600/15 text-red-700 dark:text-red-200";
  if (severity === "high") return "border-orange-500/35 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  if (severity === "medium") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function formatMoment(value: string | null) {
  if (!value) return "Non renseigne";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Non renseigne";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isTerminalStatus(status: IncidentStatus) {
  return status === "closed";
}

function nextRecommendedStatus(status: IncidentStatus): IncidentStatus {
  if (status === "open") return "investigating";
  if (status === "investigating") return "resolved";
  if (status === "resolved") return "closed";
  return "investigating";
}

function siteDisplay(site: SiteRow | null, incident: IncidentRow | null) {
  if (site?.name) return site.name;
  if (incident?.siteId) return `Site ${incident.siteId.slice(0, 8)}`;
  return "Site non renseigne";
}

function IncidentSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-10">
      <Skeleton className="h-52 rounded-[2rem]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-96 rounded-[2rem]" />
        <Skeleton className="h-96 rounded-[2rem]" />
      </div>
    </div>
  );
}

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const feedback = useAppFeedback();
  const { user, loading: authLoading } = useAuth();

  const incidentId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const currentRole = normalizeRole(user?.role);
  const canWrite = canManageIncidents(currentRole);
  const tenantId = user?.tenantId ?? null;

  const [incident, setIncident] = useState<IncidentRow | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<IncidentStatus | null>(null);

  const site = useMemo(() => {
    return sites.find((item) => item.id === incident?.siteId) ?? null;
  }, [incident?.siteId, sites]);

  const recommendedStatus = useMemo(() => {
    return incident ? nextRecommendedStatus(incident.status) : "investigating";
  }, [incident]);

  const loadIncident = useCallback(
    async (quiet = false) => {
      if (!incidentId) return;
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const [incidentRes, sitesRes] = await Promise.all([
          apiFetch<IncidentResponse>(`/api/incidents/${incidentId}`),
          apiFetch<SitesResponse>("/api/sites?max=300"),
        ]);

        setIncident(incidentRes.incident);
        setSites(sitesRes.sites ?? []);
      } catch (err) {
        const message = getApiErrorMessage(
          err,
          "Impossible de charger la fiche incident."
        );
        setError(message);
        feedback.error(err, {
          title: "Incident indisponible",
          fallback: message,
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [feedback, incidentId]
  );

  useEffect(() => {
    if (authLoading) return;
    void loadIncident(false);
  }, [authLoading, loadIncident]);

  async function updateStatus(nextStatus: IncidentStatus) {
    if (!incident || !canWrite) {
      feedback.warning(
        "Action protegee",
        "Votre role ne permet pas de modifier ce dossier incident."
      );
      return;
    }

    setUpdatingStatus(nextStatus);
    setError(null);

    try {
      const response = await apiFetch<IncidentResponse>(
        `/api/incidents/${incident.id}`,
        {
          method: "PATCH",
          body: { status: nextStatus },
        }
      );
      setIncident(response.incident);
      feedback.success(
        "Statut incident mis a jour",
        `Le dossier est maintenant ${statusLabel(nextStatus).toLowerCase()}.`
      );
    } catch (err) {
      const message = getApiErrorMessage(
        err,
        "Impossible de modifier le statut incident."
      );
      setError(message);
      feedback.error(err, {
        title: "Mise a jour refusee",
        fallback: message,
      });
    } finally {
      setUpdatingStatus(null);
    }
  }

  if (authLoading || loading) return <IncidentSkeleton />;

  if (error && !incident) {
    return (
      <EmptyState
        icon={ShieldAlert}
        tone="danger"
        title="Incident indisponible"
        description={error}
        action={
          <Button onClick={() => void loadIncident(false)} className="rounded-2xl font-black">
            Reessayer
          </Button>
        }
      />
    );
  }

  if (!incident) {
    return (
      <EmptyState
        icon={ShieldAlert}
        tone="warning"
        title="Incident introuvable"
        description="Le dossier a peut-etre ete supprime ou deplace."
        action={
          <Button asChild variant="outline" className="rounded-2xl font-black">
            <Link href="/dashboard/incidents">Retour incidents</Link>
          </Button>
        }
      />
    );
  }

  const terminal = isTerminalStatus(incident.status);
  const critical = incident.severity === "critical" || incident.severity === "high";

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 p-6 text-white shadow-2xl dark:border-white/10">
        <div className="pointer-events-none absolute right-[-6rem] top-[-7rem] h-72 w-72 rounded-full bg-red-400/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/dashboard/incidents")}
              className="mb-4 rounded-2xl px-0 font-black text-slate-300 hover:bg-transparent hover:text-white"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour incidents
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]", severityClass(incident.severity))}>
                {severityLabel(incident.severity)}
              </Badge>
              <Badge className={cn("rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]", statusClass(incident.status))}>
                {statusLabel(incident.status)}
              </Badge>
              {critical && !terminal ? (
                <Badge className="rounded-full border border-red-300/25 bg-red-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-red-50">
                  Priorite exploitation
                </Badge>
              ) : null}
            </div>

            <h1 className="mt-4 text-3xl font-black tracking-tight md:text-5xl">
              {incident.title || "Incident terrain"}
            </h1>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              {siteDisplay(site, incident)} - signale le {formatMoment(incident.createdAtIso)}.
              Cette fiche sert a piloter le traitement, tracer les commentaires
              et cloturer proprement le dossier.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[430px]">
            <Button
              type="button"
              onClick={() => void loadIncident(true)}
              disabled={refreshing}
              variant="outline"
              className="h-12 rounded-2xl border-white/15 bg-white/10 font-black text-white hover:bg-white/20"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
              Actualiser
            </Button>
            <Button
              type="button"
              disabled={!canWrite || updatingStatus !== null}
              onClick={() => void updateStatus(recommendedStatus)}
              className="h-12 rounded-2xl bg-white font-black text-slate-950 hover:bg-slate-100"
            >
              {updatingStatus === recommendedStatus ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              {terminal ? "Reprendre" : statusLabel(recommendedStatus)}
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[2rem] border border-amber-500/25 bg-amber-500/10 p-4 text-sm font-semibold text-amber-800 dark:text-amber-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card className="rounded-[2rem] border-border/60 shadow-sm">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-xl font-black">
                <FileText className="h-5 w-5 text-primary" />
                Faits et contexte
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div className="rounded-3xl border bg-muted/20 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Description terrain
                </p>
                <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-7 text-foreground">
                  {incident.description || "Aucune description renseignee."}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <InfoTile icon={MapPin} label="Site" value={siteDisplay(site, incident)} />
                <InfoTile icon={Clock3} label="Cree le" value={formatMoment(incident.createdAtIso)} />
                <InfoTile icon={RefreshCw} label="Mis a jour" value={formatMoment(incident.updatedAtIso)} />
              </div>

              {incident.tags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {incident.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="rounded-full font-black">
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {tenantId ? (
            <Card className="rounded-[2rem] border-border/60 shadow-sm">
              <CardHeader className="border-b bg-muted/20">
                <CardTitle className="flex items-center gap-2 text-xl font-black">
                  <MessageSquarePlus className="h-5 w-5 text-primary" />
                  Commentaires et suivi terrain
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <IncidentComments incidentId={incident.id} tenantId={tenantId} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border-border/60 shadow-sm">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-xl font-black">
                <Siren className="h-5 w-5 text-primary" />
                Traitement operationnel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {STATUS_FLOW.map((step, index) => {
                const currentIndex = STATUS_FLOW.findIndex(
                  (item) => item.status === incident.status
                );
                const active = index <= currentIndex;
                const current = step.status === incident.status;
                const saving = updatingStatus === step.status;

                return (
                  <button
                    key={step.status}
                    type="button"
                    disabled={!canWrite || saving || step.status === incident.status}
                    onClick={() => void updateStatus(step.status)}
                    className={cn(
                      "w-full rounded-3xl border p-4 text-left transition",
                      current
                        ? statusClass(step.status)
                        : active
                          ? "border-emerald-500/20 bg-emerald-500/5"
                          : "border-border bg-background hover:bg-muted/40",
                      !canWrite && "cursor-not-allowed opacity-80"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black",
                          active ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </div>
                      <div>
                        <p className="font-black text-foreground">{step.label}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                          {step.detail}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border-cyan-500/20 bg-cyan-500/5 shadow-sm">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-cyan-500/15 p-3 text-cyan-700 dark:text-cyan-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black text-foreground">Definition du fini</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-muted-foreground">
                    Un incident est vraiment termine quand le statut est clos,
                    la decision est visible dans les commentaires et le site ou
                    le client concerne sait quoi retenir.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full rounded-2xl font-black">
                <Link href="/dashboard/conduite">
                  Voir registre conduite <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {!canWrite ? (
            <div className="rounded-[2rem] border border-amber-500/25 bg-amber-500/10 p-4 text-sm font-semibold text-amber-800 dark:text-amber-200">
              Votre role permet de consulter le dossier mais pas de modifier son statut.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border bg-background p-4">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="mt-3 text-sm font-black leading-5 text-foreground">{value}</p>
    </div>
  );
}
