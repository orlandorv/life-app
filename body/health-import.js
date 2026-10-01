import { addDays } from '../life/dates.js';

/**
 * Reading the text an Apple Shortcut copies out of Apple Health, and working
 * out what it changes. Pure, so it can be checked in Node.
 *
 * The Shortcut writes one line per reading:
 *     steps 2026-09-21 8,412
 *     weight 2026-09-26 82.4 kg
 *     sleep 2026-09-25 23:10 1 hr 5 min Core
 * Shortcuts formats numbers and units however the phone is set up, so this is
 * forgiving: thousands separators, a comma as the decimal point, kg/lb/st,
 * extra spaces and blank or unrelated lines are all fine.
 *
 * Sleep is different from the other two: Health doesn't hold one number per
 * night, it holds a run of segments (Core, Deep, REM, Awake, In Bed…), so each
 * sleep line is one segment and a night is the sum of them.
 */

const KG_PER_LB = 0.45359237;
const KG_PER_STONE = 6.35029318;
// kind, date, optional time, number (must start with a digit — a minus sign
// or a word never passes as a count), optional unit.
const LINE = /^\s*(steps?|weight)\b[\s:,-]*(\d{4}-\d{2}-\d{2})(?:[T\s,]+\d{1,2}:\d{2}(?::\d{2})?)?[\s,:]*(\d[\d.,\s]*?)\s*([a-zA-Z]+)?\s*$/i;

/** "8,412" → 8412, "8 412" → 8412, "8412.0" → 8412. */
function parseCount(text) {
    const digits = text.replace(/[\s,]/g, '');
    const n = Number(digits);
    return Number.isFinite(n) ? Math.round(n) : null;
}

/** "82.4" or "82,4" → 82.4; "1,082.4" → 1082.4. */
function parseDecimal(text) {
    let t = text.replace(/\s/g, '');
    if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
    else t = t.replace(/,/g, '');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

function toKg(value, unit) {
    const u = (unit ?? 'kg').toLowerCase();
    if (u === 'kg' || u === 'kgs' || u === 'kilograms' || u === 'kilogram') return value;
    if (u === 'lb' || u === 'lbs' || u === 'pounds' || u === 'pound') return value * KG_PER_LB;
    if (u === 'st' || u === 'stone' || u === 'stones') return value * KG_PER_STONE;
    return null;
}

// A sleep segment: date, optional start time, then a duration ("7.5 h",
// "1 hr 5 min", "45 min", or a bare number of hours) and optionally the stage.
const SLEEP_LINE = /^\s*sleep\b[\s:,-]*(\d{4}-\d{2}-\d{2})(?:[T\s,]+(\d{1,2}):\d{2}(?::\d{2})?)?[\s,:]*(.*\S)\s*$/i;
const DURATION_PART = /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
// Time in bed and time awake aren't sleep — skipped on purpose, not as errors.
const NOT_SLEEP = /\bawake\b|\bin\s*bed\b/i;
// Segments that start from this hour on belong to the night that ends the next morning.
const NIGHT_STARTS_AT = 18;

/**
 * "1 hr 5 min" → 1.083…, "45 min" → 0.75, "7,5 h" → 7.5, "9:40:48" → 9.68,
 * a bare "7.5" → 7.5. Null if it isn't a duration. `h:mm:ss` is how Shortcuts
 * prints a Duration, but only trusted when a start time came first — on its own
 * "07:30" is far more likely a clock time than a length of time.
 */
function parseDurationHours(text, allowClock = false) {
    const clock = text.match(/^\s*(\d+):([0-5]\d)(?::([0-5]\d))?(?![\d:])/);
    if (clock && allowClock) return Number(clock[1]) + Number(clock[2]) / 60 + Number(clock[3] ?? 0) / 3600;
    if (/\d:\d/.test(text)) return null;
    // A minus sign is never a length of time ("-3 h" is a mangled line, not 3 hours).
    if (/-\s*\d/.test(text)) return null;
    let hours = 0;
    let found = false;
    for (const [, number, unit] of text.matchAll(DURATION_PART)) {
        const n = parseDecimal(number);
        if (n === null) return null;
        const u = unit.toLowerCase();
        hours += u.startsWith('h') ? n : u.startsWith('m') ? n / 60 : n / 3600;
        found = true;
    }
    if (found) return hours;

    const bare = text.match(/^\s*(\d+(?:[.,]\d+)?)\b/);
    return bare ? parseDecimal(bare[1]) : null;
}

const validDay = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

/**
 * `{days, skipped, partialDay}`: `days` maps a `YYYY-MM-DD` to
 * `{steps?, weightKg?, sleepHours?}`. Later readings win, so the last weigh-in
 * of a day is the one kept (the Shortcut lists them oldest first); sleep
 * segments add up. Days after `today` are ignored. Numbers outside anything
 * plausible — a scale glitch, a mangled line — are skipped rather than saved,
 * and counted in `skipped`.
 *
 * A night's sleep goes to the day you wake up: a segment that starts at 18:00
 * or later counts toward the next day. The oldest night in a paste of
 * timed segments is left out (`partialDay`), because Health's date window can
 * cut it off and a short total would replace a good one.
 */
export function parseHealthText(text, today) {
    const days = new Map();
    const timedSleepDays = new Set();
    let skipped = 0;

    const entryFor = (day) => {
        if (!days.has(day)) days.set(day, {});
        return days.get(day);
    };

    for (const raw of String(text ?? '').split(/\r?\n/)) {
        if (!raw.trim()) continue;

        const sleep = raw.match(SLEEP_LINE);
        if (sleep) {
            const [, written, startHour, rest] = sleep;
            if (NOT_SLEEP.test(rest)) continue;
            if (!validDay(written) || (today && written > today)) {
                skipped += 1;
                continue;
            }

            const hours = parseDurationHours(rest, startHour !== undefined);
            if (hours === null || !(hours > 0) || hours > 24) {
                skipped += 1;
                continue;
            }

            const timed = startHour !== undefined;
            const day = timed && Number(startHour) >= NIGHT_STARTS_AT ? addDays(written, 1) : written;
            // Tonight's evening segment lands on a day that hasn't happened yet.
            if (today && day > today) continue;

            const entry = entryFor(day);
            entry.sleepHours = (entry.sleepHours ?? 0) + hours;
            if (timed) timedSleepDays.add(day);
            continue;
        }

        const match = raw.match(LINE);
        if (!match) {
            if (/steps?|weight|sleep/i.test(raw)) skipped += 1;
            continue;
        }

        const [, kind, day, number, unit] = match;
        if (!validDay(day) || (today && day > today)) {
            skipped += 1;
            continue;
        }

        const entry = entryFor(day);
        if (kind.toLowerCase().startsWith('step')) {
            const steps = parseCount(number);
            if (steps === null || steps < 0 || steps > 200000) skipped += 1;
            else entry.steps = steps;
        } else {
            const value = parseDecimal(number);
            const kg = value === null ? null : toKg(value, unit);
            if (kg === null || kg < 20 || kg > 400) skipped += 1;
            else entry.weightKg = Math.round(kg * 100) / 100;
        }
    }

    for (const [day, entry] of days) {
        if (entry.sleepHours === undefined) continue;
        entry.sleepHours = Math.round(entry.sleepHours * 100) / 100;
        // More than a day of sleep means overlapping segments — don't trust it.
        if (entry.sleepHours > 24) {
            delete entry.sleepHours;
            skipped += 1;
        }
    }

    let partialDay = null;
    if (timedSleepDays.size) {
        partialDay = [...timedSleepDays].sort()[0];
        const entry = days.get(partialDay);
        delete entry.sleepHours;
    }

    for (const [day, entry] of days) if (!Object.keys(entry).length) days.delete(day);

    return { days, skipped, partialDay };
}

/**
 * What saving would do: for each day, the entry to write and whether it adds
 * to or changes what's there. Anything Health doesn't have for a day is kept
 * as logged; a zero step count (a day the phone recorded nothing) doesn't wipe
 * a number you typed in. Days where nothing would change are left out.
 */
export function planHealthImport(parsed, existingEntries) {
    const byDay = new Map(existingEntries.map((entry) => [entry.day, entry]));
    const plan = [];

    for (const [day, reading] of [...parsed.days].sort(([a], [b]) => a.localeCompare(b))) {
        const current = byDay.get(day) ?? null;
        const next = {
            day,
            weightKg: reading.weightKg ?? current?.weightKg ?? null,
            sleepHours: reading.sleepHours ?? current?.sleepHours ?? null,
            steps: reading.steps > 0 ? reading.steps : current?.steps ?? null,
        };

        const changed =
            !current ||
            next.weightKg !== current.weightKg ||
            next.sleepHours !== current.sleepHours ||
            next.steps !== current.steps;
        if (!changed || (next.weightKg === null && next.sleepHours === null && next.steps === null)) continue;

        // "Updates": the day already had weight/steps, or Health is changing a sleep figure that was there.
        const replacesSleep = reading.sleepHours != null && current?.sleepHours != null;
        plan.push({
            day,
            entry: next,
            replaces: Boolean(current && (current.weightKg != null || current.steps != null || replacesSleep)),
        });
    }

    return plan;
}
