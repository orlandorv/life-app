import { addDays } from '../life/dates.js';

/**
 * Journal maths: the mood and energy scales, the check-in streak, and the
 * patterns that connect how you feel to the rest of the app. Pure (no DOM, no
 * storage), so it's unit-testable in Node. A day is a local `YYYY-MM-DD`.
 *
 * An entry is `{ day, mood, energy, note?, updatedAt }`; `mood` and `energy`
 * are 1–5 or null (not recorded — never a fake middle value).
 */

/** Words for 1–5, lowest first. */
export const MOODS = ['Rough', 'Low', 'Okay', 'Good', 'Great'];
export const ENERGY = ['Drained', 'Tired', 'Okay', 'Good', 'Energised'];
export const SCALE = [1, 2, 3, 4, 5];

export const isLevel = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
export const moodLabel = (value) => (isLevel(value) ? MOODS[value - 1] : null);
export const energyLabel = (value) => (isLevel(value) ? ENERGY[value - 1] : null);

/**
 * The text boxes of a check-in, in the order they are shown: the night's dreams,
 * the three parts of the day, then a general note. Each is an optional string on
 * the entry under its `id`.
 */
export const NOTE_FIELDS = [
    { id: 'dreams', label: 'Dreams', placeholder: () => 'Anything you remember from last night?' },
    { id: 'morning', label: 'Morning', placeholder: () => 'How did the morning go?' },
    { id: 'afternoon', label: 'Afternoon', placeholder: () => 'How did the afternoon go?' },
    { id: 'night', label: 'Night', placeholder: () => 'How did the evening go?' },
    {
        id: 'note',
        label: 'Note',
        placeholder: (isToday) => (isToday ? 'Anything else worth remembering about today?' : 'Anything else worth remembering about that day?'),
    },
];

const hasText = (entry, id) => Boolean(entry?.[id]?.trim());

/** Anything worth keeping: a mood, an energy, or any text. An empty entry is deleted, not stored. */
export const hasContent = (entry) =>
    Boolean(entry) && (isLevel(entry.mood) || isLevel(entry.energy) || NOTE_FIELDS.some(({ id }) => hasText(entry, id)));

/** One line to show for a day in a list: the general note, else the first part of the day written about. */
export function entryPreview(entry) {
    if (hasText(entry, 'note')) return entry.note;
    const field = NOTE_FIELDS.find(({ id }) => hasText(entry, id));
    return field ? `${field.label}: ${entry[field.id]}` : '';
}

/**
 * Days in a row with an entry, counting back from today. Today still being
 * blank doesn't break it — the day isn't over — so it counts from yesterday
 * until today is filled in.
 */
export function checkInStreak(days, today) {
    let day = days.has(today) ? today : addDays(today, -1);
    let streak = 0;
    while (days.has(day)) {
        streak += 1;
        day = addDays(day, -1);
    }
    return streak;
}

// --- Patterns ----------------------------------------------------------------------

/** Each side of a comparison needs this many days before it's said at all. */
export const MIN_DAYS = 4;
/** Only the recent past: how you felt a year ago says little about now. */
export const WINDOW_DAYS = 60;
/** Below this gap the two sides are reported as about the same. */
const SAME_WITHIN = 0.3;

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const oneDecimal = (value) => (Math.round(value * 10) / 10).toFixed(1);

/**
 * Average `field` on the days `inGroup` says yes to, against the days it says
 * no to — or null when either side has fewer than MIN_DAYS.
 */
export function compareBy(entries, field, inGroup) {
    const yes = [];
    const no = [];
    for (const entry of entries) {
        if (!isLevel(entry[field])) continue;
        const side = inGroup(entry.day);
        if (side === null) continue; // the day has no data to split on
        (side ? yes : no).push(entry[field]);
    }
    if (yes.length < MIN_DAYS || no.length < MIN_DAYS) return null;
    return { yes: mean(yes), no: mean(no), yesDays: yes.length, noDays: no.length };
}

function sentence(result, { what, yes, no }) {
    const a = oneDecimal(result.yes);
    const b = oneDecimal(result.no);
    if (Math.abs(result.yes - result.no) < SAME_WITHIN) return `Your ${what} is about the same ${yes} (${a}) and ${no} (${b}).`;
    return `Your ${what} averages ${a} ${yes} and ${b} ${no}.`;
}

/**
 * What the last WINDOW_DAYS say, as plain sentences. Each one only appears
 * once both sides have enough days, so a couple of entries can't pose as a
 * pattern. `trainedDays` is a Set of days with a finished workout;
 * `sleepByDay` a Map of day → hours slept the night before (Body's own key).
 */
export function insights({ entries, trainedDays, sleepByDay, today }) {
    const since = addDays(today, -(WINDOW_DAYS - 1));
    const recent = entries.filter((entry) => entry.day >= since && entry.day <= today);
    const found = [];

    const training = compareBy(recent, 'mood', (day) => trainedDays.has(day));
    if (training) {
        found.push({
            id: 'mood-training',
            text: sentence(training, { what: 'mood', yes: 'on days you train', no: "on days you don't" }),
            days: training.yesDays + training.noDays,
        });
    }

    // Days without a sleep figure are left out, not counted as short nights.
    const sleep = compareBy(recent, 'energy', (day) => (sleepByDay.has(day) ? sleepByDay.get(day) >= 7 : null));
    if (sleep) {
        found.push({
            id: 'energy-sleep',
            text: sentence(sleep, { what: 'energy', yes: 'after 7+ hours of sleep', no: 'after less' }),
            days: sleep.yesDays + sleep.noDays,
        });
    }

    return found;
}
