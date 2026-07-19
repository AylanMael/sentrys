"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Printer, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client-fetch";
import {
  publicEnvAgencyProfile,
  type AgencyDocumentProfile,
} from "@/lib/agency/profile";
import { useAuth } from "@/lib/auth-provider";
import {
  operationSignalStatusLabel,
  type OperationSignalState,
  type OperationSignalStatus,
} from "@/lib/operations/cockpit-signals";
import { cn } from "@/lib/utils";

type RegistryResponse = {
  ok: boolean;
  states: OperationSignalState[];
  summary: Record<OperationSignalStatus | "total", number>;
};

type AgencyProfileResponse = {
  ok: boolean;
  profile: AgencyDocumentProfile;
};

const STATUS_STYLES: Record<OperationSignalStatus, string> = {
  new: "border-slate-300 bg-slate-100 text-slate-700",
  seen: "border-sky-300 bg-sky-50 text-sky-700",
  in_progress: "border-amber-300 bg-amber-50 text-amber-800",
  done: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

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

function formatDateOnly(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function printedAt() {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
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

function agencyLines(profile: AgencyDocumentProfile) {
  return [
    profile.legalName,
    profile.addressLine1,
    profile.addressLine2,
    profile.phone,
    profile.email,
    profile.siret ? `SIRET ${profile.siret}` : null,
    profile.cnaps ? `CNAPS ${profile.cnaps}` : null,
  ].filter(Boolean);
}

function statusClass(status: OperationSignalStatus) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.new;
}

function buildApiQuery(searchParams: URLSearchParams) {
  const params = new URLSearchParams();
  params.set("limit", searchParams.get("limit") || "500");

  ["status", "q", "actor", "from", "to"].forEach((key) => {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  });

  return params.toString();
}

function periodLabel(searchParams: URLSearchParams) {
  const from = formatDateOnly(searchParams.get("from"));
  const to = formatDateOnly(searchParams.get("to"));
  return `${from} - ${to}`;
}

function filtersLabel(searchParams: URLSearchParams) {
  const items = [
    searchParams.get("status")
      ? `Statut: ${operationSignalStatusLabel(
          searchParams.get("status") as OperationSignalStatus
        )}`
      : "Tous statuts",
    searchParams.get("q") ? `Recherche: ${searchParams.get("q")}` : null,
    searchParams.get("actor")
      ? `Responsable: ${searchParams.get("actor")}`
      : null,
  ].filter(Boolean);

  return items.join(" | ");
}

function firstObservation(state: OperationSignalState) {
  return state.note || state.events.find((event) => event.note)?.note || "-";
}

export default function ConduitePrintPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center gap-3 bg-slate-100 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Preparation du registre...
        </div>
      }
    >
      <ConduitePrintContent />
    </React.Suspense>
  );
}

function ConduitePrintContent() {
  const searchParams = useSearchParams();
  const { firebaseUser, loading: authLoading } = useAuth();
  const printed = React.useMemo(() => printedAt(), []);
  const query = React.useMemo(
    () => buildApiQuery(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const period = React.useMemo(
    () => periodLabel(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const filters = React.useMemo(
    () => filtersLabel(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  const [states, setStates] = React.useState<OperationSignalState[]>([]);
  const [summary, setSummary] = React.useState<
    Record<OperationSignalStatus | "total", number>
  >({
    total: 0,
    new: 0,
    seen: 0,
    in_progress: 0,
    done: 0,
  });
  const [agencyProfile, setAgencyProfile] =
    React.useState<AgencyDocumentProfile>(() => publicEnvAgencyProfile());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.title = `Registre conduite - ${period}`;
  }, [period]);

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      if (authLoading) return;

      if (!firebaseUser) {
        setError("Session non disponible. Reconnectez-vous puis reessayez.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [registryResponse, profileResponse] = await Promise.all([
          apiFetch<RegistryResponse>(`/api/operations/cockpit/signals?${query}`),
          apiFetch<AgencyProfileResponse>("/api/agency-profile").catch(
            () => null
          ),
        ]);

        if (!mounted) return;
        setStates(registryResponse.states ?? []);
        setSummary(registryResponse.summary);
        if (profileResponse?.profile) {
          setAgencyProfile(profileResponse.profile);
        }
      } catch (loadError) {
        if (!mounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger le registre de conduite."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [authLoading, firebaseUser, query]);

  const activeCount = summary.seen + summary.in_progress;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 8mm;
        }

        @media print {
          body {
            background: white !important;
          }

          .print-actions {
            display: none !important;
          }

          .print-shell {
            padding: 0 !important;
          }

          .print-card {
            border: 0 !important;
            box-shadow: none !important;
          }

          .avoid-break {
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="print-actions sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3">
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/dashboard/conduite">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour registre
            </Link>
          </Button>
          <div className="text-center">
            <p className="text-sm font-black">Registre de conduite</p>
            <p className="text-xs text-slate-500">
              Document d'audit exploitation et main courante.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => window.print()}
            className="rounded-2xl font-black"
          >
            <Printer className="mr-2 h-4 w-4" />
            Imprimer / PDF
          </Button>
        </div>
      </div>

      <main className="print-shell mx-auto max-w-[1280px] px-4 py-5">
        <section className="print-card overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white shadow-xl">
          {loading ? (
            <div className="flex min-h-[520px] items-center justify-center gap-3 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement du registre...
            </div>
          ) : error ? (
            <div className="min-h-[520px] p-10">
              <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-red-800">
                <p className="font-black">Registre indisponible</p>
                <p className="mt-2 text-sm font-semibold">{error}</p>
              </div>
            </div>
          ) : (
            <>
              <header className="grid grid-cols-[1.15fr_1fr] gap-6 border-b border-slate-200 bg-slate-950 p-6 text-white">
                <div className="flex gap-4">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-white text-slate-950">
                    {agencyProfile.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={agencyProfile.logoUrl}
                        alt={agencyProfile.displayName}
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <ShieldCheck className="h-8 w-8" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
                      {agencyProfile.displayName}
                    </p>
                    <h1 className="mt-1 text-3xl font-black">
                      Registre de conduite opérationnelle
                    </h1>
                    <p className="mt-2 text-sm font-semibold text-slate-300">
                      Periode : {period}
                    </p>
                  </div>
                </div>

                <div className="text-right text-xs font-semibold leading-5 text-slate-300">
                  {agencyLines(agencyProfile).map((line) => (
                    <p key={String(line)}>{line}</p>
                  ))}
                  <p className="mt-3 text-cyan-100">Edition : {printed}</p>
                </div>
              </header>

              <section className="grid grid-cols-[1fr_1.6fr] gap-4 border-b border-slate-200 p-5">
                <div className="grid grid-cols-4 gap-3">
                  <SummaryBox label="Total" value={summary.total} />
                  <SummaryBox label="Nouveaux" value={summary.new} />
                  <SummaryBox label="Actifs" value={activeCount} tone="amber" />
                  <SummaryBox label="Traites" value={summary.done} tone="green" />
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Filtres appliques
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-800">
                    {filters || "Tous les signaux"}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Le document reprend exactement les signaux de conduite
                    visibles pour cette période et ces filtres.
                  </p>
                </div>
              </section>

              <section className="p-5">
                {states.length === 0 ? (
                  <div className="flex min-h-[300px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 text-center">
                    <div>
                      <p className="text-xl font-black">Aucune entree</p>
                      <p className="mt-2 text-sm font-semibold text-slate-500">
                        Aucun signal ne correspond aux filtres selectionnes.
                      </p>
                    </div>
                  </div>
                ) : (
                  <table className="w-full border-collapse text-left text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        <th className="border border-slate-200 p-2">Date</th>
                        <th className="border border-slate-200 p-2">Type</th>
                        <th className="border border-slate-200 p-2">Statut</th>
                        <th className="w-[30%] border border-slate-200 p-2">
                          Signal
                        </th>
                        <th className="border border-slate-200 p-2">
                          Responsable
                        </th>
                        <th className="w-[27%] border border-slate-200 p-2">
                          Observation / tracé
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {states.map((state) => (
                        <tr key={state.id} className="avoid-break align-top">
                          <td className="border border-slate-200 p-2 font-bold">
                            {formatMoment(state.updatedAtIso)}
                          </td>
                          <td className="border border-slate-200 p-2">
                            {kindLabel(state.kind)}
                            <p className="mt-1 break-all text-[9px] font-semibold text-slate-400">
                              {state.signalId}
                            </p>
                          </td>
                          <td className="border border-slate-200 p-2">
                            <Badge
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]",
                                statusClass(state.status)
                              )}
                            >
                              {operationSignalStatusLabel(state.status)}
                            </Badge>
                          </td>
                          <td className="border border-slate-200 p-2">
                            <p className="font-black">
                              {state.titleSnapshot || "Signal cockpit"}
                            </p>
                            <p className="mt-1 line-clamp-3 font-semibold leading-4 text-slate-600">
                              {state.detailSnapshot || "Aucun detail disponible."}
                            </p>
                          </td>
                          <td className="border border-slate-200 p-2">
                            <p className="font-black">{actorLabel(state)}</p>
                            <p className="mt-1 text-[9px] font-semibold text-slate-500">
                              {state.updatedByRole || "role non renseigné"}
                            </p>
                          </td>
                          <td className="border border-slate-200 p-2">
                            <p className="font-semibold leading-4">
                              {firstObservation(state)}
                            </p>
                            {state.events.length > 0 ? (
                              <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-[9px] font-semibold text-slate-500">
                                {state.events.slice(0, 3).map((event, index) => (
                                  <p key={`${event.atIso}-${index}`}>
                                    {formatMoment(event.atIso)} -{" "}
                                    {eventActorLabel(event)} -{" "}
                                    {operationSignalStatusLabel(event.status)}
                                  </p>
                                ))}
                                {state.events.length > 3 ? (
                                  <p>+ {state.events.length - 3} tracé(s)</p>
                                ) : null}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <footer className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-[10px] font-semibold text-slate-500">
                {agencyProfile.footerNote ||
                  "Document généré par Sentrys. Les informations doivent être vérifiées avant transmission officielle."}
              </footer>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function SummaryBox({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "amber" | "green";
}) {
  const className =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "green"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-white";

  return (
    <div className={cn("rounded-3xl border p-4", className)}>
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}
