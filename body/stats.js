import { addDays, daysBetween, weekStartId } from '../life/dates.js';

/**
 * Numbers for the Body screen — pure, so they can be checked without a DOM or
 * a database. An entry is `{day, weightKg, sleepHours, steps}` with any of the
 * three possibly null (not recorded). Entries are in chronological order where
 * a function says so; weight is always kg here and converted at the display edge.
 */

const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);
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
