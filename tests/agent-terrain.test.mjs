import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { terrainMission } from '../src/lib/agents/terrain-mission.ts';
const stamp = n => ({ toMillis: () => n });
function input() { return { id: 'x', tenantId: 't', agentId: 'a', now: 1000,
  assignment: { tenantId: 't', agentId: 'a', siteId: 's', vacationId: 'v', status: 'assigned' },
  vacation: { tenantId: 't', siteId: 's', assignedAgentIds: ['a'], status: 'filled', startAt: stamp(500), endAt: stamp(1500) },
  site: { tenantId: 't', name: 'Site recette', privateNotes: 'PRIVATE' }, tenant: { status: 'active' } }; }
for (const [now, phase] of [[499, 'upcoming'], [500, 'ongoing'], [1499, 'ongoing'], [1500, 'ended'], [1501, 'ended']]) {
  test(`terrain boundary ${now} => ${phase}`, () => { const dto = terrainMission({ ...input(), now }); assert.equal(dto.phase, phase); assert.equal(dto.canAct, phase === 'ongoing'); assert.equal(JSON.stringify(dto).includes('PRIVATE'), false); });
}
for (const field of ['assignment', 'vacation', 'site']) test(`terrain rejects foreign ${field}`, () => { const f = input(); f[field].tenantId = 'other'; assert.equal(terrainMission(f), null); });
for (const status of ['cancelled', 'closed', 'completed', 'absence']) test(`terrain excludes vacation ${status}`, () => { const f = input(); f.vacation.status = status; assert.equal(terrainMission(f), null); });
test('terrain rejects stale assignment and corrupted date', () => { const f = input(); f.vacation.assignedAgentIds = ['other']; assert.equal(terrainMission(f), null); f.vacation.assignedAgentIds = ['a']; f.vacation.startAt = 'bad'; assert.equal(terrainMission(f), null); });
test('completed assignment cannot offer actions', () => { const f = input(); f.assignment.status = 'completed'; assert.equal(terrainMission(f).phase, 'ended'); assert.equal(terrainMission(f).canAct, false); });
test('commercial cutoff and security remain enforced', () => { const f = input(); f.tenant = { status: 'suspended', suspensionMode: 'commercial', suspendedAt: stamp(750) }; assert.equal(terrainMission(f).canAct, true); f.tenant.suspendedAt = stamp(250); assert.equal(terrainMission(f).canAct, false); f.tenant.suspensionMode = 'security'; assert.equal(terrainMission(f), null); });

function routeFixture({ member = {}, tenant = {}, assignment = {}, vacation = {}, site = {}, auth = {}, count = 1 } = {}) {
  const f = input(), reads = [];
  const rows = new Map([
    ['tenantUsers/u', { status: 'active', role: 'agent', tenantId: 't', agentId: 'a', ...member }],
    ['tenants/t', { ...f.tenant, ...tenant }], ['vacations/v', { ...f.vacation, ...vacation }], ['sites/s', { ...f.site, ...site }],
    ...Array.from({ length: count }, (_, i) => [`assignments/x${String(i).padStart(2, '0')}`, { ...f.assignment, ...assignment }]),
  ]);
  const snap = path => ({ id: path.split('/').at(-1), exists: rows.has(path), data: () => rows.get(path) });
  const query = { clauses: [], where(...args) { this.clauses.push(args); return this; }, orderBy(field, dir) { assert.deepEqual([field, dir], ['updatedAt', 'desc']); return this; }, limit(n) { assert.equal(n, 21); this.pageLimit = n; return this; }, startAfter(s) { this.cursor = s; return this; } };
  const tx = { get: async ref => { if (ref === query) {
    assert.deepEqual(JSON.parse(JSON.stringify(query.clauses.slice(0, 3))), [['tenantId', '==', 't'], ['agentId', '==', 'a'], ['status', 'in', ['assigned', 'present', 'completed']]]);
    // Stable fixture order stands in for updatedAt order, including cursor slicing.
    let docs = Array.from(rows.keys()).filter(k => k.startsWith('assignments/')).sort().map(snap);
    if (query.cursor) docs = docs.slice(docs.findIndex(d => d.id === query.cursor.id) + 1);
    docs = docs.slice(0, query.pageLimit);
    return { docs, size: docs.length };
  } reads.push(ref.path); return snap(ref.path); } };
  const db = { collection: name => ({ doc: id => ({ path: `${name}/${id}` }), where: (...args) => query.where(...args) }), runTransaction: fn => fn(tx) };
  const mocks = {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/firebase/admin': { adminDb: db },
    '@/app/api/_utils/withTenant': { requireTenantUser: async () => ({ ok: true, uid: 'u', role: 'agent', tenantId: 't', agentId: 'a', ...auth }) },
    '@/lib/auth/mission-access': { validDocumentId: value => typeof value === 'string' && !!value && !value.includes('/') },
    '@/lib/auth/tenant-suspension': { suspensionMode: data => !data || (data.status === 'suspended' && data.suspensionMode !== 'commercial') ? 'security' : data.status === 'suspended' ? 'commercial' : 'none' },
    '@/lib/agents/terrain-mission': { terrainMission },
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/api/agent-missions/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Date: { now: () => 1000 }, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return { reads, get: cursor => exports.GET({ nextUrl: new URL(`http://localhost/api/agent-missions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`) }) };
}
test('real endpoint returns minimal authorized site projection with no-store', async () => { const f = routeFixture(); const r = await f.get(); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store'); const body = await r.json(); assert.equal(body.missions[0].siteName, 'Site recette'); assert.equal(JSON.stringify(body).includes('PRIVATE'), false); });
for (const options of [{ member: { status: 'disabled' } }, { member: { agentId: 'other' } }, { tenant: { status: 'suspended', suspensionMode: 'security' } }, { auth: { role: 'owner' } }]) test(`endpoint refuses changed access ${JSON.stringify(options)}`, async () => { const f = routeFixture(options); assert.equal((await f.get()).status, 403); assert.equal(f.reads.includes('sites/s'), false); });
test('endpoint does not read site of another agent vacation', async () => { const f = routeFixture({ vacation: { assignedAgentIds: ['other'] } }); assert.equal((await (await f.get()).json()).missions.length, 0); assert.equal(f.reads.includes('sites/s'), false); });
test('endpoint filters cross-tenant site projection', async () => { const f = routeFixture({ site: { tenantId: 'other' } }); assert.equal((await (await f.get()).json()).missions.length, 0); });
test('endpoint pagination is bounded and advertises next page', async () => { const body = await (await routeFixture({ count: 21 }).get()).json(); assert.equal(body.missions.length, 20); assert.equal(body.nextCursor, 'x19'); });
test('endpoint rejects invalid or foreign cursor', async () => { assert.equal((await routeFixture().get('../private')).status, 400); assert.equal((await routeFixture({ assignment: { agentId: 'other' } }).get('x00')).status, 403); });
test('endpoint advances to second page without repeating the cursor', async () => { const body = await (await routeFixture({ count: 25 }).get('x19')).json(); assert.equal(body.missions.length, 5); assert.equal(body.missions[0].id, 'x20'); assert.equal(body.nextCursor, null); });
test('filtered full page still provides a cursor to continue', async () => { const body = await (await routeFixture({ count: 25, vacation: { assignedAgentIds: ['other'] } }).get()).json(); assert.equal(body.missions.length, 0); assert.equal(body.nextCursor, 'x19'); });
