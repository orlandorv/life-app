import { weekdayIndex } from '../life/dates.js';

/**
 * Routines: a habit with steps. Pure, like streaks.js. A step is
 * `{id, text, detail?, days?}` — `days` (Monday=0 … Sunday=6) limits it to
 * certain weekdays, e.g. an active that's only used three nights a week;
 * without it the step applies every day the routine does.
 */

export function isRoutine(habit) {
    return Array.isArray(habit.steps) && habit.steps.length > 0;
}

/** Does this step apply on `dayId`? */
export function stepApplies(step, dayId) {
    return !Array.isArray(step.days) || step.days.includes(weekdayIndex(dayId));
}

/** The steps to do on `dayId`, in order. */
export function stepsForDay(habit, dayId) {
    return (habit.steps ?? []).filter((step) => stepApplies(step, dayId));
}

/**
 * How far through the routine you are on `dayId`. Ticks for steps that don't
 * apply that day, or that have since been deleted, don't count.
 */
export function routineProgress(habit, ticked, dayId) {
    const due = stepsForDay(habit, dayId);
    const done = due.filter((step) => ticked.has(step.id)).length;
    return { done, total: due.length, complete: due.length > 0 && done === due.length };
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon, Wed, Fri only" for a step limited to some days; null for every day. */
export function stepDaysLabel(step) {
    if (!Array.isArray(step.days) || step.days.length === 7) return null;
    return `${[...step.days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]).join(', ')} only`;
}
