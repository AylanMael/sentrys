export const PLANNING_TIME_ZONE = "Europe/Paris";
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PLANNING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
export function toParisDateTimeValue(date: Date): string {
  const p = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function wallMillis(date: Date): number {
  const p = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/** Naive planning dates mean Paris, never the runtime timezone.
 * Explicit offsets remain instants. Reject nonexistent or ambiguous DST wall times.
 */
export function parsePlanningDateTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(s);
  if (!match || (match[8] && !match[4])) return null;
  const [, y, m, d, h = "00", min = "00", sec = "00", fraction = "", zone] = match;
  const ms = +(fraction.padEnd(3, "0"));
  const wall = Date.UTC(+y, +m - 1, +d, +h, +min, +sec, ms);
  const check = new Date(wall);
  if (+y < 100 || check.getUTCFullYear() !== +y || check.getUTCMonth() !== +m - 1
    || check.getUTCDate() !== +d || +h > 23 || +min > 59 || +sec > 59) return null;
  if (zone) {
    if (zone !== "Z" && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) return null;
    const date = new Date(s);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = wall - ms + delta;
    offsets.add(wallMillis(new Date(sample)) - sample);
  }
  const candidates = [...offsets].map(offset => wall - offset)
    .filter(instant => wallMillis(new Date(instant)) + ms === wall);
  return candidates.length === 1 ? new Date(candidates[0]) : null;
}

export function planningInputToIso(value: string): string {
  const parsed = parsePlanningDateTime(value);
  if (!parsed) throw new Error("Horaire invalide ou ambigu en heure de Paris (changement d’heure). Choisissez un horaire non ambigu.");
  return parsed.toISOString();
}

/** Retain the original offset and seconds when an existing form boundary is unchanged. */
export function parsePlanningEdit(value: string, original: string | null | undefined): Date | null {
  const instant = parsePlanningDateTime(original);
  if (instant && toParisDateTimeValue(instant) === value) return instant;
  return parsePlanningDateTime(value);
}
