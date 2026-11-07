import { localDayId } from '../life/dates.js';

/**
 * The record that a task was finished on a day — pure, so it is checked in Node.
 *
 * Ticked tasks are deleted 24 hours later and a repeating task just moves to its
 * next date, so the tasks themselves keep no history. This small log does: one
 * row per task per day (`taskId|day`, like a habit's tick), written when a task
 * is ticked and removed when it is un-ticked. The game reads it for its "Tasks"
 * bonus; nothing else does, and deleting a task leaves its rows alone, since it
 * was still finished that day.
 *
 * One row per task per day means ticking the same repeating task twice in a day,
 * or ticking and un-ticking and ticking again, is one completion, not three.
 */

export const logId = (taskId, day) => `${taskId}|${day}`;

/** The row for a task finished on `day` (a local day id). */
export const completionRow = (taskId, day) => ({ id: logId(taskId, day), taskId, day });

/** The day a ticked task was finished: the local day of its `doneAt`, or null when that is missing or unreadable. */
export function completedDay(task) {
    if (!task?.doneAt) return null;
    const when = new Date(task.doneAt);
    return Number.isNaN(when.getTime()) ? null : localDayId(when);
}
