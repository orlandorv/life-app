import { lifeDb, uid } from '../life/db.js';
import { localDayId } from '../life/dates.js';

/**
 * In-memory mirror of Habits, in the same style as nutrition/store.js. `done`
 * maps each habit to the Set of days it was ticked, which is what every
 * streak and grid calculation reads.
 */
export const state = {
    view: 'today',
    day: null,
    week: null,
    habits: [],
    done: new Map(),
};

export async function loadHabits() {
    const habits = await lifeDb.getAll('habits');
    state.habits = habits.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function loadLogs() {
    const logs = await lifeDb.getAll('habitLogs');
    state.done = new Map();
    logs.forEach((log) => doneDays(log.habitId).add(log.day));
}

/** The habit's ticked days; empty (not undefined) for a habit never ticked. */
export function doneDays(habitId) {
    if (!state.done.has(habitId)) state.done.set(habitId, new Set());
    return state.done.get(habitId);
}

const cleanDays = (days) => [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);

export async function addHabit({ name, days }) {
    const habit = {
        id: uid(),
        name: name.trim(),
        days: cleanDays(days),
        startDay: localDayId(),
        createdAt: new Date().toISOString(),
    };
    await lifeDb.put('habits', habit);
    state.habits.push(habit);
    return habit;
}

export async function updateHabit(habit, { name, days }) {
    const updated = { ...habit, name: name.trim(), days: cleanDays(days) };
    await lifeDb.put('habits', updated);
    state.habits = state.habits.map((existing) => (existing.id === habit.id ? updated : existing));
}

/** Removes the habit and its history; leaving the ticks behind would just be orphans. */
export async function deleteHabit(id) {
    const logs = await lifeDb.byIndex('habitLogs', 'habitId', id);
    await Promise.all(logs.map((log) => lifeDb.delete('habitLogs', log.id)));
    await lifeDb.delete('habits', id);
    state.habits = state.habits.filter((habit) => habit.id !== id);
    state.done.delete(id);
}

/** Ticks or unticks a habit for a day. The id encodes both, so it can't be doubled. */
export async function toggleDone(habitId, day) {
    const days = doneDays(habitId);
    const id = `${habitId}|${day}`;

    if (days.has(day)) {
        await lifeDb.delete('habitLogs', id);
        days.delete(day);
    } else {
        await lifeDb.put('habitLogs', { id, habitId, day });
        days.add(day);
    }
}
