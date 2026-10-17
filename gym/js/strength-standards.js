/**
 * Strength standards: how strong is "intermediate" for a lift, as a multiple of
 * bodyweight — the data behind the muscle map on the Records tab.
 *
 * Pure data (no DOM, no storage), so it's unit-testable in Node. These are
 * rounded, population-level rules of thumb in the range commonly published for
 * recreational lifters (a guide to compare yourself against, not a
 * measurement), written here for an 80 kg adult man in his prime; strength.js
 * adjusts them for the person's actual bodyweight, age and sex.
 */

export const LEVELS = ['Untrained', 'Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];

/**
 * The muscles drawn on the map, in the order they're listed. `kind` says which
 * sex adjustment applies where an exercise doesn't carry its own (see FAMILIES).
 */
export const REGIONS = [
    { id: 'chest', label: 'Chest', group: 'Chest' },
    { id: 'shoulders', label: 'Shoulders', group: 'Shoulders' },
    { id: 'rearDelts', label: 'Rear delts', group: 'Shoulders' },
    { id: 'upperBack', label: 'Upper back', group: 'Back' },
    { id: 'lats', label: 'Lats', group: 'Back' },
    { id: 'biceps', label: 'Biceps', group: 'Biceps' },
    { id: 'triceps', label: 'Triceps', group: 'Triceps' },
    { id: 'forearms', label: 'Forearms', group: 'Forearms' },
    { id: 'abs', label: 'Abs', group: 'Core' },
    { id: 'lowerBack', label: 'Lower back', group: 'Back' },
    { id: 'glutes', label: 'Glutes', group: 'Legs' },
    { id: 'quads', label: 'Quads', group: 'Legs' },
    { id: 'hamstrings', label: 'Hamstrings', group: 'Legs' },
    { id: 'calves', label: 'Calves', group: 'Legs' },
];

/**
 * Estimated one-rep-max needed for Beginner, Novice, Intermediate, Advanced and
 * Elite, as a multiple of bodyweight. Below the first number is "Untrained".
 *
 * Lifts done with a dumbbell are entered per dumbbell in this app, so their
 * exercises scale a barbell family down (see `factor` in EXERCISES). Families
 * marked "total load" count bodyweight as part of the load (pull-ups, dips).
 */
export const FAMILIES = {
    bench: { kind: 'upper', t: [0.5, 0.75, 1.25, 1.75, 2.0] },
    squat: { kind: 'lower', t: [0.75, 1.25, 1.5, 2.25, 2.75] },
    deadlift: { kind: 'lower', t: [1.0, 1.5, 2.0, 2.75, 3.25] },
    ohp: { kind: 'upper', t: [0.35, 0.55, 0.8, 1.1, 1.4] },
    row: { kind: 'upper', t: [0.5, 0.75, 1.0, 1.5, 1.75] },
    pulldown: { kind: 'upper', t: [0.5, 0.75, 1.0, 1.5, 1.9] },
    pullup: { kind: 'upper', t: [1.0, 1.15, 1.35, 1.6, 1.9] }, // total load
    dip: { kind: 'upper', t: [1.0, 1.25, 1.5, 1.9, 2.3] }, // total load
    curl: { kind: 'upper', t: [0.2, 0.4, 0.6, 0.85, 1.1] },
    pushdown: { kind: 'upper', t: [0.25, 0.5, 0.9, 1.3, 1.7] },
    rear: { kind: 'upper', t: [0.1, 0.2, 0.35, 0.5, 0.7] },
    lateral: { kind: 'upper', t: [0.05, 0.1, 0.18, 0.27, 0.38] },
    wrist: { kind: 'upper', t: [0.15, 0.3, 0.5, 0.75, 1.0] },
    legpress: { kind: 'lower', t: [1.0, 2.0, 3.0, 4.25, 5.5] },
    legext: { kind: 'lower', t: [0.4, 0.7, 1.0, 1.4, 1.8] },
    legcurl: { kind: 'lower', t: [0.3, 0.5, 0.75, 1.0, 1.3] },
    calf: { kind: 'lower', t: [0.5, 1.0, 1.5, 2.25, 3.0] },
    hipthrust: { kind: 'lower', t: [0.5, 1.0, 1.75, 2.5, 3.25] },
    crunch: { kind: 'core', t: [0.3, 0.6, 0.9, 1.3, 1.7] },
};

/**
 * Which muscles an exercise counts toward and how its numbers compare with its
 * family's. `factor` scales the family's thresholds (0.4 = a dumbbell lift
 * where each hand holds about 40% of the barbell max); `bw` is the fraction of
 * bodyweight that's part of the load (a pull-up moves all of you, a push-up
 * about 64%), added to whatever weight was logged — and the reason a
 * bodyweight set with nothing added still counts for these.
 *
 * Exercises left out (assisted pull-ups, where the weight is help rather than
 * load; the ab wheel, hip adductors) don't colour the map. So don't custom
 * exercises, which have no standard to compare against.
 */
export const EXERCISES = {
    // Chest
    'barbell-bench-press': { regions: ['chest'], family: 'bench', factor: 1 },
    'incline-barbell-bench-press': { regions: ['chest'], family: 'bench', factor: 0.85 },
    'incline-dumbbell-press': { regions: ['chest'], family: 'bench', factor: 0.33 },
    'flat-dumbbell-press': { regions: ['chest'], family: 'bench', factor: 0.38 },
    'machine-chest-press': { regions: ['chest'], family: 'bench', factor: 0.9 },
    'cable-chest-fly': { regions: ['chest'], family: 'bench', factor: 0.25 },
    'low-to-high-cable-fly': { regions: ['chest'], family: 'bench', factor: 0.2 },
    'pec-deck-fly': { regions: ['chest'], family: 'bench', factor: 0.5 },
    'dumbbell-fly': { regions: ['chest'], family: 'bench', factor: 0.2 },
    'push-up': { regions: ['chest'], family: 'bench', factor: 1, bw: 0.64 },
    'chest-dip': { regions: ['chest', 'triceps'], family: 'dip', factor: 1, bw: 1 },

    // Back
    'bodyweight-pull-up': { regions: ['lats', 'upperBack'], family: 'pullup', factor: 1, bw: 1 },
    'chin-up': { regions: ['lats', 'biceps'], family: 'pullup', factor: 0.95, bw: 1 },
    'neutral-grip-lat-pulldown': { regions: ['lats'], family: 'pulldown', factor: 1 },
    'wide-grip-lat-pulldown': { regions: ['lats'], family: 'pulldown', factor: 1 },
    'straight-arm-pulldown': { regions: ['lats'], family: 'pulldown', factor: 0.45 },
    'barbell-bent-over-row': { regions: ['upperBack', 'lats'], family: 'row', factor: 1 },
    'pendlay-row': { regions: ['upperBack', 'lats'], family: 'row', factor: 0.95 },
    't-bar-row': { regions: ['upperBack', 'lats'], family: 'row', factor: 1.05 },
    'chest-supported-row': { regions: ['upperBack', 'lats'], family: 'row', factor: 1 },
    'seated-cable-row': { regions: ['upperBack', 'lats'], family: 'row', factor: 1 },
    'one-arm-dumbbell-row': { regions: ['lats', 'upperBack'], family: 'row', factor: 0.45 },
    'inverted-row': { regions: ['upperBack', 'lats'], family: 'row', factor: 1, bw: 0.55 },
    'back-extension': { regions: ['lowerBack'], family: 'crunch', factor: 0.9 },
    'reverse-pec-deck': { regions: ['rearDelts'], family: 'rear', factor: 1 },
    'cable-rear-delt-fly': { regions: ['rearDelts'], family: 'rear', factor: 0.6 },
    'dumbbell-rear-delt-fly': { regions: ['rearDelts'], family: 'lateral', factor: 0.8 },
    'face-pull': { regions: ['rearDelts', 'upperBack'], family: 'rear', factor: 1 },

    // Shoulders
    'barbell-overhead-press': { regions: ['shoulders'], family: 'ohp', factor: 1 },
    'machine-shoulder-press': { regions: ['shoulders'], family: 'ohp', factor: 0.95 },
    'seated-dumbbell-shoulder-press': { regions: ['shoulders'], family: 'ohp', factor: 0.4 },
    'arnold-press': { regions: ['shoulders'], family: 'ohp', factor: 0.33 },
    'dumbbell-lateral-raise': { regions: ['shoulders'], family: 'lateral', factor: 1 },
    'cable-lateral-raise': { regions: ['shoulders'], family: 'lateral', factor: 0.9 },
    'machine-lateral-raise': { regions: ['shoulders'], family: 'lateral', factor: 2.2 },

    // Biceps
    'ez-bar-curl': { regions: ['biceps'], family: 'curl', factor: 1 },
    'preacher-curl': { regions: ['biceps'], family: 'curl', factor: 0.9 },
    'machine-preacher-curl': { regions: ['biceps'], family: 'curl', factor: 0.9 },
    'cable-bicep-curl': { regions: ['biceps'], family: 'curl', factor: 0.85 },
    'bayesian-cable-curl': { regions: ['biceps'], family: 'curl', factor: 0.5 },
    'incline-dumbbell-curl': { regions: ['biceps'], family: 'curl', factor: 0.45 },
    'dumbbell-curl': { regions: ['biceps'], family: 'curl', factor: 0.45 },
    'spider-curl': { regions: ['biceps'], family: 'curl', factor: 0.42 },
    'dumbbell-hammer-curl': { regions: ['biceps', 'forearms'], family: 'curl', factor: 0.5 },
    'rope-hammer-curl': { regions: ['biceps', 'forearms'], family: 'curl', factor: 0.8 },

    // Triceps
    'close-grip-bench-press': { regions: ['triceps'], family: 'bench', factor: 0.9 },
    'triceps-dip': { regions: ['triceps'], family: 'dip', factor: 0.9, bw: 1 },
    'ez-bar-skull-crusher': { regions: ['triceps'], family: 'curl', factor: 1.1 },
    'overhead-dumbbell-triceps-extension': { regions: ['triceps'], family: 'curl', factor: 0.75 },
    'overhead-cable-triceps-extension': { regions: ['triceps'], family: 'pushdown', factor: 0.8 },
    'single-arm-cable-triceps-extension': { regions: ['triceps'], family: 'pushdown', factor: 0.55 },
    'rope-triceps-pressdown': { regions: ['triceps'], family: 'pushdown', factor: 1 },
    'straight-bar-triceps-pressdown': { regions: ['triceps'], family: 'pushdown', factor: 1.1 },

    // Forearms
    'wrist-curl': { regions: ['forearms'], family: 'wrist', factor: 1 },
    'reverse-wrist-curl': { regions: ['forearms'], family: 'wrist', factor: 0.6 },
    'reverse-ez-bar-curl': { regions: ['forearms'], family: 'curl', factor: 0.7 },

    // Legs
    'barbell-back-squat': { regions: ['quads', 'glutes'], family: 'squat', factor: 1 },
    'barbell-front-squat': { regions: ['quads', 'glutes'], family: 'squat', factor: 0.8 },
    'hack-squat': { regions: ['quads', 'glutes'], family: 'squat', factor: 1 },
    'goblet-squat': { regions: ['quads'], family: 'squat', factor: 0.35 },
    'bulgarian-split-squat': { regions: ['quads', 'glutes'], family: 'squat', factor: 0.28 },
    'walking-lunge': { regions: ['quads', 'glutes'], family: 'squat', factor: 0.26 },
    'machine-leg-press': { regions: ['quads', 'glutes'], family: 'legpress', factor: 1 },
    'machine-leg-extension': { regions: ['quads'], family: 'legext', factor: 1 },
    'conventional-deadlift': { regions: ['hamstrings', 'glutes', 'lowerBack', 'upperBack'], family: 'deadlift', factor: 1 },
    'trap-bar-deadlift': { regions: ['hamstrings', 'glutes', 'lowerBack', 'upperBack'], family: 'deadlift', factor: 1.05 },
    'romanian-deadlift-barbell': { regions: ['hamstrings', 'glutes', 'lowerBack'], family: 'deadlift', factor: 0.75 },
    'dumbbell-romanian-deadlift': { regions: ['hamstrings', 'glutes'], family: 'deadlift', factor: 0.35 },
    'seated-leg-curl': { regions: ['hamstrings'], family: 'legcurl', factor: 1 },
    'lying-leg-curl': { regions: ['hamstrings'], family: 'legcurl', factor: 1 },
    'barbell-hip-thrust': { regions: ['glutes'], family: 'hipthrust', factor: 1 },
    'cable-pull-through': { regions: ['glutes', 'hamstrings'], family: 'hipthrust', factor: 0.35 },
    'hip-abduction-machine': { regions: ['glutes'], family: 'legext', factor: 1.2 },
    'standing-calf-raise': { regions: ['calves'], family: 'calf', factor: 1 },
    'seated-calf-raise': { regions: ['calves'], family: 'calf', factor: 0.6 },
    'leg-press-calf-raise': { regions: ['calves'], family: 'calf', factor: 1.5 },

    // Core
    'cable-crunch': { regions: ['abs'], family: 'crunch', factor: 1 },
    'machine-crunch': { regions: ['abs'], family: 'crunch', factor: 1 },
    'decline-sit-up': { regions: ['abs'], family: 'crunch', factor: 0.3 },
    'hanging-knee-raise': { regions: ['abs'], family: 'crunch', factor: 0.5 },
    'hanging-leg-raise': { regions: ['abs'], family: 'crunch', factor: 0.5 },
    'pallof-press': { regions: ['abs'], family: 'crunch', factor: 0.25 },
    'cable-woodchop': { regions: ['abs'], family: 'crunch', factor: 0.35 },
};
