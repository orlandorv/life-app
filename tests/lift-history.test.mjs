import test from 'node:test';
import assert from 'node:assert/strict';
import { liftSessions, metricPoints, pointsInRange, liftChartLayout, liftStats, METRICS, RANGES } from '../gym/js/lift-history.js';
import { estimateOneRepMax } from '../gym/js/strength.js';

const at = (day, hour = 10) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, hour, 0).toISOString();
};
const set = (weightKg, reps, rir = 2, extra = {}) => ({ weightKg, reps, rir, done: true, ...extra });
const workout = (day, entries, id = `w-${day}`) => ({ id, startedAt: at(day), entries });
const bench = (...sets) => ({ exerciseId: 'bench', sets });

test('a session per workout the lift was done in, oldest first, whatever order they arrive in', () => {
    const newestFirst = [
        workout('2026-11-04', [bench(set(100, 6))]),
        workout('2026-10-28', [{ exerciseId: 'squat', sets: [set(140, 5)] }]), // not this lift
        workout('2026-10-21', [bench(set(95, 6))]),
    ];
    const sessions = liftSessions(newestFirst, 'bench');
    assert.deepEqual(sessions.map((s) => s.day), ['2026-10-21', '2026-11-04']);
    assert.deepEqual(sessions.map((s) => s.topKg), [95, 100]);
});

test('only logged work counts: not warm-ups, unticked sets or unloaded sets', () => {
    const [session] = liftSessions(
        [workout('2026-11-04', [bench(set(40, 8, 5, { warmup: true }), set(100, 6), set(105, 6, 2, { done: false }), set(0, 10), set(100, 6))])],
        'bench',
    );
    assert.equal(session.topKg, 100);
    assert.equal(session.sets, 2);
    assert.equal(session.volumeKg, 1200);
    assert.deepEqual(liftSessions([workout('2026-11-04', [bench(set(40, 8, 5, { warmup: true }))])], 'bench'), []);
});

test('the top set is the heaviest, and a tie goes to more reps', () => {
    const [session] = liftSessions([workout('2026-11-04', [bench(set(100, 4), set(100, 6), set(90, 10))])], 'bench');
    assert.equal(session.topKg, 100);
    assert.equal(session.topReps, 6);
});

test('the estimate is the best of the session, and absent for sets too high-rep to estimate', () => {
    const [heavy] = liftSessions([workout('2026-11-04', [bench(set(100, 6, 2), set(90, 8, 1))])], 'bench');
    assert.equal(heavy.e1rmKg, Math.max(estimateOneRepMax(set(100, 6, 2)), estimateOneRepMax(set(90, 8, 1))));
    // 20 reps + 2 left: over the formula's limit, so no number at all, never a wrong one
    const [calves] = liftSessions([workout('2026-11-04', [{ exerciseId: 'calf', sets: [set(60, 20, 2), set(60, 18, 2)] }])], 'calf');
    assert.equal(calves.e1rmKg, null);
    assert.equal(calves.volumeKg, 60 * 20 + 60 * 18);
});

test('an exercise listed twice in a workout is one session', () => {
    const [session] = liftSessions([workout('2026-11-04', [bench(set(100, 6)), bench(set(102.5, 5))])], 'bench');
    assert.equal(session.sets, 2);
    assert.equal(session.topKg, 102.5);
});

test('two workouts on one day are two sessions', () => {
    const sessions = liftSessions([workout('2026-11-04', [bench(set(100, 6))], 'a'), { ...workout('2026-11-04', [bench(set(80, 6))], 'b'), startedAt: at('2026-11-04', 18) }], 'bench');
    assert.equal(sessions.length, 2);
    assert.deepEqual(sessions.map((s) => s.workoutId), ['a', 'b']);
});

// --- Metrics and bests -----------------------------------------------------------

const sessionsOf = (...tops) => liftSessions(tops.map(([day, kg, reps = 6]) => workout(day, [bench(set(kg, reps))])), 'bench');

test('a new best is a point that beat everything before it; the first never is', () => {
    const points = metricPoints(sessionsOf(['2026-10-01', 80], ['2026-10-08', 85], ['2026-10-15', 82], ['2026-10-22', 85], ['2026-10-29', 90]), 'top');
    assert.deepEqual(points.map((p) => p.isBest), [false, true, false, false, true]);
});

test('a session with no estimate is skipped, not drawn as zero', () => {
    const sessions = liftSessions(
        [workout('2026-10-01', [bench(set(100, 6))]), workout('2026-10-08', [bench(set(40, 25, 0))]), workout('2026-10-15', [bench(set(105, 6))])],
        'bench',
    );
    const points = metricPoints(sessions, 'e1rm');
    assert.equal(points.length, 2);
    assert.deepEqual(points.map((p) => p.day), ['2026-10-01', '2026-10-15']);
    // ...but the same sessions still all exist for the other readings
    assert.equal(metricPoints(sessions, 'top').length, 3);
});

test('volume is a reading of its own', () => {
    const points = metricPoints(sessionsOf(['2026-10-01', 100, 5], ['2026-10-08', 100, 8]), 'volume');
    assert.deepEqual(points.map((p) => p.value), [500, 800]);
    assert.equal(METRICS.volume.label, 'Volume');
});

// --- Ranges ----------------------------------------------------------------------

test('ranges are measured back from today, and all keeps everything', () => {
    const points = metricPoints(sessionsOf(['2025-01-01', 70], ['2026-08-10', 90], ['2026-08-11', 91], ['2026-11-04', 100]), 'top');
    const today = '2026-11-04';
    assert.equal(pointsInRange(points, 'all', today).length, 4);
    // 91 days before 4 Nov is 5 Aug: 10 and 11 Aug are inside, the 2025 one is not
    assert.deepEqual(pointsInRange(points, '3m', today).map((p) => p.day), ['2026-08-10', '2026-08-11', '2026-11-04']);
    assert.deepEqual(pointsInRange(points, '1y', today).map((p) => p.day), ['2026-08-10', '2026-08-11', '2026-11-04']);
    assert.equal(RANGES.all.days, null);
    assert.deepEqual(pointsInRange([], '3m', today), []);
});

test('a point exactly at the edge of the range is inside it', () => {
    const points = metricPoints(sessionsOf(['2026-08-05', 90], ['2026-11-04', 100]), 'top');
    assert.equal(pointsInRange(points, '3m', '2026-11-04').length, 2);
    assert.equal(pointsInRange(metricPoints(sessionsOf(['2026-08-04', 90], ['2026-11-04', 100]), 'top'), '3m', '2026-11-04').length, 1);
});

// --- Chart geometry --------------------------------------------------------------

const size = { width: 360, height: 170 };

test('fewer than two points draws nothing', () => {
    assert.equal(liftChartLayout([], size), null);
    assert.equal(liftChartLayout(metricPoints(sessionsOf(['2026-10-01', 80]), 'top'), size), null);
});

test('higher is further up, later is further right, and everything stays inside the frame', () => {
    const points = metricPoints(sessionsOf(['2026-10-01', 80], ['2026-10-15', 90], ['2026-10-29', 100]), 'top');
    const layout = liftChartLayout(points, size);
    assert.equal(layout.dots.length, 3);
    assert.ok(layout.dots[0].x < layout.dots[1].x && layout.dots[1].x < layout.dots[2].x);
    assert.ok(layout.dots[0].y > layout.dots[1].y && layout.dots[1].y > layout.dots[2].y, 'a heavier lift should sit higher on screen');
    assert.equal(layout.dots[0].x, 8);
    assert.equal(layout.dots[2].x, 352);
    for (const dot of layout.dots) assert.ok(dot.y >= 0 && dot.y <= size.height, `y ${dot.y} is off the chart`);
    assert.equal(layout.ticks.length, 3);
    assert.equal(layout.from, '2026-10-01');
    assert.equal(layout.to, '2026-10-29');
    assert.match(layout.line, /^M[\d.]+ [\d.]+ L/);
    assert.deepEqual(layout.dots.map((d) => d.isBest), [false, true, true]);
});

test('a lift that has not moved draws a flat line, not a crash', () => {
    const layout = liftChartLayout(metricPoints(sessionsOf(['2026-10-01', 100], ['2026-10-15', 100], ['2026-10-29', 100]), 'top'), size);
    assert.ok(layout.dots.every((d) => Number.isFinite(d.x) && Number.isFinite(d.y)));
    assert.equal(new Set(layout.dots.map((d) => d.y)).size, 1);
    assert.ok(layout.ticks.every((t) => Number.isFinite(t.y) && Number.isFinite(t.value)));
});

test('sessions on the same day share a column', () => {
    const layout = liftChartLayout(metricPoints(sessionsOf(['2026-10-01', 80], ['2026-10-29', 90], ['2026-10-29', 95]), 'top'), size);
    assert.equal(layout.dots[1].x, layout.dots[2].x);
});

test('a small change is shown small: the axis does not stretch noise to the full height', () => {
    // 100 -> 100.5 kg is half a percent; it should not look like a climb
    const layout = liftChartLayout(metricPoints(sessionsOf(['2026-10-01', 100], ['2026-10-29', 100.5]), 'top'), size);
    const rise = layout.dots[0].y - layout.dots[1].y;
    assert.ok(rise < (size.height - 30) * 0.3, `a 0.5% change rose ${rise}px`);
});

// --- Facts -----------------------------------------------------------------------

test('headline facts across the lift', () => {
    assert.equal(liftStats([]), null);
    const stats = liftStats(sessionsOf(['2026-10-01', 80, 8], ['2026-10-15', 100, 4], ['2026-10-29', 95, 6]));
    assert.equal(stats.sessions, 3);
    assert.equal(stats.bestKg, 100);
    assert.equal(stats.bestReps, 4);
    assert.equal(stats.firstTopKg, 80);
    assert.equal(stats.latestTopKg, 95);
    assert.equal(stats.firstDay, '2026-10-01');
    assert.equal(stats.latestDay, '2026-10-29');
    assert.ok(stats.e1rmKg >= 100);
});

test('no estimate anywhere is null, not zero', () => {
    const stats = liftStats(liftSessions([workout('2026-10-01', [{ exerciseId: 'calf', sets: [set(60, 25, 0)] }])], 'calf'));
    assert.equal(stats.e1rmKg, null);
});
