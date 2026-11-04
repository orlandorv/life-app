import { exerciseRole } from './prescription.js';
import { estimateOneRepMax } from './strength.js';
import { STEPS, toDisplay, fromDisplay } from './units.js';
import { roundToLoadable, loadableStep } from './plate-math.js';

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

// --- What to lift next ---------------------------------------------------------

/** A session older than this says nothing about what you can lift now. */
export const STALE_AFTER_DAYS = 42;
/** How many comparable sessions in a row fall short before a lighter weight is suggested. */
export const STALL_SESSIONS = 3;
/** A deload takes about a tenth off (rounded down to what the bar or stack allows). */
export const DELOAD_FACTOR = 0.9;

const DAY_MS = 24 * 60 * 60 * 1000;
const EPS = 1e-6;

const isAssisted = (entry) => entry.exerciseId === 'assisted-pull-up-machine' || /assisted/i.test(entry.exerciseName ?? '');

/**
 * Past sessions of this lift that are fair to compare with the one being
 * started, newest first: same exercise, and done at the **same rep target**. A
 * 4×6 on Push day says nothing about a 3×12 on Upper day, so one never
 * inherits the other's result. A past entry with no recorded `targetReps` (from
 * before targets were kept) can't be judged and is left out.
 *
 * Matched by the exercise actually done, not the plan slot: the weights are on
 * *this* lift, so a session where it was swapped in counts and a session where
 * it was swapped away from doesn't.
 */
function comparableSessions(entry, history) {
    const sessions = [];
    for (const workout of history || []) {
        const when = Date.parse(workout.finishedAt ?? workout.startedAt);
        if (!Number.isFinite(when)) continue;
        for (const past of workout.entries || []) {
            if (past.exerciseId !== entry.exerciseId || past.targetReps !== entry.targetReps) continue;
            const working = (past.sets || []).filter((set) => set.done && !set.warmup);
            if (working.length) sessions.push({ when, past, working });
        }
    }
    return sessions.sort((a, b) => b.when - a.when);
}

/**
 * The bar was met *and* the whole prescription was done: a saved workout keeps
 * only the sets you ticked, so "every set hit 8" is cheap if only two of four
 * were done. Sessions saved before `targetSets` was recorded are held to the
 * set count being asked for now.
 */
function metPrescription({ past, working }, fallbackSets) {
    const asked = Number.isFinite(past.targetSets) ? past.targetSets : fallbackSets;
    return entryMetBar(past) && working.length >= asked;
}

const topKg = ({ working }) => Math.max(...working.map((set) => set.weightKg || 0));

/**
 * Progress in a session, as a single number: the best estimated one-rep max,
 * and where sets are too high-rep for that estimate to mean anything, the best
 * weight × reps. One method is used for every session compared, never a mix.
 */
function sessionScores(sessions) {
    const estimates = sessions.map(({ working }) => Math.max(0, ...working.map((set) => estimateOneRepMax(set) ?? 0)));
    if (estimates.every((value) => value > 0)) return estimates;
    return sessions.map(({ working }) => Math.max(0, ...working.map((set) => (set.weightKg || 0) * (set.reps || 0))));
}

/** How big a jump is sensible for this lift, in display units. */
function stepFor(entry, unit) {
    const { coarse, fine } = STEPS[unit];
    const role = exerciseRole({ id: entry.exerciseId, name: entry.exerciseName, muscleGroup: entry.muscleGroup, equipment: entry.equipment });
    // Big lower-body lifts take the biggest jump; dumbbells only come in coarse steps.
    if (role === 'main' && entry.muscleGroup === 'Legs') return 2 * coarse;
    if (role === 'isolation') return entry.equipment === 'Dumbbell' ? coarse : fine;
    return coarse;
}

const clean = (value, unit) => {
    const factor = unit === 'lb' ? 10 : 100;
    return Math.round(value * factor) / factor;
};

/**
 * What to lift next time on this exercise, or null when there's nothing worth
 * saying. It suggests; it never changes anything itself.
 *
 * - **`progress`** — the last comparable session met the bar (every set at the
 *   target reps with the target RIR to spare) over the full number of sets: add
 *   a step. The step depends on the lift (see `stepFor`), and a barbell is
 *   rounded to a weight the plates can really build.
 * - **`deload`** — the last three comparable sessions all fell short and the
 *   newest wasn't a new best: about 10% lighter, rounded down.
 *
 * Nothing is suggested without recent history (under 42 days), for an assisted
 * exercise (more weight is easier there) or for an unloaded bodyweight one
 * (there's no weight to add), or when the rep target changed since last time.
 *
 * `entry` is the open workout's entry; `history` the finished workouts (any
 * order); `unit` and `bar` are the display unit and the bar's weight in it.
 * Returns the weights in kg (as stored) and in the display unit.
 */
export function suggestNext({ entry, history, unit = 'kg', bar = 20, now = new Date() }) {
    if (!entry || !Number.isFinite(entry.targetReps) || isAssisted(entry)) return null;

    const sessions = comparableSessions(entry, history);
    const last = sessions[0];
    if (!last) return null;
    if ((now.getTime() - last.when) / DAY_MS >= STALE_AFTER_DAYS) return null;

    const fromKg = topKg(last);
    if (!(fromKg > 0)) return null;
    const from = toDisplay(fromKg, unit);
    const barbell = entry.equipment === 'Barbell';
    const askedNow = Number.isFinite(entry.targetSets) ? entry.targetSets : 1;

    const make = (kind, to, used) => ({
        kind,
        unit,
        reps: entry.targetReps,
        from,
        to,
        fromKg,
        toKg: fromDisplay(to, unit),
        sessions: used,
    });

    if (metPrescription(last, askedNow)) {
        let to = from + stepFor(entry, unit);
        if (barbell) {
            to = roundToLoadable(to, bar, unit, 'nearest');
            // A fine step on a bar can round back to where it started.
            if (to <= from + EPS) to = roundToLoadable(from + loadableStep(unit), bar, unit, 'nearest');
        }
        return make('progress', clean(to, unit), 1);
    }

    const recent = sessions.slice(0, STALL_SESSIONS);
    if (recent.length < STALL_SESSIONS || recent.some((session) => metPrescription(session, askedNow))) return null;

    const [newest, ...older] = sessionScores(recent);
    if (newest > Math.max(...older) + EPS) return null; // short of the bar, but still getting stronger

    const lighter = from * DELOAD_FACTOR;
    const to = barbell
        ? roundToLoadable(lighter, bar, unit, 'down')
        : clean(Math.floor(lighter / STEPS[unit].fine + EPS) * STEPS[unit].fine, unit);
    if (!(to > 0) || to >= from - EPS) return null;
    return make('deload', to, STALL_SESSIONS);
}

/** The line shown above the "Use" button. */
export function suggestionText(suggestion) {
    const { kind, reps, from, to, unit } = suggestion;
    // A non-breaking space, so a line can never end on a number with its unit orphaned on the next.
    const show = (value) => `${Math.round(value * 100) / 100}\u00a0${unit}`;
    // Names the weight rather than saying "last time": the set rows already show
    // "Last time" for whichever session came most recently, which may be a
    // different plan at a different weight and rep range.
    return kind === 'deload'
        ? `At ${show(from)}, the last ${STALL_SESSIONS} sessions fell short of ${reps} reps a set. Try a lighter ${show(to)} to rebuild.`
        : `At ${show(from)} every set hit ${reps} reps. Try ${show(to)}.`;
}

/**
 * Is the suggestion still worth showing, given the heaviest working set that
 * hasn't been ticked yet? Once you've typed the weight yourself (or already
 * lowered it for a deload), saying it again is noise.
 */
export function suggestionStillUseful(suggestion, currentTopKg) {
    const tolerance = 0.01;
    return suggestion.kind === 'deload' ? currentTopKg > suggestion.toKg + tolerance : currentTopKg < suggestion.toKg - tolerance;
}

/**
 * What "Use" does to the sets still to do: move them together so the heaviest
 * lands on `targetKg`, keeping each set's weight relative to the others (a
 * pyramid stays a pyramid; equal sets all become the target). Never below zero.
 */
export function shiftToTop(weightsKg, targetKg) {
    const delta = targetKg - Math.max(0, ...weightsKg);
    return weightsKg.map((weight) => Math.max(0, weight + delta));
}
