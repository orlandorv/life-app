import { addDays, weekdayIndex } from '../life/dates.js';

/**
 * Schedule and streak arithmetic for Habits — pure, so it can be checked
 * without a DOM or a database. A "day" is a local `YYYY-MM-DD`; those compare
 * correctly as plain strings. `done` is a Set of the days a habit was ticked.
 */

/** Monday=0 … Sunday=6, matching `weekdayIndex`. */
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * Due on `dayId`: it's one of the habit's weekdays and the habit existed by
 * then. Days before `startDay` are never "missed", so adding a habit today
 * doesn't arrive with a history of failures.
 */
export function isScheduled(habit, dayId) {
    return dayId >= habit.startDay && habit.days.includes(weekdayIndex(dayId));
}

/**
 * Consecutive scheduled days ticked, counting back from today. Days the habit
 * isn't due are skipped rather than breaking the run — a Mon/Wed/Fri habit
 * done all three days is a 3, not a 1. Today still being open doesn't break
 * it either (there's time left); any earlier scheduled day without a tick does.
 */
export function currentStreak(habit, done, today) {
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
 * `missed` (due and past, not ticked).
 */
export function weekCells(habit, done, weekStart, today) {
    return Array.from({ length: 7 }, (_, index) => {
        const day = addDays(weekStart, index);

        let state;
        if (!isScheduled(habit, day)) state = 'off';
        else if (day > today) state = 'future';
        else if (done.has(day)) state = 'done';
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
