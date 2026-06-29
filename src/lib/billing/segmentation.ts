import { Timestamp } from "firebase-admin/firestore";

export type RateCode =
  | "WD_DAY"
  | "WD_NIGHT"
  | "WE_DAY"
  | "WE_NIGHT"
  | "HOL_DAY"
  | "HOL_NIGHT";

export type Segment = {
  code: RateCode;
  start: Date;
  end: Date;
  minutes: number;
};

export type SegmentationConfig = {
  dayStart: string;   // "06:00"
  nightStart: string; // "21:00"
  // holidays: Date[] // MVP2
};

function parseHHMM(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error("Invalid time: " + hhmm);
  return { h, m };
}

function setTime(base: Date, hhmm: string) {
  const { h, m } = parseHHMM(hhmm);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function isWeekend(d: Date) {
  const day = d.getDay(); // 0 Sun, 6 Sat
  return day === 0 || day === 6;
}

function minutesBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function clamp(date: Date, min: Date, max: Date) {
  return new Date(Math.min(max.getTime(), Math.max(min.getTime(), date.getTime())));
}

function overlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): { start: Date; end: Date } | null {
  const start = new Date(Math.max(aStart.getTime(), bStart.getTime()));
  const end = new Date(Math.min(aEnd.getTime(), bEnd.getTime()));
  if (end.getTime() <= start.getTime()) return null;
  return { start, end };
}

/**
 * Split a shift into day/night segments using:
 * - Day: [dayStart -> nightStart)
 * - Night: [nightStart -> next dayStart)
 * Weekend classification based on segment start date (standard practice).
 * Holidays not included in MVP (reserved for MVP2).
 */
export function segmentShift(
  startAt: Timestamp,
  endAt: Timestamp,
  cfg: SegmentationConfig
): Segment[] {
  const start = startAt.toDate();
  const end = endAt.toDate();
  if (end.getTime() <= start.getTime()) return [];

  const segments: Segment[] = [];

  // Start from the day of "start"
  let cursorDay = new Date(start);
  cursorDay.setHours(0, 0, 0, 0);

  // Loop day by day until we reach the day that contains "end"
  while (cursorDay.getTime() <= end.getTime()) {
    const dayStart = setTime(cursorDay, cfg.dayStart);     // 06:00 same day
    const nightStart = setTime(cursorDay, cfg.nightStart); // 21:00 same day
    const nextDay = addDays(cursorDay, 1);
    const nextDayStart = setTime(nextDay, cfg.dayStart);   // 06:00 next day

    // We only consider overlaps inside the actual shift interval [start, end)
    const dayOv = overlap(start, end, dayStart, nightStart);
    if (dayOv) {
      const we = isWeekend(dayOv.start);
      segments.push({
        code: we ? "WE_DAY" : "WD_DAY",
        start: dayOv.start,
        end: dayOv.end,
        minutes: minutesBetween(dayOv.start, dayOv.end),
      });
    }

    const nightOv = overlap(start, end, nightStart, nextDayStart);
    if (nightOv) {
      const we = isWeekend(nightOv.start);
      segments.push({
        code: we ? "WE_NIGHT" : "WD_NIGHT",
        start: nightOv.start,
        end: nightOv.end,
        minutes: minutesBetween(nightOv.start, nightOv.end),
      });
    }

    // Stop once cursorDay is beyond end day
    cursorDay = nextDay;
    if (cursorDay.getTime() > end.getTime()) break;
  }

  // Merge adjacent segments with same code
  segments.sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Segment[] = [];
  for (const s of segments) {
    if (s.minutes <= 0) continue;
    const last = merged[merged.length - 1];
    if (last && last.code === s.code && last.end.getTime() === s.start.getTime()) {
      last.end = s.end;
      last.minutes += s.minutes;
    } else {
      merged.push({ ...s });
    }
  }

  return merged;
}

export function minutesToHours(minutes: number, stepMinutes = 15) {
  // round to nearest step (e.g., 15 min => 0.25h)
  const rounded = Math.round(minutes / stepMinutes) * stepMinutes;
  return rounded / 60;
}
