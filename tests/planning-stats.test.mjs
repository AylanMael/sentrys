import test from "node:test";
import assert from "node:assert/strict";
import { computePlanningStats } from "../src/lib/planning/stats.ts";

function evt(overrides) {
  return {
    id: "e1",
    start: "2026-01-05T08:00:00.000Z",
    end: "2026-01-05T16:00:00.000Z",
    status: "filled",
    assignedAgentIds: [],
    ...overrides,
  };
}

test("status counters classify events into unfilled/partially_filled/filled", () => {
  const stats = computePlanningStats([
    evt({ id: "e1", status: "planned" }),
    evt({ id: "e2", status: "partially_filled" }),
    evt({ id: "e3", status: "filled" }),
  ]);

  assert.equal(stats.unfilledCount, 1);
  assert.equal(stats.partiallyFilledCount, 1);
  assert.equal(stats.filledCount, 1);
});

test("totalHours sums the duration of every relevant event", () => {
  const stats = computePlanningStats([
    evt({ id: "e1", start: "2026-01-05T08:00:00.000Z", end: "2026-01-05T16:00:00.000Z" }),
    evt({ id: "e2", start: "2026-01-06T08:00:00.000Z", end: "2026-01-06T12:00:00.000Z" }),
  ]);

  assert.equal(stats.totalHours, 12);
});

test("night hours are computed from the 21h-06h local window", () => {
  // Local wall-clock shift 19:00 -> 03:00 next day: 6h fall in the night window (21:00-03:00).
  const stats = computePlanningStats([
    evt({
      start: new Date(2026, 0, 5, 19, 0).toISOString(),
      end: new Date(2026, 0, 6, 3, 0).toISOString(),
    }),
  ]);

  assert.equal(stats.totalHours, 8);
  assert.equal(stats.nightHours, 6);
});

test("assigned agents accumulate weekly and monthly hours for each of their shifts", () => {
  const stats = computePlanningStats([
    evt({ id: "e1", start: "2026-01-05T08:00:00.000Z", end: "2026-01-05T12:00:00.000Z", assignedAgentIds: ["a1"] }),
    evt({ id: "e2", start: "2026-01-06T08:00:00.000Z", end: "2026-01-06T12:00:00.000Z", assignedAgentIds: ["a1", "a2"] }),
  ]);

  assert.equal(stats.agentWeeklyHours.a1, 8);
  assert.equal(stats.agentMonthlyHours.a1, 8);
  assert.equal(stats.agentWeeklyHours.a2, 4);
});

test("agentContractualHours defaults to 151.67 unless a valid positive target is provided", () => {
  const withTarget = computePlanningStats(
    [evt({ assignedAgentIds: ["a1"] })],
    undefined,
    undefined,
    { a1: 130 }
  );
  assert.equal(withTarget.agentContractualHours.a1, 130);

  const withoutTarget = computePlanningStats([evt({ assignedAgentIds: ["a1"] })]);
  assert.equal(withoutTarget.agentContractualHours.a1, 151.67);

  const withInvalidTarget = computePlanningStats(
    [evt({ assignedAgentIds: ["a1"] })],
    undefined,
    undefined,
    { a1: 0 }
  );
  assert.equal(withInvalidTarget.agentContractualHours.a1, 151.67);
});

test("agentWorkingDays counts distinct calendar days, not shift count", () => {
  const stats = computePlanningStats([
    evt({ id: "e1", start: "2026-01-05T08:00:00.000Z", end: "2026-01-05T12:00:00.000Z", assignedAgentIds: ["a1"] }),
    evt({ id: "e2", start: "2026-01-05T14:00:00.000Z", end: "2026-01-05T18:00:00.000Z", assignedAgentIds: ["a1"] }),
    evt({ id: "e3", start: "2026-01-06T08:00:00.000Z", end: "2026-01-06T12:00:00.000Z", assignedAgentIds: ["a1"] }),
  ]);

  assert.equal(stats.agentWorkingDays.a1, 2);
});

test("maxDurationViolations uses the shift's original duration, even if the reporting range clips it", () => {
  const stats = computePlanningStats(
    [evt({ id: "e1", start: "2026-01-05T00:00:00.000Z", end: "2026-01-05T18:00:00.000Z" })], // 18h shift
    { from: "2026-01-05T10:00:00.000Z", to: "2026-01-05T14:00:00.000Z" } // range only sees 4h of it
  );

  assert.deepEqual(stats.maxDurationViolations, ["e1"]);
  assert.equal(stats.totalHours, 4); // hours themselves ARE clipped to the range
});

test("a rest gap under 11h between two shifts for the same agent is a rest-period violation", () => {
  const stats = computePlanningStats([
    evt({ id: "e1", start: "2026-01-05T08:00:00.000Z", end: "2026-01-05T16:00:00.000Z", assignedAgentIds: ["a1"] }),
    evt({ id: "e2", start: "2026-01-06T00:00:00.000Z", end: "2026-01-06T08:00:00.000Z", assignedAgentIds: ["a1"] }), // 8h gap
  ]);

  assert.deepEqual(stats.restPeriodViolations, ["e2"]);
});

test("a rest gap of 11h or more raises no rest-period violation", () => {
  const stats = computePlanningStats([
    evt({ id: "e1", start: "2026-01-05T08:00:00.000Z", end: "2026-01-05T16:00:00.000Z", assignedAgentIds: ["a1"] }),
    evt({ id: "e2", start: "2026-01-06T03:00:00.000Z", end: "2026-01-06T11:00:00.000Z", assignedAgentIds: ["a1"] }), // 11h gap
  ]);

  assert.deepEqual(stats.restPeriodViolations, []);
});

test("working 7 consecutive calendar days flags the 7th day's event as a consecutive-day violation", () => {
  const events = [];
  for (let day = 5; day <= 11; day += 1) {
    events.push(
      evt({
        id: `e${day}`,
        start: `2026-01-${String(day).padStart(2, "0")}T08:00:00.000Z`,
        end: `2026-01-${String(day).padStart(2, "0")}T12:00:00.000Z`,
        assignedAgentIds: ["a1"],
      })
    );
  }
  const stats = computePlanningStats(events);

  assert.deepEqual(stats.consecutiveDayViolations, ["e11"]);
});

test("6 consecutive calendar days raises no consecutive-day violation", () => {
  const events = [];
  for (let day = 5; day <= 10; day += 1) {
    events.push(
      evt({
        id: `e${day}`,
        start: `2026-01-${String(day).padStart(2, "0")}T08:00:00.000Z`,
        end: `2026-01-${String(day).padStart(2, "0")}T12:00:00.000Z`,
        assignedAgentIds: ["a1"],
      })
    );
  }
  const stats = computePlanningStats(events);

  assert.deepEqual(stats.consecutiveDayViolations, []);
});

test("an agent with no 35h continuous rest window inside an ISO week gets a weekly-rest violation", () => {
  // Monday-Sunday every day, 8h shifts: never a 35h gap in that week.
  const events = [];
  const days = ["05", "06", "07", "08", "09", "10", "11"]; // Mon 2026-01-05 .. Sun 2026-01-11
  for (const day of days) {
    events.push(
      evt({
        id: `e${day}`,
        start: `2026-01-${day}T08:00:00.000Z`,
        end: `2026-01-${day}T16:00:00.000Z`,
        assignedAgentIds: ["a1"],
      })
    );
  }
  const stats = computePlanningStats(events);

  assert.equal(stats.weeklyRestViolations.length, days.length);
});

test("an agent with a long weekend off inside the ISO week gets no weekly-rest violation", () => {
  // Work Mon-Wed only: from Wed 16:00 to next Mon 08:00 is well over 35h.
  const stats = computePlanningStats([
    evt({ id: "e1", start: "2026-01-05T08:00:00.000Z", end: "2026-01-05T16:00:00.000Z", assignedAgentIds: ["a1"] }),
    evt({ id: "e2", start: "2026-01-06T08:00:00.000Z", end: "2026-01-06T16:00:00.000Z", assignedAgentIds: ["a1"] }),
    evt({ id: "e3", start: "2026-01-07T08:00:00.000Z", end: "2026-01-07T16:00:00.000Z", assignedAgentIds: ["a1"] }),
  ]);

  assert.deepEqual(stats.weeklyRestViolations, []);
});

test("a collective shift (requiredAgents > 1) without any SST-qualified agent raises a coverage warning", () => {
  const stats = computePlanningStats(
    [evt({ id: "e1", requiredAgents: 2, assignedAgentIds: ["a1", "a2"] })],
    undefined,
    undefined,
    undefined,
    { a1: ["agent de securite"], a2: ["cynophile"] }
  );

  assert.deepEqual(stats.sstCoverageWarnings, ["e1"]);
});

test("a collective shift with at least one SST-qualified agent raises no coverage warning", () => {
  const stats = computePlanningStats(
    [evt({ id: "e1", requiredAgents: 2, assignedAgentIds: ["a1", "a2"] })],
    undefined,
    undefined,
    undefined,
    { a1: ["SST"], a2: ["cynophile"] }
  );

  assert.deepEqual(stats.sstCoverageWarnings, []);
});

test("a solo shift (requiredAgents unset or 1) never raises an SST coverage warning", () => {
  const stats = computePlanningStats([evt({ id: "e1", assignedAgentIds: ["a1"] })]);
  assert.deepEqual(stats.sstCoverageWarnings, []);
});

test("events entirely outside the reporting range are excluded from hour totals", () => {
  const stats = computePlanningStats(
    [evt({ id: "e1", start: "2026-02-01T08:00:00.000Z", end: "2026-02-01T16:00:00.000Z" })],
    { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" }
  );

  assert.equal(stats.totalHours, 0);
});

test("current behavior: a cancelled event's hours are still included in totals and agent hours (status is only excluded from the legal-check pass)", () => {
  // computePlanningStats has no cancelled-status guard in its main hours loop
  // (unlike computePrepayReport, which explicitly skips status === "cancelled").
  // This test pins down the current behavior; it is not asserting it is correct.
  const stats = computePlanningStats([
    evt({ id: "e1", status: "cancelled", assignedAgentIds: ["a1"] }),
  ]);

  assert.equal(stats.totalHours, 8);
  assert.equal(stats.agentMonthlyHours.a1, 8);
});
