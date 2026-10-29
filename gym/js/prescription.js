/**
 * What sets, reps, rest and RIR an exercise should start with — chosen by what
 * kind of lift it is, rather than one flat default for everything. A back squat
 * and a cable curl shouldn't both open at 10 reps and 90 seconds.
 *
 * Pure (no DOM, no storage), so it's unit-testable in Node. `reps` is the top
 * of the rep range, same as everywhere else in the app: `guidance.js` turns it
 * into the range (6 → 4–6, 10 → 6–10, 15 → 10–15).
 */

import { repRange, rirLabel } from './guidance.js';

export const ROLES = ['main', 'secondary', 'isolation'];

// Rest between sets is always 2–3 minutes: long enough to recover for the next
// set, short enough to keep the session moving. Everything that sets, edits or
// replays a rest goes through clampRest(), so plans and sessions saved before
// this rule come out in range too.
export const REST_MIN = 120;
export const REST_MAX = 180;
export const clampRest = (seconds) => {
    const value = Number.isFinite(seconds) ? seconds : REST_MIN;
    return Math.min(REST_MAX, Math.max(REST_MIN, value));
};

// Roles the seeded library is known to fit. Anything not listed (a custom
// exercise, or a seed added later) goes through the name/equipment guess below.
const ROLE_BY_ID = {
    'barbell-back-squat': 'main',
    'barbell-bench-press': 'main',
    'romanian-deadlift-barbell': 'main',
    'bodyweight-pull-up': 'main',
    'barbell-bent-over-row': 'main',
    'seated-dumbbell-shoulder-press': 'main',
    'conventional-deadlift': 'main',
    'barbell-front-squat': 'main',
    'barbell-overhead-press': 'main',
    'chin-up': 'main',
    'close-grip-bench-press': 'main',
    'incline-barbell-bench-press': 'main',
    'pendlay-row': 'main',
    'trap-bar-deadlift': 'main',

    'incline-dumbbell-press': 'secondary',
    'flat-dumbbell-press': 'secondary',
    'chest-supported-row': 'secondary',
    'one-arm-dumbbell-row': 'secondary',
    'neutral-grip-lat-pulldown': 'secondary',
    'machine-leg-press': 'secondary',
    'hack-squat': 'secondary',
    'goblet-squat': 'secondary',
    'machine-chest-press': 'secondary',
    'push-up': 'secondary',
    'seated-cable-row': 'secondary',
    'assisted-pull-up-machine': 'secondary',
    'machine-shoulder-press': 'secondary',
    'bulgarian-split-squat': 'secondary',
    'barbell-hip-thrust': 'secondary',
    'dumbbell-romanian-deadlift': 'secondary',
    'chest-dip': 'secondary',
    'wide-grip-lat-pulldown': 'secondary',
    't-bar-row': 'secondary',
    'inverted-row': 'secondary',
    'back-extension': 'secondary',
    'arnold-press': 'secondary',
    'triceps-dip': 'secondary',
    'walking-lunge': 'secondary',
    'cable-pull-through': 'secondary',

    // "pulldown" and "extension" read as isolation to the name guess below.
    'straight-arm-pulldown': 'isolation',
};

const ISOLATION_NAME = /curl|raise|fly|flye|extension|pressdown|push-?down|crunch|calf|kickback|shrug|pullover|face pull|twist|pec deck|rear delt|abduction|adduction/i;
const MAIN_NAME = /squat|deadlift|bench|overhead press|military|pull-?up|chin-?up|barbell row|bent[- ]over row|pendlay/i;

/**
 * 'main' (heavy compound), 'secondary' (machine/dumbbell compound) or
 * 'isolation'. A guess for exercises the app hasn't classified itself: small
 * muscle groups and isolation-sounding names are isolation, barbell/bodyweight
 * versions of the big patterns are main, and everything else sits in between.
 */
export function exerciseRole(exercise) {
    if (!exercise) return 'secondary';
    if (ROLE_BY_ID[exercise.id]) return ROLE_BY_ID[exercise.id];

    const name = exercise.name || '';
    if (['Biceps', 'Triceps', 'Core'].includes(exercise.muscleGroup)) return 'isolation';
    if (ISOLATION_NAME.test(name)) return 'isolation';
    if (MAIN_NAME.test(name) && ['Barbell', 'Bodyweight'].includes(exercise.equipment)) return 'main';
    return 'secondary';
}

export const DEFAULT_PRESET = 'physique';

/** In the order they're shown. `table` is per role: {sets, reps, restSeconds, rir}. */
export const PRESETS = [
    {
        id: 'strength',
        label: 'Strength',
        summary: 'Main lifts 4×5 · accessories 3×8 · isolation 3×12 — the heaviest of the three, resting 2½–3 min.',
        table: {
            main: { sets: 4, reps: 5, restSeconds: 180, rir: 2 },
            secondary: { sets: 3, reps: 8, restSeconds: 180, rir: 2 },
            isolation: { sets: 3, reps: 12, restSeconds: 150, rir: 1 },
        },
    },
    {
        id: 'physique',
        label: 'Strength + physique',
        summary: 'Main lifts 4×6 · accessories 3×10 · isolation 3×15 — heavy where it counts, enough volume to keep muscle in a cut.',
        table: {
            main: { sets: 4, reps: 6, restSeconds: 180, rir: 2 },
            secondary: { sets: 3, reps: 10, restSeconds: 150, rir: 2 },
            isolation: { sets: 3, reps: 15, restSeconds: 120, rir: 1 },
        },
    },
    {
        id: 'hypertrophy',
        label: 'Hypertrophy',
        summary: 'Main lifts 3×8 · accessories 3×12 · isolation 3×15 — more reps, the shortest rests the app allows (2 min).',
        table: {
            main: { sets: 3, reps: 8, restSeconds: 150, rir: 2 },
            secondary: { sets: 3, reps: 12, restSeconds: 120, rir: 1 },
            isolation: { sets: 3, reps: 15, restSeconds: 120, rir: 1 },
        },
    },
];

export function findPreset(id) {
    return PRESETS.find((preset) => preset.id === id) ?? null;
}

// Nudges to the role's numbers for lifts that don't behave like the rest of
// their role, as deltas so they follow whichever scheme is picked: a deadlift
// is 3 sets at most, a seated calf raise wants 20 reps, a safe machine
// isolation can go to failure. `maxSets` caps the role's set count instead of
// shifting it, so a scheme that already asks for 3 isn't cut further. Reps are
// snapped to a rep-range top the app already writes ranges for (see
// RANGE_BOTTOMS in guidance.js), and only isolation work goes below 1 RIR.
const ADJUST = {
    // Chest
    'incline-barbell-bench-press': { reps: 2 },
    'machine-chest-press': { rir: -1 },
    'push-up': { rir: -1 },
    'chest-dip': { reps: -2, rir: -1 },
    'dumbbell-fly': { reps: -3 },
    'pec-deck-fly': { rir: -1 },

    // Back
    'barbell-bent-over-row': { reps: 2 },
    'neutral-grip-lat-pulldown': { rir: -1 },
    'wide-grip-lat-pulldown': { rir: -1 },
    'assisted-pull-up-machine': { rir: -1 },
    'chest-supported-row': { rir: -1 },
    'seated-cable-row': { rir: -1 },
    'inverted-row': { reps: 2 },
    'back-extension': { reps: 2 },
    'reverse-pec-deck': { rir: -1 },
    'face-pull': { reps: 5 },

    // Shoulders
    'seated-dumbbell-shoulder-press': { reps: 2 },
    'machine-shoulder-press': { rir: -1 },
    'cable-lateral-raise': { rir: -1 },
    'machine-lateral-raise': { rir: -1 },

    // Biceps and forearms
    'ez-bar-curl': { reps: -3 },
    'preacher-curl': { reps: -3 },
    'incline-dumbbell-curl': { reps: -3 },
    'dumbbell-hammer-curl': { reps: -3 },
    'dumbbell-curl': { reps: -3 },
    'spider-curl': { reps: -3 },
    'rope-hammer-curl': { reps: -3 },
    'bayesian-cable-curl': { reps: -3, rir: -1 },
    'machine-preacher-curl': { rir: -1 },
    'reverse-ez-bar-curl': { reps: -3 },

    // Triceps
    'ez-bar-skull-crusher': { reps: -3, rir: 1 },
    'overhead-dumbbell-triceps-extension': { reps: -3 },
    'close-grip-bench-press': { maxSets: 3, reps: 2 },

    // Legs
    'conventional-deadlift': { maxSets: 3, reps: -1, rir: 1 },
    'trap-bar-deadlift': { maxSets: 3, reps: -1, rir: 1 },
    'romanian-deadlift-barbell': { maxSets: 3, reps: 2 },
    'goblet-squat': { reps: 2 },
    'cable-pull-through': { reps: 2 },
    'machine-leg-extension': { rir: -1 },
    'seated-leg-curl': { rir: -1 },
    'lying-leg-curl': { rir: -1 },
    'standing-calf-raise': { rir: -1 },
    'seated-calf-raise': { reps: 5, rir: -1 },
    'leg-press-calf-raise': { rir: -1 },
    'hip-abduction-machine': { reps: 5 },
    'hip-adduction-machine': { reps: 5 },

    // Core
    'hanging-knee-raise': { reps: -3 },
    'hanging-leg-raise': { reps: -5 },
    'cable-crunch': { reps: -3 },
    'ab-wheel-rollout': { reps: -5 },
    'machine-crunch': { reps: -3 },
    'pallof-press': { reps: -5, rir: 1 },
    'cable-woodchop': { reps: -3 },
};

const REP_STEPS = [3, 4, 5, 6, 8, 10, 12, 15, 20];
const nearestRepStep = (reps) => REP_STEPS.reduce((best, step) => (Math.abs(step - reps) <= Math.abs(best - reps) ? step : best));

/** The sets/reps/rest/RIR a plan entry for `exercise` starts with under a preset (the default one if none is given or it's unknown). */
export function prescriptionFor(exercise, presetId = DEFAULT_PRESET) {
    const preset = findPreset(presetId) ?? findPreset(DEFAULT_PRESET);
    const role = exerciseRole(exercise);
    const base = { ...preset.table[role] };
    const adjust = ADJUST[exercise?.id];
    if (!adjust) return base;

    return {
        sets: Math.min(base.sets, adjust.maxSets ?? base.sets),
        reps: adjust.reps ? nearestRepStep(base.reps + adjust.reps) : base.reps,
        restSeconds: clampRest(base.restSeconds + (adjust.restSeconds ?? 0)),
        rir: Math.min(3, Math.max(role === 'isolation' ? 0 : 1, base.rir + (adjust.rir ?? 0))),
    };
}

/**
 * What's recommended for an exercise, in the form lists want to show it: the
 * same numbers a new plan entry or a mid-workout exercise starts with
 * (`prescriptionFor`), with the rep range and RIR worded the way a workout
 * words them. `summary` is the compact line ("3 × 6–10 reps · ~1 RIR").
 */
export function recommendationFor(exercise, presetId = DEFAULT_PRESET) {
    const { sets, reps, restSeconds, rir } = prescriptionFor(exercise, presetId);
    const { low, high } = repRange(reps);
    const range = low === high ? `${high}` : `${low}–${high}`;
    return { sets, reps, restSeconds, rir, range, summary: `${sets} × ${range} reps · ${rirLabel(rir)}` };
}

/** "6–10 reps · 1–2 RIR": a target's reps and RIR, worded as everywhere else. */
export function repsAndRir(reps, rir) {
    const { low, high } = repRange(reps);
    return `${low === high ? high : `${low}–${high}`} reps · ${rirLabel(rir)}`;
}

/** Ids with their own nudge — exposed for tests. */
export const ADJUSTED_IDS = Object.keys(ADJUST);
