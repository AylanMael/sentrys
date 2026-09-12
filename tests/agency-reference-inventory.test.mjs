import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(file, mocks = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/lib/uploads/${file}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, require: name => {
    if (name === 'server-only') return {};
    assert.ok(name in mocks, name); return mocks[name];
  } });
  return exports;
}
const { collectAgencyReferences: collect } = load('agency-reference-inventory', {
  './document-reference-inventory': load('document-reference-inventory'),
});
const path = 'tenants/t/agents/a/documents/old.pdf';
const other = 'tenants/t/agents/a/photo/new.png';
const single = fields => collect({ tenantId: 't', readPage: async () => ({ records: [{ id: 'a', tenantId: 't', ...fields }], nextCursor: null }) });

for (const field of ['logoUrl', 'logoPath', 'logo']) {
  for (const nested of [false, true]) {
    test(`${field} ${nested ? 'nested' : 'root'} preserves its private reference`, async () => {
      const fields = { [field]: path };
      const result = await single(nested ? { agencyProfile: fields } : fields);
      assert.equal(result.complete, true); assert.equal(result.unresolved, 0);
      assert.ok(result.paths.includes(path));
    });
  }
}
test('all aliases and both schemas are scanned, without fallback masking', async () => {
  const result = await single({ logo: path, logoPath: other, agencyProfile: { logoUrl: other } });
  assert.equal(result.paths.length, 2); assert.equal(result.unresolved, 0);
});
test('Firebase URL is decoded and its token is not exposed', async () => {
  const result = await single({ logoUrl: `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(path)}?token=SECRET` });
  assert.ok(result.paths.includes(path)); assert.equal(result.unresolved, 0);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|token=/);
});
for (const fields of [{ logoUrl: 'https://external.invalid/logo' }, { logoPath: '/brand/logo.png' },
  { logo: 42 }, { agencyProfile: [] }, { agencyProfile: 'invalid', logo: path },
  { logo: '/api/agents/a/files/photo' }]) {
  test(`unknown reference/profile blocks diagnosis: ${JSON.stringify(fields)}`, async () => {
    assert.ok((await single(fields)).unresolved > 0);
  });
}
test('later pages retain historical logos even when the first page has none', async () => {
  const seen = [];
  const result = await collect({ tenantId: 't', readPage: async cursor => {
    seen.push(cursor);
    return cursor === null ? { records: [{ id: 'a', tenantId: 't' }], nextCursor: 'a' }
      : { records: [{ id: 'b', tenantId: 't', agencyProfile: { logo: path } }], nextCursor: null };
  } });
  assert.deepEqual(seen, [null, 'a']); assert.ok(result.paths.includes(path));
});
test('page cap and foreign scope do not produce a complete inventory', async () => {
  assert.equal((await collect({ tenantId: 't', maxPages: 1, readPage: async () => ({ records: [], nextCursor: 'a' }) })).complete, false);
  assert.equal((await collect({ tenantId: 't', readPage: async () => ({ records: [{ id: 'a', tenantId: 'foreign' }], nextCursor: null }) })).complete, false);
});
test('read errors fail closed without error details', async () => {
  const result = await collect({ tenantId: 't', readPage: async () => { throw Error('PRIVATE_TOKEN'); } });
  assert.equal(result.complete, false); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOKEN/);
});

for (const failed of ['agents', 'tenants', 'planningDispatches', 'sitePlanningDispatches']) {
  test(`combined inventory cannot hide a failed source: ${failed}`, async () => {
    const { collectTenantFileReferences } = load('tenant-file-reference-inventory', {
      './document-reference-reader': { createDocumentReferenceReader: () => {} },
      './document-reference-inventory': { collectDocumentReferences: async () => ({ complete: failed !== 'agents', paths: [path], unresolved: 0, agentsRead: 1 }) },
      './agency-reference-reader': { createAgencyReferenceReader: (_db, _tenant, source) => source },
      './agency-reference-inventory': { collectAgencyReferences: async ({ readPage }) => ({ complete: readPage !== failed, paths: [other], unresolved: 0, recordsRead: 1 }) },
    });
    const result = await collectTenantFileReferences({ db: {}, tenantId: 't' });
    assert.equal(result.complete, false); assert.equal(Object.keys(result.sources).length, 4);
    assert.equal(result.paths.length, 2);
  });
}
