import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as roles from '../src/lib/auth/role.ts';
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture({ role = 'agent', site = { tenantId: 't', accessUids: ['u'] }, siteExists = true } = {}) {
  const auth = { uid: 'u', tenantId: 't', role };
  let siteReads = 0;
  const exports = {};
  const db = { collection: name => ({ doc: () => ({ get: async () => { assert.equal(name, 'sites'); siteReads++; return { exists: siteExists, data: () => site }; } }) }) };
  runInNewContext(compile(read('src/lib/auth/incident-read.ts')), { exports, require: name => {
    if (name === '@/lib/firebase/admin') return { adminDb: db };
    if (name === '@/lib/auth/role') return roles;
    throw new Error(name);
  } });
  return { check: id => exports.canReadIncidentSite(auth, id), reads: () => siteReads };
}
test('agent incident read requires site authorization and matching tenant', async () => {
  assert.equal(await fixture().check('s'), true);
  for (const site of [{ tenantId: 'other', accessUids: ['u'] }, { tenantId: 't', accessUids: ['other'] }, { tenantId: 't', accessUids: 'u' }]) {
    assert.equal(await fixture({ site }).check('s'), false);
  }
  assert.equal(await fixture({ siteExists: false }).check('s'), false);
});
test('legacy site membership arrays remain supported', async () => {
  for (const field of ['accessUids', 'managerIds', 'agentIds']) assert.equal(await fixture({ site: { tenantId: 't', [field]: ['u'] } }).check('s'), true);
});
test('unscoped and malformed site requests are denied without reads for agents', async () => {
  for (const id of ['', null, undefined, 's/other']) { const f = fixture(); assert.equal(await f.check(id), false); assert.equal(f.reads(), 0); }
});
test('backoffice retains global access; clients and unknown roles do not', async () => {
  for (const role of ['owner', 'admin', 'manager', 'viewer', 'super_admin']) { const f = fixture({ role }); assert.equal(await f.check(''), true); assert.equal(f.reads(), 0); }
  for (const role of ['client', null, 'unknown']) assert.equal(await fixture({ role }).check('s'), false);
});
test('all incident read endpoints use shared authorization before returning data', () => {
  const list = read('src/app/api/incidents/route.ts');
  assert.ok(list.indexOf('canReadIncidentSite(auth, siteId)') < list.indexOf('if ((incidentLimit'));
  const single = read('src/app/api/incidents/[id]/route.ts');
  assert.ok(single.indexOf('canReadIncidentSite(auth, loaded.data.siteId)') < single.indexOf('incident: pickIncident'));
  const comments = read('src/app/api/incidents/[id]/comments/route.ts');
  assert.match(comments, /data\?\.tenantId !== auth.tenantId/);
  assert.match(comments, /return canReadIncidentSite\(auth, data.siteId\)/);
  for (const source of [list, single]) assert.match(source, /"Cache-Control": "no-store"/);
});
