import { lifeDb, uid } from '../life/db.js';
import { isDoneExpired } from './organize.js';

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

export async function addTask({ title, date, time, note }) {
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
    await lifeDb.put('tasks', task);
    state.tasks.push(task);
    return task;
}

export async function updateTask(task, { title, date, time, note }) {
    const updated = { ...task, title: cleanText(title), date, time: cleanTime(time), note: cleanText(note) };
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
