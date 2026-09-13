import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { registerHooks } from 'node:module';
import test from 'node:test';

// Fail closed before importing Firebase or application modules. No dotenv/ADC.
const projectId = 'demo-sentrys-documents-http';
for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
  const match = /^127\.0\.0\.1:([0-9]{1,5})$/.exec(process.env[key] ?? '');
  assert.ok(match && Number(match[1]) > 0 && Number(match[1]) <= 65535, `${key}: explicit loopback required`);
}
for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID']) {
  assert.ok(!process.env[key] || process.env[key] === projectId, `${key}: demo project only`);
}
for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_ADMIN_CREDENTIALS_PATH', 'FIREBASE_WEBAPP_CONFIG']) {
  assert.ok(!process.env[key], `${key} must be unset`);
}
if (process.env.STORAGE_EMULATOR_HOST) {
  assert.equal(process.env.STORAGE_EMULATOR_HOST, `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`);
}
// emulators:exec injects its demo config. Validate it, then use explicit options only.
if (process.env.FIREBASE_CONFIG) {
  const config = JSON.parse(process.env.FIREBASE_CONFIG);
  assert.equal(config.projectId, projectId);
  assert.ok(!config.storageBucket || [`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`].includes(config.storageBucket));
  delete process.env.FIREBASE_CONFIG;
}
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.FIREBASE_STORAGE_BUCKET = `${projectId}.firebasestorage.app`;
// Exercise Storage, never the development .private-uploads fallback.
process.env.NODE_ENV = 'production';

// Next normally resolves this build-time marker. No application module is mocked.
const markerHook = registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'server-only' ? 'next/dist/compiled/server-only/empty.js' : specifier, context);
} });
const { adminApp, adminAuth, adminDb, adminStorage, adminBucket } = await import('../../src/lib/firebase/admin.ts');
const documents = await import('../../src/app/api/agents/[id]/documents/route.ts');
const files = await import('../../src/app/api/agents/[id]/files/[fileId]/route.ts');

test('HTTP document lifecycle with real handlers and Firebase emulators', { timeout: 90000 }, async t => {
  const prefix = `qa-http-${randomUUID()}`;
  const tenantId = `${prefix}-agency`, foreignTenant = `${prefix}-foreign`, agentId = `${prefix}-agent`;
  const ownedRefs = [], ownedUsers = [];
  const storagePrefix = `tenants/${tenantId}/agents/${agentId}/documents/`;
  let server;
  t.after(async () => {
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
      // Only UUID-scoped fixtures from this run; never clear an emulator globally.
      const traces = await adminDb.doc(`agents/${agentId}`).collection('documentReplacementTraces').get();
      for (const trace of traces.docs) await trace.ref.delete();
      for (const ref of ownedRefs) await ref.delete();
      for (const uid of ownedUsers) await adminAuth.deleteUser(uid);
      for (const bucketName of [`${projectId}.firebasestorage.app`, `${projectId}.appspot.com`]) {
        const [objects] = await adminStorage.bucket(bucketName).getFiles({ prefix: storagePrefix });
        for (const object of objects) {
          assert.ok(object.name.startsWith(storagePrefix));
          await object.delete();
        }
      }
    } finally {
      await adminApp.delete();
      markerHook.deregister();
    }
  });
  async function seed(path, data) {
    const ref = adminDb.doc(path);
    await ref.create(data);
    ownedRefs.push(ref);
  }
  await seed(`tenants/${tenantId}`, { status: 'active' });
  await seed(`tenants/${foreignTenant}`, { status: 'active' });
  await seed(`agents/${agentId}`, { tenantId, firstName: 'TEST', lastName: 'HTTP', profile: { documents: [] } });
  const tokens = {};
  for (const [actor, role, agency] of [['manager', 'manager', tenantId], ['agent', 'agent', tenantId], ['foreign', 'manager', foreignTenant]]) {
    const uid = `${prefix}-${actor}`, email = `${uid}@example.invalid`, password = randomUUID();
    await adminAuth.createUser({ uid, email, password });
    ownedUsers.push(uid);
    await seed(`tenantUsers/${uid}`, { tenantId: agency, role, status: 'active', agentId: actor === 'agent' ? agentId : null });
    const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    tokens[actor] = (await response.json()).idToken;
    assert.equal(typeof tokens[actor], 'string');
  }

  // Minimal HTTP adapter: actual Request/Response, auth guard, transactions and Storage.
  // This is not a Next routing/middleware or browser test.
  server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, 'http://127.0.0.1');
      const match = /^\/api\/agents\/([^/]+)\/(documents|files\/([^/]+))$/.exec(url.pathname);
      if (!match || match[1] !== agentId) { outgoing.writeHead(404).end(); return; }
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const req = new Request(url, { method: incoming.method, headers: incoming.headers,
        ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) }) });
      const handler = match[3] ? files.GET : documents[incoming.method];
      if (!handler || (match[3] && incoming.method !== 'GET')) { outgoing.writeHead(405).end(); return; }
      const result = await handler(req, { params: Promise.resolve({ id: agentId, fileId: match[3] }) });
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      outgoing.writeHead(500).end('Recipe adapter failed');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}/api/agents/${agentId}`;
  const request = (suffix, actor, options = {}) => fetch(base + suffix, { ...options,
    headers: actor ? { Authorization: `Bearer ${tokens[actor]}` } : {}, signal: AbortSignal.timeout(15000), redirect: 'error' });
  function form(version, replaceId) {
    const data = new FormData();
    data.set('file', new File([`%PDF-1.7\nTEST ONLY VERSION ${version}\n%%EOF`], `qa-v${version}.pdf`, { type: 'application/pdf' }));
    data.set('kind', 'other'); data.set('label', `Fictitious V${version}`);
    if (replaceId) { data.set('replaceId', replaceId); data.set('reason', 'Automated fictitious document replacement'); }
    return data;
  }
  async function upload(version, replaceId) {
    const response = await request('/documents', 'manager', { method: 'POST', body: form(version, replaceId) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.storageMode, 'firebase');
    assert.ok(result.path.startsWith(storagePrefix));
    return result;
  }
  const v1 = await upload(1);
  await t.test('responsible downloads V1 with private no-store headers', async () => {
    const response = await request(`/files/${v1.document.id}`, 'manager');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.match(await response.text(), /VERSION 1/);
  });
  for (const [actor, status] of [['agent', 403], ['foreign', 404], [null, 401]]) {
    await t.test(`${actor ?? 'anonymous'} cannot download or replace the document`, async () => {
      for (const response of [await request(`/files/${v1.document.id}`, actor),
        await request('/documents', actor, { method: 'POST', body: form(2, v1.document.id) })]) {
        assert.equal(response.status, status);
        assert.match(response.headers.get('cache-control'), /no-store/);
        assert.doesNotMatch(await response.text(), /%PDF|VERSION 1|tenants\//);
      }
      const current = (await adminDb.doc(`agents/${agentId}`).get()).data().profile.documents;
      assert.equal(current.length, 1); assert.equal(current[0].id, v1.document.id);
    });
  }
  const v2 = await upload(2, v1.document.id);
  await t.test('replacement removes V1, retains V2 and records sanitized history', async () => {
    assert.equal(v2.storageCleanup, 'deleted');
    assert.equal((await request(`/files/${v1.document.id}`, 'manager')).status, 404);
    await assert.rejects(adminBucket.file(v1.path).getMetadata(), error => Number(error.code) === 404);
    const response = await request(`/files/${v2.document.id}`, 'manager');
    assert.equal(response.status, 200); assert.match(await response.text(), /VERSION 2/);
    const historyResponse = await request('/documents', 'manager');
    assert.equal(historyResponse.status, 200);
    const history = await historyResponse.json();
    assert.equal(history.traces.length, 1);
    assert.equal(history.traces[0].cleanupStatus, 'deleted');
    assert.equal(history.traces[0].previousFileName, 'qa-v1.pdf');
    assert.equal(history.traces[0].newFileName, 'qa-v2.pdf');
    assert.equal('cleanupPath' in history.traces[0], false);
    for (const [actor, status] of [['agent', 403], ['foreign', 404]]) {
      assert.equal((await request(`/files/${v2.document.id}`, actor)).status, status);
      assert.equal((await request('/documents', actor)).status, status);
    }
  });
});
