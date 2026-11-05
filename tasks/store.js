import { lifeDb, uid } from '../life/db.js';
import { localDayId } from '../life/dates.js';
import { isDoneExpired } from './organize.js';
import { rolledTask } from './recurrence.js';

/**
 * In-memory mirror of Tasks, in the same style as the other sections' stores.
 * A task's `date` is required; `time` is a local `HH:MM` or null (all-day).
 */
export const state = {
    tasks: [],
};

/**
 * Loads the tasks, first clearing any that were ticked 24 hours ago or more.
 * Done here rather than in the Tasks screen so every reader (Today's block
 * included) sees the same list, and it happens whenever the data is read —
 * there's no timer to keep running in a home-screen app that's usually closed.
 */
export async function loadTasks(now = new Date()) {
    const all = await lifeDb.getAll('tasks');
    const expired = all.filter((task) => isDoneExpired(task, now));
    await Promise.all(expired.map((task) => lifeDb.delete('tasks', task.id)));
    const gone = new Set(expired.map((task) => task.id));
    state.tasks = all.filter((task) => !gone.has(task.id));
}

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

/** `HH:MM`, or null for anything blank/unset — never an empty string sitting in the field. */
function cleanTime(time) {
    return typeof time === 'string' && /^\d{2}:\d{2}$/.test(time) ? time : null;
}

/**
 * A repeat chosen in the sheet is just `{ unit, every }`; it is stored with the
 * date the series is counted from (`anchor`). Saving a task unchanged keeps its
 * anchor, so a monthly task on the 31st can't drift to the 28th; re-dating it by
 * hand, or changing the rule, starts the series afresh from the new date.
 */
function repeatFor(repeat, date, task = null) {
    if (!repeat) return null;
    const previous = task?.repeat;
    const unchanged = previous && previous.unit === repeat.unit && previous.every === repeat.every && task.date === date;
    return { unit: repeat.unit, every: repeat.every, anchor: unchanged ? previous.anchor : date };
}

export async function addTask({ title, date, time, note, repeat = null }) {
    const task = {
        id: uid(),
        title: cleanText(title),
        date,
        time: cleanTime(time),
        note: cleanText(note),
        done: false,
        doneAt: null,
        createdAt: new Date().toISOString(),
        calendarSequence: 0,
    };
    const series = repeatFor(repeat, date);
    if (series) task.repeat = series;
    await lifeDb.put('tasks', task);
    state.tasks.push(task);
    return task;
}

export async function updateTask(task, { title, date, time, note, repeat = null }) {
    const updated = { ...task, title: cleanText(title), date, time: cleanTime(time), note: cleanText(note) };
    delete updated.repeat;
    const series = repeatFor(repeat, date, task);
    if (series) {
        updated.repeat = series;
        // A repeating task is never "done": it's always waiting for its next date.
        updated.done = false;
        updated.doneAt = null;
    }
    await lifeDb.put('tasks', updated);
    state.tasks = state.tasks.map((existing) => (existing.id === task.id ? updated : existing));
    return updated;
}

export async function setDone(task, done) {
    const updated = { ...task, done, doneAt: done ? new Date().toISOString() : null };
    await lifeDb.put('tasks', updated);
    state.tasks = state.tasks.map((existing) => (existing.id === task.id ? updated : existing));
    return updated;
}

/**
 * Ticks a task. A plain one becomes done (and is cleared 24 hours later); a
 * repeating one isn't done at all, it moves to its next date and carries on.
 * Returns the task as saved.
 */
export async function completeTask(task, today = localDayId()) {
    if (!task.repeat) return setDone(task, true);
    const rolled = rolledTask(task, today);
    await lifeDb.put('tasks', rolled);
    state.tasks = state.tasks.map((existing) => (existing.id === task.id ? rolled : existing));
    return rolled;
}

export async function deleteTask(id) {
    await lifeDb.delete('tasks', id);
    state.tasks = state.tasks.filter((task) => task.id !== id);
}

/**
 * Bumps the task's calendar version and saves it — called right before
 * generating its `.ics` file, so a re-export after an edit carries a higher
 * SEQUENCE than the last one, which is what tells a calendar app this is an
 * update to the same event rather than a stray duplicate.
 */
export async function bumpCalendarSequence(task) {
    const updated = { ...task, calendarSequence: (task.calendarSequence ?? 0) + 1 };
    await lifeDb.put('tasks', updated);
    state.tasks = state.tasks.map((existing) => (existing.id === task.id ? updated : existing));
    return updated;
}
