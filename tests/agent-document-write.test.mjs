import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function compile(relative, mocks = {}, extras = {}) {
  const exports = {};
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Buffer, URL, File, console: { error() {} },
    require: name => { assert.ok(name in mocks, name); return mocks[name]; }, ...extras,
  });
  return exports;
}
const profile = compile('../src/lib/agents/profile.ts');
const paths = compile('../src/lib/uploads/agent-file-access.ts', { 'server-only': {} });
const validation = compile('../src/lib/uploads/file-validation.ts', { 'server-only': {} });
const oldPath = 'tenants/t/agents/a/documents/old.pdf';
const newPath = 'tenants/t/agents/a/documents/new.pdf';
function fixture({ role = 'manager', tenantId = 't', path = oldPath, uploadFails = false, commitFails = false, cleanupFails = false, deleted = true } = {}) {
  let state = { tenantId, profile: { notes: 'Keep history', documents: [{ id: 'old', label: 'Old', path, url: '', expiresAt: '2027-01-01' }] } };
  let uploads = 0;
  const cleanups = [];
  const snapshot = () => ({ exists: true, data: () => structuredClone(state) });
  const ref = { get: async () => snapshot() };
  const db = {
    collection: () => ({ doc: () => ref }),
    runTransaction: async callback => {
      let pending;
      const result = await callback({ get: async () => snapshot(), set: (_ref, value) => { pending = value; } });
      if (commitFails) throw Error('SIMULATED_COMMIT_FAILURE');
      if (pending) state = { ...state, ...pending };
      return result;
    },
  };
  const route = compile('../src/app/api/agents/[id]/documents/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    'node:crypto': { randomUUID: () => 'new' },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'now' } },
    '@/app/api/_utils/withTenant': { requireTenantUser: async () => ({ ok: true, role, tenantId: 't', uid: 'u' }), canWrite: value => ['owner', 'admin', 'manager'].includes(value) },
    '@/lib/firebase/admin': { adminDb: db },
    '@/lib/agents/profile': profile,
    '@/lib/uploads/agent-file-access': paths,
    '@/lib/uploads/file-validation': validation,
    '@/lib/uploads/tenant-files': {
      uploadTenantFile: async () => { uploads++; if (uploadFails) throw Error('SIMULATED_UPLOAD_FAILURE'); return { path: newPath, storageMode: 'firebase' }; },
      deleteTenantFile: async target => { cleanups.push(target.path); if (cleanupFails) throw Error('SIMULATED_CLEANUP_FAILURE'); return { deleted }; },
    },
  });
  const params = { params: Promise.resolve({ id: 'a' }) };
  return {
    state: () => JSON.parse(JSON.stringify(state)), cleanups, uploads: () => uploads,
    post: () => route.POST({ formData: async () => {
      const data = new FormData();
      data.set('file', new File(['%PDF-1.7\nfictitious'], 'test.pdf', { type: 'application/pdf' }));
      return data;
    } }, params),
    delete: () => route.DELETE({ json: async () => ({ documentId: 'old' }) }, params),
  };
}
test('document upload preserves old document and profile', async () => {
  const f = fixture();
  const before = f.state();
  assert.equal((await f.post()).status, 200);
  assert.deepEqual(f.state().profile.documents[0], {
    ...before.profile.documents[0], kind: null, fileName: null,
    mimeType: null, size: null, uploadedAt: null,
  });
  assert.equal(f.state().profile.notes, before.profile.notes);
  assert.equal(f.state().profile.documents.length, 2);
  assert.deepEqual(f.cleanups, []);
});
for (const options of [{ uploadFails: true }, { commitFails: true }, { commitFails: true, cleanupFails: true }]) {
  test(`failed upload keeps old reference: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options), before = f.state();
    assert.ok((await f.post()).status >= 500);
    assert.deepEqual(f.state(), before);
    assert.deepEqual(f.cleanups, options.uploadFails ? [] : [newPath]);
  });
}
for (const role of ['agent', 'viewer']) {
  test(`document writes refused for ${role}`, async () => {
    const f = fixture({ role });
    assert.equal((await f.post()).status, 403);
    assert.equal((await f.delete()).status, 403);
    assert.equal(f.uploads(), 0);
    assert.deepEqual(f.cleanups, []);
  });
}
for (const path of ['tenants/t/agents/b/documents/file.pdf', 'tenants/foreign/agents/a/documents/file.pdf', 'tenants/t/agents/a/photo/file.png', 'tenants/t/agents/a/documents/../file.pdf']) {
  test(`unsafe document deletion leaves metadata and storage intact: ${path}`, async () => {
    const f = fixture({ path }), before = f.state();
    assert.equal((await f.delete()).status, 500);
    assert.deepEqual(f.state(), before);
    assert.deepEqual(f.cleanups, []);
  });
}
test('foreign tenant cannot upload or delete', async () => {
  const f = fixture({ tenantId: 'foreign' });
  assert.equal((await f.post()).status, 404);
  assert.equal((await f.delete()).status, 404);
  assert.equal(f.uploads(), 0);
  assert.deepEqual(f.cleanups, []);
});
test('failed deletion commit never deletes stored file', async () => {
  const f = fixture({ commitFails: true }), before = f.state();
  assert.equal((await f.delete()).status, 500);
  assert.deepEqual(f.state(), before);
  assert.deepEqual(f.cleanups, []);
});
for (const [options, status] of [[{}, 'deleted'], [{ deleted: false }, 'not-found'], [{ cleanupFails: true }, 'pending']]) {
  test(`deletion exposes actual cleanup state: ${status}`, async () => {
    const f = fixture(options), response = await f.delete();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).storageCleanup, status);
    assert.equal(f.state().profile.documents.length, 0);
    assert.deepEqual(f.cleanups, [oldPath]);
  });
}
