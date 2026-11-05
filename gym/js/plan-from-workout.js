import { clampRest } from './prescription.js';

/**
 * Turning a workout you did into a plan you can repeat: "save as plan". Pure
 * (no DOM, no storage), so what it carries over is checked in Node.
 *
 * Each exercise keeps the order it was done in, with the numbers it was done at:
 * as many sets as you logged (warm-ups are a ramp-up, not part of a plan), the
 * rep target it was held to (`reps` in a plan is the top of the range, which is
 * exactly what `targetReps` was), its RIR target and rest. A saved workout only
 * keeps the sets you ticked, so a plan made from it is the work you really did.
 */

const FALLBACK_RIR = 2;

/** The number that appears most; the lower one on a tie. */
function mostCommon(values) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    let best = null;
    for (const [value, count] of counts) {
        if (best === null || count > best.count || (count === best.count && value < best.value)) best = { value, count };
    }
    return best?.value ?? null;
}

/**
 * The plan a workout would make, as `{ name, exercises }` ready for the plan
 * editor, or null if there is nothing to make one from. `exists` says whether
 * an exercise is still in the library, so a deleted one isn't carried over.
 */
export function planFromWorkout(workout, exists = () => true) {
    const exercises = [];

    for (const entry of workout.entries || []) {
        if (!exists(entry.exerciseId)) continue;
        const working = (entry.sets || []).filter((set) => set.done !== false && !set.warmup);
        if (!working.length) continue;

        const reps = Number.isFinite(entry.targetReps) ? entry.targetReps : Math.max(...working.map((set) => set.reps || 0));
        const rir = Number.isFinite(entry.targetRir) ? entry.targetRir : (mostCommon(working.map((set) => set.rir).filter(Number.isFinite)) ?? FALLBACK_RIR);

        exercises.push({
            exerciseId: entry.exerciseId,
            sets: working.length,
            reps: Math.max(1, reps),
            restSeconds: clampRest(entry.restSeconds),
            rir,
        });
    }

    if (!exercises.length) return null;

    // A quick workout has no name of its own worth keeping; a named one does.
    const name = workout.name && workout.name !== 'Quick Workout' ? workout.name : '';
    return { name, exercises };
}
