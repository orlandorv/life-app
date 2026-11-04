/**
 * Warm-up ramps: the lighter sets before the work. Pure (no DOM, no storage),
 * so it is checked in Node.
 *
 * A ramp steps up towards the heaviest working set and thins out with the kind
 * of lift: a heavy compound earns three sets, a machine or dumbbell compound
 * two, and an isolation movement one. Reps fall as the weight rises, so the
 * ramp never tires you out for the work itself.
 */

import { exerciseRole } from './prescription.js';
import { STEPS, toDisplay, fromDisplay } from './units.js';
import { roundToLoadable } from './plate-math.js';

/** Per role, in order: what share of the working weight, and how many reps. */
export const RAMPS = {
    main: [
        { share: 0.4, reps: 8 },
        { share: 0.6, reps: 5 },
        { share: 0.8, reps: 3 },
    ],
    secondary: [
        { share: 0.5, reps: 8 },
        { share: 0.75, reps: 5 },
    ],
    isolation: [{ share: 0.6, reps: 10 }],
};

const EPS = 1e-6;

const isAssisted = (entry) => entry.exerciseId === 'assisted-pull-up-machine' || /assisted/i.test(entry.exerciseName ?? '');

/**
 * The warm-up sets to put ahead of `workingKg`, the heaviest working set, as
 * `[{ weightKg, reps }]` lightest first, or `[]` when there is nothing sensible
 * to add (no weight yet, an assisted or bodyweight lift, or a working weight
 * too close to the bar for a lighter set to exist).
 *
 * On a barbell each weight is what the plates can build (and never below the
 * bar itself: you can't warm up with less than the bar); anywhere else it is
 * rounded to the fine step. Sets that round to the same weight as the one
 * before, or to the working weight or above, are dropped — so a light bar gets
 * a short ramp rather than three identical sets.
 *
 * `entry` carries the exercise (`exerciseId`, `exerciseName`, `muscleGroup`,
 * `equipment`); `unit` and `bar` are the display unit and the bar in it.
 */
export function rampFor({ entry, workingKg, unit = 'kg', bar = 20 }) {
    if (!entry || !(workingKg > 0) || isAssisted(entry) || entry.equipment === 'Bodyweight') return [];

    const role = exerciseRole({ id: entry.exerciseId, name: entry.exerciseName, muscleGroup: entry.muscleGroup, equipment: entry.equipment });
    const working = toDisplay(workingKg, unit);
    const barbell = entry.equipment === 'Barbell';
    const fine = STEPS[unit].fine;

    const ramp = [];
    let previous = 0;
    for (const { share, reps } of RAMPS[role]) {
        const target = working * share;
        const weight = barbell ? roundToLoadable(target, bar, unit, 'nearest') : Math.round(target / fine) * fine;
        if (!(weight > previous + EPS) || weight >= working - EPS) continue;
        ramp.push({ weightKg: fromDisplay(weight, unit), reps });
        previous = weight;
    }
    return ramp;
}
