// Audit only, hardwired loopback emulators; unique records in the emulator's demo project.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const prefix = `qa-storage-${randomUUID()}`;
const tenant = `${prefix}-tenant`, uid = `${prefix}-uid`, linked = `${prefix}-linked`;
const results = [];
const isolated = process.argv.includes('--isolated');
let env;
async function probe(label, operation, expectedAllowed) {
  try {
    await operation();
    results.push({ label, allowed: true, expectedAllowed, passed: expectedAllowed });
  } catch (error) {
    if (error.code !== 'storage/unauthorized') throw error;
    results.push({ label, allowed: false, expectedAllowed, passed: !expectedAllowed });
  }
}
try {
  env = await initializeTestEnvironment({
    projectId: 'demo-sentrys-accounts',
    firestore: { host: '127.0.0.1', port: isolated ? 8191 : 8091, rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
    storage: { host: '127.0.0.1', port: isolated ? 9299 : 9199, rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
  const file = (agent, kind, name = 'fixture') => `tenants/${tenant}/agents/${agent}/${kind}/${prefix}-${name}.png`;
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const metadata = { contentType: 'image/png' };
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'tenants', tenant), { status: 'active' });
    await setDoc(doc(db, 'tenantUsers', uid), { tenantId: tenant, role: 'agent', status: 'active', agentId: linked });
    await setDoc(doc(db, 'tenantUsers', `${prefix}-manager`), { tenantId: tenant, role: 'manager', status: 'active' });
    await setDoc(doc(db, 'tenants', `${prefix}-foreign`), { status: 'active' });
    await setDoc(doc(db, 'tenantUsers', `${prefix}-foreign`), { tenantId: `${prefix}-foreign`, role: 'manager', status: 'active' });
    // UID and linked record are deliberately different valid fictitious records.
    for (const agent of [linked, uid, `${prefix}-colleague`]) {
      await setDoc(doc(db, 'agents', agent), { tenantId: tenant, firstName: 'FICTIF', lastName: agent });
      for (const kind of ['photo', 'documents']) await context.storage().ref(file(agent, kind)).put(bytes, metadata);
    }
  });
  const bucket = env.authenticatedContext(uid).storage();
  for (const kind of ['photo', 'documents']) {
    await probe(`${kind}: own linked record read`, () => bucket.ref(file(linked, kind)).getMetadata(), kind === 'photo');
    await probe(`${kind}: colleague read refused`, () => bucket.ref(file(`${prefix}-colleague`, kind)).getMetadata(), false);
    await probe(`${kind}: UID record distinct from agentId refused`, () => bucket.ref(file(uid, kind)).getMetadata(), false);
    await probe(`${kind}: agent create refused like API`, () => bucket.ref(file(linked, kind, 'new')).put(bytes, metadata), false);
    await probe(`${kind}: agent replacement refused like API`, () => bucket.ref(file(linked, kind)).put(bytes, metadata), false);
    await probe(`${kind}: agent deletion refused like API`, () => bucket.ref(file(linked, kind)).delete(), false);
    await probe(`${kind}: foreign manager refused`, () => env.authenticatedContext(`${prefix}-foreign`).storage().ref(file(uid, kind)).getMetadata(), false);
    await probe(`${kind}: same-tenant manager read allowed`, () => env.authenticatedContext(`${prefix}-manager`).storage().ref(file(uid, kind)).getMetadata(), true);
    for (const [label, operation] of [
      ['create', ref => ref.put(bytes, metadata)],
      ['replace', ref => ref.put(bytes, metadata)],
      ['delete', ref => ref.delete()],
    ]) {
      await probe(`${kind}: manager direct ${label} refused`, () => operation(env.authenticatedContext(`${prefix}-manager`).storage().ref(file(uid, kind, label === 'create' ? 'manager-new' : 'fixture'))), false);
    }
  }
  for (const agentId of [null, '', 42]) {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'tenantUsers', uid), { tenantId: tenant, role: 'agent', status: 'active', agentId });
    });
    await probe(`legacy photo UID fallback ${JSON.stringify(agentId)}`, () => bucket.ref(file(uid, 'photo')).getMetadata(), agentId !== 42);
    await probe(`legacy documents denied ${JSON.stringify(agentId)}`, () => bucket.ref(file(uid, 'documents')).getMetadata(), false);
  }
  console.log(JSON.stringify({ prefix, project: 'demo-sentrys-accounts', productionTouched: false, results }, null, 2));
  if (results.some(r => !r.passed)) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await env?.cleanup(); }
