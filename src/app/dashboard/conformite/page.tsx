"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

import { apiFetch } from "@/lib/api/client-fetch";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ResolutionStatus =
  | "to_regularize"
  | "regularized"
  | "accepted_exception";

type ComplianceOverrideItem = {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail: string | null;
  agentPhone: string | null;
  fromIso: string;
  toIso: string;
  periodLabel: string;
  vacationCount: number;
  vacationIds: string[];
  siteNames: string[];
  channel: string;
  deliveryStatus: string | null;
  sentAtIso: string | null;
  sentBy: string | null;
  complianceOverrideReason: string | null;
  complianceOverrideDetail: string | null;
  complianceResolutionStatus: ResolutionStatus;
  complianceResolutionNote: string | null;
  complianceResolutionAtIso: string | null;
  complianceResolutionByEmail: string | null;
};

type ComplianceOverrideResponse = {
  ok: boolean;
  stats: Record<ResolutionStatus | "total", number>;
  items: ComplianceOverrideItem[];
};

const STATUS_OPTIONS: Array<{ value: ResolutionStatus | "all"; label: string }> = [
  { value: "all", label: "Tous les statuts" },
  { value: "to_regularize", label: "A regulariser" },
  { value: "regularized", label: "Regularise" },
  { value: "accepted_exception", label: "Accepte exceptionnellement" },
];

function statusLabel(status: ResolutionStatus) {
  if (status === "regularized") return "Regularise";
  if (status === "accepted_exception") return "Accepte exception";
  return "A regulariser";
}

function statusClass(status: ResolutionStatus) {
  if (status === "regularized") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  if (status === "accepted_exception") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }

  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function formatDateTime(value: string | null) {
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

function channelLabel(channel: string) {
  if (channel === "portal") return "Portail";
  if (channel === "email") return "Email";
  if (channel === "whatsapp") return "WhatsApp";
  return "Interne";
}

export default function ComplianceRegistryPage() {
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agentId") ?? "";
  const [items, setItems] = useState<ComplianceOverrideItem[]>([]);
  const [stats, setStats] = useState<Record<ResolutionStatus | "total", number>>({
    total: 0,
    to_regularize: 0,
    regularized: 0,
    accepted_exception: 0,
  });
  const [status, setStatus] = useState<ResolutionStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("status", status);
    if (agentId) params.set("agentId", agentId);
    if (search.trim()) params.set("q", search.trim());
    return params.toString();
  }, [agentId, search, status]);

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<ComplianceOverrideResponse>(
        `/api/compliance-overrides?${queryString}`
      );
      setItems(response.items ?? []);
      setStats(response.stats);
      setNotes((previous) => {
        const next = { ...previous };
        (response.items ?? []).forEach((item) => {
          if (typeof next[item.id] === "undefined") {
            next[item.id] = item.complianceResolutionNote ?? "";
          }
        });
        return next;
      });
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger le registre conformite."
      );
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  const updateStatus = useCallback(
    async (item: ComplianceOverrideItem, nextStatus: ResolutionStatus) => {
      setSavingId(item.id);
      setError(null);

      try {
        await apiFetch("/api/compliance-overrides", {
          method: "PATCH",
          body: {
            id: item.id,
            status: nextStatus,
            note: notes[item.id] ?? "",
          },
        });
        await loadRegistry();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Impossible de mettre a jour cette exception."
        );
      } finally {
        setSavingId(null);
      }
    },
    [loadRegistry, notes]
  );

  const openCount = stats.to_regularize ?? 0;
  const closedCount =
    (stats.regularized ?? 0) + (stats.accepted_exception ?? 0);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 pb-10">
      <section className="relative overflow-hidden rounded-[2rem] border bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-6 text-white shadow-2xl md:p-8">
        <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 shadow-xl">
              <FileWarning className="h-8 w-8 text-sky-200" />
            </div>
            <div>
              <Badge className="rounded-full border-white/20 bg-white/10 text-[10px] font-black uppercase tracking-[0.18em] text-white hover:bg-white/10">
                Registre exploitation
              </Badge>
              <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
                Exceptions conformite
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-200">
                Chaque planning force est suivi ici : motif, agent, periode,
                responsable et statut de regularisation.
              </p>
              {agentId && (
                <Badge className="mt-3 rounded-full border-sky-300/30 bg-sky-300/10 text-[10px] font-black uppercase tracking-[0.16em] text-sky-100 hover:bg-sky-300/10">
                  Filtre agent actif
                </Badge>
              )}
            </div>
          </div>

          <Button
            type="button"
            onClick={loadRegistry}
            variant="outline"
            className="h-12 rounded-2xl border-white/20 bg-white/10 px-5 font-black text-white hover:bg-white/20"
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Actualiser
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Total force" value={stats.total ?? 0} tone="slate" />
        <MetricCard label="A regulariser" value={openCount} tone="amber" />
        <MetricCard label="Regularises" value={stats.regularized ?? 0} tone="emerald" />
        <MetricCard
          label="Acceptes exception"
          value={stats.accepted_exception ?? 0}
          tone="sky"
        />
      </div>

      <Card className="overflow-hidden rounded-[2rem] border-border/60 shadow-xl">
        <div className="flex flex-col gap-4 border-b bg-muted/20 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher agent, motif, site..."
              className="h-12 rounded-2xl bg-background pl-11 font-semibold"
            />
          </div>

          <Select
            value={status}
            onValueChange={(value) => setStatus(value as ResolutionStatus | "all")}
          >
            <SelectTrigger className="h-12 w-full rounded-2xl bg-background font-bold lg:w-[260px]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
              <p className="text-xs font-black uppercase tracking-[0.18em]">
                Chargement du registre
              </p>
            </div>
          ) : error ? (
            <div className="m-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm font-bold text-red-700 dark:text-red-300">
              <AlertTriangle className="mb-2 h-5 w-5" />
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-5 py-20 text-center">
              <ShieldCheck className="h-10 w-10 text-emerald-500" />
              <h2 className="mt-4 text-xl font-black">
                Aucun forcage a traiter
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Le registre est vide pour ces filtres. C'est plutot bon signe :
                le planning reste sous controle.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {items.map((item) => (
                <article key={item.id} className="p-5 transition hover:bg-muted/20">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
                            statusClass(item.complianceResolutionStatus)
                          )}
                        >
                          {statusLabel(item.complianceResolutionStatus)}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full bg-background px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em]"
                        >
                          {channelLabel(item.channel)}
                        </Badge>
                        <span className="text-xs font-bold text-muted-foreground">
                          Force le {formatDateTime(item.sentAtIso)}
                        </span>
                      </div>

                      <div>
                        <h2 className="truncate text-xl font-black text-foreground">
                          {item.agentName}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.periodLabel} - {item.vacationCount} vacation(s)
                        </p>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-2">
                        <InfoBlock
                          label="Blocage initial"
                          value={
                            item.complianceOverrideDetail ||
                            "Detail conformite non renseigne"
                          }
                          tone="red"
                        />
                        <InfoBlock
                          label="Motif du forcage"
                          value={
                            item.complianceOverrideReason ||
                            "Motif non renseigne"
                          }
                          tone="sky"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {item.siteNames.slice(0, 8).map((siteName) => (
                          <span
                            key={siteName}
                            className="rounded-full border bg-background px-3 py-1 text-xs font-bold text-muted-foreground"
                          >
                            {siteName}
                          </span>
                        ))}
                      </div>

                      {item.complianceResolutionAtIso && (
                        <p className="text-xs font-semibold text-muted-foreground">
                          Derniere decision :{" "}
                          {formatDateTime(item.complianceResolutionAtIso)}
                          {item.complianceResolutionByEmail
                            ? ` par ${item.complianceResolutionByEmail}`
                            : ""}
                        </p>
                      )}
                    </div>

                    <div className="w-full shrink-0 space-y-3 xl:w-[360px]">
                      <Textarea
                        value={notes[item.id] ?? ""}
                        onChange={(event) =>
                          setNotes((previous) => ({
                            ...previous,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Note de regularisation, piece recue, decision responsable..."
                        rows={3}
                        className="resize-none rounded-2xl"
                      />

                      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => updateStatus(item, "to_regularize")}
                          disabled={savingId === item.id}
                          className="rounded-xl border-amber-500/30 bg-amber-500/10 font-black text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                        >
                          A regulariser
                        </Button>
                        <Button
                          type="button"
                          onClick={() => updateStatus(item, "regularized")}
                          disabled={savingId === item.id}
                          className="rounded-xl bg-emerald-600 font-black text-white hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Regularise
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            updateStatus(item, "accepted_exception")
                          }
                          disabled={savingId === item.id}
                          className="rounded-xl border-sky-500/30 bg-sky-500/10 font-black text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                        >
                          Accepter exception
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="ghost" size="sm" className="rounded-xl">
                          <Link href={`/dashboard/agents/${item.agentId}`}>
                            Fiche agent
                            <ExternalLink className="ml-2 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="rounded-xl">
                          <Link href={`/agent-planning/print/${item.id}`}>
                            PDF planning
                            <ExternalLink className="ml-2 h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && items.length > 0 && (
            <div className="border-t bg-muted/20 p-4 text-sm font-semibold text-muted-foreground">
              {items.length} exception(s) affichee(s). {openCount} restent a
              regulariser, {closedCount} sont fermees ou acceptees.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "amber" | "emerald" | "sky";
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : tone === "emerald"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : tone === "sky"
          ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300";

  return (
    <div className={cn("rounded-[1.5rem] border p-5", toneClass)}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "red" | "sky";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3",
        tone === "red"
          ? "border-red-500/20 bg-red-500/5"
          : "border-sky-500/20 bg-sky-500/5"
      )}
    >
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">
        {value}
      </p>
    </div>
  );
}
