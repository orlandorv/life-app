import test from 'node:test';
import assert from 'node:assert/strict';
import {
    entryMetBar,
    suggestNext,
    suggestionText,
    suggestionStillUseful,
    shiftToTop,
    STALE_AFTER_DAYS,
    DELOAD_FACTOR,
} from '../gym/js/progression.js';
import { fromDisplay } from '../gym/js/units.js';

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

// --- suggestNext ------------------------------------------------------------------

const NOW = new Date('2026-03-10T12:00:00Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * 86400000).toISOString();

const LIFTS = {
    bench: { exerciseId: 'barbell-bench-press', exerciseName: 'Barbell Bench Press', muscleGroup: 'Chest', equipment: 'Barbell' },
    squat: { exerciseId: 'barbell-back-squat', exerciseName: 'Barbell Back Squat', muscleGroup: 'Legs', equipment: 'Barbell' },
    legPress: { exerciseId: 'machine-leg-press', exerciseName: 'Leg Press', muscleGroup: 'Legs', equipment: 'Machine' },
    pulldown: { exerciseId: 'wide-grip-lat-pulldown', exerciseName: 'Wide-Grip Lat Pulldown', muscleGroup: 'Back', equipment: 'Cable Machine' },
    pushdown: { exerciseId: 'rope-triceps-pressdown', exerciseName: 'Rope Triceps Pressdown', muscleGroup: 'Triceps', equipment: 'Cable Machine' },
    lateral: { exerciseId: 'dumbbell-lateral-raise', exerciseName: 'Dumbbell Lateral Raise', muscleGroup: 'Shoulders', equipment: 'Dumbbell' },
    pullUp: { exerciseId: 'bodyweight-pull-up', exerciseName: 'Pull-ups', muscleGroup: 'Back', equipment: 'Bodyweight' },
    assisted: { exerciseId: 'assisted-pull-up-machine', exerciseName: 'Assisted Pull-Up Machine', muscleGroup: 'Back', equipment: 'Machine' },
};

// The entry being started now.
const now = (lift, extra = {}) => ({ ...LIFTS[lift], targetReps: 6, targetRir: 2, targetSets: 4, ...extra });

// A finished workout with one entry of `lift`. Defaults to a session that clears
// the bar: four sets of 6 with 2 left, at 60 kg.
function workout(lift, { ago = 3, weights = [60, 60, 60, 60], reps = 6, rir = 2, targetReps = 6, targetRir = 2, targetSets = 4, entry = {} } = {}) {
    return {
        id: `w-${lift}-${ago}-${weights.join('_')}-${reps}`,
        startedAt: daysAgo(ago),
        finishedAt: daysAgo(ago),
        entries: [
            {
                ...LIFTS[lift],
                targetReps,
                targetRir,
                targetSets,
                sets: weights.map((weightKg) => ({ weightKg, reps, rir, done: true })),
                ...entry,
            },
        ],
    };
}

const suggest = (lift, history, extra = {}) =>
    suggestNext({ entry: now(lift, extra.entry), history, unit: extra.unit ?? 'kg', bar: extra.bar ?? 20, now: NOW });

test('met the bar over every set: add a step', () => {
    const result = suggest('bench', [workout('bench')]);
    assert.equal(result.kind, 'progress');
    assert.equal(result.fromKg, 60);
    assert.equal(result.toKg, 62.5);
    assert.equal(result.reps, 6);
});

test('the step depends on the lift', () => {
    // main lower body: two coarse steps
    assert.equal(suggest('squat', [workout('squat', { weights: [100, 100, 100, 100] })]).toKg, 105);
    // main upper body and secondary: one coarse step
    assert.equal(suggest('bench', [workout('bench', { weights: [80, 80, 80, 80] })]).toKg, 82.5);
    assert.equal(suggest('pulldown', [workout('pulldown', { weights: [50, 50, 50, 50] })]).toKg, 52.5);
    assert.equal(suggest('legPress', [workout('legPress', { weights: [160, 160, 160, 160] })]).toKg, 162.5);
    // isolation: a fine step, but dumbbells only come in coarse ones
    assert.equal(suggest('pushdown', [workout('pushdown', { weights: [25, 25, 25, 25] })]).toKg, 26.25);
    assert.equal(suggest('lateral', [workout('lateral', { weights: [10, 10, 10, 10] })]).toKg, 12.5);
});

test('it goes by the heaviest set of the last session', () => {
    const result = suggest('bench', [workout('bench', { weights: [57.5, 60, 62.5, 62.5] })]);
    assert.equal(result.fromKg, 62.5);
    assert.equal(result.toKg, 65);
});

test('a barbell is rounded to a weight the plates can build', () => {
    // 61 kg isn't loadable on a 20 kg bar; 63.5 rounds to 62.5, which is still a step up.
    assert.equal(suggest('bench', [workout('bench', { weights: [61, 61, 61, 61] })]).toKg, 62.5);
    // A fine step on a bar would round back to where it started, so it goes to the next loadable weight.
    const curl = { exerciseId: 'ez-bar-curl', exerciseName: 'EZ-Bar Curl', muscleGroup: 'Biceps', equipment: 'Barbell' };
    const history = [{ startedAt: daysAgo(2), entries: [{ ...curl, targetReps: 6, targetRir: 2, targetSets: 4, sets: [30, 30, 30, 30].map((w) => ({ weightKg: w, reps: 6, rir: 2, done: true })) }] }];
    const result = suggestNext({ entry: { ...curl, targetReps: 6, targetRir: 2, targetSets: 4 }, history, unit: 'kg', bar: 20, now: NOW });
    assert.equal(result.toKg, 32.5);
});

test('a lighter bar changes what is loadable', () => {
    // On a 15 kg bar the loadable weights are 15 + 2.5n. 62.5 is one of them.
    const result = suggest('bench', [workout('bench', { weights: [60, 60, 60, 60] })], { bar: 15 });
    assert.equal(result.toKg, 62.5);
    const odd = suggest('bench', [workout('bench', { weights: [61, 61, 61, 61] })], { bar: 15 });
    // (63.5 - 15) / 2.5 = 19.4 -> 19 -> 62.5
    assert.equal(odd.toKg, 62.5);
});

test('pounds: coarse steps of 5, stored as kg', () => {
    const kg135 = fromDisplay(135, 'lb');
    const result = suggest('bench', [workout('bench', { weights: [kg135, kg135, kg135, kg135] })], { unit: 'lb', bar: 45 });
    assert.equal(result.unit, 'lb');
    assert.equal(result.from, 135);
    assert.equal(result.to, 140);
    assert.ok(Math.abs(result.toKg - fromDisplay(140, 'lb')) < 1e-9);
    // main lower body: two coarse steps = 10 lb
    const kg225 = fromDisplay(225, 'lb');
    assert.equal(suggest('squat', [workout('squat', { weights: [kg225, kg225, kg225, kg225] })], { unit: 'lb', bar: 45 }).to, 235);
    // pounds on a machine are not plate-rounded
    const kg100 = fromDisplay(100, 'lb');
    assert.equal(suggest('pulldown', [workout('pulldown', { weights: [kg100, kg100, kg100, kg100] })], { unit: 'lb' }).to, 105);
});

test('the last session has to be recent: 41 days is, 42 is not', () => {
    assert.equal(STALE_AFTER_DAYS, 42);
    assert.equal(suggest('bench', [workout('bench', { ago: 41 })])?.kind, 'progress');
    assert.equal(suggest('bench', [workout('bench', { ago: 42 })]), null);
    assert.equal(suggest('bench', [workout('bench', { ago: 120 })]), null);
});

test('history in any order: the newest comparable session decides', () => {
    const older = workout('bench', { ago: 20, weights: [50, 50, 50, 50] });
    const newer = workout('bench', { ago: 4, weights: [60, 60, 60, 60] });
    assert.equal(suggest('bench', [older, newer]).fromKg, 60);
    assert.equal(suggest('bench', [newer, older]).fromKg, 60);
});

test('only sessions at the same rep target count', () => {
    const heavy = workout('bench', { ago: 9, weights: [80, 80, 80, 80], reps: 6, targetReps: 6 });
    const light = workout('bench', { ago: 2, weights: [50, 50, 50], reps: 12, targetReps: 12, targetSets: 3 });
    const history = [light, heavy];
    // A 4x6 day looks back at the last 4x6, not the 3x12 in between.
    assert.equal(suggest('bench', history).fromKg, 80);
    // And the 3x12 day looks at its own.
    const upper = suggest('bench', history, { entry: { targetReps: 12, targetSets: 3 } });
    assert.equal(upper.fromKg, 50);
    assert.equal(upper.reps, 12);
    // A target nobody has done yet has no history to speak of.
    assert.equal(suggest('bench', history, { entry: { targetReps: 8 } }), null);
});

test('past entries with no recorded rep target cannot be judged', () => {
    const old = workout('bench');
    delete old.entries[0].targetReps;
    assert.equal(suggest('bench', [old]), null);
});

test('no numeric target now, or no history, means nothing to say', () => {
    assert.equal(suggest('bench', [workout('bench')], { entry: { targetReps: undefined } }), null);
    assert.equal(suggest('bench', [workout('bench')], { entry: { targetReps: Number.NaN } }), null);
    assert.equal(suggest('bench', []), null);
    assert.equal(suggest('bench', [workout('squat')]), null);
    assert.equal(suggestNext({ entry: null, history: [], now: NOW }), null);
});

test('doing fewer sets than asked is not meeting the bar', () => {
    // Three of four sets, all great: the missing set means no step up.
    assert.equal(suggest('bench', [workout('bench', { weights: [60, 60, 60] })]), null);
    // The prescription at the time is what counts, not today's.
    const threeSets = workout('bench', { weights: [60, 60, 60], targetSets: 3 });
    assert.equal(suggest('bench', [threeSets])?.kind, 'progress');
});

test('sessions saved before targetSets existed are held to the set count asked now', () => {
    const legacy = workout('bench', { weights: [60, 60, 60] });
    delete legacy.entries[0].targetSets;
    assert.equal(suggest('bench', [legacy]), null);
    assert.equal(suggest('bench', [legacy], { entry: { targetSets: 3 } })?.kind, 'progress');
});

test('a set that fell short, or went too close to failure, is not meeting the bar', () => {
    assert.equal(suggest('bench', [workout('bench', { reps: 5 })]), null);
    assert.equal(suggest('bench', [workout('bench', { rir: 1 })]), null);
    // A fewer-reps set among good ones
    const mixed = workout('bench');
    mixed.entries[0].sets[3].reps = 5;
    assert.equal(suggest('bench', [mixed]), null);
});

test('a swapped slot: the lift counts where it was done, not where it was planned', () => {
    // Bench done as a swap-in for another press: counts for bench.
    const swappedIn = workout('bench', { entry: { swappedFromId: 'incline-barbell-bench-press', swappedFrom: 'Incline Barbell Bench Press' } });
    assert.equal(suggest('bench', [swappedIn])?.kind, 'progress');
    // A session where the bench slot was swapped away from has no bench in it to judge.
    const swappedAway = {
        startedAt: daysAgo(2),
        entries: [{ ...LIFTS.pulldown, swappedFromId: 'barbell-bench-press', targetReps: 6, targetRir: 2, targetSets: 4, sets: [60, 60, 60, 60].map((w) => ({ weightKg: w, reps: 6, rir: 2, done: true })) }],
    };
    assert.equal(suggest('bench', [swappedAway]), null);
});

test('warm-ups and unticked sets are not part of it', () => {
    const w = workout('bench');
    w.entries[0].sets.unshift({ weightKg: 20, reps: 10, rir: 5, done: true, warmup: true });
    w.entries[0].sets.push({ weightKg: 90, reps: 1, rir: 0, done: false });
    const result = suggest('bench', [w]);
    assert.equal(result.fromKg, 60); // not the unticked 90
    assert.equal(result.kind, 'progress');
});

test('assisted lifts and unloaded bodyweight are skipped', () => {
    assert.equal(suggest('assisted', [workout('assisted', { weights: [35, 35, 35, 35] })]), null);
    assert.equal(suggest('pullUp', [workout('pullUp', { weights: [0, 0, 0, 0] })]), null);
    // Weighted pull-ups have a weight to add.
    const weighted = suggest('pullUp', [workout('pullUp', { weights: [10, 10, 10, 10] })]);
    assert.equal(weighted.toKg, 12.5);
});

// A session that falls short: 80 kg, only 5 reps a set.
const stalled = (ago, extra = {}) => workout('bench', { ago, weights: [80, 80, 80, 80], reps: 5, ...extra });

test('three short sessions with no new best: a lighter weight, about 10% off, rounded down', () => {
    assert.equal(DELOAD_FACTOR, 0.9);
    const result = suggest('bench', [stalled(2), stalled(9), stalled(16)]);
    assert.equal(result.kind, 'deload');
    assert.equal(result.fromKg, 80);
    // 72 kg on a 20 kg bar rounds down to the plates: (72 - 20) / 2.5 = 20.8 -> 20 -> 70
    assert.equal(result.toKg, 70);
    assert.equal(result.sessions, 3);
});

test('a deload off the barbell steps down in fine increments, never above 90%', () => {
    const history = [2, 9, 16].map((ago) => workout('pulldown', { ago, weights: [80, 80, 80, 80], reps: 5 }));
    const result = suggest('pulldown', history);
    assert.equal(result.kind, 'deload');
    assert.equal(result.toKg, 71.25); // 72 rounded down to a multiple of 1.25
    assert.ok(result.toKg <= 80 * DELOAD_FACTOR);
});

test('no deload while the newest of the three is a new best', () => {
    // Short of the bar each time, but the newest estimated max is the highest.
    const history = [
        workout('bench', { ago: 2, weights: [80, 80, 80, 80], reps: 5 }),
        workout('bench', { ago: 9, weights: [77.5, 77.5, 77.5, 77.5], reps: 5 }),
        workout('bench', { ago: 16, weights: [75, 75, 75, 75], reps: 5 }),
    ];
    assert.equal(suggest('bench', history), null);
});

test('no deload on two short sessions, or when any of the three met the bar', () => {
    assert.equal(suggest('bench', [stalled(2), stalled(9)]), null);
    const middleMet = workout('bench', { ago: 9, weights: [80, 80, 80, 80] }); // clears it
    assert.equal(suggest('bench', [stalled(2), middleMet, stalled(16)]), null);
});

test('a met session after short ones goes back to adding weight', () => {
    const history = [workout('bench', { ago: 2, weights: [72.5, 72.5, 72.5, 72.5] }), stalled(9), stalled(16)];
    const result = suggest('bench', history);
    assert.equal(result.kind, 'progress');
    assert.equal(result.toKg, 75);
});

test('a deload that would not be lighter is not suggested', () => {
    // Just the bar: 90% of 20 rounds down to the bar, which isn't lighter.
    const history = [2, 9, 16].map((ago) => workout('bench', { ago, weights: [20, 20, 20, 20], reps: 5 }));
    assert.equal(suggest('bench', history), null);
});

test('high-rep lifts, where no one-rep-max estimate exists, still get a verdict', () => {
    // 20-rep calf raises: effective reps are over 12 so Epley is null; weight x reps decides.
    const calf = { exerciseId: 'standing-calf-raise', exerciseName: 'Standing Calf Raise', muscleGroup: 'Legs', equipment: 'Machine' };
    const session = (ago, weight, reps) => ({
        startedAt: daysAgo(ago),
        entries: [{ ...calf, targetReps: 20, targetRir: 1, targetSets: 3, sets: [1, 2, 3].map(() => ({ weightKg: weight, reps, rir: 1, done: true })) }],
    });
    const entry = { ...calf, targetReps: 20, targetRir: 1, targetSets: 3 };
    const falling = suggestNext({ entry, history: [session(2, 60, 14), session(9, 60, 15), session(16, 60, 16)], unit: 'kg', now: NOW });
    assert.equal(falling.kind, 'deload');
    const rising = suggestNext({ entry, history: [session(2, 60, 17), session(9, 60, 16), session(16, 60, 15)], unit: 'kg', now: NOW });
    assert.equal(rising, null);
});

test('the wording', () => {
    assert.equal(suggestionText({ kind: 'progress', reps: 8, from: 60, to: 62.5, unit: 'kg' }), 'At 60\u00a0kg every set hit 8 reps. Try 62.5\u00a0kg.');
    assert.equal(
        suggestionText({ kind: 'deload', reps: 8, from: 100, to: 90, unit: 'kg' }),
        'At 100\u00a0kg, the last 3 sessions fell short of 8 reps a set. Try a lighter 90\u00a0kg to rebuild.',
    );
    assert.equal(suggestionText({ kind: 'progress', reps: 5, from: 135, to: 140, unit: 'lb' }), 'At 135\u00a0lb every set hit 5 reps. Try 140\u00a0lb.');
});

test('a hint stays only while it still says something new', () => {
    const up = { kind: 'progress', toKg: 62.5 };
    assert.equal(suggestionStillUseful(up, 60), true);
    assert.equal(suggestionStillUseful(up, 62.5), false);
    assert.equal(suggestionStillUseful(up, 65), false);
    const down = { kind: 'deload', toKg: 70 };
    assert.equal(suggestionStillUseful(down, 80), true);
    assert.equal(suggestionStillUseful(down, 70), false);
});

test('"Use" moves the sets together so the heaviest lands on the target', () => {
    assert.deepEqual(shiftToTop([60, 60, 60, 60], 62.5), [62.5, 62.5, 62.5, 62.5]);
    // seeded from a lighter plan: the target still lands on the heaviest set
    assert.deepEqual(shiftToTop([50, 50, 50], 62.5), [62.5, 62.5, 62.5]);
    // a pyramid stays a pyramid
    assert.deepEqual(shiftToTop([57.5, 60, 62.5], 65), [60, 62.5, 65]);
    // never below zero
    assert.deepEqual(shiftToTop([5, 20], 10), [0, 10]);
    assert.deepEqual(shiftToTop([], 10), []);
});
