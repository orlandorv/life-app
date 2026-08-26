/**
 * Plain-language coaching hints derived from what a template already
 * prescribes, rather than stored alongside it — so they follow the steppers
 * live and can't drift out of sync the way a written note would.
 *
 * Wording follows the plan's own rules: work a rep range and add weight only
 * once every set reaches the top of it (double progression), compounds at
 * 1-2 RIR, most isolation work at about 1, and no chasing failure on the
 * big lifts.
 */

// Templates store only the top of the range — the number double progression
// is chased toward. These are the conventional bottoms that pair with it
// (4-6 strength work, 6-10, 8-12, 10-15, 12-20 hypertrophy), which is also
// exactly how the plan's own ranges are written.
const RANGE_BOTTOMS = { 6: 4, 8: 5, 10: 6, 12: 8, 15: 10, 20: 12 };

function rangeBottom(topReps) {
    if (RANGE_BOTTOMS[topReps]) return RANGE_BOTTOMS[topReps];
    // Roughly two thirds, which is the shape of every pair above, kept at
    // least one rep below the top so the range is never empty or inverted.
    return Math.max(1, Math.min(topReps - 1, Math.round(topReps * 0.65)));
}

export function repRangeGuidance(topReps) {
    if (!(topReps > 1)) return `Work up to ${topReps} rep${topReps === 1 ? '' : 's'} per set.`;
    return `Work in the ${rangeBottom(topReps)}–${topReps} rep range — add weight once every set reaches ${topReps}.`;
}

export function rirGuidance(rir) {
    if (rir >= 2) return 'Target 1–2 RIR — stop a couple of reps short, don’t chase failure.';
    if (rir === 1) return 'Target ~1 RIR — failure only on a final safe set.';
    return 'Training to failure — the plan avoids this on squats, presses and rows.';
}
