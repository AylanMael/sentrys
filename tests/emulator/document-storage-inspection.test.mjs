import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):[0-9]{1,5}$/);
const port=Number(process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':')[1]);
assert.ok(port>0 && port<=65535);
// Admin SDK directs Storage to this explicit loopback host, no ADC/project fallback.
const projectId='demo-sentrys-inspection';
const {initializeApp,deleteApp}=await import('firebase-admin/app');
const {getStorage}=await import('firebase-admin/storage');
const app=initializeApp({projectId},`qa-${randomUUID()}`);
const storage=getStorage(app);
const bucketName=`${projectId}.appspot.com`;
const path=`tenants/qa-${randomUUID()}/agents/a/documents/test.txt`;
const tenantId=path.split('/')[1];
const file=storage.bucket(bucketName).file(path);
let created=false;
after(async()=>{try {if(created)await file.delete({ignoreNotFound:true});}finally{await deleteApp(app);}});
function load(name,mocks={}){
  const exports={};
  const source=readFileSync(new URL(`../../src/lib/uploads/${name}.ts`,import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:id=>{if(id==='server-only')return {};assert.ok(id in mocks);return mocks[id];}});
  return exports;
}
const {inspectDocumentStorage}=load('document-storage-inspection',{'./document-cleanup-diagnostic':load('document-cleanup-diagnostic')});
const diagnostic={tenantId,agentId:'a',agentTenantId:tenantId,trace:{tenantId,agentId:'a',cleanupPath:path,cleanupStatus:'pending'},references:{complete:true,unresolved:0,paths:[]}};

test('actual emulator object inspection preserves data and fails closed if bucket API is unsupported',async t=>{
  await file.save('TEST ONLY',{resumable:false,contentType:'text/plain'});created=true;
  const [before]=await file.getMetadata();
  assert.equal(before.name,path);assert.equal(typeof before.generation,'string');
  let bucketVerified=false;
  try {const [metadata]=await storage.bucket(bucketName).getMetadata();bucketVerified=metadata.name===bucketName;}catch{}
  t.diagnostic(`Bucket metadata API available: ${bucketVerified}`);
  const result=await inspectDocumentStorage({diagnostic,buckets:[bucketName],storage});
  if(bucketVerified){assert.equal(result.status,'inspected');assert.equal(result.objects[0].generation,before.generation);}
  else {assert.equal(result.status,'incomplete');assert.equal(result.objects[0].state,'unverified');}
  const [afterMetadata]=await file.getMetadata();assert.equal(afterMetadata.generation,before.generation);
  assert.doesNotMatch(JSON.stringify(result),/test.txt|tenants\//);
  // Remove only the disposable object created by this test, never a real document.
  await file.delete();created=false;
  await assert.rejects(file.getMetadata(),error=>Number(error.code)===404);
  const absent=await inspectDocumentStorage({diagnostic,buckets:[bucketName],storage});
  assert.equal(absent.status,bucketVerified?'inspected':'incomplete');
  assert.equal(absent.objects[0].state,bucketVerified?'absent':'unverified');
});
