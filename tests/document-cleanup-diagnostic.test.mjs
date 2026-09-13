import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/uploads/document-cleanup-diagnostic.ts', import.meta.url), 'utf8');
const exports = {};
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports, require: name => { assert.equal(name, 'server-only'); return {}; } });
const path = 'tenants/t/agents/a/documents/old.pdf';
const fixture = () => ({ tenantId: 't', agentId: 'a', agentTenantId: 't',
  trace: { tenantId: 't', agentId: 'a', cleanupStatus: 'pending', cleanupPath: path },
  references: { complete: true, unresolved: 0, paths: [] } });
const diagnose = exports.diagnoseDocumentCleanup;

test('valid preflight still requires storage inspection and exposes no private path', () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const result = diagnose(input);
  assert.equal(result.status, 'needs-storage-inspection');
  assert.equal(JSON.stringify(input), before);
  assert.doesNotMatch(JSON.stringify(result), /old.pdf|tenants\/|deleted|not-found/);
});
for (const invalid of ['', 'other', '../t', 't/a', 't\\a', ' t', 't%2fa']) {
  test(`scope rejected: ${JSON.stringify(invalid)}`, () => {
    assert.equal(diagnose({ ...fixture(), tenantId: invalid }).status, 'blocked');
  });
}
for (const patch of [null, {tenantId:'other'}, {agentId:'other'}, {cleanupStatus:'deleted'}, {cleanupStatus:'not-found'}, {cleanupStatus:undefined}]) {
  test(`trace rejected: ${JSON.stringify(patch)}`, () => {
    const input = fixture();
    input.trace = patch === null ? null : {...input.trace, ...patch};
    assert.equal(diagnose(input).status, 'blocked');
  });
}
for (const invalid of [null, '', 'https://example.invalid/old.pdf', 'tenants/t/agents/b/documents/old.pdf',
  'tenants/t/agents/a/photo/old.pdf', ...['', '../old.pdf', 'nested/old.pdf', 'bad\\old.pdf', 'bad\0.pdf', '%2e%2e.pdf', ' old.pdf'].map(s => 'tenants/t/agents/a/documents/' + s)]) {
  test(`invalid old path: ${JSON.stringify(invalid)}`, () => {
    const input = fixture(); input.trace.cleanupPath = invalid;
    assert.equal(diagnose(input).reason, 'invalid-document-path');
  });
}
test('an agent belonging to another agency is blocked', () => {
  assert.equal(diagnose({...fixture(), agentTenantId:'other'}).reason, 'scope-mismatch');
});
test('current document or resolved legacy reference blocks cleanup', () => {
  const input = fixture(); input.references.paths = [path];
  assert.equal(diagnose(input).reason, 'still-referenced');
});
for (const patch of [{complete:false}, {unresolved:1}, {unresolved:-1}, {unresolved:NaN}]) {
  test(`incomplete inventory blocks cleanup: ${JSON.stringify(patch)}`, () => {
    const input = fixture(); Object.assign(input.references, patch);
    assert.equal(diagnose(input).reason, 'incomplete-references');
  });
}
