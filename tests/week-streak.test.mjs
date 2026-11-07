import test from 'node:test';
import assert from 'node:assert/strict';
import { walkStreak, cleanGoal, weekStanding, DEFAULT_GOAL, STREAK_XP, WEEKS_PER_FREEZE, MAX_FREEZES } from '../gym/js/week-streak.js';

// --- The walk this was extracted from, verbatim ---------------------------------
// A week with no minimum of its own must come out exactly as it always did.

const XP = STREAK_XP;
function oldWalk(weeks) {
    let streak = 0;
    let longest = 0;
    let freezes = 0;
    let cleanRun = 0;
    for (const week of weeks) {
        week.clean = week.sessions >= week.target;
        if (week.current) {
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

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const mkWeeks = (specs) => specs.map((s, i) => ({ weekId: `w${i}`, sessions: s.sessions, target: s.target, current: i === specs.length - 1, bonusXp: 0, clean: false, frozen: false, streakAfter: 0, ...(s.minimum !== undefined ? { minimum: s.minimum } : {}) }));
const pick = (week) => ({ clean: week.clean, frozen: week.frozen, streakAfter: week.streakAfter, bonusXp: week.bonusXp });

test('with no minimum, or a minimum equal to the target, every week comes out as the old rules had it (fuzz)', () => {
    const next = rng(20261107);
    for (let trial = 0; trial < 3000; trial += 1) {
        const n = 1 + Math.floor(next() * 40);
        const specs = Array.from({ length: n }, () => {
            const target = 1 + Math.floor(next() * 5);
            return { sessions: Math.floor(next() * 7), target };
        });
        const a = mkWeeks(specs);
        const b = mkWeeks(specs.map((s) => ({ ...s, minimum: s.target })));
        const c = mkWeeks(specs);
        const expected = oldWalk(a);
        const equal = walkStreak(b);
        const missing = walkStreak(c);
        assert.deepEqual(equal, expected, `result ${trial}`);
        assert.deepEqual(missing, expected, `result (no minimum) ${trial}`);
        assert.deepEqual(b.map(pick), a.map(pick), `weeks ${trial}`);
        assert.deepEqual(c.map(pick), a.map(pick), `weeks (no minimum) ${trial}`);
    }
});

test('the fuzz is not vacuous: it covers kept, frozen and broken weeks', () => {
    const next = rng(7);
    let clean = 0, frozen = 0, broken = 0;
    for (let trial = 0; trial < 500; trial += 1) {
        const weeks = mkWeeks(Array.from({ length: 30 }, () => ({ sessions: Math.floor(next() * 5), target: 3 })));
        walkStreak(weeks);
        for (const w of weeks) { if (w.current) continue; if (w.clean) clean += 1; else if (w.frozen) frozen += 1; else broken += 1; }
    }
    assert.ok(clean > 500 && frozen > 100 && broken > 100, `${clean}/${frozen}/${broken}`);
});

// --- The minimum -----------------------------------------------------------------

const week = (sessions, extra = {}) => ({ sessions, target: 3, minimum: 2, current: false, ...extra });

test('two sessions keep the chain; the third pays the target bonus on top', () => {
    const weeks = [week(3), week(2), week(1), week(0, { current: true })];
    walkStreak(weeks);
    assert.equal(weeks[0].clean, true);
    assert.equal(weeks[0].hit, true);
    assert.equal(weeks[0].bonusXp, STREAK_XP.weeklyTarget + STREAK_XP.perStreakWeek * 1, 'target hit: both parts');
    assert.equal(weeks[1].clean, true);
    assert.equal(weeks[1].hit, false);
    assert.equal(weeks[1].bonusXp, STREAK_XP.perStreakWeek * 2, 'minimum only: the streak part, not the target bonus');
    assert.equal(weeks[1].streakAfter, 2, 'the chain grew');
    assert.equal(weeks[2].clean, false, 'one session is under the minimum');
    assert.equal(weeks[2].streakAfter, 0);
    assert.equal(weeks[2].bonusXp, 0);
});

test('the current week counts as soon as the minimum is met, and a shortfall so far breaks nothing', () => {
    const open = [week(3), week(1, { current: true })];
    assert.deepEqual(walkStreak(open), { streak: 1, longest: 1, freezes: 0 });
    assert.equal(open[1].clean, false);
    const kept = [week(3), week(2, { current: true })];
    assert.deepEqual(walkStreak(kept), { streak: 2, longest: 2, freezes: 0 });
    assert.equal(kept[1].bonusXp, STREAK_XP.perStreakWeek * 2);
    const hit = [week(3), week(3, { current: true })];
    walkStreak(hit);
    assert.equal(hit[1].bonusXp, STREAK_XP.weeklyTarget + STREAK_XP.perStreakWeek * 2);
});

test('skips are banked and spent on the minimum, not the target', () => {
    const run = Array.from({ length: WEEKS_PER_FREEZE }, () => week(2));
    const weeks = [...run, week(1), week(2, { current: true })];
    const result = walkStreak(weeks);
    assert.equal(weeks[WEEKS_PER_FREEZE].frozen, true, 'a week under the minimum spends the skip');
    assert.equal(weeks[WEEKS_PER_FREEZE].streakAfter, WEEKS_PER_FREEZE, 'it kept the chain without growing it');
    assert.equal(result.streak, WEEKS_PER_FREEZE + 1);
});

test('a minimum above the target is treated as the target', () => {
    const weeks = [{ sessions: 2, target: 2, minimum: 5, current: false }, { sessions: 0, target: 2, current: true }];
    walkStreak(weeks);
    assert.equal(weeks[0].minimum, 2);
    assert.equal(weeks[0].clean, true);
});

test('invariants hold over random histories with a minimum', () => {
    const next = rng(99);
    for (let trial = 0; trial < 2000; trial += 1) {
        const weeks = mkWeeks(Array.from({ length: 1 + Math.floor(next() * 40) }, () => {
            const target = 1 + Math.floor(next() * 5);
            return { sessions: Math.floor(next() * 7), target, minimum: 1 + Math.floor(next() * target) };
        }));
        const { streak, longest, freezes } = walkStreak(weeks);
        assert.ok(streak >= 0 && longest >= streak);
        assert.ok(freezes >= 0 && freezes <= MAX_FREEZES);
        for (const w of weeks) {
            assert.ok(w.minimum <= w.target);
            if (w.hit) assert.ok(w.clean, 'hitting the target always keeps the chain');
            assert.ok(w.bonusXp >= 0);
            if (!w.clean) assert.equal(w.bonusXp, 0);
        }
        // Lowering every minimum by one never shortens the longest chain.
        const lower = mkWeeks(weeks.map((w) => ({ sessions: w.sessions, target: w.target, minimum: Math.max(1, w.minimum - 1) })));
        assert.ok(walkStreak(lower).longest >= longest, `lower minimum ${trial}`);
    }
});

// --- The goal ----------------------------------------------------------------------

test('a goal is tidied to whole numbers, a target of 1 to 7 and a minimum no higher than it', () => {
    assert.deepEqual(DEFAULT_GOAL, { target: 3, minimum: 2 });
    assert.deepEqual(cleanGoal({ target: 3, minimum: 2 }), { target: 3, minimum: 2 });
    assert.deepEqual(cleanGoal({ target: 9, minimum: 12 }), { target: 7, minimum: 7 });
    assert.deepEqual(cleanGoal({ target: 0, minimum: 0 }), { target: 1, minimum: 1 });
    assert.deepEqual(cleanGoal({ target: 3.6, minimum: 2.2 }), { target: 4, minimum: 2 });
    assert.deepEqual(cleanGoal({ target: 2, minimum: 5 }), { target: 2, minimum: 2 });
    assert.deepEqual(cleanGoal({}), { target: 3, minimum: 3 }, 'nothing chosen: the default target, and the minimum follows it');
    assert.deepEqual(cleanGoal({ target: 'x', minimum: null }), { target: 3, minimum: 3 });
});

test('how a week stands says what keeps the chain and what hits the target', () => {
    assert.deepEqual(weekStanding({ sessions: 0, target: 3, minimum: 2 }), { state: 'open', toKeep: 2, toTarget: 3 });
    assert.deepEqual(weekStanding({ sessions: 1, target: 3, minimum: 2 }), { state: 'open', toKeep: 1, toTarget: 2 });
    assert.deepEqual(weekStanding({ sessions: 2, target: 3, minimum: 2 }), { state: 'kept', toKeep: 0, toTarget: 1 });
    assert.deepEqual(weekStanding({ sessions: 3, target: 3, minimum: 2 }), { state: 'hit', toKeep: 0, toTarget: 0 });
    assert.deepEqual(weekStanding({ sessions: 4, target: 3, minimum: 2 }), { state: 'hit', toKeep: 0, toTarget: 0 });
    assert.deepEqual(weekStanding({ sessions: 2, target: 3 }), { state: 'open', toKeep: 1, toTarget: 1 }, 'no minimum: the target is the minimum');
});
