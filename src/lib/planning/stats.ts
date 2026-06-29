// src/lib/planning/stats.ts

export type VacationEvent = {
  id: string;
  start: string;
  end: string;
  status?: string;
  assignedAgentIds?: string[];
  siteName?: string | null;
  requiredAgents?: number;
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
};

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
      nightHours += (intersectEnd1 - intersectStart1) / (1000 * 60 * 60);
    }

    const intersectStart2 = Math.max(current.getTime(), nightStart2.getTime());
    const intersectEnd2 = Math.min(end.getTime(), nightEnd2.getTime());
    if (intersectStart2 < intersectEnd2) {
      nightHours += (intersectEnd2 - intersectStart2) / (1000 * 60 * 60);
    }

    current = new Date(year, month, date + 1, 0, 0, 0);
  }

  return nightHours;
}

export function computePlanningStats(
  events: VacationEvent[],
  range?: { from: string; to: string },
  allEvents?: VacationEvent[],
  agentContractualTargets?: Record<string, number>
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

  const rangeStart = range ? new Date(range.from) : null;
  const rangeEnd = range ? new Date(range.to) : null;

  const relevantEvents = events.filter((event) => {
    if (!rangeStart || !rangeEnd) return true;
    const start = new Date(event.start);
    const end = new Date(event.end);
    return start < rangeEnd && end > rangeStart;
  });

  const eventsForRestCheck = allEvents || events;
  const sorted = [...eventsForRestCheck].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
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

    if (rangeStart && start < rangeStart) start = rangeStart;
    if (rangeEnd && end > rangeEnd) end = rangeEnd;

    const hours = Math.max(0, (end.getTime() - start.getTime()) / 1000 / 60 / 60);
    totalHours += hours;
    nightHours += calculateNightHours(start, end);

    if (event.status === "planned") unfilledCount++;
    else if (event.status === "partially_filled") partiallyFilledCount++;
    else if (event.status === "filled") filledCount++;

    if (event.assignedAgentIds) {
      for (const agentId of event.assignedAgentIds) {
        agentMonthlyHours[agentId] = (agentMonthlyHours[agentId] || 0) + hours;
        agentWeeklyHours[agentId] = (agentWeeklyHours[agentId] || 0) + hours;

        if (!agentDailyMap[agentId]) agentDailyMap[agentId] = new Set();
        const dayKey = new Date(event.start).toISOString().split("T")[0];
        agentDailyMap[agentId].add(dayKey);

        const targetHours = agentContractualTargets?.[agentId];
        agentContractualHours[agentId] =
          typeof targetHours === "number" && Number.isFinite(targetHours) && targetHours > 0
            ? targetHours
            : 151.67;
      }
    }
  }

  Object.keys(agentDailyMap).forEach((agentId) => {
    agentWorkingDays[agentId] = agentDailyMap[agentId].size;
  });

  const agentLastEnd: Record<string, number> = {};
  for (const event of sorted) {
    if (!event.assignedAgentIds) continue;
    const startMs = new Date(event.start).getTime();
    const endMs = new Date(event.end).getTime();

    for (const agentId of event.assignedAgentIds) {
      if (agentLastEnd[agentId]) {
        const diffMs = startMs - agentLastEnd[agentId];
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours < 11) {
          restPeriodViolations.push(event.id);
        }
      }
      agentLastEnd[agentId] = endMs;
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
    restPeriodViolations,
  };
}
