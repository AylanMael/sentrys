import { parsePlanningDateTime, toParisDateTimeValue } from "./paris-time";

const DAY = 86_400_000;

/** UTC is only a carrier for Paris calendar fields, not an instant here. */
function wallDate(instant: Date): Date {
  if (!Number.isFinite(instant.getTime())) throw new Error("Date de planning invalide.");
  const minute = toParisDateTimeValue(instant);
  return new Date(`${minute}:${String(instant.getUTCSeconds()).padStart(2, "0")}.${String(instant.getUTCMilliseconds()).padStart(3, "0")}Z`);
}

function resolveWall(wall: Date): Date {
  const value = wall.toISOString().slice(0, -1);
  const instant = parsePlanningDateTime(value);
  if (!instant) throw new Error(`Horaire ${value.slice(0, 16)} inexistant ou ambigu en heure de Paris. Aucune copie envoyée : ajustez la période ou créez cette vacation séparément.`);
  return instant;
}

export function shiftParisDays(instant: Date, days: number): Date {
  if (!Number.isInteger(days)) throw new Error("Nombre de jours invalide.");
  if (days === 0) return new Date(instant);
  return resolveWall(new Date(wallDate(instant).getTime() + days * DAY));
}

function shiftParisMonths(instant: Date, months: number): Date {
  const wall = wallDate(instant);
  const day = wall.getUTCDate();
  wall.setUTCMonth(wall.getUTCMonth() + months);
  if (wall.getUTCDate() !== day) throw new Error("Ce jour n’existe pas dans le mois cible. Aucune copie envoyée : choisissez une autre période.");
  return resolveWall(wall);
}

function validWindow(start: Date, end: Date) {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new Error("Horaires de copie invalides en heure de Paris. Aucune copie envoyée : vérifiez le début et la fin.");
  }
  return { start, end };
}

export function shiftParisWindow(start: Date, end: Date, days: number) {
  return validWindow(shiftParisDays(start, days), shiftParisDays(end, days));
}

export function parisRecurrenceTargets(start: Date, end: Date, frequency: "week" | "month" | "weekdays", occurrences: number) {
  validWindow(start, end);
  if (!Number.isInteger(occurrences) || occurrences < 1 || occurrences > 24) throw new Error("Nombre d’occurrences invalide.");
  if (frequency === "weekdays") {
    const weekday = wallDate(start).getUTCDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    return Array.from({ length: 5 }, (_, index) => mondayOffset + index)
      .filter(days => days !== 0).map(days => shiftParisWindow(start, end, days));
  }
  return Array.from({ length: occurrences }, (_, index) => {
    const count = index + 1;
    if (frequency === "month") {
      const nextStart = shiftParisMonths(start, count);
      // Shift the start's month once, then retain the original civil span. Moving
      // each month separately could turn April 30–May 1 into May 30–June 1.
      const span = wallDate(end).getTime() - wallDate(start).getTime();
      return validWindow(nextStart, resolveWall(new Date(wallDate(nextStart).getTime() + span)));
    }
    return shiftParisWindow(start, end, count * 7);
  });
}

export function parisWeekWindow(anchor: Date) {
  const start = parsePlanningDateTime(toParisDateTimeValue(anchor).slice(0, 10));
  if (!start) throw new Error("Semaine source invalide.");
  return { start, end: shiftParisDays(start, 7) };
}

export function parisTargetWeekOffsets(start: Date, target: "next_week" | "current_month" | "next_month"): number[] {
  if (target === "next_week") return [1];
  const wall = wallDate(start);
  const sourceMonth = wall.getUTCFullYear() * 12 + wall.getUTCMonth();
  const wantedMonth = sourceMonth + (target === "next_month" ? 1 : 0);
  const offsets: number[] = [];
  for (let offset = 1; offset <= 8; offset++) {
    const candidate = new Date(wall.getTime() + offset * 7 * DAY);
    const month = candidate.getUTCFullYear() * 12 + candidate.getUTCMonth();
    if (month === wantedMonth) offsets.push(offset);
    if (month > wantedMonth) break;
  }
  return offsets;
}

/** Move the whole selection by a Paris wall-clock delta, keeping each boundary's local time. */
export function pasteParisWindow(start: Date, end: Date, base: Date, anchor: Date) {
  const delta = wallDate(anchor).getTime() - wallDate(base).getTime();
  if (base.getTime() === anchor.getTime()) return validWindow(new Date(start), new Date(end));
  return validWindow(
    resolveWall(new Date(wallDate(start).getTime() + delta)),
    resolveWall(new Date(wallDate(end).getTime() + delta)),
  );
}
