import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canReadBackoffice } from '../src/lib/auth/role.ts';

function fixture({ role = 'owner', foreignCursor = false } = {}) {
  const rows = Array.from({ length: 21 }, (_, i) => ({
    id: 'event' + String(i).padStart(2, '0'),
    data: () => ({ tenantId: foreignCursor && i === 19 ? 'other' : 't', action: i < 20 ? 'assignment.checked_in' : 'site.updated', createdAt: { toDate: () => new Date(0) } }),
  }));
  let cursor = null, limit = 0;
  const q = {
    where(key, op, value) { if (key === 'tenantId') assert.equal(value, 't'); return this; },
    orderBy() { return this; }, startAfter(_time, id) { cursor = id; return this; },
    limit(n) { limit = n; assert.ok(n <= 100); return this; },
    async get() { return { docs: rows.slice(cursor ? rows.findIndex(r => r.id === cursor) + 1 : 0).slice(0, limit) }; },
    doc(id) { return { get: async () => { const r = rows.find(r => r.id === id); return { exists: !!r, ...r }; } }; },
  };
  const mocks = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/firebase/admin': { adminDb: { collection: () => q } },
    '@/app/api/_utils/withTenant': { requireTenantUser: async () => ({ ok: true, role, tenantId: 't' }) },
    '@/lib/auth/role': { canReadBackoffice },
    '@/lib/activity/pointage-context': { pointageContext: () => async () => ({}) },
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('../src/app/api/activity/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, URL, console, require: name => { assert.ok(name in mocks, name); return mocks[name]; },
  });
  return suffix => exports.GET({ url: 'http://localhost/api/activity?limit=20' + suffix });
}
test('fully hidden pointage page preserves scanned cursor', async () => {
  const r = await fixture()('&excludePointages=true');
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  const body = await r.json(); assert.equal(body.items.length, 0); assert.equal(body.nextCursor, 'event19');
});
test('following a hidden page reaches the next ordinary log', async () => {
  const body = await (await fixture()('&excludePointages=true&cursor=event19')).json();
  assert.equal(body.items.length, 1); assert.equal(body.items[0].action, 'site.updated'); assert.equal(body.nextCursor, null);
});
test('full audit keeps original pointage events available', async () => {
  const body = await (await fixture()('')).json();
  assert.equal(body.items.length, 20); assert.equal(body.items[0].action, 'assignment.checked_in');
});
for (const role of ['agent', 'client']) test('audit rejects ' + role, async () => assert.equal((await fixture({ role })('')).status, 403));
test('audit refuses foreign tenant cursor', async () => assert.equal((await fixture({ foreignCursor: true })('&cursor=event19')).status, 403));
