import { addDays, weekdayIndex, weekStartId } from '../life/dates.js';

/**
 * Schedule and streak arithmetic for Habits — pure, so it can be checked
 * without a DOM or a database. A "day" is a local `YYYY-MM-DD`; those compare
 * correctly as plain strings. `done` is a Set of the days a habit was ticked.
 */

/** Monday=0 … Sunday=6, matching `weekdayIndex`. */
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * A habit is either on **fixed days** (`days`, the weekdays it is due) or has a
 * **weekly target** ("3 times a week"): `weeklyTarget` times in a Monday-to-Sunday
 * week, on whichever days you like. A weekly habit stores `days` as every day, so
 * it can be ticked on any day from its start, and anything that reads `days`
 * still gets a sensible answer. 7 a week would just be every day, so the target
 * runs 1 to 6.
 */
export const MAX_WEEKLY_TARGET = 6;

export const isWeekly = (habit) =>
    Number.isInteger(habit.weeklyTarget) && habit.weeklyTarget >= 1 && habit.weeklyTarget <= MAX_WEEKLY_TARGET;

/**
 * Can be ticked on `dayId`: it's one of the habit's weekdays (any day, for a
 * weekly habit) and the habit existed by then. Days before `startDay` are never
 * "missed", so adding a habit today doesn't arrive with a history of failures.
 */
export function isScheduled(habit, dayId) {
    return dayId >= habit.startDay && habit.days.includes(weekdayIndex(dayId));
}

/** How many days of the Monday-first week starting `weekStart` a weekly habit was ticked. */
export function weekCount(habit, done, weekStart) {
    let count = 0;
    for (let i = 0; i < 7; i += 1) {
        const day = addDays(weekStart, i);
        if (day >= habit.startDay && done.has(day)) count += 1;
    }
    return count;
}

/**
 * What a week asks of a weekly habit. A habit started midweek is only asked for
 * what the days it had could hold: begun on a Friday, "3 a week" can't mean 3 in
 * the first 3 days, so that first week asks for no more than the days left.
 */
export function weekTarget(habit, weekStart) {
    if (weekStart !== weekStartId(habit.startDay)) return habit.weeklyTarget;
    return Math.min(habit.weeklyTarget, 7 - weekdayIndex(habit.startDay));
}

/**
 * Counts towards today's "N of M": a fixed-day habit on its days, and a weekly
 * one while the week still wants it — or once you've ticked it that day, so the
 * tick that finishes the week doesn't make it vanish from the count.
 */
export function isDue(habit, done, dayId) {
    if (!isScheduled(habit, dayId)) return false;
    if (!isWeekly(habit)) return true;
    const week = weekStartId(dayId);
    return done.has(dayId) || weekCount(habit, done, week) < weekTarget(habit, week);
}

// Each Monday-first week from the one the habit started in to this one, oldest
// first: 'met', 'missed', or 'open' (this week, target not reached yet — there
// is still time, so it neither counts nor breaks anything).
function weeklyHistory(habit, done, today) {
    const history = [];
    const thisWeek = weekStartId(today);
    for (let week = weekStartId(habit.startDay); week <= thisWeek; week = addDays(week, 7)) {
        if (weekCount(habit, done, week) >= weekTarget(habit, week)) history.push('met');
        else history.push(week === thisWeek ? 'open' : 'missed');
    }
    return history;
}

/**
 * Consecutive scheduled days ticked, counting back from today. Days the habit
 * isn't due are skipped rather than breaking the run — a Mon/Wed/Fri habit
 * done all three days is a 3, not a 1. Today still being open doesn't break
 * it either (there's time left); any earlier scheduled day without a tick does.
 */
export function currentStreak(habit, done, today) {
    if (isWeekly(habit)) {
        // Weeks in a row that hit the target, counting back from this one. This
        // week still being short doesn't break it; an earlier short week does.
        let streak = 0;
        for (const status of weeklyHistory(habit, done, today).reverse()) {
            if (status === 'met') streak += 1;
            else if (status === 'missed') break;
        }
        return streak;
    }

    let streak = 0;

    for (let day = today; day >= habit.startDay; day = addDays(day, -1)) {
        if (!isScheduled(habit, day)) continue;
        if (done.has(day)) streak += 1;
        else if (day !== today) break;
    }

    return streak;
}

/** The best run ever, walking forward from the day the habit began. */
export function longestStreak(habit, done, today) {
    if (isWeekly(habit)) {
        let best = 0;
        let run = 0;
        for (const status of weeklyHistory(habit, done, today)) {
            if (status === 'met') {
                run += 1;
                best = Math.max(best, run);
            } else if (status === 'missed') run = 0;
        }
        return best;
    }

    let best = 0;
    let run = 0;

    for (let day = habit.startDay; day <= today; day = addDays(day, 1)) {
        if (!isScheduled(habit, day)) continue;
        if (done.has(day)) {
            run += 1;
            best = Math.max(best, run);
        } else if (day !== today) {
            run = 0;
        }
    }

    return best;
}

/**
 * The seven days of a week (Monday first) as
 * `off` (not due), `future`, `done`, `open` (due today, not yet ticked) or
 * `missed` (due and past, not ticked). A weekly habit has no day it was due on,
 * so a past or present day it wasn't ticked is just `free`: nothing was missed.
 */
export function weekCells(habit, done, weekStart, today) {
    return Array.from({ length: 7 }, (_, index) => {
        const day = addDays(weekStart, index);

        let state;
        if (!isScheduled(habit, day)) state = 'off';
        else if (day > today) state = 'future';
        else if (done.has(day)) state = 'done';
        else if (isWeekly(habit)) state = 'free';
        else if (day === today) state = 'open';
        else state = 'missed';

        return { day, state };
    });
}

/** "2 of 3" for a week: ticked so far against everything due in it. */
export function weekTally(cells) {
    return {
        done: cells.filter((cell) => cell.state === 'done').length,
        due: cells.filter((cell) => cell.state !== 'off').length,
    };
}

/**
 * How a habit's week is going, as `{ done, due }`: ticks against what the week
 * asks. For a fixed-day habit that is every day it was due this week, including
 * ones still to come, as `weekTally` counts them; for a weekly habit it is the
 * ticks against the target, capped so an extra day doesn't read as "4 of 3".
 */
export function weekProgress(habit, done, weekStart, today) {
    if (!isWeekly(habit)) return weekTally(weekCells(habit, done, weekStart, today));
    if (addDays(weekStart, 6) < habit.startDay) return { done: 0, due: 0 }; // a week before it existed
    const due = weekTarget(habit, weekStart);
    return { done: Math.min(weekCount(habit, done, weekStart), due), due };
}
