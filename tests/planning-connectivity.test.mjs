import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observePlanningConnectivity, tenantSnapshotItems } from '../src/lib/planning/connectivity.ts';

test('tenant snapshots reject absent or different tenant without throwing', () => {
  const snapshot = { tenantId: 'a', items: ['mission'] };
  assert.deepEqual(tenantSnapshotItems(null, undefined), []);
  assert.deepEqual(tenantSnapshotItems(null, 'a'), []);
  assert.deepEqual(tenantSnapshotItems(snapshot, null), []);
  assert.deepEqual(tenantSnapshotItems(snapshot, 'b'), []);
  assert.equal(tenantSnapshotItems(snapshot, 'a'), snapshot.items);
});

test('connectivity reports initial state, loss, recovery and cleans listeners', () => {
  const target = new EventTarget();
  target.navigator = { onLine: true };
  const values = [];
  const stop = observePlanningConnectivity(target, value => values.push(value));
  target.navigator.onLine = false;
  target.dispatchEvent(new Event('offline'));
  target.dispatchEvent(new Event('online'));
  target.navigator.onLine = true;
  target.dispatchEvent(new Event('online'));
  assert.deepEqual(values, [true, false, false, true]);
  stop();
  target.dispatchEvent(new Event('offline'));
  assert.equal(values.length, 4);
});

test('initial offline state does not imply a confirmed connection', () => {
  const target = new EventTarget();
  target.navigator = { onLine: false };
  const values = [];
  observePlanningConnectivity(target, value => values.push(value))();
  assert.deepEqual(values, [false]);
});

test('provider reconnects its subscription and still requires a server snapshot', () => {
  const source = readFileSync(new URL('../src/components/dashboard/planning/PlanningContext.tsx', import.meta.url), 'utf8');
  assert.match(source, /serverConfirmed: networkOnline && !!tenantId && confirmedTenant === tenantId/);
  assert.match(source, /\[tenantId, toast, networkOnline\]/);
  assert.match(source, /if \(!online\) setConfirmedTenant\(null\)/);
  assert.match(source, /!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites/);
  assert.match(source, /tenantSnapshotItems\(vacationSnapshot, tenantId\)/);
  assert.match(source, /setVacationSnapshot\(\{ tenantId, items \}\)/);
  assert.match(source, /active = false; unsubscribe\(\)/);
});
