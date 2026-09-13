import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/lib/uploads/tenant-files.ts', import.meta.url), 'utf8');
function fixture(errors = {}) {
  const writes = [], deletions = [], exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Buffer, Date: class extends Date { static now() { return 123; } },
    process: { env: { NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'demo', FIREBASE_STORAGE_BUCKET: 'configured' } },
    console: { warn() {} }, require: name => name === 'server-only' ? {} : name === '@/lib/firebase/admin' ? {
      adminStorage: { bucket: bucket => ({ name: bucket, file: path => ({
        save: async () => { writes.push(path); },
        delete: async () => { deletions.push(bucket); if (errors[bucket]) throw { code: errors[bucket] }; },
      }) }) },
    } : require(name),
  });
  return { ...exports, writes, deletions };
}
const input = { buffer: Buffer.from('fake'), contentType: 'application/pdf', originalName: 'carte.pdf', tenantId: 't', folderSegments: ['agents', 'a', 'documents'] };
test('same timestamp and filename produce distinct paths', async () => {
  const f = fixture();
  const results = await Promise.all([f.uploadTenantFile(input), f.uploadTenantFile(input)]);
  assert.notEqual(results[0].path, results[1].path);
});
for (const folderSegments of [['agents', '..', 'documents'], ['agents', 'a/b', 'documents'], ['agents', 'a\\b', 'documents']]) {
  test(`invalid upload segment rejected: ${JSON.stringify(folderSegments)}`, async () => {
    const f = fixture();
    await assert.rejects(f.uploadTenantFile({ ...input, folderSegments }));
    assert.equal(f.writes.length, 0);
  });
}
test('missing first bucket does not skip fallback deletion', async () => {
  const f = fixture({ configured: 404, 'demo.appspot.com': 404 });
  assert.equal((await f.deleteTenantFile({ path: 'tenants/t/agents/a/documents/file', tenantId: 't' })).deleted, true);
  assert.deepEqual(f.deletions, ['configured', 'demo.firebasestorage.app', 'demo.appspot.com']);
});
test('all objects absent reports no deletion', async () => {
  const f = fixture({ configured: 404, 'demo.firebasestorage.app': 404, 'demo.appspot.com': 404 });
  assert.equal((await f.deleteTenantFile({ path: 'tenants/t/agents/a/documents/file', tenantId: 't' })).deleted, false);
});
test('permission failure cannot be hidden by success in another bucket', async () => {
  const f = fixture({ configured: 403 });
  await assert.rejects(f.deleteTenantFile({ path: 'tenants/t/agents/a/documents/file', tenantId: 't' }));
  assert.equal(f.deletions.length, 3);
});
test('foreign tenant deletion makes no storage request', async () => {
  const f = fixture();
  await assert.rejects(f.deleteTenantFile({ path: 'tenants/other/agents/a/documents/file', tenantId: 't' }));
  assert.equal(f.deletions.length, 0);
});
