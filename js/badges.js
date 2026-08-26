import { MUSCLE_GROUPS } from './seed.js';
import { formatWeight, toDisplay, getUnit } from './units.js';

/**
 * One-off unlocks, evaluated against the derived progress snapshot. Each badge
 * answers "when was this earned?" rather than "is this earned?" — the date is
 * what makes an earned badge worth looking at twice, and returning null is
 * what leaves it locked.
 *
 * Because everything is derived, a badge un-earns itself if the workout that
 * won it is deleted. That's the intended behaviour: the grid should always be
 * a true statement about the history that's actually there.
 */

/** Big round numbers read better with separators than as raw digits. */
function bigWeight(kg) {
    return `${Math.round(toDisplay(kg)).toLocaleString()} ${getUnit()}`;
}

/** ISO date of the nth item (1-based) in an already-chronological list. */
function nth(list, n, key) {
    const item = list[n - 1];
    if (!item) return null;
    return key ? item[key] : item;
}

/** First session satisfying `test`, as a date — the moment a threshold fell. */
function firstSession(sessions, test) {
    return sessions.find(test)?.workout.startedAt || null;
}

const WORKOUT_MILESTONES = [1, 10, 25, 50, 100, 250];
const STREAK_MILESTONES = [2, 4, 8, 12, 26];
const STRENGTH_MILESTONES = [60, 80, 100, 120, 140];
const SESSION_TONNAGE = [5000, 10000, 15000];
const LIFETIME_TONNAGE = [100000, 500000, 1000000];
const EXERCISE_MILESTONES = [25, 50];
const RECORD_MILESTONES = [10, 50, 100];
const LEVEL_MILESTONES = [5, 10, 20];

const ODD_HOUR_SESSIONS = 5;

function buildCatalogue() {
    const catalogue = [];

    WORKOUT_MILESTONES.forEach((count, index) =>
        catalogue.push({
            id: `workouts-${count}`,
            group: 'Consistency',
            icon: index === 0 ? '🌱' : '🏋️',
            name: count === 1 ? 'First session' : `${count} sessions`,
            hint: count === 1 ? 'Finish your first workout' : `Finish ${count} workouts`,
            earnedAt: (ctx) => nth(ctx.sessions, count)?.workout.startedAt || null,
        }),
    );

    STREAK_MILESTONES.forEach((weeks) =>
        catalogue.push({
            id: `streak-${weeks}`,
            group: 'Streak',
            icon: weeks >= 12 ? '🔥' : '📅',
            name: `${weeks}-week streak`,
            hint: `Hit your session target ${weeks} weeks running`,
            earnedAt: (ctx) => ctx.weeks.find((week) => week.streakAfter >= weeks)?.end.toISOString() || null,
        }),
    );

    STRENGTH_MILESTONES.forEach((kg) =>
        catalogue.push({
            id: `strength-${kg}`,
            group: 'Strength',
            icon: '💪',
            name: `${formatWeight(kg)} club`,
            hint: `Log a single set at ${formatWeight(kg)} or more`,
            earnedAt: (ctx) => firstSession(ctx.sessions, (session) => session.heaviestKg >= kg),
        }),
    );

    SESSION_TONNAGE.forEach((kg) =>
        catalogue.push({
            id: `session-tonnage-${kg}`,
            group: 'Volume',
            icon: '🧱',
            name: `${bigWeight(kg)} in a session`,
            hint: `Move ${bigWeight(kg)} of total volume in one workout`,
            earnedAt: (ctx) => firstSession(ctx.sessions, (session) => session.tonnageKg >= kg),
        }),
    );

    LIFETIME_TONNAGE.forEach((kg) =>
        catalogue.push({
            id: `lifetime-tonnage-${kg}`,
            group: 'Volume',
            icon: '🌍',
            name: `${bigWeight(kg)} lifted`,
            hint: `Move ${bigWeight(kg)} across every workout`,
            earnedAt: (ctx) => firstSession(ctx.sessions, (session) => session.cumTonnageKg >= kg),
        }),
    );

    catalogue.push({
        id: 'breadth-all-muscles',
        group: 'Breadth',
        icon: '🧭',
        name: 'Full sweep',
        hint: `Train all ${MUSCLE_GROUPS.length} muscle groups inside one week`,
        earnedAt: (ctx) => ctx.allMuscleWeeks[0]?.end.toISOString() || null,
    });

    EXERCISE_MILESTONES.forEach((count) =>
        catalogue.push({
            id: `exercises-${count}`,
            group: 'Breadth',
            icon: '🗺️',
            name: `${count} exercises`,
            hint: `Log ${count} different exercises`,
            earnedAt: (ctx) => firstSession(ctx.sessions, (session) => session.cumExercises >= count),
        }),
    );

    RECORD_MILESTONES.forEach((count) =>
        catalogue.push({
            id: `records-${count}`,
            group: 'Records',
            icon: '🏆',
            name: `${count} records`,
            hint: `Beat your own best ${count} times`,
            earnedAt: (ctx) => nth(ctx.prEvents.all, count, 'date'),
        }),
    );

    LEVEL_MILESTONES.forEach((level) =>
        catalogue.push({
            id: `level-${level}`,
            group: 'Level',
            icon: '⚡',
            name: `Level ${level}`,
            hint: `Reach level ${level}`,
            earnedAt: (ctx) => ctx.levelReachedAt.get(level) || null,
        }),
    );

    catalogue.push(
        {
            id: 'early-bird',
            group: 'Odd hours',
            icon: '🌅',
            name: 'Early bird',
            hint: `Start ${ODD_HOUR_SESSIONS} workouts before 7am`,
            earnedAt: (ctx) => nth(ctx.earlySessions, ODD_HOUR_SESSIONS),
        },
        {
            id: 'night-owl',
            group: 'Odd hours',
            icon: '🌙',
            name: 'Night owl',
            hint: `Start ${ODD_HOUR_SESSIONS} workouts after 9pm`,
            earnedAt: (ctx) => nth(ctx.lateSessions, ODD_HOUR_SESSIONS),
        },
    );

    return catalogue;
}

/**
 * Rebuilt per call rather than defined once at module load, because several
 * names embed a weight and the display unit can change at runtime.
 */
export function evaluateBadges(progress) {
    return buildCatalogue().map((badge) => {
        const { earnedAt, ...rest } = badge;
        return { ...rest, earnedAt: earnedAt(progress) };
    });
}

/** Catalogue order, but earned first — locked badges read as the goals below. */
export function groupBadges(badges) {
    const groups = new Map();

    badges.forEach((badge) => {
        if (!groups.has(badge.group)) groups.set(badge.group, []);
        groups.get(badge.group).push(badge);
    });

    return groups;
}
