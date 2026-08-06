import test from "node:test";
import assert from "node:assert/strict";
import { buildConflictIndex, getWorstSeverity } from "../src/lib/planning/conflicts.ts";

function event(overrides) {
  return {
    id: "e1",
    start: "2026-01-05T08:00:00Z",
    end: "2026-01-05T16:00:00Z",
    assignedAgentIds: [],
    siteName: "Site A",
    requiredAgents: 0,
    ...overrides,
  };
}

test("an event needing more agents than assigned is flagged UNDERSTAFFED", () => {
  const index = buildConflictIndex([
    event({ id: "e1", requiredAgents: 2, assignedAgentIds: ["a1"] }),
  ]);

  const conflicts = index.get("e1");
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, "UNDERSTAFFED");
  assert.equal(conflicts[0].severity, "warn");
});

test("an event with zero assigned agents is UNDERSTAFFED at critical severity", () => {
  const index = buildConflictIndex([
    event({ id: "e1", requiredAgents: 1, assignedAgentIds: [] }),
  ]);

  assert.equal(index.get("e1")[0].severity, "critical");
});

test("an event with requiredAgents 0 or unset is never flagged UNDERSTAFFED", () => {
  const index = buildConflictIndex([event({ id: "e1", requiredAgents: 0, assignedAgentIds: [] })]);
  assert.equal(index.has("e1"), false);
});

test("an event that is fully staffed has no UNDERSTAFFED conflict", () => {
  const index = buildConflictIndex([
    event({ id: "e1", requiredAgents: 2, assignedAgentIds: ["a1", "a2"] }),
  ]);
  assert.equal(index.has("e1"), false);
});

test("two overlapping missions for the same agent are flagged DOUBLE_ASSIGNMENT on both sides", () => {
  const index = buildConflictIndex([
    event({ id: "e1", start: "2026-01-05T08:00:00Z", end: "2026-01-05T16:00:00Z", assignedAgentIds: ["a1"] }),
    event({ id: "e2", start: "2026-01-05T14:00:00Z", end: "2026-01-05T20:00:00Z", assignedAgentIds: ["a1"] }),
  ]);

  const e1Conflicts = index.get("e1");
  const e2Conflicts = index.get("e2");
  assert.equal(e1Conflicts.some((c) => c.type === "DOUBLE_ASSIGNMENT" && c.severity === "critical"), true);
  assert.equal(e2Conflicts.some((c) => c.type === "DOUBLE_ASSIGNMENT" && c.severity === "critical"), true);
  assert.deepEqual(e1Conflicts.find((c) => c.type === "DOUBLE_ASSIGNMENT").relatedEventIds, ["e2"]);
});

test("a rest gap under 11h between two missions for the same agent is a warning, not a hard conflict", () => {
  const index = buildConflictIndex([
    event({ id: "e1", start: "2026-01-05T08:00:00Z", end: "2026-01-05T16:00:00Z", assignedAgentIds: ["a1"] }),
    event({ id: "e2", start: "2026-01-06T00:00:00Z", end: "2026-01-06T08:00:00Z", assignedAgentIds: ["a1"] }), // 8h gap
  ]);

  const e1Conflicts = index.get("e1");
  assert.equal(e1Conflicts.some((c) => c.type === "REST_PERIOD_VIOLATION" && c.severity === "warn"), true);
  assert.equal(e1Conflicts.some((c) => c.type === "DOUBLE_ASSIGNMENT"), false);
});

test("a rest gap of exactly 11h or more raises no conflict", () => {
  const index = buildConflictIndex([
    event({ id: "e1", start: "2026-01-05T08:00:00Z", end: "2026-01-05T16:00:00Z", assignedAgentIds: ["a1"] }),
    event({ id: "e2", start: "2026-01-06T03:00:00Z", end: "2026-01-06T11:00:00Z", assignedAgentIds: ["a1"] }), // 11h gap
  ]);

  assert.equal(index.has("e1"), false);
  assert.equal(index.has("e2"), false);
});

test("missions for different agents never trigger DOUBLE_ASSIGNMENT or REST_PERIOD_VIOLATION between them", () => {
  const index = buildConflictIndex([
    event({ id: "e1", start: "2026-01-05T08:00:00Z", end: "2026-01-05T16:00:00Z", assignedAgentIds: ["a1"] }),
    event({ id: "e2", start: "2026-01-05T09:00:00Z", end: "2026-01-05T17:00:00Z", assignedAgentIds: ["a2"] }),
  ]);

  assert.equal(index.has("e1"), false);
  assert.equal(index.has("e2"), false);
});

test("with three sequential missions for one agent, only the adjacent close pair is flagged", () => {
  const index = buildConflictIndex([
    event({ id: "e1", start: "2026-01-05T08:00:00Z", end: "2026-01-05T16:00:00Z", assignedAgentIds: ["a1"] }),
    // 8h gap after e1 -> rest violation with e1
    event({ id: "e2", start: "2026-01-06T00:00:00Z", end: "2026-01-06T04:00:00Z", assignedAgentIds: ["a1"] }),
    // 20h gap after e2, well over 11h -> no violation with e2, and far enough from e1 too
    event({ id: "e3", start: "2026-01-07T00:00:00Z", end: "2026-01-07T08:00:00Z", assignedAgentIds: ["a1"] }),
  ]);

  assert.equal(index.get("e1").some((c) => c.relatedEventIds?.includes("e2")), true);
  assert.equal(index.has("e3"), false);
});

test("getWorstSeverity picks critical over warn over info, and null when empty", () => {
  assert.equal(getWorstSeverity(undefined), null);
  assert.equal(getWorstSeverity([]), null);
  assert.equal(getWorstSeverity([{ severity: "info" }]), "info");
  assert.equal(getWorstSeverity([{ severity: "warn" }, { severity: "info" }]), "warn");
  assert.equal(
    getWorstSeverity([{ severity: "warn" }, { severity: "critical" }, { severity: "info" }]),
    "critical"
  );
});
