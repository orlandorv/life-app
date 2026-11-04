import test from 'node:test';
import assert from 'node:assert/strict';
import { entryMetBar } from '../gym/js/progression.js';

// --- The code this replaced, verbatim ---------------------------------------
// Kept here as the reference the shared rule must agree with. XP, levels and the
// live "ready to progress" badge were all computed by these two before they
// became one function; if they ever disagree with entryMetBar, a lifter's XP or
// badge has changed and that has to be a decision, not an accident.

const isWorkingSet = (set) => Boolean(set.done) && !set.warmup;

// was progressionCount()'s per-entry test in gym/js/progress.js
function referenceXp(entry) {
    const working = (entry.sets || []).filter(isWorkingSet);
    if (!working.length || !Number.isFinite(entry.targetReps)) return false;
    const targetRir = entry.targetRir ?? 0;
    return working.every((set) => set.reps >= entry.targetReps && (set.rir ?? 0) >= targetRir);
}

// was isReadyToProgress() in gym/js/workout.js
function referenceLive(entry) {
    const working = entry.sets.filter((s) => !s.warmup);
    if (!working.length || !Number.isFinite(entry.targetReps)) return false;
    return working.every((s) => s.done && s.reps >= entry.targetReps && s.rir >= (entry.targetRir ?? 0));
}

// --- A small deterministic generator, so a failure can be reproduced ----------

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomEntry(rand) {
    const pick = (list) => list[Math.floor(rand() * list.length)];
    // Mostly realistic values, with the awkward ones that real saved data has had:
    // missing, null, NaN, a string, a number a unit away from the target.
    const number = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    const odd = () => pick([undefined, null, Number.NaN, '', '2', 'x']);
    const maybe = (value, chance = 0.12) => (rand() < chance ? odd() : value);

    const targetReps = maybe(pick([3, 4, 5, 6, 8, 10, 12, 15, 20]), 0.08);
    const targetRir = maybe(number(0, 3), 0.15);
    const setCount = number(0, 6);
    const sets = Array.from({ length: setCount }, () => ({
        reps: maybe(Number.isFinite(targetReps) ? targetReps + number(-3, 3) : number(1, 15), 0.08),
        weightKg: number(0, 140),
        rir: maybe(Number.isFinite(targetRir) ? targetRir + number(-2, 2) : number(0, 3), 0.15),
        done: pick([true, true, true, false, undefined, 1, 0, null]),
        warmup: pick([undefined, undefined, undefined, false, true]),
    }));
    const entry = { exerciseId: 'x', sets };
    if (targetReps !== undefined || rand() < 0.5) entry.targetReps = targetReps;
    if (targetRir !== undefined || rand() < 0.5) entry.targetRir = targetRir;
    return entry;
}

test('a saved workout is judged exactly as XP always judged it (fuzz)', () => {
    const rand = mulberry32(20260104);
    let yes = 0;
    let no = 0;
    for (let i = 0; i < 50000; i += 1) {
        const entry = randomEntry(rand);
        const expected = referenceXp(entry);
        assert.equal(entryMetBar(entry), expected, `entry ${i}: ${JSON.stringify(entry)}`);
        if (expected) yes += 1;
        else no += 1;
    }
    // Not vacuous: plenty of both outcomes were actually compared.
    assert.ok(yes > 2000, `only ${yes} passing cases`);
    assert.ok(no > 2000, `only ${no} failing cases`);
});

test('an open workout is judged exactly as the live badge always judged it (fuzz)', () => {
    const rand = mulberry32(77031);
    let yes = 0;
    let no = 0;
    for (let i = 0; i < 50000; i += 1) {
        const entry = randomEntry(rand);
        const expected = referenceLive(entry);
        assert.equal(entryMetBar(entry, { live: true }), expected, `entry ${i}: ${JSON.stringify(entry)}`);
        if (expected) yes += 1;
        else no += 1;
    }
    assert.ok(yes > 1000, `only ${yes} passing cases`);
    assert.ok(no > 2000, `only ${no} failing cases`);
});

test('XP counts the same exercises across a whole workout', () => {
    const rand = mulberry32(5150);
    for (let w = 0; w < 2000; w += 1) {
        const entries = Array.from({ length: Math.floor(rand() * 8) }, () => randomEntry(rand));
        const before = entries.filter(referenceXp).length;
        const after = entries.filter((entry) => entryMetBar(entry)).length;
        assert.equal(after, before);
    }
});

const entry = (overrides = {}) => ({
    targetReps: 8,
    targetRir: 1,
    sets: [
        { reps: 8, rir: 1, done: true },
        { reps: 9, rir: 2, done: true },
        { reps: 8, rir: 1, done: true },
    ],
    ...overrides,
});

test('every set at the target reps with the target RIR left meets the bar', () => {
    assert.equal(entryMetBar(entry()), true);
    assert.equal(entryMetBar(entry(), { live: true }), true);
});

test('one short set, or one set ground out too close to failure, does not', () => {
    const short = entry({ sets: [{ reps: 8, rir: 1, done: true }, { reps: 7, rir: 1, done: true }] });
    const ground = entry({ sets: [{ reps: 8, rir: 1, done: true }, { reps: 8, rir: 0, done: true }] });
    for (const e of [short, ground]) {
        assert.equal(entryMetBar(e), false);
        assert.equal(entryMetBar(e, { live: true }), false);
    }
});

test('warm-up sets are ignored in both modes', () => {
    const e = entry({ sets: [{ reps: 5, rir: 4, done: true, warmup: true }, { reps: 8, rir: 1, done: true }] });
    assert.equal(entryMetBar(e), true);
    assert.equal(entryMetBar(e, { live: true }), true);
});

test('no numeric target reps, or no working sets, never meets it', () => {
    assert.equal(entryMetBar(entry({ targetReps: undefined })), false);
    assert.equal(entryMetBar(entry({ targetReps: null })), false);
    assert.equal(entryMetBar(entry({ sets: [] })), false);
    assert.equal(entryMetBar(entry({ sets: [{ reps: 8, rir: 1, done: true, warmup: true }] })), false);
});

test('the two modes differ exactly where they always did', () => {
    // An unticked set: a saved workout simply doesn't contain one (and the others
    // count); an open workout isn't ready until every set is ticked.
    const unticked = entry({ sets: [{ reps: 8, rir: 1, done: true }, { reps: 8, rir: 1, done: false }] });
    assert.equal(entryMetBar(unticked), true);
    assert.equal(entryMetBar(unticked, { live: true }), false);

    // A set with no RIR recorded: counts as 0 left for a saved workout (so it
    // clears a target of 0 only), and fails outright for an open one.
    const noRir = (targetRir) => entry({ targetRir, sets: [{ reps: 8, done: true }] });
    assert.equal(entryMetBar(noRir(0)), true);
    assert.equal(entryMetBar(noRir(1)), false);
    assert.equal(entryMetBar(noRir(0), { live: true }), false);
});

test('a missing target RIR means 0', () => {
    const e = entry({ targetRir: undefined, sets: [{ reps: 8, rir: 0, done: true }] });
    assert.equal(entryMetBar(e), true);
    assert.equal(entryMetBar(e, { live: true }), true);
});
