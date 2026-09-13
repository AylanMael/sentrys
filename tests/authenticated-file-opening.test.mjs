import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/api/client-fetch.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture({ blocked = false, status = 200, networkFailure = false, signedIn = true, closed = false, navigationFailure = false } = {}) {
  const events = [], timers = [], revoked = [];
  const preview = {
    closed, opener: 'parent', document: { title: '', body: { textContent: '' } },
    location: { replace(url) { if (navigationFailure) throw new Error('navigation failed'); events.push(['navigate', url]); } },
    close() { this.closed = true; events.push(['close']); },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports, Headers, Blob, FormData, URLSearchParams, ArrayBuffer, ReadableStream,
    URL: { createObjectURL() { events.push(['blob']); return 'blob:test'; }, revokeObjectURL(url) { revoked.push(url); } },
    window: { open(...args) { events.push(['open', ...args]); return blocked ? null : preview; }, setTimeout(fn) { timers.push(fn); } },
    fetch: async (url, options) => {
      events.push(['fetch', url]);
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(options.cache, 'no-store');
      assert.equal(preview.opener, null);
      if (networkFailure) throw new Error('Failed to fetch');
      return status === 200 ? new Response('test file') : Response.json({ error: 'Forbidden' }, { status });
    },
    require(name) {
      if (name === 'firebase/auth') return { getAuth: () => ({ currentUser: signedIn ? { getIdToken: async () => { events.push(['token']); return 'test-token'; } } : null }) };
      assert.equal(name, './suspension-feedback');
      return { reportSuspensionFeedback() {} };
    },
  });
  return { open: () => exports.openAuthenticatedFile('/api/agents/test/files/test'), events, preview, timers, revoked };
}

test('reserves a detached tab before authentication and fetch, then releases the blob', async () => {
  const f = fixture();
  await f.open();
  assert.deepEqual(f.events.map(e => e[0]), ['open', 'token', 'fetch', 'blob', 'navigate']);
  assert.deepEqual(f.events[0], ['open', 'about:blank', '_blank']);
  assert.equal(f.preview.opener, null);
  assert.equal(f.revoked.length, 0);
  f.timers[0]();
  assert.deepEqual(f.revoked, ['blob:test']);
});
test('blocked tab gives an actionable error without fetching private bytes', async () => {
  const f = fixture({ blocked: true });
  await assert.rejects(f.open(), e => e.code === 'FILE_WINDOW_BLOCKED' && /Autorisez/.test(e.message));
  assert.deepEqual(f.events.map(e => e[0]), ['open']);
});
for (const status of [403, 404]) test(`HTTP ${status} closes the empty tab and preserves the API error`, async () => {
  const f = fixture({ status });
  await assert.rejects(f.open(), e => e.status === status);
  assert.equal(f.preview.closed, true);
  assert.equal(f.events.some(e => e[0] === 'blob'), false);
});
test('offline failure closes the waiting tab with a friendly message', async () => {
  const f = fixture({ networkFailure: true });
  await assert.rejects(f.open(), e => e.code === 'FILE_OPEN_FAILED' && /connexion/.test(e.message));
  assert.equal(f.preview.closed, true);
});
test('signed out access closes the waiting tab without fetching', async () => {
  const f = fixture({ signedIn: false });
  await assert.rejects(f.open(), e => e.status === 401);
  assert.deepEqual(f.events.map(e => e[0]), ['open', 'close']);
});
test('a waiting tab closed by the user is not reopened', async () => {
  const f = fixture({ closed: true });
  await f.open();
  assert.equal(f.events.filter(e => e[0] === 'open').length, 1);
  assert.equal(f.events.some(e => e[0] === 'blob'), false);
});
test('navigation failure revokes allocated bytes and closes the blank tab', async () => {
  const f = fixture({ navigationFailure: true });
  await assert.rejects(f.open(), e => e.code === 'FILE_OPEN_FAILED');
  assert.deepEqual(f.revoked, ['blob:test']);
  assert.equal(f.preview.closed, true);
});
