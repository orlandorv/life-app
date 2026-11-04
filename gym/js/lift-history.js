import { addDays, daysBetween, localDayId } from '../../life/dates.js';
import { estimateOneRepMax, isLoggedWork } from './strength.js';

/**
 * How one lift has gone over time: a point per session, three ways of reading
 * it, and the chart geometry. Pure (no DOM, no storage), so what a chart shows
 * is checked in Node. Weights are kg here and converted at the display edge.
 */

/**
 * One row per workout the lift was done in, oldest first. Only logged work
 * counts (a ticked, non-warm-up set with a weight), exactly as Records does.
 *
 * - `topKg` / `topReps`: the heaviest set (ties go to more reps).
 * - `e1rmKg`: the best estimated one-rep max in the session, or null when every
 *   set was too high-rep for the estimate to mean anything.
 * - `volumeKg`: weight x reps, summed over the session's sets.
 */
export function liftSessions(workouts, exerciseId) {
    const sessions = [];

    for (const workout of workouts) {
        const sets = (workout.entries || [])
            .filter((entry) => entry.exerciseId === exerciseId)
            .flatMap((entry) => entry.sets || [])
            .filter(isLoggedWork);
        if (!sets.length) continue;

        let top = sets[0];
        let e1rmKg = null;
        let volumeKg = 0;
        for (const set of sets) {
            if (set.weightKg > top.weightKg || (set.weightKg === top.weightKg && set.reps > top.reps)) top = set;
            const estimate = estimateOneRepMax(set);
            if (estimate !== null && (e1rmKg === null || estimate > e1rmKg)) e1rmKg = estimate;
            volumeKg += set.weightKg * set.reps;
        }

        sessions.push({
            workoutId: workout.id,
            at: workout.startedAt,
            day: localDayId(new Date(workout.startedAt)),
            topKg: top.weightKg,
            topReps: top.reps,
            e1rmKg,
            volumeKg,
            sets: sets.length,
        });
    }

    return sessions.sort((a, b) => a.at.localeCompare(b.at));
}

/** The three readings a session can be charted by. */
export const METRICS = {
    top: { label: 'Top weight', value: (session) => session.topKg },
    e1rm: { label: 'Est. 1RM', value: (session) => session.e1rmKg },
    volume: { label: 'Volume', value: (session) => session.volumeKg },
};

/**
 * A session per point for one metric, oldest first. A session with no value
 * for it (no estimate) is skipped, never drawn as zero. `isBest` marks a point
 * that beat everything before it; the first point has nothing to beat, so it
 * is never one.
 */
export function metricPoints(sessions, metric) {
    const read = METRICS[metric].value;
    const points = [];
    let best = -Infinity;

    for (const session of sessions) {
        const value = read(session);
        if (value === null || value === undefined || !Number.isFinite(value)) continue;
        points.push({ day: session.day, value, isBest: points.length > 0 && value > best, session });
        best = Math.max(best, value);
    }

    return points;
}

/** The chart ranges: how far back from today, or null for everything. */
export const RANGES = {
    '3m': { label: '3 months', days: 91 },
    '1y': { label: '1 year', days: 365 },
    all: { label: 'All', days: null },
};

/** The points inside a range, ending today; "all" starts at the first point. */
export function pointsInRange(points, range, today) {
    const { days } = RANGES[range];
    if (days === null || !points.length) return points;
    const from = addDays(today, -days);
    return points.filter((point) => point.day >= from);
}

/**
 * Pixel positions for the chart: a dot per point joined by a line, over the
 * first-to-last day. The value axis is padded and never collapses to nothing,
 * so a lift that hasn't moved draws a flat line, not a division by zero. It
 * does *not* start at zero: a lift's progress is the change, and from zero a
 * 10 kg gain would be a hair's breadth. Null with fewer than two points.
 */
export function liftChartLayout(points, { width, height, padX = 8, padTop = 12, padBottom = 18 }) {
    if (points.length < 2) return null;

    const values = points.map((point) => point.value);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (hi - lo < Math.abs(hi) * 0.05 || hi === lo) {
        const mid = (hi + lo) / 2;
        const half = Math.max(Math.abs(mid) * 0.025, 0.5);
        lo = mid - half;
        hi = mid + half;
    }
    const pad = (hi - lo) * 0.12;
    const bottom = lo - pad;
    const top = hi + pad;

    const first = points[0].day;
    const last = points[points.length - 1].day;
    const span = Math.max(1, daysBetween(first, last));
    const x = (day) => padX + (daysBetween(first, day) / span) * (width - padX * 2);
    const y = (value) => padTop + (1 - (value - bottom) / (top - bottom)) * (height - padTop - padBottom);

    const dots = points.map((point) => ({ day: point.day, value: point.value, isBest: point.isBest, x: x(point.day), y: y(point.value) }));
    const line = dots.map((dot, i) => `${i === 0 ? 'M' : 'L'}${dot.x.toFixed(1)} ${dot.y.toFixed(1)}`).join(' ');
    const ticks = [lo, (lo + hi) / 2, hi].map((value) => ({ value, y: y(value) }));

    return { dots, line, ticks, from: first, to: last };
}

/** Headline facts about a lift across all its sessions; null with none. */
export function liftStats(sessions) {
    if (!sessions.length) return null;

    let best = sessions[0];
    let e1rmKg = null;
    for (const session of sessions) {
        if (session.topKg > best.topKg || (session.topKg === best.topKg && session.topReps > best.topReps)) best = session;
        if (session.e1rmKg !== null && (e1rmKg === null || session.e1rmKg > e1rmKg)) e1rmKg = session.e1rmKg;
    }

    const first = sessions[0];
    const latest = sessions[sessions.length - 1];
    return {
        sessions: sessions.length,
        bestKg: best.topKg,
        bestReps: best.topReps,
        e1rmKg,
        firstDay: first.day,
        latestDay: latest.day,
        firstTopKg: first.topKg,
        latestTopKg: latest.topKg,
    };
}
