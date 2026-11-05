import { addDays } from '../life/dates.js';

/**
 * Repeating tasks — pure, so it can be checked in Node.
 *
 * A task that repeats carries `repeat: { unit, every, anchor }`: every `every`
 * days, weeks, months or years, counted from `anchor`, the date it was first
 * set (or last re-dated by hand). Every occurrence is worked out from the
 * anchor, never from the previous one, so a monthly task on the 31st lands on
 * Feb 28, then Mar 31, not Mar 28: stepping from the clamped date would drift.
 *
 * A repeating task is never "done": ticking it moves it to its next date, the
 * same way a repeating calendar event just shows the next one.
 */

export const UNITS = ['day', 'week', 'month', 'year'];
export const MAX_EVERY = 99;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The choices in the sheet, in order. `null` is a task that doesn't repeat. */
export const PRESETS = [
    { id: 'none', label: 'Never', repeat: null },
    { id: 'daily', label: 'Every day', repeat: { unit: 'day', every: 1 } },
    { id: 'weekly', label: 'Every week', repeat: { unit: 'week', every: 1 } },
    { id: 'fortnightly', label: 'Every 2 weeks', repeat: { unit: 'week', every: 2 } },
    { id: 'monthly', label: 'Every month', repeat: { unit: 'month', every: 1 } },
    { id: 'yearly', label: 'Every year', repeat: { unit: 'year', every: 1 } },
];

/** A well-formed repeat: a known unit, a whole number of them from 1 to 99, and an anchor day. */
export function isValidRepeat(repeat) {
    return (
        repeat !== null &&
        typeof repeat === 'object' &&
        UNITS.includes(repeat.unit) &&
        Number.isInteger(repeat.every) &&
        repeat.every >= 1 &&
        repeat.every <= MAX_EVERY &&
        typeof repeat.anchor === 'string' &&
        DAY.test(repeat.anchor)
    );
}

/** "Every week", "Every 2 weeks", "Every 3 days" — what the row and the sheet say. */
export function repeatLabel({ unit, every }) {
    return every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
}

/** Which preset a repeat is, or null for one the sheet has no button for (kept as it is). */
export function presetOf(repeat) {
    if (!repeat) return PRESETS[0];
    return PRESETS.find((p) => p.repeat && p.repeat.unit === repeat.unit && p.repeat.every === repeat.every) ?? null;
}

const parts = (dayId) => dayId.split('-').map(Number);
const daysInMonth = (year, month) => new Date(year, month, 0).getDate(); // month is 1-12
const pad2 = (n) => String(n).padStart(2, '0');
const dayId = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

/**
 * The `k`th occurrence counted from the anchor (`k` = 0 is the anchor itself).
 * Months and years keep the anchor's day of the month where the month has it,
 * and otherwise fall back to the month's last day.
 */
export function occurrence({ unit, every, anchor }, k) {
    if (unit === 'day') return addDays(anchor, every * k);
    if (unit === 'week') return addDays(anchor, 7 * every * k);

    const [year, month, day] = parts(anchor);
    if (unit === 'month') {
        const index = year * 12 + (month - 1) + every * k;
        const y = Math.floor(index / 12);
        const m = (index % 12) + 1;
        return dayId(y, m, Math.min(day, daysInMonth(y, m)));
    }
    const y = year + every * k;
    return dayId(y, month, Math.min(day, daysInMonth(y, month)));
}

/**
 * Where a repeating task goes when it's ticked: the first occurrence strictly
 * after both its due date and today. Ticked early, it moves on a whole step
 * (today's tick covers the one due soon); ticked late, it skips the ones missed
 * rather than leaving a pile of overdue copies.
 */
export function nextOccurrence(task, today) {
    const after = task.date > today ? task.date : today;
    const anchor = { ...task.repeat, anchor: task.repeat.anchor ?? task.date };
    for (let k = 0; k < 40000; k += 1) {
        const date = occurrence(anchor, k);
        if (date > after) return date;
    }
    throw new Error('No next date found for this repeating task.');
}

/** The task as it is after being ticked: same task, next date, never marked done. */
export function rolledTask(task, today) {
    return { ...task, date: nextOccurrence(task, today), done: false, doneAt: null };
}

/**
 * The calendar's `RRULE` for a repeat, so an exported repeating task is a
 * repeating event. Months and years that the app clamps to a month's end (the
 * 29th to 31st) are written as "the last of these days that exists", which is
 * exactly that clamp; a plain monthly rule would skip the short months instead.
 */
export function rruleFor({ unit, every, anchor }) {
    const interval = `INTERVAL=${every}`;
    if (unit === 'day') return `RRULE:FREQ=DAILY;${interval}`;
    if (unit === 'week') return `RRULE:FREQ=WEEKLY;${interval}`;

    const [, month, day] = parts(anchor);
    const days = Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',');
    if (unit === 'month') {
        return day >= 29
            ? `RRULE:FREQ=MONTHLY;${interval};BYMONTHDAY=${days};BYSETPOS=-1`
            : `RRULE:FREQ=MONTHLY;${interval}`;
    }
    return month === 2 && day >= 29
        ? `RRULE:FREQ=YEARLY;${interval};BYMONTH=2;BYMONTHDAY=${days};BYSETPOS=-1`
        : `RRULE:FREQ=YEARLY;${interval}`;
}
