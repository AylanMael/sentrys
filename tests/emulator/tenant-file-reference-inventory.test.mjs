import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Explicit loopback only: no dotenv, credentials or project fallback.
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):[0-9]{1,5}$/);
const port = Number(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]);
assert.ok(port > 0 && port <= 65535);
const { initializeApp, deleteApp } = await import('firebase-admin/app');
const firestore = await import('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-sentrys-cleanup' }, `tenant-inventory-${randomUUID()}`);
const db = firestore.getFirestore(app);
const collections = ['agents', 'tenants', 'planningDispatches', 'sitePlanningDispatches'];
const created = [];
after(async () => {
  try {
    // Successful creates only, scoped to this run's UUID fixtures in four collections.
    for (const ref of created) await ref.delete();
  } finally {
    try { await db.terminate(); } finally { await deleteApp(app); }
  }
});

// Transpile the actual dependency graph; only server-only is stubbed.
// All Firebase calls use the real Admin SDK and the explicitly selected emulator.
const moduleCache = new Map();
const moduleRoot = new URL('../../src/lib/uploads/', import.meta.url);
function loadModule(file) {
  assert.ok(file.href.startsWith(moduleRoot.href), 'Module must stay in uploads');
  if (moduleCache.has(file.href)) return moduleCache.get(file.href).exports;
  const loadedModule = { exports: {} };
  moduleCache.set(file.href, loadedModule);
  const source = readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(compiled, {
    module: loadedModule, exports: loadedModule.exports, URL,
    require(name) {
      if (name === 'server-only') return {};
      if (name === 'firebase-admin/firestore') return firestore;
      assert.match(name, /^\.\.?\//, `Unexpected module: ${name}`);
      return loadModule(new URL(name.endsWith('.ts') ? name : `${name}.ts`, file));
    },
  }, { filename: file.pathname });
  return loadedModule.exports;
}
const { collectTenantFileReferences } = loadModule(new URL('tenant-file-reference-inventory.ts', moduleRoot));
const { createAgencyReferenceReader } = loadModule(new URL('agency-reference-reader.ts', moduleRoot));
const { collectAgencyReferences } = loadModule(new URL('agency-reference-inventory.ts', moduleRoot));
const { createDocumentReferenceReader } = loadModule(new URL('document-reference-reader.ts', moduleRoot));
const { diagnoseDocumentCleanup } = loadModule(new URL('document-cleanup-diagnostic.ts', moduleRoot));
const plain = value => JSON.parse(JSON.stringify(value));
const pathFor = (tenantId, name) => `tenants/${tenantId}/agents/owner/documents/${name}.png`;
const urlFor = path => `https://firebasestorage.googleapis.com/v0/b/demo/o/${encodeURIComponent(path)}?token=INVENTORY_TEST_SECRET`;
function diagnostic(tenantId, path, references) {
  return diagnoseDocumentCleanup({ tenantId, agentId: 'owner', agentTenantId: tenantId,
    trace: { tenantId, agentId: 'owner', cleanupPath: path, cleanupStatus: 'pending' }, references });
}
function fixtures(t) {
  const tenantId = `qa-${randomUUID()}`;
  const originals = [];
  t.after(async () => {
    for (const { ref, before } of originals) {
      const after = await ref.get();
      assert.equal(after.exists, true, ref.path);
      assert.deepEqual(after.data(), before.data(), ref.path);
      assert.ok(after.updateTime.isEqual(before.updateTime), `No writes: ${ref.path}`);
    }
  });
  return {
    tenantId,
    async create(collection, id, data) {
      assert.ok(collections.includes(collection));
      assert.ok(id.startsWith(tenantId), 'Fixture ID must belong to this run');
      const ref = db.collection(collection).doc(id);
      await ref.create(data);
      created.push(ref);
      originals.push({ ref, before: await ref.get() });
    },
  };
}

for (const source of ['planningDispatches', 'sitePlanningDispatches']) {
  test(`old logo only on the last ${source} page still blocks cleanup after tenant replacement`, async t => {
    const f = fixtures(t), { tenantId } = f;
    const oldLogo = pathFor(tenantId, 'old-logo'), newLogo = pathFor(tenantId, 'new-logo');
    await f.create('tenants', tenantId, { agencyProfile: { logoPath: newLogo }, untouched: 'keep' });
    for (let i = 0; i < 5; i++) {
      await f.create(source, `${tenantId}-${i}`, { tenantId,
        agencyProfile: { logoUrl: urlFor(i === 4 ? oldLogo : newLogo) }, untouched: { index: i } });
    }
    const reader = createAgencyReferenceReader(db, tenantId, source, 2);
    const cursors = [];
    const agency = await collectAgencyReferences({ tenantId, readPage: async cursor => {
      cursors.push(cursor);
      const page = await reader(cursor);
      if (cursors.length < 3) assert.ok(page.records.every(row => row.agencyProfile.logoUrl !== urlFor(oldLogo)));
      return page;
    } });
    assert.deepEqual(cursors, [null, `${tenantId}-1`, `${tenantId}-3`]);
    assert.equal(agency.recordsRead, 5);
    assert.equal(agency.complete, true);
    const result = await collectTenantFileReferences({ db, tenantId, pageSize: 2 });
    assert.equal(result.complete, true);
    assert.equal(result.unresolved, 0);
    assert.deepEqual(new Set(result.paths), new Set([oldLogo, newLogo]));
    assert.equal(result.sources[source].recordsRead, 5);
    assert.equal(diagnostic(tenantId, oldLogo, result).reason, 'still-referenced');
    assert.doesNotMatch(JSON.stringify(result), /INVENTORY_TEST_SECRET|token=/);
    const capped = await collectTenantFileReferences({ db, tenantId, pageSize: 2, maxPagesPerSource: 2 });
    assert.equal(capped.complete, false);
    assert.equal(capped.sources[source].recordsRead, 4);
    assert.equal(capped.sources[source].complete, false);
    assert.equal(capped.paths.includes(oldLogo), false);
    assert.equal(diagnostic(tenantId, oldLogo, capped).reason, 'incomplete-references');
  });
}

test('all four sources retain root and nested field variants and exclude foreign tenants', async t => {
  const f = fixtures(t), { tenantId } = f;
  const expected = [];
  function reference(name, asUrl = false) {
    const path = name.includes('photo') ? pathFor(tenantId, name).replace('/documents/', '/photo/') : pathFor(tenantId, name);
    expected.push(path);
    return asUrl ? urlFor(path) : path;
  }
  for (const source of collections.filter(name => name !== 'agents')) {
    const fields = {};
    const nested = {};
    for (const field of ['logoPath', 'logoUrl', 'logo']) {
      fields[field] = reference(`${source}-root-${field}`, field !== 'logoPath');
      nested[field] = reference(`${source}-nested-${field}`, field === 'logoUrl');
    }
    await f.create(source, source === 'tenants' ? tenantId : `${tenantId}-2`, {
      tenantId, ...fields, agencyProfile: nested, untouched: ['keep'],
    });
    if (source !== 'tenants') {
      for (let i = 0; i < 2; i++) await f.create(source, `${tenantId}-${i}`, { tenantId });
    }
  }
  for (let i = 0; i < 3; i++) {
    await f.create('agents', `${tenantId}-${i}`, { tenantId, ...(i === 2 ? {
      documents: [{ path: reference('agent-root-path') }, { url: reference('agent-root-url', true) }],
      photoPath: reference('agent-root-photo-path'), photoUrl: reference('agent-root-photo-url', true),
      profile: { documents: [{ path: reference('agent-nested-path') }, { url: reference('agent-nested-url', true) }],
        photoPath: reference('agent-nested-photo-path'), photoUrl: reference('agent-nested-photo-url', true) },
    } : {}), untouched: 'keep' });
  }
  const foreignPath = pathFor(`${tenantId}-foreign`, 'excluded');
  for (const source of collections) {
    // Matching tenantId on a differently named tenant document must also be excluded.
    await f.create(source, `${tenantId}-foreign`, { tenantId: source === 'tenants' ? tenantId : `${tenantId}-other`,
      logoPath: foreignPath, agencyProfile: { logoUrl: 'unresolvable' },
      documents: [{ path: foreignPath }], profile: { documents: [{ url: 'unresolvable' }] } });
  }
  const result = await collectTenantFileReferences({ db, tenantId, pageSize: 1 });
  assert.equal(result.complete, true);
  assert.equal(result.unresolved, 0);
  assert.deepEqual(new Set(result.paths), new Set(expected));
  assert.equal(result.paths.length, expected.length);
  for (const source of collections) assert.deepEqual(plain(result.sources[source]), {
    complete: true, unresolved: 0, recordsRead: source === 'tenants' ? 1 : 3,
  });
  assert.doesNotMatch(JSON.stringify(result), /INVENTORY_TEST_SECRET|token=/);
});

test('a missing tenant makes the union incomplete while dispatch scanning continues', async t => {
  const f = fixtures(t), { tenantId } = f;
  const path = pathFor(tenantId, 'retained');
  for (const source of collections.filter(name => name !== 'tenants')) {
    await f.create(source, `${tenantId}-0`, { tenantId, logoPath: path });
  }
  await assert.rejects(createAgencyReferenceReader(db, tenantId, 'tenants')(null), /Missing inventory tenant/);
  const result = await collectTenantFileReferences({ db, tenantId, pageSize: 2 });
  assert.equal(result.complete, false);
  assert.deepEqual(plain(result.sources.tenants), { complete: false, unresolved: 0, recordsRead: 0 });
  for (const source of collections.filter(name => name !== 'tenants')) {
    assert.equal(result.sources[source].complete, true);
    assert.equal(result.sources[source].recordsRead, 1);
  }
  assert.ok(result.paths.includes(path));
  assert.equal(diagnostic(tenantId, path, result).reason, 'incomplete-references');
});

test('exact page boundaries require an empty terminal page and caps apply per source', async t => {
  const f = fixtures(t), { tenantId } = f;
  await f.create('tenants', tenantId, { agencyProfile: {} });
  for (const source of collections.filter(name => name !== 'tenants')) {
    for (let i = 0; i < 2; i++) await f.create(source, `${tenantId}-${i}`, { tenantId });
    const reader = source === 'agents' ? createDocumentReferenceReader(db, tenantId, 2)
      : createAgencyReferenceReader(db, tenantId, source, 2);
    const first = await reader(null);
    assert.equal(first.nextCursor, `${tenantId}-1`);
    const terminal = await reader(first.nextCursor);
    assert.equal(terminal.nextCursor, null);
    assert.equal((terminal.agents ?? terminal.records).length, 0);
  }
  const capped = await collectTenantFileReferences({ db, tenantId, pageSize: 2, maxPagesPerSource: 1 });
  assert.equal(capped.complete, false);
  for (const source of collections) assert.deepEqual(plain(capped.sources[source]), {
    complete: source === 'tenants', unresolved: 0, recordsRead: source === 'tenants' ? 1 : 2,
  });
  assert.equal(diagnostic(tenantId, pathFor(tenantId, 'candidate'), capped).reason, 'incomplete-references');
  const complete = await collectTenantFileReferences({ db, tenantId, pageSize: 2, maxPagesPerSource: 2 });
  assert.equal(complete.complete, true);
  for (const source of collections) assert.equal(complete.sources[source].complete, true);
});

test('reader bounds and invalid page caps fail closed', async t => {
  const f = fixtures(t), { tenantId } = f;
  await f.create('tenants', tenantId, { agencyProfile: {} });
  for (const source of ['tenants', 'planningDispatches', 'sitePlanningDispatches']) {
    for (const pageSize of [0, -1, 251, 1.5, NaN, Infinity]) {
      assert.throws(() => createAgencyReferenceReader(db, tenantId, source, pageSize), /page size/);
    }
    for (const scope of ['', ' t', 't ', '../t', 't\\x', 't\u0000']) {
      assert.throws(() => createAgencyReferenceReader(db, scope, source), /scope/);
    }
    for (const cursor of ['', 'bad/cursor', 'bad\\cursor', 'bad\u0000']) {
      await assert.rejects(createAgencyReferenceReader(db, tenantId, source)(cursor), /cursor/);
    }
    for (const pageSize of [1, 250]) {
      const page = await createAgencyReferenceReader(db, tenantId, source, pageSize)(null);
      assert.equal(page.nextCursor, null);
      assert.equal(page.records.length, source === 'tenants' ? 1 : 0);
    }
  }
  assert.throws(() => createAgencyReferenceReader(db, tenantId, 'agents'), /source/);
  await assert.rejects(createAgencyReferenceReader(db, tenantId, 'tenants')('valid-id'), /cursor/);
  for (const maxPagesPerSource of [0, -1, 1001, 1.5, NaN, Infinity]) {
    const result = await collectTenantFileReferences({ db, tenantId, maxPagesPerSource });
    assert.equal(result.complete, false);
    for (const source of collections) assert.deepEqual(plain(result.sources[source]), {
      complete: false, unresolved: 0, recordsRead: 0,
    });
  }
  for (const pageSize of [0, 251, 1.5]) {
    const result = await collectTenantFileReferences({ db, tenantId, pageSize });
    assert.equal(result.complete, false);
    assert.equal(result.paths.length, 0);
  }
  const result = await collectTenantFileReferences({ db, tenantId, maxPagesPerSource: 1000 });
  assert.equal(result.complete, true);
});
