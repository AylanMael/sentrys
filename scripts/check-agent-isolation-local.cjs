// Recipe only: fixed loopback emulators and demo project; no production credentials.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8091';
const admin = require('firebase-admin');
const assert = require('node:assert/strict');
const projectId = 'demo-sentrys-accounts';
const app = admin.initializeApp({ projectId }, 'agent-isolation-recipe');
const prefix = `qa-isolation-${Date.now()}`;
const results = [];
async function request(path, token, method = 'GET', body) {
  const response = await fetch(`http://127.0.0.1:9002${path}`, {
    method, signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
function check(name, condition, status) {
  results.push({ name, passed: Boolean(condition), ...(status ? { status } : {}) });
}
async function main() {
  // Fail before seeding if either local service is unavailable.
  await fetch('http://127.0.0.1:9099/', { signal: AbortSignal.timeout(5000) });
  const page = await fetch('http://127.0.0.1:9002/login', { signal: AbortSignal.timeout(60000) });
  assert.equal(page.status, 200);
  const db = app.firestore();
  const tenantA = `${prefix}-tenant-a`, tenantB = `${prefix}-tenant-b`;
  const siteA = `${prefix}-site-a`, siteB = `${prefix}-site-b`;
  const users = ['a', 'b', 'c'].map(s => ({ uid: `${prefix}-${s}`, agentId: `${prefix}-agent-${s}`, vacationId: `${prefix}-vacation-${s}`, assignmentId: `${prefix}-assignment-${s}`, tenantId: s === 'c' ? tenantB : tenantA, siteId: s === 'c' ? siteB : siteA }));
  const batch = db.batch();
  for (const id of [tenantA, tenantB]) batch.create(db.doc(`tenants/${id}`), { name: 'RECETTE ISOLATION', status: 'active', plan: 'pro' });
  for (const [id, tenantId, members] of [[siteA, tenantA, users.slice(0, 2)], [siteB, tenantB, users.slice(2)]]) {
    batch.create(db.doc(`sites/${id}`), { tenantId, name: `RECETTE ${id}`, status: 'active', accessUids: members.map(u => u.uid), agentIds: members.map(u => u.uid), managerIds: [], latitude: 48.8584, longitude: 2.2945 });
  }
  const now = Date.now(), stamp = admin.firestore.Timestamp.fromMillis;
  for (const u of users) {
    const email = `${u.uid}@sentrys.test`;
    await app.auth().createUser({ uid: u.uid, email, password: 'Recette-Local-2026!', emailVerified: true });
    batch.create(db.doc(`tenantUsers/${u.uid}`), { tenantId: u.tenantId, role: 'agent', status: 'active', agentId: u.agentId, email });
    batch.create(db.doc(`agents/${u.agentId}`), { tenantId: u.tenantId, firstName: 'RECETTE', lastName: u.uid });
    batch.create(db.doc(`vacations/${u.vacationId}`), { tenantId: u.tenantId, siteId: u.siteId, assignedAgentIds: [u.agentId], status: 'filled', title: `PRIVATE-${u.uid}`, startAt: stamp(now - 600000), endAt: stamp(now + 3600000), updatedAt: stamp(now) });
    batch.create(db.doc(`assignments/${u.assignmentId}`), { tenantId: u.tenantId, agentId: u.agentId, siteId: u.siteId, vacationId: u.vacationId, status: 'assigned', updatedAt: stamp(now) });
    const login = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-only`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Recette-Local-2026!', returnSecureToken: true }) });
    assert.equal(login.status, 200);
    u.token = (await login.json()).idToken;
  }
  await batch.commit();
  for (const u of users) {
    const me = await request('/api/me', u.token);
    assert.equal(me.status, 200, 'Local server must accept emulator token');
    assert.equal(me.body.tenantId, u.tenantId);
    const list = await request('/api/agent-missions', u.token);
    check(`own list ${u.uid.slice(-1)}`, list.status === 200 && list.body.missions?.length === 1 && list.body.missions[0].vacationId === u.vacationId, list.status);
    const vacations = await request(`/api/vacations?siteId=${u.siteId}&limit=1`, u.token);
    check(`site vacation list ${u.uid.slice(-1)}`, vacations.status === 200 && vacations.body.items?.length === 1 && vacations.body.items[0].id === u.vacationId && !vacations.body.hasMore, vacations.status);
    const assignments = await request(`/api/vacations/${u.vacationId}/assignments`, u.token);
    check(`own assignments ${u.uid.slice(-1)}`, assignments.status === 200 && assignments.body.assignments?.length === 1 && assignments.body.assignments[0].agentId === u.agentId, assignments.status);
  }
  const [a, b, c] = users;
  const own = await request(`/api/vacations/${a.vacationId}`, a.token);
  check('own direct vacation control', own.status === 200, own.status);
  for (const target of [b, c]) {
    const label = target === b ? 'same agency other agent' : 'other agency';
    for (const path of [`/api/vacations/${target.vacationId}`, `/api/vacations/${target.vacationId}/assignments`, `/api/agent-missions?cursor=${target.assignmentId}`]) {
      const res = await request(path, a.token);
      check(`${label}: ${path.split('?')[0]}`, [403, 404].includes(res.status), res.status);
    }
    for (const direction of ['check-in', 'check-out']) {
      const res = await request(`/api/assignments/${target.assignmentId}/${direction}`, a.token, 'POST', { latitude: 48.8584, longitude: 2.2945 });
      check(`${label}: ${direction}`, res.status === 403, res.status);
    }
    const after = (await db.doc(`assignments/${target.assignmentId}`).get()).data();
    check(`${label}: assignment unchanged`, after.status === 'assigned' && !after.checkedInAt && !after.checkedOutAt);
  }
  console.log(JSON.stringify({ fixturePrefix: prefix, productionTouched: false, results }, null, 2));
  if (results.some(r => !r.passed)) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => app.delete());
