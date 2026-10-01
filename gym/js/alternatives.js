import { exerciseRole } from './prescription.js';

/**
 * Substitutes for when the exercise a plan calls for isn't available — the
 * machine is taken, the gym doesn't have it, something hurts.
 *
 * Pure (no DOM, no storage), so it's unit-testable in Node.
 *
 * A substitute has to train the *same muscle in a similar way*, so each seeded
 * exercise has a hand-written list, closest first, with a short note on what
 * changes. A list is deliberately empty where the library has no honest
 * equivalent (a note on how it differs beats a bad match). Exercises the app
 * has no list for — the user's own — fall back to the same muscle group and
 * the same kind of lift.
 */

// id -> [[alternative id, what changes], ...], closest first.
const CURATED = {
    // --- Chest ---
    'barbell-bench-press': [
        ['flat-dumbbell-press', 'Same press with dumbbells — freer range, kinder on the shoulders'],
        ['incline-dumbbell-press', 'Tilts the work toward the upper chest'],
    ],
    'flat-dumbbell-press': [
        ['barbell-bench-press', 'Same press with a bar — easier to load heavy'],
        ['incline-dumbbell-press', 'Tilts the work toward the upper chest'],
    ],
    'incline-dumbbell-press': [
        ['flat-dumbbell-press', 'Same press on a flat bench — more mid chest'],
        ['barbell-bench-press', 'Flat, with a bar — heavier, less upper chest'],
    ],
    'cable-chest-fly': [['pec-deck-fly', 'Same fly on a machine — fixed path, no setup']],
    'pec-deck-fly': [['cable-chest-fly', 'Same fly on cables — set any height, constant tension']],

    // --- Back ---
    'bodyweight-pull-up': [['neutral-grip-lat-pulldown', 'Same vertical pull — pick any weight, ideal if you can’t get your reps']],
    'neutral-grip-lat-pulldown': [['bodyweight-pull-up', 'Same vertical pull, lifting your own bodyweight — harder']],
    'barbell-bent-over-row': [
        ['chest-supported-row', 'Same row, braced on a pad — no lower-back demand'],
        ['one-arm-dumbbell-row', 'Same row one side at a time — more range'],
    ],
    'chest-supported-row': [
        ['one-arm-dumbbell-row', 'Same row, one arm at a time, on a bench'],
        ['barbell-bent-over-row', 'Same row standing — heavier, needs a strong lower back'],
    ],
    'one-arm-dumbbell-row': [
        ['chest-supported-row', 'Same row on a pad — both arms, steadier'],
        ['barbell-bent-over-row', 'Same row with a bar — heavier'],
    ],
    'reverse-pec-deck': [],

    // --- Shoulders ---
    'seated-dumbbell-shoulder-press': [],
    'cable-lateral-raise': [['dumbbell-lateral-raise', 'Same raise with dumbbells — hardest at the top']],
    'dumbbell-lateral-raise': [['cable-lateral-raise', 'Same raise on a cable — tension all the way down']],

    // --- Biceps ---
    'ez-bar-curl': [
        ['preacher-curl', 'Same bar, arms braced on a pad — stricter'],
        ['cable-bicep-curl', 'Same curl with constant cable tension'],
        ['incline-dumbbell-curl', 'Dumbbells on an incline — a deeper stretch'],
        ['dumbbell-hammer-curl', 'Neutral grip — more forearm and brachialis'],
    ],
    'preacher-curl': [
        ['ez-bar-curl', 'Same bar, standing — no pad needed'],
        ['cable-bicep-curl', 'Same curl with constant cable tension'],
        ['incline-dumbbell-curl', 'Dumbbells on an incline — a deeper stretch'],
    ],
    'incline-dumbbell-curl': [
        ['dumbbell-hammer-curl', 'Dumbbells again, neutral grip — more brachialis'],
        ['ez-bar-curl', 'A bar, standing — heavier, less stretch'],
        ['cable-bicep-curl', 'Constant cable tension'],
    ],
    'dumbbell-hammer-curl': [
        ['incline-dumbbell-curl', 'Dumbbells on an incline — more biceps stretch'],
        ['cable-bicep-curl', 'Constant cable tension'],
        ['ez-bar-curl', 'A bar — heavier, more biceps'],
    ],
    'cable-bicep-curl': [
        ['ez-bar-curl', 'A bar instead of a cable — heavier'],
        ['incline-dumbbell-curl', 'Dumbbells on an incline — a deeper stretch'],
        ['preacher-curl', 'Arms braced on a pad — stricter'],
        ['dumbbell-hammer-curl', 'Neutral grip — more brachialis'],
    ],

    // --- Triceps ---
    'overhead-cable-triceps-extension': [
        ['single-arm-cable-triceps-extension', 'Same overhead stretch, one arm at a time'],
        ['rope-triceps-pressdown', 'Pressdown instead of overhead — less stretch, easier to load'],
    ],
    'single-arm-cable-triceps-extension': [
        ['overhead-cable-triceps-extension', 'Same overhead stretch, both arms'],
        ['rope-triceps-pressdown', 'Pressdown instead of overhead — less stretch, easier to load'],
    ],
    'rope-triceps-pressdown': [
        ['overhead-cable-triceps-extension', 'Overhead on the same cable — a bigger stretch'],
        ['single-arm-cable-triceps-extension', 'Overhead, one arm at a time'],
    ],

    // --- Legs ---
    'barbell-back-squat': [
        ['hack-squat', 'Quad-focused with your back supported — easy to push hard'],
        ['machine-leg-press', 'No balance or bracing needed — lower back out of it'],
        ['goblet-squat', 'Same pattern, much lighter — go for more reps'],
    ],
    'hack-squat': [
        ['machine-leg-press', 'Another machine quad press — similar load'],
        ['goblet-squat', 'Heel-elevated, free weight — much lighter, go for more reps'],
        ['barbell-back-squat', 'Free-weight squat — more total-body, needs a rack'],
    ],
    'machine-leg-press': [
        ['hack-squat', 'Machine squat — back supported, more upright'],
        ['barbell-back-squat', 'Free-weight squat — needs a rack and bracing'],
        ['goblet-squat', 'Much lighter — go for more reps'],
    ],
    'goblet-squat': [
        ['hack-squat', 'Machine squat — much heavier'],
        ['machine-leg-press', 'Machine press — much heavier'],
        ['barbell-back-squat', 'Same pattern with a bar — much heavier'],
    ],
    'machine-leg-extension': [
        ['goblet-squat', 'Heel-elevated squat — keeps the work on the quads, but it’s a compound'],
        ['hack-squat', 'Quad-focused squat — also works the glutes'],
    ],
    'romanian-deadlift-barbell': [
        ['lying-leg-curl', 'Hamstrings only — no lower-back or glute work'],
        ['seated-leg-curl', 'Hamstrings only — no lower-back or glute work'],
    ],
    'seated-leg-curl': [
        ['lying-leg-curl', 'Same curl, lying down'],
        ['romanian-deadlift-barbell', 'Trains the hamstrings at the hip instead of the knee'],
    ],
    'lying-leg-curl': [
        ['seated-leg-curl', 'Same curl, seated — a deeper hamstring stretch'],
        ['romanian-deadlift-barbell', 'Trains the hamstrings at the hip instead of the knee'],
    ],
    'standing-calf-raise': [['seated-calf-raise', 'Knee bent — shifts the work to the soleus']],
    'seated-calf-raise': [['standing-calf-raise', 'Knee straight — shifts the work to the gastrocnemius']],

    // --- Core ---
    'hanging-knee-raise': [['cable-crunch', 'Weighted abs without needing a grip']],
    'cable-crunch': [['hanging-knee-raise', 'Bodyweight abs hanging from a bar']],
};

const MAX_RESULTS = 8;

/**
 * Substitutes for `exercise` from `library`, closest first, as
 * `[{ exercise, note }]`. `exclude` is ids to leave out (what's already in the
 * workout). Empty when there's nothing honest to offer.
 */
export function alternativesFor(exercise, library, exclude = []) {
    const skip = new Set([exercise.id, ...exclude]);
    const out = [];
    const add = (candidate, note) => {
        if (!candidate || skip.has(candidate.id) || out.some((o) => o.exercise.id === candidate.id)) return;
        out.push({ exercise: candidate, note });
    };

    const sameMuscle = (candidate) => exercise.muscleGroup && candidate.muscleGroup === exercise.muscleGroup;
    const sameKind = (candidate) => sameMuscle(candidate) && exerciseRole(candidate) === exerciseRole(exercise);

    const curated = CURATED[exercise.id];
    if (curated) {
        const byId = new Map(library.map((candidate) => [candidate.id, candidate]));
        curated.forEach(([id, note]) => add(byId.get(id), note));
        // The user's own exercises can be a fit for a stock one too.
        library.filter((candidate) => candidate.isCustom && sameKind(candidate)).forEach((candidate) => add(candidate, 'Your own exercise'));
    } else {
        library
            .filter(sameKind)
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((candidate) => add(candidate, 'Same muscle group, same kind of lift'));
    }

    return out.slice(0, MAX_RESULTS);
}

/** Ids this module has a hand-written list for — exposed for tests. */
export const CURATED_IDS = Object.keys(CURATED);
export const curatedFor = (id) => CURATED[id]?.map(([altId, note]) => ({ id: altId, note })) ?? null;
