import { addDays } from '../../life/dates.js';
import { average } from '../../body/stats.js';
import { weekSummary } from '../../nutrition/week.js';

/**
 * What the weekly check-in can read from the rest of Life instead of asking
 * you to type it: the week's average weight and steps from Body, and average
 * protein from Nutrition. Pure (no DOM, no storage), so it's checked in Node.
 *
 * Averages are over the days that have the number: a day with no weigh-in or no
 * food logged is a gap, never a zero. A figure there's nothing to average is
 * null, which leaves the field blank for you to fill or skip.
 */

const present = (value) => Number.isFinite(value) && value > 0;

/**
 * `weekId` is the Monday the check-in is filed under; nothing after `today` is
 * counted. `bodyEntries` are Body's `{ day, weightKg, sleepHours, steps }` rows
 * and `nutritionDays` a Map of day to that day's food entries.
 */
export function deriveCheckin({ weekId, today, bodyEntries, nutritionDays }) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekId, i)).filter((day) => day <= today);
    const inWeek = bodyEntries.filter((entry) => days.includes(entry.day));

    const weights = inWeek.map((entry) => entry.weightKg).filter(present);
    const steps = inWeek.map((entry) => entry.steps).filter(present);
    const food = weekSummary({ days, byDay: nutritionDays, targets: null });

    return {
        // One decimal: the check-in is a weekly figure, not a scale reading.
        bodyWeightKg: weights.length ? Math.round(average(weights) * 10) / 10 : null,
        weighIns: weights.length,
        steps: steps.length ? Math.round(average(steps)) : null,
        stepsDays: steps.length,
        proteinG: food.avg && food.avg.proteinG > 0 ? Math.round(food.avg.proteinG) : null,
        proteinDays: food.avg && food.avg.proteinG > 0 ? food.daysLogged : 0,
    };
}

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The line under a pre-filled field, saying where its number came from. */
export function derivedHint(field, derived) {
    const source =
        field === 'weight'
            ? `Body: average of ${plural(derived.weighIns, 'weigh-in')}`
            : field === 'steps'
              ? `Body: average over ${plural(derived.stepsDays, 'day')} with steps`
              : `Nutrition: average over ${plural(derived.proteinDays, 'logged day')}`;
    return `Filled from ${source}. Change it if you like.`;
}

/**
 * Which blank fields of a draft check-in the derived figures can fill, as
 * `{ field: value }`. A field that already has a value is left alone, so
 * opening a saved check-in never overwrites what you recorded.
 */
export function fillsFor(draft, derived) {
    const fills = {};
    if (draft.bodyWeightKg == null && derived.bodyWeightKg !== null) fills.weight = derived.bodyWeightKg;
    if (draft.steps == null && derived.steps !== null) fills.steps = derived.steps;
    if (draft.proteinG == null && derived.proteinG !== null) fills.protein = derived.proteinG;
    return fills;
}
