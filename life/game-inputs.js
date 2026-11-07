import { lifeDb } from './db.js';
import { localDayId } from './dates.js';
import { buildGame, defaultGoals, GOAL_IDS } from './game-rules.js';
import { state as gymState } from '../gym/js/store.js';
import { loadTargets, state as nutrition } from '../nutrition/store.js';

/**
 * Feeds the game's rules with what the sections have recorded, and keeps the
 * small ledger. The rules themselves are pure (game-rules.js); this is the part
 * that reads storage.
 *
 * The ledger is one LifeDB `settings` row, `lifeGame`, so it rides in backups
 * and needs no new store: `{ version, goals, seenLevel, lastGoodDay }`. Goals are
 * `{ from, to }` day ranges (see game-rules.js), so switching one on or off never
 * rescores the past. `seenLevel` and `lastGoodDay` are what has already been
 * celebrated, so history never arrives as a flood of rewards.
 */

export const LEDGER_KEY = 'lifeGame';
const LEDGER_VERSION = 1;

const earliest = (days) => days.reduce((a, b) => (a && a < b ? a : b), null);

/** The first day each goal has any data, so a first run can count what you already did. */
function firstUse({ habits, foodByDay, journalByDay, bodyByDay, workoutDays, taskDays }) {
    const keys = (map) => [...map.keys()];
    return {
        habits: earliest(habits.map((habit) => habit.startDay)),
        food: earliest(keys(foodByDay)),
        journal: earliest(keys(journalByDay)),
        body: earliest(keys(bodyByDay)),
        workout: earliest([...workoutDays]),
        tasks: earliest([...taskDays]),
    };
}

/** Everything the rules read, grouped by day. Reads storage; changes nothing. */
export async function gatherInputs() {
    await lifeDb.init();
    const [habits, logs, food, journal, body, taskLogs] = await Promise.all([
        lifeDb.getAll('habits'),
        lifeDb.getAll('habitLogs'),
        lifeDb.getAll('nutritionEntries'),
        lifeDb.getAll('journalEntries'),
        lifeDb.getAll('bodyEntries'),
        lifeDb.getAll('taskLogs'),
        loadTargets(),
    ]);

    const done = new Map();
    for (const log of logs) {
        if (!done.has(log.habitId)) done.set(log.habitId, new Set());
        done.get(log.habitId).add(log.day);
    }
    const foodByDay = new Map();
    for (const entry of food) {
        if (!foodByDay.has(entry.day)) foodByDay.set(entry.day, []);
        foodByDay.get(entry.day).push(entry);
    }

    return {
        habits,
        done,
        foodByDay,
        journalByDay: new Map(journal.map((entry) => [entry.day, entry])),
        bodyByDay: new Map(body.map((entry) => [entry.day, entry])),
        // Finished workouts only (Gym keeps unfinished ones out of its list), on the local day they started.
        workoutDays: new Set((gymState.workouts ?? []).map((workout) => localDayId(new Date(workout.startedAt)))),
        // Days a task was finished (tasks/completions.js): the tasks themselves keep no history.
        taskDays: new Set(taskLogs.map((log) => log.day)),
        proteinTarget: nutrition.targets.proteinG,
    };
}

export async function loadLedger() {
    const stored = await lifeDb.getSetting(LEDGER_KEY, null);
    return stored && typeof stored === 'object' && stored.goals ? stored : null;
}

export function saveLedger(ledger) {
    return lifeDb.saveSetting(LEDGER_KEY, { ...ledger, version: LEDGER_VERSION });
}

const emptyGoals = () => Object.fromEntries(GOAL_IDS.map((id) => [id, null]));

/**
 * The game as of `today`: `{ game, ledger, ctx }`. The first time, it seeds the
 * goals from what you already use and records the level you are already at as
 * seen, so nothing in your history is announced as new.
 */
export async function computeGame(today = localDayId()) {
    const ctx = { ...(await gatherInputs()), goals: emptyGoals() };
    let ledger = await loadLedger();

    if (!ledger) {
        ctx.goals = defaultGoals(firstUse(ctx), today);
        const game = buildGame(ctx, today);
        ledger = { goals: ctx.goals, seenLevel: game.level.level, lastGoodDay: game.today?.good ? today : null };
        await saveLedger(ledger);
        return { game, ledger, ctx };
    }

    // A goal added after this ledger was written (Tasks, v13) isn't in it yet: switch it
    // on from today, once, so it counts without rescoring a day that has passed.
    const added = GOAL_IDS.filter((id) => !(id in ledger.goals));
    if (added.length) {
        ledger = { ...ledger, goals: { ...ledger.goals, ...Object.fromEntries(added.map((id) => [id, { from: today, to: null }])) } };
        await saveLedger(ledger);
    }

    ctx.goals = { ...emptyGoals(), ...ledger.goals };
    return { game: buildGame(ctx, today), ledger, ctx };
}
