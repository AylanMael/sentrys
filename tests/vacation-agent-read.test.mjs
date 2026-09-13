import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canReadAssignedVacation } from '../src/lib/auth/vacation-read.ts';

const auth = { uid: 'user-a', agentId: 'agent-a', role: 'agent', tenantId: 't' };
const vacation = { tenantId: 't', siteId: 'shared-site', assignedAgentIds: ['agent-b'] };
test('vacation gate rejects colleagues, other tenants and malformed assignments', () => {
  for (const value of [vacation, { ...vacation, assignedAgentIds: null }, { ...vacation, assignedAgentIds: 'agent-a' }, { ...vacation, tenantId: 'foreign', assignedAgentIds: ['agent-a'] }]) {
    assert.equal(canReadAssignedVacation(auth, value), false);
  }
  assert.equal(canReadAssignedVacation(auth, { ...vacation, assignedAgentIds: ['agent-a'] }), true);
  assert.equal(canReadAssignedVacation({ ...auth, agentId: null }, { ...vacation, assignedAgentIds: ['user-a'] }), true);
});
test('backoffice rights remain tenant scoped', () => {
  for (const role of ['owner', 'admin', 'manager', 'viewer', 'super_admin']) {
    assert.equal(canReadAssignedVacation({ ...auth, role }, vacation), true);
    assert.equal(canReadAssignedVacation({ ...auth, role }, { ...vacation, tenantId: 'foreign' }), false);
  }
  assert.equal(canReadAssignedVacation({ ...auth, role: 'client' }, vacation), false);
});

function fixture(file, principal, data) {
  let assignmentReads = 0;
  const query = { where() { return this; }, async get() { assignmentReads++; return { docs: ['agent-a', 'agent-b'].map(agentId => ({ id: agentId, data: () => ({ agentId }) })) }; } };
  const mocks = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/firebase/admin': { adminDb: { collection: () => query } },
    'firebase-admin/firestore': {},
    '@/app/api/_utils/withTenant': { requireTenantUser: async () => ({ ok: true, ...principal }) },
    '@/lib/auth/role': {},
    '@/lib/auth/vacation-read': { canReadAssignedVacation },
    '@/lib/activity/logger': {},
    '@/lib/planning/mission-types': {},
    '@/app/api/vacations/_shared': {
      normalizeText: value => value, loadVacationOr404: async () => ({ ok: true, data }),
      canUserAccessSite: async () => true, pickVacationApi: value => value,
    },
  };
  const exports = {};
  const source = readFileSync(new URL(`../src/app/api/vacations/${file}/route.ts`, import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, console, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return { get: () => exports.GET({}, { params: Promise.resolve({ id: 'v' }) }), reads: () => assignmentReads };
}
for (const path of ['[id]', '[id]/assignments']) {
  test(`${path}: real handler rejects colleague despite shared-site access`, async () => {
    const f = fixture(path, auth, vacation);
    assert.equal((await f.get()).status, 403);
    assert.equal(f.reads(), 0);
  });
  test(`${path}: real handler retains own and manager reads`, async () => {
    assert.equal((await fixture(path, auth, { ...vacation, assignedAgentIds: ['agent-a'] }).get()).status, 200);
    assert.equal((await fixture(path, { ...auth, role: 'manager' }, vacation).get()).status, 200);
  });
}
test('agent receives only own assignment even for a legacy multi-agent vacation', async () => {
  const body = await (await fixture('[id]/assignments', auth, { ...vacation, assignedAgentIds: ['agent-a', 'agent-b'] }).get()).json();
  assert.deepEqual(body.assignments.map(a => a.agentId), ['agent-a']);
});
test('list query and cursor bind the authenticated agent, with a deployable index', () => {
  const source = readFileSync(new URL('../src/app/api/vacations/route.ts', import.meta.url), 'utf8');
  assert.match(source, /if \(isAgentUser\) q = q.where\("assignedAgentIds", "array-contains", auth.agentId \|\| auth.uid\)/);
  assert.match(source, /agentScope: isAgentUser/);
  assert.match(source, /canReadAssignedVacation\(auth, cursorData\)/);
  const indexes = JSON.parse(readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8')).indexes;
  assert.ok(indexes.some(i => i.collectionGroup === 'vacations' && i.fields.some(f => f.fieldPath === 'assignedAgentIds' && f.arrayConfig === 'CONTAINS') && i.fields.some(f => f.fieldPath === 'siteId')));
});
