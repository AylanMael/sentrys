import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the actual form handler without creating an Auth account or sending mail.
const source = readFileSync(new URL('../src/app/dashboard/users/page.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  async function inviteUser(');
const end = source.indexOf('  async function copyInviteLink(', start);
assert.ok(start >= 0 && end > start, 'Invitation handler must be found');
const handler = ts.transpileModule(source.slice(start, end) + '\nglobalThis.submit = inviteUser;', {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(overrides = {}, failure = null) {
  const calls = [], warnings = [], errors = [], saving = [], cleared = [], successes = [];
  let reloads = 0;
  const context = {
    inviteEmail: 'test@example.invalid', inviteName: 'Agent de test', inviteRole: 'agent', inviteAgentId: 'selected-agent',
    editableRoles: ['agent', 'manager', 'viewer'], ...overrides,
    feedback: { warning: (...args) => warnings.push(args), error: (...args) => errors.push(args), success: (...args) => successes.push(args) },
    setInviteSaving: value => saving.push(value), setInviteResult: () => {},
    setInviteEmail: value => cleared.push(['email', value]), setInviteName: value => cleared.push(['name', value]),
    loadUsers: async () => { reloads++; },
    apiFetch: async (url, options) => {
      calls.push({ url, ...JSON.parse(JSON.stringify(options)) });
      if (failure) throw failure;
      return { name: 'Agent de test', roleLabel: 'Agent' };
    },
  };
  runInNewContext(handler, context);
  return { calls, warnings, errors, saving, cleared, successes, reloads: () => reloads, submit: () => context.submit({ preventDefault() {} }) };
}
test('agent invitation sends the selected agentId in POST payload', async () => {
  const f = fixture(); await f.submit();
  assert.deepEqual(f.calls, [{ url: '/api/users', method: 'POST', body: { email: 'test@example.invalid', name: 'Agent de test', role: 'agent', agentId: 'selected-agent' } }]);
  assert.deepEqual(f.saving, [true, false]); assert.equal(f.reloads(), 1);
});
test('non-agent invitation omits a stale selected agentId', async () => {
  const f = fixture({ inviteRole: 'manager' }); await f.submit();
  assert.equal('agentId' in f.calls[0].body, false);
});
for (const overrides of [{ inviteAgentId: '' }, { inviteEmail: ' ' }, { inviteRole: 'owner' }]) {
  test('invalid invitation is blocked before API call: ' + JSON.stringify(overrides), async () => {
    const f = fixture(overrides); await f.submit();
    assert.equal(f.calls.length, 0); assert.equal(f.warnings.length, 1); assert.equal(f.saving.length, 0);
  });
}
test('server refusal preserves the form and ends saving without reporting success', async () => {
  const f = fixture({}, new Error('Agent already linked')); await f.submit();
  assert.deepEqual(f.saving, [true, false]); assert.equal(f.errors.length, 1);
  assert.equal(f.cleared.length, 0); assert.equal(f.successes.length, 0); assert.equal(f.reloads(), 0);
});
