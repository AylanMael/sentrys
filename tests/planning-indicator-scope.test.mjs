import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { planningIndicatorScope, buildMonthlyComparisons, isMonthlyAssessmentComplete } from '../src/lib/planning/indicator-scope.ts';

const input = { range: { from: '2026-10-01T00:00:00+02:00', to: '2026-11-01T00:00:00+01:00' }, siteId: 'all', agentId: 'all', publicationFilter: 'all', showAbsences: true, serverConfirmed: true };
test('entire Paris month is comparable despite DST extra hour', () => {
  const scope = planningIndicatorScope(input);
  assert.equal(scope.canCompareMonthly, true);
  assert.match(scope.period, /01 oct.*31 oct/);
  assert.equal(planningIndicatorScope({ ...input, agentId: 'a' }).canCompareMonthly, true);
});
for (const change of [
  { range: null }, { range: { from: 'bad', to: 'bad' } },
  { range: { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' } },
  { range: { from: '2026-10-05', to: '2026-10-12' } },
  { range: { from: '2026-09-28', to: '2026-11-02' } },
  { siteId: 'site' }, { publicationFilter: 'published' }, { showAbsences: false }, { serverConfirmed: false },
]) test('partial or unconfirmed comparison is unavailable ' + JSON.stringify(change), () => {
  const scope = planningIndicatorScope({ ...input, ...change });
  assert.equal(scope.canCompareMonthly, false);
  assert.deepEqual(buildMonthlyComparisons({ a: 180 }, { a: 150 }, scope.canCompareMonthly), {});
});
test('only actual positive contracts are used, never a standard fallback', () => {
  const result = buildMonthlyComparisons({ a: 180, missing: 220 }, { a: 150, zero: 0, negative: -1, bad: NaN, empty: 120 }, true);
  assert.deepEqual(result.a, { hours: 180, contract: 150, delta: 30, ratio: 120 });
  assert.equal(result.empty.hours, 0);
  for (const key of ['missing', 'zero', 'negative', 'bad']) assert.equal(result[key], undefined);
  assert.deepEqual(buildMonthlyComparisons({ a: NaN }, { a: 150 }, true), {});
});
test('agent filter never fabricates zero hours for other agents or an agency-wide verdict', () => {
  const comparisons = buildMonthlyComparisons({ a: 160 }, { a: 150, b: 150 }, true, 'a');
  assert.equal(comparisons.b, undefined);
  assert.equal(isMonthlyAssessmentComplete(true, 'a', { a: 160 }, comparisons), false);
  assert.equal(isMonthlyAssessmentComplete(true, 'all', { a: 160, closedOnly: 10 }, comparisons), false);
  assert.equal(isMonthlyAssessmentComplete(true, 'all', { a: 160 }, comparisons), true);
});
for (const TZ of ['UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo']) test('indicator eligibility independent of device ' + TZ, () => {
  const url = new URL('../src/lib/planning/indicator-scope.ts', import.meta.url).href;
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `import {planningIndicatorScope} from ${JSON.stringify(url)}; console.log(JSON.stringify(planningIndicatorScope(${JSON.stringify(input)})));`], { env: { ...process.env, TZ }, encoding: 'utf8', windowsHide: true });
  assert.deepEqual(JSON.parse(output), planningIndicatorScope(input));
});
test('all visual contract comparisons use the shared eligible result', () => {
  for (const file of ['PlanningCalendar.tsx', 'OperationsActionCenter.tsx', 'PeriodValidationSheet.tsx']) {
    const source = readFileSync(new URL('../src/components/dashboard/planning/' + file, import.meta.url), 'utf8');
    assert.match(source, /monthlyComparisons/);
    assert.doesNotMatch(source, /stats\.agentContractualHours\[/);
  }
  const resource = readFileSync(new URL('../src/components/dashboard/planning/CalendarResource.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(resource, /151\.67/);
  assert.match(resource, /!!comparison && comparison.delta > 0/);
});
test('unassessed monthly check remains explicit in cockpit and journal', () => {
  const source = readFileSync(new URL('../src/components/dashboard/planning/PeriodValidationSheet.tsx', import.meta.url), 'utf8');
  assert.match(source, /\(!monthlyAssessmentComplete \? 1 : 0\)/);
  assert.match(source, /overtimeEvaluated: monthlyAssessmentComplete \? 1 : 0/);
  assert.match(source, /Score partiel — contrôle incomplet/);
  assert.match(source, /actions.length === 0 && monthlyAssessmentComplete/);
  assert.match(source, /overtimeAgentFiltered: filteredAgentId !== "all" \? 1 : 0/);
  assert.match(source, /entry.metrics\?\.overtimeEvaluated === 0/);
});
test('cached, pending, errored and previous-tenant snapshots cannot enable comparison', () => {
  const source = readFileSync(new URL('../src/components/dashboard/planning/PlanningContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /includeMetadataChanges: true/);
  assert.match(source, /!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites \? tenantId : null/);
  assert.match(source, /confirmedTenant === tenantId/);
  assert.match(source, /\(err\) => \{\s*setConfirmedTenant\(null\)/);
});
