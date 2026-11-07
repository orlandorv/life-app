import { MUSCLE_GROUPS } from './seed.js';

/**
 * Three goals a week, drawn on Monday and settled on Sunday.
 *
 * The *questions* are stored (in the progress ledger, keyed by week) while the
 * *answers* stay derived from that week's workouts — so a quest can't be
 * quietly rewritten to match what you happened to do, and deleting a workout
 * un-completes it again.
 *
 * Only weeks the app actually drew quests for score any: there's no inventing
 * retroactive goals for weeks you never saw, which would hand out a pile of
 * XP for challenges nobody was ever set.
 */

export const QUESTS_PER_WEEK = 3;
export const QUEST_XP = 100;
export const SWEEP_XP = 100;

/** How many past weeks the quest targets are calibrated against. */
const CALIBRATION_WEEKS = 4;

/** No plan at all: nothing planned, so nothing is known about how often a muscle is trained. */
export const NO_PLAN = { targets: new Map(), frequency: new Map() };

/** Enough headroom to be worth doing, not so much it's out of reach. */
const STRETCH = 1.1;

// --- Seeded randomness ---------------------------------------------------

// Deterministic from the week id, so the same week always draws the same
// three quests even before they've been written to the ledger — and so a
// reinstall mid-week doesn't reshuffle them.

function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mulberry32(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function pick(random, list) {
    return list[Math.floor(random() * list.length)];
}

// --- Calibration ---------------------------------------------------------

function recentWeeks(weeks, weekId) {
    return weeks
        .filter((week) => week.weekId < weekId && week.sessions > 0)
        .slice(-CALIBRATION_WEEKS);
}

function average(values, fallback) {
    if (!values.length) return fallback;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundUpTo(value, step) {
    return Math.max(step, Math.round(value / step) * step);
}

/**
 * What a past week's numbers come to for a week of `week.target` sessions: the
 * average **per session**, times the sessions this week is aiming for. Calibrating
 * on whole weeks would carry the old routine over: a few weeks of five sessions
 * would ask a three-session week for five sessions' worth of sets. Weeks with no
 * history fall back to `fallback`.
 */
function atTarget(history, week, measure, fallback) {
    const sessions = history.reduce((sum, w) => sum + w.sessions, 0);
    if (!sessions) return fallback;
    return (history.reduce((sum, w) => sum + measure(w), 0) / sessions) * week.target;
}

// --- The pool ------------------------------------------------------------

/**
 * Each builder returns the quest as it will be stored: a key, a numeric
 * target, and for muscle quests which muscle. Targets are sealed at draw time
 * so editing templates mid-week can't move the goalposts.
 */
const POOL = [
    {
        key: 'sessions',
        build: (_random, context) => ({ target: context.week.target }),
    },
    {
        key: 'records',
        build: () => ({ target: 1 }),
    },
    {
        // Twice in a week, so only for a muscle the plan trains in two or more sessions
        // (a push/pull/legs split trains each once, and can't ask for twice). With no plan
        // to go by, anything is possible.
        key: 'muscle-sessions',
        build: (random, context) => {
            const trainedTwice = context.plan.frequency.size
                ? context.muscles.filter((muscle) => (context.plan.frequency.get(muscle) || 0) >= 2)
                : context.muscles;
            if (!trainedTwice.length) return { target: 0 };
            return { muscle: pick(random, trainedTwice), target: 2 };
        },
    },
    {
        key: 'muscle-sets',
        build: (random, context) => {
            const muscle = pick(random, context.muscles);
            const planned = context.plan.targets.get(muscle) || 0;
            const usual = atTarget(context.history, context.week, (w) => w.muscleSets.get(muscle) || 0, 8);
            return { muscle, target: planned || roundUpTo(usual, 2) };
        },
    },
    {
        key: 'sets',
        build: (_random, context) => {
            // With no history, the plan's own sets for a week (else a middling 30).
            const planned = [...context.plan.targets.values()].reduce((sum, n) => sum + n, 0);
            const usual = atTarget(context.history, context.week, (w) => w.sets, planned || 30);
            return { target: roundUpTo(usual * STRETCH, 5) };
        },
    },
    {
        key: 'tonnage',
        build: (_random, context) => ({
            target: roundUpTo(atTarget(context.history, context.week, (w) => w.tonnageKg, 8000) * STRETCH, 250),
        }),
    },
    {
        // Three muscle groups in a week; a one-session week of a split can't, but a week of two sessions can.
        key: 'breadth',
        build: () => ({ target: 3 }),
    },
];

/**
 * The three quests for a week. Pure and deterministic — `sealQuests` is what
 * decides they count; this only decides what they are. `plan` is `{ targets,
 * frequency }` from volume.js (`weeklyPlan()`), passed in so this stays pure.
 */
export function generateQuests(weekId, weeks, plan = NO_PLAN) {
    const week = weeks.find((candidate) => candidate.weekId === weekId);
    if (!week) return [];

    const random = mulberry32(hashString(weekId));
    const history = recentWeeks(weeks, weekId);

    // Prefer muscles the plan actually programmes; fall back to the full list
    // so a user with no templates still gets a sensible draw.
    const planned = [...plan.targets.keys()].filter((muscle) => MUSCLE_GROUPS.includes(muscle));
    const context = { week, history, plan, muscles: planned.length ? planned : MUSCLE_GROUPS };

    const remaining = [...POOL];
    const quests = [];

    while (quests.length < QUESTS_PER_WEEK && remaining.length) {
        const [entry] = remaining.splice(Math.floor(random() * remaining.length), 1);
        const built = entry.build(random, context);
        if (!(built.target > 0)) continue;
        quests.push({ key: entry.key, ...built });
    }

    return quests;
}

// --- Evaluation ----------------------------------------------------------

function progressFor(quest, week) {
    switch (quest.key) {
        case 'sessions':
            return week.sessions;
        case 'records':
            return week.prs;
        case 'muscle-sessions':
            return week.muscleSessions.get(quest.muscle) || 0;
        case 'muscle-sets':
            return week.muscleSets.get(quest.muscle) || 0;
        case 'sets':
            return week.sets;
        case 'tonnage':
            return week.tonnageKg;
        case 'breadth':
            return week.muscleSets.size;
        default:
            return 0;
    }
}

export function evaluateQuest(quest, week) {
    const progress = progressFor(quest, week);
    return { ...quest, progress, done: progress >= quest.target };
}

/** The stored quests for a week, scored against it. Empty if none were drawn. */
export function questsForWeek(weekId, weeks, ledger) {
    const stored = ledger?.quests?.[weekId];
    const week = weeks.find((candidate) => candidate.weekId === weekId);
    if (!stored?.length || !week) return [];
    return stored.map((quest) => evaluateQuest(quest, week));
}

export function questXpForWeeks(weeks, ledger) {
    const stored = ledger?.quests || {};
    let xp = 0;

    for (const week of weeks) {
        const quests = stored[week.weekId];
        if (!quests?.length) continue;

        const done = quests.filter((quest) => evaluateQuest(quest, week).done).length;
        xp += done * QUEST_XP;
        if (done === quests.length) xp += SWEEP_XP;
    }

    return xp;
}
