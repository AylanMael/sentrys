import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../scripts/migrate-agent-file-tokens.cjs', import.meta.url), 'utf8');
const photoPath = 'tenants/t/agents/a/photo/photo.png';
const documentPath = 'tenants/t/agents/a/documents/private.pdf';
const storageUrl = path => `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(path)}?alt=media&token=old`;
const plain = value => JSON.parse(JSON.stringify(value));

async function execute({ repair = true, updateTime = { seconds: 10, nanoseconds: 123 }, concurrentProfile } = {}) {
  const initial = {
    tenantId: 't',
    profile: {
      displayName: 'Initial name',
      photoUrl: storageUrl(photoPath),
      documents: [{ id: 'file', name: 'Private', url: storageUrl(documentPath) }],
    },
  };
  let current = structuredClone(initial);
  let currentUpdateTime = updateTime;
  const updates = [];
  const storageReads = [];
  const storageWrites = [];
  const logs = [];
  const errors = [];
  const fakeProcess = { argv: ['node', 'migration.cjs', ...(repair ? ['--repair'] : [])], env: {}, cwd: () => '/mock', exitCode: 0 };
  const snapshot = {
    id: 'a',
    updateTime,
    data: () => structuredClone(initial),
    ref: {
      async update(data, precondition) {
        updates.push({ data, precondition });
        // Model Firestore's atomic version check. An unguarded write would succeed,
        // making the concurrency assertions fail if the protection is removed.
        if (precondition?.lastUpdateTime && precondition.lastUpdateTime !== currentUpdateTime) {
          throw new Error('FAILED_PRECONDITION: document changed');
        }
        current = { ...current, ...plain(data) };
      },
    },
  };
  const mocks = {
    'node:path': { join: (...parts) => parts.join('/') },
    dotenv: { config: () => ({}) },
    'firebase-admin/app': {
      getApps: () => [{}],
      initializeApp: () => { throw new Error('Unexpected initialization'); },
      cert: () => { throw new Error('Unexpected credentials'); },
    },
    'firebase-admin/firestore': {
      FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
      getFirestore: () => ({
        collection: name => {
          assert.equal(name, 'agents');
          return { get: async () => ({ size: 1, docs: [snapshot] }) };
        },
      }),
    },
    'firebase-admin/storage': {
      getStorage: () => ({
        bucket: bucket => {
          assert.equal(bucket, 'test-bucket');
          return {
            file: path => ({
              getMetadata: async () => {
                storageReads.push(path);
                return [{ metadata: { firebaseStorageDownloadTokens: 'old', retained: 'value' } }];
              },
              setMetadata: async metadata => {
                storageWrites.push({ path, metadata: plain(metadata) });
                if (concurrentProfile) {
                  current.profile = structuredClone(concurrentProfile);
                  currentUpdateTime = { seconds: 11, nanoseconds: 456 };
                }
              },
            }),
          };
        },
      }),
    },
  };
  // Only these mocks are available: no real require, dotenv, Admin SDK or network.
  await runInNewContext(source, {
    URL,
    Error,
    process: fakeProcess,
    console: { log: value => logs.push(JSON.parse(value)), error: (...args) => errors.push(args) },
    require: name => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected module: ${name}`);
      return mocks[name];
    },
  }, { timeout: 1000 });
  assert.deepEqual(errors, []);
  return { initial, current, updates, storageReads, storageWrites, report: logs.at(-1), exitCode: fakeProcess.exitCode, updateTime };
}

test('repair refuses a stale snapshot and preserves concurrent profile edits and removals', async () => {
  const concurrentProfile = { displayName: 'Edited name', documents: [], newlyAdded: true };
  const result = await execute({ concurrentProfile });
  assert.deepEqual(result.current.profile, concurrentProfile);
  assert.equal(result.current.migration, undefined);
  assert.equal(result.current.updatedAt, undefined);
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].precondition.lastUpdateTime, result.updateTime);
  assert.equal(result.storageWrites.length, 2);
  assert.equal(result.report.revokedTokens, 2);
  assert.equal(result.report.repairedAgents, 0);
  assert.equal(result.report.errors.length, 1);
  assert.match(result.report.errors[0].error, /FAILED_PRECONDITION/);
  assert.equal(result.exitCode, 1);
});

test('repair migrates URLs with the original snapshot precondition and preserves metadata', async () => {
  const result = await execute();
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].precondition.lastUpdateTime, result.updateTime);
  assert.deepEqual(result.current.profile, {
    displayName: 'Initial name', photoPath,
    documents: [{ id: 'file', name: 'Private', path: documentPath }],
  });
  assert.deepEqual(result.current.migration, { agentFilesPrivateAt: 'SERVER_TIMESTAMP', agentFilesPrivateVersion: 1 });
  assert.equal(result.current.updatedAt, 'SERVER_TIMESTAMP');
  assert.deepEqual(result.storageWrites, [photoPath, documentPath].map(path => ({
    path, metadata: { cacheControl: 'private, no-store, max-age=0', metadata: { retained: 'value' } },
  })));
  assert.equal(result.report.repairedAgents, 1);
  assert.equal(result.report.revokedTokens, 2);
  assert.deepEqual(result.report.errors, []);
  assert.equal(result.exitCode, 0);
});

test('repair refuses an unavailable snapshot updateTime before any writes', async () => {
  const result = await execute({ updateTime: null });
  assert.deepEqual(result.current, result.initial);
  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.storageReads, []);
  assert.deepEqual(result.storageWrites, []);
  assert.equal(result.report.repairedAgents, 0);
  assert.equal(result.report.revokedTokens, 0);
  assert.match(result.report.errors[0].error, /snapshot updateTime is unavailable/);
  assert.equal(result.exitCode, 1);
});

test('audit reports affected files without Firestore or Storage writes even without updateTime', async () => {
  const result = await execute({ repair: false, updateTime: null });
  assert.deepEqual(result.current, result.initial);
  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.storageReads, []);
  assert.deepEqual(result.storageWrites, []);
  assert.equal(result.report.mode, 'audit');
  assert.equal(result.report.affectedAgents, 1);
  assert.equal(result.report.affectedFiles, 2);
  assert.equal(result.report.repairedAgents, 0);
  assert.equal(result.report.revokedTokens, 0);
  assert.deepEqual(result.report.errors, []);
  assert.equal(result.exitCode, 0);
});
