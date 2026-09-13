import test, { before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc } from 'firebase/firestore';

// Dedicated demo namespace: never clears the user's local recipe project.
let env;
const prefix = randomUUID();
const id = value => `${prefix}-${value}`;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-sentrys-isolation', firestore: {
    host: '127.0.0.1', port: 8091, rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const records = {
      [`tenants/${id('t')}`]: { status: 'active' },
      [`tenantUsers/${id('a')}`]: { tenantId: id('t'), role: 'agent', agentId: id('agent-a'), status: 'active' },
      [`tenantUsers/${id('manager')}`]: { tenantId: id('t'), role: 'manager', status: 'active' },
      [`sites/${id('s')}`]: { tenantId: id('t'), accessUids: [id('a')] },
      [`vacations/${id('own')}`]: { tenantId: id('t'), siteId: id('s'), assignedAgentIds: [id('agent-a')] },
      [`vacations/${id('peer')}`]: { tenantId: id('t'), siteId: id('s'), assignedAgentIds: [id('agent-b')] },
      [`vacations/${id('foreign')}`]: { tenantId: id('other'), siteId: id('s'), assignedAgentIds: [id('agent-a')] },
      [`vacations/${id('malformed')}`]: { tenantId: id('t'), siteId: id('s') },
      [`vacations/${id('map')}`]: { tenantId: id('t'), siteId: id('s'), assignedAgentIds: { [id('agent-a')]: false } },
      [`vacations/${id('string')}`]: { tenantId: id('t'), siteId: id('s'), assignedAgentIds: id('agent-a') },
      [`vacations/${id('null')}`]: { tenantId: id('t'), siteId: id('s'), assignedAgentIds: null },
    };
    for (const [path, data] of Object.entries(records)) await setDoc(doc(db, path), data);
  });
});
after(async () => { await env?.cleanup(); });
test('Firestore agent can read own vacation but not a colleague on the same site', async () => {
  const db = env.authenticatedContext(id('a')).firestore();
  await assertSucceeds(getDoc(doc(db, 'vacations', id('own'))));
  for (const value of ['peer', 'foreign', 'malformed', 'map', 'string', 'null']) await assertFails(getDoc(doc(db, 'vacations', id(value))));
});
test('Firestore agent lists are server-only, including own-agent filtered SDK queries', async () => {
  const db = env.authenticatedContext(id('a')).firestore();
  const base = [where('tenantId', '==', id('t')), where('siteId', '==', id('s'))];
  await assertFails(getDocs(query(collection(db, 'vacations'), ...base)));
  await assertFails(getDocs(query(collection(db, 'vacations'), ...base, where('assignedAgentIds', 'array-contains', id('agent-a')))));
});
test('Firestore manager retains same-tenant access; anonymous access remains denied', async () => {
  const db = env.authenticatedContext(id('manager')).firestore();
  await assertSucceeds(getDoc(doc(db, 'vacations', id('peer'))));
  await assertSucceeds(getDocs(query(collection(db, 'vacations'), where('tenantId', '==', id('t')))));
  await assertFails(getDoc(doc(db, 'vacations', id('foreign'))));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'vacations', id('own'))));
});
