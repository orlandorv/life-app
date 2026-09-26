/**
 * Pure arithmetic for the Nutrition screen — no DOM, no storage, so it can be
 * checked on its own.
 */

/** A target of 0 (or blank) means "not set", never "zero calories allowed". */
export function hasTarget(target) {
    return Number.isFinite(target) && target > 0;
}

/** Totals across entries. Entries from before carbs and fat were tracked count them as 0. */
export function dayTotals(entries) {
    return entries.reduce(
        (sum, entry) => ({
            kcal: sum.kcal + (entry.kcal || 0),
            proteinG: sum.proteinG + (entry.proteinG || 0),
            carbsG: sum.carbsG + (entry.carbsG || 0),
            fatG: sum.fatG + (entry.fatG || 0),
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );
}

/**
 * Calories implied by macros (4 kcal/g protein and carbs, 9 kcal/g fat) — used
 * to show whether macro targets add up to the calorie target.
 */
export function kcalFromMacros({ proteinG = 0, carbsG = 0, fatG = 0 }) {
    return Math.round((proteinG || 0) * 4 + (carbsG || 0) * 4 + (fatG || 0) * 9);
}

/**
 * How far along a target you are: a 0–1 fill for the bar, whether you've
 * passed it, and what's left. `null` when there's no target to measure against.
 */
export function progress(value, target) {
    if (!hasTarget(target)) return null;
    return {
        fraction: Math.min(1, Math.max(0, value / target)),
        over: value > target,
        remaining: Math.max(0, target - value),
    };
}
