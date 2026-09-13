import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
function load(file, mocks={}) {
  const exports={};
  const source=readFileSync(new URL(`../src/lib/uploads/${file}.ts`,import.meta.url),'utf8');
  runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>{if(name==='server-only')return {};assert.ok(name in mocks);return mocks[name];}});
  return exports;
}
const {inspectDocumentStorage:inspect}=load('document-storage-inspection',{'./document-cleanup-diagnostic':load('document-cleanup-diagnostic')});
const path='tenants/t/agents/a/documents/old.pdf';
const diagnostic=()=>({tenantId:'t',agentId:'a',agentTenantId:'t',trace:{tenantId:'t',agentId:'a',cleanupStatus:'pending',cleanupPath:path},references:{complete:true,paths:[],unresolved:0}});
function fixture(outcomes={}) {
  const calls=[];
  const storage={bucket:name=>{
    calls.push(['bucket',name]);const outcome=outcomes[name]??{};
    return {getMetadata:async()=>{if(outcome.bucketError)throw {code:outcome.bucketError};return [{name}];},
      file:objectPath=>{assert.equal(objectPath,path);return {getMetadata:async()=>{
        calls.push(['object',name]);if(outcome.error)throw {code:outcome.error,message:'SECRET'};
        return [{name:path,bucket:name,generation:'90071992547409931234',metadata:{firebaseStorageDownloadTokens:'SECRET'},...outcome.metadata}];
      }};}};
  }};
  return {storage,calls};
}
test('inspection retains exact generation but no private path or download token',async()=>{
  const f=fixture();const result=await inspect({diagnostic:diagnostic(),buckets:['demo.bucket'],storage:f.storage});
  assert.equal(result.status,'inspected');assert.equal(result.objects[0].generation,'90071992547409931234');
  assert.doesNotMatch(JSON.stringify(result),/SECRET|tenants\/|old.pdf|firebaseStorageDownloadTokens/);
});
test('an absent object in the first bucket does not skip a present fallback object',async()=>{
  const f=fixture({'one.bucket':{error:404}});
  const result=await inspect({diagnostic:diagnostic(),buckets:['one.bucket','two.bucket'],storage:f.storage});
  assert.equal(result.status,'inspected');assert.equal(result.objects[0].state,'absent');assert.equal(result.objects[1].state,'present');
});
for(const error of [403,500,'ECONNRESET'])test(`read error ${error} remains unverified`,async()=>{
  const f=fixture({'demo.bucket':{error}});
  const result=await inspect({diagnostic:diagnostic(),buckets:['demo.bucket'],storage:f.storage});
  assert.equal(result.status,'incomplete');assert.equal(result.objects[0].state,'unverified');
});
test('missing bucket is not reported as missing object',async()=>{
  const f=fixture({'demo.bucket':{bucketError:404}});
  const result=await inspect({diagnostic:diagnostic(),buckets:['demo.bucket'],storage:f.storage});
  assert.equal(result.status,'incomplete');assert.equal(f.calls.length,1);
});
for(const metadata of [{generation:123},{generation:null},{generation:'0'},{generation:'1.2'},{name:'other'},{bucket:'foreign'}])test(`unverified identity/generation: ${JSON.stringify(metadata)}`,async()=>{
  const f=fixture({'demo.bucket':{metadata}});
  assert.equal((await inspect({diagnostic:diagnostic(),buckets:['demo.bucket'],storage:f.storage})).status,'incomplete');
});
for(const buckets of [[],['https://bucket'],[' bucket'],Array.from({length:11},(_,i)=>`bucket-${i}`)])test(`invalid bucket scope blocks all reads: ${JSON.stringify(buckets)}`,async()=>{
  const f=fixture();assert.equal((await inspect({diagnostic:diagnostic(),buckets,storage:f.storage})).status,'blocked');assert.equal(f.calls.length,0);
});
test('still referenced document blocks metadata access',async()=>{
  const d=diagnostic();d.references.paths.push(path);const f=fixture();
  assert.equal((await inspect({diagnostic:d,buckets:['demo.bucket'],storage:f.storage})).reason,'still-referenced');assert.equal(f.calls.length,0);
});
test('duplicate bucket inspected once',async()=>{
  const f=fixture();const result=await inspect({diagnostic:diagnostic(),buckets:['demo.bucket','demo.bucket'],storage:f.storage});
  assert.equal(result.objects.length,1);assert.equal(f.calls.length,2);
});
test('absence is observed only after reading every explicit bucket',async()=>{
  const f=fixture({'one.bucket':{error:404},'two.bucket':{error:'404'}});
  const result=await inspect({diagnostic:diagnostic(),buckets:['one.bucket','two.bucket'],storage:f.storage});
  assert.equal(result.status,'inspected');assert.equal(result.objects.length,2);
  assert.ok(result.objects.every(item=>item.state==='absent'));assert.equal(f.calls.length,4);
});
test('one uncertain bucket keeps the entire inspection incomplete',async()=>{
  const f=fixture({'one.bucket':{error:403}});
  const result=await inspect({diagnostic:diagnostic(),buckets:['one.bucket','two.bucket'],storage:f.storage});
  assert.equal(result.status,'incomplete');assert.equal(result.objects[1].state,'present');
});
