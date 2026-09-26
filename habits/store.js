import { lifeDb, uid } from '../life/db.js';
import { localDayId } from '../life/dates.js';
import { isRoutine, routineProgress, stepsForDay } from './routine.js';

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
    // `habitId|day` → Set of step ids ticked, for routines.
    ticks: new Map(),
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

export async function loadTicks() {
    const rows = await lifeDb.getAll('routineTicks');
    state.ticks = new Map(rows.map((row) => [row.id, new Set(row.steps)]));
}

/** The routine's ticked steps on a day; an empty Set if none. */
export function tickedSteps(habitId, day) {
    return state.ticks.get(`${habitId}|${day}`) ?? new Set();
}

/** The habit's ticked days; empty (not undefined) for a habit never ticked. */
export function doneDays(habitId) {
    if (!state.done.has(habitId)) state.done.set(habitId, new Set());
    return state.done.get(habitId);
}

const cleanDays = (days) => [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);

/**
 * Tidies steps from the editor: blank ones dropped, text trimmed, a step on
 * every day stored without `days` (it just follows the routine). Existing
 * steps keep their id so today's ticks survive an edit.
 */
function cleanSteps(steps = []) {
    return steps
        .filter((step) => step.text?.trim())
        .map((step) => {
            const clean = { id: step.id || uid(), text: step.text.trim() };
            if (step.detail?.trim()) clean.detail = step.detail.trim();
            const days = Array.isArray(step.days) ? cleanDays(step.days) : null;
            if (days && days.length && days.length < 7) clean.days = days;
            return clean;
        });
}

/** Optional fields are left off entirely when empty, so a plain habit stays plain. */
function withExtras(habit, { note, steps }) {
    const next = { ...habit };
    delete next.note;
    delete next.steps;
    if (note?.trim()) next.note = note.trim();
    const cleaned = cleanSteps(steps);
    if (cleaned.length) next.steps = cleaned;
    return next;
}

export async function addHabit({ name, days, note, steps }) {
    const habit = withExtras({
        id: uid(),
        name: name.trim(),
        days: cleanDays(days),
        startDay: localDayId(),
        createdAt: new Date().toISOString(),
    }, { note, steps });
    await lifeDb.put('habits', habit);
    state.habits.push(habit);
    return habit;
}

export async function updateHabit(habit, { name, days, note, steps }) {
    const updated = withExtras({ ...habit, name: name.trim(), days: cleanDays(days) }, { note, steps });
    await lifeDb.put('habits', updated);
    state.habits = state.habits.map((existing) => (existing.id === habit.id ? updated : existing));

    // Adding or removing steps can change whether today's checklist is
    // finished. Re-check today only, if it was started; past days keep the
    // result they had.
    const today = localDayId();
    const ticked = tickedSteps(updated.id, today);
    if (isRoutine(updated) && ticked.size) await setDone(updated.id, today, routineProgress(updated, ticked, today).complete);
}

/** Removes the habit and its history; leaving the ticks behind would just be orphans. */
export async function deleteHabit(id) {
    const [logs, ticks] = await Promise.all([
        lifeDb.byIndex('habitLogs', 'habitId', id),
        lifeDb.byIndex('routineTicks', 'habitId', id),
    ]);
    await Promise.all([
        ...logs.map((log) => lifeDb.delete('habitLogs', log.id)),
        ...ticks.map((tick) => lifeDb.delete('routineTicks', tick.id)),
    ]);
    ticks.forEach((tick) => state.ticks.delete(tick.id));
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

async function setDone(habitId, day, done) {
    if (doneDays(habitId).has(day) !== done) await toggleDone(habitId, day);
}

async function saveTicks(habitId, day, steps) {
    const id = `${habitId}|${day}`;
    if (steps.size) {
        await lifeDb.put('routineTicks', { id, habitId, day, steps: [...steps] });
        state.ticks.set(id, steps);
    } else {
        await lifeDb.delete('routineTicks', id);
        state.ticks.delete(id);
    }
}

/**
 * Ticks or unticks one step of a routine, and keeps the routine itself in
 * step: done exactly when every step due that day is ticked. Returns the new
 * progress, so the caller can tell when this tick finished the routine.
 */
export async function setStepDone(habit, day, stepId, done) {
    const steps = new Set(tickedSteps(habit.id, day));
    if (done) steps.add(stepId);
    else steps.delete(stepId);

    await saveTicks(habit.id, day, steps);
    const progress = routineProgress(habit, steps, day);
    await setDone(habit.id, day, progress.complete);
    return progress;
}

/**
 * Ticks a habit on or off from outside its checklist (the circle, the week
 * grid, Today). For a routine that means all of that day's steps, so the
 * checklist and the tick never disagree.
 */
export async function toggleHabit(habit, day) {
    const nowDone = !doneDays(habit.id).has(day);
    if (isRoutine(habit)) {
        await saveTicks(habit.id, day, nowDone ? new Set(stepsForDay(habit, day).map((step) => step.id)) : new Set());
    }
    await setDone(habit.id, day, nowDone);
}
