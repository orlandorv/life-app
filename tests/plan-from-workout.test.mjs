import test from 'node:test';
import assert from 'node:assert/strict';
import { planFromWorkout } from '../gym/js/plan-from-workout.js';

const set = (reps, rir = 2, extra = {}) => ({ weightKg: 60, reps, rir, done: true, ...extra });
const entry = (exerciseId, sets, extra = {}) => ({ exerciseId, restSeconds: 150, sets, ...extra });
const workout = (entries, name = 'Quick Workout') => ({ name, entries });

test('every exercise comes across, in the order it was done, with its numbers', () => {
    const plan = planFromWorkout(
        workout([
            entry('bench', [set(6), set(6), set(5), set(5)], { targetReps: 6, targetRir: 2, restSeconds: 180 }),
            entry('row', [set(10, 1), set(10, 1), set(9, 1)], { targetReps: 10, targetRir: 1, restSeconds: 120 }),
        ]),
    );
    assert.deepEqual(plan.exercises, [
        { exerciseId: 'bench', sets: 4, reps: 6, restSeconds: 180, rir: 2 },
        { exerciseId: 'row', sets: 3, reps: 10, restSeconds: 120, rir: 1 },
    ]);
});

test('the sets are the working sets you logged: warm-ups are not part of a plan', () => {
    const plan = planFromWorkout(workout([entry('squat', [set(8, 5, { warmup: true }), set(5, 5, { warmup: true }), set(5), set(5), set(5)], { targetReps: 5 })]));
    assert.equal(plan.exercises[0].sets, 3);
});

test('the rep target is what it was held to, else the most reps you did', () => {
    assert.equal(planFromWorkout(workout([entry('a', [set(8), set(6)], { targetReps: 10 })])).exercises[0].reps, 10);
    assert.equal(planFromWorkout(workout([entry('a', [set(8), set(11), set(9)])])).exercises[0].reps, 11, 'older entries have no target');
});

test('the RIR target is what it was held to, else the one you most often logged, else 2', () => {
    assert.equal(planFromWorkout(workout([entry('a', [set(8, 3)], { targetReps: 8, targetRir: 0 })])).exercises[0].rir, 0, 'zero is a real target');
    assert.equal(planFromWorkout(workout([entry('a', [set(8, 1), set(8, 2), set(8, 2)])])).exercises[0].rir, 2);
    assert.equal(planFromWorkout(workout([entry('a', [set(8, 1), set(8, 2)])])).exercises[0].rir, 1, 'a tie goes to the lower');
    assert.equal(planFromWorkout(workout([entry('a', [{ weightKg: 50, reps: 8, done: true }])])).exercises[0].rir, 2);
});

test('rest is kept within the two to three minutes the app allows', () => {
    assert.equal(planFromWorkout(workout([entry('a', [set(8)], { restSeconds: 45 })])).exercises[0].restSeconds, 120);
    assert.equal(planFromWorkout(workout([entry('a', [set(8)], { restSeconds: 600 })])).exercises[0].restSeconds, 180);
    assert.equal(planFromWorkout(workout([entry('a', [set(8)], { restSeconds: undefined })])).exercises[0].restSeconds, 120);
});

test('an exercise with no working sets is left out, and so is one no longer in the library', () => {
    const plan = planFromWorkout(
        workout([
            entry('skipped', [], { note: 'knee twinged' }),
            entry('warmups-only', [set(10, 5, { warmup: true })]),
            entry('gone', [set(8)]),
            entry('kept', [set(8)]),
        ]),
        (id) => id !== 'gone',
    );
    assert.deepEqual(plan.exercises.map((e) => e.exerciseId), ['kept']);
});

test('nothing to make a plan from is null, not an empty plan', () => {
    assert.equal(planFromWorkout(workout([])), null);
    assert.equal(planFromWorkout(workout([entry('a', [])])), null);
    assert.equal(planFromWorkout({ name: 'x' }), null);
    assert.equal(planFromWorkout(workout([entry('gone', [set(8)])]), () => false), null);
});

test('a named workout keeps its name; a quick one is left for you to name', () => {
    const entries = [entry('a', [set(8)])];
    assert.equal(planFromWorkout(workout(entries, 'Push Day')).name, 'Push Day');
    assert.equal(planFromWorkout(workout(entries, 'Quick Workout')).name, '');
});

test('it never has fewer than one rep, and the original is not touched', () => {
    const w = workout([entry('a', [set(0)])]);
    const copy = JSON.stringify(w);
    assert.equal(planFromWorkout(w).exercises[0].reps, 1);
    assert.equal(JSON.stringify(w), copy);
});
