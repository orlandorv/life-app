/**
 * Fitting a weekly plan to the week you actually train. Pure (no DOM, no storage),
 * so it is checked in Node.
 *
 * The weekly volume targets are added up from the plans that count toward the week.
 * If those plans add up to more sessions than you aim to train (five plans for a
 * three-session week), adding them all up asks for sets you were never going to do.
 * So the targets are scaled down in proportion — three sessions of five plans is 3/5
 * of every muscle's planned sets. A plan that is smaller than your week (two plans for
 * three sessions) is left alone: it is never scaled *up*, because the sets you
 * programmed are the sets you programmed.
 */

/** The share of the plan a week actually trains: `sessions / planned`, never above 1 (and 1 with no plan to scale). */
export function planScale(plannedSessions, weeklySessions) {
    if (!(plannedSessions > 0) || !(weeklySessions > 0)) return 1;
    return Math.min(1, weeklySessions / plannedSessions);
}

/**
 * `targets` (muscle → planned sets) scaled by `scale`, to whole sets. A muscle that
 * is planned at all keeps at least one set, so scaling can't make a muscle vanish
 * from the card; a scale of 1 returns the same numbers.
 */
export function scaleTargets(targets, scale) {
    if (scale >= 1) return new Map(targets);
    const scaled = new Map();
    for (const [muscle, sets] of targets) {
        if (!(sets > 0)) continue;
        scaled.set(muscle, Math.max(1, Math.round(sets * scale)));
    }
    return scaled;
}

/** How often a muscle is trained in a week of `scale` of the plan (a fraction: two of five plans over three sessions is 1.2). */
export function scaleFrequency(frequency, scale) {
    const scaled = new Map();
    for (const [muscle, count] of frequency) scaled.set(muscle, count * Math.min(1, scale));
    return scaled;
}
