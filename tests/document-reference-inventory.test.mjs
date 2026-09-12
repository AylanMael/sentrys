import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const exports = {};
const source = readFileSync(new URL('../src/lib/uploads/document-reference-inventory.ts', import.meta.url), 'utf8');
runInNewContext(ts.transpileModule(source, { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText,
  {exports, URL, require:name=>{assert.equal(name,'server-only');return {};}});
const collect = exports.collectDocumentReferences;
const path = 'tenants/t/agents/a/documents/old.pdf';
const agent = (id, profile = {}) => ({id,tenantId:'t',profile});
const single = profile => collect({tenantId:'t',readPage:async()=>({agents:[agent('a',profile)],nextCursor:null})});

test('all pages including empty intermediate pages are read', async()=>{
  const cursors=[];
  const pages=[{agents:[agent('a')],nextCursor:'a'},{agents:[],nextCursor:'b'},
    {agents:[agent('c',{documents:[{path}]})],nextCursor:null}];
  const result=await collect({tenantId:'t',readPage:async cursor=>{cursors.push(cursor);return pages.shift();}});
  assert.deepEqual(cursors,[null,'a','b']); assert.equal(result.complete,true);
  assert.equal(result.agentsRead,2); assert.ok(result.paths.includes(path));
});
test('photo, private document and legacy URL are all accounted for and deduplicated',async()=>{
  const result=await single({photoPath:path,documents:[{path,url:'/api/agents/a/files/id'},
    {url:`https://firebasestorage.googleapis.com/v0/b/example/o/${encodeURIComponent(path)}?token=PRIVATE`}]});
  assert.equal(result.unresolved,0); assert.equal(result.paths.length,1);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE|token/);
});
for(const profile of ['malformed',{documents:{}},{documents:[null]},{documents:[{}]},
  {documents:[{url:'/api/agents/a/files/id'}]},{photoUrl:'https://example.invalid/photo.png'},
  {documents:[{path:'tenants/t/agents/a/documents/../old.pdf'}]},
  {documents:[{path,url:'https://unknown.invalid/file'}]}]) {
  test(`ambiguous profile blocks downstream cleanup: ${JSON.stringify(profile)}`,async()=>{
    const result=await single(profile); assert.ok(result.unresolved>0);
  });
}
test('a repeated cursor ends the scan as incomplete',async()=>{
  let calls=0;
  const result=await collect({tenantId:'t',readPage:async()=>({agents:[agent(String(++calls))],nextCursor:'same'})});
  assert.equal(result.complete,false); assert.equal(calls,2);
});
test('a duplicate agent signals unstable pagination',async()=>{
  const result=await collect({tenantId:'t',readPage:async()=>({agents:[agent('a')],nextCursor:'a'})});
  assert.equal(result.complete,false);
});
test('foreign tenant fails closed',async()=>{
  const result=await collect({tenantId:'t',readPage:async()=>({agents:[{...agent('a'),tenantId:'foreign'}],nextCursor:null})});
  assert.equal(result.complete,false);
});
test('page cap cannot be mistaken for completed inventory',async()=>{
  const result=await collect({tenantId:'t',maxPages:1,readPage:async()=>({agents:[agent('a')],nextCursor:'a'})});
  assert.equal(result.complete,false);
});
test('read failure exposes no private error message',async()=>{
  const result=await collect({tenantId:'t',readPage:async()=>{throw new Error('PRIVATE TOKEN');}});
  assert.equal(result.complete,false); assert.doesNotMatch(JSON.stringify(result),/PRIVATE|TOKEN/);
});
test('legacy reference to another agent is retained, not silently discarded',async()=>{
  const result=await single({documents:[{path:'tenants/t/agents/other/documents/old.pdf'}]});
  assert.ok(result.paths.includes('tenants/t/agents/other/documents/old.pdf'));
});
