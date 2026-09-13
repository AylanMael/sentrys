import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/app/api/agents/[id]/files/[fileId]/route.ts', import.meta.url), 'utf8');
const pathSource = readFileSync(new URL('../src/lib/uploads/agent-file-access.ts', import.meta.url), 'utf8');
function fixture({ role = 'agent', target = 'a', tenant = 't', path = 'tenants/t/agents/a/documents/test.pdf', fileId = 'file', authResponse = null } = {}) {
  let reads = 0;
  let databaseReads = 0;
  const helpers = {};
  const compile = value => ts.transpileModule(value, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compile(pathSource), { exports: helpers, URL, require: name => { assert.equal(name, 'server-only'); return {}; } });
  class NextResponse extends Response { static json(value, options) { return Response.json(value, options); } }
  const mocks = {
    'node:fs/promises': { readFile: async () => { reads++; return Buffer.from('PRIVATE TEST FILE'); } },
    'node:path': { join: (...parts) => parts.join('/') },
    'next/server': { NextResponse },
    '@/app/api/_utils/withTenant': {
      requireTenantUser: async () => authResponse
        ? { ok: false, res: authResponse }
        : { ok: true, uid: 'u', agentId: 'a', tenantId: 't', role },
      canWrite: r => ['owner', 'admin', 'manager'].includes(r), isAgent: r => r === 'agent',
      forbidden: () => Response.json({ ok: false }, { status: 403 }),
    },
    '@/lib/agents/profile': { normalizeAgentDocuments: items => items },
    '@/lib/firebase/admin': { adminDb: { collection: () => ({ doc: () => ({ get: async () => {
      databaseReads++;
      return { exists: true, data: () => ({ tenantId: tenant, profile: { photoPath: path, documents: [{ id: 'file', path, fileName: 'test.pdf', mimeType: 'application/pdf' }] } }) };
    } }) }) } },
    '@/lib/uploads/agent-file-access': helpers,
  };
  const exports = {};
  runInNewContext(compile(source), { exports, Buffer, Uint8Array, console, process: { env: { NODE_ENV: 'test' }, cwd: () => '/local' }, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return { get: () => exports.GET({}, { params: Promise.resolve({ id: target, fileId }) }), reads: () => reads, databaseReads: () => databaseReads };
}

for (const status of [401, 403]) {
  test(`authentication guard response ${status} is preserved without reading data`, async () => {
    const authResponse = Response.json({ ok: false, error: 'Access denied' }, { status });
    const f = fixture({ role: 'manager', authResponse });
    assert.equal(await f.get(), authResponse);
    assert.equal(f.databaseReads(), 0);
    assert.equal(f.reads(), 0);
  });
}

for (const options of [{}, { target: 'b' }, { fileId: 'missing' }, { role: 'viewer' }, { role: 'client' }, { fileId: 'photo', target: 'b' }]) {
  test(`role or ownership refusal precedes database access: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    assert.equal((await f.get()).status, 403);
    assert.equal(f.databaseReads(), 0);
    assert.equal(f.reads(), 0);
  });
}
test('manager file is downloadable with private no-store headers', async () => {
  const f = fixture({ role: 'manager' }), response = await f.get();
  assert.equal(response.status, 200);
  assert.equal(f.databaseReads(), 1);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(await response.text(), 'PRIVATE TEST FILE');
});
for (const options of [{}, { target: 'b' }, { role: 'viewer' }, { role: 'manager', tenant: 'foreign' }, { role: 'manager', path: 'tenants/t/agents/b/documents/test.pdf' }, { role: 'manager', path: 'tenants/t/agents/a/documents/../secret.pdf' }]) {
  test(`private file blocked before reading bytes: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    assert.ok([403, 404].includes((await f.get()).status));
    assert.equal(f.reads(), 0);
  });
}
test('manager can download same-tenant document but not foreign-tenant file', async () => {
  assert.equal((await fixture({ role: 'manager' }).get()).status, 200);
  assert.equal((await fixture({ role: 'manager', tenant: 'foreign' }).get()).status, 404);
});
test('own profile photo remains accessible but cannot alias a document', async () => {
  assert.equal((await fixture({ fileId: 'photo', path: 'tenants/t/agents/a/photo/test.png' }).get()).status, 200);
  const alias = fixture({ fileId: 'photo' });
  assert.equal((await alias.get()).status, 403);
  assert.equal(alias.reads(), 0);
  assert.equal((await fixture({ fileId: 'photo', target: 'b' }).get()).status, 403);
});
