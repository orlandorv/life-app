import { addDays } from '../life/dates.js';

/**
 * Turning a task into a calendar file — pure text building, so it can be
 * checked in Node. A task's own id becomes the event's UID, so re-exporting
 * it after an edit updates the same calendar entry rather than duplicating
 * it (most calendar apps, including Apple's, treat a later SEQUENCE on a
 * matching UID as a replacement).
 *
 * Deliberately doesn't line-fold long text per RFC 5545 — a personal task
 * note is short (capped well under the wrap length in the UI) and Apple
 * Calendar reads an unfolded line fine, so the extra complexity isn't worth
 * it here. DTSTART/DTEND use floating local time (no `Z`, no `TZID`), the
 * same choice already made for the weekly weigh-in reminder — it survives a
 * DST change with no clock math to get wrong.
 */

const CALENDAR_DOMAIN = 'orlandorv.github.io';

// A task with no set time still needs a real duration for a calendar entry;
// half an hour is a reasonable guess for "something to do", not a meeting.
const DEFAULT_DURATION_MIN = 30;

export function calendarUid(taskId) {
    return `life-task-${taskId}@${CALENDAR_DOMAIN}`;
}

/** Escapes text for an ICS value: backslash, comma, semicolon, then real newlines. */
function escapeText(text) {
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r\n|\r|\n/g, '\\n');
}

const pad2 = (n) => String(n).padStart(2, '0');
const stampOf = (date) =>
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;

/** `date` + `time` ("HH:MM") as a local Date, safe to add minutes to (handles midnight rollover). */
function toLocalDate(dateId, time) {
    const [year, month, day] = dateId.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute);
}

function dtLine(name, task) {
    if (task.time) {
        const start = toLocalDate(task.date, task.time);
        const end = new Date(start.getTime() + DEFAULT_DURATION_MIN * 60000);
        return name === 'DTSTART' ? `DTSTART:${stampOf(start)}` : `DTEND:${stampOf(end)}`;
    }
    // All-day: DTEND is exclusive per RFC 5545, so it's the day *after*.
    const day = name === 'DTSTART' ? task.date : addDays(task.date, 1);
    return `${name};VALUE=DATE:${day.replace(/-/g, '')}`;
}

/**
 * The full `.ics` file text for one task. `now` is only for DTSTAMP
 * (when this version of the file was generated), not the event's own time.
 */
export function taskToIcs(task, now = new Date()) {
    if (!task.date) throw new Error('A task needs a date before it can go on the calendar.');

    const dtstamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Life app//Tasks//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${calendarUid(task.id)}`,
        `DTSTAMP:${dtstamp}`,
        `SEQUENCE:${Number.isInteger(task.calendarSequence) ? task.calendarSequence : 0}`,
        dtLine('DTSTART', task),
        dtLine('DTEND', task),
        `SUMMARY:${escapeText(task.title)}`,
    ];

    if (task.note?.trim()) lines.push(`DESCRIPTION:${escapeText(task.note.trim())}`);

    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
}

/** A filesystem-safe filename for the exported event, from its title. */
export function icsFilename(title) {
    const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${slug || 'task'}.ics`;
}
