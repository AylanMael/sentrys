"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  History,
  Loader2,
  MessageSquarePlus,
  PlusCircle,
  Printer,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { useAppFeedback } from "@/hooks/use-app-feedback";
import { apiFetch, getApiErrorMessage } from "@/lib/api/client-fetch";
import {
  operationSignalStatusLabel,
  type OperationSignalState,
  type OperationSignalStatus,
} from "@/lib/operations/cockpit-signals";
import { cn } from "@/lib/utils";

type SignalStatusFilter = OperationSignalStatus | "all";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

type RegistryResponse = {
  ok: boolean;
  states: OperationSignalState[];
  summary: Record<OperationSignalStatus | "total", number>;
};

const STATUS_META: Record<
  OperationSignalStatus,
  {
    label: string;
    className: string;
  }
> = {
  new: {
    label: "Nouveau",
    className: "border-slate-300 bg-slate-100 text-slate-700",
  },
  seen: {
    label: "Vu",
    className: "border-sky-300 bg-sky-50 text-sky-700",
  },
  in_progress: {
    label: "En cours",
    className: "border-amber-300 bg-amber-50 text-amber-800",
  },
  done: {
    label: "Traite",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
};

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultFromDate() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return toDateInput(date);
}

function localDayStartIso(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function localDayEndIso(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function formatMoment(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function actorLabel(state: OperationSignalState) {
  return (
    state.updatedByName ||
    state.updatedByEmail ||
    state.updatedByRole ||
    "Non renseigné"
  );
}

function eventActorLabel(event: OperationSignalState["events"][number]) {
  return (
    event.actorName ||
    event.actorEmail ||
    event.actorRole ||
    "Non renseigné"
  );
}

function kindLabel(kind: string | null) {
  if (kind === "manual") return "Main courante";
  if (kind === "coverage") return "Couverture";
  if (kind === "start") return "Prise de service";
  if (kind === "incident") return "Incident";
  if (kind === "dispatch") return "Diffusion";
  if (kind === "compliance") return "Conformité";
  if (kind === "publication") return "Publication";
  return "Signal";
}

function statusClass(status: OperationSignalStatus) {
  return STATUS_META[status]?.className ?? STATUS_META.new.className;
}

function nextSignalActions(status: OperationSignalStatus): OperationSignalStatus[] {
  if (status === "new") return ["seen", "in_progress"];
  if (status === "seen") return ["in_progress", "done"];
  if (status === "in_progress") return ["done"];
  return [];
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function exportFilename(from: string, to: string) {
  return `registre-conduite-${from || "debut"}-${to || "fin"}.csv`;
}

function eventSummary(state: OperationSignalState) {
  return state.events
    .map((event) => {
      const transition = `${operationSignalStatusLabel(
        event.previousStatus
      )} -> ${operationSignalStatusLabel(event.status)}`;
      return [
        formatMoment(event.atIso),
        transition,
        eventActorLabel(event),
        event.note,
      ]
        .filter(Boolean)
        .join(" - ");
    })
    .join(" | ");
}

function buildRegistryCsv(states: OperationSignalState[]) {
  const header = [
    "Mise à jour",
    "Type",
    "Statut",
    "Signal",
    "Détail",
    "Responsable",
    "Role",
    "Derniere observation",
    "Evenements",
    "ID signal",
    "Dossier",
  ];

  const rows = states.map((state) => [
    formatMoment(state.updatedAtIso),
    kindLabel(state.kind),
    operationSignalStatusLabel(state.status),
    state.titleSnapshot ?? "",
    state.detailSnapshot ?? "",
    actorLabel(state),
    state.updatedByRole ?? "",
    state.note ?? "",
    eventSummary(state),
    state.signalId,
    state.href ?? "",
  ]);

  return [header, ...rows]
    .map((line) => line.map(csvCell).join(";"))
    .join("\r\n");
}

export default function ConduitePage() {
  const feedback = useAppFeedback();
  const [states, setStates] = useState<OperationSignalState[]>([]);
  const [summary, setSummary] = useState<
    Record<OperationSignalStatus | "total", number>
  >({
    total: 0,
    new: 0,
    seen: 0,
    in_progress: 0,
    done: 0,
  });
  const [status, setStatus] = useState<SignalStatusFilter>("all");
  const [from, setFrom] = useState(defaultFromDate);
  const [to, setTo] = useState(toDateInput(new Date()));
  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("");
  const deferredSearch = useDeferredValue(search);
  const deferredActor = useDeferredValue(actor);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDétail, setManualDétail] = useState("");
  const [manualStatus, setManualStatus] =
    useState<OperationSignalStatus>("seen");
  const [manualSaving, setManualSaving] = useState(false);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [observation, setObservation] = useState("");
  const [observationSaving, setObservationSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "300");
    if (status !== "all") params.set("status", status);
    if (from) params.set("from", localDayStartIso(from));
    if (to) params.set("to", localDayEndIso(to));
    if (deferredSearch.trim()) params.set("q", deferredSearch.trim());
    if (deferredActor.trim()) params.set("actor", deferredActor.trim());
    return params.toString();
  }, [deferredActor, deferredSearch, from, status, to]);

  const selectedState = useMemo(() => {
    return states.find((state) => state.id === selectedStateId) ?? null;
  }, [selectedStateId, states]);

  const printHref = useMemo(() => {
    return `/conduite/print?${query}`;
  }, [query]);
  const totalPages = Math.max(1, Math.ceil(states.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedStates = states.slice(startIndex, startIndex + pageSize);
  const hasFilters =
    status !== "all" ||
    search.trim() !== "" ||
    actor.trim() !== "" ||
    from !== defaultFromDate() ||
    to !== toDateInput(new Date());

  async function load(isRefresh = false, quiet = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<RegistryResponse>(
        `/api/operations/cockpit/signals?${query}`
      );
      setStates(response.states ?? []);
      setSummary(response.summary);
      if (isRefresh && !quiet) {
        feedback.info(
          "Registre synchronise",
          `${response.summary.total ?? response.states?.length ?? 0} signal(s) dans le filtre courant.`
        );
      }
    } catch (err) {
      const message = getApiErrorMessage(
        err,
        "Impossible de charger le registre de conduite."
      );
      setError(message);
      feedback.error(err, {
        title: "Registre indisponible",
        fallback: message,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function updateStatus(
    state: OperationSignalState,
    nextStatus: OperationSignalStatus
  ) {
    setUpdatingId(`${state.signalId}:${nextStatus}`);
    setError(null);

    try {
      await apiFetch("/api/operations/cockpit/signals", {
        method: "PATCH",
        body: {
          signalId: state.signalId,
          status: nextStatus,
          title: state.titleSnapshot,
          detail: state.detailSnapshot,
          href: state.href,
          kind: state.kind,
        },
      });
      await load(true, true);
      feedback.success(
        "Statut mis à jour",
        `Le signal est maintenant "${operationSignalStatusLabel(nextStatus)}".`
      );
    } catch (err) {
      const message = getApiErrorMessage(
        err,
        "Impossible de mettre à jour le statut."
      );
      setError(message);
      feedback.error(err, {
        title: "Statut non modifié",
        fallback: message,
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function createManualEntry() {
    if (!manualTitle.trim()) {
      feedback.warning(
        "Titre requis",
        "Ajoutez un titre court pour que la note soit exploitable dans le registre."
      );
      return;
    }

    setManualSaving(true);
    setError(null);

    try {
      await apiFetch("/api/operations/cockpit/signals", {
        method: "POST",
        body: {
          title: manualTitle,
          detail: manualDétail,
          status: manualStatus,
        },
      });
      setManualTitle("");
      setManualDétail("");
      setManualStatus("seen");
      setManualOpen(false);
      await load(true, true);
      feedback.success(
        "Note de conduite créée",
        "L'information est tracée dans le registre exploitation."
      );
    } catch (err) {
      const message = getApiErrorMessage(
        err,
        "Impossible de créer l'entree de main courante."
      );
      setError(message);
      feedback.error(err, {
        title: "Note non créée",
        fallback: message,
      });
    } finally {
      setManualSaving(false);
    }
  }

  async function addObservation() {
    if (!selectedState || !observation.trim()) return;
    setObservationSaving(true);
    setError(null);

    try {
      await apiFetch("/api/operations/cockpit/signals", {
        method: "PATCH",
        body: {
          signalId: selectedState.signalId,
          status: selectedState.status,
          title: selectedState.titleSnapshot,
          detail: selectedState.detailSnapshot,
          href: selectedState.href,
          kind: selectedState.kind,
          note: observation,
        },
      });
      setObservation("");
      await load(true, true);
      feedback.success(
        "Observation ajoutee",
        "La timeline de traitement est complétée."
      );
    } catch (err) {
      const message = getApiErrorMessage(
        err,
        "Impossible d'ajouter l'observation."
      );
      setError(message);
      feedback.error(err, {
        title: "Observation non ajoutee",
        fallback: message,
      });
    } finally {
      setObservationSaving(false);
    }
  }

  function downloadCsv() {
    if (states.length === 0) {
      feedback.warning(
        "Export vide",
        "Aucun signal ne correspond aux filtres courants."
      );
      return;
    }

    const csv = `\uFEFF${buildRegistryCsv(states)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFilename(from, to);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    feedback.success(
      "Export préparé",
      `${states.length} signal(s) exporte(s) pour Excel.`
    );
  }

  useEffect(() => {
    void load(false);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const activeCount = summary.seen + summary.in_progress;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 text-slate-950 shadow-sm dark:border-white/10 dark:bg-slate-950 dark:text-white">
        <div className="pointer-events-none absolute right-[-10%] top-[-50%] h-96 w-96 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Badge className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-100">
              Main courante exploitation
            </Badge>
            <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
              Conduite opérationnelle
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-muted-foreground">
              Le journal de bord du responsable exploitation : chaque signal vu,
              pris en charge ou traite reste tracé, avec responsable, heure et observation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => setManualOpen(true)}
              className="h-10 rounded-xl bg-slate-950 px-4 font-black text-white hover:bg-slate-800"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Nouvelle note
            </Button>
            <Button
              type="button"
              onClick={() => void load(true)}
              variant="outline"
              className="h-10 rounded-xl px-4 font-black"
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")}
              />
              Rafraîchir
            </Button>
            <Button
              type="button"
              onClick={downloadCsv}
              variant="outline"
              className="h-10 rounded-xl px-4 font-black"
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-xl px-4 font-black">
              <Link href={printHref} target="_blank" rel="noreferrer">
                <Printer className="mr-2 h-4 w-4" />
                PDF
              </Link>
            </Button>
            <Button asChild variant="ghost" className="h-10 rounded-xl px-4 font-black">
              <Link href="/dashboard">
                Cockpit <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <RegistryKpi
          label="Total filtre"
          value={summary.total}
          icon={Radar}
          className="border-slate-200 bg-white"
        />
        <RegistryKpi
          label="Nouveaux"
          value={summary.new}
          icon={ShieldAlert}
          className="border-slate-200 bg-white"
        />
        <RegistryKpi
          label="Actifs"
          value={activeCount}
          icon={Clock3}
          className="border-amber-200 bg-amber-50"
        />
        <RegistryKpi
          label="En cours"
          value={summary.in_progress}
          icon={RefreshCw}
          className="border-amber-200 bg-amber-50"
        />
        <RegistryKpi
          label="Traites"
          value={summary.done}
          icon={CheckCircle2}
          className="border-emerald-200 bg-emerald-50"
        />
      </div>

      <Card className="rounded-[1.5rem] border-border/60 shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black text-foreground">Filtres du registre</p>
              <p className="text-xs font-semibold text-muted-foreground">
                Affinez la main courante sans perdre le contexte de là journee.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 font-black">
                {states.length} resultat(s)
              </Badge>
              <Button
                type="button"
                variant="ghost"
                disabled={!hasFilters}
                onClick={() => {
                  setSearch("");
                  setActor("");
                  setStatus("all");
                  setFrom(defaultFromDate());
                  setTo(toDateInput(new Date()));
                }}
                className="h-9 rounded-xl font-black"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reinitialiser
              </Button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr_0.6fr_0.6fr_0.7fr_0.45fr]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un site, incident, agent..."
                className="h-11 rounded-2xl pl-10 font-semibold"
              />
            </div>

            <Input
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              placeholder="Responsable"
              className="h-11 rounded-2xl font-semibold"
            />

            <Select
              value={status}
              onValueChange={(value) => setStatus(value as SignalStatusFilter)}
            >
              <SelectTrigger className="h-11 rounded-2xl font-semibold">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="new">Nouveau</SelectItem>
                <SelectItem value="seen">Vu</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="done">Traite</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-11 rounded-2xl font-semibold"
            />

            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-11 rounded-2xl font-semibold"
            />

            <Select
              value={String(pageSize)}
              onValueChange={(value) => setPageSize(Number(value))}
            >
              <SelectTrigger className="h-11 rounded-2xl font-semibold">
                <SelectValue placeholder="Lignes" />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <EmptyState
              icon={ShieldAlert}
              tone="danger"
              compact
              title="Registre indisponible"
              description={error}
              className="text-left"
            />
          ) : null}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[1.5rem] border-border/60 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center gap-3 text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Chargement registre...
            </div>
          ) : states.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              tone="success"
              title="Aucun signal dans ce filtre"
              description="Le registre se remplira automatiquement lorsque les signaux du cockpit seront marques vu, en cours ou traite."
              className="m-6 min-h-[320px]"
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setActor("");
                    setStatus("all");
                  }}
                  className="rounded-2xl font-black"
                >
                  Reinitialiser les filtres
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[38%] font-black uppercase tracking-[0.12em]">
                    Signal
                  </TableHead>
                  <TableHead className="font-black uppercase tracking-[0.12em]">
                    Statut
                  </TableHead>
                  <TableHead className="font-black uppercase tracking-[0.12em]">
                    Responsable
                  </TableHead>
                  <TableHead className="font-black uppercase tracking-[0.12em]">
                    Mise à jour
                  </TableHead>
                  <TableHead className="text-right font-black uppercase tracking-[0.12em]">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedStates.map((state) => (
                  <TableRow key={state.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]"
                          >
                            {kindLabel(state.kind)}
                          </Badge>
                          <span className="text-[11px] font-bold text-muted-foreground">
                            {state.signalId}
                          </span>
                        </div>
                        <p className="font-black text-foreground">
                          {state.titleSnapshot || "Signal cockpit"}
                        </p>
                        <p className="line-clamp-2 text-sm font-semibold text-muted-foreground">
                          {state.detailSnapshot || "Aucun detail disponible."}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]",
                          statusClass(state.status)
                        )}
                      >
                        {operationSignalStatusLabel(state.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-black">{actorLabel(state)}</p>
                        <p className="mt-1 text-xs font-semibold text-muted-foreground">
                          {state.updatedByRole || "role non renseigné"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-black">
                          {formatMoment(state.updatedAtIso)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-muted-foreground">
                          {state.events.length} evenement(s)
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedStateId(state.id);
                            setObservation("");
                          }}
                          className="rounded-xl bg-white text-[11px] font-black"
                        >
                          <History className="mr-1 h-3 w-3" />
                          Détail
                        </Button>
                        {nextSignalActions(state.status).map((nextStatus) => (
                          <Button
                            key={nextStatus}
                            type="button"
                            size="sm"
                            variant={nextStatus === "done" ? "default" : "outline"}
                            disabled={updatingId === `${state.signalId}:${nextStatus}`}
                            onClick={() => void updateStatus(state, nextStatus)}
                            className={cn(
                              "rounded-xl text-[11px] font-black",
                              nextStatus === "done" &&
                                "bg-emerald-600 text-white hover:bg-emerald-700"
                            )}
                          >
                            {updatingId === `${state.signalId}:${nextStatus}` ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : null}
                            {operationSignalStatusLabel(nextStatus)}
                          </Button>
                        ))}
                        {state.href ? (
                          <Button
                            asChild
                            size="sm"
                            className="rounded-xl bg-slate-950 text-[11px] font-black text-white hover:bg-slate-800"
                          >
                            <Link href={state.href}>
                              Ouvrir <ArrowRight className="ml-1 h-3 w-3" />
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {!loading && states.length > 0 ? (
          <div className="flex flex-col gap-3 border-t bg-slate-50/70 px-4 py-3 text-sm font-semibold text-muted-foreground dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Affichage {startIndex + 1}-
              {Math.min(startIndex + pageSize, states.length)} sur {states.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-xl font-black"
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Prec.
              </Button>
              <Badge variant="outline" className="rounded-full px-3 py-1 font-black">
                {page}/{totalPages}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                className="rounded-xl font-black"
              >
                Suiv.
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Dialog
        open={!!selectedStateId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedStateId(null);
            setObservation("");
          }
        }}
      >
        <DialogContent className="rounded-[2rem] sm:max-w-3xl">
          {selectedState ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
                  >
                    {kindLabel(selectedState.kind)}
                  </Badge>
                  <Badge
                    className={cn(
                      "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em]",
                      statusClass(selectedState.status)
                    )}
                  >
                    {operationSignalStatusLabel(selectedState.status)}
                  </Badge>
                </div>
                <DialogTitle className="text-2xl font-black">
                  {selectedState.titleSnapshot || "Signal cockpit"}
                </DialogTitle>
                <DialogDescription className="font-semibold leading-6">
                  {selectedState.detailSnapshot || "Aucun detail disponible."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2 lg:grid-cols-[1fr_1.2fr]">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    Fiche rapide
                  </p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div>
                      <p className="font-black text-muted-foreground">Signal</p>
                      <p className="break-all font-semibold">
                        {selectedState.signalId}
                      </p>
                    </div>
                    <div>
                      <p className="font-black text-muted-foreground">
                        Responsable
                      </p>
                      <p className="font-semibold">{actorLabel(selectedState)}</p>
                    </div>
                    <div>
                      <p className="font-black text-muted-foreground">
                        Derniere mise à jour
                      </p>
                      <p className="font-semibold">
                        {formatMoment(selectedState.updatedAtIso)}
                      </p>
                    </div>
                    {selectedState.note ? (
                      <div className="rounded-2xl bg-white p-3">
                        <p className="font-black text-muted-foreground">
                          Derniere observation
                        </p>
                        <p className="mt-1 font-semibold">
                          {selectedState.note}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                  <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                    <History className="h-4 w-4" />
                    Timeline de traitement
                  </p>
                  <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                    {selectedState.events.length === 0 ? (
                      <p className="rounded-2xl bg-muted/40 p-4 text-sm font-semibold text-muted-foreground">
                        Aucun evenement tracé pour cette entree.
                      </p>
                    ) : (
                      selectedState.events.map((event, index) => (
                        <div
                          key={`${event.atIso}-${index}`}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Badge
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em]",
                                statusClass(event.status)
                              )}
                            >
                              {operationSignalStatusLabel(event.status)}
                            </Badge>
                            <span className="text-xs font-black text-muted-foreground">
                              {formatMoment(event.atIso)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm font-black">
                            {eventActorLabel(event)}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-muted-foreground">
                            {operationSignalStatusLabel(event.previousStatus)} vers{" "}
                            {operationSignalStatusLabel(event.status)}
                          </p>
                          {event.note ? (
                            <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-semibold leading-6">
                              {event.note}
                            </p>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <label className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Ajouter une observation
                </label>
                <Textarea
                  value={observation}
                  onChange={(event) => setObservation(event.target.value)}
                  placeholder="Ex : appel effectue, consigne donnée, controle realise, relancée a prevoir..."
                  className="mt-2 min-h-24 rounded-2xl bg-white font-semibold"
                  maxLength={600}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                {selectedState.href ? (
                  <Button
                    asChild
                    type="button"
                    variant="outline"
                    className="rounded-2xl font-black"
                  >
                    <Link href={selectedState.href}>
                      Ouvrir dossier <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  disabled={observationSaving || !observation.trim()}
                  onClick={() => void addObservation()}
                  className="rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800"
                >
                  {observationSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                  )}
                  Ajouter observation
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="rounded-[2rem] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">
              Nouvelle note de conduite
            </DialogTitle>
            <DialogDescription className="font-semibold leading-6">
              Ajoutez une information terrain utile a la main courante :
              relancée agent, appel client, consigne donnée, controle effectue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                Titre
              </label>
              <Input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                placeholder="Ex : Agent relancée pour prise de poste"
                className="h-11 rounded-2xl font-semibold"
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                Détail opérationnel
              </label>
              <Textarea
                value={manualDétail}
                onChange={(event) => setManualDétail(event.target.value)}
                placeholder="Qui ? quoi ? quand ? décision prise ? prochaine action ?"
                className="min-h-32 rounded-2xl font-semibold"
                maxLength={800}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                Statut initial
              </label>
              <Select
                value={manualStatus}
                onValueChange={(value) =>
                  setManualStatus(value as OperationSignalStatus)
                }
              >
                <SelectTrigger className="h-11 rounded-2xl font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seen">Vu</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="done">Traite</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setManualOpen(false)}
              className="rounded-2xl font-black"
            >
              Annuler
            </Button>
            <Button
              type="button"
              disabled={
                manualSaving ||
                !manualTitle.trim() ||
                !manualDétail.trim()
              }
              onClick={() => void createManualEntry()}
              className="rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800"
            >
              {manualSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Ajouter au registre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RegistryKpi({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number;
  icon: typeof Radar;
  className: string;
}) {
  return (
    <Card className={cn("rounded-[1.35rem] shadow-sm", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-3xl font-black tracking-tight">{value}</p>
          </div>
          <div className="rounded-2xl bg-background/80 p-3">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
