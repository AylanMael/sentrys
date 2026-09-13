import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as recurrence from '../src/lib/planning/paris-recurrence.ts';
import { parsePlanningDateTime as date, toParisDateTimeValue as wall } from '../src/lib/planning/paris-time.ts';

for (const [start, end, targetStart, targetEnd, hours] of [
  ['2026-10-18T20:00', '2026-10-18T23:00', '2026-10-25T20:00', '2026-10-25T23:00', 3],
  ['2026-03-21T20:00', '2026-03-22T04:00', '2026-03-28T20:00', '2026-03-29T04:00', 7],
  ['2026-10-17T20:00', '2026-10-18T04:00', '2026-10-24T20:00', '2026-10-25T04:00', 9],
]) test(`recurrence preserves Paris boundaries ${start}`, () => {
  const [next] = recurrence.parisRecurrenceTargets(date(start), date(end), 'week', 1);
  assert.equal(wall(next.start), targetStart);
  assert.equal(wall(next.end), targetEnd);
  assert.equal((next.end - next.start) / 3600000, hours);
});

test('monthly recurrence, year rollover, and invalid month day', () => {
  const [next] = recurrence.parisRecurrenceTargets(date('2026-12-10T20:00'), date('2026-12-11T04:00'), 'month', 1);
  assert.equal(wall(next.start), '2027-01-10T20:00');
  assert.equal(wall(next.end), '2027-01-11T04:00');
  const [night] = recurrence.parisRecurrenceTargets(date('2026-04-30T20:00'), date('2026-05-01T04:00'), 'month', 1);
  assert.equal(wall(night.start), '2026-05-30T20:00');
  assert.equal(wall(night.end), '2026-05-31T04:00');
  assert.equal((night.end - night.start) / 3600000, 8);
  assert.throws(() => recurrence.parisRecurrenceTargets(date('2026-01-31T20:00'), date('2026-01-31T23:00'), 'month', 1), /mois cible/);
});

test('weekdays use the Paris day even when UTC is previous day', () => {
  const next = recurrence.parisRecurrenceTargets(date('2026-09-14T00:30'), date('2026-09-14T06:00'), 'weekdays', 1);
  assert.deepEqual(next.map(x => wall(x.start)), ['2026-09-15T00:30', '2026-09-16T00:30', '2026-09-17T00:30', '2026-09-18T00:30']);
});

test('week boundaries cover 167/169 actual hours at DST, with exclusive end', () => {
  for (const [anchor, hours] of [['2026-03-23', 167], ['2026-10-19', 169]]) {
    const { start, end } = recurrence.parisWeekWindow(date(anchor));
    assert.equal(wall(start), anchor + 'T00:00');
    assert.equal((end - start) / 3600000, hours);
  }
  assert.deepEqual(recurrence.parisTargetWeekOffsets(date('2026-12-28'), 'next_month'), [1, 2, 3, 4]);
});

test('paste preserves daily separation across a DST transition', () => {
  const base = date('2026-10-24T20:00');
  const next = recurrence.pasteParisWindow(date('2026-10-25T20:00'), date('2026-10-25T23:00'), base, date('2026-11-02T20:00'));
  assert.equal(wall(next.start), '2026-11-03T20:00');
  assert.equal(wall(next.end), '2026-11-03T23:00');
});

test('ambiguous and nonexistent target boundaries block the full preparation', () => {
  for (const start of ['2026-03-22T02:30', '2026-10-18T02:30']) {
    assert.throws(() => recurrence.parisRecurrenceTargets(date(start), date(start.slice(0, 10) + 'T04:00'), 'week', 2), /Paris/);
  }
  const original = new Date('2026-10-25T01:30:12.345Z');
  assert.equal(recurrence.shiftParisDays(original, 0).toISOString(), original.toISOString());
  assert.throws(() => recurrence.pasteParisWindow(original, new Date('2026-10-25T03:00:00Z'), original, new Date('2026-10-25T00:30:12.345Z')), /Paris/);
  assert.throws(() => recurrence.shiftParisWindow(date('2026-10-18T04:00'), date('2026-10-18T03:00'), 7), /invalides/);
});

for (const zone of ['UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo']) test('recurrence independent of runtime ' + zone, () => {
  const url = new URL('../src/lib/planning/paris-recurrence.ts', import.meta.url).href;
  const script = `import {shiftParisWindow} from ${JSON.stringify(url)}; const x=shiftParisWindow(new Date('2026-10-18T18:00:00Z'),new Date('2026-10-18T21:00:00Z'),7); console.log(JSON.stringify([x.start.toISOString(),x.end.toISOString()]));`;
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8', windowsHide: true });
  assert.deepEqual(JSON.parse(output), ['2026-10-25T19:00:00.000Z', '2026-10-25T22:00:00.000Z']);
});

// Execute the real callbacks with only network/UI effects substituted, not a rewritten handler.
function harness(name, start, end) {
  const source = readFileSync(new URL('../src/components/dashboard/planning/PlanningContext.tsx', import.meta.url), 'utf8');
  const from = source.indexOf(`  const ${name} = useCallback(`);
  const to = source.indexOf('\n  const ', from + 1);
  assert.ok(from > 0 && to > from);
  const calls = [], notices = [];
  const vacation = { id: 'test', siteId: 'site', title: 'Recette', status: 'filled', assignedAgentIds: ['agent'], startAtIso: date(start).toISOString(), endAtIso: date(end).toISOString() };
  const context = {
    ...recurrence, Date, Error, useCallback: fn => fn, tenantId: 'tenant', vacations: [vacation], activeVacationId: 'test',
    apiFetch: async (...args) => { calls.push(args); return { ok: true }; },
    toast: message => notices.push(message), mutate: async () => {}, setIsMutating: () => {},
    setPropagationOpen: () => {}, setWeekPropagationOpen: () => {}, setPasteMode: () => {}, setPasteBusy: () => {},
    isAbsenceVacation: () => false, buildVacationFingerprint: (...args) => args.join('|'),
    clipboardRef: { current: { items: [vacation], baseStartIso: vacation.startAtIso } },
    pasteOptions: { includeNotes: true, includeAssignments: true },
  };
  runInNewContext(ts.transpileModule(source.slice(from, to) + `\nglobalThis.handler = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { ...context, calls, notices };
}

test('later invalid occurrence aborts preparation before any request', async () => {
  const h = harness('propagateActiveVacation', '2026-10-11T01:00', '2026-10-11T02:30');
  await h.handler({ ...options, occurrences: 2 });
  assert.equal(h.calls.length, 0);
  assert.ok(h.notices.some(x => /Paris/.test(x.description)));
});

test('repeating existing target sends no duplicates and does not mutate source', async () => {
  const h = harness('propagateWeekPlan', '2026-10-18T20:00', '2026-10-18T23:00');
  h.vacations.push({ ...h.vacations[0], id: 'existing', startAtIso: '2026-10-25T19:00:00.000Z', endAtIso: '2026-10-25T22:00:00.000Z' });
  const before = JSON.stringify(h.vacations);
  await h.handler(date('2026-10-12'), options);
  assert.equal(h.calls.length, 0);
  assert.equal(JSON.stringify(h.vacations), before);
});

test('propagation preserves opt-out of copying assignments and notes', async () => {
  const h = harness('propagateActiveVacation', '2026-10-18T20:00', '2026-10-18T23:00');
  await h.handler({ ...options, includeAssignments: false, includeNotes: false });
  const data = h.calls[0][1].body.operations[0].data;
  assert.equal(data.assignedAgentIds.length, 0);
  assert.equal(data.notes, null);
});

test('weekly duplication skips incomplete rows without losing valid missions', async () => {
  const h = harness('duplicateWeek', '2026-10-18T20:00', '2026-10-18T23:00');
  h.vacations.push({ ...h.vacations[0], id: 'incomplete', endAtIso: null });
  await h.handler(date('2026-10-12'));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][1].body.operations.length, 1);
});

const options = { frequency: 'week', occurrences: 1, target: 'next_week', includeNotes: true, includeAssignments: true, skipDuplicates: true };
for (const name of ['propagateActiveVacation', 'propagateWeekPlan', 'duplicateWeek', 'performPasteAt']) {
  test(`real ${name} sends explicit Paris-correct instants`, async () => {
    const h = harness(name, '2026-10-18T20:00', '2026-10-18T23:00');
    if (name === 'propagateActiveVacation') await h.handler(options);
    else if (name === 'performPasteAt') await h.handler(date('2026-10-25T20:00'));
    else await h.handler(date('2026-10-12'), options);
    assert.equal(h.calls.length, 1);
    const data = h.calls[0][1].body.operations[0].data;
    assert.equal(data.startAt, '2026-10-25T19:00:00.000Z');
    assert.equal(data.endAt, '2026-10-25T22:00:00.000Z');
    assert.deepEqual(Array.from(data.assignedAgentIds), ['agent']);
  });
  test(`real ${name} rejects DST ambiguity without sending a write`, async () => {
    const h = harness(name, '2026-10-18T01:00', '2026-10-18T02:30');
    if (name === 'propagateActiveVacation') await h.handler(options);
    else if (name === 'performPasteAt') await h.handler(date('2026-10-25T01:00'));
    else await h.handler(date('2026-10-12'), options);
    assert.equal(h.calls.length, 0);
    assert.ok(h.notices.some(x => x.variant === 'destructive' && /Paris/.test(x.description)), JSON.stringify(h.notices));
  });
}
