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

function fixture({ role = 'manager', tenantId = 't', legacy = false } = {}) {
  let state = { tenantId, firstName: 'Test', lastName: 'Agent', status: 'active', profile: {
    notes: 'Before', documents: [{ id: 'old', path: 'tenants/t/agents/a/documents/old.pdf' }],
    photoPath: 'tenants/t/agents/a/photo/old.png',
  } };
  if (legacy) {
    state = { ...state, ...state.profile };
    delete state.profile;
  }
  const writes = [];
  const ref = {
    get: async () => ({ exists: true, id: 'a', data: () => structuredClone(state) }),
    set: async (patch, options) => {
      assert.equal(options.merge, true);
      // Another request replaces the document and photo after the initial read.
      const currentProfile = legacy ? state : state.profile;
      currentProfile.documents = [{ id: 'new', path: 'tenants/t/agents/a/documents/new.pdf' }];
      currentProfile.photoPath = 'tenants/t/agents/a/photo/new.png';
      writes.push(patch);
      state = legacy ? { ...state, ...patch } : { ...state, ...patch, profile: { ...state.profile, ...patch.profile } };
    },
  };
  const route = compile('../src/app/api/agents/[id]/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 'now' } },
    '@/lib/firebase/admin': { adminDb: {
      collection: () => ({ doc: () => ref }),
      runTransaction: async callback => callback({ get: () => ref.get(), set: (_ref, patch, options) => ref.set(patch, options) }),
    } },
    '@/app/api/_utils/withTenant': { requireTenantUser: async () => ({ ok: true, role, tenantId: 't', uid: 'u' }) },
    '@/lib/billing/limits': {},
    '@/lib/activity/logger': { logActivity: async () => {} },
    '@/lib/agents/profile': profile,
    '@/lib/uploads/agent-file-access': paths,
  });
  return { writes, state: () => state, patch: body => route.PATCH({ json: async () => body }, { params: Promise.resolve({ id: 'a' }) }) };
}

test('ordinary profile update preserves concurrently replaced document and photo', async () => {
  const f = fixture();
  assert.equal((await f.patch({ notes: 'After' })).status, 200);
  assert.deepEqual(Object.keys(f.writes[0].profile), ['notes']);
  assert.equal(f.state().profile.notes, 'After');
  assert.equal(f.state().profile.documents[0].id, 'new');
  assert.equal(f.state().profile.photoPath, 'tenants/t/agents/a/photo/new.png');
});
test('legacy root profile remains readable after an ordinary update', async () => {
  const f = fixture({ legacy: true });
  const response = await f.patch({ notes: 'After' });
  assert.equal(response.status, 200);
  assert.equal('profile' in f.state(), false);
  assert.equal(f.state().notes, 'After');
  const body = await response.json();
  assert.equal(body.agent.documents[0].id, 'new');
  assert.equal(body.agent.notes, 'After');
});
for (const field of ['documents', 'photoUrl', 'photoPath']) {
  test(`generic PATCH refuses file field ${field}, without any write`, async () => {
    const f = fixture();
    const response = await f.patch({ [field]: field === 'documents' ? [] : null, notes: 'After' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'DEDICATED_FILE_ACTION_REQUIRED');
    assert.equal(f.writes.length, 0);
  });
}
for (const [options, status] of [[{ role: 'agent' }, 403], [{ role: 'viewer' }, 403], [{ tenantId: 'foreign' }, 404]]) {
  test(`profile isolation retains access guard ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    assert.equal((await f.patch({ notes: 'After' })).status, status);
    assert.equal(f.writes.length, 0);
  });
}
