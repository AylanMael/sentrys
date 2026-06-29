"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Printer, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client-fetch";
import {
  publicEnvAgencyProfile,
  type AgencyDocumentProfile,
} from "@/lib/agency/profile";
import { useAuth } from "@/lib/auth-provider";
import type { PrepayReport } from "@/lib/payroll/prepay";
import type { PrepayPeriod, PrepayPeriodStatus } from "@/lib/payroll/workflow";

type PrepayResponse = {
  ok: boolean;
  report: PrepayReport;
};

type PrepayPeriodResponse = {
  ok: boolean;
  period: PrepayPeriod;
};

type AgencyProfileResponse = {
  ok: boolean;
  profile: AgencyDocumentProfile;
};

const STATUS_LABELS: Record<PrepayPeriodStatus, string> = {
  draft: "Brouillon",
  checked: "Controle",
  validated: "Valide",
  locked: "Verrouille",
  exported: "Exporte",
};

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

function coerceDateIso(value: string | null, fallbackIso: string) {
  if (!value) return fallbackIso;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallbackIso;
}

function formatRange(fromIso: string, toIso: string) {
  const from = new Date(fromIso);
  const to = new Date(new Date(toIso).getTime() - 86400000);
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${formatter.format(from)} - ${formatter.format(to)}`;
}

function formatPrintDate() {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function hours(value: number) {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} h`;
}

function money(value: number) {
  return value.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function issueCount(report: PrepayReport) {
  return (
    report.summary.anomalyCount +
    report.summary.unassignedVacationCount +
    report.summary.draftVacationCount
  );
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

export default function PrepaySummaryPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center gap-3 bg-slate-100 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Preparation de la synthese...
        </div>
      }
    >
      <PrepaySummaryContent />
    </React.Suspense>
  );
}

function PrepaySummaryContent() {
  const searchParams = useSearchParams();
  const { firebaseUser, loading: authLoading } = useAuth();
  const defaults = React.useMemo(() => defaultRange(), []);
  const fromIso = coerceDateIso(searchParams.get("from"), defaults.fromIso);
  const toIso = coerceDateIso(searchParams.get("to"), defaults.toIso);
  const printedAt = React.useMemo(() => formatPrintDate(), []);

  const [report, setReport] = React.useState<PrepayReport | null>(null);
  const [period, setPeriod] = React.useState<PrepayPeriod | null>(null);
  const [agencyProfile, setAgencyProfile] =
    React.useState<AgencyDocumentProfile>(() => publicEnvAgencyProfile());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.title = `Synthese pre-paie - ${formatRange(fromIso, toIso)}`;
  }, [fromIso, toIso]);

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
        const params = new URLSearchParams({ from: fromIso, to: toIso });
        const [prepayResponse, periodResponse, profileResponse] =
          await Promise.all([
            apiFetch<PrepayResponse>(`/api/prepay?${params.toString()}`),
            apiFetch<PrepayPeriodResponse>(
              `/api/prepay/periods?${params.toString()}`
            ),
            apiFetch<AgencyProfileResponse>("/api/agency-profile").catch(
              () => null
            ),
          ]);

        if (!mounted) return;
        setReport(prepayResponse.report);
        setPeriod(periodResponse.period);
        if (profileResponse?.profile) {
          setAgencyProfile(profileResponse.profile);
        }
      } catch (loadError) {
        if (!mounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger la synthese pre-paie."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [authLoading, firebaseUser, fromIso, toIso]);

  const criticalRows = React.useMemo(() => {
    return report?.rows.filter((row) => row.anomalies.length > 0).slice(0, 8) ?? [];
  }, [report]);

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

          .summary-sheet {
            border: 0 !important;
            box-shadow: none !important;
            min-height: auto !important;
          }
        }
      `}</style>

      <div className="print-actions sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3">
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/dashboard/prepaie">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Link>
          </Button>
          <div className="text-center">
            <p className="text-sm font-black">Synthese pre-paie</p>
            <p className="text-xs text-slate-500">
              Bordereau PDF de controle et transmission cabinet.
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
        <section className="summary-sheet overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white shadow-xl">
          {loading ? (
            <div className="flex min-h-[520px] items-center justify-center gap-3 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Chargement de la synthese pre-paie...
            </div>
          ) : error || !report ? (
            <div className="min-h-[520px] p-10">
              <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-red-800">
                <p className="font-black">Synthese indisponible</p>
                <p className="mt-2 text-sm">{error ?? "Aucun rapport trouve."}</p>
              </div>
            </div>
          ) : (
            <>
              <header className="grid grid-cols-[1.2fr_1.5fr_1fr] gap-5 border-b border-slate-200 bg-slate-950 p-6 text-white">
                <div className="flex items-start gap-4">
                  {agencyProfile.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={agencyProfile.logoUrl}
                      alt={agencyProfile.displayName}
                      className="h-16 w-16 rounded-2xl bg-white object-contain p-2"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-400 text-xl font-black text-slate-950">
                      {initials(agencyProfile.displayName)}
                    </div>
                  )}
                  <div>
                    <p className="text-lg font-black">
                      {agencyProfile.displayName}
                    </p>
                    <div className="mt-1 space-y-0.5 text-[11px] leading-4 text-slate-300">
                      {agencyLines(agencyProfile).slice(0, 5).map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200">
                    Bordereau de transmission
                  </p>
                  <h1 className="mt-2 text-3xl font-black tracking-tight">
                    Synthese pre-paie
                  </h1>
                  <p className="mt-2 text-sm text-slate-300">
                    Variables issues du planning, a valider selon contrat,
                    convention et parametrage paie.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-right">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                    Periode
                  </p>
                  <p className="mt-2 text-lg font-black">
                    {formatRange(report.fromIso, report.toIso)}
                  </p>
                  <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                    Statut cycle
                  </p>
                  <p className="mt-1 font-black">
                    {STATUS_LABELS[period?.status ?? "draft"]}
                  </p>
                  <p className="mt-3 text-xs text-slate-300">
                    Edition : {printedAt}
                  </p>
                </div>
              </header>

              <div className="grid grid-cols-5 gap-3 border-b border-slate-200 bg-slate-50 p-5">
                {[
                  ["Agents", report.summary.agentCount],
                  ["Vacations", report.summary.vacationCount],
                  ["Heures payables", hours(report.summary.payableHours)],
                  ["Estimation", money(report.summary.estimatedGrossAmount)],
                  ["Points", issueCount(report)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-3xl bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                      {label}
                    </p>
                    <p className="mt-2 text-xl font-black">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[1fr_320px] gap-5 p-5">
                <div className="overflow-hidden rounded-3xl border border-slate-200">
                  <table className="w-full border-collapse text-left text-[11px]">
                    <thead className="bg-slate-900 text-white">
                      <tr>
                        <th className="px-3 py-2">Agent</th>
                        <th className="px-3 py-2 text-right">Payable</th>
                        <th className="px-3 py-2 text-right">Nuit</th>
                        <th className="px-3 py-2 text-right">Dim.</th>
                        <th className="px-3 py-2 text-right">Feries</th>
                        <th className="px-3 py-2 text-right">Abs.</th>
                        <th className="px-3 py-2 text-right">Estime</th>
                        <th className="px-3 py-2">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row, index) => (
                        <tr
                          key={row.agentId}
                          className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                        >
                          <td className="border-t border-slate-200 px-3 py-2">
                            <p className="font-black">{row.agentName}</p>
                            <p className="text-[10px] text-slate-500">
                              Matricule {row.payrollId} - {row.vacationCount}{" "}
                              vacation(s) -{" "}
                              {row.siteNames.join(", ") || "Site non renseigne"}
                            </p>
                          </td>
                          <td className="border-t border-slate-200 px-3 py-2 text-right font-black">
                            {hours(row.payableHours)}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-2 text-right">
                            {hours(row.nightHours)}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-2 text-right">
                            {hours(row.sundayHours)}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-2 text-right">
                            {hours(row.publicHolidayHours)}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-2 text-right">
                            {hours(row.absenceHours)}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-2 text-right font-black">
                            {money(row.estimatedGrossAmount)}
                          </td>
                          <td className="border-t border-slate-200 px-3 py-2">
                            {row.anomalies.length > 0 ? (
                              <span className="rounded-full bg-amber-100 px-2 py-1 font-black text-amber-800">
                                A verifier
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 font-black text-emerald-800">
                                OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      <p className="font-black">Reserve paie</p>
                    </div>
                    <p className="mt-2 text-xs leading-5">
                      Ce document prepare les variables. La paie finale depend
                      des contrats, absences qualifiees, accords collectifs et
                      controles du gestionnaire paie.
                    </p>
                  </div>

                  <div className="rounded-3xl border border-slate-200 p-4">
                    <p className="text-sm font-black">Points a regulariser</p>
                    <div className="mt-3 space-y-2 text-xs">
                      {report.summary.unassignedVacationCount > 0 && (
                        <p className="rounded-2xl bg-red-50 p-2 text-red-800">
                          {report.summary.unassignedVacationCount} vacation(s)
                          sans agent.
                        </p>
                      )}
                      {report.summary.draftVacationCount > 0 && (
                        <p className="rounded-2xl bg-amber-50 p-2 text-amber-800">
                          {report.summary.draftVacationCount} vacation(s) non
                          publiee(s).
                        </p>
                      )}
                      {criticalRows.length === 0 &&
                      report.summary.unassignedVacationCount === 0 &&
                      report.summary.draftVacationCount === 0 ? (
                        <p className="rounded-2xl bg-emerald-50 p-2 text-emerald-800">
                          Aucun point bloquant detecte.
                        </p>
                      ) : (
                        criticalRows.map((row) => (
                          <div
                            key={row.agentId}
                            className="rounded-2xl bg-slate-50 p-2"
                          >
                            <p className="font-black">{row.agentName}</p>
                            <p className="mt-1 text-slate-500">
                              {row.anomalies.join(" | ")}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 p-4 text-xs text-slate-600">
                    <p className="font-black text-slate-950">
                      Export cabinet associe
                    </p>
                    <p className="mt-2 leading-5">
                      Le CSV cabinet utilise les codes rubriques parametres :
                      {` ${Object.values(
                        report.settings.payrollRubricCodes
                      ).join(", ")}.`}
                      Ces codes sont a mapper avec le cabinet paie.
                    </p>
                  </div>
                </aside>
              </div>

              <footer className="border-t border-slate-200 px-6 py-4 text-[10px] text-slate-500">
                {agencyProfile.footerNote ||
                  "Document genere par SENTRYS - controle exploitation avant paie definitive."}
              </footer>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
