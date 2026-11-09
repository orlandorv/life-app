/**
 * Achievements: milestones read from what the app already keeps, never counted as they
 * happen (the same principle as the game and Gym's badges), so deleting data takes a
 * milestone back and a restored backup is instantly right. Pure (no DOM, no storage), so it
 * is checked in Node.
 *
 * Each **ladder** is one number that only goes up in normal use (good days, the best
 * streak, the Life level, finished workouts) and a few steps along it. A step is earned when
 * the number reaches it. Gym's own badges are a separate, richer system (gym/js/badges.js);
 * the page lists the ones earned and counts them in.
 */

export const LADDERS = [
    { id: 'good-days', title: 'Good days', blurb: 'Days you scored 70 or more', unit: 'day', steps: [1, 7, 30, 100, 365], read: (stats) => stats.goodDays },
    { id: 'streak', title: 'Best streak', blurb: 'Good days in a row', unit: 'day', steps: [3, 7, 14, 30, 60, 100], read: (stats) => stats.bestStreak },
    { id: 'level', title: 'Life level', blurb: 'From everything you log', unit: 'level', steps: [2, 5, 10, 20, 30], read: (stats) => stats.level },
    { id: 'workouts', title: 'Workouts', blurb: 'Finished in Gym', unit: 'workout', steps: [1, 10, 25, 50, 100, 250], read: (stats) => stats.workouts },
];

/** A whole number, never negative: a missing or odd value counts as none. */
const whole = (value) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

/** How a number reads on a ladder: "7 days", "1 workout", "Level 5". */
export function amountLabel(def, n) {
    if (def.unit === 'level') return `Level ${n}`;
    return `${n.toLocaleString('en-GB')} ${def.unit}${n === 1 ? '' : 's'}`;
}

/**
 * One ladder at a value: `{ id, title, blurb, value, steps: [{ at, label, earned }], earned,
 * next, toGo, fraction }`. `next` is the first step not yet reached (null at the top),
 * `toGo` how far away it is, and `fraction` how far along the way from the last step
 * reached (or zero) to the next one you are (1 at the top).
 */
export function ladderAt(def, rawValue) {
    const value = whole(rawValue);
    const steps = def.steps.map((at) => ({ at, label: amountLabel(def, at), earned: value >= at }));
    const reached = steps.filter((step) => step.earned);
    const next = steps.find((step) => !step.earned)?.at ?? null;
    const from = reached.length ? reached[reached.length - 1].at : 0;
    return {
        id: def.id,
        title: def.title,
        blurb: def.blurb,
        value,
        steps,
        earned: reached.length,
        next,
        nextLabel: next === null ? null : amountLabel(def, next),
        toGo: next === null ? 0 : next - value,
        fraction: next === null ? 1 : Math.max(0, Math.min(1, (value - from) / (next - from))),
    };
}

/**
 * Everything the page shows, from the numbers the sections keep:
 * `{ goodDays, bestStreak, level, workouts }`, plus how many Gym badges are earned and in
 * all. `earned` is every milestone reached, ladder steps and badges together.
 */
export function achievements(stats, { badgesEarned = 0, badgesTotal = 0 } = {}) {
    const ladders = LADDERS.map((def) => ladderAt(def, def.read(stats ?? {})));
    const badges = { earned: whole(badgesEarned), total: Math.max(whole(badgesTotal), whole(badgesEarned)) };
    return {
        ladders,
        badges,
        earned: ladders.reduce((sum, ladder) => sum + ladder.earned, 0) + badges.earned,
    };
}
