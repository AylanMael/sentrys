import test from 'node:test';
import assert from 'node:assert/strict';
import { pointageContext } from '../src/lib/activity/pointage-context.ts';
const event = { tenantId: 't', action: 'assignment.checked_in', actorUid: 'u', entityId: 'v_a', meta: { siteId: 's', vacationId: 'v' } };
function fixture(overrides = {}) {
  const rows = { 'tenantUsers/u': { tenantId: 't', agentId: 'a' }, 'assignments/v_a': { tenantId: 't', agentId: 'a', vacationId: 'v' }, 'agents/a': { tenantId: 't', firstName: 'Alice', lastName: 'Martin', privateNotes: 'SECRET' }, 'sites/s': { tenantId: 't', name: 'Site recette' }, ...overrides };
  const reads = [];
  return { reads, resolve: pointageContext('t', async (c, id) => { reads.push(c + '/' + id); return rows[c + '/' + id]; }) };
}
test('legacy pointage identifies agent and site without exposing documents', async () => {
  const value = await fixture().resolve(event);
  assert.deepEqual(value, { actorName: 'Alice Martin', agentId: 'a', siteName: 'Site recette' });
});
for (const path of ['tenantUsers/u', 'assignments/v_a', 'agents/a']) test('does not resolve foreign ' + path, async () => {
  const value = await fixture({ [path]: { tenantId: 'other', agentId: 'a', firstName: 'SECRET' } }).resolve(event);
  assert.equal(value.actorName, 'Agent non identifiable');
  assert.equal(value.agentId, null);
});
test('does not expose a foreign site', async () => {
  assert.equal((await fixture({ 'sites/s': { tenantId: 'other', name: 'SECRET' } }).resolve(event)).siteName, null);
});
test('changing both current links cannot reattribute the original assignment key', async () => {
  const f = fixture({ 'tenantUsers/u': { tenantId: 't', agentId: 'b' }, 'assignments/v_a': { tenantId: 't', vacationId: 'v', agentId: 'b' }, 'agents/b': { tenantId: 't', firstName: 'Bob' } });
  assert.equal((await f.resolve(event)).actorName, 'Agent non identifiable');
});
test('unknown legacy key is not guessed from current membership', async () => {
  const f = fixture({ 'assignments/unstructured': { tenantId: 't', agentId: 'a', vacationId: 'v' } });
  assert.equal((await f.resolve({ ...event, entityId: 'unstructured' })).agentId, null);
});
test('changed account link cannot misattribute historical pointage', async () => {
  assert.equal((await fixture({ 'tenantUsers/u': { tenantId: 't', agentId: 'b' } }).resolve(event)).agentId, null);
});
test('snapshot preserves historical names after rename or deletion', async () => {
  const f = fixture({ 'agents/a': undefined });
  const value = await f.resolve({ ...event, actorName: 'Ancien nom', meta: { agentId: 'a', siteId: 's', siteName: 'Ancien site' } });
  assert.equal(value.actorName, 'Ancien nom'); assert.equal(value.siteName, 'Ancien site'); assert.equal(value.agentId, null);
});
test('foreign and unrelated events produce no reads', async () => {
  const f = fixture();
  assert.deepEqual(await f.resolve({ ...event, tenantId: 'other' }), {});
  assert.deepEqual(await f.resolve({ ...event, action: 'site.updated' }), {});
  assert.equal(f.reads.length, 0);
});
test('page cache deduplicates related reads', async () => {
  const f = fixture(); await Promise.all([f.resolve(event), f.resolve(event)]);
  assert.equal(f.reads.length, 4);
});
test('malformed document identifiers never become paths', async () => {
  const f = fixture();
  await f.resolve({ ...event, actorUid: '../u', entityId: 'bad/x', meta: { agentId: 'bad/a', siteId: '../s' } });
  assert.equal(f.reads.length, 0);
});
