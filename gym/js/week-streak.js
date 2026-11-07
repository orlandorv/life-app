/**
 * The weekly streak: which weeks keep the chain, what each pays, and the skips
 * (freezes) that cover a miss. Pure (no DOM, no storage), so it is checked in Node.
 *
 * A week has two numbers: its **target** (the sessions you are aiming for) and its
 * **minimum** (the fewest that still keep your streak). Meeting the minimum extends
 * the chain; meeting the target pays the full weekly bonus on top. A week from
 * before the minimum existed has no minimum of its own, and is judged exactly as it
 * always was: its minimum *is* its target, so the old rules fall out as the case
 * where the two are equal (`tests/week-streak.test.mjs` holds the code to a verbatim
 * copy of the old walk over random histories).
 */

/** What the streak pays. `weeklyTarget` is for hitting the target; `perStreakWeek` for each week of the chain (up to `streakWeeksCounted`). */
export const STREAK_XP = { weeklyTarget: 150, perStreakWeek: 25, streakWeeksCounted: 10 };

/** Weeks that keep the chain needed to bank one skip, and the most you can hold. */
export const WEEKS_PER_FREEZE = 4;
export const MAX_FREEZES = 2;

const streakPart = (streak) => STREAK_XP.perStreakWeek * Math.min(streak, STREAK_XP.streakWeeksCounted);

/**
 * Walks the weeks in order (each `{ sessions, target, minimum?, current? }`) and
 * marks them in place:
 *
 * - `clean`: the chain is kept (sessions reach the minimum, which defaults to the target).
 * - `hit`: the target was reached.
 * - `frozen`: missed, but covered by a banked skip (the chain survives, doesn't grow).
 * - `bonusXp`: the target bonus (when hit) plus the streak part (when kept).
 * - `streakAfter`.
 *
 * The current week never breaks anything: it isn't over yet. Returns `{ streak, longest, freezes }`.
 */
export function walkStreak(weeks) {
    let streak = 0;
    let longest = 0;
    let freezes = 0;
    let cleanRun = 0;

    for (const week of weeks) {
        const minimum = Number.isFinite(week.minimum) ? Math.min(week.minimum, week.target) : week.target;
        week.minimum = minimum;
        week.clean = week.sessions >= minimum;
        week.hit = week.sessions >= week.target;
        week.bonusXp = 0;

        if (week.current) {
            // Counted if already kept, but a shortfall so far is just "not yet".
            if (week.clean) {
                streak += 1;
                week.bonusXp = (week.hit ? STREAK_XP.weeklyTarget : 0) + streakPart(streak);
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
            week.bonusXp = (week.hit ? STREAK_XP.weeklyTarget : 0) + streakPart(streak);
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

/** The goal a brand-new install, or one that has never chosen, starts with. */
export const DEFAULT_GOAL = { target: 3, minimum: 2 };

/** The most sessions a week can be asked for (one a day). */
export const MAX_SESSIONS = 7;

/** A goal tidied up: a whole target from 1 to 7, and a minimum from 1 up to the target. */
export function cleanGoal({ target, minimum } = {}) {
    const whole = (value, fallback) => {
        if (value === null || value === undefined || value === '') return fallback;
        const n = Number(value);
        return Number.isFinite(n) ? Math.round(n) : fallback;
    };
    const t = Math.min(MAX_SESSIONS, Math.max(1, whole(target, DEFAULT_GOAL.target)));
    const m = Math.min(t, Math.max(1, whole(minimum, t)));
    return { target: t, minimum: m };
}

/**
 * How a week stands, in words for the streak card and Today: what is still to do to
 * keep the chain, and to hit the target. `sessions`, `target`, `minimum` of the week.
 */
export function weekStanding({ sessions, target, minimum = target }) {
    const min = Math.min(minimum, target);
    if (sessions >= target) return { state: 'hit', toKeep: 0, toTarget: 0 };
    if (sessions >= min) return { state: 'kept', toKeep: 0, toTarget: target - sessions };
    return { state: 'open', toKeep: min - sessions, toTarget: target - sessions };
}
