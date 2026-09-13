// Fixed demo/loopback only. Creates isolated fictitious records; never production.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8091';
const admin = require('firebase-admin');
const assert = require('node:assert/strict');
const app = admin.initializeApp({ projectId: 'demo-sentrys-accounts' }, 'incident-access-local');
const prefix = `qa-incident-${Date.now()}`;
async function main() {
  const db = app.firestore(), tenantId = `${prefix}-tenant`, uid = `${prefix}-agent`;
  const agentId = `${prefix}-record`, ownSite = `${prefix}-own`, otherSite = `${prefix}-other`;
  const email = `${uid}@sentrys.test`, password = 'Recette-Local-2026!';
  await app.auth().createUser({ uid, email, password });
  const batch = db.batch(), stamp = admin.firestore.Timestamp.now();
  batch.create(db.doc(`tenants/${tenantId}`), { status: 'active', name: 'RECETTE INCIDENT' });
  batch.create(db.doc(`tenantUsers/${uid}`), { tenantId, status: 'active', role: 'agent', agentId, email });
  for (const siteId of [ownSite, otherSite]) {
    batch.create(db.doc(`sites/${siteId}`), { tenantId, name: 'SITE FICTIF', accessUids: siteId === ownSite ? [uid] : [], agentIds: [], managerIds: [] });
    batch.create(db.doc(`incidents/${siteId}`), { tenantId, siteId, title: 'INCIDENT FICTIF', description: `PRIVATE-${siteId}`, status: 'open', severity: 'low', isDeleted: false, createdAt: stamp, updatedAt: stamp });
  }
  const secondIncident = `${prefix}-second`, extraSite = `${prefix}-extra`;
  batch.create(db.doc(`incidents/${secondIncident}`), { tenantId, siteId: ownSite, title: 'SECOND INCIDENT FICTIF', status: 'open', severity: 'low', isDeleted: false, createdAt: admin.firestore.Timestamp.fromMillis(stamp.toMillis() - 1000), updatedAt: stamp });
  batch.create(db.doc(`sites/${extraSite}`), { tenantId, accessUids: [uid] });
  const foreign = `${prefix}-foreign`;
  batch.create(db.doc(`incidents/${foreign}`), { tenantId: foreign, siteId: foreign, title: 'AUTRE AGENCE', isDeleted: false, createdAt: stamp });
  await batch.commit();
  const login = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-only', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  assert.equal(login.status, 200);
  const token = (await login.json()).idToken;
  const request = async (path, method = 'GET', data) => {
    const response = await fetch(`http://127.0.0.1:9002${path}`, { method, signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  assert.equal((await request('/api/me')).data.tenantId, tenantId);
  const checks = [];
  for (const suffix of ['', '&limit=1']) {
    const res = await request(`/api/incidents?siteId=${ownSite}${suffix}`);
    const items = res.data.incidents || res.data.items || [];
    checks.push({ label: `authorized site list ${suffix || 'standard'}`, status: res.status, passed: res.status === 200 && items.length === (suffix ? 1 : 2) && items.every(i => [ownSite, secondIncident].includes(i.id)) });
  }
  for (const [label, path, expected] of [
    ['own incident', `/api/incidents/${ownSite}`, [200]],
    ['incident on inaccessible site', `/api/incidents/${otherSite}`, [403, 404]],
    ['comments on inaccessible site', `/api/incidents/${otherSite}/comments`, [403, 404]],
    ['other agency incident', `/api/incidents/${foreign}`, [403, 404]],
  ]) {
    const res = await request(path);
    checks.push({ label, status: res.status, passed: expected.includes(res.status) });
  }
  for (const path of ['/api/incidents', `/api/incidents?siteId=${otherSite}`, `/api/incidents?siteId=${otherSite}&limit=10`]) {
    const res = await request(path);
    checks.push({ label: path, status: res.status, passed: res.status === 403 });
  }
  const patch = await request(`/api/incidents/${otherSite}`, 'PATCH', { title: 'UNAUTHORIZED RECETTE' });
  checks.push({ label: 'agent PATCH refused', status: patch.status, passed: patch.status === 403 });
  checks.push({ label: 'incident unchanged', passed: (await db.doc(`incidents/${otherSite}`).get()).data().title === 'INCIDENT FICTIF' });
  const first = await request(`/api/incidents?siteId=${ownSite}&limit=1`);
  const cursor = first.data.nextCursor;
  assert.equal(typeof cursor, 'string', 'Two incidents must produce a cursor');
  const nextPath = `/api/incidents?siteId=${ownSite}&limit=1&cursor=${encodeURIComponent(cursor)}`;
  const second = await request(nextPath);
  checks.push({ label: 'second page without repetition', status: second.status, passed: second.status === 200 && second.data.items?.length === 1 && second.data.items[0].id === secondIncident && !second.data.hasMore });
  const wrongSite = await request(`/api/incidents?siteId=${extraSite}&limit=1&cursor=${encodeURIComponent(cursor)}`);
  checks.push({ label: 'cursor bound to original site', status: wrongSite.status, passed: wrongSite.status === 400 });
  await db.doc(`sites/${ownSite}`).update({ accessUids: [] });
  const revoked = await request(nextPath);
  checks.push({ label: 'access revoked between pages', status: revoked.status, passed: revoked.status === 403 });
  console.log(JSON.stringify({ prefix, productionTouched: false, checks }, null, 2));
  if (checks.some(c => !c.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => app.delete());
