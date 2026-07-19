"use client";

import React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client-fetch";
import { useAuth } from "@/lib/auth-provider";
import {
  publicEnvAgencyProfile,
  type AgencyDocumentProfile,
} from "@/lib/agency/profile";
import {
  dispatchChannelLabel,
  type DispatchChannel,
  type DispatchDeliveryMode,
  type DispatchDeliveryStatus,
} from "@/lib/planning/dispatch";

type DispatchVacationSummary = {
  id: string;
  siteName: string | null;
  title: string | null;
  missionType: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
};

type AgentDispatchRow = {
  id: string;
  agentId: string;
  agentName: string;
  agentEmail: string | null;
  agentPhone?: string | null;
  fromIso: string;
  toIso: string;
  vacationCount: number;
  siteNames: string[];
  vacations: DispatchVacationSummary[];
  channel: DispatchChannel;
  deliveryMode?: DispatchDeliveryMode;
  deliveryStatus?: DispatchDeliveryStatus;
  deliveryTarget?: string | null;
  deliveryNote?: string | null;
  sentAtIso: string | null;
  viewedAtIso?: string | null;
  lastViewedAtIso?: string | null;
  viewedCount?: number;
  printedAtIso?: string | null;
  lastPrintedAtIso?: string | null;
  printedCount?: number;
  acknowledgedAtIso: string | null;
  acknowledgedByUid: string | null;
  acknowledgedByName: string | null;
  acknowledgedByEmail: string | null;
  agencyProfile?: AgencyDocumentProfile;
};

type AgentDispatchDétailResponse = {
  ok: boolean;
  dispatch: AgentDispatchRow;
};

type DispatchEventResponse = {
  ok: boolean;
  event: "viewed" | "printed";
  telemetry: {
    viewedAtIso: string | null;
    lastViewedAtIso: string | null;
    viewedCount: number;
    printedAtIso: string | null;
    lastPrintedAtIso: string | null;
    printedCount: number;
  };
};

type MonthlyGroup = {
  id: string;
  label: string;
  monthNumber: number;
  year: number;
  days: Array<{
    key: string;
    date: Date;
    vacations: DispatchVacationSummary[];
  }>;
};

type SiteLegendEntry = {
  code: string;
  label: string;
  shortName: string;
  cellTone: string;
  badgeTone: string;
};

const SITE_TONE_PALETTE = [
  {
    cellTone: "border-l-sky-600 bg-sky-50/90",
    badgeTone: "border-sky-200 bg-sky-50 text-sky-800",
  },
  {
    cellTone: "border-l-emerald-600 bg-emerald-50/90",
    badgeTone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    cellTone: "border-l-violet-600 bg-violet-50/90",
    badgeTone: "border-violet-200 bg-violet-50 text-violet-800",
  },
  {
    cellTone: "border-l-amber-600 bg-amber-50/90",
    badgeTone: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    cellTone: "border-l-rose-600 bg-rose-50/90",
    badgeTone: "border-rose-200 bg-rose-50 text-rose-800",
  },
  {
    cellTone: "border-l-cyan-700 bg-cyan-50/90",
    badgeTone: "border-cyan-200 bg-cyan-50 text-cyan-800",
  },
];

const DEFAULT_MONTHLY_WORKLOAD_ALERT_HOURS = 180;

function formatRange(from?: string | null, to?: string | null) {
  if (!from || !to) return "Periode";

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${formatter.format(new Date(from))} - ${formatter.format(new Date(to))}`;
}

function formatMoment(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function getDispatchTarget(dispatch: AgentDispatchRow) {
  return (
    dispatch.deliveryTarget ||
    dispatch.agentEmail ||
    dispatch.agentPhone ||
    ""
  ).trim();
}

function getDispatchStatusLabel(dispatch: AgentDispatchRow) {
  if (dispatch.deliveryStatus === "blocked") return "Diffusion bloquée";

  if (dispatch.channel === "portal") {
    return dispatch.acknowledgedAtIso
      ? `Confirme le ${formatMoment(dispatch.acknowledgedAtIso)}`
      : "Reception en attente agent";
  }

  if (dispatch.channel === "email") return "Simulation email préparée";
  if (dispatch.channel === "whatsapp") return "Simulation WhatsApp préparée";

  return "Journalise en interne";
}

function getDispatchInstruction(dispatch: AgentDispatchRow) {
  if (dispatch.deliveryStatus === "blocked") {
    return dispatch.deliveryNote || "Diffusion non realisee : coordonnées manquantes.";
  }

  if (dispatch.channel === "email" || dispatch.channel === "whatsapp") {
    return dispatch.deliveryNote || "Simulation uniquement : aucun message réel n'a été envoyé.";
  }

  if (dispatch.channel === "portal") {
    return dispatch.acknowledgedAtIso
      ? "Planning confirme par l'agent."
      : "Planning publié dans le portail agent, confirmation en attente.";
  }

  return dispatch.deliveryNote || "Document journalise pour remise interne ou impression.";
}

function formatHour(value?: string | null) {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCompactHour(value?: string | null) {
  const valueAsText = formatHour(value);
  if (valueAsText === "--:--") return valueAsText;

  const [hour = "--", minute = "--"] = valueAsText.split(":");
  return minute === "00" ? `${hour}h` : `${hour}h${minute}`;
}

function formatCompactHourRange(
  startValue?: string | null,
  endValue?: string | null
) {
  const startDate = startValue ? new Date(startValue) : null;
  const endDate = endValue ? new Date(endValue) : null;

  if (
    startDate &&
    endDate &&
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(endDate.getTime()) &&
    startDate.getHours() === 0 &&
    startDate.getMinutes() === 0
  ) {
    const sameDayEnd =
      startDate.getFullYear() === endDate.getFullYear() &&
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getDate() === endDate.getDate() &&
      endDate.getHours() === 23 &&
      endDate.getMinutes() >= 55;
    const nextDayMidnight =
      endDate.getTime() ===
      new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate() + 1
      ).getTime();

    if (sameDayEnd || nextDayMidnight) return "00h-24h";
  }

  const start = formatCompactHour(startValue);
  const end = formatCompactHour(endValue);
  return `${start}-${end}`;
}

function toMillis(value?: string | null) {
  if (!value) return null;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : null;
}

function hasOverlappingVacations(vacations: DispatchVacationSummary[]) {
  for (let index = 0; index < vacations.length; index += 1) {
    const current = vacations[index];
    const currentStart = toMillis(current.startAtIso);
    const currentEnd = toMillis(current.endAtIso);
    if (currentStart === null || currentEnd === null) continue;

    for (let nextIndex = index + 1; nextIndex < vacations.length; nextIndex += 1) {
      const next = vacations[nextIndex];
      const nextStart = toMillis(next.startAtIso);
      const nextEnd = toMillis(next.endAtIso);
      if (nextStart === null || nextEnd === null) continue;

      if (currentStart < nextEnd && nextStart < currentEnd) {
        return true;
      }
    }
  }

  return false;
}

function getVacationSiteLabel(vacation: DispatchVacationSummary) {
  return String(vacation.siteName || vacation.title || "Site").trim() || "Site";
}

function makeShortSiteName(label: string) {
  const words = label
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "SITE";

  const compact = words
    .filter((word) => !["site", "securite", "security"].includes(word.toLowerCase()))
    .slice(0, 2)
    .join(" ");

  return (compact || words.slice(0, 2).join(" ")).toUpperCase().slice(0, 14);
}

function getVacationDurationHours(vacation: DispatchVacationSummary) {
  const start = toMillis(vacation.startAtIso);
  const end = toMillis(vacation.endAtIso);

  if (start === null || end === null || end <= start) return 0;
  return (end - start) / 3_600_000;
}

function formatHourQuantity(hours: number) {
  if (hours <= 0) return "";

  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0
    ? `${wholeHours}h`
    : `${wholeHours}h${String(minutes).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDayHeader(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "narrow",
  }).format(date);
}

function toDayKey(value?: string | Date | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getFirstMonthDate(
  fromIso?: string | null,
  vacations: DispatchVacationSummary[] = []
) {
  const firstStartIso =
    vacations.find((vacation) => Boolean(vacation.startAtIso))?.startAtIso ?? null;

  if (firstStartIso) return new Date(firstStartIso);
  if (fromIso) return new Date(fromIso);

  return new Date();
}

function getLastMonthDate(
  toIso?: string | null,
  vacations: DispatchVacationSummary[] = []
) {
  const lastEndIso =
    [...vacations]
      .reverse()
      .find((vacation) => Boolean(vacation.endAtIso))
      ?.endAtIso ?? null;

  if (lastEndIso) return new Date(lastEndIso);
  if (toIso) return new Date(toIso);

  return new Date();
}

function buildMonthlyGroups(
  fromIso?: string | null,
  toIso?: string | null,
  vacations: DispatchVacationSummary[] = []
): MonthlyGroup[] {
  const orderedVacations = [...vacations].sort((left, right) => {
    const l = left.startAtIso ? new Date(left.startAtIso).getTime() : 0;
    const r = right.startAtIso ? new Date(right.startAtIso).getTime() : 0;
    return l - r;
  });

  const start = getFirstMonthDate(fromIso, orderedVacations);
  const end = getLastMonthDate(toIso, orderedVacations);

  const vacationsByDay = orderedVacations.reduce<Record<string, DispatchVacationSummary[]>>(
    (acc, vacation) => {
      const key = toDayKey(vacation.startAtIso);
      if (!key) return acc;
      acc[key] ??= [];
      acc[key].push(vacation);
      return acc;
    },
    {}
  );

  const groups: MonthlyGroup[] = [];
  for (
    let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    cursor <= end;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  ) {
    const year = cursor.getFullYear();
    const monthNumber = cursor.getMonth();
    const dayCount = new Date(year, monthNumber + 1, 0).getDate();

    const days = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(year, monthNumber, index + 1);
      return {
        key: toDayKey(date) ?? `${year}-${monthNumber}-${index + 1}`,
        date,
        vacations: vacationsByDay[toDayKey(date) ?? ""] ?? [],
      };
    });

    groups.push({
      id: `${year}-${monthNumber + 1}`,
      label: formatMonthLabel(cursor),
      monthNumber,
      year,
      days,
    });
  }

  return groups;
}

function toAlphaCode(index: number) {
  let value = index;
  let result = "";

  do {
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return result;
}

function buildSiteLegend(vacations: DispatchVacationSummary[]) {
  const labels = Array.from(
    new Set(vacations.map((vacation) => getVacationSiteLabel(vacation)))
  );

  const legend = new Map<string, SiteLegendEntry>();

  labels.forEach((label, index) => {
    const tone = SITE_TONE_PALETTE[index % SITE_TONE_PALETTE.length];
    legend.set(label, {
      code: toAlphaCode(index),
      label,
      shortName: makeShortSiteName(label),
      cellTone: tone.cellTone,
      badgeTone: tone.badgeTone,
    });
  });

  return legend;
}

function getMissionCode(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const lower = text.toLowerCase();
  if (lower === "ads") return "ADS";
  if (lower === "ssiap 1") return "S1";
  if (lower === "ssiap 2") return "S2";
  if (lower === "ssiap 3") return "S3";
  if (lower.includes("cynophile")) return "CYN";
  if (lower.includes("ronde")) return "RON";
  if (lower.includes("accueil")) return "ACC";
  if (lower.includes("controle")) return "CTRL";
  if (lower.includes("surete")) return "EVT";
  if (lower.includes("intervention")) return "INT";
  return text.toUpperCase().slice(0, 4);
}

function getMissionTone(value?: string | null) {
  const lower = String(value ?? "").trim().toLowerCase();

  if (lower === "ads") return "border-l-slate-700 bg-slate-50";
  if (lower.startsWith("ssiap")) return "border-l-amber-600 bg-amber-50";
  if (lower.includes("cynophile")) return "border-l-emerald-600 bg-emerald-50";
  if (lower.includes("ronde")) return "border-l-sky-600 bg-sky-50";
  if (lower.includes("accueil")) return "border-l-cyan-700 bg-cyan-50";
  if (lower.includes("controle")) return "border-l-indigo-600 bg-indigo-50";
  if (lower.includes("surete")) return "border-l-fuchsia-600 bg-fuchsia-50";
  if (lower.includes("intervention")) return "border-l-rose-600 bg-rose-50";
  return "border-l-slate-400 bg-slate-50";
}

function getMissionLegendEntries(vacations: DispatchVacationSummary[]) {
  const values = Array.from(
    new Set(
      vacations
        .map((vacation) => String(vacation.missionType ?? "").trim())
        .filter(Boolean)
    )
  );

  return values.map((value) => ({
    label: value,
    code: getMissionCode(value),
    cellTone: getMissionTone(value),
    badgeTone: getMissionTone(value).replace("border-l-", "border-"),
  }));
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function buildSiteRowsForMonth(
  month: MonthlyGroup,
  siteLegend: Map<string, SiteLegendEntry>
) {
  const labels = Array.from(
    new Set(
      month.days.flatMap((day) =>
        day.vacations.map((vacation) => getVacationSiteLabel(vacation))
      )
    )
  ).sort((left, right) => left.localeCompare(right, "fr"));

  return labels.map((label) => {
    const vacationsByDay = month.days.reduce<Record<string, DispatchVacationSummary[]>>(
      (acc, day) => {
        const dayVacations = day.vacations.filter(
          (vacation) => getVacationSiteLabel(vacation) === label
        );

        if (dayVacations.length > 0) {
          acc[day.key] = dayVacations;
        }

        return acc;
      },
      {}
    );

    return {
      label,
      shortName: siteLegend.get(label)?.shortName ?? makeShortSiteName(label),
      entry: siteLegend.get(label),
      vacationsByDay,
    };
  });
}

function getDayTotalHours(day: MonthlyGroup["days"][number]) {
  return day.vacations.reduce(
    (total, vacation) => total + getVacationDurationHours(vacation),
    0
  );
}

function getMonthTotalHours(month: MonthlyGroup) {
  return month.days.reduce((total, day) => total + getDayTotalHours(day), 0);
}

export default function AgentPlanningPrintPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { firebaseUser, loading: authLoading } = useAuth();
  const [dispatch, setDispatch] = React.useState<AgentDispatchRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const viewedRef = React.useRef(false);
  const printedRef = React.useRef(false);

  const autoprint = searchParams.get("autoprint") === "1";
  const printedAt = React.useMemo(() => formatPrintDate(), []);

  const vacations = React.useMemo(() => {
    if (!dispatch) return [];

    return [...dispatch.vacations].sort((left, right) => {
      const l = left.startAtIso ? new Date(left.startAtIso).getTime() : 0;
      const r = right.startAtIso ? new Date(right.startAtIso).getTime() : 0;
      return l - r;
    });
  }, [dispatch]);

  const monthGroups = React.useMemo(
    () => buildMonthlyGroups(dispatch?.fromIso, dispatch?.toIso, vacations),
    [dispatch?.fromIso, dispatch?.toIso, vacations]
  );

  const siteLegend = React.useMemo(() => buildSiteLegend(vacations), [vacations]);
  const missionLegend = React.useMemo(
    () => getMissionLegendEntries(vacations),
    [vacations]
  );
  const agencyProfile = React.useMemo(() => {
    return dispatch?.agencyProfile ?? publicEnvAgencyProfile();
  }, [dispatch?.agencyProfile]);
  const conflictDayCount = React.useMemo(
    () =>
      monthGroups.reduce(
        (total, month) =>
          total +
          month.days.filter((day) => hasOverlappingVacations(day.vacations)).length,
        0
      ),
    [monthGroups]
  );
  const dispatchTotalHours = React.useMemo(
    () =>
      vacations.reduce(
        (total, vacation) => total + getVacationDurationHours(vacation),
        0
      ),
    [vacations]
  );
  const hasWorkloadAlert =
    dispatchTotalHours > DEFAULT_MONTHLY_WORKLOAD_ALERT_HOURS;

  React.useEffect(() => {
    if (!dispatch) return;

    const monthLabel = monthGroups[0]?.label ?? "Planning";
    document.title = `Planning agent - ${dispatch.agentName} - ${monthLabel}`;
  }, [dispatch, monthGroups]);

  const recordDispatchEvent = React.useCallback(
    async (event: "viewed" | "printed") => {
      if (!dispatch?.id || dispatch.id.startsWith("preview-") || !firebaseUser) {
        return;
      }

      try {
        const response = await apiFetch<DispatchEventResponse>(
          `/api/agent-dispatches/${dispatch.id}/events`,
          {
            method: "POST",
            body: { event },
          }
        );

        setDispatch((current) =>
          current && current.id === dispatch.id
            ? {
                ...current,
                ...response.telemetry,
              }
            : current
        );
      } catch {
        // La tracé est utile mais ne doit jamais bloquér la lecture du PDF.
      }
    },
    [dispatch?.id, firebaseUser]
  );

  const printDispatch = React.useCallback(() => {
    void recordDispatchEvent("printed").finally(() => window.print());
  }, [recordDispatchEvent]);

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      if (!params?.id) {
        setError("Planning introuvable.");
        setLoading(false);
        return;
      }

      try {
        const cached = window.localStorage.getItem(
          `sentrys:print-dispatch:${params.id}`
        );

        if (cached) {
          const parsed = JSON.parse(cached) as AgentDispatchRow;
          if (mounted && parsed?.id === params.id) {
            setDispatch(parsed);
            setLoading(false);
            setError(null);
            return;
          }
        }
      } catch {
        // Non bloquant : on retombe sur l'API.
      }

      if (authLoading) return;

      if (!firebaseUser) {
        setError("Session non disponible. Reconnectez-vous puis reessayez.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await apiFetch<AgentDispatchDétailResponse>(
          `/api/agent-dispatches/${params.id}`
        );
        if (!mounted) return;
        setDispatch(response.dispatch);
      } catch (loadError) {
        if (!mounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger la version imprimable."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [authLoading, firebaseUser, params?.id]);

  React.useEffect(() => {
    if (loading || !dispatch || viewedRef.current) return;
    if (!firebaseUser || dispatch.id.startsWith("preview-")) return;

    viewedRef.current = true;
    void recordDispatchEvent("viewed");
  }, [dispatch, firebaseUser, loading, recordDispatchEvent]);

  React.useEffect(() => {
    if (!autoprint || loading || !dispatch || printedRef.current) return;

    printedRef.current = true;
    const timer = window.setTimeout(() => printDispatch(), 180);
    return () => window.clearTimeout(timer);
  }, [autoprint, dispatch, loading, printDispatch]);

  return (
    <div className="min-h-dvh bg-white text-slate-950">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 6mm;
        }

        @media print {
          html,
          body {
            background: #ffffff !important;
          }

          .print-actions {
            display: none !important;
          }

          .print-shell {
            max-width: none !important;
            padding: 0 !important;
          }

          .print-card {
            box-shadow: none !important;
            border-radius: 10px !important;
          }

          .print-month-page {
            break-after: page;
          }

          .print-month-page:last-child {
            break-after: auto;
          }
        }

        .agent-time-chip {
          max-width: 100%;
          min-width: 0;
          padding: 0 1px;
          font-size: 6.8px;
          line-height: 1.15;
          letter-spacing: -0.07em;
          transform: scaleX(0.92);
          transform-origin: center;
        }
      `}</style>

      <div className="print-actions sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
              Planning mensuel agent
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Tableau mensuel par sites, optimise pour impression et PDF.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              Retour
            </Button>
            <Button
              type="button"
              onClick={printDispatch}
              className="bg-slate-700 text-white hover:bg-slate-600"
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimer / PDF
            </Button>
          </div>
        </div>
      </div>

      {dispatch && (
        <div className="print-actions border-b border-slate-200 bg-slate-50/90">
          <div className="mx-auto grid max-w-[1440px] gap-2 px-6 py-3 text-xs text-slate-600 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="font-black uppercase tracking-[0.14em] text-slate-400">
                Pre-vol PDF
              </p>
              <p className="mt-1 font-bold text-slate-800">
                {monthGroups.length} page(s) - {vacations.length} vacation(s)
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="font-black uppercase tracking-[0.14em] text-slate-400">
                Agent
              </p>
              <p className="mt-1 truncate font-bold text-slate-800">
                {dispatch.agentName}
              </p>
            </div>
            <div
              className={[
                "rounded-xl border px-3 py-2",
                conflictDayCount > 0 || hasWorkloadAlert
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
              ].join(" ")}
            >
              <p className="font-black uppercase tracking-[0.14em] opacity-70">
                Contrôle terrain
              </p>
              <p className="mt-1 font-bold">
                {conflictDayCount > 0
                  ? `${conflictDayCount} conflit(s) à vérifier`
                  : hasWorkloadAlert
                    ? `${formatHourQuantity(dispatchTotalHours)} - volume eleve`
                  : "Lisibilite prête"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="font-black uppercase tracking-[0.14em] text-slate-400">
                Diffusion
              </p>
              <p className="mt-1 truncate font-bold text-slate-800">
                {getDispatchStatusLabel(dispatch)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="print-shell mx-auto max-w-[1440px] px-4 py-4">
        {loading ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-700">
            {error}
          </div>
        ) : !dispatch ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-slate-700">
            Planning introuvable.
          </div>
        ) : (
          <div className="space-y-4">
            {monthGroups.map((month, index) => {
              const siteRows = buildSiteRowsForMonth(month, siteLegend);
              const monthTotal = formatHourQuantity(getMonthTotalHours(month)) || "0h";
              const dispatchTarget = getDispatchTarget(dispatch);
              const dispatchInstruction = getDispatchInstruction(dispatch);

              return (
                <section
                  key={month.id}
                  className="print-month-page print-card overflow-hidden border border-slate-200 bg-white"
                >
                  <div className="grid grid-cols-[1fr_1.15fr_1fr] items-start gap-4 border-b border-slate-200 px-4 py-3">
                    <div className="flex items-start gap-3">
                      {agencyProfile.logoUrl ? (
                        <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded border border-slate-200 bg-white p-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={agencyProfile.logoUrl}
                            alt={`Logo ${agencyProfile.displayName}`}
                            className="max-h-full w-auto object-contain"
                          />
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border-2 border-slate-900 bg-slate-900 text-lg font-black tracking-tight text-white">
                          {agencyProfile.displayName.slice(0, 1)}
                        </div>
                      )}
                      <div>
                        <p className="text-[15px] font-black uppercase leading-tight tracking-[0.08em] text-slate-950">
                          {agencyProfile.displayName}
                        </p>
                        <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                          {agencyProfile.legalName || "Service exploitation"}
                        </p>
                        {[
                          agencyProfile.addressLine1,
                          agencyProfile.addressLine2,
                          agencyProfile.phone ? `Tel. ${agencyProfile.phone}` : "",
                          agencyProfile.email,
                          agencyProfile.siret ? `SIRET : ${agencyProfile.siret}` : "",
                          agencyProfile.cnaps ? `CNAPS : ${agencyProfile.cnaps}` : "",
                        ]
                          .filter(Boolean)
                          .map((detail) => (
                          <p
                            key={detail}
                            className="mt-0.5 text-[9px] font-semibold leading-tight text-slate-500"
                          >
                            {detail}
                          </p>
                        ))}
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                        Planning mensuel détaillé
                      </p>
                      <h1 className="mt-1 text-2xl font-black capitalize leading-tight text-slate-950">
                        {month.label}
                      </h1>
                      <p className="mt-1 text-[11px] font-semibold text-slate-600">
                        {formatRange(dispatch.fromIso, dispatch.toIso)}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-500">
                        {dispatch.vacationCount} service(s) - {monthTotal}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Agent
                      </p>
                      <p className="mt-1 text-lg font-black leading-tight text-slate-950">
                        {dispatch.agentName}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold leading-tight text-slate-600">
                        {dispatch.agentEmail || "Email agent non renseigné"}
                      </p>
                      {dispatch.agentPhone && (
                        <p className="text-[10px] font-semibold leading-tight text-slate-600">
                          {dispatch.agentPhone}
                        </p>
                      )}
                      <div className="mt-1.5 inline-flex rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-700">
                        {dispatchChannelLabel(dispatch.channel)}
                      </div>
                      <p className="mt-1 text-[9px] font-semibold leading-tight text-slate-500">
                        Diffuse le {formatMoment(dispatch.sentAtIso)}
                      </p>
                      <p className="text-[9px] font-black leading-tight text-slate-700">
                        {getDispatchStatusLabel(dispatch)}
                      </p>
                      {dispatchTarget && (
                        <p className="text-[8.5px] font-semibold leading-tight text-slate-500">
                          Cible : {dispatchTarget}
                        </p>
                      )}
                      <p className="mt-1 text-[8.5px] font-semibold leading-tight text-slate-500">
                        {dispatchInstruction}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto px-2 py-2">
                    <table className="w-full table-fixed border-collapse">
                      <colgroup>
                        <col className="w-[128px]" />
                        {month.days.map((day) => (
                          <col key={`col-${day.key}`} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left align-middle text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
                            Sites
                          </th>
                          {month.days.map((day) => (
                            <th
                              key={`head-${day.key}`}
                              className={[
                                "border border-slate-300 px-0.5 py-1 text-center align-top",
                                isWeekend(day.date) ? "bg-amber-200/90" : "bg-white",
                              ].join(" ")}
                            >
                              <div
                                className={[
                                  "text-[8px] font-black uppercase",
                                  isWeekend(day.date)
                                    ? "text-amber-700"
                                    : "text-slate-500",
                                ].join(" ")}
                              >
                                {formatDayHeader(day.date)}
                              </div>
                              <div
                                className={[
                                  "text-[13px] font-black leading-tight",
                                  isWeekend(day.date)
                                    ? "text-amber-900"
                                    : "text-slate-900",
                                ].join(" ")}
                              >
                                {day.date.getDate()}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {siteRows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={month.days.length + 1}
                              className="border border-slate-200 px-3 py-8 text-center text-sm font-semibold text-slate-500"
                            >
                              Aucune vacation planifiee sur ce mois.
                            </td>
                          </tr>
                        ) : (
                          siteRows.map((row) => (
                            <tr key={`${month.id}-${row.label}`}>
                              <th className="border border-slate-300 bg-slate-100 px-2 py-1.5 text-left align-middle">
                                <div
                                  className={[
                                    "inline-flex max-w-full rounded border px-2 py-0.5 text-[10px] font-black uppercase leading-tight shadow-sm",
                                    row.entry?.badgeTone ??
                                      "border-slate-200 bg-white text-slate-800",
                                  ].join(" ")}
                                >
                                  {row.shortName}
                                </div>
                                <div className="mt-1 line-clamp-2 text-[8px] font-semibold leading-tight text-slate-500">
                                  {row.label}
                                </div>
                              </th>

                              {month.days.map((day) => {
                                const dayVacations = row.vacationsByDay[day.key] ?? [];
                                const dayHasConflict = hasOverlappingVacations(
                                  day.vacations
                                );

                                return (
                                  <td
                                    key={`${row.label}-${day.key}`}
                                    className={[
                                      "h-[46px] border border-slate-200 px-0.5 py-0.5 align-middle",
                                      isWeekend(day.date) ? "bg-amber-100/55" : "bg-white",
                                      dayHasConflict && dayVacations.length > 0
                                        ? "bg-rose-50/80"
                                        : "",
                                    ].join(" ")}
                                  >
                                    {dayVacations.length === 0 ? (
                                      <div className="h-full" />
                                    ) : (
                                      <div className="space-y-0.5">
                                        {dayVacations.slice(0, 2).map((vacation) => {
                                          const missionCode = getMissionCode(
                                            vacation.missionType
                                          );
                                          const missionTone = getMissionTone(
                                            vacation.missionType
                                          );

                                          return (
                                            <div
                                              key={vacation.id}
                                              className={[
                                                "rounded border border-l-[3px] bg-white px-0.5 py-[2px] text-center leading-tight shadow-sm",
                                                dayHasConflict
                                                  ? "border-rose-300 border-l-rose-600"
                                                  : row.entry?.cellTone ?? missionTone,
                                              ].join(" ")}
                                            >
                                              {dayHasConflict && (
                                                <div className="mb-[1px] text-[6.5px] font-black uppercase leading-none text-rose-700">
                                                  Conflit
                                                </div>
                                              )}
                                              <div className="agent-time-chip mx-auto inline-flex whitespace-nowrap rounded bg-white/90 font-mono font-black text-slate-950 ring-1 ring-slate-200">
                                                {formatCompactHourRange(
                                                  vacation.startAtIso,
                                                  vacation.endAtIso
                                                )}
                                              </div>
                                              {missionCode && (
                                                <div className="truncate text-[7px] font-black uppercase leading-none text-slate-500">
                                                  {missionCode}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                        {dayVacations.length > 2 && (
                                          <div className="text-center text-[7px] font-black text-slate-500">
                                            +{dayVacations.length - 2}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}

                        <tr>
                          <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left text-[10px] font-black uppercase tracking-[0.08em] text-slate-700">
                            Total jour
                          </th>
                          {month.days.map((day) => (
                            <td
                              key={`total-${day.key}`}
                              className={[
                                "border border-slate-300 px-0.5 py-1 text-center font-mono text-[8px] font-black text-slate-700",
                                isWeekend(day.date) ? "bg-amber-200/70" : "bg-slate-50",
                              ].join(" ")}
                            >
                              {formatHourQuantity(getDayTotalHours(day)) || "-"}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 border-t border-slate-200 px-4 py-3 text-[10px] text-slate-500 lg:grid-cols-[1.15fr_0.85fr_auto]">
                    <div>
                      <p className="mb-1 font-black uppercase tracking-[0.14em] text-slate-500">
                        Sites
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {siteRows.map((row) => (
                          <span
                            key={`${month.id}-${row.label}`}
                            className={[
                              "rounded-full border px-2 py-0.5 font-semibold",
                              row.entry?.badgeTone ??
                                "border-slate-200 bg-white text-slate-700",
                            ].join(" ")}
                          >
                            {row.shortName} = {row.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 font-black uppercase tracking-[0.14em] text-slate-500">
                        Missions
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {missionLegend.map((entry) => (
                          <span
                            key={`${month.id}-${entry.code}`}
                            className={[
                              "rounded-full border px-2 py-0.5 font-semibold text-slate-700",
                              entry.badgeTone,
                            ].join(" ")}
                          >
                            {entry.code} = {entry.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="self-start justify-self-end text-right">
                      <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
                        Total mois : {monthTotal}
                      </div>
                      {index === monthGroups.length - 1 &&
                        dispatch.acknowledgedAtIso && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Confirme
                          </div>
                      )}
                    </div>
                  </div>

                  <footer className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[9px] font-semibold text-slate-500">
                    <div className="leading-tight">
                      <p>
                        {agencyProfile.footerNote ||
                          "Document opérationnel - seule la derniere version diffusée fait foi."}
                      </p>
                      <p className="mt-0.5 text-slate-600">{dispatchInstruction}</p>
                    </div>
                    <p className="text-right leading-tight">
                      Edition : {printedAt}
                      <br />
                      Ref. diffusion {dispatch.id}
                    </p>
                  </footer>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
