import { addDays, weekStartId } from '../life/dates.js';
import { dayTotals, hasTarget } from './totals.js';

/**
 * The Nutrition week: how a Monday-to-Sunday week of eating went. Pure (no DOM,
 * no storage), so what it counts is checked in Node, and the Sunday review
 * reads its numbers from here rather than keeping a second set.
 *
 * A day you didn't log is a gap, never a zero: the averages are over the days
 * that have something in them, so one forgotten day doesn't pull a week down
 * to look like a diet.
 */

const mean = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

/** The days of the week starting `weekStart`, up to and including `today` if it falls inside. */
export function weekDays(weekStart, today) {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((day) => day <= today);
}

/**
 * `days` are the day ids to count (see `weekDays`), `byDay` a Map of day to that
 * day's food entries, `targets` the nutrition targets (an unset one is null).
 *
 * `avg` is the mean per *logged* day, or null when nothing was logged. For a
 * protein target, `proteinDaysHit` is how many logged days reached it (null with
 * no target).
 */
export function weekSummary({ days, byDay, targets }) {
    const perDay = days.map((day) => {
        const entries = byDay.get(day) ?? [];
        return { day, logged: entries.length > 0, ...dayTotals(entries) };
    });
    const logged = perDay.filter((day) => day.logged);

    const goal = (key) => (hasTarget(targets?.[key]) ? targets[key] : null);
    const proteinTarget = goal('proteinG');

    return {
        days: perDay,
        daysLogged: logged.length,
        daysInWeek: days.length,
        avg: logged.length
            ? {
                  kcal: mean(logged.map((d) => d.kcal)),
                  proteinG: mean(logged.map((d) => d.proteinG)),
                  carbsG: mean(logged.map((d) => d.carbsG)),
                  fatG: mean(logged.map((d) => d.fatG)),
              }
            : null,
        targets: { kcal: goal('kcal'), proteinG: proteinTarget, carbsG: goal('carbsG'), fatG: goal('fatG') },
        proteinDaysHit: proteinTarget ? logged.filter((d) => d.proteinG >= proteinTarget).length : null,
    };
}

/**
 * The top of the chart's scale: a round number above the biggest day and the
 * target, so the tallest bar never touches the top and the target line is always on it.
 */
export function chartTop(values, target = null, step = 500, min = 1000) {
    const biggest = Math.max(0, target ?? 0, ...values);
    return Math.max(min, Math.ceil((biggest * 1.12) / step) * step);
}

/**
 * Pixel geometry for the seven-bar chart. `slots` is one `{ day, kcal }` per day
 * Monday to Sunday, `kcal` null for a day with nothing logged (or still to come):
 * those get no bar, because a gap isn't a zero. Bars start at the baseline, so a
 * bar's height *is* its value; `targetY` is where the calorie target falls, or
 * null with none.
 */
export function weekBarsLayout(slots, kcalTarget, { width, height, padX = 4, padTop = 18, padBottom = 20, gap = 10 }) {
    const values = slots.map((slot) => slot.kcal).filter((value) => value !== null);
    const top = chartTop(values, kcalTarget);
    const baseline = height - padBottom;
    const y = (value) => padTop + (1 - value / top) * (baseline - padTop);
    const slotWidth = (width - padX * 2) / slots.length;
    const barWidth = slotWidth - gap;

    return {
        top,
        baseline,
        targetY: kcalTarget ? y(kcalTarget) : null,
        bars: slots.map((slot, i) => {
            const x = padX + i * slotWidth + gap / 2;
            if (slot.kcal === null) return { day: slot.day, x, w: barWidth, value: null, y: baseline, h: 0, centre: x + barWidth / 2 };
            const top = y(slot.kcal);
            return { day: slot.day, x, w: barWidth, value: slot.kcal, y: top, h: baseline - top, centre: x + barWidth / 2 };
        }),
    };
}

/** The Monday of the week containing `dayId` (re-exported so callers need one import). */
export const weekOf = weekStartId;
