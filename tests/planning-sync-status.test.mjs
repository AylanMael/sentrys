import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { PlanningSyncStatus } from '../src/components/dashboard/planning/PlanningSyncStatus.tsx';
import { planningIndicatorScope } from '../src/lib/planning/indicator-scope.ts';

test('unconfirmed state is announced without success counters or a false offline diagnosis', () => {
  const html = renderToStaticMarkup(React.createElement(PlanningSyncStatus, { loading: false }));
  assert.match(html, /role="status"/);
  assert.match(html, /non confirmées/);
  assert.match(html, /peuvent ne plus être à jour/);
  assert.doesNotMatch(html, /100\s*%|hors ligne|animate-spin/);
});
test('loading state provides motion-safe feedback', () => {
  const html = renderToStaticMarkup(React.createElement(PlanningSyncStatus, { loading: true }));
  assert.match(html, /Actualisation du planning/);
  assert.match(html, /motion-safe:animate-spin/);
});
test('server confirmation remains distinct from monthly comparison eligibility', () => {
  const scope = planningIndicatorScope({ range: { from: '2026-09-07', to: '2026-09-14' }, siteId: 'all', agentId: 'all', publicationFilter: 'all', showAbsences: true, serverConfirmed: true });
  assert.equal(scope.serverConfirmed, true);
  assert.equal(scope.canCompareMonthly, false);
});
test('summary and starter consume server confirmation rather than monthly eligibility', () => {
  const read = name => readFileSync(new URL('../src/components/dashboard/planning/' + name, import.meta.url), 'utf8');
  assert.match(read('OperationalSummary.tsx'), /if \(!indicatorScope.serverConfirmed\) return <PlanningSyncStatus/);
  assert.match(read('PlanningCalendar.tsx'), /showEmptyStarter = indicatorScope.serverConfirmed && !loading/);
});
