import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAttendanceRows } from '../src/lib/agents/attendance-filters.ts';

const base = { agentName: 'Élodie Martin', siteName: 'École République', startAt: '2026-09-13T08:00:00Z', endAt: '2026-09-13T18:00:00Z', checkedInAt: null, checkedOutAt: null };
const rows = [
  { ...base, id: 'upcoming', status: 'upcoming' },
  { ...base, id: 'missing', status: 'not_checked_in' },
  { ...base, id: 'present', status: 'on_duty', checkedInAt: base.startAt },
  { ...base, id: 'exit', status: 'missing_out', checkedInAt: base.startAt },
  { ...base, id: 'invalid', status: 'inconsistent' },
  { ...base, id: 'done', status: 'completed', checkedInAt: base.startAt, checkedOutAt: base.endAt },
  { ...base, id: 'late', status: 'completed', checkedInAt: '2026-09-13T08:05:00Z', checkedOutAt: base.endAt },
  { ...base, id: 'early', status: 'completed', checkedInAt: base.startAt, checkedOutAt: '2026-09-13T17:00:00Z' },
];
const ids = (filter, agent = '', site = '', source = rows) => filterAttendanceRows(source, filter, agent, site).map(r => r.id);
test('all preserves every loaded row and order', () => assert.deepEqual(ids('all'), rows.map(r => r.id)));
for (const [filter, expected] of [['not_checked_in', ['missing']], ['on_duty', ['present']], ['missing_out', ['exit']], ['attention', ['missing', 'exit', 'invalid', 'late', 'early']]]) {
  test('situation filter ' + filter, () => assert.deepEqual(ids(filter), expected));
}
test('agent and site searches combine with situation, accents and surrounding spaces ignored', () => {
  assert.deepEqual(ids('missing_out', ' ELODIE ', 'republique'), ['exit']);
  assert.deepEqual(ids('missing_out', 'someone else', 'republique'), []);
  assert.deepEqual(ids('missing_out', 'elodie', 'another site'), []);
});
test('empty loaded page and appended pages do not fabricate matches', () => {
  assert.deepEqual(ids('attention', '', '', []), []);
  assert.deepEqual(ids('attention', '', '', rows.slice(0, 1)), []);
  assert.deepEqual(ids('attention', '', '', rows.slice(0, 2)), ['missing']);
});
test('filtering is non-mutating and reset restores loaded rows', () => {
  const original = JSON.stringify(rows);
  ids('attention', 'elodie', 'ecole');
  assert.equal(JSON.stringify(rows), original);
  assert.equal(ids('all').length, rows.length);
});
