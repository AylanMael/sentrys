import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';

const projectId = 'demo-sentrys-file-rules';
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
const match = /^(127\.0\.0\.1|localhost):([0-9]{1,5})$/.exec(endpoint ?? '');
assert.ok(match, 'Explicit loopback FIRESTORE_EMULATOR_HOST required');
const port = Number(match[2]);
assert.ok(port > 0 && port <= 65535);
for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
  assert.ok(!process.env[name] || process.env[name] === projectId);
}
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_EMULATOR_HUB;
const { initializeTestEnvironment, assertSucceeds } = await import('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteField, writeBatch, setLogLevel } = await import('firebase/firestore');
setLogLevel('silent');
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: {
    host: match[1], port, rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
});
after(async () => { await env?.cleanup(); });

async function denied(operation) {
  await assert.rejects(operation, error => {
    assert.equal(error.code, 'permission-denied');
    return true;
  });
}
async function fixture(t, role = 'manager', { legacy = false, suspended = false, nullProfile = false } = {}) {
  const id = `qa-file-rules-${randomUUID()}`;
  const tenantId = `${id}-tenant`, uid = `${id}-user`;
  const profile = { documents: [{ id: 'current', path: `tenants/${tenantId}/agents/${id}/documents/current.pdf` }], photoUrl: null, photoPath: `tenants/${tenantId}/agents/${id}/photo/current.png`, notes: 'Before' };
  const agent = { tenantId, firstName: 'Test', lastName: 'Agent', status: 'active', ...(legacy ? profile : { profile: nullProfile ? null : profile }) };
  const created = new Set([`tenants/${tenantId}`, `tenantUsers/${uid}`, `agents/${id}`]);
  t.after(async () => {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore(), batch = writeBatch(db);
      for (const path of created) batch.delete(doc(db, path));
      await batch.commit();
    });
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const path of created) assert.equal((await getDoc(doc(db, path))).exists(), false);
    await setDoc(doc(db, `tenants/${tenantId}`), { status: suspended ? 'suspended' : 'active' });
    await setDoc(doc(db, `tenantUsers/${uid}`), { tenantId, role, status: 'active', agentId: id });
    await setDoc(doc(db, `agents/${id}`), agent);
  });
  const db = env.authenticatedContext(uid).firestore();
  return { db, id, tenantId, agent, ref: doc(db, `agents/${id}`), newRef: () => {
    const path = `agents/${id}-${randomUUID()}`; created.add(path); return doc(db, path);
  } };
}

for (const role of ['manager', 'admin', 'owner', 'super_admin']) {
  test(`${role}: file references cannot be created or changed through client SDK`, async t => {
    const f = await fixture(t, role);
    for (const field of ['documents', 'photoUrl', 'photoPath']) {
      const value = field === 'documents' ? [] : 'old-reference';
      await denied(updateDoc(f.ref, { [`profile.${field}`]: value }));
      await denied(updateDoc(f.ref, { [`profile.${field}`]: deleteField() }));
      await denied(updateDoc(f.ref, { [field]: value }));
      const base = { tenantId: f.tenantId, firstName: 'New', lastName: 'Agent', status: 'active' };
      await denied(setDoc(f.newRef(), { ...base, [field]: value }));
      await denied(setDoc(f.newRef(), { ...base, profile: { [field]: value } }));
    }
    for (const profile of [{}, null, [], deleteField()]) {
      await denied(updateDoc(f.ref, { profile }));
    }
    await denied(setDoc(f.ref, { tenantId: f.tenantId, firstName: 'Replacement', lastName: 'Agent', status: 'active' }));
    await assertSucceeds(updateDoc(f.ref, { 'profile.notes': 'After' }));
    const stored = (await getDoc(f.ref)).data();
    assert.deepEqual(stored.profile.documents, f.agent.profile.documents);
    assert.equal(stored.profile.photoPath, f.agent.profile.photoPath);
    await assertSucceeds(setDoc(f.newRef(), { tenantId: f.tenantId, firstName: 'New', lastName: 'Agent', status: 'active', profile: { notes: 'Allowed' } }));
  });
}
test('legacy root references cannot be removed or replaced; unrelated fields remain editable', async t => {
  const f = await fixture(t, 'manager', { legacy: true });
  for (const field of ['documents', 'photoUrl', 'photoPath']) {
    await denied(updateDoc(f.ref, { [field]: deleteField() }));
    await denied(updateDoc(f.ref, { [field]: field === 'documents' ? [] : 'old' }));
  }
  await assertSucceeds(updateDoc(f.ref, { notes: 'After' }));
  await denied(updateDoc(f.ref, { profile: { notes: 'Would hide legacy references' } }));
  assert.deepEqual((await getDoc(f.ref)).data().documents, f.agent.documents);
});
for (const role of ['agent', 'viewer', 'client']) {
  test(`${role}: ordinary agent updates remain forbidden`, async t => {
    const f = await fixture(t, role);
    await denied(updateDoc(f.ref, { 'profile.notes': 'Forbidden' }));
  });
}
test('legacy null profile allows unrelated updates but not new file references', async t => {
  const f = await fixture(t, 'manager', { nullProfile: true });
  await assertSucceeds(updateDoc(f.ref, { firstName: 'Corrected' }));
  assert.equal((await getDoc(f.ref)).data().profile, null);
  await denied(updateDoc(f.ref, { profile: { documents: [] } }));
  await denied(updateDoc(f.ref, { photoPath: 'old' }));
});
test('suspended tenant and foreign tenant guards remain effective', async t => {
  const f = await fixture(t, 'manager', { suspended: true });
  await denied(updateDoc(f.ref, { 'profile.notes': 'Forbidden' }));
  const other = await fixture(t);
  await denied(updateDoc(doc(other.db, `agents/${f.id}`), { 'profile.notes': 'Foreign' }));
});
