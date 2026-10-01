/**
 * What sets, reps, rest and RIR an exercise should start with — chosen by what
 * kind of lift it is, rather than one flat default for everything. A back squat
 * and a cable curl shouldn't both open at 10 reps and 90 seconds.
 *
 * Pure (no DOM, no storage), so it's unit-testable in Node. `reps` is the top
 * of the rep range, same as everywhere else in the app: `guidance.js` turns it
 * into the range (6 → 4–6, 10 → 6–10, 15 → 10–15).
 */

export const ROLES = ['main', 'secondary', 'isolation'];

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
        summary: 'Main lifts 4×5 · accessories 3×8 · isolation 3×12 — the heaviest of the three.',
        table: {
            main: { sets: 4, reps: 5, restSeconds: 180, rir: 2 },
            secondary: { sets: 3, reps: 8, restSeconds: 120, rir: 2 },
            isolation: { sets: 3, reps: 12, restSeconds: 75, rir: 1 },
        },
    },
    {
        id: 'physique',
        label: 'Strength + physique',
        summary: 'Main lifts 4×6 · accessories 3×10 · isolation 3×15 — heavy where it counts, enough volume to keep muscle in a cut.',
        table: {
            main: { sets: 4, reps: 6, restSeconds: 180, rir: 2 },
            secondary: { sets: 3, reps: 10, restSeconds: 120, rir: 2 },
            isolation: { sets: 3, reps: 15, restSeconds: 75, rir: 1 },
        },
    },
    {
        id: 'hypertrophy',
        label: 'Hypertrophy',
        summary: 'Main lifts 3×8 · accessories 3×12 · isolation 3×15 — more reps, shorter rests.',
        table: {
            main: { sets: 3, reps: 8, restSeconds: 150, rir: 2 },
            secondary: { sets: 3, reps: 12, restSeconds: 90, rir: 1 },
            isolation: { sets: 3, reps: 15, restSeconds: 60, rir: 1 },
        },
    },
];

export function findPreset(id) {
    return PRESETS.find((preset) => preset.id === id) ?? null;
}

/** The sets/reps/rest/RIR a plan entry for `exercise` starts with under a preset (the default one if none is given or it's unknown). */
export function prescriptionFor(exercise, presetId = DEFAULT_PRESET) {
    const preset = findPreset(presetId) ?? findPreset(DEFAULT_PRESET);
    return { ...preset.table[exerciseRole(exercise)] };
}
