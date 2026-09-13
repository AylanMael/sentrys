import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readAccessResponse, withAccessDeadline } from '../src/lib/auth/access-verification.ts';

test('explicit 401 and 403 refusals remain denied even with unreadable bodies', async () => {
  for (const status of [401, 403]) {
    assert.deepEqual(await readAccessResponse(new Response('Not JSON', { status })), { ok: false });
  }
});
test('service errors cannot be interpreted as an agency suspension', async () => {
  for (const status of [408, 429, 500, 502, 503]) {
    await assert.rejects(readAccessResponse(new Response('{"ok":false}', { status })));
  }
});
test('unreadable and malformed successful responses require a new verification', async () => {
  for (const body of ['Not JSON', 'null', '{}', '{"ok":"true"}', '{"ok":true}', '{"ok":true,"uid":"u","hasTenant":true}']) {
    await assert.rejects(readAccessResponse(new Response(body)));
  }
});
test('confirmed responses preserve server rights and security suspension', async () => {
  const provisioned = { ok: true, uid: 'u', hasTenant: true, role: 'agent', status: 'active', tenantId: 'recette' };
  for (const data of [{ ...provisioned, tenant: { suspensionMode: 'security' } }, { ok: false }, provisioned, { ok: true, uid: 'u', hasTenant: false }]) {
    assert.deepEqual(await readAccessResponse(Response.json(data)), data);
  }
});
test('verification deadline aborts a stalled operation and permits the next attempt', async () => {
  let signal;
  await assert.rejects(withAccessDeadline(s => { signal = s; return new Promise(() => {}); }, 5), /timeout/);
  assert.equal(signal.aborted, true);
  assert.equal(await withAccessDeadline(async () => 'confirmed'), 'confirmed');
});
test('provider fails closed on verification failure and rechecks after online event', () => {
  const source = readFileSync(new URL('../src/lib/auth-provider.tsx', import.meta.url), 'utf8');
  assert.match(source, /verificationUnavailable \|\| user\?\.status !== "active"/);
  assert.match(source, /setVerificationUnavailable\(true\)/);
  assert.match(source, /window\.addEventListener\("online", onFocus\)/);
  assert.match(source, /window\.removeEventListener\("online", onFocus\)/);
  assert.match(source, /requestId !== requestIdRef.current \|\| auth.currentUser\?\.uid !== current.uid/);
  assert.match(source, /reason=\{verificationUnavailable \? "verification-unavailable" : "denied"\}/);
  assert.match(source, /refreshInFlight.current\?\.uid === uid\) return refreshInFlight.current.promise/);
});
