import { EXERCISES, FAMILIES, LEVELS, REGIONS } from './strength-standards.js';

/**
 * How strong each muscle is, for the body map on the Records tab: estimated
 * one-rep-maxes from logged sets, compared with strength standards adjusted for
 * the person's bodyweight, age and sex.
 *
 * Pure (no DOM, no storage), so it's unit-testable in Node. All weights are kg.
 */

/**
 * Only sets that were actually performed count: ticked off, not a warm-up, and
 * carrying real weight. (Moved here from records.js so both can share it
 * without pulling the DOM into this module.)
 */
export function isLoggedWork(set) {
    return Boolean(set.done) && !set.warmup && set.weightKg > 0;
}

/**
 * Epley (weight × (1 + reps/30)), fed *effective* reps — logged reps plus the
 * RIR left in the tank, since a set stopped 2 short predicts a heavier max
 * than the same set taken to failure.
 *
 * Above ~12 effective reps the formula drifts badly high, so those sets are
 * left out entirely rather than quietly reported: a "1RM" extrapolated from a
 * 20-rep calf raise is noise, and no estimate beats a wrong one.
 */
export const MAX_EFFECTIVE_REPS = 12;

export function estimateOneRepMax(set) {
    const effectiveReps = set.reps + (set.rir ?? 0);
    if (!(set.weightKg > 0) || effectiveReps < 1 || effectiveReps > MAX_EFFECTIVE_REPS) return null;
    return set.weightKg * (1 + effectiveReps / 30);
}

// --- Adjusting the standards for the person -----------------------------------

/** The weight the standards are written for. */
const REFERENCE_KG = 80;

/**
 * Women's strength relative to men's at the same bodyweight, by where it's
 * trained — the gap is smaller in the legs than in the upper body. A rule of
 * thumb for population standards, nothing finer than that.
 */
const WOMEN_FACTOR = { upper: 0.62, core: 0.72, lower: 0.78 };

/**
 * How much easier the standards get for someone younger or older than the
 * 23–40 prime: 1 in that window, rising either side, so the same lift reads as
 * a higher level. An approximation of the usual masters/juniors corrections
 * (about 1% a year after 40, speeding up), clamped to 14–90.
 */
export function ageFactor(age) {
    const years = Math.min(90, Math.max(14, age));
    if (years > 40) return 1 + 0.0105 * (years - 40) + 0.00035 * (years - 40) ** 2;
    if (years < 23) return 1 + 0.014 * (23 - years);
    return 1;
}

/**
 * Strength scales with muscle cross-section, roughly bodyweight^(2/3), so a
 * heavier lifter lifts more in total but less *per kilo*. Returns the
 * multiplier on the per-bodyweight standards: above 1 for someone lighter than
 * the reference, below 1 for someone heavier.
 */
export function weightFactor(bodyKg) {
    return (REFERENCE_KG / bodyKg) ** (1 / 3);
}

/** Whole years from a YYYY-MM-DD (local) to `today`, added to the age given then. */
export function currentAge(profile, today = new Date()) {
    const [year, month, day] = String(profile.ageOn).split('-').map(Number);
    const since = new Date(year, (month || 1) - 1, day || 1);
    let passed = today.getFullYear() - since.getFullYear();
    const anniversary = new Date(today.getFullYear(), since.getMonth(), since.getDate());
    if (today < anniversary) passed -= 1;
    return profile.age + Math.max(0, passed);
}

/**
 * Est. 1RM needed (kg of total load) for Beginner…Elite on this exercise, for
 * this person — five numbers, ascending.
 */
export function thresholdsFor(spec, { bodyKg, ageYears, sex }) {
    const family = FAMILIES[spec.family];
    const sexAdjust = sex === 'female' ? WOMEN_FACTOR[family.kind] : 1;
    const scale = spec.factor * weightFactor(bodyKg) * sexAdjust * bodyKg / ageFactor(ageYears);
    return family.t.map((ratio) => ratio * scale);
}

/**
 * Where a total-load 1RM sits against five ascending thresholds:
 * `level` 0 (Untrained) to 5 (Elite), and `progress` 0–1 of the way from the
 * level's own threshold to the next one (a full bar once Elite).
 */
export function placeAgainst(load, thresholds) {
    let level = 0;
    while (level < thresholds.length && load >= thresholds[level]) level += 1;
    if (level === thresholds.length) return { level, progress: 1 };
    const floor = level === 0 ? 0 : thresholds[level - 1];
    return { level, progress: (load - floor) / (thresholds[level] - floor) };
}

export const profileIsComplete = (profile) =>
    Boolean(profile && Number.isFinite(profile.age) && profile.age >= 14 && (profile.sex === 'male' || profile.sex === 'female'));

// --- Scoring ----------------------------------------------------------------------

/**
 * Best estimated 1RM per standard-bearing exercise, as total load (so a pull-up
 * counts your bodyweight). A bodyweight exercise's set counts even with no
 * weight added; everything else needs real weight, same as Records.
 */
function bestLifts(workouts, bodyKg) {
    const best = new Map();

    for (const workout of workouts) {
        for (const entry of workout.entries || []) {
            const spec = EXERCISES[entry.exerciseId];
            if (!spec) continue;

            for (const set of entry.sets) {
                const counts = spec.bw ? set.done && !set.warmup && set.weightKg >= 0 : isLoggedWork(set);
                if (!counts) continue;

                const effectiveReps = set.reps + (set.rir ?? 0);
                if (effectiveReps < 1 || effectiveReps > MAX_EFFECTIVE_REPS) continue;

                const load = set.weightKg + (spec.bw ?? 0) * bodyKg;
                if (!(load > 0)) continue;

                const estimate = load * (1 + effectiveReps / 30);
                const current = best.get(entry.exerciseId);
                if (!current || estimate > current.estimate) {
                    best.set(entry.exerciseId, {
                        exerciseId: entry.exerciseId,
                        exerciseName: entry.exerciseName,
                        estimate,
                        weightKg: set.weightKg,
                        reps: set.reps,
                        rir: set.rir ?? 0,
                    });
                }
            }
        }
    }

    return best;
}

/**
 * One result per muscle on the map. `level` is null when nothing logged counts
 * toward it. Otherwise the muscle takes its best exercise: the highest level,
 * ties going to whoever is further toward the next one.
 *
 * `next` is the estimated 1RM that would reach the next level on that same
 * exercise (the weight to add, for a bodyweight one) — null at Elite.
 */
export function computeStrengthMap({ workouts, profile, bodyKg, today = new Date() }) {
    const ageYears = currentAge(profile, today);
    const person = { bodyKg, ageYears, sex: profile.sex };
    const lifts = bestLifts(workouts, bodyKg);

    const regions = new Map(REGIONS.map((region) => [region.id, { ...region, level: null, progress: 0, best: null, next: null }]));

    for (const lift of lifts.values()) {
        const spec = EXERCISES[lift.exerciseId];
        const thresholds = thresholdsFor(spec, person);
        const { level, progress } = placeAgainst(lift.estimate, thresholds);
        const bodyLoad = (spec.bw ?? 0) * bodyKg;

        for (const regionId of spec.regions) {
            const region = regions.get(regionId);
            const better =
                region.level === null || level > region.level || (level === region.level && progress > region.progress);
            if (!better) continue;

            region.level = level;
            region.progress = progress;
            region.best = {
                exerciseId: lift.exerciseId,
                exerciseName: lift.exerciseName,
                estimateKg: lift.estimate - bodyLoad,
                weightKg: lift.weightKg,
                reps: lift.reps,
                rir: lift.rir,
                bodyweight: Boolean(spec.bw),
            };
            region.next = level < LEVELS.length - 1 ? { level: level + 1, kg: Math.max(0, thresholds[level] - bodyLoad) } : null;
        }
    }

    return { regions, person };
}

/** Exercise ids that count toward a muscle, for telling someone what to log. */
export function exercisesFor(regionId) {
    return Object.entries(EXERCISES)
        .filter(([, spec]) => spec.regions.includes(regionId))
        .map(([id]) => id);
}
