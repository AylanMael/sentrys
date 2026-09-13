import { parsePlanningDateTime, PLANNING_TIME_ZONE, toParisDateTimeValue } from "./paris-time";
import { shiftParisDays } from "./paris-recurrence";

export { PLANNING_TIME_ZONE, shiftParisDays as addParisDays };

export function parisDayKey(value?: string | Date | null): string | null {
  const date = value instanceof Date ? value : parsePlanningDateTime(value);
  return date && Number.isFinite(date.getTime()) ? toParisDateTimeValue(date).slice(0, 10) : null;
}

export function parisDayStart(value: string | Date): Date {
  const key = parisDayKey(value);
  const date = key && parsePlanningDateTime(key);
  if (!date) throw new Error("Date de planning invalide.");
  return date;
}

/** UTC carries civil fields only; returned dates below are real Paris instants. */
export function parisFields(date: Date) {
  const key = parisDayKey(date);
  if (!key) throw new Error("Date de planning invalide.");
  const civil = new Date(`${key}T00:00:00Z`);
  return { year: civil.getUTCFullYear(), month: civil.getUTCMonth(), day: civil.getUTCDate(), weekday: civil.getUTCDay() };
}

export function parisMonthStart(date: Date, offset = 0): Date {
  const { year, month } = parisFields(date);
  return parisDayStart(new Date(Date.UTC(year, month + offset, 1)).toISOString().slice(0, 10));
}

export function parisWeekStart(date: Date): Date {
  const { weekday } = parisFields(date);
  return shiftParisDays(parisDayStart(date), weekday === 0 ? -6 : 1 - weekday);
}

/** Half-open interval: midnight end belongs to the preceding day, not a new column. */
export function parisDays(from: string | Date, to: string | Date, limit = 62) {
  const start = from instanceof Date ? from : parsePlanningDateTime(from);
  const end = to instanceof Date ? to : parsePlanningDateTime(to);
  if (!start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return [];
  const days: { key: string; date: Date }[] = [];
  for (let date = parisDayStart(start); date < end && days.length < limit; date = shiftParisDays(date, 1)) {
    days.push({ key: parisDayKey(date)!, date });
  }
  return days;
}

export function parisCivilRangeDays(from: Date, to: Date): number {
  const wall = (date: Date) => new Date(`${toParisDateTimeValue(date)}Z`).getTime();
  return (wall(to) - wall(from)) / 86_400_000;
}

export function parisFullDay(start?: string | null, end?: string | null): boolean {
  const a = parsePlanningDateTime(start);
  const b = parsePlanningDateTime(end);
  return Boolean(a && b && a.getTime() === parisDayStart(a).getTime()
    && b.getTime() === shiftParisDays(parisDayStart(a), 1).getTime());
}

/** A night stays on its start day; make its ending day explicit without double counting. */
export function parisEndDaySuffix(start?: string | null, end?: string | null): string {
  const a = parisDayKey(start);
  const b = parisDayKey(end);
  if (!a || !b || a === b) return "";
  const days = (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
  return days > 0 ? ` (+${days}j)` : "";
}
