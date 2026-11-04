import { addDays, localDayId, weekdayIndex, weekStartId } from './dates.js';
import { average, weeklyAverages } from '../body/stats.js';
import { weekCells, weekProgress, isWeekly } from '../habits/streaks.js';
import { dayTotals, hasTarget } from '../nutrition/totals.js';
import { hasContent, isLevel, moodLabel, energyLabel } from '../journal/insights.js';
import { entryMetBar } from '../gym/js/progression.js';
import { toDisplay, formatNumber } from '../gym/js/units.js';

/**
 * The weekly review: how the week went, one line per section, shown on Today
 * every Sunday. Pure (no DOM, no storage), so what it counts is checked in Node.
 *
 * It only reads what the sections already keep, and counts it the way they do:
 * a day you didn't log is a gap, never a zero (so an average is over the days
 * that have the number), and a section with nothing to say this week is left
 * out rather than shown empty.
 */

/** Monday=0 … Sunday=6, like `weekdayIndex`. */
export const REVIEW_WEEKDAY = 6;

export const isReviewDay = (today) => weekdayIndex(today) === REVIEW_WEEKDAY;

const rounded = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

function gymSummary({ gymWeek, workouts, weekStart, today }) {
    // Never trained: there is no week to review, and "0 of 3 sessions" on a
    // brand-new install would just be nagging.
    if (!workouts.length) return null;

    const thisWeek = workouts.filter((workout) => {
        const day = localDayId(new Date(workout.startedAt));
        return day >= weekStart && day <= today;
    });
    // The same test the live badge and the XP use, so "lifts at target" agrees with both.
    const liftsAtTarget = thisWeek.reduce((sum, workout) => sum + (workout.entries || []).filter((entry) => entryMetBar(entry)).length, 0);

    return {
        sessions: gymWeek?.sessions ?? thisWeek.length,
        target: gymWeek?.target ?? null,
        sets: gymWeek?.sets ?? 0,
        tonnageKg: gymWeek?.tonnageKg ?? 0,
        prs: gymWeek?.prs ?? 0,
        liftsAtTarget,
    };
}

function bodySummary({ bodyEntries, today }) {
    // Asking for one week gives this week, and nothing at all if it has no data.
    const [thisWeek] = weeklyAverages(bodyEntries, today, 1);
    if (!thisWeek) return null;
    return {
        weightKg: thisWeek.weightKg,
        weightChangeKg: thisWeek.weightChangeKg,
        sleepHours: thisWeek.sleepHours,
        steps: thisWeek.steps,
    };
}

function nutritionSummary({ nutritionDays, targets, days }) {
    const logged = days.filter((day) => (nutritionDays.get(day) ?? []).length > 0);
    if (!logged.length) return null;
    const totals = logged.map((day) => dayTotals(nutritionDays.get(day)));
    return {
        daysLogged: logged.length,
        daysInWeek: days.length,
        kcal: average(totals.map((t) => t.kcal)),
        proteinG: average(totals.map((t) => t.proteinG)),
        kcalTarget: hasTarget(targets?.kcal) ? targets.kcal : null,
        proteinTarget: hasTarget(targets?.proteinG) ? targets.proteinG : null,
    };
}

function habitsSummary({ habits, done, weekStart, today }) {
    let doneCount = 0;
    let dueCount = 0;
    let full = 0;
    for (const habit of habits) {
        // A weekly habit has no due days, just a target for the week.
        if (isWeekly(habit)) {
            const progress = weekProgress(habit, done.get(habit.id) ?? new Set(), weekStart, today);
            if (!progress.due) continue;
            doneCount += progress.done;
            dueCount += progress.due;
            if (progress.done === progress.due) full += 1;
            continue;
        }
        // Days still to come this week aren't due yet, so they can't count against you.
        const cells = weekCells(habit, done.get(habit.id) ?? new Set(), weekStart, today).filter((cell) => cell.state !== 'off' && cell.state !== 'future');
        if (!cells.length) continue;
        const ticked = cells.filter((cell) => cell.state === 'done').length;
        doneCount += ticked;
        dueCount += cells.length;
        if (ticked === cells.length) full += 1;
    }
    return dueCount ? { done: doneCount, due: dueCount, full } : null;
}

function journalSummary({ journalEntries, weekStart, today }) {
    const week = journalEntries.filter((entry) => entry.day >= weekStart && entry.day <= today && hasContent(entry));
    if (!week.length) return null;
    return {
        days: week.length,
        mood: average(week.map((entry) => entry.mood).filter(isLevel)),
        energy: average(week.map((entry) => entry.energy).filter(isLevel)),
    };
}

/**
 * The week Monday..`today`, or null when there's nothing in it to review.
 *
 * - `gymWeek`: this week's row from Gym's progress (sessions, target, sets,
 *   tonnageKg, prs) — Gym's own numbers, not a second count.
 * - `workouts`: finished workouts. `bodyEntries`, `journalEntries`: those
 *   sections' entries. `nutritionDays`: a Map of day → that day's food entries.
 * - `habits` and `done` (a Map of habit id → Set of ticked days).
 */
export function buildWeeklyReview({
    today,
    gymWeek = null,
    workouts = [],
    bodyEntries = [],
    nutritionDays = new Map(),
    targets = null,
    habits = [],
    done = new Map(),
    journalEntries = [],
}) {
    const weekStart = weekStartId(today);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((day) => day <= today);

    const review = {
        weekStart,
        weekEnd: today,
        gym: gymSummary({ gymWeek, workouts, weekStart, today }),
        body: bodySummary({ bodyEntries, today }),
        nutrition: nutritionSummary({ nutritionDays, targets, days }),
        habits: habitsSummary({ habits, done, weekStart, today }),
        journal: journalSummary({ journalEntries, weekStart, today }),
    };

    return review.gym || review.body || review.nutrition || review.habits || review.journal ? review : null;
}

// --- Wording ------------------------------------------------------------------

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const signed = (value) => `${value < 0 ? '−' : '+'}${formatNumber(Math.abs(value))}`;
// A number and its unit never part across a line break.
const NB = '\u00a0';

/**
 * The rows the card shows, in the sections' order: `{ tone, icon, label, text,
 * detail? }`. Weights are shown in `unit`, converted here at the edge; numbers
 * are grouped the way `locale` does it (the phone's own, by default, like the
 * rest of the app).
 */
export function reviewRows(review, { unit = 'kg', locale } = {}) {
    const rows = [];
    const whole = (value) => Math.round(value).toLocaleString(locale);

    if (review.gym) {
        const { sessions, target, sets, tonnageKg, prs, liftsAtTarget } = review.gym;
        const detail = [
            sets > 0 ? plural(sets, 'set') : null,
            tonnageKg > 0 ? `${whole(toDisplay(tonnageKg, unit))}${NB}${unit} moved` : null,
            prs > 0 ? plural(prs, 'personal record') : null,
            liftsAtTarget > 0 ? `${plural(liftsAtTarget, 'lift')} at target` : null,
        ].filter(Boolean);
        rows.push({
            tone: 'gym',
            icon: 'gym',
            label: 'Gym',
            text: target ? `${sessions} of ${plural(target, 'session')}` : plural(sessions, 'session'),
            detail: detail.join(' · ') || null,
        });
    }

    if (review.body) {
        const { weightKg, weightChangeKg, sleepHours, steps } = review.body;
        const parts = [];
        if (weightKg !== null) {
            const shown = `${formatNumber(rounded(toDisplay(weightKg, unit)))}${NB}${unit}`;
            const change = weightChangeKg === null ? null : rounded(toDisplay(weightChangeKg, unit));
            parts.push(change === null ? shown : change === 0 ? `${shown}, steady` : `${shown} (${signed(change)} vs previous weigh-in week)`);
        }
        if (sleepHours !== null) parts.push(`${formatNumber(rounded(sleepHours))}${NB}h sleep a night`);
        if (steps !== null) parts.push(`${whole(steps)} steps a day`);
        // Weight is the headline; sleep and steps sit beneath it, like the other rows.
        rows.push({ tone: 'body', icon: 'body', label: 'Body', text: parts[0], detail: parts.slice(1).join(' · ') || null });
    }

    if (review.nutrition) {
        const { daysLogged, daysInWeek, kcal, proteinG, kcalTarget, proteinTarget } = review.nutrition;
        const detail = [
            `${whole(kcal)}${NB}kcal${kcalTarget ? ` of ${whole(kcalTarget)}` : ''} a day`,
            `${whole(proteinG)}${NB}g protein${proteinTarget ? ` of ${whole(proteinTarget)}` : ''}`,
        ];
        rows.push({
            tone: 'nutrition',
            icon: 'nutrition',
            label: 'Nutrition',
            text: `Logged ${daysLogged} of ${daysInWeek} days`,
            detail: detail.join(' · '),
        });
    }

    if (review.habits) {
        const { done, due, full } = review.habits;
        rows.push({
            tone: 'habits',
            icon: 'habits',
            label: 'Habits',
            text: `${done} of ${due} done (${Math.round((done / due) * 100)}%)`,
            detail: full > 0 ? `${plural(full, 'habit')} done every day it was due` : null,
        });
    }

    if (review.journal) {
        const { days, mood, energy } = review.journal;
        const detail = [
            mood !== null ? `mood ${moodLabel(Math.round(mood)).toLowerCase()}` : null,
            energy !== null ? `energy ${energyLabel(Math.round(energy)).toLowerCase()}` : null,
        ].filter(Boolean);
        rows.push({
            tone: 'journal',
            icon: 'journal',
            label: 'Journal',
            text: plural(days, 'check-in'),
            detail: detail.length ? `On average, ${detail.join(' and ')}` : null,
        });
    }

    return rows;
}
