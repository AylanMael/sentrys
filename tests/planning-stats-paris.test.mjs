import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computePlanningStats } from '../src/lib/planning/stats.ts';
import { buildConflictIndex } from '../src/lib/planning/conflicts.ts';
import { planningInputToIso } from '../src/lib/planning/paris-time.ts';

const event = (id, start, end) => ({ id, start: planningInputToIso(start), end: planningInputToIso(end), assignedAgentIds: ['agent'], status: 'filled' });
function checks() {
  for (const [start, end, total, night] of [
    ['2026-09-10T20:00', '2026-09-11T04:00', 8, 7],
    ['2026-03-28T20:00', '2026-03-29T04:00', 7, 6],
    ['2026-10-24T20:00', '2026-10-25T04:00', 9, 8],
  ]) {
    const stats = computePlanningStats([event('night', start, end)]);
    assert.equal(stats.totalHours, total);
    assert.equal(stats.nightHours, night);
  }
  const clipped = computePlanningStats([event('cross-month', '2026-09-30T20:00', '2026-10-01T04:00')], { from: planningInputToIso('2026-10-01'), to: planningInputToIso('2026-11-01') });
  assert.equal(clipped.totalHours, 4);
  assert.equal(clipped.nightHours, 4);
  assert.equal(clipped.agentMonthlyHours.agent, 4);
  const sameParisDay = [event('early', '2026-09-10T00:30', '2026-09-10T01:00'), event('late', '2026-09-10T20:00', '2026-09-10T21:00')];
  assert.equal(computePlanningStats(sameParisDay).agentWorkingDays.agent, 1);
  const streak = ['23','24','25','26','27','28','29'].map(d => event(d, `2026-03-${d}T00:30`, `2026-03-${d}T01:00`));
  assert.deepEqual(computePlanningStats(streak).consecutiveDayViolations, ['29']);
  // 12 wall-clock hours across spring DST are only 11 real hours of rest.
  const rest = [event('a', '2026-03-28T18:00', '2026-03-28T22:00'), event('b', '2026-03-29T10:00', '2026-03-29T11:00')];
  assert.deepEqual(computePlanningStats(rest).restPeriodViolations, []);
  assert.equal(buildConflictIndex(rest).size, 0);
  rest[1] = event('b', '2026-03-29T09:30', '2026-03-29T11:00');
  assert.deepEqual(computePlanningStats(rest).restPeriodViolations, ['b']);
  assert.ok(buildConflictIndex(rest).get('b').some(x => x.type === 'REST_PERIOD_VIOLATION'));
  // A Sunday mission extending into Monday occupies Monday's first 10 hours.
  // Without it, the Monday boundary falsely supplies a 36-hour rest gap.
  const monday = '2026-09-14';
  const week = [event('incoming', '2026-09-13T20:00', `${monday}T10:00`),
    event('tue', '2026-09-15T12:00', '2026-09-15T20:00'),
    event('wed', '2026-09-16T12:00', '2026-09-16T20:00'),
    event('thu', '2026-09-17T12:00', '2026-09-17T20:00'),
    event('fri', '2026-09-18T12:00', '2026-09-18T20:00'),
    event('sat', '2026-09-19T12:00', '2026-09-19T20:00'),
    event('sun', '2026-09-20T12:00', '2026-09-20T20:00')];
  assert.ok(computePlanningStats(week).weeklyRestViolations.includes('tue'));
}
if (process.env.SENTRYS_STATS_PARIS_CHILD === '1') checks();
else {
  test('Paris counters, boundaries, overnight coverage and real rest durations', checks);
  for (const TZ of ['UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo']) {
    test('stats and conflicts consistent under ' + TZ, () => {
      execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url)], { env: { ...process.env, TZ, SENTRYS_STATS_PARIS_CHILD: '1' }, windowsHide: true });
    });
  }
}
