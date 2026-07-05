"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client-fetch";
import { useAuth } from "@/lib/auth-provider";
import {
  publicEnvAgencyProfile,
  type AgencyDocumentProfile,
} from "@/lib/agency/profile";

type SitePrintItem = {
  id: string;
  name: string | null;
  clientId?: string | null;
  clientName?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
};

type AgentPrintItem = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  employeeNumber?: string | null;
  qualifications?: string[];
};

type VacationPrintItem = {
  id: string;
  siteId: string | null;
  siteName: string | null;
  title: string | null;
  missionType?: string | null;
  requiredQualification?: string | null;
  assignedAgentIds: string[];
  requiredAgents: number;
  startAtIso: string | null;
  endAtIso: string | null;
  status: string;
};

type SitesResponse = {
  ok: boolean;
  sites: SitePrintItem[];
};

type AgentsResponse = {
  ok: boolean;
  agents: AgentPrintItem[];
};

type VacationsResponse = {
  ok: boolean;
  vacations: VacationPrintItem[];
};

type AgencyProfileResponse = {
  ok: boolean;
  profile: AgencyDocumentProfile;
};

type DayColumn = {
  key: string;
  date: Date;
};

type SitePlanRow = {
  id: string;
  label: string;
  subtitle: string | null;
  isUnassigned: boolean;
  totalHours: number;
  vacationsByDay: Record<string, VacationPrintItem[]>;
};

type SitePlan = {
  site: SitePrintItem;
  vacations: VacationPrintItem[];
  rows: SitePlanRow[];
  totalHours: number;
  plannedAgentCount: number;
  missingAgentCount: number;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function toMillis(value?: string | null) {
  if (!value) return null;
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : null;
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

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
  };
}

function coerceDateIso(value: string | null, fallbackIso: string) {
  if (!value) return fallbackIso;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallbackIso : date.toISOString();
}

function buildDays(fromIso: string, toIso: string) {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());

  if (end.getTime() <= start.getTime()) {
    return Array.from({ length: 31 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), index + 1);
      return { key: toDayKey(date) ?? `${index}`, date };
    });
  }

  const days: DayColumn[] = [];
  for (
    let cursor = new Date(start);
    cursor < end && days.length < 62;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  ) {
    days.push({ key: toDayKey(cursor) ?? `${days.length}`, date: new Date(cursor) });
  }

  return days;
}

function formatMonthLabel(fromIso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(fromIso));
}

function formatRange(fromIso: string, toIso: string) {
  const from = new Date(fromIso);
  const to = new Date(new Date(toIso).getTime() - 24 * 60 * 60 * 1000);
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

function formatDayHeader(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "narrow",
  }).format(date);
}

function formatHour(value?: string | null) {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCompactHour(value?: string | null) {
  const hourText = formatHour(value);
  if (hourText === "--:--") return hourText;

  const [hour = "--", minute = "--"] = hourText.split(":");
  return minute === "00" ? `${hour}h` : `${hour}h${minute}`;
}

function formatCompactHourRange(vacation: VacationPrintItem) {
  const start = vacation.startAtIso ? new Date(vacation.startAtIso) : null;
  const end = vacation.endAtIso ? new Date(vacation.endAtIso) : null;

  if (
    start &&
    end &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    start.getHours() === 0 &&
    start.getMinutes() === 0
  ) {
    const sameDayEnd =
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate() &&
      end.getHours() === 23 &&
      end.getMinutes() >= 55;
    const nextDayMidnight =
      end.getTime() ===
      new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + 1
      ).getTime();

    if (sameDayEnd || nextDayMidnight) return "00h-24h";
  }

  return `${formatCompactHour(vacation.startAtIso)}-${formatCompactHour(
    vacation.endAtIso
  )}`;
}

function getVacationDurationHours(vacation: VacationPrintItem) {
  const start = toMillis(vacation.startAtIso);
  const end = toMillis(vacation.endAtIso);

  if (start === null || end === null || end <= start) return 0;
  return (end - start) / 3_600_000;
}

function formatHourQuantity(hours: number) {
  if (hours <= 0) return "0h";

  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes === 0
    ? `${wholeHours}h`
    : `${wholeHours}h${String(minutes).padStart(2, "0")}`;
}

function getAgentName(agent?: AgentPrintItem | null) {
  if (!agent) return "Agent non renseigne";

  const name = `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim();
  const employeeNumber = normalizeText(agent.employeeNumber);

  return name || (employeeNumber ? `Matricule ${employeeNumber}` : "Agent sans nom");
}

function getAgentSubtitle(agent?: AgentPrintItem | null) {
  if (!agent) return null;

  const employeeNumber = normalizeText(agent.employeeNumber);
  const qualifications = Array.isArray(agent.qualifications)
    ? agent.qualifications.map(normalizeText).filter(Boolean)
    : [];

  const details = [
    employeeNumber ? `Matricule ${employeeNumber}` : "",
    qualifications.slice(0, 3).join(" - "),
  ].filter(Boolean);

  return details.join(" | ") || null;
}

function getMissionCode(vacation: VacationPrintItem) {
  const value = normalizeText(
    vacation.missionType || vacation.requiredQualification || vacation.title
  );

  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower === "ads") return "ADS";
  if (lower.includes("ssiap 1")) return "S1";
  if (lower.includes("ssiap 2")) return "S2";
  if (lower.includes("ssiap 3")) return "S3";
  if (lower.includes("cynophile")) return "CYN";
  if (lower.includes("ronde")) return "RON";
  if (lower.includes("accueil")) return "ACC";
  if (lower.includes("controle")) return "CTRL";

  return value.toUpperCase().slice(0, 4);
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getSiteLabel(site: SitePrintItem) {
  return normalizeText(site.name) || "Site sans nom";
}

function getSiteSubtitle(site: SitePrintItem) {
  const cityLine = [site.postalCode, site.city].map(normalizeText).filter(Boolean).join(" ");
  return [site.clientName, site.address, cityLine].map(normalizeText).filter(Boolean);
}

function safeAssignedIds(vacation: VacationPrintItem) {
  return Array.isArray(vacation.assignedAgentIds)
    ? vacation.assignedAgentIds.filter(Boolean)
    : [];
}

function buildSitePlans(input: {
  sites: SitePrintItem[];
  vacations: VacationPrintItem[];
  agents: AgentPrintItem[];
  selectedSiteId: string | null;
  selectedClientId: string | null;
}) {
  const { sites, vacations, agents, selectedSiteId, selectedClientId } = input;
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const fallbackSites = new Map<string, SitePrintItem>();

  vacations.forEach((vacation) => {
    const siteId = normalizeText(vacation.siteId);
    if (!siteId || sitesById.has(siteId)) return;
    fallbackSites.set(siteId, {
      id: siteId,
      name: vacation.siteName || vacation.title || "Site",
    });
  });

  const siteIds =
    selectedSiteId && selectedSiteId !== "all"
      ? [selectedSiteId]
      : selectedClientId
        ? sites.map((site) => site.id)
      : Array.from(
          new Set(
            vacations
              .map((vacation) => normalizeText(vacation.siteId))
              .filter(Boolean)
          )
        );

  return siteIds
    .map((siteId) => sitesById.get(siteId) || fallbackSites.get(siteId))
    .filter(Boolean)
    .map((site) => {
      const resolvedSite = site as SitePrintItem;
      const siteVacations = vacations
        .filter((vacation) => vacation.siteId === resolvedSite.id)
        .sort((left, right) => (toMillis(left.startAtIso) ?? 0) - (toMillis(right.startAtIso) ?? 0));

      const rowsByAgent = new Map<string, SitePlanRow>();
      const unassignedRow: SitePlanRow = {
        id: "__unassigned",
        label: "A affecter",
        subtitle: "Vacation sans agent planifie",
        isUnassigned: true,
        totalHours: 0,
        vacationsByDay: {},
      };

      let missingAgentCount = 0;
      const plannedAgentIds = new Set<string>();

      siteVacations.forEach((vacation) => {
        const dayKey = toDayKey(vacation.startAtIso);
        if (!dayKey) return;

        const assignedIds = safeAssignedIds(vacation);
        const requiredAgents = Math.max(1, Number(vacation.requiredAgents || 1));
        missingAgentCount += Math.max(0, requiredAgents - assignedIds.length);

        if (assignedIds.length === 0) {
          unassignedRow.vacationsByDay[dayKey] ??= [];
          unassignedRow.vacationsByDay[dayKey].push(vacation);
          unassignedRow.totalHours += getVacationDurationHours(vacation);
          return;
        }

        assignedIds.forEach((agentId) => {
          plannedAgentIds.add(agentId);
          const agent = agentsById.get(agentId);
          const row =
            rowsByAgent.get(agentId) ??
            ({
              id: agentId,
              label: getAgentName(agent),
              subtitle: getAgentSubtitle(agent),
              isUnassigned: false,
              totalHours: 0,
              vacationsByDay: {},
            } satisfies SitePlanRow);

          row.vacationsByDay[dayKey] ??= [];
          row.vacationsByDay[dayKey].push(vacation);
          row.totalHours += getVacationDurationHours(vacation);
          rowsByAgent.set(agentId, row);
        });
      });

      const rows = Array.from(rowsByAgent.values()).sort((left, right) =>
        left.label.localeCompare(right.label, "fr")
      );

      if (unassignedRow.totalHours > 0) {
        rows.unshift(unassignedRow);
      }

      return {
        site: resolvedSite,
        vacations: siteVacations,
        rows,
        totalHours: siteVacations.reduce(
          (total, vacation) => total + getVacationDurationHours(vacation),
          0
        ),
        plannedAgentCount: plannedAgentIds.size,
        missingAgentCount,
      } satisfies SitePlan;
    });
}

function getDayVacationCount(plan: SitePlan, dayKey: string) {
  return plan.vacations.filter((vacation) => toDayKey(vacation.startAtIso) === dayKey)
    .length;
}

export default function SitePlanningPrintPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      }
    >
      <SitePlanningPrintContent />
    </React.Suspense>
  );
}

function SitePlanningPrintContent() {
  const searchParams = useSearchParams();
  const { firebaseUser, loading: authLoading } = useAuth();
  const defaultDates = React.useMemo(() => defaultRange(), []);
  const fromIso = coerceDateIso(searchParams.get("from"), defaultDates.fromIso);
  const toIso = coerceDateIso(searchParams.get("to"), defaultDates.toIso);
  const selectedSiteId = normalizeText(searchParams.get("siteId")) || null;
  const selectedClientId = normalizeText(searchParams.get("clientId")) || null;
  const printedAt = React.useMemo(() => formatPrintDate(), []);

  const [sites, setSites] = React.useState<SitePrintItem[]>([]);
  const [agents, setAgents] = React.useState<AgentPrintItem[]>([]);
  const [vacations, setVacations] = React.useState<VacationPrintItem[]>([]);
  const [agencyProfile, setAgencyProfile] = React.useState<AgencyDocumentProfile>(
    () => publicEnvAgencyProfile()
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const days = React.useMemo(() => buildDays(fromIso, toIso), [fromIso, toIso]);
  const sitePlans = React.useMemo(
    () =>
      buildSitePlans({
        sites,
        vacations,
        agents,
        selectedSiteId,
        selectedClientId,
      }),
    [agents, selectedClientId, selectedSiteId, sites, vacations]
  );
  const preflightStats = React.useMemo(() => {
    const plannedAgents = new Set<string>();

    sitePlans.forEach((plan) => {
      plan.rows.forEach((row) => {
        if (!row.isUnassigned) plannedAgents.add(row.id);
      });
    });

    return {
      pages: sitePlans.length,
      vacations: sitePlans.reduce((total, plan) => total + plan.vacations.length, 0),
      missingAgents: sitePlans.reduce(
        (total, plan) => total + plan.missingAgentCount,
        0
      ),
      plannedAgents: plannedAgents.size,
    };
  }, [sitePlans]);

  React.useEffect(() => {
    const monthLabel = formatMonthLabel(fromIso);
    const clientLabel =
      selectedClientId && sitePlans[0]?.site.clientName
        ? sitePlans[0].site.clientName
        : null;
    const siteLabel =
      clientLabel ||
      (sitePlans.length === 1 ? getSiteLabel(sitePlans[0].site) : "Tous les sites");

    document.title = `Planning site - ${siteLabel} - ${monthLabel}`;
  }, [fromIso, selectedClientId, sitePlans]);

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
        const params = new URLSearchParams({
          from: fromIso,
          to: toIso,
          max: "500",
        });

        if (selectedSiteId && selectedSiteId !== "all") {
          params.set("siteId", selectedSiteId);
        }

        const sitesParams = new URLSearchParams({
          max: "200",
          isActive: "true",
        });

        if (selectedClientId) {
          sitesParams.set("clientId", selectedClientId);
        }

        const [sitesResponse, vacationsResponse, profileResponse] = await Promise.all([
          apiFetch<SitesResponse>(`/api/sites?${sitesParams.toString()}`),
          apiFetch<VacationsResponse>(`/api/vacations?${params.toString()}`),
          apiFetch<AgencyProfileResponse>("/api/agency-profile").catch(() => null),
        ]);
        const loadedSites = sitesResponse.sites ?? [];
        const allowedSiteIds =
          selectedClientId && selectedSiteId !== "all"
            ? new Set(loadedSites.map((site) => site.id))
            : null;
        const loadedVacations = allowedSiteIds
          ? (vacationsResponse.vacations ?? []).filter(
              (vacation) => vacation.siteId && allowedSiteIds.has(vacation.siteId)
            )
          : vacationsResponse.vacations ?? [];

        const assignedIds = Array.from(
          new Set(
            loadedVacations.flatMap((vacation) => safeAssignedIds(vacation))
          )
        );

        const agentsResponse =
          assignedIds.length > 0
            ? await apiFetch<AgentsResponse>(
                `/api/agents?status=all&max=200&ids=${encodeURIComponent(
                  assignedIds.join(",")
                )}`
              )
            : { ok: true, agents: [] };

        if (!mounted) return;

        setSites(loadedSites);
        setVacations(loadedVacations);
        setAgents(agentsResponse.agents ?? []);
        if (profileResponse?.profile) {
          setAgencyProfile(profileResponse.profile);
        }
      } catch (loadError) {
        if (!mounted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger le planning site."
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [authLoading, firebaseUser, fromIso, selectedClientId, selectedSiteId, toIso]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 7mm;
        }

        @media print {
          body {
            background: white !important;
          }

          .print-actions {
            display: none !important;
          }

          .print-shell {
            max-width: none !important;
            padding: 0 !important;
          }

          .site-print-page {
            break-after: page;
            page-break-after: always;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .site-print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }

        .site-time-chip {
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
              Planning site client
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Tableau par site avec agents planifies, horaires et vacations a affecter.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
            <Button
              type="button"
              onClick={() => window.print()}
              className="bg-slate-800 text-white hover:bg-slate-700"
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimer / PDF
            </Button>
          </div>
        </div>
      </div>

      {sitePlans.length > 0 && (
        <div className="print-actions border-b border-slate-200 bg-slate-50/90">
          <div className="mx-auto grid max-w-[1440px] gap-2 px-6 py-3 text-xs text-slate-600 md:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="font-black uppercase tracking-[0.14em] text-slate-400">
                Pre-vol PDF
              </p>
              <p className="mt-1 font-bold text-slate-800">
                {preflightStats.pages} page(s) - {preflightStats.vacations} service(s)
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="font-black uppercase tracking-[0.14em] text-slate-400">
                Agents visibles
              </p>
              <p className="mt-1 font-bold text-slate-800">
                {preflightStats.plannedAgents} agent(s) planifie(s)
              </p>
            </div>
            <div
              className={[
                "rounded-xl border px-3 py-2",
                preflightStats.missingAgents > 0
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700",
              ].join(" ")}
            >
              <p className="font-black uppercase tracking-[0.14em] opacity-70">
                Couverture
              </p>
              <p className="mt-1 font-bold">
                {preflightStats.missingAgents > 0
                  ? `${preflightStats.missingAgents} poste(s) a affecter`
                  : "Complete"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="font-black uppercase tracking-[0.14em] text-slate-400">
                Client
              </p>
              <p className="mt-1 truncate font-bold text-slate-800">
                {sitePlans.length === 1
                  ? getSiteLabel(sitePlans[0].site)
                  : selectedClientId && sitePlans[0]?.site.clientName
                    ? sitePlans[0].site.clientName
                  : "Toutes les pages site"}
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
        ) : sitePlans.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-700">
            Aucun planning site a imprimer sur cette periode.
          </div>
        ) : (
          <div className="space-y-4">
            {sitePlans.map((plan) => {
              const siteDetails = getSiteSubtitle(plan.site);
              const siteLabel = getSiteLabel(plan.site);

              return (
                <section
                  key={plan.site.id}
                  className="site-print-page overflow-hidden border border-slate-200 bg-white shadow-sm"
                >
                  <div className="grid grid-cols-[1fr_1.25fr_1fr] items-start gap-4 border-b border-slate-200 px-4 py-3">
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
                        Planning mensuel site
                      </p>
                      <h1 className="mt-1 text-2xl font-black capitalize leading-tight text-slate-950">
                        {formatMonthLabel(fromIso)}
                      </h1>
                      <p className="mt-1 text-[11px] font-semibold text-slate-600">
                        {formatRange(fromIso, toIso)}
                      </p>
                      <div className="mt-2 inline-flex gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">
                        {plan.vacations.length} service(s) -{" "}
                        {plan.plannedAgentCount} agent(s) -{" "}
                        {formatHourQuantity(plan.totalHours)}
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
                        Site client
                      </p>
                      <p className="mt-1 text-lg font-black leading-tight text-slate-950">
                        {siteLabel}
                      </p>
                      {siteDetails.map((detail) => (
                        <p
                          key={detail}
                          className="mt-0.5 text-[9px] font-semibold leading-tight text-slate-500"
                        >
                          {detail}
                        </p>
                      ))}
                      <div
                        className={[
                          "mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em]",
                          plan.missingAgentCount > 0
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700",
                        ].join(" ")}
                      >
                        {plan.missingAgentCount > 0
                          ? `${plan.missingAgentCount} poste(s) a affecter`
                          : "Couverture complete"}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto px-2 py-2">
                    <table className="w-full table-fixed border-collapse">
                      <colgroup>
                        <col className="w-[138px]" />
                        {days.map((day) => (
                          <col key={`col-${plan.site.id}-${day.key}`} />
                        ))}
                        <col className="w-[52px]" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left align-middle text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
                            Agents
                          </th>
                          {days.map((day) => (
                            <th
                              key={`head-${plan.site.id}-${day.key}`}
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
                          <th className="border border-slate-300 bg-slate-100 px-1 py-1 text-center text-[9px] font-black uppercase text-slate-600">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={days.length + 2}
                              className="border border-slate-200 px-3 py-8 text-center text-sm font-semibold text-slate-500"
                            >
                              Aucun agent planifie sur ce site pour cette periode.
                            </td>
                          </tr>
                        ) : (
                          plan.rows.map((row) => (
                            <tr key={`${plan.site.id}-${row.id}`}>
                              <th
                                className={[
                                  "border border-slate-300 px-2 py-1.5 text-left align-middle",
                                  row.isUnassigned ? "bg-rose-50" : "bg-slate-100",
                                ].join(" ")}
                              >
                                <div
                                  className={[
                                    "inline-flex max-w-full rounded border px-2 py-0.5 text-[9px] font-black uppercase leading-tight shadow-sm",
                                    row.isUnassigned
                                      ? "border-rose-200 bg-white text-rose-700"
                                      : "border-slate-200 bg-white text-slate-800",
                                  ].join(" ")}
                                >
                                  {row.label}
                                </div>
                                {row.subtitle && (
                                  <div className="mt-1 line-clamp-2 text-[8px] font-semibold leading-tight text-slate-500">
                                    {row.subtitle}
                                  </div>
                                )}
                              </th>

                              {days.map((day) => {
                                const dayVacations = row.vacationsByDay[day.key] ?? [];

                                return (
                                  <td
                                    key={`${plan.site.id}-${row.id}-${day.key}`}
                                    className={[
                                      "h-[46px] border border-slate-200 px-0.5 py-0.5 align-middle",
                                      isWeekend(day.date) ? "bg-amber-100/55" : "bg-white",
                                      row.isUnassigned && dayVacations.length > 0
                                        ? "bg-rose-50/90"
                                        : "",
                                    ].join(" ")}
                                  >
                                    {dayVacations.length === 0 ? (
                                      <div className="h-full" />
                                    ) : (
                                      <div className="space-y-0.5">
                                        {dayVacations.slice(0, 2).map((vacation) => (
                                          <div
                                            key={vacation.id}
                                            className={[
                                              "rounded border border-l-[3px] bg-white px-0.5 py-[2px] text-center leading-tight shadow-sm",
                                              row.isUnassigned
                                                ? "border-rose-300 border-l-rose-600"
                                                : "border-sky-200 border-l-sky-600",
                                            ].join(" ")}
                                          >
                                            <div className="site-time-chip mx-auto inline-flex whitespace-nowrap rounded bg-white/90 font-mono font-black text-slate-950 ring-1 ring-slate-200">
                                              {formatCompactHourRange(vacation)}
                                            </div>
                                            {getMissionCode(vacation) && (
                                              <div className="truncate text-[7px] font-black uppercase leading-none text-slate-500">
                                                {getMissionCode(vacation)}
                                              </div>
                                            )}
                                          </div>
                                        ))}
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

                              <td className="border border-slate-300 bg-slate-50 px-1 py-1 text-center font-mono text-[8px] font-black text-slate-700">
                                {formatHourQuantity(row.totalHours)}
                              </td>
                            </tr>
                          ))
                        )}

                        <tr>
                          <th className="border border-slate-300 bg-slate-100 px-2 py-1 text-left text-[10px] font-black uppercase tracking-[0.08em] text-slate-700">
                            Services/jour
                          </th>
                          {days.map((day) => (
                            <td
                              key={`total-${plan.site.id}-${day.key}`}
                              className={[
                                "border border-slate-300 px-0.5 py-1 text-center font-mono text-[8px] font-black text-slate-700",
                                isWeekend(day.date) ? "bg-amber-200/70" : "bg-slate-50",
                              ].join(" ")}
                            >
                              {getDayVacationCount(plan, day.key) || "-"}
                            </td>
                          ))}
                          <td className="border border-slate-300 bg-slate-100 px-1 py-1 text-center font-mono text-[8px] font-black text-slate-700">
                            {plan.vacations.length}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-[9px] font-semibold text-slate-500">
                    <div className="leading-tight">
                      <p>
                        Case vide = agent non planifie sur ce site. Ligne rouge =
                        vacation a affecter.
                      </p>
                      <p className="mt-0.5">
                        {agencyProfile.footerNote ||
                          "Document operationnel - seule la derniere version diffusee fait foi."}
                      </p>
                    </div>
                    <p className="text-right leading-tight">
                      Edition : {printedAt}
                      <br />
                      Periode : {formatRange(fromIso, toIso)}
                    </p>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
