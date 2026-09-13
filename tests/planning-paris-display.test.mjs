import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as display from '../src/lib/planning/paris-display.ts';
import { parsePlanningDateTime as date } from '../src/lib/planning/paris-time.ts';

// Execute the actual pure functions from all three TSX consumers, not replicas.
function consumer(path) {
  const source = readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = ast.statements.filter(ts.isFunctionDeclaration).filter(n => /^[a-z]/.test(n.name.text) && !n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword));
  const names = functions.map(n => n.name.text);
  const code = ts.transpileModule(functions.map(n => n.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return runInNewContext(code + '\n({' + names.join(',') + '})', {
    ...display, Date, Intl, parsePlanningDateTime: date,
  });
}

function checks() {
  const board = consumer('components/dashboard/planning/AgentPlanningBoard.tsx');
  const agent = consumer('app/agent-planning/print/[id]/page.tsx');
  const site = consumer('app/site-planning/print/page.tsx');
  const vacation = { id: 'night', siteId: 'site', siteName: 'Site', assignedAgentIds: ['agent'], requiredAgents: 1,
    startAtIso: '2026-09-13T22:30:00Z', endAtIso: '2026-09-14T04:00:00Z' };
  for (const c of [board, agent, site]) {
    assert.equal(c.toDayKey(vacation.startAtIso), '2026-09-14');
    assert.equal(c.formatHour(vacation.startAtIso), '00:30');
    assert.equal(c.isWeekend(date('2026-09-14')), false);
    assert.equal(c.isWeekend(date('2026-09-13')), true);
  }
  const weeks = board.buildWeekGroups('2026-09-13T22:00:00Z', '2026-09-20T22:00:00Z', [vacation]);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].id, '2026-09-14');
  assert.equal(display.parisDayKey(weeks[0].days[6]), '2026-09-20');
  assert.match(board.formatHeaderDay(weeks[0].days[0]), /14\/09/);
  const plans = site.buildSitePlans({ sites: [{ id: 'site', name: 'Site' }], agents: [{ id: 'agent' }], vacations: [vacation], selectedSiteId: 'site', selectedClientId: null });
  assert.equal(plans[0].rows[0].vacationsByDay['2026-09-14'][0].id, 'night');

  for (const [day, next, hours] of [['2026-03-29','2026-03-30',23], ['2026-10-25','2026-10-26',25]]) {
    const startAtIso = date(day).toISOString(), endAtIso = date(next).toISOString();
    const full = { ...vacation, startAtIso, endAtIso };
    assert.equal(site.buildDays(startAtIso, endAtIso).length, 1);
    assert.equal(site.buildDays(startAtIso, endAtIso)[0].key, day);
    assert.equal(agent.formatCompactHourRange(startAtIso, endAtIso), '00h-24h');
    assert.equal(site.formatCompactHourRange(full), '00h-24h');
    assert.equal(agent.getVacationDurationHours(full), hours);
    assert.equal(site.getVacationDurationHours(full), hours);
    assert.equal(display.parisCivilRangeDays(date(day), date(next)), 1);
    const w = board.buildWeekGroups(startAtIso, endAtIso, [full]);
    assert.equal(w.length, 1);
    assert.equal(display.parisDayKey(w[0].days[6]), day);
  }
  for (const [start, end, hours] of [['2026-03-28T20:00','2026-03-29T04:00',7], ['2026-10-24T20:00','2026-10-25T04:00',9]]) {
    const night = { ...vacation, startAtIso: date(start).toISOString(), endAtIso: date(end).toISOString() };
    assert.equal(agent.formatCompactHourRange(night.startAtIso, night.endAtIso), '20h-04h (+1j)');
    assert.equal(site.formatCompactHourRange(night), '20h-04h (+1j)');
    assert.equal(agent.getVacationDurationHours(night), hours);
  }
  for (const instant of ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z']) {
    assert.equal(agent.formatHour(instant), '02:30');
    assert.equal(site.toDayKey(instant), '2026-10-25');
  }
  const rollover = { ...vacation, startAtIso: '2026-12-31T23:30:00Z', endAtIso: '2027-01-01T05:00:00Z' };
  const months = agent.buildMonthlyGroups(null, null, [rollover]);
  assert.equal(months.length, 1);
  assert.equal(months[0].year, 2027);
  assert.equal(months[0].monthNumber, 0);
  assert.equal(months[0].days[0].vacations[0].id, 'night');
  assert.equal(months[0].days.length, 31);
  const monthEndNight = { ...vacation, startAtIso: date('2026-04-30T20:00').toISOString(), endAtIso: date('2026-05-01T04:00').toISOString() };
  const nightMonths = agent.buildMonthlyGroups(null, null, [monthEndNight]);
  assert.equal(nightMonths.length, 1);
  assert.equal(nightMonths[0].monthNumber, 3);
  assert.equal(nightMonths[0].days[29].vacations[0].id, 'night');
  assert.equal(agent.buildMonthlyGroups('2026-02-01T00:00:00+01:00', '2026-03-01T00:00:00+01:00', []).length, 1);
  assert.equal(site.buildDays('2026-02-01', '2026-03-01').length, 28);
  assert.equal(site.buildDays('2028-02-01', '2028-03-01').length, 29);
  assert.equal(site.buildDays('2026-10-01', '2026-11-01').length, 31);
  assert.equal(display.parisCivilRangeDays(date('2026-10-01'), date('2026-11-01')), 31);
  assert.match(site.formatRange('2026-03-29T00:00:00+01:00', '2026-03-30T00:00:00+02:00'), /29 mars 2026 - 29 mars 2026/);
  assert.equal(site.coerceDateIso('2026-09-14', ''), '2026-09-13T22:00:00.000Z');
  assert.equal(site.coerceDateIso('invalid', 'fallback'), 'fallback');
  assert.equal(site.buildDays('invalid', 'invalid').length, 0);
  assert.equal(display.parisDayKey('invalid'), null);
}

if (process.env.SENTRYS_PARIS_DISPLAY_CHILD === '1') {
  checks();
} else {
  test('actual portal and print grouping, columns, night labels, and DST durations', checks);
  for (const TZ of ['UTC', 'Europe/Paris', 'America/New_York', 'Asia/Tokyo']) {
    test('portal and print are independent of runtime timezone: ' + TZ, () => {
      execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(import.meta.url)], {
        env: { ...process.env, TZ, SENTRYS_PARIS_DISPLAY_CHILD: '1' }, windowsHide: true, timeout: 30000,
      });
    });
  }
}
