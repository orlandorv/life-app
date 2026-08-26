import { state, saveProgressLedger } from './store.js';
import { isLoggedWork } from './records.js';
import { weekStart } from './volume.js';
import { MUSCLE_GROUPS } from './seed.js';
import { evaluateBadges } from './badges.js';
import { questXpForWeeks, generateQuests } from './quests.js';

/**
 * Everything the Progress tab shows — XP, levels, streaks, per-week and
 * lifetime totals — is *derived* from `state.workouts` here, never stored as a
 * running counter. Deleting a workout therefore takes its XP back with it, a
 * restored backup is instantly correct, and no total can drift out of sync
 * with the history it claims to summarise.
 *
 * The only thing persisted (in `state.progressLedger`) is what's already been
 * celebrated, plus each week's sealed session target — see `sealCurrentWeek`.
 *
 * Nothing here is memoised. It's the same triple loop over workouts that
 * Records already runs on every render, and at a few hundred sessions that
 * costs well under a millisecond — cheaper than any cache that could go stale.
 */

// --- XP rates ------------------------------------------------------------

/**
 * Weighted toward effort rather than attendance: showing up is worth less
 * than a hard session, and a session that beats a record is worth most of all.
 * Elapsed time is deliberately absent — paying for minutes would reward
 * dawdling between sets.
 */
export const XP = {
    session: 50,
    perSet: 5,
    perHundredKg: 1,
    pr: 75,
    progression: 25,
    weeklyTarget: 150,
    perStreakWeek: 25,
    streakWeeksCounted: 10,
};

/** Weeks with no templates in the plan still need a target to aim at. */
const DEFAULT_WEEKLY_TARGET = 3;

/** Clean weeks needed to bank one freeze, and the most you can hold. */
const WEEKS_PER_FREEZE = 4;
const MAX_FREEZES = 2;

/**
 * Level n costs `BASE + STEP × (n − 1)`, so the total to reach a level grows
 * roughly with its square. Tuned against a full simulated year: a solid four
 * sessions a week lands around level 19 after twelve months and reaches the
 * last rank somewhere near two years. Levels come every session or two at the
 * start and then stretch out, which is the point — the early ones are there
 * to get you hooked, the later ones to be worth something.
 */
const LEVEL_BASE = 400;
const LEVEL_STEP = 450;

const RANKS = [
    { from: 25, name: 'Machine' },
    { from: 20, name: 'Relentless' },
    { from: 15, name: 'Strong' },
    { from: 10, name: 'Committed' },
    { from: 5, name: 'Regular' },
    { from: 1, name: 'Rookie' },
];

// --- Dates ---------------------------------------------------------------

/**
 * Local `YYYY-MM-DD` for an ISO timestamp.
 *
 * `workout.date` can't be used for any of this: it's `toISOString()`, i.e.
 * UTC, so a 23:30 session in a UTC+2 summer lands on the *next* day. Harmless
 * for the existing views, visibly wrong for a day grid or a streak.
 */
export function localDayId(iso) {
    const date = new Date(iso);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

/** The `YYYY-MM-DD` of the Monday whose week contains `date`. */
export function weekIdOf(date = new Date()) {
    return localDayId(weekStart(date));
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

// --- Set classification --------------------------------------------------

/**
 * Counted as training done. Looser than Records' `isLoggedWork`, which also
 * demands weight above zero — a set of pull-ups is real work and should earn
 * its XP, it just can't contribute tonnage or a weight PR.
 */
export function isWorkingSet(set) {
    return Boolean(set.done) && !set.warmup;
}

function workoutTotals(workout) {
    let sets = 0;
    let tonnageKg = 0;
    let heaviestKg = 0;

    for (const entry of workout.entries || []) {
        for (const set of entry.sets || []) {
            if (!isWorkingSet(set)) continue;
            sets += 1;
            if (!isLoggedWork(set)) continue;
            tonnageKg += set.weightKg * set.reps;
            if (set.weightKg > heaviestKg) heaviestKg = set.weightKg;
        }
    }

    return { sets, tonnageKg, heaviestKg };
}

/**
 * Exercises where every working set met its prescribed reps with at least the
 * prescribed RIR left over — the same bar the live "ready to progress" badge
 * uses, so the XP agrees with what the workout screen already told you.
 */
function progressionCount(workout) {
    let count = 0;

    for (const entry of workout.entries || []) {
        const working = (entry.sets || []).filter(isWorkingSet);
        if (!working.length || !Number.isFinite(entry.targetReps)) continue;

        const targetRir = entry.targetRir ?? 0;
        if (working.every((set) => set.reps >= entry.targetReps && (set.rir ?? 0) >= targetRir)) {
            count += 1;
        }
    }

    return count;
}

// --- Personal records ----------------------------------------------------

/**
 * Every time a lift beat its own previous best, in order. Distinct from
 * `computeRecords()`, which only reports the single standing best per
 * exercise — this is the history of *improvements*, which is what earns XP.
 *
 * An exercise's first logged set establishes a baseline rather than scoring a
 * record, and only the best set of a session counts, so ramping 80 → 85 → 90
 * pays once rather than three times.
 */
export function computePrEvents(chronological) {
    const best = new Map();
    const byWorkout = new Map();
    const all = [];

    for (const workout of chronological) {
        const scoredThisSession = new Set();

        for (const entry of workout.entries || []) {
            for (const set of entry.sets || []) {
                if (!isLoggedWork(set)) continue;

                const previous = best.get(entry.exerciseId);
                if (previous === undefined) {
                    best.set(entry.exerciseId, set.weightKg);
                    continue;
                }
                if (set.weightKg <= previous) continue;

                best.set(entry.exerciseId, set.weightKg);
                if (scoredThisSession.has(entry.exerciseId)) continue;

                scoredThisSession.add(entry.exerciseId);
                all.push({
                    exerciseId: entry.exerciseId,
                    exerciseName: entry.exerciseName,
                    muscleGroup: entry.muscleGroup || '',
                    weightKg: set.weightKg,
                    reps: set.reps,
                    date: workout.startedAt,
                    workoutId: workout.id,
                });
                byWorkout.set(workout.id, (byWorkout.get(workout.id) || 0) + 1);
            }
        }
    }

    return { byWorkout, all };
}

// --- Per-workout XP ------------------------------------------------------

/**
 * Itemised so the post-workout sheet can show where the number came from —
 * "+240 XP" is a score, "+90 for 18 sets, +75 for a record" is feedback.
 * Values stay raw (kg, counts); the view formats them in the user's unit.
 */
export function xpForWorkout(workout, prCount = 0) {
    const { sets, tonnageKg } = workoutTotals(workout);

    // A session saved only for its note is worth keeping in history, but
    // there's no work in it to pay for.
    if (!sets) return { total: 0, parts: [] };

    const progressions = progressionCount(workout);
    const parts = [
        { key: 'session', value: 1, xp: XP.session },
        { key: 'sets', value: sets, xp: sets * XP.perSet },
    ];

    const tonnageXp = Math.round(tonnageKg / 100) * XP.perHundredKg;
    if (tonnageXp > 0) parts.push({ key: 'tonnage', value: tonnageKg, xp: tonnageXp });
    if (prCount > 0) parts.push({ key: 'records', value: prCount, xp: prCount * XP.pr });
    if (progressions > 0) parts.push({ key: 'progression', value: progressions, xp: progressions * XP.progression });

    return { total: parts.reduce((sum, part) => sum + part.xp, 0), parts };
}

// --- Levels --------------------------------------------------------------

/** XP to get from `level` to the next one — each level costs 100 more. */
export function levelCost(level) {
    return LEVEL_BASE + LEVEL_STEP * (level - 1);
}

function rankFor(level) {
    return RANKS.find((rank) => level >= rank.from)?.name || 'Rookie';
}

export function levelFromXp(xp) {
    let level = 1;
    let into = Math.max(0, Math.round(xp));

    while (into >= levelCost(level)) {
        into -= levelCost(level);
        level += 1;
    }

    return { level, into, span: levelCost(level), rank: rankFor(level) };
}

// --- Weekly targets ------------------------------------------------------

/**
 * How many sessions a week is meant to hold, derived from the plan the same
 * way weekly volume targets are: one per template that counts toward it. No
 * second copy of the plan to keep in sync.
 */
export function weeklySessionTarget() {
    const planned = state.templates.filter((template) => template.inWeeklyPlan !== false).length;
    return planned || DEFAULT_WEEKLY_TARGET;
}

function ledger() {
    return state.progressLedger || {};
}

/**
 * A week's target is frozen once the week has been seen, so adding a sixth
 * template in March can't retroactively fail every week of February and wipe
 * out a streak. Weeks from before this feature existed fall back to today's
 * target — there's nothing better to judge them by.
 */
export function targetForWeek(weekId) {
    return ledger().weekTargets?.[weekId] ?? weeklySessionTarget();
}

// --- Week series ---------------------------------------------------------

/**
 * Every week from the first workout to the current one, gaps included — a
 * missed week has to appear as a zero for the streak walk to see it.
 */
function buildWeeks(chronological, prEvents) {
    const byWeek = new Map();

    for (const workout of chronological) {
        const weekId = weekIdOf(new Date(workout.startedAt));
        if (!byWeek.has(weekId)) {
            byWeek.set(weekId, {
                sessions: 0,
                sets: 0,
                tonnageKg: 0,
                prs: 0,
                workoutXp: 0,
                muscleSets: new Map(),
                muscleSessions: new Map(),
            });
        }

        const week = byWeek.get(weekId);
        const totals = workoutTotals(workout);
        const prCount = prEvents.byWorkout.get(workout.id) || 0;

        week.sessions += 1;
        week.sets += totals.sets;
        week.tonnageKg += totals.tonnageKg;
        week.prs += prCount;
        week.workoutXp += xpForWorkout(workout, prCount).total;

        const touched = new Set();
        for (const entry of workout.entries || []) {
            const muscle = entry.muscleGroup;
            if (!muscle) continue;
            const sets = (entry.sets || []).filter(isWorkingSet).length;
            if (!sets) continue;
            week.muscleSets.set(muscle, (week.muscleSets.get(muscle) || 0) + sets);
            touched.add(muscle);
        }
        touched.forEach((muscle) => week.muscleSessions.set(muscle, (week.muscleSessions.get(muscle) || 0) + 1));
    }

    const weeks = [];
    const currentId = weekIdOf();
    // With no history at all the series is just this week — enough for the
    // target and the first set of quests to have something to attach to.
    let cursor = chronological.length ? weekStart(new Date(chronological[0].startedAt)) : weekStart();

    for (let guard = 0; guard < 2000; guard += 1) {
        const weekId = localDayId(cursor);
        const found = byWeek.get(weekId);

        weeks.push({
            weekId,
            start: new Date(cursor),
            end: addDays(cursor, 6),
            current: weekId === currentId,
            target: targetForWeek(weekId),
            sessions: found?.sessions || 0,
            sets: found?.sets || 0,
            tonnageKg: found?.tonnageKg || 0,
            prs: found?.prs || 0,
            workoutXp: found?.workoutXp || 0,
            muscleSets: found?.muscleSets || new Map(),
            muscleSessions: found?.muscleSessions || new Map(),
            bonusXp: 0,
            clean: false,
            frozen: false,
            streakAfter: 0,
        });

        if (weekId === currentId) break;
        cursor = addDays(cursor, 7);
    }

    return weeks;
}

/**
 * Walks the weeks in order, marking each clean (target met), frozen (missed
 * but covered by a banked skip) or broken, and paying the weekly bonus as it
 * goes — the bonus scales with the streak that was live at the time, so a
 * week logged during a long run is worth more than the same week logged cold.
 *
 * The current week never breaks anything: it isn't over yet.
 */
function walkStreak(weeks) {
    let streak = 0;
    let longest = 0;
    let freezes = 0;
    let cleanRun = 0;

    for (const week of weeks) {
        week.clean = week.sessions >= week.target;

        if (week.current) {
            // Counted if already met, but a shortfall so far is just "not yet".
            if (week.clean) {
                streak += 1;
                week.bonusXp = XP.weeklyTarget + XP.perStreakWeek * Math.min(streak, XP.streakWeeksCounted);
            }
            week.streakAfter = streak;
            longest = Math.max(longest, streak);
            break;
        }

        if (week.clean) {
            streak += 1;
            cleanRun += 1;
            if (cleanRun >= WEEKS_PER_FREEZE && freezes < MAX_FREEZES) {
                freezes += 1;
                cleanRun = 0;
            }
            week.bonusXp = XP.weeklyTarget + XP.perStreakWeek * Math.min(streak, XP.streakWeeksCounted);
        } else if (freezes > 0) {
            // Spent, not earned: the chain survives but doesn't grow.
            freezes -= 1;
            cleanRun = 0;
            week.frozen = true;
        } else {
            streak = 0;
            cleanRun = 0;
            freezes = 0;
        }

        week.streakAfter = streak;
        longest = Math.max(longest, streak);
    }

    return { streak, longest, freezes };
}

// --- Timeline ------------------------------------------------------------

/**
 * When each level was reached, by replaying every XP award in the order it
 * was earned. Weekly bonuses land on the last day of their week, so a level
 * crossed by a bonus is dated to the week that earned it.
 */
function levelTimeline(sessions, weeks) {
    const events = [
        ...sessions.map((session) => ({ at: new Date(session.workout.startedAt), xp: session.xp })),
        ...weeks.filter((week) => week.bonusXp > 0).map((week) => ({ at: week.end, xp: week.bonusXp })),
    ].sort((a, b) => a.at - b.at);

    const reachedAt = new Map();
    let total = 0;
    let level = 1;

    for (const event of events) {
        total += event.xp;
        const next = levelFromXp(total).level;
        while (level < next) {
            level += 1;
            reachedAt.set(level, event.at.toISOString());
        }
    }

    return reachedAt;
}

// --- Entry point ---------------------------------------------------------

export function computeProgress() {
    // `state.workouts` is newest-first; almost everything here needs the
    // opposite, since XP and records only make sense accumulated forwards.
    const chronological = [...state.workouts].sort(
        (a, b) => new Date(a.startedAt) - new Date(b.startedAt),
    );

    const prEvents = computePrEvents(chronological);

    const lifetime = {
        workouts: 0,
        sets: 0,
        tonnageKg: 0,
        heaviestKg: 0,
        exercises: 0,
        bestSessionTonnageKg: 0,
    };

    const seenExercises = new Set();
    const sessions = [];
    const dayCounts = new Map();
    const earlySessions = [];
    const lateSessions = [];

    for (const workout of chronological) {
        const totals = workoutTotals(workout);
        const prCount = prEvents.byWorkout.get(workout.id) || 0;
        const { total: xp, parts } = xpForWorkout(workout, prCount);

        for (const entry of workout.entries || []) {
            if ((entry.sets || []).some(isWorkingSet)) seenExercises.add(entry.exerciseId);
        }

        lifetime.workouts += 1;
        lifetime.sets += totals.sets;
        lifetime.tonnageKg += totals.tonnageKg;
        lifetime.heaviestKg = Math.max(lifetime.heaviestKg, totals.heaviestKg);
        lifetime.bestSessionTonnageKg = Math.max(lifetime.bestSessionTonnageKg, totals.tonnageKg);

        const started = new Date(workout.startedAt);
        if (started.getHours() < 7) earlySessions.push(workout.startedAt);
        if (started.getHours() >= 21) lateSessions.push(workout.startedAt);

        const dayId = localDayId(workout.startedAt);
        const day = dayCounts.get(dayId) || { sessions: 0, sets: 0 };
        day.sessions += 1;
        day.sets += totals.sets;
        dayCounts.set(dayId, day);

        sessions.push({
            workout,
            dayId,
            weekId: weekIdOf(started),
            xp,
            parts,
            prs: prCount,
            ...totals,
            cumWorkouts: lifetime.workouts,
            cumTonnageKg: lifetime.tonnageKg,
            cumExercises: seenExercises.size,
        });
    }

    lifetime.exercises = seenExercises.size;

    const weeks = buildWeeks(chronological, prEvents);
    const { streak, longest, freezes } = walkStreak(weeks);

    const workoutXp = sessions.reduce((sum, session) => sum + session.xp, 0);
    const bonusXp = weeks.reduce((sum, week) => sum + week.bonusXp, 0);
    const questXp = questXpForWeeks(weeks, ledger());
    const xpTotal = workoutXp + bonusXp + questXp;

    const currentWeek = weeks.find((week) => week.current) || null;

    // Every muscle group trained inside one week — the date it was completed
    // is the end of that week.
    const allMuscleWeeks = weeks.filter((week) => MUSCLE_GROUPS.every((muscle) => week.muscleSets.get(muscle) > 0));

    return {
        ...levelFromXp(xpTotal),
        xpTotal,
        breakdown: { workoutXp, bonusXp, questXp },
        streak,
        longestStreak: longest,
        freezes,
        weeks,
        currentWeek,
        sessions,
        dayCounts,
        prEvents,
        lifetime,
        earlySessions,
        lateSessions,
        allMuscleWeeks,
        levelReachedAt: levelTimeline(sessions, weeks),
    };
}

// --- Ledger upkeep -------------------------------------------------------

/**
 * The two writes the derived model can't do without: sealing this week's
 * session target before it can be moved by a template edit, and drawing this
 * week's quests so they're fixed for the next seven days.
 *
 * Also seeds "already seen" on first run, so the retroactive haul from years
 * of existing workouts doesn't arrive as three dozen unread badge alerts.
 *
 * Safe to call repeatedly — it only writes when something is genuinely
 * missing. Called at boot and after each finished workout.
 */
export async function syncProgressLedger() {
    const stored = ledger();
    const weekId = weekIdOf();
    const patch = {};

    if (stored.weekTargets?.[weekId] === undefined) {
        patch.weekTargets = { ...(stored.weekTargets || {}), [weekId]: weeklySessionTarget() };
    }

    if (!stored.quests?.[weekId]?.length) {
        // Quests are kept for every past week, never pruned: their XP is part
        // of the running total, and dropping them would silently lose levels.
        const drawn = generateQuests(weekId, computeProgress().weeks);
        if (drawn.length) patch.quests = { ...(stored.quests || {}), [weekId]: drawn };
    }

    if (!stored.initialised) {
        if (patch.weekTargets || patch.quests) await saveProgressLedger(patch);
        const progress = computeProgress();
        const earned = evaluateBadges(progress).filter((badge) => badge.earnedAt).map((badge) => badge.id);
        await saveProgressLedger({ initialised: true, seenBadges: earned, seenLevel: progress.level });
        return;
    }

    if (Object.keys(patch).length) await saveProgressLedger(patch);
}

/** Records everything currently earned as celebrated. */
export async function markProgressSeen(progress, badges) {
    await saveProgressLedger({
        seenBadges: badges.filter((badge) => badge.earnedAt).map((badge) => badge.id),
        seenLevel: progress.level,
    });
}
