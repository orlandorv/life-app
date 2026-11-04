import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isWeekly,
    isScheduled,
    isDue,
    weekCount,
    weekTarget,
    weekCells,
    weekTally,
    weekProgress,
    currentStreak,
    longestStreak,
    EVERY_DAY,
} from '../habits/streaks.js';
import { addDays, weekdayIndex } from '../life/dates.js';

// --- The daily code this was added to, verbatim ---------------------------------
// Fixed-day habits must come out exactly as they always did, so these are kept
// as the reference the fuzz below holds the current code to.

const refScheduled = (habit, dayId) => dayId >= habit.startDay && habit.days.includes(weekdayIndex(dayId));

function refCurrent(habit, done, today) {
    let streak = 0;
    for (let day = today; day >= habit.startDay; day = addDays(day, -1)) {
        if (!refScheduled(habit, day)) continue;
        if (done.has(day)) streak += 1;
        else if (day !== today) break;
    }
    return streak;
}

function refLongest(habit, done, today) {
    let best = 0;
    let run = 0;
    for (let day = habit.startDay; day <= today; day = addDays(day, 1)) {
        if (!refScheduled(habit, day)) continue;
        if (done.has(day)) {
            run += 1;
            best = Math.max(best, run);
        } else if (day !== today) {
            run = 0;
        }
    }
    return best;
}

function refCells(habit, done, weekStart, today) {
    return Array.from({ length: 7 }, (_, index) => {
        const day = addDays(weekStart, index);
        let state;
        if (!refScheduled(habit, day)) state = 'off';
        else if (day > today) state = 'future';
        else if (done.has(day)) state = 'done';
        else if (day === today) state = 'open';
        else state = 'missed';
        return { day, state };
    });
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

test('fixed-day habits behave exactly as before (fuzz)', () => {
    const rand = mulberry32(8080);
    const base = '2026-06-01';
    let streaks = 0;
    for (let i = 0; i < 4000; i += 1) {
        const startDay = addDays(base, Math.floor(rand() * 120));
        const today = addDays(startDay, Math.floor(rand() * 90) - 5);
        const days = EVERY_DAY.filter(() => rand() < 0.55);
        const habit = { startDay, days: days.length ? days : [Math.floor(rand() * 7)] };
        const done = new Set();
        for (let d = addDays(startDay, -3); d <= addDays(today, 3); d = addDays(d, 1)) if (rand() < 0.6) done.add(d);

        assert.equal(currentStreak(habit, done, today), refCurrent(habit, done, today), `current #${i}`);
        assert.equal(longestStreak(habit, done, today), refLongest(habit, done, today), `longest #${i}`);
        const weekStart = addDays(today, -weekdayIndex(today) - 7 * Math.floor(rand() * 3));
        const cells = weekCells(habit, done, weekStart, today);
        assert.deepEqual(cells, refCells(habit, done, weekStart, today), `cells #${i}`);
        assert.deepEqual(weekProgress(habit, done, weekStart, today), weekTally(cells), `progress #${i}`);
        assert.equal(isDue(habit, done, today), isScheduled(habit, today), `due #${i}`);
        if (currentStreak(habit, done, today) > 2) streaks += 1;
    }
    assert.ok(streaks > 200, `only ${streaks} cases had a real streak`);
});

// --- Weekly habits -------------------------------------------------------------

// Monday 5 October 2026 starts the week used throughout.
const WEEK = '2026-10-05'; // Mon
const day = (offset) => addDays(WEEK, offset); // 0 = Mon … 6 = Sun
const ticks = (...days) => new Set(days);
const weekly = (target, startDay = '2026-08-03') => ({ id: 'h', name: 'Run', days: EVERY_DAY, startDay, weeklyTarget: target });

test('a weekly target is 1 to 6 whole times a week', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) assert.equal(isWeekly(weekly(n)), true, String(n));
    for (const bad of [0, 7, 2.5, -1, '3', null, undefined, Number.NaN]) assert.equal(isWeekly({ ...weekly(3), weeklyTarget: bad }), false, String(bad));
    assert.equal(isWeekly({ days: EVERY_DAY, startDay: '2026-08-03' }), false);
});

test('a week counts its own ticks, Monday to Sunday', () => {
    const h = weekly(3);
    const done = ticks(day(-1), day(0), day(2), day(6), day(7)); // Sun before, Mon, Wed, Sun, Mon after
    assert.equal(weekCount(h, done, WEEK), 3);
    assert.equal(weekCount(h, done, day(-7)), 1);
    assert.equal(weekCount(h, new Set(), WEEK), 0);
});

test('ticks from before the habit began are not counted', () => {
    const h = weekly(3, day(3)); // began Thursday
    assert.equal(weekCount(h, ticks(day(0), day(1), day(3)), WEEK), 1);
});

test('the first week only asks for the days it had', () => {
    assert.equal(weekTarget(weekly(3, day(0)), WEEK), 3); // began Monday: a whole week
    assert.equal(weekTarget(weekly(3, day(4)), WEEK), 3); // Friday: Fri, Sat, Sun is 3 days
    assert.equal(weekTarget(weekly(5, day(4)), WEEK), 3); // can't ask for 5 in 3 days
    assert.equal(weekTarget(weekly(3, day(6)), WEEK), 1); // began Sunday: one day
    assert.equal(weekTarget(weekly(5, day(4)), day(7)), 5); // every later week asks the full amount
});

test('due until the week is done; ticked that day stays counted; a fixed habit is untouched', () => {
    const h = weekly(2);
    assert.equal(isDue(h, ticks(), day(3)), true);
    assert.equal(isDue(h, ticks(day(0)), day(3)), true, 'one of two: still wanted');
    assert.equal(isDue(h, ticks(day(0), day(1)), day(3)), false, 'target met: no longer asked of you');
    assert.equal(isDue(h, ticks(day(0), day(1)), day(1)), true, 'but the tick that met it still counts that day');
    assert.equal(isDue(h, ticks(day(0), day(1)), day(7)), true, 'a new week starts at zero');
    assert.equal(isDue(weekly(2, day(3)), ticks(), day(1)), false, 'not before it began');
    assert.equal(isDue({ days: [0, 2], startDay: '2026-08-03' }, ticks(), day(2)), true);
    assert.equal(isDue({ days: [0, 2], startDay: '2026-08-03' }, ticks(), day(1)), false);
});

test('a weekly habit\'s week has no missed days: an unticked past day is free', () => {
    const h = weekly(3, day(1)); // began Tuesday
    const cells = weekCells(h, ticks(day(1), day(3)), WEEK, day(4));
    assert.deepEqual(cells.map((c) => c.state), ['off', 'done', 'free', 'done', 'free', 'future', 'future']);
    assert.ok(!cells.some((c) => c.state === 'missed' || c.state === 'open'));
});

test('weekly progress is ticks against the target, capped', () => {
    const h = weekly(3);
    assert.deepEqual(weekProgress(h, ticks(day(0)), WEEK, day(2)), { done: 1, due: 3 });
    assert.deepEqual(weekProgress(h, ticks(day(0), day(1), day(2), day(3)), WEEK, day(4)), { done: 3, due: 3 }, 'a fourth day is not "4 of 3"');
    assert.deepEqual(weekProgress(weekly(5, day(4)), ticks(day(4)), WEEK, day(4)), { done: 1, due: 3 }, 'first week asks only for the days it had');
});

// --- Streaks, counted in weeks -------------------------------------------------

// A habit begun on Monday 3 August: weeks start 3, 10, 17, 24 Aug, 31 Aug, 7, 14, 21, 28 Sept, 5 Oct …
const W = (n) => addDays('2026-08-03', 7 * n); // start of week n
const inWeek = (n, ...offsets) => offsets.map((o) => addDays(W(n), o));
const run = (n, count) => inWeek(n, ...Array.from({ length: count }, (_, i) => i));

test('weeks in a row that hit the target, this week included once it has', () => {
    const h = weekly(3);
    const today = addDays(W(9), 2); // Wed of the 10th week (5 Oct)
    // weeks 6, 7, 8 met; this week (9) has 3 ticks already
    const done = ticks(...run(6, 3), ...run(7, 3), ...run(8, 3), ...run(9, 3));
    assert.equal(currentStreak(h, done, today), 4);
});

test('this week being short so far does not break the run', () => {
    const h = weekly(3);
    const today = addDays(W(9), 1);
    const done = ticks(...run(7, 3), ...run(8, 3), ...run(9, 1));
    assert.equal(currentStreak(h, done, today), 2);
});

test('a short week that is over breaks it', () => {
    const h = weekly(3);
    const today = addDays(W(9), 1);
    const done = ticks(...run(6, 3), ...run(7, 2), ...run(8, 3), ...run(9, 3));
    assert.equal(currentStreak(h, done, today), 2, 'weeks 8 and 9; week 7 had only 2');
});

test('nothing ticked is no streak', () => {
    assert.equal(currentStreak(weekly(3), new Set(), addDays(W(5), 3)), 0);
    assert.equal(longestStreak(weekly(3), new Set(), addDays(W(5), 3)), 0);
});

test('the best run, wherever it was', () => {
    const h = weekly(2);
    const today = addDays(W(9), 6);
    // weeks 1-4 met (4 in a row), 5 missed, 6-7 met (2), 8 missed, 9 met
    const done = ticks(...run(1, 2), ...run(2, 2), ...run(3, 2), ...run(4, 2), ...run(6, 2), ...run(7, 2), ...run(9, 2));
    assert.equal(longestStreak(h, done, today), 4);
    assert.equal(currentStreak(h, done, today), 1, 'week 9 met, week 8 missed');
});

test('a habit begun midweek is not failed for the days before it existed', () => {
    const h = weekly(3, addDays(W(5), 4)); // began on a Friday
    const today = addDays(W(7), 0);
    // first week: Fri + Sat + Sun = all 3 available days ticked (its effective target is 3); week 6 met; week 7 just begun
    const done = ticks(...inWeek(5, 4, 5, 6), ...run(6, 3));
    assert.equal(currentStreak(h, done, today), 2);
    // a first week with only two of its three days ticked is a miss, as any week would be
    const short = ticks(...inWeek(5, 4, 5), ...run(6, 3));
    assert.equal(currentStreak(h, short, today), 1);
});

test('"weekly" with a target of every day available is still not a fixed-day habit', () => {
    // 6 a week on a habit that exists every day: ticking six different days is the target
    const h = weekly(6);
    assert.equal(currentStreak(h, ticks(...run(9, 6)), addDays(W(9), 6)), 1);
});

test('a week before a weekly habit existed asks for nothing', () => {
    const h = weekly(3, day(3));
    assert.deepEqual(weekProgress(h, ticks(), day(-7), day(10)), { done: 0, due: 0 });
    assert.deepEqual(weekProgress(h, ticks(), WEEK, day(10)), { done: 0, due: 3 }, 'the week it began in asks for its days');
});
