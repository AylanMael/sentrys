import { parsePlanningDateTime, toParisDateTimeValue } from "./paris-time";
import { shiftParisDays } from "./paris-recurrence";

export const SITE_TEMPLATE_DAY_OPTIONS = [
  { value: 1, label: "Lundi", shortLabel: "Lun" },
  { value: 2, label: "Mardi", shortLabel: "Mar" },
  { value: 3, label: "Mercredi", shortLabel: "Mer" },
  { value: 4, label: "Jeudi", shortLabel: "Jeu" },
  { value: 5, label: "Vendredi", shortLabel: "Ven" },
  { value: 6, label: "Samedi", shortLabel: "Sam" },
  { value: 7, label: "Dimanche", shortLabel: "Dim" },
] as const;

export type SiteTemplateDay = (typeof SITE_TEMPLATE_DAY_OPTIONS)[number]["value"];

export interface SitePlanningTemplateEntry {
  dayOfWeek: SiteTemplateDay;
  startTime: string;
  endTime: string;
  missionType: string | null;
  title: string | null;
  requiredQualification: string | null;
  assignedAgentId: string | null;
  notes: string | null;
}

export interface SitePlanningTemplate {
  id: string;
  siteId: string;
  siteName: string | null;
  name: string;
  entries: SitePlanningTemplateEntry[];
  updatedAtIso: string | null;
}

const HALF_HOUR_TIME_REGEX = /^([01]\d|2[0-3]):(00|30)$/;

export function normalizeTemplateText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function isHalfHourTime(value: unknown): value is string {
  return HALF_HOUR_TIME_REGEX.test(String(value ?? ""));
}

export function buildHalfHourTimeOptions() {
  const options: string[] = [];

  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 30) {
      options.push(
        `${`${hour}`.padStart(2, "0")}:${`${minute}`.padStart(2, "0")}`
      );
    }
  }

  return options;
}

export function getWeekStartMonday(date: Date) {
  const next = parisTemplateDay(date);
  const weekday = new Date(`${toParisDateTimeValue(next).slice(0, 10)}T00:00:00Z`).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return shiftParisDays(next, mondayOffset);
}

export function addWeeks(date: Date, weeks: number) {
  return shiftParisDays(date, weeks * 7);
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function buildDateTimeOnDate(date: Date, time: string) {
  const value = `${toParisDateTimeValue(date).slice(0, 10)}T${time}`;
  const instant = isHalfHourTime(time) ? parsePlanningDateTime(value) : null;
  if (!instant) throw new Error(`Horaire ${value} invalide, inexistant ou ambigu en heure de Paris. Aucune vacation préparée : ajustez le modèle ou la période.`);
  return instant;
}

export function buildDateRangeForTemplateEntry(
  date: Date,
  entry: Pick<SitePlanningTemplateEntry, "startTime" | "endTime">
) {
  const start = buildDateTimeOnDate(date, entry.startTime);
  const endDay = timeToMinutes(entry.endTime) <= timeToMinutes(entry.startTime)
    ? shiftParisDays(parisTemplateDay(date), 1) : date;
  const end = buildDateTimeOnDate(endDay, entry.endTime);

  return { start, end };
}

export function buildDateRangeFromWeekStart(
  weekStart: Date,
  entry: Pick<SitePlanningTemplateEntry, "dayOfWeek" | "startTime" | "endTime">
) {
  const targetDate = shiftParisDays(parisTemplateDay(weekStart), entry.dayOfWeek - 1);
  return buildDateRangeForTemplateEntry(targetDate, entry);
}

export function matchesTemplateDay(date: Date, dayOfWeek: SiteTemplateDay) {
  const jsDay = new Date(`${toParisDateTimeValue(date).slice(0, 10)}T00:00:00Z`).getUTCDay();
  const normalized = jsDay === 0 ? 7 : jsDay;
  return normalized === dayOfWeek;
}

function parisTemplateDay(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new Error("Date de modèle invalide en heure de Paris.");
  const day = parsePlanningDateTime(toParisDateTimeValue(date).slice(0, 10));
  if (!day) throw new Error("Date de modèle invalide en heure de Paris.");
  return day;
}

/** Prepare every boundary before exposing anything to the caller (DST errors are atomic). */
export function prepareSiteTemplateWindows(
  entries: SitePlanningTemplateEntry[],
  target: "visible_period" | "next_week" | "next_month",
  range?: { from?: string | null; to?: string | null } | null,
  now = new Date()
) {
  const windows: Array<{ entry: SitePlanningTemplateEntry; entryIndex: number; start: Date; end: Date }> = [];
  try {
    const anchor = range?.from ? parsePlanningDateTime(range.from) : now;
    if (!anchor) throw new Error("Début de période invalide en heure de Paris.");
    const monday = getWeekStartMonday(anchor);
    let start = range?.from ? parisTemplateDay(anchor) : monday;
    const parsedEnd = range?.to ? parsePlanningDateTime(range.to) : addWeeks(monday, 1);
    if (!parsedEnd) throw new Error("Fin de période invalide en heure de Paris.");
    let end = parisTemplateDay(parsedEnd);
    if (target === "next_week") {
      start = addWeeks(monday, 1);
      end = addWeeks(start, 1);
    } else if (target === "next_month") {
      const [year, month] = toParisDateTimeValue(anchor).slice(0, 7).split("-").map(Number);
      // UTC carries civil month fields only; resolve the resulting days in Paris.
      start = parsePlanningDateTime(new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10))!;
      end = parsePlanningDateTime(new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10))!;
    }
    if (end <= start) throw new Error("Période de modèle invalide en heure de Paris.");
    for (let cursor = start; cursor < end; cursor = shiftParisDays(cursor, 1)) {
      entries.forEach((entry, entryIndex) => {
        if (!normalizeSitePlanningTemplateEntry(entry)) throw new Error("Ligne du modèle invalide. Vérifiez les jours et horaires en heure de Paris.");
        if (!matchesTemplateDay(cursor, entry.dayOfWeek)) return;
        windows.push({ entry, entryIndex, ...buildDateRangeForTemplateEntry(cursor, entry) });
      });
    }
    return { windows, error: null };
  } catch (error) {
    return { windows: [] as typeof windows, error: error instanceof Error ? error.message : "Période invalide en heure de Paris. Aucune vacation préparée." };
  }
}

export function buildTemplateFingerprint(
  siteId: string | null | undefined,
  startAtIso: string | null | undefined,
  endAtIso: string | null | undefined,
  title: string | null | undefined
) {
  return [
    String(siteId ?? "").trim(),
    String(startAtIso ?? "").trim(),
    String(endAtIso ?? "").trim(),
    String(title ?? "").trim().toLowerCase(),
  ].join("::");
}

export function normalizeSitePlanningTemplateEntry(
  value: Partial<SitePlanningTemplateEntry>
): SitePlanningTemplateEntry | null {
  const dayOfWeek = Number(value.dayOfWeek);
  const startTime = String(value.startTime ?? "");
  const endTime = String(value.endTime ?? "");

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
    return null;
  }

  if (!isHalfHourTime(startTime) || !isHalfHourTime(endTime)) {
    return null;
  }

  if (startTime === endTime) {
    return null;
  }

  return {
    dayOfWeek: dayOfWeek as SiteTemplateDay,
    startTime,
    endTime,
    missionType: normalizeTemplateText(value.missionType),
    title: normalizeTemplateText(value.title),
    requiredQualification: normalizeTemplateText(value.requiredQualification),
    assignedAgentId: normalizeTemplateText(value.assignedAgentId),
    notes: normalizeTemplateText(value.notes),
  };
}
