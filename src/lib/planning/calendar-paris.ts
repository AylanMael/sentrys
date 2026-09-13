import { parsePlanningDateTime, toParisDateTimeValue } from "./paris-time";
import { shiftParisDays } from "./paris-recurrence";

export type CalendarDelta = { years: number; months: number; days: number; milliseconds: number };

/** Apply FullCalendar's civil delta to the real boundary, never the month-view snapped one. */
function moveBoundary(value: string, delta: CalendarDelta): Date {
  const original = parsePlanningDateTime(value);
  if (!original) throw new Error("Horaire source invalide.");
  if (!Object.values(delta).every(Number.isFinite)) throw new Error("Déplacement invalide.");
  if (!delta.years && !delta.months && !delta.days && !delta.milliseconds) return original;
  const wall = new Date(`${toParisDateTimeValue(original)}:00Z`);
  wall.setUTCSeconds(original.getUTCSeconds(), original.getUTCMilliseconds());
  wall.setUTCFullYear(wall.getUTCFullYear() + delta.years);
  wall.setUTCMonth(wall.getUTCMonth() + delta.months);
  wall.setUTCDate(wall.getUTCDate() + delta.days);
  wall.setTime(wall.getTime() + delta.milliseconds);
  const result = parsePlanningDateTime(wall.toISOString().slice(0, -1));
  if (!result) throw new Error("Horaire inexistant ou ambigu en heure de Paris. Utilisez les détails de la vacation pour choisir un autre horaire.");
  return result;
}

export function calendarParisMutation(start: string, end: string, startDelta: CalendarDelta, endDelta: CalendarDelta) {
  const nextStart = moveBoundary(start, startDelta);
  const nextEnd = moveBoundary(end, endDelta);
  if (nextEnd <= nextStart) throw new Error("La fin doit être après le début de la vacation.");
  return { startAt: nextStart.toISOString(), endAt: nextEnd.toISOString() };
}

export function parisCalendarDay(date: Date) {
  const day = toParisDateTimeValue(date).slice(0, 10);
  return { day, weekday: new Date(`${day}T00:00:00Z`).getUTCDay(), hour: Number(toParisDateTimeValue(date).slice(11, 13)) };
}

export function parisMonthDisplay(startIso: string, endIso: string) {
  const start = parsePlanningDateTime(parisCalendarDay(new Date(startIso)).day)!;
  const endInstant = new Date(endIso);
  const endMidnight = parsePlanningDateTime(parisCalendarDay(endInstant).day)!;
  const end = endInstant.getTime() === endMidnight.getTime() ? endMidnight : shiftParisDays(endMidnight, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
