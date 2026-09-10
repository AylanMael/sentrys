import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canManagePlanning } from '../src/lib/auth/role.ts';

const validation = {};
runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/uploads/file-validation.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: validation, Buffer, require: name => { assert.equal(name, 'server-only'); return {}; } });

function fixture({ role = 'manager', tenantId = 't', bytes = [137,80,78,71,13,10,26,10] } = {}) {
  const uploads = [], writes = [];
  const ref = { get: async () => ({ exists: true, data: () => ({ tenantId, profile: {} }) }), set: async value => writes.push(value) };
  const mocks = {
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'timestamp' } },
    '@/app/api/_utils/withTenant': { requireTenantUser: async () => ({ ok: true, role, uid: 'u', tenantId: 't' }), canWrite: canManagePlanning },
    '@/lib/firebase/admin': { adminDb: { collection: () => ({ doc: () => ref }) } },
    '@/lib/uploads/tenant-files': { uploadTenantFile: async data => { uploads.push(data); return { path: 'tenants/t/agents/a/photo/file.png', storageMode: 'firebase' }; } },
    '@/lib/uploads/agent-file-access': { secureAgentFileUrl: () => '/api/agents/a/files/photo' },
    '@/lib/uploads/file-validation': validation,
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/api/agents/[id]/photo/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, File, Buffer, console, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return { uploads, writes, post: () => exports.POST({ formData: async () => { const form = new FormData(); form.set('file', new File([new Uint8Array(bytes)], 'test.png', { type: 'image/png' })); return form; } }, { params: Promise.resolve({ id: 'a' }) }) };
}
test('manager photo API still calls server upload and stores private path', async () => {
  const f = fixture();
  assert.equal((await f.post()).status, 200);
  assert.equal(f.uploads.length, 1);
  assert.equal(f.uploads[0].tenantId, 't');
  assert.deepEqual(Array.from(f.uploads[0].folderSegments), ['agents', 'a', 'photo']);
  assert.equal(f.writes[0].profile.photoUrl, null);
});
for (const [options, status] of [[{ role: 'agent' }, 403], [{ role: 'viewer' }, 403], [{ tenantId: 'foreign' }, 404], [{ bytes: [1,2,3] }, 400]]) {
  test(`photo API rejects unauthorized or invalid input: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    assert.equal((await f.post()).status, status);
    assert.equal(f.uploads.length, 0);
    assert.equal(f.writes.length, 0);
  });
}
