/**
 * The bar a lift has to clear before it's time to add weight. Pure (no DOM, no
 * storage), so the rule lives in one place that the live "ready to progress"
 * badge, the XP for a finished workout and the progression suggestion all read.
 */

/**
 * Did every working set of this exercise meet its prescription: at least the
 * target reps, with at least the target RIR left? An exercise with no numeric
 * `targetReps` (a workout from before targets were recorded) never counts.
 *
 * It is the one rule behind two slightly different questions, and the options
 * keep each answer exactly what it was:
 *
 * - **Default — a saved workout** (XP, history, the suggestion). Only sets that
 *   were done count, and a set with no RIR recorded counts as 0 RIR left, so it
 *   clears a target of 0 and nothing higher.
 * - **`live: true` — a workout still open.** Every non-warm-up set must already
 *   be ticked, and a set with no RIR value fails. (A `null` RIR still compares
 *   as 0, as it always has; the comparison is written exactly as it was.)
 */
export function entryMetBar(entry, { live = false } = {}) {
    if (!Number.isFinite(entry.targetReps)) return false;

    const targetRir = entry.targetRir ?? 0;
    const notWarmup = (entry.sets || []).filter((set) => !set.warmup);

    if (live) {
        if (!notWarmup.length) return false;
        return notWarmup.every((set) => set.done && set.reps >= entry.targetReps && set.rir >= targetRir);
    }

    const working = notWarmup.filter((set) => Boolean(set.done));
    if (!working.length) return false;
    return working.every((set) => set.reps >= entry.targetReps && (set.rir ?? 0) >= targetRir);
}
