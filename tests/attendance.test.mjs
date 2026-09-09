import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { attendanceRow, parisDayRange } from '../src/lib/agents/attendance.ts';
import { canReadBackoffice } from '../src/lib/auth/role.ts';
import { suspensionMode } from '../src/lib/auth/tenant-suspension.ts';
const stamp = ms => ({ toMillis: () => ms });
function data() {
  return { tenantId: 't', vacationId: 'v', agentId: 'a', now: 1000,
    vacation: { tenantId: 't', siteId: 's', assignedAgentIds: ['a'], status: 'filled', startAt: stamp(500), endAt: stamp(1500) },
    assignment: { tenantId: 't', vacationId: 'v', siteId: 's', agentId: 'a', status: 'assigned' },
    agent: { tenantId: 't', firstName: 'Alice', lastName: 'Martin', salary: 'PRIVATE' },
    site: { tenantId: 't', name: 'Site test', latitude: 48, privateNotes: 'PRIVATE' } };
}
test('attendance reports planned, not checked in, on duty and missing exit at boundaries', () => {
  const d = data();
  assert.equal(attendanceRow({ ...d, now: 499 }).status, 'upcoming');
  assert.equal(attendanceRow({ ...d, now: 500 }).status, 'not_checked_in');
  d.assignment.status = 'present'; d.assignment.checkedInAt = stamp(600);
  assert.equal(attendanceRow(d).status, 'on_duty');
  assert.equal(attendanceRow({ ...d, now: 1500 }).status, 'missing_out');
  d.assignment.status = 'completed'; d.assignment.checkedOutAt = stamp(1200);
  assert.equal(attendanceRow(d).status, 'completed');
});
test('no fabricated actual times and no confidential fields', () => {
  const dto = attendanceRow(data());
  assert.equal(dto.checkedInAt, null); assert.equal(dto.checkedOutAt, null);
  assert.equal(JSON.stringify(dto).includes('PRIVATE'), false);
  assert.equal('latitude' in dto, false);
});
test('exit with present status remains an explicit inconsistency', () => {
  const d = data();
  d.assignment = { ...d.assignment, status: 'present', checkedInAt: stamp(600), checkedOutAt: stamp(900) };
  assert.equal(attendanceRow(d).status, 'inconsistent');
});
for (const field of ['vacation', 'assignment', 'agent', 'site']) test('attendance rejects foreign ' + field, () => {
  const d = data(); d[field].tenantId = 'other'; assert.equal(attendanceRow(d), null);
});
for (const modification of [{ status: 'completed' }, { status: 'present' }, { checkedOutAt: stamp(700) }, { checkedInAt: 'bad' }]) test('inconsistent clocking never implies success ' + JSON.stringify(modification), () => {
  const d = data(); Object.assign(d.assignment, modification); assert.equal(attendanceRow(d).status, 'inconsistent');
});
test('missing assignment, reversed clocks, unavailable names and mismatched joins', () => {
  const d = data(); assert.equal(attendanceRow({ ...d, assignment: undefined }).status, 'inconsistent');
  assert.equal(attendanceRow({ ...d, agent: undefined }).agentName, 'Agent indisponible');
  assert.equal(attendanceRow({ ...d, assignment: { ...d.assignment, agentId: 'b' } }), null);
  assert.equal(attendanceRow({ ...d, vacation: { ...d.vacation, endAt: stamp(100) } }), null);
  assert.equal(attendanceRow({ ...d, assignment: { ...d.assignment, status: 'completed', checkedInAt: stamp(900), checkedOutAt: stamp(800) } }).status, 'inconsistent');
});
for (const [date, start, hours] of [
  ['2026-09-09', '2026-09-08T22:00:00.000Z', 24],
  ['2026-01-09', '2026-01-08T23:00:00.000Z', 24],
  ['2026-03-29', '2026-03-28T23:00:00.000Z', 23],
  ['2026-10-25', '2026-10-24T22:00:00.000Z', 25],
]) test('Paris day range ' + date, () => {
  const r = parisDayRange(date); assert.equal(r.start.toISOString(), start); assert.equal(+r.end - +r.start, hours * 3600000);
});
for (const invalid of ['', 'bad', '2026-02-30', '2026-13-01', '2026-9-1']) test('invalid Paris date ' + invalid, () => assert.equal(parisDayRange(invalid), null));

function routeFixture({ count = 1, role = 'owner', member = {}, tenant = {}, vacation = {}, site = {}, assignment = {} } = {}) {
  const day = parisDayRange('2026-09-09');
  const d = data();
  const rows = new Map([
    ['tenantUsers/u', { tenantId: 't', status: 'active', role, ...member }],
    ['tenants/t', { status: 'active', ...tenant }], ['sites/s', { ...d.site, ...site }], ['agents/a', d.agent],
  ]);
  for (let i = 0; i < count; i++) {
    const id = 'v' + String(i).padStart(2, '0');
    rows.set('vacations/' + id, { ...d.vacation, startAt: stamp(+day.start + 3600000), endAt: stamp(+day.start + 7200000), ...vacation });
    rows.set('assignments/' + id + '_a', { ...d.assignment, vacationId: id, ...assignment });
  }
  const reads = [], clauses = [], orders = [];
  const snap = path => ({ id: path.split('/').at(-1), exists: rows.has(path), data: () => rows.get(path) });
  const query = { where(...args) { clauses.push(args); return this; }, orderBy(...args) { orders.push(args); return this; }, limit(n) { assert.equal(n, 21); return this; }, startAfter(s) { this.cursor = s.id; return this; } };
  const tx = { get: async ref => {
    if (ref === query) {
      assert.equal(clauses[0][0], 'tenantId'); assert.equal(clauses[0][2], 't');
      assert.equal(+clauses[1][2], +day.start); assert.equal(+clauses[2][2], +day.end);
      assert.deepEqual(JSON.parse(JSON.stringify(orders)), [['startAt', 'desc'], ['__name__', 'desc']]);
      let docs = [...rows.keys()].filter(k => k.startsWith('vacations/')).sort().reverse().map(snap);
      if (query.cursor) docs = docs.slice(docs.findIndex(s => s.id === query.cursor) + 1);
      docs = docs.slice(0, 21); return { docs, size: docs.length };
    }
    reads.push(ref.path); return snap(ref.path);
  } };
  const db = { collection: name => ({ doc: id => ({ path: name + '/' + id }), where: (...args) => query.where(...args) }), runTransaction: fn => fn(tx) };
  const mocks = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/firebase/admin': { adminDb: db },
    '@/app/api/_utils/withTenant': { requireTenantUser: async () => ({ ok: true, uid: 'u', role, tenantId: 't' }) },
    '@/lib/auth/role': { canReadBackoffice }, '@/lib/auth/tenant-suspension': { suspensionMode },
    '@/lib/auth/mission-access': { validDocumentId: v => typeof v === 'string' && !!v && !v.includes('/') },
    '@/lib/agents/attendance': { attendanceRow, parisDayRange },
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/api/attendance/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Date, require: name => { assert.ok(name in mocks, name); return mocks[name]; },
  });
  return { rows, reads, get: (suffix = '') => exports.GET({ nextUrl: new URL('http://localhost/api/attendance?date=2026-09-09' + suffix) }) };
}
test('attendance API returns minimal one-row projection, no-store, commercial read allowed', async () => {
  const f = routeFixture({ tenant: { status: 'suspended', suspensionMode: 'commercial' } });
  const r = await f.get(); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  const body = await r.json(); assert.equal(body.rows.length, 1); assert.equal(body.rows[0].agentName, 'Alice Martin');
  assert.equal(JSON.stringify(body).includes('PRIVATE'), false);
});
for (const args of [{ role: 'agent' }, { role: 'client' }, { member: { role: 'agent' } }, { member: { tenantId: 'other' } }, { member: { status: 'disabled' } }, { tenant: { status: 'suspended', suspensionMode: 'security' } }]) test('attendance API rejects unauthorized access ' + JSON.stringify(args), async () => {
  const f = routeFixture(args); assert.equal((await f.get()).status, 403); assert.equal(f.reads.includes('sites/s'), false);
});
test('attendance API rejects missing tenant and foreign/out-of-window cursor', async () => {
  const missing = routeFixture(); missing.rows.delete('tenants/t'); assert.equal((await missing.get()).status, 403);
  const foreign = routeFixture(); foreign.rows.set('vacations/foreign', { tenantId: 'other', startAt: stamp(0) }); assert.equal((await foreign.get('&cursor=foreign')).status, 403);
  const old = routeFixture(); old.rows.set('vacations/old', { tenantId: 't', startAt: stamp(0) }); assert.equal((await old.get('&cursor=old')).status, 403);
  assert.equal((await routeFixture().get('&cursor=bad/path')).status, 400);
});
test('attendance pages continue without duplicating a vacation', async () => {
  const first = await (await routeFixture({ count: 25 }).get()).json();
  assert.equal(first.rows.length, 20); assert.equal(first.nextCursor, 'v05');
  const second = await (await routeFixture({ count: 25 }).get('&cursor=v05')).json();
  assert.equal(second.rows.length, 5); assert.equal(second.nextCursor, null);
  assert.equal(first.rows.some(a => second.rows.some(b => b.id === a.id)), false);
});
test('filtered page keeps cursor and oversized agent lists are explicit, bounded anomalies', async () => {
  const skipped = await (await routeFixture({ count: 25, vacation: { status: 'cancelled' } }).get()).json();
  assert.equal(skipped.rows.length, 0); assert.equal(skipped.nextCursor, 'v05');
  const f = routeFixture({ vacation: { assignedAgentIds: Array.from({ length: 51 }, (_, i) => 'a' + i) } });
  const body = await (await f.get()).json(); assert.equal(body.unavailable, 1); assert.equal(body.rows.length, 0);
  assert.equal(f.reads.some(p => p.startsWith('agents/')), false);
});
test('foreign join is hidden and missing assignment is surfaced, never treated as present', async () => {
  const foreign = await (await routeFixture({ site: { tenantId: 'other', name: 'SECRET' } }).get()).json();
  assert.equal(foreign.rows.length, 0); assert.equal(foreign.unavailable, 1);
  const f = routeFixture(); f.rows.delete('assignments/v00_a');
  const missing = await (await f.get()).json(); assert.equal(missing.rows[0].status, 'inconsistent');
});
