// src/lib/planning/stats.ts

export type VacationEvent = {
  id: string;
  start: string;
  end: string;
  status?: string;
  assignedAgentIds?: string[];
  siteId?: string | null;
  siteName?: string | null;
  requiredAgents?: number;
  requiredQualification?: string | null;
};

export type PlanningStats = {
  totalHours: number;
  nightHours: number;
  unfilledCount: number;
  partiallyFilledCount: number;
  filledCount: number;
  agentWeeklyHours: Record<string, number>;
  agentMonthlyHours: Record<string, number>;
  agentContractualHours: Record<string, number>;
  agentWorkingDays: Record<string, number>;
  restPeriodViolations: string[];
  maxDurationViolations: string[];
  consecutiveDayViolations: string[];
  weeklyRestViolations: string[];
  sstCoverageWarnings: string[];
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_SHIFT_HOURS = 12;
const MIN_DAILY_REST_HOURS = 11;
const MIN_WEEKLY_REST_HOURS = 35;
const MAX_CONSECUTIVE_WORK_DAYS = 6;

function calculateNightHours(start: Date, end: Date): number {
  let nightHours = 0;
  let current = new Date(start);

  while (current < end) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const date = current.getDate();

    const nightStart1 = new Date(year, month, date, 0, 0, 0);
    const nightEnd1 = new Date(year, month, date, 6, 0, 0);
    const nightStart2 = new Date(year, month, date, 21, 0, 0);
    const nightEnd2 = new Date(year, month, date, 24, 0, 0);

    const intersectStart1 = Math.max(current.getTime(), nightStart1.getTime());
    const intersectEnd1 = Math.min(end.getTime(), nightEnd1.getTime());
    if (intersectStart1 < intersectEnd1) {
      nightHours += (intersectEnd1 - intersectStart1) / HOUR_MS;
    }

    const intersectStart2 = Math.max(current.getTime(), nightStart2.getTime());
    const intersectEnd2 = Math.min(end.getTime(), nightEnd2.getTime());
    if (intersectStart2 < intersectEnd2) {
      nightHours += (intersectEnd2 - intersectStart2) / HOUR_MS;
    }

    current = new Date(year, month, date + 1, 0, 0, 0);
  }

  return nightHours;
}

function isCancelled(event: VacationEvent) {
  return String(event.status ?? "").toLowerCase() === "cancelled";
}

function eventBounds(event: VacationEvent) {
  const startMs = new Date(event.start).getTime();
  const endMs = new Date(event.end).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  return { startMs, endMs };
}

function dayKeyFromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function startOfUtcDay(ms: number) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function startOfIsoWeek(ms: number) {
  const dayStart = startOfUtcDay(ms);
  const day = new Date(dayStart).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return dayStart + mondayOffset * DAY_MS;
}

function normalizeQualification(value: string) {
  return value.trim().toLowerCase();
}

function hasSst(agentId: string, agentQualifications?: Record<string, string[]>) {
  return (agentQualifications?.[agentId] ?? []).some((qualification) =>
    normalizeQualification(qualification).includes("sst")
  );
}

function addUnique(target: string[], ids: Iterable<string>) {
  const set = new Set(target);
  for (const id of ids) set.add(id);
  target.length = 0;
  target.push(...set);
}

export function computePlanningStats(
  events: VacationEvent[],
  range?: { from: string; to: string },
  allEvents?: VacationEvent[],
  agentContractualTargets?: Record<string, number>,
  agentQualifications?: Record<string, string[]>
): PlanningStats {
  let totalHours = 0;
  let nightHours = 0;
  let unfilledCount = 0;
  let partiallyFilledCount = 0;
  let filledCount = 0;
  const agentWeeklyHours: Record<string, number> = {};
  const agentMonthlyHours: Record<string, number> = {};
  const agentContractualHours: Record<string, number> = {};
  const agentWorkingDays: Record<string, number> = {};
  const agentDailyMap: Record<string, Set<string>> = {};
  const restPeriodViolations: string[] = [];
  const maxDurationViolations: string[] = [];
  const consecutiveDayViolations: string[] = [];
  const weeklyRestViolations: string[] = [];
  const sstCoverageWarnings: string[] = [];

  const rangeStart = range ? new Date(range.from) : null;
  const rangeEnd = range ? new Date(range.to) : null;

  const relevantEvents = events.filter((event) => {
    const bounds = eventBounds(event);
    if (!bounds) return false;
    if (!rangeStart || !rangeEnd) return true;
    return bounds.startMs < rangeEnd.getTime() && bounds.endMs > rangeStart.getTime();
  });

  const eventsForLegalChecks = (allEvents || events)
    .filter((event) => !isCancelled(event))
    .filter((event) => eventBounds(event))
    .sort(
      (a, b) =>
        new Date(a.start).getTime() - new Date(b.start).getTime()
    );

  if (agentContractualTargets) {
    Object.entries(agentContractualTargets).forEach(([agentId, hours]) => {
      if (Number.isFinite(hours) && hours > 0) {
        agentContractualHours[agentId] = hours;
      }
    });
  }

  for (const event of relevantEvents) {
    let start = new Date(event.start);
    let end = new Date(event.end);
    const originalBounds = eventBounds(event);

    if (!originalBounds) continue;

    if ((originalBounds.endMs - originalBounds.startMs) / HOUR_MS > MAX_SHIFT_HOURS) {
      maxDurationViolations.push(event.id);
    }

    if (rangeStart && start < rangeStart) start = rangeStart;
    if (rangeEnd && end > rangeEnd) end = rangeEnd;

    const hours = Math.max(0, (end.getTime() - start.getTime()) / HOUR_MS);
    totalHours += hours;
    nightHours += calculateNightHours(start, end);

    if (event.status === "planned") unfilledCount++;
    else if (event.status === "partially_filled") partiallyFilledCount++;
    else if (event.status === "filled") filledCount++;

    const assignedAgentIds = event.assignedAgentIds ?? [];
    if (assignedAgentIds.length > 0) {
      for (const agentId of assignedAgentIds) {
        agentMonthlyHours[agentId] = (agentMonthlyHours[agentId] || 0) + hours;
        agentWeeklyHours[agentId] = (agentWeeklyHours[agentId] || 0) + hours;

        if (!agentDailyMap[agentId]) agentDailyMap[agentId] = new Set();
        agentDailyMap[agentId].add(dayKeyFromMs(originalBounds.startMs));

        const targetHours = agentContractualTargets?.[agentId];
        agentContractualHours[agentId] =
          typeof targetHours === "number" && Number.isFinite(targetHours) && targetHours > 0
            ? targetHours
            : 151.67;
      }
    }

    const collectiveShift = Math.max(1, Number(event.requiredAgents ?? 1)) > 1;
    if (
      collectiveShift &&
      assignedAgentIds.length > 0 &&
      !assignedAgentIds.some((agentId) => hasSst(agentId, agentQualifications))
    ) {
      sstCoverageWarnings.push(event.id);
    }
  }

  Object.keys(agentDailyMap).forEach((agentId) => {
    agentWorkingDays[agentId] = agentDailyMap[agentId].size;
  });

  const eventsByAgent = new Map<string, Array<{ id: string; startMs: number; endMs: number }>>();
  for (const event of eventsForLegalChecks) {
    const bounds = eventBounds(event);
    if (!bounds) continue;

    for (const agentId of event.assignedAgentIds ?? []) {
      const bucket = eventsByAgent.get(agentId) ?? [];
      bucket.push({ id: event.id, ...bounds });
      eventsByAgent.set(agentId, bucket);
    }
  }

  for (const agentEvents of eventsByAgent.values()) {
    agentEvents.sort((a, b) => a.startMs - b.startMs);

    let lastEnd: number | null = null;
    for (const event of agentEvents) {
      if (lastEnd !== null) {
        const restHours = (event.startMs - lastEnd) / HOUR_MS;
        if (restHours < MIN_DAILY_REST_HOURS) {
          restPeriodViolations.push(event.id);
        }
      }
      lastEnd = Math.max(lastEnd ?? event.endMs, event.endMs);
    }

    const days = Array.from(
      new Map(
        agentEvents.map((event) => [
          startOfUtcDay(event.startMs),
          event.id,
        ])
      ).entries()
    ).sort(([left], [right]) => left - right);

    let streak = 0;
    let previousDay: number | null = null;
    for (const [day, eventId] of days) {
      streak = previousDay !== null && day - previousDay === DAY_MS ? streak + 1 : 1;
      if (streak > MAX_CONSECUTIVE_WORK_DAYS) {
        consecutiveDayViolations.push(eventId);
      }
      previousDay = day;
    }

    const eventsByWeek = new Map<number, Array<{ id: string; startMs: number; endMs: number }>>();
    for (const event of agentEvents) {
      const weekStart = startOfIsoWeek(event.startMs);
      const bucket = eventsByWeek.get(weekStart) ?? [];
      bucket.push(event);
      eventsByWeek.set(weekStart, bucket);
    }

    for (const [weekStart, weekEvents] of eventsByWeek.entries()) {
      weekEvents.sort((a, b) => a.startMs - b.startMs);
      const weekEnd = weekStart + 7 * DAY_MS;
      let cursor = weekStart;
      let maxGap = 0;

      for (const event of weekEvents) {
        maxGap = Math.max(maxGap, event.startMs - cursor);
        cursor = Math.max(cursor, event.endMs);
      }

      maxGap = Math.max(maxGap, weekEnd - cursor);

      if (maxGap / HOUR_MS < MIN_WEEKLY_REST_HOURS) {
        addUnique(
          weeklyRestViolations,
          weekEvents.map((event) => event.id)
        );
      }
    }
  }

  return {
    totalHours: Math.round(totalHours * 10) / 10,
    nightHours: Math.round(nightHours * 10) / 10,
    unfilledCount,
    partiallyFilledCount,
    filledCount,
    agentWeeklyHours,
    agentMonthlyHours,
    agentContractualHours,
    agentWorkingDays,
    restPeriodViolations: Array.from(new Set(restPeriodViolations)),
    maxDurationViolations: Array.from(new Set(maxDurationViolations)),
    consecutiveDayViolations: Array.from(new Set(consecutiveDayViolations)),
    weeklyRestViolations: Array.from(new Set(weeklyRestViolations)),
    sstCoverageWarnings: Array.from(new Set(sstCoverageWarnings)),
  };
}