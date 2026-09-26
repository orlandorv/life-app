/**
 * Day keys for Life sections. A day is a *local* calendar day as `YYYY-MM-DD`:
 * `toISOString()` alone is UTC, which files a 23:30 entry under tomorrow in
 * any timezone ahead of it.
 */

export function localDayId(date = new Date()) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

/** Parsed at local noon, so DST shifts can't roll it onto a neighbouring day. */
function parseDayId(dayId) {
    const [year, month, day] = dayId.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
}

export function addDays(dayId, days) {
    const date = parseDayId(dayId);
    date.setDate(date.getDate() + days);
    return localDayId(date);
}

/** "Today", "Yesterday", otherwise "Mon 22 Sep". */
export function dayLabel(dayId, today = localDayId()) {
    if (dayId === today) return 'Today';
    if (dayId === addDays(today, -1)) return 'Yesterday';
    return parseDayId(dayId).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
