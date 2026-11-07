import { addDays, daysBetween } from './dates.js';
import { isDue } from '../habits/streaks.js';
import { mealOf } from '../nutrition/portions.js';
import { dayTotals, hasTarget } from '../nutrition/totals.js';
import { hasContent } from '../journal/insights.js';

/**
 * The game layer's rules: a day's goals, its XP, a streak of good days, and a
 * level. Pure (no DOM, no storage), so every number is checked in Node.
 *
 * **Everything is derived from the data, never counted as it happens.** A day is
 * scored only from that day's own records, so the result is idempotent (tick,
 * untick and re-tick give the same score), capped per day by construction (the
 * most a day can pay is `MAX_BASE_XP` + the bonuses), and indifferent to when
 * something was entered (a day you forgot to log and filled in later counts
 * once). Like Gym's XP, deleting or editing data can lower a level, and a
 * restored backup is instantly right.
 *
 * Missing days never *take XP away*: a missed day pays 0, and only the streak
 * notices. The lists with no usable history (Videos, Books, Movies & TV, Wishlist,
 * Inbox) are deliberately not here: there is nothing to derive from, and paying
 * for them would pay you to farm, to spend, or to write junk. Tasks are the one
 * exception, as a small capped bonus, because they keep their own log of the days
 * a task was finished (tasks/completions.js).
 */

// --- Tunable constants ---------------------------------------------------------------

/** What each goal is worth towards the day's 100. They are shares of the goals that *apply* that day. */
export const WEIGHTS = { habits: 40, food: 25, body: 20, journal: 15 };
/** Bonuses sit on top: they are never required, so a rest day can still be a good day. */
export const BONUS = { workout: 20, protein: 10, tasks: 10 };
/** The goals you can switch on or off. Workout and Tasks are bonuses (never in a day's 100); the other four are what a day is scored on. */
export const GOAL_IDS = ['habits', 'food', 'body', 'journal', 'workout', 'tasks'];
export const BONUS_GOALS = ['workout', 'tasks'];

export const MAX_BASE_XP = 100;
/** A day is "good" at this share of what applied to it. */
export const GOOD_AT = 70;
/** Meals to log for the food goal to be full. */
export const MEALS_FOR_FOOD = 2;

/** A streak of this many good days banks a freeze, up to `MAX_FREEZES`. */
export const FREEZE_EVERY = 7;
export const MAX_FREEZES = 2;

/** XP to go from level n to n + 1: 250, 300, 350… */
export const LEVEL_BASE = 250;
export const LEVEL_STEP = 50;

/** How far back the first run reaches when it seeds a goal from your old data. */
export const SEED_DAYS = 365;

// --- Levels --------------------------------------------------------------------------

export const levelCost = (level) => LEVEL_BASE + LEVEL_STEP * (level - 1);

/** Total XP needed to *reach* `level` (level 1 is 0). */
export const xpForLevel = (level) => {
    const steps = Math.max(0, level - 1);
    return LEVEL_BASE * steps + (LEVEL_STEP * steps * (steps - 1)) / 2;
};

/** `{ level, into, span }`: the level, XP into it, and what it costs to leave it. No cap. */
export function levelFromXp(xp) {
    let level = 1;
    let rest = Math.max(0, Math.floor(xp));
    while (rest >= levelCost(level)) {
        rest -= levelCost(level);
        level += 1;
    }
    return { level, into: rest, span: levelCost(level) };
}

// --- One day -------------------------------------------------------------------------

/** A goal switched on from `from` (a day) until `to` (a day, or null for still on). */
const goalOn = (range, day) => Boolean(range) && day >= range.from && (range.to == null || day <= range.to);

const hasNumber = (value) => Number.isFinite(value) && value > 0;
const hasBodyNumber = (entry) => Boolean(entry) && (hasNumber(entry.weightKg) || hasNumber(entry.sleepHours) || hasNumber(entry.steps));

/**
 * `ctx`: `goals` (id → `{ from, to }` or null), `habits`, `done` (habit id → Set of
 * ticked days), `foodByDay`, `journalByDay`, `bodyByDay` (Maps from day), `workoutDays`
 * and `taskDays` (Sets of days), `proteinTarget` (a number, or null for none).
 *
 * Returns `{ day, goals: [{ id, weight, fraction, done?, of? }], applies, base, bonuses,
 * bonusXp, xp, good }`. `goals` lists the goals that applied; `base` is 0–100, or null
 * when nothing applied (a *neutral* day, which neither scores nor breaks a streak).
 */
export function scoreDay(day, ctx) {
    const goals = [];

    if (goalOn(ctx.goals.habits, day)) {
        // Only habits still asked for that day. More habits dilute the share, never inflate it.
        const due = ctx.habits.filter((habit) => isDue(habit, ctx.done.get(habit.id) ?? new Set(), day));
        if (due.length) {
            const ticked = due.filter((habit) => (ctx.done.get(habit.id) ?? new Set()).has(day)).length;
            goals.push({ id: 'habits', weight: WEIGHTS.habits, fraction: ticked / due.length, done: ticked, of: due.length });
        }
    }

    const food = ctx.foodByDay.get(day) ?? [];
    if (goalOn(ctx.goals.food, day)) {
        const meals = new Set(food.map(mealOf)).size;
        goals.push({ id: 'food', weight: WEIGHTS.food, fraction: Math.min(1, meals / MEALS_FOR_FOOD), done: Math.min(meals, MEALS_FOR_FOOD), of: MEALS_FOR_FOOD });
    }
    if (goalOn(ctx.goals.body, day)) {
        goals.push({ id: 'body', weight: WEIGHTS.body, fraction: hasBodyNumber(ctx.bodyByDay.get(day)) ? 1 : 0 });
    }
    if (goalOn(ctx.goals.journal, day)) {
        goals.push({ id: 'journal', weight: WEIGHTS.journal, fraction: hasContent(ctx.journalByDay.get(day)) ? 1 : 0 });
    }

    const applicable = goals.reduce((sum, goal) => sum + goal.weight, 0);
    const earned = goals.reduce((sum, goal) => sum + goal.weight * goal.fraction, 0);
    const base = applicable ? Math.round((MAX_BASE_XP * earned) / applicable) : null;

    // Bonuses: a finished workout, a task finished, and the protein target reached.
    // Never calories: paying for a number of calories would pay for under-eating.
    // A task is one bonus however many you finish (capped, so it can't be farmed).
    const bonuses = [];
    if (goalOn(ctx.goals.workout, day) && ctx.workoutDays.has(day)) bonuses.push('workout');
    if (goalOn(ctx.goals.tasks, day) && ctx.taskDays?.has(day)) bonuses.push('tasks');
    if (goalOn(ctx.goals.food, day) && hasTarget(ctx.proteinTarget) && dayTotals(food).proteinG >= ctx.proteinTarget) bonuses.push('protein');
    const bonusXp = bonuses.reduce((sum, id) => sum + BONUS[id], 0);

    return {
        day,
        goals,
        applies: applicable > 0,
        base,
        bonuses,
        bonusXp,
        xp: (base ?? 0) + bonusXp,
        good: base !== null && base >= GOOD_AT,
    };
}

// --- Many days -----------------------------------------------------------------------

/**
 * Walks the days in order. A good day extends the streak; every `FREEZE_EVERY` in a
 * row banks a freeze. A missed day spends a freeze to keep the streak (it doesn't
 * grow) or, with none, ends it. Today is still open, so it never breaks anything.
 * Neutral days (nothing applied) are skipped.
 */
export function walkStreak(rows, today) {
    let streak = 0;
    let best = 0;
    let freezes = 0;
    let sinceFreeze = 0;

    for (const row of rows) {
        if (!row.applies) continue;
        if (row.good) {
            streak += 1;
            sinceFreeze += 1;
            best = Math.max(best, streak);
            if (sinceFreeze === FREEZE_EVERY) {
                freezes = Math.min(MAX_FREEZES, freezes + 1);
                sinceFreeze = 0;
            }
        } else if (row.day !== today) {
            if (freezes > 0) freezes -= 1;
            else streak = 0;
            sinceFreeze = 0;
        }
    }
    return { streak, best, freezes };
}

/**
 * The whole game as of `today`: a row per day from the first day any goal was on,
 * the total XP, the level, and the streak. `ctx` is `scoreDay`'s.
 */
export function buildGame(ctx, today) {
    const starts = GOAL_IDS.map((id) => ctx.goals[id]?.from).filter(Boolean);
    if (!starts.length) return { rows: [], byDay: new Map(), today: null, xp: 0, level: levelFromXp(0), streak: 0, best: 0, freezes: 0, goodDays: 0 };

    const first = starts.reduce((a, b) => (a < b ? a : b));
    const rows = [];
    for (let i = 0, n = daysBetween(first, today); i <= n; i += 1) rows.push(scoreDay(addDays(first, i), ctx));

    const xp = rows.reduce((sum, row) => sum + row.xp, 0);
    return {
        rows,
        byDay: new Map(rows.map((row) => [row.day, row])),
        today: rows[rows.length - 1] ?? null,
        xp,
        level: levelFromXp(xp),
        ...walkStreak(rows, today),
        goodDays: rows.filter((row) => row.good).length,
    };
}

// --- First run -----------------------------------------------------------------------

/**
 * The goals a first run switches on, from what you already use. `firstUse` maps a
 * goal id to the first day it has data (or null). A goal you've used counts from
 * then (at most `SEED_DAYS` back, so the maths stays small); one you haven't is
 * left off, to be switched on in the sheet. With no data anywhere, the four daily
 * goals start today.
 */
export function defaultGoals(firstUse, today) {
    const earliest = addDays(today, -SEED_DAYS);
    const seeded = {};
    for (const id of GOAL_IDS) {
        const first = firstUse[id] ?? null;
        seeded[id] = first ? { from: first > earliest ? first : earliest, to: null } : null;
    }
    if (GOAL_IDS.every((id) => !seeded[id])) {
        for (const id of GOAL_IDS) seeded[id] = { from: today, to: null };
    }
    return seeded;
}

/** Switches a goal on (from today) or off (through yesterday), keeping the past as it was scored. */
export function withGoal(goals, id, on, today) {
    const next = { ...goals };
    if (on) next[id] = goalOn(goals[id], today) ? goals[id] : { from: today, to: null };
    else if (goals[id] && goals[id].to == null) next[id] = { from: goals[id].from, to: addDays(today, -1) };
    // Turned off the day it was turned on: it never counted at all.
    if (!on && next[id] && next[id].to < next[id].from) next[id] = null;
    return next;
}
