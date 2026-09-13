import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import luxonPlugin from '@fullcalendar/luxon3';
import { DateEnv, diffDates, createEventUi, combineEventUis } from '@fullcalendar/core/internal';
import { calendarParisMutation, parisMonthDisplay } from '../src/lib/planning/calendar-paris.ts';

const zero = { years: 0, months: 0, days: 0, milliseconds: 0 };
const week = { ...zero, days: 7 };
const env = () => new DateEnv({ timeZone: 'Europe/Paris', calendarSystem: 'gregory', locale: { week: { dow: 1, doy: 4 }, options: {} }, namedTimeZoneImpl: luxonPlugin.namedTimeZonedImpl });

test('installed FullCalendar connector projects actual instants onto Paris grid', () => {
  const calendar = env();
  assert.equal(calendar.canComputeOffset, true);
  for (const [utc, hour] of [['2026-09-10T18:00:00Z', 20], ['2026-01-10T19:00:00Z', 20]]) {
    const marker = calendar.createMarker(utc);
    assert.equal(marker.getUTCHours(), hour); // FullCalendar markers hold civil fields in UTC.
    assert.equal(calendar.toDate(marker).toISOString(), new Date(utc).toISOString());
  }
  assert.equal(calendar.toDate(calendar.createMarker('2026-10-19')).toISOString(), '2026-10-18T22:00:00.000Z');
  assert.equal(calendar.toDate(calendar.createMarker('2026-10-26')).toISOString(), '2026-10-25T23:00:00.000Z');
});

test('month display uses Paris midnight and exclusive end, preserving midnight endings', () => {
  assert.deepEqual(parisMonthDisplay('2026-09-10T22:30:00Z', '2026-09-11T03:00:00Z'), { start: '2026-09-10T22:00:00.000Z', end: '2026-09-11T22:00:00.000Z' });
  assert.equal(parisMonthDisplay('2026-09-10T18:00:00Z', '2026-09-10T22:00:00Z').end, '2026-09-10T22:00:00.000Z');
});

test('monthly drag keeps real hours, not snapped display days, across DST', () => {
  assert.deepEqual(calendarParisMutation('2026-10-18T18:00:00Z', '2026-10-18T21:00:00Z', week, week), { startAt: '2026-10-25T19:00:00.000Z', endAt: '2026-10-25T22:00:00.000Z' });
});
test('real FullCalendar date delta preserves hours across a 169-hour week', () => {
  const calendar = env();
  const delta = diffDates(calendar.createMarker('2026-10-18T18:00:00Z'), calendar.createMarker('2026-10-25T19:00:00Z'), calendar);
  assert.equal(delta.days, 7);
  assert.equal(delta.milliseconds, 0);
  assert.equal(calendarParisMutation('2026-10-18T18:00:00Z', '2026-10-18T21:00:00Z', delta, delta).startAt, '2026-10-25T19:00:00.000Z');
});
test('resize changes only selected boundary and validates range', () => {
  assert.deepEqual(calendarParisMutation('2026-09-10T18:00:00Z', '2026-09-10T21:00:00Z', zero, { ...zero, milliseconds: 900000 }), { startAt: '2026-09-10T18:00:00.000Z', endAt: '2026-09-10T21:15:00.000Z' });
  assert.throws(() => calendarParisMutation('2026-09-10T18:00:00Z', '2026-09-10T21:00:00Z', { ...zero, milliseconds: 4 * 3600000 }, zero), /fin/);
});
test('spring gap and autumn ambiguity reject rather than normalizing', () => {
  for (const [day, offset] of [['2026-03-22', '+01:00'], ['2026-10-18', '+02:00']]) {
    assert.throws(() => calendarParisMutation(day + 'T02:30:00' + offset, day + 'T04:00:00' + offset, week, week), /Paris/);
  }
});
test('resource-only movement preserves the original repeated-hour instant', () => {
  for (const start of ['2026-10-25T00:30:12.345Z', '2026-10-25T01:30:12.345Z']) {
    assert.equal(calendarParisMutation(start, '2026-10-25T03:00:00Z', zero, zero).startAt, start);
  }
});

function changeHarness(saveResult = true) {
  const source = readFileSync(new URL('../src/components/dashboard/planning/PlanningCalendar.tsx', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('  const handleEventChange ='), source.indexOf('  const handleEventDidMount ='));
  const calls = [], notices = [];
  const context = { calendarParisMutation, Error, useCallback: fn => fn, mode: 'agent', updateVacation: async (...args) => { calls.push(args); return saveResult; }, toast: v => notices.push(v), captureScrollPosition: () => {}, scheduleScrollRestore: () => {}, pendingScrollRestoreRef: { current: false } };
  runInNewContext(ts.transpileModule(block + '\nglobalThis.handler=handleEventChange;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { ...context, calls, notices };
}
test('actual drag handler uses real id and boundaries, reassigns agent, reverts invalid move', async () => {
  const h = changeHarness();
  let reverted = 0;
  const arg = { event: { id: 'mission-with-dashes-agent', startStr: 'wrong-snapped-value', extendedProps: { v: { id: 'mission-with-dashes', status: 'filled', startAtIso: '2026-10-18T18:00:00Z', endAtIso: '2026-10-18T21:00:00Z' } } }, delta: week, newResource: { id: 'agent2' }, oldResource: { id: 'agent1' }, revert: () => { reverted++; } };
  await h.handler(arg);
  assert.equal(h.calls[0][0], 'mission-with-dashes');
  assert.equal(h.calls[0][1].startAt, '2026-10-25T19:00:00.000Z');
  assert.equal(h.calls[0][1].assignedAgentIds[0], 'agent2');
  arg.event.extendedProps.v.startAtIso = '2026-10-18T00:30:00Z';
  await h.handler(arg);
  assert.equal(h.calls.length, 1);
  assert.equal(reverted, 1);
});
test('actual handler reverts a server refusal', async () => {
  const h = changeHarness(false);
  let reverted = false;
  await h.handler({ event: { extendedProps: { v: { id: 'mission', status: 'filled', startAtIso: '2026-09-10T18:00:00Z', endAtIso: '2026-09-10T21:00:00Z' } } }, delta: week, revert: () => { reverted = true; } });
  assert.equal(reverted, true);
  assert.ok(h.notices.some(n => n.variant === 'destructive'));
});

for (const zone of ['UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo']) test('calendar fields independent of device ' + zone, () => {
  const url = new URL('../src/lib/planning/calendar-paris.ts', import.meta.url).href;
  const script = `import {parisCalendarDay,calendarParisMutation} from ${JSON.stringify(url)}; console.log(JSON.stringify([parisCalendarDay(new Date('2026-09-11T22:30:00Z')),calendarParisMutation('2026-10-18T18:00:00Z','2026-10-18T21:00:00Z',${JSON.stringify(week)},${JSON.stringify(week)})]));`;
  const result = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8', env: { ...process.env, TZ: zone }, windowsHide: true }));
  assert.deepEqual(result[0], { day: '2026-09-12', weekday: 6, hour: 0 });
  assert.equal(result[1].startAt, '2026-10-25T19:00:00.000Z');
});

test('calendar wiring enables named timezone and disables misleading monthly resize', () => {
  const source = readFileSync(new URL('../src/components/dashboard/planning/PlanningCalendar.tsx', import.meta.url), 'utf8');
  assert.match(source, /timeZone=\{PLANNING_TIME_ZONE\}/);
  assert.match(source, /plugins=\{\[[^\]]*luxonPlugin/);
  assert.match(source, /eventDurationEditable=\{currentView !== "resourceTimelineMonth"\}/);
  const expression = source.match(/durationEditable: (.+),/)[1];
  for (const currentView of ['resourceTimelineMonth', 'resourceTimelineWeek']) {
    const durationEditable = runInNewContext(expression, { currentView, v: { status: 'filled' } });
    const effective = combineEventUis([createEventUi({ durationEditable: false }, {}), createEventUi({ editable: true, durationEditable }, {})]);
    assert.equal(effective.durationEditable, currentView !== 'resourceTimelineMonth');
    assert.equal(effective.startEditable, true);
  }
});
