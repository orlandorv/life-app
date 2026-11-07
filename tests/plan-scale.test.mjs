import test from 'node:test';
import assert from 'node:assert/strict';
import { planScale, scaleTargets, scaleFrequency } from '../gym/js/plan-scale.js';

test('five plans over a three-session week is three fifths; a plan no bigger than the week is left alone', () => {
    assert.equal(planScale(5, 3), 3 / 5);
    assert.equal(planScale(3, 3), 1);
    assert.equal(planScale(2, 3), 1, 'never scaled up');
    assert.equal(planScale(4, 4), 1);
    assert.equal(planScale(6, 2), 1 / 3);
});

test('nothing to scale by is a scale of one', () => {
    for (const [plans, week] of [[0, 3], [3, 0], [NaN, 3], [3, NaN], [-1, 3], [undefined, undefined]]) assert.equal(planScale(plans, week), 1, `${plans}/${week}`);
});

test('targets scale to whole sets, and a planned muscle never drops below one', () => {
    const targets = new Map([['Chest', 20], ['Back', 25], ['Biceps', 3], ['Core', 1], ['Calves', 0]]);
    const scaled = scaleTargets(targets, 3 / 5);
    assert.equal(scaled.get('Chest'), 12);
    assert.equal(scaled.get('Back'), 15);
    assert.equal(scaled.get('Biceps'), 2, '1.8 rounds to 2');
    assert.equal(scaled.get('Core'), 1, 'a muscle that is planned keeps at least one set');
    assert.equal(scaled.has('Calves'), false, 'nothing planned stays out');
    for (const sets of scaled.values()) assert.ok(Number.isInteger(sets) && sets >= 1);
});

test('a scale of one gives back the same numbers, as a copy', () => {
    const targets = new Map([['Chest', 20], ['Back', 25]]);
    const same = scaleTargets(targets, 1);
    assert.deepEqual([...same], [...targets]);
    assert.notEqual(same, targets);
    assert.deepEqual([...scaleTargets(targets, 1.4)], [...targets], 'above one is treated as one');
});

test('scaling is proportional: the order of the muscles is kept, and a smaller scale never gives a bigger target', () => {
    const targets = new Map([['A', 30], ['B', 12], ['C', 7], ['D', 2]]);
    let last = scaleTargets(targets, 1);
    for (const scale of [0.9, 0.75, 0.6, 0.5, 0.3, 0.1]) {
        const next = scaleTargets(targets, scale);
        assert.deepEqual([...next.keys()], ['A', 'B', 'C', 'D']);
        for (const [muscle, sets] of next) assert.ok(sets <= last.get(muscle), `${muscle} at ${scale}`);
        last = next;
    }
});

test('how often a muscle is trained scales with the week, and a muscle in two of five plans is not twice a week', () => {
    const frequency = new Map([['Chest', 2], ['Legs', 5]]);
    const scaled = scaleFrequency(frequency, 3 / 5);
    assert.ok(Math.abs(scaled.get('Chest') - 1.2) < 1e-9);
    assert.ok(Math.abs(scaled.get('Legs') - 3) < 1e-9);
    assert.ok(scaled.get('Chest') < 2, 'so it is not asked for twice');
    assert.equal(scaleFrequency(frequency, 1).get('Chest'), 2);
});
