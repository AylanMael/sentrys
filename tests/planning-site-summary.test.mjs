import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlanningSiteSummary } from '../src/components/dashboard/planning/PlanningSiteSummary.tsx';

const render = site => renderToStaticMarkup(React.createElement(PlanningSiteSummary, { site }));
test('site banner renders actual site and client without invented mission data', () => {
  const html = render({ id: 'site', name: 'Centre Atlas', clientName: 'Client Exemple' });
  assert.match(html, /Centre Atlas/);
  assert.match(html, /Client Exemple/);
  assert.doesNotMatch(html, /SAMSIC|ADS|GARDIENNAGE/);
});
test('site banner explicitly handles missing data', () => {
  assert.match(render(undefined), /Site non disponible/);
  assert.match(render({ id: 's', name: 'Site', clientName: ' ' }), /Non renseigné/);
});
test('site banner escapes content and allows long names to wrap', () => {
  const html = render({ id: 's', name: '<script>alert(1)</script>', clientName: 'A'.repeat(250) });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /break-words/);
  assert.match(html, /A{250}/);
  assert.match(html, /line-clamp-2/);
  assert.match(html, /Voir les noms complets/);
  assert.match(html, /max-h-24 overflow-y-auto/);
  assert.match(html, /tabindex="0"/);
});
