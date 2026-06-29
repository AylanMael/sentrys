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
  const next = new Date(date);
  const weekday = next.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  next.setDate(next.getDate() + mondayOffset);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addWeeks(date: Date, weeks: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function buildDateTimeOnDate(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0
  );
}

export function buildDateRangeForTemplateEntry(
  date: Date,
  entry: Pick<SitePlanningTemplateEntry, "startTime" | "endTime">
) {
  const start = buildDateTimeOnDate(date, entry.startTime);
  const end = buildDateTimeOnDate(date, entry.endTime);

  if (timeToMinutes(entry.endTime) <= timeToMinutes(entry.startTime)) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

export function buildDateRangeFromWeekStart(
  weekStart: Date,
  entry: Pick<SitePlanningTemplateEntry, "dayOfWeek" | "startTime" | "endTime">
) {
  const targetDate = new Date(weekStart);
  targetDate.setDate(targetDate.getDate() + (entry.dayOfWeek - 1));
  return buildDateRangeForTemplateEntry(targetDate, entry);
}

export function matchesTemplateDay(date: Date, dayOfWeek: SiteTemplateDay) {
  const jsDay = date.getDay();
  const normalized = jsDay === 0 ? 7 : jsDay;
  return normalized === dayOfWeek;
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
