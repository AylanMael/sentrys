import {
  DEFAULT_PREPAY_SETTINGS,
  parseTimeToMinutes,
  type PrepaySettings,
} from "@/lib/payroll/settings";

export type PrepayVacationInput = {
  id: string;
  agentId: string | null;
  agentName: string;
  payrollId: string | null;
  siteName: string | null;
  title: string | null;
  notes: string | null;
  startAtIso: string | null;
  endAtIso: string | null;
  status: string | null;
  isPublished: boolean;
  monthlyContractHours: number | null;
};

export type PrepayAgentRow = {
  agentId: string;
  agentName: string;
  payrollId: string;
  contractHours: number;
  totalHours: number;
  payableHours: number;
  absenceHours: number;
  nightHours: number;
  sundayHours: number;
  publicHolidayHours: number;
  mayFirstHours: number;
  weeklyOvertimeHours: number;
  contractOverageHours: number;
  workedVacationCount: number;
  workedDayCount: number;
  basePayAmount: number;
  nightPremiumAmount: number;
  sundayPremiumAmount: number;
  publicHolidayPremiumAmount: number;
  mayFirstPremiumAmount: number;
  mealAllowanceAmount: number;
  transportAllowanceAmount: number;
  estimatedGrossAmount: number;
  vacationCount: number;
  siteCount: number;
  siteNames: string[];
  anomalies: string[];
};

export type PrepayReport = {
  fromIso: string;
  toIso: string;
  rows: PrepayAgentRow[];
  summary: {
    agentCount: number;
    vacationCount: number;
    totalHours: number;
    payableHours: number;
    absenceHours: number;
    nightHours: number;
    sundayHours: number;
    publicHolidayHours: number;
    mayFirstHours: number;
    weeklyOvertimeHours: number;
    contractOverageHours: number;
    basePayAmount: number;
    premiumAmount: number;
    allowanceAmount: number;
    estimatedGrossAmount: number;
    anomalyCount: number;
    unassignedVacationCount: number;
    draftVacationCount: number;
  };
  warnings: string[];
  settings: PrepaySettings;
};

type SegmentBreakdown = {
  totalHours: number;
  nightHours: number;
  sundayHours: number;
  publicHolidayHours: number;
  mayFirstHours: number;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function frenchPublicHolidayKeys(year: number) {
  const easter = easterSunday(year);
  const holidays = [
    new Date(year, 0, 1),
    addDays(easter, 1),
    new Date(year, 4, 1),
    new Date(year, 4, 8),
    addDays(easter, 39),
    addDays(easter, 50),
    new Date(year, 6, 14),
    new Date(year, 7, 15),
    new Date(year, 10, 1),
    new Date(year, 10, 11),
    new Date(year, 11, 25),
  ];

  return new Set(holidays.map(dateKey));
}

function holidayKeysForRange(from: Date, to: Date) {
  const keys = new Set<string>();
  for (let year = from.getFullYear() - 1; year <= to.getFullYear() + 1; year += 1) {
    frenchPublicHolidayKeys(year).forEach((key) => keys.add(key));
  }
  return keys;
}

function timeOnDate(date: Date, minutes: number, dayOffset = 0) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + dayOffset);
  next.setMinutes(minutes);
  return next;
}

function nextBoundary(cursor: Date, end: Date, settings: PrepaySettings) {
  const candidates = [end.getTime()];
  const midnight = new Date(cursor);
  midnight.setHours(24, 0, 0, 0);
  candidates.push(midnight.getTime());

  const nightStart = parseTimeToMinutes(settings.nightStartTime) ?? 21 * 60;
  const nightEnd = parseTimeToMinutes(settings.nightEndTime) ?? 6 * 60;

  [nightStart, nightEnd].forEach((minutes) => {
    [0, 1].forEach((offset) => {
      const boundary = timeOnDate(cursor, minutes, offset);
      if (boundary.getTime() > cursor.getTime()) {
        candidates.push(boundary.getTime());
      }
    });
  });

  return new Date(Math.min(...candidates.filter((time) => time > cursor.getTime())));
}

function isNightSegment(date: Date, settings: PrepaySettings) {
  const minute = date.getHours() * 60 + date.getMinutes();
  const start = parseTimeToMinutes(settings.nightStartTime) ?? 21 * 60;
  const end = parseTimeToMinutes(settings.nightEndTime) ?? 6 * 60;

  if (start === end) return false;
  if (start < end) return minute >= start && minute < end;
  return minute >= start || minute < end;
}

function isAbsenceVacation(vacation: PrepayVacationInput) {
  const text = `${vacation.title ?? ""} ${vacation.notes ?? ""}`.toLowerCase();
  return ["absence", "conge", "congé", "maladie", "repos", "rtt"].some((word) =>
    text.includes(word)
  );
}

function splitInterval(
  start: Date,
  end: Date,
  holidayKeys: Set<string>,
  settings: PrepaySettings
): SegmentBreakdown {
  const result: SegmentBreakdown = {
    totalHours: 0,
    nightHours: 0,
    sundayHours: 0,
    publicHolidayHours: 0,
    mayFirstHours: 0,
  };

  let cursor = new Date(start);
  let guard = 0;

  while (cursor.getTime() < end.getTime() && guard < 10000) {
    const segmentEnd = nextBoundary(cursor, end, settings);
    const hours = Math.max(0, (segmentEnd.getTime() - cursor.getTime()) / 36e5);
    const key = dateKey(cursor);

    result.totalHours += hours;
    if (isNightSegment(cursor, settings)) result.nightHours += hours;
    if (cursor.getDay() === 0) result.sundayHours += hours;
    if (holidayKeys.has(key)) result.publicHolidayHours += hours;
    if (key.endsWith("-05-01")) result.mayFirstHours += hours;

    cursor = segmentEnd;
    guard += 1;
  }

  return result;
}

function weekKey(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function agentRow(
  agentId: string,
  agentName: string,
  payrollId: string | null,
  contractHours: number
): PrepayAgentRow {
  return {
    agentId,
    agentName,
    payrollId: payrollId || agentId,
    contractHours,
    totalHours: 0,
    payableHours: 0,
    absenceHours: 0,
    nightHours: 0,
    sundayHours: 0,
    publicHolidayHours: 0,
    mayFirstHours: 0,
    weeklyOvertimeHours: 0,
    contractOverageHours: 0,
    workedVacationCount: 0,
    workedDayCount: 0,
    basePayAmount: 0,
    nightPremiumAmount: 0,
    sundayPremiumAmount: 0,
    publicHolidayPremiumAmount: 0,
    mayFirstPremiumAmount: 0,
    mealAllowanceAmount: 0,
    transportAllowanceAmount: 0,
    estimatedGrossAmount: 0,
    vacationCount: 0,
    siteCount: 0,
    siteNames: [],
    anomalies: [],
  };
}

function sortRows(rows: PrepayAgentRow[]) {
  return [...rows].sort((left, right) => {
    if (right.payableHours !== left.payableHours) {
      return right.payableHours - left.payableHours;
    }
    return left.agentName.localeCompare(right.agentName);
  });
}

export function computePrepayReport(input: {
  from: Date;
  to: Date;
  vacations: PrepayVacationInput[];
  settings?: PrepaySettings;
}): PrepayReport {
  const { from, to } = input;
  const settings = input.settings ?? DEFAULT_PREPAY_SETTINGS;
  const holidayKeys = holidayKeysForRange(from, to);
  const rows = new Map<string, PrepayAgentRow>();
  const intervalsByAgent = new Map<string, Array<{ id: string; start: Date; end: Date }>>();
  const weeklyHours = new Map<string, Map<string, number>>();
  const workedDays = new Map<string, Set<string>>();
  const warnings: string[] = [
    "Pré-paie indicative : les taux, primes et majorations doivent être validés par le gestionnaire paie.",
    `Les heures de nuit sont classees sur la plage ${settings.nightStartTime}-${settings.nightEndTime}.`,
  ];

  let unassignedVacationCount = 0;
  let draftVacationCount = 0;
  let vacationCount = 0;

  input.vacations.forEach((vacation) => {
    if (vacation.status === "cancelled") return;

    const start = vacation.startAtIso ? new Date(vacation.startAtIso) : null;
    const end = vacation.endAtIso ? new Date(vacation.endAtIso) : null;

    if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      warnings.push(`Vacation ${vacation.id}: horaire invalide.`);
      return;
    }

    const clippedStart = new Date(Math.max(start.getTime(), from.getTime()));
    const clippedEnd = new Date(Math.min(end.getTime(), to.getTime()));
    if (clippedEnd.getTime() <= clippedStart.getTime()) return;

    vacationCount += 1;

    if (!vacation.agentId) {
      unassignedVacationCount += 1;
      return;
    }

    const contractHours =
      typeof vacation.monthlyContractHours === "number" &&
      Number.isFinite(vacation.monthlyContractHours) &&
      vacation.monthlyContractHours > 0
        ? vacation.monthlyContractHours
        : settings.monthlyDefaultHours;
    const row =
      rows.get(vacation.agentId) ??
      agentRow(
        vacation.agentId,
        vacation.agentName,
        vacation.payrollId,
        contractHours
      );
    const breakdown = splitInterval(clippedStart, clippedEnd, holidayKeys, settings);
    const absence = isAbsenceVacation(vacation);

    row.totalHours += breakdown.totalHours;
    row.vacationCount += 1;

    if (absence) {
      row.absenceHours += breakdown.totalHours;
      row.anomalies.push("Absence/conge détecté : vérifier le type avant export paie.");
    } else {
      row.payableHours += breakdown.totalHours;
      row.workedVacationCount += 1;
      row.nightHours += breakdown.nightHours;
      row.sundayHours += breakdown.sundayHours;
      row.publicHolidayHours += breakdown.publicHolidayHours;
      row.mayFirstHours += breakdown.mayFirstHours;

      const daySet = workedDays.get(vacation.agentId) ?? new Set<string>();
      daySet.add(dateKey(clippedStart));
      workedDays.set(vacation.agentId, daySet);
    }

    if (!vacation.isPublished) {
      draftVacationCount += 1;
      row.anomalies.push("Vacation non publiée ou modifiée depuis publication.");
    }

    if (breakdown.totalHours > 12.01) {
      row.anomalies.push("Vacation superieure a 12h : à vérifier avant pré-paie.");
    }

    if (vacation.siteName) {
      const sites = new Set(row.siteNames);
      sites.add(vacation.siteName);
      row.siteNames = Array.from(sites).slice(0, 8);
      row.siteCount = row.siteNames.length;
    }

    if (!absence) {
      const agentWeeks = weeklyHours.get(vacation.agentId) ?? new Map<string, number>();
      const key = weekKey(clippedStart);
      agentWeeks.set(key, (agentWeeks.get(key) ?? 0) + breakdown.totalHours);
      weeklyHours.set(vacation.agentId, agentWeeks);
    }

    const intervals = intervalsByAgent.get(vacation.agentId) ?? [];
    intervals.push({ id: vacation.id, start: clippedStart, end: clippedEnd });
    intervalsByAgent.set(vacation.agentId, intervals);
    rows.set(vacation.agentId, row);
  });

  rows.forEach((row, agentId) => {
    row.totalHours = round2(row.totalHours);
    row.payableHours = round2(row.payableHours);
    row.absenceHours = round2(row.absenceHours);
    row.nightHours = round2(row.nightHours);
    row.sundayHours = round2(row.sundayHours);
    row.publicHolidayHours = round2(row.publicHolidayHours);
    row.mayFirstHours = round2(row.mayFirstHours);
    row.contractOverageHours = round2(Math.max(0, row.payableHours - row.contractHours));
    row.workedDayCount = workedDays.get(agentId)?.size ?? 0;

    const weeks = weeklyHours.get(agentId);
    if (weeks) {
      row.weeklyOvertimeHours = round2(
        Array.from(weeks.values()).reduce(
          (total, hours) =>
            total + Math.max(0, hours - settings.weeklyOvertimeThreshold),
          0
        )
      );
    }

    row.basePayAmount = round2(row.payableHours * settings.hourlyBaseRate);
    row.nightPremiumAmount = round2(
      row.nightHours * settings.hourlyBaseRate * (settings.nightPremiumPercent / 100)
    );
    row.sundayPremiumAmount = round2(
      row.sundayHours * settings.hourlyBaseRate * (settings.sundayPremiumPercent / 100)
    );
    row.publicHolidayPremiumAmount = round2(
      row.publicHolidayHours *
        settings.hourlyBaseRate *
        (settings.publicHolidayPremiumPercent / 100)
    );
    row.mayFirstPremiumAmount = round2(
      row.mayFirstHours * settings.hourlyBaseRate * (settings.mayFirstPremiumPercent / 100)
    );

    const allowanceMultiplier =
      settings.allowanceMode === "per_shift"
        ? row.workedVacationCount
        : settings.allowanceMode === "per_worked_day"
          ? row.workedDayCount
          : 0;
    row.mealAllowanceAmount = round2(settings.mealAllowanceAmount * allowanceMultiplier);
    row.transportAllowanceAmount = round2(
      settings.transportAllowanceAmount * allowanceMultiplier
    );
    row.estimatedGrossAmount = round2(
      row.basePayAmount +
        row.nightPremiumAmount +
        row.sundayPremiumAmount +
        row.publicHolidayPremiumAmount +
        row.mayFirstPremiumAmount +
        row.mealAllowanceAmount +
        row.transportAllowanceAmount
    );

    const intervals = (intervalsByAgent.get(agentId) ?? []).sort(
      (left, right) => left.start.getTime() - right.start.getTime()
    );
    for (let index = 1; index < intervals.length; index += 1) {
      const previous = intervals[index - 1];
      const current = intervals[index];
      if (current.start.getTime() < previous.end.getTime()) {
        row.anomalies.push("Chevauchement détecté entre deux vacations.");
        break;
      }

      const restHours = (current.start.getTime() - previous.end.getTime()) / 36e5;
      if (restHours < 11) {
        row.anomalies.push("Repos inferieur a 11h entre deux vacations.");
        break;
      }
    }

    row.anomalies = Array.from(new Set(row.anomalies)).slice(0, 8);
  });

  const finalRows = sortRows(Array.from(rows.values()));
  const sum = (selector: (row: PrepayAgentRow) => number) =>
    round2(finalRows.reduce((total, row) => total + selector(row), 0));

  return {
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    rows: finalRows,
    summary: {
      agentCount: finalRows.length,
      vacationCount,
      totalHours: sum((row) => row.totalHours),
      payableHours: sum((row) => row.payableHours),
      absenceHours: sum((row) => row.absenceHours),
      nightHours: sum((row) => row.nightHours),
      sundayHours: sum((row) => row.sundayHours),
      publicHolidayHours: sum((row) => row.publicHolidayHours),
      mayFirstHours: sum((row) => row.mayFirstHours),
      weeklyOvertimeHours: sum((row) => row.weeklyOvertimeHours),
      contractOverageHours: sum((row) => row.contractOverageHours),
      basePayAmount: sum((row) => row.basePayAmount),
      premiumAmount: sum(
        (row) =>
          row.nightPremiumAmount +
          row.sundayPremiumAmount +
          row.publicHolidayPremiumAmount +
          row.mayFirstPremiumAmount
      ),
      allowanceAmount: sum(
        (row) => row.mealAllowanceAmount + row.transportAllowanceAmount
      ),
      estimatedGrossAmount: sum((row) => row.estimatedGrossAmount),
      anomalyCount: finalRows.reduce((total, row) => total + row.anomalies.length, 0),
      unassignedVacationCount,
      draftVacationCount,
    },
    warnings,
    settings,
  };
}
