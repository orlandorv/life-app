import { addDays, daysBetween, dayLabel } from '../life/dates.js';

/**
 * Grouping tasks by how soon they're due — pure, like habits/streaks.js and
 * videos/organize.js, so it can be checked without a DOM or a database.
 *
 * A task is `{id, title, date, time, note, done, doneAt, createdAt,
 * calendarSequence}`. `date` is a local `YYYY-MM-DD` (required); `time` is a
 * local `HH:MM` or null for an all-day task.
 */

export const BUCKETS = ['overdue', 'today', 'tomorrow', 'week', 'later'];
const BUCKET_LABEL = { overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow', week: 'This week', later: 'Later' };

/** "Today", "Tomorrow", or the usual weekday/day/month fallback — in either direction. */
export function taskDateLabel(dateId, today) {
    if (dateId === addDays(today, 1)) return 'Tomorrow';
    return dayLabel(dateId, today);
}

export function isOverdue(task, today) {
    return !task.done && task.date < today;
}

function bucketOf(task, today) {
    const days = daysBetween(today, task.date);
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days <= 7) return 'week';
    return 'later';
}

/**
 * Not-done tasks bucketed by due date (overdue first, then today, tomorrow,
 * this week, later), each sorted soonest-first (a date with a time before one
 * without — an all-day task is treated as the last thing that day); empty
 * buckets are left out. Done tasks are never bucketed by date — once done,
 * *when* it was due stops being the point — they're returned separately,
 * most recently completed first.
 */
export function groupTasks(tasks, today) {
    const open = tasks.filter((task) => !task.done);
    const done = tasks
        .filter((task) => task.done)
        .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));

    const byBucket = new Map(BUCKETS.map((bucket) => [bucket, []]));
    for (const task of open) byBucket.get(bucketOf(task, today)).push(task);

    const groups = BUCKETS.map((bucket) => ({
        bucket,
        label: BUCKET_LABEL[bucket],
        tasks: byBucket
            .get(bucket)
            .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '24:00').localeCompare(b.time ?? '24:00')),
    })).filter((group) => group.tasks.length);

    return { groups, done };
}

/** The soonest not-done task, for a Today-card summary. */
export function nextTask(tasks, today) {
    const open = tasks.filter((task) => !task.done);
    if (!open.length) return null;
    return open.reduce((soonest, task) => {
        const a = `${task.date}T${task.time ?? '24:00'}`;
        const b = `${soonest.date}T${soonest.time ?? '24:00'}`;
        return a < b ? task : soonest;
    });
}

export function overdueCount(tasks, today) {
    return tasks.filter((task) => isOverdue(task, today)).length;
}

export function dueCount(tasks) {
    return tasks.filter((task) => !task.done).length;
}
