import test from "node:test";
import assert from "node:assert/strict";
import {
  computePrepayReport,
  frenchPublicHolidayKeys,
} from "../src/lib/payroll/prepay.ts";
import { DEFAULT_PREPAY_SETTINGS } from "../src/lib/payroll/settings.ts";

const PERIOD = { from: new Date("2026-01-01T00:00:00Z"), to: new Date("2026-02-01T00:00:00Z") };

function vacation(overrides) {
  return {
    id: "v1",
    agentId: "agent-1",
    agentName: "Jean Dupont",
    payrollId: null,
    siteName: "Site A",
    title: null,
    notes: null,
    startAtIso: "2026-01-05T08:00:00Z",
    endAtIso: "2026-01-05T16:00:00Z",
    status: "confirmed",
    isPublished: true,
    monthlyContractHours: null,
    ...overrides,
  };
}

function settings(overrides) {
  return {
    ...DEFAULT_PREPAY_SETTINGS,
    hourlyBaseRate: 12,
    nightPremiumPercent: 25,
    sundayPremiumPercent: 50,
    publicHolidayPremiumPercent: 100,
    mayFirstPremiumPercent: 100,
    ...overrides,
  };
}

test("frenchPublicHolidayKeys includes the 8 fixed-date French public holidays", () => {
  const keys = frenchPublicHolidayKeys(2026);
  for (const key of [
    "2026-01-01", // Jour de l'an
    "2026-05-01", // Fete du travail
    "2026-05-08", // Victoire 1945
    "2026-07-14", // Fete nationale
    "2026-08-15", // Assomption
    "2026-11-01", // Toussaint
    "2026-11-11", // Armistice
    "2026-12-25", // Noel
  ]) {
    assert.equal(keys.has(key), true, `missing fixed holiday ${key}`);
  }
  // plus the 3 Easter-dependent holidays (Easter Monday, Ascension, Pentecost Monday)
  assert.equal(keys.size, 11);
});

test("a simple 8h day-shift is fully payable at the base rate, no premiums", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [vacation({ startAtIso: "2026-01-05T08:00:00Z", endAtIso: "2026-01-05T16:00:00Z" })],
    settings: settings(),
  });

  assert.equal(report.rows.length, 1);
  const row = report.rows[0];
  assert.equal(row.totalHours, 8);
  assert.equal(row.payableHours, 8);
  assert.equal(row.nightHours, 0);
  assert.equal(row.sundayHours, 0);
  assert.equal(row.basePayAmount, 96); // 8h * 12
  assert.equal(row.estimatedGrossAmount, 96);
});

test("a shift crossing the night window (21:00-06:00) splits day/night hours", () => {
  // Night boundaries are evaluated against the server process's local time
  // (Date#getHours/getDate), not a fixed business timezone - see note below.
  // Using local Date components here (not a "Z" UTC literal) keeps this test's
  // intent (a 19:00->03:00 local shift) stable regardless of the machine's UTC offset.
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [
      vacation({
        startAtIso: new Date(2026, 0, 5, 19, 0).toISOString(),
        endAtIso: new Date(2026, 0, 6, 3, 0).toISOString(),
      }),
    ],
    settings: settings(),
  });

  const row = report.rows[0];
  assert.equal(row.totalHours, 8);
  assert.equal(row.nightHours, 6); // 21:00->03:00 local
  assert.equal(row.nightPremiumAmount, 18); // 6h * 12 * 25%
});

test("a shift on a Sunday is counted as sundayHours for its whole duration", () => {
  // 2026-01-04 is a Sunday
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [
      vacation({ startAtIso: "2026-01-04T08:00:00Z", endAtIso: "2026-01-04T16:00:00Z" }),
    ],
    settings: settings(),
  });

  const row = report.rows[0];
  assert.equal(row.sundayHours, 8);
  assert.equal(row.sundayPremiumAmount, 48); // 8h * 12 * 50%
});

test("a May 1st shift counts hours as both public-holiday and May-1st premiums", () => {
  const report = computePrepayReport({
    from: new Date(2026, 3, 1),
    to: new Date(2026, 5, 1),
    vacations: [
      vacation({
        startAtIso: new Date(2026, 4, 1, 8, 0).toISOString(),
        endAtIso: new Date(2026, 4, 1, 16, 0).toISOString(),
      }),
    ],
    settings: settings(),
  });

  const row = report.rows[0];
  assert.equal(row.publicHolidayHours, 8);
  assert.equal(row.mayFirstHours, 8);
  assert.equal(row.publicHolidayPremiumAmount, 96); // 8h * 12 * 100%
  assert.equal(row.mayFirstPremiumAmount, 96);
});

test("a vacation whose title/notes flags an absence is excluded from payable hours", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [vacation({ title: "Congé payé" })],
    settings: settings(),
  });

  const row = report.rows[0];
  assert.equal(row.payableHours, 0);
  assert.equal(row.absenceHours, 8);
  assert.ok(row.anomalies.some((a) => a.includes("Absence/conge")));
});

test("a cancelled vacation is ignored entirely", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [vacation({ status: "cancelled" })],
    settings: settings(),
  });

  assert.equal(report.rows.length, 0);
  assert.equal(report.summary.vacationCount, 0);
});

test("an unassigned vacation is counted separately and does not create an agent row", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [vacation({ agentId: null })],
    settings: settings(),
  });

  assert.equal(report.rows.length, 0);
  assert.equal(report.summary.unassignedVacationCount, 1);
  assert.equal(report.summary.vacationCount, 1);
});

test("an unpublished vacation is flagged as a draft anomaly but still paid", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [vacation({ isPublished: false })],
    settings: settings(),
  });

  const row = report.rows[0];
  assert.equal(row.payableHours, 8);
  assert.equal(report.summary.draftVacationCount, 1);
  assert.ok(row.anomalies.some((a) => a.includes("non publiée")));
});

test("a shift longer than 12h is flagged as an anomaly to check before pre-pay", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [
      vacation({ startAtIso: "2026-01-05T06:00:00Z", endAtIso: "2026-01-05T19:00:00Z" }),
    ],
    settings: settings(),
  });

  const row = report.rows[0];
  assert.ok(row.anomalies.some((a) => a.includes("superieure a 12h")));
});

test("two overlapping vacations for the same agent are flagged as an overlap anomaly", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [
      vacation({ id: "v1", startAtIso: "2026-01-05T08:00:00Z", endAtIso: "2026-01-05T16:00:00Z" }),
      vacation({ id: "v2", startAtIso: "2026-01-05T14:00:00Z", endAtIso: "2026-01-05T20:00:00Z" }),
    ],
    settings: settings(),
  });

  const row = report.rows[0];
  assert.ok(row.anomalies.some((a) => a.includes("Chevauchement")));
});

test("less than 11h of rest between two vacations is flagged, 11h+ is not", () => {
  const tooShort = computePrepayReport({
    ...PERIOD,
    vacations: [
      vacation({ id: "v1", startAtIso: "2026-01-05T08:00:00Z", endAtIso: "2026-01-05T16:00:00Z" }),
      vacation({ id: "v2", startAtIso: "2026-01-06T00:00:00Z", endAtIso: "2026-01-06T08:00:00Z" }), // 8h rest
    ],
    settings: settings(),
  });
  assert.ok(tooShort.rows[0].anomalies.some((a) => a.includes("Repos inferieur")));

  const enoughRest = computePrepayReport({
    ...PERIOD,
    vacations: [
      vacation({ id: "v1", startAtIso: "2026-01-05T08:00:00Z", endAtIso: "2026-01-05T16:00:00Z" }),
      vacation({ id: "v2", startAtIso: "2026-01-06T03:00:00Z", endAtIso: "2026-01-06T11:00:00Z" }), // 11h rest
    ],
    settings: settings(),
  });
  assert.ok(!enoughRest.rows[0].anomalies.some((a) => a.includes("Repos inferieur")));
});

test("payable hours beyond the agent's contract hours are reported as contract overage", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [
      vacation({ startAtIso: "2026-01-05T08:00:00Z", endAtIso: "2026-01-05T16:00:00Z", monthlyContractHours: 5 }),
    ],
    settings: settings(),
  });

  const row = report.rows[0];
  assert.equal(row.contractHours, 5);
  assert.equal(row.payableHours, 8);
  assert.equal(row.contractOverageHours, 3);
});

test("hours worked in a single ISO week beyond the weekly threshold count as weekly overtime", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [
      // Mon-Thu 2026-01-05..08, 10h/day = 40h in the same ISO week, threshold 35h
      vacation({ id: "v1", startAtIso: "2026-01-05T06:00:00Z", endAtIso: "2026-01-05T16:00:00Z" }),
      vacation({ id: "v2", startAtIso: "2026-01-06T06:00:00Z", endAtIso: "2026-01-06T16:00:00Z" }),
      vacation({ id: "v3", startAtIso: "2026-01-07T06:00:00Z", endAtIso: "2026-01-07T16:00:00Z" }),
      vacation({ id: "v4", startAtIso: "2026-01-08T06:00:00Z", endAtIso: "2026-01-08T16:00:00Z" }),
    ],
    settings: settings({ weeklyOvertimeThreshold: 35 }),
  });

  const row = report.rows[0];
  assert.equal(row.totalHours, 40);
  assert.equal(row.weeklyOvertimeHours, 5);
});

test("a vacation is clipped to the report period boundaries", () => {
  const report = computePrepayReport({
    from: new Date("2026-01-05T12:00:00Z"),
    to: new Date("2026-01-06T00:00:00Z"),
    vacations: [
      vacation({ startAtIso: "2026-01-05T08:00:00Z", endAtIso: "2026-01-06T08:00:00Z" }),
    ],
    settings: settings(),
  });

  // only 2026-01-05T12:00 -> 2026-01-06T00:00 falls inside the period = 12h
  assert.equal(report.rows[0].totalHours, 12);
});

test("meal and transport allowances follow the configured allowance mode", () => {
  const twoShiftsSameDay = [
    vacation({ id: "v1", startAtIso: "2026-01-05T06:00:00Z", endAtIso: "2026-01-05T10:00:00Z" }),
    vacation({ id: "v2", startAtIso: "2026-01-05T12:00:00Z", endAtIso: "2026-01-05T16:00:00Z" }),
  ];

  const perShift = computePrepayReport({
    ...PERIOD,
    vacations: twoShiftsSameDay,
    settings: settings({ allowanceMode: "per_shift", mealAllowanceAmount: 5 }),
  });
  assert.equal(perShift.rows[0].mealAllowanceAmount, 10); // 2 shifts * 5

  const perWorkedDay = computePrepayReport({
    ...PERIOD,
    vacations: twoShiftsSameDay,
    settings: settings({ allowanceMode: "per_worked_day", mealAllowanceAmount: 5 }),
  });
  assert.equal(perWorkedDay.rows[0].mealAllowanceAmount, 5); // 1 distinct worked day * 5

  const none = computePrepayReport({
    ...PERIOD,
    vacations: twoShiftsSameDay,
    settings: settings({ allowanceMode: "none", mealAllowanceAmount: 5 }),
  });
  assert.equal(none.rows[0].mealAllowanceAmount, 0);
});

test("a vacation with an invalid or missing schedule is skipped with a warning, not counted", () => {
  const report = computePrepayReport({
    ...PERIOD,
    vacations: [vacation({ startAtIso: null, endAtIso: null })],
    settings: settings(),
  });

  assert.equal(report.rows.length, 0);
  assert.equal(report.summary.vacationCount, 0);
  assert.ok(report.warnings.some((w) => w.includes("horaire invalide")));
});
