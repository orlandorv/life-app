/**
 * Plain-language guidance for a target RIR, derived from the number the
 * template actually prescribes rather than stored alongside it — so it can't
 * drift out of sync with the stepper the way a written note would.
 *
 * Wording follows the plan's own effort rules: compounds at 1-2 RIR, most
 * isolation work at about 1, and no chasing failure on the big lifts.
 */
export function rirGuidance(rir) {
    if (rir >= 2) return 'Target 1–2 RIR — stop a couple of reps short, don’t chase failure.';
    if (rir === 1) return 'Target ~1 RIR — failure only on a final safe set.';
    return 'Training to failure — the plan avoids this on squats, presses and rows.';
}
