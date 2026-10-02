import { addDays, daysBetween, weekStartId, localDayId, weekdayIndex } from '../life/dates.js';

/**
 * Numbers for the Body screen — pure, so they can be checked without a DOM or
 * a database. An entry is `{day, weightKg, sleepHours, steps}` with any of the
 * three possibly null (not recorded). Entries are in chronological order where
 * a function says so; weight is always kg here and converted at the display edge.
 */

export const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
const present = (value) => value !== null && value !== undefined;

/**
 * Smooths day-to-day noise: single weigh-ins bounce with water and food, so
 * the trend is what actually moves. An exponential moving average, weighting
 * each reading by 10% per day elapsed — a gap of several days lets a new
 * reading count for more than one taken the day after the last.
 */
export const TREND_WEIGHT_PER_DAY = 0.1;

export function trendSeries(entries) {
    const weighed = entries.filter((entry) => present(entry.weightKg));
    const series = [];

    for (const entry of weighed) {
        const previous = series[series.length - 1];
        let trendKg = entry.weightKg;

        if (previous) {
            const gap = Math.max(1, daysBetween(previous.day, entry.day));
            const weight = 1 - (1 - TREND_WEIGHT_PER_DAY) ** gap;
            trendKg = previous.trendKg + weight * (entry.weightKg - previous.trendKg);
        }

        series.push({ day: entry.day, weightKg: entry.weightKg, trendKg });
    }

    return series;
}

/** How far the trend moved across a slice of the series; null with fewer than two points. */
export function trendChange(series) {
    if (series.length < 2) return null;
    return series[series.length - 1].trendKg - series[0].trendKg;
}

/**
 * The newest `count` weeks (Monday-first, this week included) that have at
 * least one recorded number, newest first. Each average is over the days that
 * have that number, so a missed weigh-in doesn't drag it toward zero.
 * `weightChangeKg` compares against the nearest older week that had a weight.
 */
export function weeklyAverages(entries, today, count = 8) {
    const byWeek = new Map();
    for (const entry of entries) {
        const key = weekStartId(entry.day);
        if (!byWeek.has(key)) byWeek.set(key, []);
        byWeek.get(key).push(entry);
    }

    const weeks = [];
    for (let i = 0; i < count; i += 1) {
        const weekStart = addDays(weekStartId(today), -7 * i);
        const days = byWeek.get(weekStart) ?? [];
        const weights = days.map((e) => e.weightKg).filter(present);
        const sleeps = days.map((e) => e.sleepHours).filter(present);
        const steps = days.map((e) => e.steps).filter(present);

        weeks.push({
            weekStart,
            weightKg: average(weights),
            sleepHours: average(sleeps),
            steps: average(steps),
            weightDays: weights.length,
            hasData: weights.length + sleeps.length + steps.length > 0,
        });
    }

    // Look past the window for the comparison week too, so the oldest shown
    // week still gets a change if there's earlier data.
    const olderWeight = (weekStart) => {
        const earlier = [...byWeek.keys()].filter((key) => key < weekStart).sort().reverse();
        for (const key of earlier) {
            const weights = byWeek.get(key).map((e) => e.weightKg).filter(present);
            if (weights.length) return average(weights);
        }
        return null;
    };

    return weeks
        .filter((week) => week.hasData)
        .map((week) => {
            const before = week.weightKg === null ? null : olderWeight(week.weekStart);
            return { ...week, weightChangeKg: before === null ? null : week.weightKg - before };
        });
}

/**
 * Pixel positions for the weight chart: raw readings as dots and the trend as
 * a polyline, both over the `from`..`to` window. The y range is padded and
 * kept at least ~1 kg tall so a flat few days doesn't zoom into noise.
 */
export function chartLayout(series, { from, to, width, height, padX = 8, padTop = 10, padBottom = 18 }) {
    const points = series.filter((point) => point.day >= from && point.day <= to);
    if (points.length < 2) return null;

    const values = points.flatMap((p) => [p.weightKg, p.trendKg]);
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const minSpan = 1;
    if (hi - lo < minSpan) {
        const mid = (hi + lo) / 2;
        lo = mid - minSpan / 2;
        hi = mid + minSpan / 2;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;

    const span = Math.max(1, daysBetween(from, to));
    const x = (day) => padX + (daysBetween(from, day) / span) * (width - padX * 2);
    const y = (kg) => padTop + (1 - (kg - lo) / (hi - lo)) * (height - padTop - padBottom);

    const dots = points.map((p) => ({ day: p.day, kg: p.weightKg, x: x(p.day), y: y(p.weightKg) }));
    const trend = points.map((p) => ({ x: x(p.day), y: y(p.trendKg) }));
    const line = trend.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    const ticks = [lo + pad, (lo + hi) / 2, hi - pad].map((kg) => ({ kg, y: y(kg) }));

    return { dots, line, ticks };
}

// --- Daily bar charts (steps, sleep) -------------------------------------------

/** The days in `from`..`to` that have a recorded `key`, as `[{day, value}]`, oldest first. */
export function dailySeries(entries, key, from, to) {
    return entries
        .filter((entry) => present(entry[key]) && entry.day >= from && entry.day <= to)
        .map((entry) => ({ day: entry.day, value: entry[key] }))
        .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * A rolling mean for each day in `from`..`to`: the average of the recorded
 * days in the `window` days ending that day. Missed days aren't zeros — they
 * simply aren't in the average — and a day with fewer than `minDays` recorded
 * in its window gets no point, so one lucky reading can't pose as a trend.
 * Pass `points` reaching back `window - 1` days before `from` so the first
 * days have their full window.
 */
export function rollingAverage(points, from, to, { window = 7, minDays = 3 } = {}) {
    const out = [];
    for (let day = from; day <= to; day = addDays(day, 1)) {
        const start = addDays(day, -(window - 1));
        const inWindow = points.filter((point) => point.day >= start && point.day <= day);
        if (inWindow.length >= minDays) out.push({ day, value: average(inWindow.map((point) => point.value)) });
    }
    return out;
}

/** `value` rounded up to a multiple of `unit`, never below `min` — keeps a chart's top at a number worth reading. */
export const niceCeil = (value, unit, min = unit) => Math.max(min, Math.ceil(value / unit) * unit);

/**
 * Pixel positions for a daily bar chart over `from`..`to`: one bar per
 * recorded day (a missed day is a gap, not a zero-height bar), the rolling
 * average as a line through the middle of each day's slot, gridline values at
 * 0, half and the top, and an optional shaded `band` ({from, to} in the same
 * units as the values). Bars always start at 0 — a bar's length is its value.
 * `unit`/`minTop` set how the top is rounded; null with fewer than two
 * recorded days, same as the weight chart.
 */
export function barChartLayout(points, averages, { from, to, width, height, unit, minTop, band = null, padX = 8, padTop = 10, padBottom = 18 }) {
    const shown = points.filter((point) => point.day >= from && point.day <= to);
    if (shown.length < 2) return null;

    const days = daysBetween(from, to) + 1;
    const top = niceCeil(Math.max(...shown.map((point) => point.value), band ? band.to : 0), unit, minTop);
    const slot = (width - padX * 2) / days;
    const barWidth = Math.max(1.5, Math.min(slot * 0.72, 14));
    const y = (value) => padTop + (1 - value / top) * (height - padTop - padBottom);
    const baseline = y(0);
    const slotLeft = (day) => padX + daysBetween(from, day) * slot;

    const bars = shown.map((point) => {
        const barY = y(point.value);
        return {
            day: point.day,
            value: point.value,
            x: slotLeft(point.day) + (slot - barWidth) / 2,
            y: barY,
            w: barWidth,
            h: Math.max(1, baseline - barY),
        };
    });

    let line = '';
    let previous = null;
    for (const point of averages.filter((a) => a.day >= from && a.day <= to)) {
        const joined = previous !== null && daysBetween(previous, point.day) === 1;
        line += `${joined ? 'L' : line ? ' M' : 'M'}${(slotLeft(point.day) + slot / 2).toFixed(1)} ${y(point.value).toFixed(1)}`;
        previous = point.day;
    }

    return {
        bars,
        line,
        top,
        ticks: [0, top / 2, top].map((value) => ({ value, y: y(value) })),
        band: band ? { y: y(band.to), h: y(band.from) - y(band.to) } : null,
    };
}

// --- Weekly reminder ---------------------------------------------------------

/** Saturday (Monday=0 … Sunday=6) at noon: when the weekly weigh-in reminder starts. */
export const REMINDER_WEEKDAY = 5;
export const REMINDER_HOUR = 12;

/**
 * Whether to remind you to log this week's weight and steps, and which is
 * still missing. It starts Saturday at noon and runs through Sunday; an entry
 * on either day counts, so logging a day late still clears it. Weight and
 * steps can come from different entries.
 */
export function weeklyLogReminder(entries, now = new Date()) {
    const today = localDayId(now);
    const weekday = weekdayIndex(today);
    const started = weekday > REMINDER_WEEKDAY || (weekday === REMINDER_WEEKDAY && now.getHours() >= REMINDER_HOUR);
    if (!started) return { due: false, missing: [] };

    const weekend = new Set([addDays(weekStartId(today), 5), addDays(weekStartId(today), 6)]);
    const logged = entries.filter((entry) => weekend.has(entry.day));
    const missing = [
        logged.some((entry) => present(entry.weightKg)) ? null : 'weight',
        logged.some((entry) => present(entry.steps)) ? null : 'steps',
    ].filter(Boolean);

    return { due: missing.length > 0, missing };
}
