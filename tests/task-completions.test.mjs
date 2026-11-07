import test from 'node:test';
import assert from 'node:assert/strict';
import { logId, completionRow, completedDay } from '../tasks/completions.js';
import { localDayId } from '../life/dates.js';

test('a completion is one row per task per day, keyed like a habit tick', () => {
    assert.equal(logId('t1', '2026-11-05'), 't1|2026-11-05');
    assert.deepEqual(completionRow('t1', '2026-11-05'), { id: 't1|2026-11-05', taskId: 't1', day: '2026-11-05' });
    assert.equal(completionRow('t1', '2026-11-05').id, completionRow('t1', '2026-11-05').id, 'ticking twice is the same row');
    assert.notEqual(completionRow('t1', '2026-11-05').id, completionRow('t1', '2026-11-06').id, 'a repeating task finished on two days is two rows');
});

test('the day a ticked task was finished is the local day of its doneAt', () => {
    const when = new Date(2026, 10, 5, 23, 30); // 23:30 local: the UTC date may already be the 6th
    assert.equal(completedDay({ doneAt: when.toISOString() }), localDayId(when));
    assert.equal(completedDay({ doneAt: when.toISOString() }), '2026-11-05');
});

test('a task with no usable doneAt has no completion day', () => {
    assert.equal(completedDay({ doneAt: null }), null);
    assert.equal(completedDay({}), null);
    assert.equal(completedDay(null), null);
    assert.equal(completedDay({ doneAt: 'not a date' }), null);
});
