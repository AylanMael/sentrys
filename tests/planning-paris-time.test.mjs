import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { parsePlanningDateTime, planningInputToIso, toParisDateTimeValue, parsePlanningEdit } from '../src/lib/planning/paris-time.ts';

for (const [input, expected] of [
  ['2026-09-10T20:00', '2026-09-10T18:00:00.000Z'],
  ['2026-01-10T20:00', '2026-01-10T19:00:00.000Z'],
  ['2026-09-10T00:00', '2026-09-09T22:00:00.000Z'],
  ['2026-09-10', '2026-09-09T22:00:00.000Z'],
  ['2026-09-10T20:00:12.345', '2026-09-10T18:00:12.345Z'],
  ['2026-09-10T18:00:00Z', '2026-09-10T18:00:00.000Z'],
  ['2026-09-10T20:00:00+02:00', '2026-09-10T18:00:00.000Z'],
  ['2026-10-25T02:30:00+02:00', '2026-10-25T00:30:00.000Z'],
  ['2026-10-25T02:30:00+01:00', '2026-10-25T01:30:00.000Z'],
]) test('Paris parsing ' + input, () => assert.equal(planningInputToIso(input), expected));
for (const value of ['', 'not a date', '2026-02-30T20:00', '2026-02-30T20:00Z', '2026-09-10T24:00', '2026-09-10T20:99', '2026-03-29T02:30', '2026-10-25T02:30', null, 1789063200000]) {
  test('invalid or ambiguous Paris value rejected ' + value, () => assert.equal(parsePlanningDateTime(value), null));
}
test('DST night durations are actual elapsed hours', () => {
  assert.equal((parsePlanningDateTime('2026-03-29T04:00') - parsePlanningDateTime('2026-03-29T01:00')) / 3600000, 2);
  assert.equal((parsePlanningDateTime('2026-10-25T04:00') - parsePlanningDateTime('2026-10-25T01:00')) / 3600000, 4);
});
test('unchanged repeated-hour boundary preserves its original instant and seconds', () => {
  for (const iso of ['2026-10-25T00:30:12Z', '2026-10-25T01:30:12Z']) {
    assert.equal(parsePlanningEdit('2026-10-25T02:30', iso).toISOString(), iso.replace('Z', '.000Z'));
  }
  assert.equal(parsePlanningEdit('2026-10-25T02:00', '2026-10-25T00:30:00Z'), null);
  assert.equal(parsePlanningEdit('2026-10-25T04:00', '2026-10-25T00:30:00Z').toISOString(), '2026-10-25T03:00:00.000Z');
});
for (const zone of ['UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo']) test('Paris input independent of runtime timezone ' + zone, () => {
  const url = new URL('../src/lib/planning/paris-time.ts', import.meta.url).href;
  const script = `import { planningInputToIso, toParisDateTimeValue } from ${JSON.stringify(url)}; const instant = planningInputToIso('2026-09-10T20:00'); console.log(JSON.stringify([instant, toParisDateTimeValue(new Date(instant))]));`;
  const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env: { ...process.env, TZ: zone }, encoding: 'utf8', windowsHide: true });
  assert.deepEqual(JSON.parse(output), ['2026-09-10T18:00:00.000Z', '2026-09-10T20:00']);
});
test('real creation normalization sends explicit UTC and roundtrips to Paris', () => {
  const source = readFileSync(new URL('../src/components/dashboard/planning/CreateVacationSheet.tsx', import.meta.url), 'utf8');
  const helper = source.slice(source.indexOf('function roundDateToStep('), source.indexOf('function buildDefaultVacationWindow('));
  const context = { Date, SLOT_STEP_MINUTES: 30, parsePlanningDateTime, planningInputToIso };
  runInNewContext(ts.transpileModule(helper + '\nglobalThis.normalize = normalizeDateTimeInput;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  assert.equal(context.normalize('2026-09-10T20:00'), '2026-09-10T18:00:00.000Z');
  assert.equal(context.normalize('2026-01-10T20:00'), '2026-01-10T19:00:00.000Z');
  assert.throws(() => context.normalize('2026-03-29T02:30'), /Paris/);
});
test('shared API parser delegates to Paris parser, and all write routes use it', () => {
  const source = readFileSync(new URL('../src/app/api/vacations/_shared.ts', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('export function parseDateTimeIso('), source.indexOf('export function safeArr('));
  const context = { exports: {}, parsePlanningDateTime };
  runInNewContext(ts.transpileModule(handler, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  assert.equal(context.exports.parseDateTimeIso('2026-09-10T20:00').toISOString(), '2026-09-10T18:00:00.000Z');
  for (const path of ['route.ts', '[id]/route.ts', 'bulk/route.ts']) {
    const route = readFileSync(new URL('../src/app/api/vacations/' + path, import.meta.url), 'utf8');
    assert.match(route, /parseDateTimeIso/);
  }
});
