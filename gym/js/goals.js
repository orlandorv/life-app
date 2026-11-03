import { estimateOneRepMax, isLoggedWork } from './strength.js';

/**
 * Lift goals: "bench 100 kg", "squat 140 kg for 3". Pure (no DOM, no
 * storage), so the rules for "how close am I" and "have I done it" can be
 * checked on their own. All weights are kg.
 *
 * A goal is `{ id, exerciseId, exerciseName, targetKg, reps, createdAt }`.
 * `exerciseName` is a snapshot so a goal still reads sensibly if the exercise
 * is later deleted from the library.
 *
 * Two different questions, answered two different ways on purpose:
 *  - **Reached** means it actually happened: a logged working set at or above
 *    the target weight for at least the target reps. An estimate never ticks
 *    a goal off — "bench 100 kg" isn't done until 100 kg has been on the bar.
 *  - **Progress** is how close the best estimated max is to what the target
 *    set would take, so the bar moves with every session even before then. It
 *    stops just short of full until the goal is really reached.
 */

export const GOAL_REPS_MIN = 1;
export const GOAL_REPS_MAX = 12; // past this, estimated maxes stop meaning much (see strength.js)

/** The estimated max that the target set itself represents (Epley, at 0 RIR). */
export function targetEstimate(goal) {
    return goal.targetKg * (1 + goal.reps / 30);
}

/** "100 kg × 1"-style label pieces, so the caller can format the weight in the user's unit. */
export const goalReps = (goal) => (goal.reps > 1 ? ` × ${goal.reps}` : '');

/**
 * Where a goal stands against the logged workouts:
 * `best` — the best estimated max on that exercise and the set behind it (or null);
 * `heaviest` — the heaviest set logged on it, ties to more reps (or null);
 * `reached` — the first logged set that met the goal (or null);
 * `progress` — 0–1 toward it (1 only once reached);
 * `toGoKg` — how far the best estimated max is from the target's (0 once reached).
 */
export function goalStatus(goal, workouts) {
    let best = null;
    let heaviest = null;
    let reached = null;

    for (const workout of workouts) {
        for (const entry of workout.entries || []) {
            if (entry.exerciseId !== goal.exerciseId) continue;
            for (const set of entry.sets || []) {
                if (!isLoggedWork(set)) continue;

                const estimateKg = estimateOneRepMax(set);
                if (!heaviest || set.weightKg > heaviest.weightKg || (set.weightKg === heaviest.weightKg && set.reps > heaviest.reps)) {
                    heaviest = { weightKg: set.weightKg, reps: set.reps, date: workout.startedAt };
                }
                if (estimateKg !== null && (!best || estimateKg > best.estimateKg)) {
                    best = { estimateKg, weightKg: set.weightKg, reps: set.reps, rir: set.rir ?? 0, date: workout.startedAt };
                }

                // The earliest qualifying set is when it was reached.
                if (set.weightKg >= goal.targetKg && set.reps >= goal.reps && (!reached || workout.startedAt < reached.date)) {
                    reached = { date: workout.startedAt, weightKg: set.weightKg, reps: set.reps };
                }
            }
        }
    }

    const target = targetEstimate(goal);
    if (reached) return { best, heaviest, reached, progress: 1, toGoKg: 0 };
    const progress = best ? Math.min(0.99, best.estimateKg / target) : 0;
    return { best, heaviest, reached: null, progress, toGoKg: best ? Math.max(0, target - best.estimateKg) : target };
}

/** Ids of the goals already reached — compared before and after a workout to say "goal reached". */
export function reachedGoalIds(goals, workouts) {
    return new Set(goals.filter((goal) => goalStatus(goal, workouts).reached).map((goal) => goal.id));
}

/**
 * The order the card lists them in: goals still being worked on first
 * (closest to done at the top, since that's the motivating end), reached ones
 * after, most recent first.
 */
export function sortGoals(goals, workouts) {
    const withStatus = goals.map((goal) => ({ goal, status: goalStatus(goal, workouts) }));
    const open = withStatus.filter((g) => !g.status.reached).sort((a, b) => b.status.progress - a.status.progress);
    const done = withStatus
        .filter((g) => g.status.reached)
        .sort((a, b) => b.status.reached.date.localeCompare(a.status.reached.date));
    return [...open, ...done];
}

/** A goal cleaned up for saving: whole reps in range, a positive weight. Null if it can't be a goal. */
export function cleanGoal({ id, exerciseId, exerciseName, targetKg, reps, createdAt }) {
    const wholeReps = Math.round(reps);
    if (!exerciseId || !(targetKg > 0) || !(wholeReps >= GOAL_REPS_MIN && wholeReps <= GOAL_REPS_MAX)) return null;
    return { id, exerciseId, exerciseName, targetKg, reps: wholeReps, createdAt };
}
