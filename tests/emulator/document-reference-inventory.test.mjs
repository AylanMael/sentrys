import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Explicit loopback only; no dotenv, project fallback or production credentials.
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):[0-9]{1,5}$/);
const port = Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]);
assert.ok(port > 0 && port <= 65535);
const projectId = 'demo-sentrys-cleanup';
const { initializeApp, deleteApp } = await import('firebase-admin/app');
const firestore = await import('firebase-admin/firestore');
const app = initializeApp({projectId}, `cleanup-test-${randomUUID()}`);
const db = firestore.getFirestore(app);
const ids = [];
after(async()=>{
  // Only records created by this run; never clear the emulator globally.
  for (const id of ids) await db.collection('agents').doc(id).delete();
  await db.terminate(); await deleteApp(app);
});
function load(file) {
  const exports = {};
  const source = readFileSync(new URL(`../../src/lib/uploads/${file}.ts`,import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,URL,require:name=>{if(name==='server-only')return {};assert.equal(name,'firebase-admin/firestore');return firestore;}});
  return exports;
}
const {createDocumentReferenceReader} = load('document-reference-reader');
const {collectDocumentReferences} = load('document-reference-inventory');
const {diagnoseDocumentCleanup} = load('document-cleanup-diagnostic');

test('real Firestore pagination finds a live reference on the last page and preserves records',async()=>{
  const tenantId=`qa-${randomUUID()}`;
  const path=`tenants/${tenantId}/agents/owner/documents/old.pdf`;
  const original=[];
  for(let i=0;i<5;i++) {
    const id=`${tenantId}-${i}`; ids.push(id);
    const value={tenantId, profile:{documents:i===4?[{id:'live',path}]:[]}, untouched:'keep'};
    original.push(value); await db.collection('agents').doc(id).create(value);
  }
  const foreignId=`${tenantId}-foreign`;ids.push(foreignId);
  await db.collection('agents').doc(foreignId).create({tenantId:'other',profile:{documents:[{url:'unresolvable'}]}});
  const reader=createDocumentReferenceReader(db,tenantId,2);
  let calls=0;
  const inventory=await collectDocumentReferences({tenantId,readPage:async cursor=>{calls++;return reader(cursor);}});
  assert.equal(calls,3);assert.equal(inventory.complete,true);assert.equal(inventory.agentsRead,5);
  assert.equal(inventory.unresolved,0);assert.ok(inventory.paths.includes(path));
  assert.equal(diagnoseDocumentCleanup({tenantId,agentId:'owner',agentTenantId:tenantId,
    trace:{tenantId,agentId:'owner',cleanupPath:path,cleanupStatus:'pending'},references:inventory}).reason,'still-referenced');
  for(let i=0;i<5;i++)assert.deepEqual((await db.collection('agents').doc(`${tenantId}-${i}`).get()).data(),original[i]);
  const capped=await collectDocumentReferences({tenantId,readPage:reader,maxPages:1});
  assert.equal(capped.complete,false);
});
test('exact page boundary reads the terminal empty page',async()=>{
  const tenantId=`qa-${randomUUID()}`;
  for(let i=0;i<2;i++){const id=`${tenantId}-${i}`;ids.push(id);await db.collection('agents').doc(id).create({tenantId});}
  const reader=createDocumentReferenceReader(db,tenantId,2);let calls=0;
  const result=await collectDocumentReferences({tenantId,readPage:async cursor=>{calls++;return reader(cursor);}});
  assert.equal(calls,2);assert.equal(result.complete,true);assert.equal(result.agentsRead,2);
});
test('reader rejects malformed parameters before any database access',async()=>{
  for(const size of [0,251,1.5])assert.throws(()=>createDocumentReferenceReader(db,'t',size));
  assert.throws(()=>createDocumentReferenceReader(db,'../t'));
  await assert.rejects(createDocumentReferenceReader(db,'t')('bad/cursor'));
});

test('read failure after a real first page cannot authorize cleanup',async()=>{
  const tenantId=`qa-${randomUUID()}`;
  const id=`${tenantId}-0`;ids.push(id);
  await db.collection('agents').doc(id).create({tenantId,profile:{documents:[]}});
  const reader=createDocumentReferenceReader(db,tenantId,1);
  const inventory=await collectDocumentReferences({tenantId,readPage:async cursor=>{
    if(cursor!==null)throw new Error('simulated unavailable second page');
    return reader(cursor);
  }});
  assert.equal(inventory.agentsRead,1);
  assert.equal(inventory.complete,false);
  assert.equal(diagnoseDocumentCleanup({tenantId,agentId:'owner',agentTenantId:tenantId,
    trace:{tenantId,agentId:'owner',cleanupPath:`tenants/${tenantId}/agents/owner/documents/old.pdf`,cleanupStatus:'pending'},
    references:inventory}).reason,'incomplete-references');
});

test('legacy Firebase URL on a later page blocks cleanup without exposing its token',async()=>{
  const tenantId=`qa-${randomUUID()}`;
  const path=`tenants/${tenantId}/agents/owner/documents/old.pdf`;
  for(let i=0;i<2;i++){
    const id=`${tenantId}-${i}`;ids.push(id);
    await db.collection('agents').doc(id).create({tenantId,profile:{documents:i===1
      ?[{url:`https://firebasestorage.googleapis.com/v0/b/demo/o/${encodeURIComponent(path)}?token=TEST_ONLY`}]:[]}});
  }
  const inventory=await collectDocumentReferences({tenantId,readPage:createDocumentReferenceReader(db,tenantId,1)});
  assert.equal(inventory.complete,true);
  assert.equal(inventory.unresolved,0);
  assert.equal(diagnoseDocumentCleanup({tenantId,agentId:'owner',agentTenantId:tenantId,
    trace:{tenantId,agentId:'owner',cleanupPath:path,cleanupStatus:'pending'},references:inventory}).reason,'still-referenced');
  assert.doesNotMatch(JSON.stringify(inventory),/TEST_ONLY|token=/);
});

test('Firestore projection retains legacy root references even beside a newer profile',async()=>{
  const tenantId=`qa-${randomUUID()}`;
  const path=`tenants/${tenantId}/agents/owner/documents/old.pdf`;
  const photo=`tenants/${tenantId}/agents/owner/photo/old.png`;
  const newer=`tenants/${tenantId}/agents/owner/documents/new.pdf`;
  const original=[];
  for(let i=0;i<3;i++){
    const id=`${tenantId}-${i}`;ids.push(id);
    const value={tenantId,profile:{documents:[{path:newer}]},
      ...(i===2?{documents:[{path}],photoPath:photo,photoUrl:`https://firebasestorage.googleapis.com/v0/b/demo/o/${encodeURIComponent(photo)}?token=ROOT_TEST_SECRET`}:{}),untouched:'keep'};
    original.push(value);await db.collection('agents').doc(id).create(value);
  }
  const inventory=await collectDocumentReferences({tenantId,readPage:createDocumentReferenceReader(db,tenantId,1)});
  assert.equal(inventory.complete,true);assert.equal(inventory.unresolved,0);
  for(const reference of [path,photo,newer])assert.ok(inventory.paths.includes(reference));
  assert.equal(diagnoseDocumentCleanup({tenantId,agentId:'owner',agentTenantId:tenantId,
    trace:{tenantId,agentId:'owner',cleanupPath:path,cleanupStatus:'pending'},references:inventory}).reason,'still-referenced');
  assert.doesNotMatch(JSON.stringify(inventory),/ROOT_TEST_SECRET|token=/);
  for(let i=0;i<3;i++)assert.deepEqual((await db.collection('agents').doc(`${tenantId}-${i}`).get()).data(),original[i]);
});

test('ambiguous root document blocks cleanup despite an empty nested profile',async()=>{
  const tenantId=`qa-${randomUUID()}`,id=`${tenantId}-0`;ids.push(id);
  await db.collection('agents').doc(id).create({tenantId,profile:{documents:[]},documents:{unexpected:'format'}});
  const inventory=await collectDocumentReferences({tenantId,readPage:createDocumentReferenceReader(db,tenantId,1)});
  assert.equal(inventory.complete,true);assert.ok(inventory.unresolved>0);
  assert.equal(diagnoseDocumentCleanup({tenantId,agentId:'owner',agentTenantId:tenantId,
    trace:{tenantId,agentId:'owner',cleanupPath:`tenants/${tenantId}/agents/owner/documents/old.pdf`,cleanupStatus:'pending'},references:inventory}).reason,'incomplete-references');
});
