import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceObservations } from '../src/lib/agents/attendance.ts';

const row = {
  startAt: '2026-09-10T16:00:00+02:00', endAt: '2026-09-11T04:00:00+02:00',
  checkedInAt: '2026-09-10T16:00:00+02:00', checkedOutAt: '2026-09-11T04:00:00+02:00', status: 'completed',
};
test('on-time and early entry / late exit produce no requested discrepancy', () => {
  assert.deepEqual(attendanceObservations(row), []);
  assert.deepEqual(attendanceObservations({ ...row, checkedInAt: '2026-09-10T15:00:00+02:00', checkedOutAt: '2026-09-11T05:00:00+02:00' }), []);
});
test('late entry and early exit coexist without changing original timestamps', () => {
  const input = Object.freeze({ ...row, checkedInAt: '2026-09-10T16:31:10+02:00', checkedOutAt: '2026-09-10T16:32:25+02:00' });
  const before = JSON.stringify(input);
  const messages = attendanceObservations(input);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /31 min 10 s de retard/);
  assert.match(messages[1], /11 h 27 min 35 s avant/);
  assert.equal(JSON.stringify(input), before);
});
test('sub-minute discrepancy is explicit, not rounded into a full minute', () => {
  assert.match(attendanceObservations({ ...row, checkedInAt: '2026-09-10T16:00:01+02:00' })[0], /moins d’une minute/);
});
test('missing entry never asserts physical absence; upcoming has no warning', () => {
  const input = { ...row, checkedInAt: null, checkedOutAt: null };
  assert.match(attendanceObservations({ ...input, status: 'not_checked_in' })[0], /ne confirme pas une absence/);
  assert.deepEqual(attendanceObservations({ ...input, status: 'upcoming' }), []);
});
test('missing exit remains visible alongside late entry', () => {
  const messages = attendanceObservations({ ...row, checkedInAt: '2026-09-10T16:01:00+02:00', checkedOutAt: null, status: 'missing_out' });
  assert.equal(messages.length, 2);
  assert.match(messages[1], /sans pointage de sortie/);
});
test('inconsistent data suppress numerical conclusions', () => {
  for (const input of [ { ...row, status: 'inconsistent' }, { ...row, checkedInAt: 'invalid' }, { ...row, checkedInAt: null }, { ...row, checkedOutAt: '2026-09-10T15:00:00+02:00' } ]) {
    const messages = attendanceObservations(input);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /incohérents/);
    assert.doesNotMatch(messages[0], /de retard|avant l’heure/);
  }
});
test('DST repeated hour compares actual instants rather than wall-clock strings', () => {
  const messages = attendanceObservations({ ...row, startAt: '2026-10-25T02:30:00+02:00', endAt: '2026-10-25T04:00:00+01:00', checkedInAt: '2026-10-25T02:30:00+01:00', checkedOutAt: '2026-10-25T04:00:00+01:00' });
  assert.match(messages[0], /1 h de retard/);
});
