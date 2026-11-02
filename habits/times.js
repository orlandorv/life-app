/**
 * When in the day a habit belongs: morning, afternoon, night, or all day for
 * one that can be done any time. Pure (no DOM, no storage), so the grouping
 * rules can be checked on their own.
 *
 * It's a label for organising the checklist, nothing more: it doesn't change
 * when a habit is due, how streaks run, or when it can be ticked.
 */

/** In the order they're shown. `anytime` is "All day". */
export const TIMES = [
    { id: 'morning', label: 'Morning' },
    { id: 'afternoon', label: 'Afternoon' },
    { id: 'night', label: 'Night' },
    { id: 'anytime', label: 'All day', hint: 'Any time' },
];

export const ANYTIME = 'anytime';

export const isTimeOfDay = (value) => TIMES.some((time) => time.id === value);

/**
 * The habit's time of day. A habit that has none — every one made before this
 * existed, and any new one left on the default — can be done throughout the
 * day, so it's "all day".
 */
export const timeOf = (habit) => (isTimeOfDay(habit?.timeOfDay) ? habit.timeOfDay : ANYTIME);

/** A position in the day, for sorting: morning first, all day last. */
export const timeRank = (habit) => TIMES.findIndex((time) => time.id === timeOf(habit));

/**
 * `habits` split into one group per time of day, in the day's order, leaving
 * out any with nothing in them. Each habit keeps its place within its group.
 */
export function groupByTime(habits) {
    return TIMES.map((time) => ({ ...time, habits: habits.filter((habit) => timeOf(habit) === time.id) })).filter(
        (group) => group.habits.length,
    );
}
