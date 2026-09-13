import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PointageVerificationNotice } from '../src/components/dashboard/pointage-verification-notice.tsx';

test('empty cockpit attendance state explicitly remains unverified and links to actual pointages', () => {
  const html = renderToStaticMarkup(React.createElement(PointageVerificationNotice));
  assert.match(html, /Présences non vérifiées dans cette vue/);
  assert.match(html, /ne contrôle pas les prises et fins de service/);
  assert.match(html, /href="\/dashboard\/pointages"/);
  assert.match(html, /Vérifier les pointages/);
  assert.match(html, /Mission commencée la veille/);
  assert.doesNotMatch(html, /Tous les points clés sont confirmés|Aucun agent|ShieldCheck/);
});

test('operations overview renders the notice instead of claiming that missing data confirms presence', () => {
  const source = readFileSync(new URL('../src/components/dashboard/operations-overview.tsx', import.meta.url), 'utf8');
  assert.match(source, /summary\.missingCheckIns\.length === 0\s*\?\s*\(\s*<PointageVerificationNotice\s*\/>/);
  assert.doesNotMatch(source, /Tous les points clés sont confirmés|Aucun agent démarre/);
  const section = source.slice(source.indexOf('Prises de service à confirmer'), source.indexOf('key={`checkin-skeleton-'));
  assert.match(section, /href="\/dashboard\/pointages"/);
});
