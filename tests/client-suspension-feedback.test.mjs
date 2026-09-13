import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/api/client-fetch.ts', import.meta.url), 'utf8');
function client(payload, status = 403) {
  const exports = {};
  const notices = [];
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, Error, Headers, FormData, URLSearchParams, Blob, ArrayBuffer, ReadableStream,
    require: name => { if (name === './suspension-feedback') return { reportSuspensionFeedback: notice => notices.push(notice) }; assert.equal(name, 'firebase/auth'); return { getAuth: () => ({ currentUser: { getIdToken: async () => 'local-test' } }) }; },
    fetch: async () => Response.json(payload, { status }),
  });
  return { ...exports, notices };
}
for (const method of ['apiFetch', 'apiFetchBlob']) {
  for (const [mode, expected] of [['commercial', /consultation seule/], ['security', /sécurité/], [undefined, /sécurité/]]) {
    test(`${method}: suspension ${mode} retains code and explains restriction`, async () => {
      const api = client({ ok: false, error: 'Forbidden', code: 'TENANT_SUSPENDED', suspensionMode: mode });
      await assert.rejects(api[method]('/api/test'), error => {
        assert.equal(error.code, 'TENANT_SUSPENDED');
        assert.equal(error.status, 403);
        assert.match(error.message, expected);
        assert.doesNotMatch(error.message, /avec votre role/);
        return true;
      });
      assert.equal(api.notices.length, 1);
      assert.match(api.notices[0].message, expected);
    });
  }
}
test('ordinary permission and session refusals keep their meanings', async () => {
  await assert.rejects(client({ error: 'Forbidden' }).apiFetch('/api/test'), /avec votre role/);
  await assert.rejects(client({ error: 'Unauthorized' }, 401).apiFetch('/api/test'), /session/);
});
test('successful response is unaffected', async () => {
  assert.deepEqual(await client({ ok: true, id: 'v' }, 200).apiFetch('/api/test'), { ok: true, id: 'v' });
});
// Execute the actual submit handler with UI dependencies replaced by spies.
const sheet = readFileSync(new URL('../src/components/dashboard/planning/CreateVacationSheet.tsx', import.meta.url), 'utf8');
const handler = sheet.slice(sheet.indexOf('  const onSubmit = async'), sheet.indexOf('\n  return (', sheet.indexOf('  const onSubmit = async')));
for (const succeeds of [false, true]) {
  test(`create form ${succeeds ? 'closes after success' : 'catches rejection and preserves form'}`, async () => {
    const notices = [], saving = [], closed = [], resets = [];
    const api = client({});
    const context = {
      setSaving: value => saving.push(value), sites: [],
      createVacation: async () => { if (!succeeds) throw new Error('Agence suspendue'); return 'v'; },
      normalizeDateTimeInput: value => value, toast: value => notices.push(value),
      setCreateOpen: value => closed.push(value), form: { reset: value => resets.push(value) },
      defaultWindow: { startAt: '', endAt: '' }, getApiErrorMessage: api.getApiErrorMessage,
    };
    runInNewContext(ts.transpileModule(handler + '\nglobalThis.submit = onSubmit;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    await context.submit({ siteId: 's', startAt: '', endAt: '' });
    assert.deepEqual(saving, [true, false]);
    assert.equal(notices.length, 1);
    assert.equal(resets.length, succeeds ? 1 : 0);
    assert.deepEqual(closed, succeeds ? [false] : []);
    if (!succeeds) {
      assert.equal(notices[0].variant, 'destructive');
      assert.equal(notices[0].description, 'Agence suspendue');
    }
  });
}
