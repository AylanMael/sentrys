import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/agents/document-availability.ts', import.meta.url), 'utf8');
const exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const { hasPrivateDocumentReference } = exports;
const valid = { id: 'doc', path: 'tenants/t/agents/a/documents/file.pdf', url: '/api/agents/a/files/doc' };

test('private document reference stays openable without changing its metadata', () => {
  const document = Object.freeze({ ...valid, label: 'Carte', expiresAt: '2027-01-01' });
  assert.equal(hasPrivateDocumentReference(document, 'a', 't'), true);
  assert.equal(document.label, 'Carte');
  assert.equal(document.expiresAt, '2027-01-01');
});

for (const [name, patch] of [
  ['legacy demo URL', { path: null, url: 'https://example.invalid/document.pdf' }],
  ['API URL without stored path', { path: null }],
  ['external URL even with path', { url: 'https://example.invalid/document.pdf' }],
  ['other agent', { path: 'tenants/t/agents/b/documents/file.pdf' }],
  ['other tenant', { path: 'tenants/other/agents/a/documents/file.pdf' }],
  ['photo alias', { path: 'tenants/t/agents/a/photo/file.pdf' }],
  ['traversal', { path: 'tenants/t/agents/a/documents/../file.pdf' }],
  ['directory only', { path: 'tenants/t/agents/a/documents/' }],
  ['mismatched download route', { url: '/api/agents/a/files/other' }],
]) {
  test(`unavailable reference: ${name}`, () => {
    const document = Object.freeze({ ...valid, ...patch });
    assert.equal(hasPrivateDocumentReference(document, 'a', 't'), false);
    assert.deepEqual(document, { ...valid, ...patch });
  });
}

test('document UI explains the unavailable state and prevents opening legacy URLs', () => {
  const page = readFileSync(new URL('../src/app/dashboard/agents/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /Fichier indisponible — à remplacer/);
  assert.match(page, /L’historique est conservé/);
  assert.match(page, /disabled=\{!canOpenDocument\}/);
  assert.match(page, /if \(!canOpenDocument\) return;/);
  assert.doesNotMatch(page, /document\.fileName \|\| document\.url/);
});

test('unavailable document guidance uses replacement instead of a duplicate upload', () => {
  const page = readFileSync(new URL('../src/app/dashboard/agents/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /Cliquez sur « Remplacer »/);
  assert.match(page, /sans créer de doublon/);
  assert.match(page, /Demandez à un responsable de remplacer ce justificatif/);
  assert.doesNotMatch(page, /Ajoutez le justificatif dans le formulaire ci-dessous/);
});

test('replacement guidance does not promise an unavailable file or guaranteed cleanup', () => {
  const page = readFileSync(new URL('../src/app/dashboard/agents/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /La référence actuelle est conservée pendant l’envoi/);
  assert.match(page, /Si cette suppression ne peut pas être confirmée, une alerte apparaît dans l’historique/);
  assert.match(page, /sans lien vers l’ancien fichier/);
  assert.doesNotMatch(page, /L’ancien fichier reste disponible pendant l’envoi/);
});
