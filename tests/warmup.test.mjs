import test from 'node:test';
import assert from 'node:assert/strict';
import { rampFor, RAMPS } from '../gym/js/warmup.js';
import { platesPerSide } from '../gym/js/plate-math.js';
import { fromDisplay, toDisplay } from '../gym/js/units.js';

const LIFTS = {
    bench: { exerciseId: 'barbell-bench-press', exerciseName: 'Barbell Bench Press', muscleGroup: 'Chest', equipment: 'Barbell' },
    squat: { exerciseId: 'barbell-back-squat', exerciseName: 'Barbell Back Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
    pulldown: { exerciseId: 'wide-grip-lat-pulldown', exerciseName: 'Wide-Grip Lat Pulldown', muscleGroup: 'Back', equipment: 'Cable Machine' },
    legPress: { exerciseId: 'machine-leg-press', exerciseName: 'Leg Press', muscleGroup: 'Legs', equipment: 'Machine' },
    pushdown: { exerciseId: 'rope-triceps-pressdown', exerciseName: 'Rope Triceps Pressdown', muscleGroup: 'Triceps', equipment: 'Cable Machine' },
    lateral: { exerciseId: 'dumbbell-lateral-raise', exerciseName: 'Dumbbell Lateral Raise', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
    pullUp: { exerciseId: 'bodyweight-pull-up', exerciseName: 'Pull-ups', muscleGroup: 'Back', equipment: 'Bodyweight' },
    assisted: { exerciseId: 'assisted-pull-up-machine', exerciseName: 'Assisted Pull-Up Machine', muscleGroup: 'Back', equipment: 'Machine' },
};

const ramp = (lift, workingKg, extra = {}) => rampFor({ entry: LIFTS[lift], workingKg, unit: extra.unit ?? 'kg', bar: extra.bar ?? 20 });
const weights = (r) => r.map((s) => s.weightKg);
const reps = (r) => r.map((s) => s.reps);

test('a main lift ramps 40 / 60 / 80% in three sets, reps falling', () => {
    const r = ramp('bench', 100);
    assert.deepEqual(weights(r), [40, 60, 80]);
    assert.deepEqual(reps(r), [8, 5, 3]);
    assert.deepEqual(r.map((s) => s.reps), RAMPS.main.map((s) => s.reps));
});

test('a secondary lift gets two sets, an isolation lift one', () => {
    assert.deepEqual(weights(ramp('legPress', 160)), [80, 120]);
    assert.deepEqual(reps(ramp('legPress', 160)), [8, 5]);
    assert.deepEqual(weights(ramp('pushdown', 30)), [17.5]); // 18 -> nearest 1.25
    assert.deepEqual(reps(ramp('pushdown', 30)), [10]);
});

test('on a barbell every weight is something the plates can build', () => {
    // 102.5 kg: 41 -> 40, 61.5 -> 62.5, 82 -> 82.5 on a 20 kg bar
    assert.deepEqual(weights(ramp('bench', 102.5)), [40, 62.5, 82.5]);
    for (const w of weights(ramp('squat', 143.75))) assert.equal(platesPerSide(w, 20, 'kg').exact, true, `${w} is not loadable`);
});

test('a lighter bar changes the rounding', () => {
    assert.deepEqual(weights(ramp('bench', 100, { bar: 15 })), [40, 60, 80]);
    // On a 15 kg bar the loadable weights are 15 + 2.5n: 42 -> 42.5, 63 -> 62.5, 84 -> 85.
    assert.deepEqual(weights(ramp('bench', 105, { bar: 15 })), [42.5, 62.5, 85]);
});

test('never lighter than the bar, and no repeated weights', () => {
    // 30 kg on a 20 kg bar: 12 -> bar, 18 -> bar, 24 -> 25. Two sets, not three.
    const r = ramp('bench', 30);
    assert.deepEqual(weights(r), [20, 25]);
    assert.deepEqual(reps(r), [8, 3]);
});

test('nothing to ramp to when the working set is at or under the bar', () => {
    assert.deepEqual(ramp('bench', 20), []);
    assert.deepEqual(ramp('bench', 15), []);
    // 22.5 kg: only the bar is lighter, so one set (40/60/80% all round to the bar).
    assert.deepEqual(weights(ramp('bench', 22.5)), [20]);
});

test('no weight yet, assisted lifts and bodyweight lifts get no ramp', () => {
    assert.deepEqual(ramp('bench', 0), []);
    assert.deepEqual(rampFor({ entry: LIFTS.bench, workingKg: Number.NaN }), []);
    assert.deepEqual(ramp('assisted', 40), []);
    assert.deepEqual(ramp('pullUp', 10), []);
    assert.deepEqual(rampFor({ entry: null, workingKg: 100 }), []);
});

test('pounds are rounded in pounds and stored as kg', () => {
    const r = ramp('bench', fromDisplay(225, 'lb'), { unit: 'lb', bar: 45 });
    assert.deepEqual(r.map((s) => toDisplay(s.weightKg, 'lb')), [90, 135, 180]);
    // a machine rounds to 2.5 lb
    const m = ramp('legPress', fromDisplay(300, 'lb'), { unit: 'lb' });
    assert.deepEqual(m.map((s) => toDisplay(s.weightKg, 'lb')), [150, 225]);
});

test('any working weight gives a clean ramp (fuzz)', () => {
    let state = 4242;
    const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (const unit of ['kg', 'lb']) {
        const bar = unit === 'kg' ? 20 : 45;
        for (const lift of ['bench', 'squat', 'pulldown', 'legPress', 'pushdown', 'lateral']) {
            for (let i = 0; i < 400; i += 1) {
                const working = toDisplay(fromDisplay(rand() * 320, unit), unit);
                const workingKg = fromDisplay(working, unit);
                const r = rampFor({ entry: LIFTS[lift], workingKg, unit, bar });
                const shown = r.map((s) => toDisplay(s.weightKg, unit));
                assert.ok(r.length <= 3);
                shown.forEach((w, k) => {
                    assert.ok(w > 0 && w < working, `${lift} ${working}: ${w} not below working`);
                    if (k > 0) assert.ok(w > shown[k - 1], `${lift} ${working}: ramp not increasing ${shown}`);
                    if (LIFTS[lift].equipment === 'Barbell') {
                        assert.ok(w >= bar, `${lift} ${working}: ${w} under the bar`);
                        assert.equal(platesPerSide(w, bar, unit).exact, true, `${lift} ${working}: ${w} ${unit} not loadable`);
                    }
                });
                r.forEach((s) => assert.ok(s.reps >= 1));
            }
        }
    }
});
