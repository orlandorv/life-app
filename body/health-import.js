/**
 * Reading the text an Apple Shortcut copies out of Apple Health, and working
 * out what it changes. Pure, so it can be checked in Node.
 *
 * The Shortcut writes one line per reading:
 *     steps 2026-09-21 8,412
 *     weight 2026-09-26 82.4 kg
 * Shortcuts formats numbers and units however the phone is set up, so this is
 * forgiving: thousands separators, a comma as the decimal point, kg/lb/st,
 * extra spaces and blank or unrelated lines are all fine.
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

const validDay = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

/**
 * `{days, skipped}`: `days` maps a `YYYY-MM-DD` to `{steps?, weightKg?}`.
 * Later readings win, so the last weigh-in of a day is the one kept (the
 * Shortcut lists them oldest first). Days after `today` are ignored. Numbers
 * outside anything plausible — a scale glitch, a mangled line — are skipped
 * rather than saved, and counted in `skipped`.
 */
export function parseHealthText(text, today) {
    const days = new Map();
    let skipped = 0;

    for (const raw of String(text ?? '').split(/\r?\n/)) {
        if (!raw.trim()) continue;
        const match = raw.match(LINE);
        if (!match) {
            if (/steps?|weight/i.test(raw)) skipped += 1;
            continue;
        }

        const [, kind, day, number, unit] = match;
        if (!validDay(day) || (today && day > today)) {
            skipped += 1;
            continue;
        }

        const entry = days.get(day) ?? {};
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
        if (Object.keys(entry).length) days.set(day, entry);
    }

    return { days, skipped };
}

/**
 * What saving would do: for each day, the entry to write and whether it adds
 * to or changes what's there. Sleep (which Health doesn't provide here) is
 * kept; a zero step count (a day the phone recorded nothing) doesn't wipe a
 * number you typed in. Days where nothing would change are left out.
 */
export function planHealthImport(parsed, existingEntries) {
    const byDay = new Map(existingEntries.map((entry) => [entry.day, entry]));
    const plan = [];

    for (const [day, reading] of [...parsed.days].sort(([a], [b]) => a.localeCompare(b))) {
        const current = byDay.get(day) ?? null;
        const next = {
            day,
            weightKg: reading.weightKg ?? current?.weightKg ?? null,
            sleepHours: current?.sleepHours ?? null,
            steps: reading.steps > 0 ? reading.steps : current?.steps ?? null,
        };

        const changed = !current || next.weightKg !== current.weightKg || next.steps !== current.steps;
        if (!changed || (next.weightKg === null && next.steps === null)) continue;

        plan.push({ day, entry: next, replaces: Boolean(current && (current.weightKg != null || current.steps != null)) });
    }

    return plan;
}
