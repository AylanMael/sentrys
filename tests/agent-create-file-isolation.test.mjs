import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function compile(path, mocks = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, console, require: name => {
    assert.ok(name in mocks, name);
    return mocks[name];
  } });
  return exports;
}
const profile = compile('../src/lib/agents/profile.ts');
const paths = compile('../src/lib/uploads/agent-file-access.ts', { 'server-only': {} });

function fixture({ role = 'manager', authenticated = true, quotaOk = true } = {}) {
  const writes = [], quotas = [], logs = [];
  const route = compile('../src/app/api/agents/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'now' } },
    '@/lib/firebase/admin': { adminDb: { collection: name => {
      assert.equal(name, 'agents');
      return { add: async data => { writes.push(data); return { id: 'created-agent' }; } };
    } } },
    '@/app/api/_utils/withTenant': { requireTenantUser: async () => authenticated
      ? { ok: true, role, tenantId: 't', uid: 'u' }
      : { ok: false, res: Response.json({ ok: false }, { status: 401 }) } },
    '@/lib/billing/limits': { assertWithinLimitsTx: async input => {
      quotas.push(input); return { ok: quotaOk, message: 'Quota exceeded', code: 'QUOTA' };
    } },
    '@/lib/activity/logger': { logActivity: async data => logs.push(data) },
    '@/lib/agents/profile': profile,
    '@/lib/uploads/agent-file-access': paths,
  });
  return { writes, quotas, logs, post: body => route.POST({ json: async () => body }) };
}
const base = { firstName: 'Test', lastName: 'Agent', employeeNumber: 'QA', monthlyContractHours: 151.67 };

test('normal creation keeps identity, tenant, quota and audit, with no file reference', async () => {
  const f = fixture();
  const response = await f.post({ ...base, tenantId: 'foreign' });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).agent.id, 'created-agent');
  assert.equal(f.writes.length, 1);
  assert.equal(f.quotas.length, 1);
  assert.equal(f.writes[0].tenantId, 't');
  assert.equal(f.writes[0].profile.employeeNumber, 'QA');
  assert.equal(f.writes[0].profile.documents.length, 0);
  assert.equal(f.writes[0].profile.photoUrl, null);
  assert.equal(f.writes[0].profile.photoPath, undefined);
  assert.equal(f.logs[0].action, 'agent.created');
});

for (const [field, value] of [
  ['documents', [{ id: 'old', path: 'tenants/t/agents/other/documents/old.pdf' }]],
  ['documents', [{ url: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/old?token=test' }]],
  ['documents', []], ['documents', null],
  ['photoUrl', 'https://example.test/old.png'], ['photoUrl', null],
  ['photoPath', 'tenants/t/agents/other/photo/old.png'], ['photoPath', ''],
]) {
  for (const nested of [false, true]) {
    test(`rejects ${nested ? 'nested' : 'root'} ${field}=${JSON.stringify(value)} before all side effects`, async () => {
      const f = fixture();
      const body = { ...base, ...(nested ? { profile: { [field]: value } } : { [field]: value }) };
      const response = await f.post(body);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).code, 'DEDICATED_FILE_ACTION_REQUIRED');
      assert.equal(f.quotas.length, 0);
      assert.equal(f.writes.length, 0);
      assert.equal(f.logs.length, 0);
    });
  }
}
for (const body of [null, [], 'text', 42]) {
  test(`invalid JSON shape ${JSON.stringify(body)} returns 400 without writes`, async () => {
    const f = fixture();
    assert.equal((await f.post(body)).status, 400);
    assert.equal(f.quotas.length, 0);
    assert.equal(f.writes.length, 0);
  });
}
for (const [options, status] of [[{ role: 'agent' }, 403], [{ role: 'viewer' }, 403], [{ authenticated: false }, 401]]) {
  test(`creation retains auth guard ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    assert.equal((await f.post(base)).status, status);
    assert.equal(f.quotas.length, 0);
    assert.equal(f.writes.length, 0);
  });
}
test('quota refusal still prevents creation', async () => {
  const f = fixture({ quotaOk: false });
  assert.equal((await f.post(base)).status, 403);
  assert.equal(f.writes.length, 0);
  assert.equal(f.logs[0].action, 'billing.limit_reached');
});
