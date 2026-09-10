import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as helpers from '../src/lib/planning/site-templates.ts';
import { parsePlanningDateTime as date, toParisDateTimeValue as wall } from '../src/lib/planning/paris-time.ts';

const entry = (dayOfWeek = 7, startTime = '20:00', endTime = '04:00') => ({ dayOfWeek, startTime, endTime, missionType: 'ADS', title: 'Test', requiredQualification: null, assignedAgentId: null, notes: null });
const range = (from, to) => ({ from, to });

for (const [day, hours] of [['2026-03-28', 7], ['2026-10-24', 9], ['2026-12-31', 8]]) {
  test('site template overnight Paris ' + day, () => {
    const result = helpers.buildDateRangeForTemplateEntry(date(day), entry(6));
    assert.equal(wall(result.start), day + 'T20:00');
    assert.equal(wall(result.end).slice(11), '04:00');
    assert.equal((result.end - result.start) / 3600000, hours);
  });
}

test('night end is resolved on its actual day, not the start day', () => {
  assert.equal(wall(helpers.buildDateRangeForTemplateEntry(date('2026-03-29'), entry(7, '20:00', '02:30')).end), '2026-03-30T02:30');
  assert.equal(wall(helpers.buildDateRangeForTemplateEntry(date('2026-10-25'), entry(7, '20:00', '02:30')).end), '2026-10-26T02:30');
});

test('Paris midnight, Monday and next week use Paris calendar fields', () => {
  const monday = new Date('2026-09-13T22:30:00Z');
  assert.equal(wall(helpers.getWeekStartMonday(monday)), '2026-09-14T00:00');
  assert.equal(helpers.matchesTemplateDay(monday, 1), true);
  assert.equal(wall(helpers.addWeeks(date('2026-10-18T20:00'), 1)), '2026-10-25T20:00');
  assert.equal(wall(helpers.buildDateRangeFromWeekStart(date('2026-10-19'), entry()).start), '2026-10-25T20:00');
});

test('visible period is civil Paris days with exclusive end', () => {
  const result = helpers.prepareSiteTemplateWindows([entry()], 'visible_period', range('2026-10-17', '2026-10-26'));
  assert.equal(result.error, null);
  assert.deepEqual(result.windows.map(x => wall(x.start)), ['2026-10-18T20:00', '2026-10-25T20:00']);
  const exact = helpers.prepareSiteTemplateWindows([entry(1)], 'visible_period', range('2026-09-13T22:00:00Z', '2026-09-20T22:00:00Z'));
  assert.deepEqual(exact.windows.map(x => wall(x.start)), ['2026-09-14T20:00']);
});

test('next week and next month include final day and cross year', () => {
  const week = helpers.prepareSiteTemplateWindows([entry()], 'next_week', range('2026-10-12', '2026-10-19'));
  assert.deepEqual(week.windows.map(x => wall(x.start)), ['2026-10-25T20:00']);
  const month = helpers.prepareSiteTemplateWindows([entry()], 'next_month', range('2026-12-15', '2027-01-01'));
  assert.equal(month.error, null);
  assert.deepEqual(month.windows.map(x => wall(x.start)), ['2027-01-03T20:00', '2027-01-10T20:00', '2027-01-17T20:00', '2027-01-24T20:00', '2027-01-31T20:00']);
  assert.equal(wall(month.windows.at(-1).end), '2027-02-01T04:00');
});

for (const [from, to] of [['2026-03-15', '2026-03-30'], ['2026-10-11', '2026-10-26']]) {
  for (const invalid of [entry(7, '02:30', '04:00'), entry(6, '20:00', '02:30')]) {
    test(`atomic DST rejection ${from} ${invalid.startTime}`, () => {
      const result = helpers.prepareSiteTemplateWindows([entry(1), invalid], 'visible_period', range(from, to));
      assert.match(result.error, /inexistant ou ambigu en heure de Paris/);
      assert.deepEqual(result.windows, []);
    });
  }
}

test('invalid input produces explicit empty preparation without throwing', () => {
  for (const period of [range('wrong', '2026-09-10'), range('2026-09-10', 'wrong'), range('2026-09-11', '2026-09-10')]) {
    const result = helpers.prepareSiteTemplateWindows([entry()], 'visible_period', period);
    assert.ok(result.error);
    assert.deepEqual(result.windows, []);
  }
});

for (const zone of ['UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo']) test('site template runtime independence ' + zone, () => {
  const url = new URL('../src/lib/planning/site-templates.ts', import.meta.url).href;
  const script = `import {prepareSiteTemplateWindows} from ${JSON.stringify(url)}; const r=prepareSiteTemplateWindows(${JSON.stringify([entry()])},'next_week',{from:'2026-10-12',to:'2026-10-19'}); console.log(JSON.stringify(r));`;
  const result = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8', windowsHide: true }));
  assert.equal(result.error, null);
  assert.equal(result.windows[0].start, '2026-10-25T19:00:00.000Z');
  assert.equal(result.windows[0].end, '2026-10-26T03:00:00.000Z');
});

const source = readFileSync(new URL('../src/components/dashboard/planning/SiteTemplateSheet.tsx', import.meta.url), 'utf8');
function callback(name, context) {
  const from = source.indexOf(`  const ${name} = React.`);
  const to = source.indexOf('\n  const ', from + 1);
  assert.ok(from > 0 && to > from);
  const js = ts.transpileModule(source.slice(from, to) + `\nresult = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const sandbox = { ...helpers, Date, Error, React: { useCallback: fn => fn, useMemo: fn => fn() }, ...context };
  runInNewContext(js, sandbox);
  return sandbox.result;
}

test('real preview is safe and all generation entry points block before any API/save', async () => {
  const invalid = [entry(1), entry(7, '02:30', '04:00')];
  const context = {
    range: range('2026-10-12', '2026-10-26'), target: 'visible_period', vacations: [], selectedSiteId: 'test', skipDuplicates: true,
    buildEntrySignature: () => 'test',
  };
  const buildOperationsFromEntries = callback('buildOperationsFromEntries', context);
  const prepared = buildOperationsFromEntries(invalid, 'Test');
  assert.equal(prepared.operations.length, 0);
  assert.match(prepared.error, /Paris/);
  const preview = callback('générationPreview', { selectedSiteId: 'test', previewEntries: invalid, sites: [], buildOperationsFromEntries, analyzeOperationConflicts: () => [] });
  assert.equal(preview.operations.length, 0);
  assert.match(preview.error, /Paris/);
  const calls = [], notices = [];
  const generationContext = {
    buildOperationsFromEntries, analyzeOperationConflicts: () => [], refresh: () => {}, selectedSiteId: 'test',
    setAgentId: () => {}, setMode: () => {}, setSiteId: () => {}, previewTargetLabel: 'Test',
    toast: notice => notices.push(notice), apiFetch: () => calls.push('network'),
    saveTemplate: () => calls.push('save'), sanitizeEntries: () => invalid, sites: [],
  };
  const generateFromEntries = callback('generateFromEntries', generationContext);
  await generateFromEntries(invalid, 'Test');
  await generateFromEntries(invalid, 'Test', { safeOnly: true });
  for (const name of ['generateFromTemplate', 'generateSafeOnly']) {
    await callback(name, { ...generationContext, generateFromEntries })();
  }
  assert.deepEqual(calls, []);
  assert.equal(notices.length, 4);
  assert.ok(notices.every(n => /Paris/.test(n.description)));
});

test('real operation preparation preserves duplicate detection and ISO instants', () => {
  const build = callback('buildOperationsFromEntries', {
    range: range('2026-09-14', '2026-09-21'), target: 'visible_period', selectedSiteId: 'test', skipDuplicates: true,
    vacations: [{ siteId: 'test', startAtIso: '2026-09-14T18:00:00.000Z', endAtIso: '2026-09-15T02:00:00.000Z', title: 'Test' }],
    buildEntrySignature: () => 'test',
  });
  const result = build([entry(1), entry(2)], 'Test');
  assert.equal(result.error, null);
  assert.equal(result.skipped, 1);
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].data.startAt, '2026-09-15T18:00:00.000Z');
});
