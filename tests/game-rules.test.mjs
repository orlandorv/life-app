import test from 'node:test';
import assert from 'node:assert/strict';
import {
    WEIGHTS, BONUS, GOOD_AT, FREEZE_EVERY, MAX_FREEZES, MAX_BASE_XP,
    levelCost, xpForLevel, levelFromXp, scoreDay, walkStreak, buildGame, defaultGoals, withGoal,
} from '../life/game-rules.js';
import { addDays } from '../life/dates.js';

const TODAY = '2026-11-05';
const ON = (from = '2026-01-01') => ({ from, to: null });
const ALL_ON = { habits: ON(), food: ON(), body: ON(), journal: ON(), workout: ON() };

const habit = (id, extra = {}) => ({ id, name: id, days: [0, 1, 2, 3, 4, 5, 6], startDay: '2026-01-01', ...extra });
const food = (meal, extra = {}) => ({ id: Math.random().toString(36), meal, kcal: 300, proteinG: 20, loggedAt: '2026-11-05T12:00:00Z', ...extra });

function ctx(over = {}) {
    return {
        goals: ALL_ON,
        habits: [],
        done: new Map(),
        foodByDay: new Map(),
        journalByDay: new Map(),
        bodyByDay: new Map(),
        workoutDays: new Set(),
        proteinTarget: null,
        ...over,
    };
}

// --- Levels --------------------------------------------------------------------------

test('a level costs 250 then 50 more each time, and levelFromXp agrees with the running total', () => {
    assert.equal(levelCost(1), 250);
    assert.equal(levelCost(2), 300);
    assert.equal(levelCost(10), 700);
    let total = 0;
    for (let level = 1; level <= 60; level += 1) {
        assert.equal(xpForLevel(level), total, `xp to reach ${level}`);
        assert.equal(levelFromXp(total).level, level);
        assert.equal(levelFromXp(total).into, 0);
        assert.equal(levelFromXp(total + levelCost(level) - 1).level, level, 'one short of the next');
        total += levelCost(level);
    }
});

test('levelFromXp is monotonic and survives nonsense', () => {
    let last = 0;
    for (let xp = 0; xp < 40000; xp += 37) {
        const { level, into, span } = levelFromXp(xp);
        assert.ok(level >= last);
        assert.ok(into >= 0 && into < span);
        last = level;
    }
    assert.equal(levelFromXp(-5).level, 1);
    assert.equal(levelFromXp(NaN).level, 1);
    assert.equal(levelFromXp(12.9).into, 12);
});

// --- A day ---------------------------------------------------------------------------

test('each goal scores on its own and a full day is exactly 100', () => {
    const full = ctx({
        habits: [habit('a')],
        done: new Map([['a', new Set([TODAY])]]),
        foodByDay: new Map([[TODAY, [food('breakfast'), food('dinner')]]]),
        bodyByDay: new Map([[TODAY, { day: TODAY, weightKg: 80, sleepHours: null, steps: null }]]),
        journalByDay: new Map([[TODAY, { day: TODAY, mood: 4 }]]),
    });
    const day = scoreDay(TODAY, full);
    assert.equal(day.base, MAX_BASE_XP);
    assert.equal(day.xp, 100);
    assert.equal(day.good, true);
    assert.equal(WEIGHTS.habits + WEIGHTS.food + WEIGHTS.body + WEIGHTS.journal, 100, 'the weights add to the day');

    const only = (id, c) => scoreDay(TODAY, ctx({ ...c, goals: { ...ALL_ON, habits: null, food: null, body: null, journal: null, [id]: ON() } })).base;
    assert.equal(only('journal', { journalByDay: new Map([[TODAY, { day: TODAY, note: 'hi' }]]) }), 100);
    assert.equal(only('journal', {}), 0);
    assert.equal(only('body', { bodyByDay: new Map([[TODAY, { day: TODAY, steps: 5000 }]]) }), 100);
    assert.equal(only('body', { bodyByDay: new Map([[TODAY, { day: TODAY, weightKg: null, sleepHours: null, steps: null }]]) }), 0);
    assert.equal(only('body', { bodyByDay: new Map([[TODAY, { day: TODAY, steps: 0 }]]) }), 0, 'a zero is not a reading');
});

test('food counts distinct meals up to two: one meal is half, a second helping of the same meal adds nothing', () => {
    const run = (entries) => scoreDay(TODAY, ctx({ goals: { ...ALL_ON, habits: null, body: null, journal: null }, foodByDay: new Map([[TODAY, entries]]) })).base;
    assert.equal(run([]), 0);
    assert.equal(run([food('lunch')]), 50);
    assert.equal(run([food('lunch'), food('lunch'), food('lunch')]), 50);
    assert.equal(run([food('lunch'), food('snacks')]), 100);
    assert.equal(run([food('lunch'), food('snacks'), food('dinner')]), 100, 'capped');
});

test('habits are a share of the ones due, so more habits never pay more', () => {
    const goals = { ...ALL_ON, food: null, body: null, journal: null };
    const done = (...ids) => new Map(ids.map((id) => [id, new Set([TODAY])]));
    const few = scoreDay(TODAY, ctx({ goals, habits: [habit('a'), habit('b')], done: done('a') })).base;
    const many = scoreDay(TODAY, ctx({ goals, habits: Array.from({ length: 10 }, (_, i) => habit(`h${i}`)), done: done('h0', 'h1', 'h2', 'h3', 'h4') })).base;
    assert.equal(few, 50);
    assert.equal(many, 50, 'five of ten is the same half as one of two');
    // Ticking every habit of a long list never exceeds the cap.
    const all = Array.from({ length: 30 }, (_, i) => habit(`x${i}`));
    assert.equal(scoreDay(TODAY, ctx({ goals, habits: all, done: done(...all.map((h) => h.id)) })).base, 100);
});

test('habits not due that day, and weekly habits already met, are left out of the share', () => {
    const goals = { ...ALL_ON, food: null, body: null, journal: null };
    const weekday = (TODAYS) => (new Date(`${TODAYS}T12:00`).getDay() + 6) % 7;
    const other = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== weekday(TODAY));
    const notToday = habit('rest', { days: other });
    assert.equal(scoreDay(TODAY, ctx({ goals, habits: [notToday] })).applies, false, 'nothing due: the goal does not apply');
    // Two of three weekly ticks already done this week → not due on a fresh day.
    const weekly = habit('w', { weeklyTarget: 1 });
    const monday = '2026-11-02';
    const met = new Map([['w', new Set([monday])]]);
    assert.equal(scoreDay('2026-11-04', ctx({ goals, habits: [weekly], done: met })).applies, false);
    assert.equal(scoreDay(monday, ctx({ goals, habits: [weekly], done: met })).base, 100, 'still counted on the day you ticked it');
});

test('a day where nothing applies is neutral: null base, no streak effect, not good', () => {
    const day = scoreDay(TODAY, ctx({ goals: { habits: null, food: null, body: null, journal: null, workout: null } }));
    assert.equal(day.applies, false);
    assert.equal(day.base, null);
    assert.equal(day.good, false);
    assert.equal(day.xp, 0);
});

test('the day is good at 70 and not at 69', () => {
    assert.equal(GOOD_AT, 70);
    // habits 40 + food 25 + journal 15 + body 20: habits+food+journal = 80 good; habits+journal = 55; habits+food = 65.
    const base = { habits: [habit('a')], done: new Map([['a', new Set([TODAY])]]), foodByDay: new Map([[TODAY, [food('breakfast'), food('lunch')]]]) };
    const journal = new Map([[TODAY, { mood: 3 }]]);
    assert.equal(scoreDay(TODAY, ctx({ ...base, journalByDay: journal })).base, 80);
    assert.equal(scoreDay(TODAY, ctx({ ...base, journalByDay: journal })).good, true);
    const sixtyFive = scoreDay(TODAY, ctx(base));
    assert.equal(sixtyFive.base, 65);
    assert.equal(sixtyFive.good, false);
    // Habits, food and body without a check-in: 85.
    assert.equal(scoreDay(TODAY, ctx({ ...base, bodyByDay: new Map([[TODAY, { steps: 1000 }]]) })).base, 85);
    // Exactly on the line: seven of ten habits is 70, one fewer of a hundred is 69.
    const habitsOnly = { ...ALL_ON, food: null, body: null, journal: null };
    const tick = (n, total) => ({
        habits: Array.from({ length: total }, (_, i) => habit(`h${i}`)),
        done: new Map(Array.from({ length: n }, (_, i) => [`h${i}`, new Set([TODAY])])),
    });
    const seventy = scoreDay(TODAY, ctx({ goals: habitsOnly, ...tick(7, 10) }));
    assert.equal(seventy.base, 70);
    assert.equal(seventy.good, true, '70 is good');
    const sixtyNine = scoreDay(TODAY, ctx({ goals: habitsOnly, ...tick(69, 100) }));
    assert.equal(sixtyNine.base, 69);
    assert.equal(sixtyNine.good, false, '69 is not');
    // One more case just over the line: 40 + 25 + ... with body only half? food 1 meal = 12.5, habits 40, body 20 = 72.5 -> 73.
    const edge = scoreDay(TODAY, ctx({ ...base, foodByDay: new Map([[TODAY, [food('lunch')]]]), bodyByDay: new Map([[TODAY, { steps: 1 }]]) }));
    assert.equal(edge.base, 73);
    assert.equal(edge.good, true);
});

test('bonuses: a workout and the protein target add on top, never calories, and respect the goals', () => {
    const c = ctx({
        goals: { ...ALL_ON, habits: null, body: null, journal: null },
        foodByDay: new Map([[TODAY, [food('breakfast', { proteinG: 90 }), food('dinner', { proteinG: 80, kcal: 5 })]]]),
        workoutDays: new Set([TODAY]),
        proteinTarget: 160,
    });
    const day = scoreDay(TODAY, c);
    assert.deepEqual(day.bonuses, ['workout', 'protein']);
    assert.equal(day.bonusXp, BONUS.workout + BONUS.protein);
    assert.equal(day.xp, 100 + 30, 'the most a day can pay');

    assert.deepEqual(scoreDay(TODAY, { ...c, proteinTarget: 171 }).bonuses, ['workout'], 'one gram short');
    assert.deepEqual(scoreDay(TODAY, { ...c, proteinTarget: null }).bonuses, ['workout'], 'no target, no bonus');
    assert.deepEqual(scoreDay(TODAY, { ...c, goals: { ...c.goals, workout: null } }).bonuses, ['protein']);
    assert.deepEqual(scoreDay(TODAY, { ...c, goals: { ...c.goals, food: null } }).bonuses, ['workout'], 'food switched off: no protein bonus either');
    // A workout alone makes a neutral day pay its bonus but still not count as good.
    const rest = scoreDay(TODAY, ctx({ goals: { habits: null, food: null, body: null, journal: null, workout: ON() }, workoutDays: new Set([TODAY]) }));
    assert.equal(rest.base, null);
    assert.equal(rest.xp, BONUS.workout);
    assert.equal(rest.good, false);
});

test('a goal only applies inside the days it was on', () => {
    const goals = { habits: null, food: null, body: null, workout: null, journal: { from: '2026-11-03', to: '2026-11-04' } };
    assert.equal(scoreDay('2026-11-02', ctx({ goals })).applies, false);
    assert.equal(scoreDay('2026-11-03', ctx({ goals })).applies, true);
    assert.equal(scoreDay('2026-11-04', ctx({ goals })).applies, true);
    assert.equal(scoreDay('2026-11-05', ctx({ goals })).applies, false);
});

// --- Streaks -------------------------------------------------------------------------

const rowsOf = (pattern, endDay = TODAY) => {
    // 'g' good, 'x' missed, '-' neutral; the last character is `endDay`.
    const chars = [...pattern];
    return chars.map((c, i) => ({ day: addDays(endDay, i - (chars.length - 1)), applies: c !== '-', good: c === 'g' }));
};

test('consecutive good days build a streak; a miss with no freeze ends it', () => {
    assert.deepEqual(walkStreak(rowsOf('ggg'), TODAY), { streak: 3, best: 3, freezes: 0 });
    assert.deepEqual(walkStreak(rowsOf('gggxg'), TODAY), { streak: 1, best: 3, freezes: 0 });
    assert.deepEqual(walkStreak(rowsOf(''), TODAY), { streak: 0, best: 0, freezes: 0 });
});

test('today being open does not break the streak, but yesterday missed does', () => {
    assert.equal(walkStreak(rowsOf('gggx'), TODAY).streak, 3, 'today not good yet');
    assert.equal(walkStreak(rowsOf('gggxx'), TODAY).streak, 0, 'yesterday missed');
    assert.equal(walkStreak(rowsOf('gggg'), TODAY).streak, 4, 'today good');
});

test('neutral days are skipped: they neither extend nor break', () => {
    assert.equal(walkStreak(rowsOf('gg--g'), TODAY).streak, 3);
    assert.equal(walkStreak(rowsOf('gg-x-g'), TODAY).streak, 1);
});

test('seven good days bank a freeze (to two); a miss spends one and keeps the streak without growing it', () => {
    const week = 'g'.repeat(FREEZE_EVERY);
    assert.equal(walkStreak(rowsOf(week), TODAY).freezes, 1);
    assert.equal(walkStreak(rowsOf(week.repeat(2)), TODAY).freezes, 2);
    assert.equal(walkStreak(rowsOf(week.repeat(3)), TODAY).freezes, MAX_FREEZES, 'capped');

    const saved = walkStreak(rowsOf(`${week}xg`), TODAY);
    assert.deepEqual(saved, { streak: FREEZE_EVERY + 1, best: FREEZE_EVERY + 1, freezes: 0 }, 'the freeze covered the miss; the streak did not grow on it');
    assert.equal(walkStreak(rowsOf(`${week}xxg`), TODAY).streak, 1, 'two misses and one freeze');
    // The run towards the next freeze restarts after a miss.
    assert.equal(walkStreak(rowsOf(`${week}x${'g'.repeat(6)}`), TODAY).freezes, 0);
    assert.equal(walkStreak(rowsOf(`${week}x${'g'.repeat(7)}`), TODAY).freezes, 1);
});

test('streak invariants hold over random histories', () => {
    let seed = 20261105;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let trial = 0; trial < 2000; trial += 1) {
        const length = 1 + Math.floor(rand() * 120);
        const pattern = Array.from({ length }, () => (rand() < 0.15 ? '-' : rand() < 0.7 ? 'g' : 'x')).join('');
        const rows = rowsOf(pattern);
        const { streak, best, freezes } = walkStreak(rows, TODAY);
        const goods = rows.filter((r) => r.good).length;
        assert.ok(streak >= 0 && best >= streak, pattern);
        assert.ok(streak <= goods, `a streak counts good days only: ${pattern}`);
        assert.ok(freezes >= 0 && freezes <= MAX_FREEZES, pattern);
        // Turning a missed day into a good one never lowers the best run or the streak.
        const i = rows.findIndex((r) => r.applies && !r.good && r.day !== TODAY);
        if (i !== -1) {
            const better = rows.map((r, j) => (j === i ? { ...r, good: true } : r));
            const after = walkStreak(better, TODAY);
            assert.ok(after.best >= best, `best ${pattern}`);
        }
    }
});

// --- The whole game ------------------------------------------------------------------

test('buildGame covers every day from the first goal to today, and the XP is the sum of the days', () => {
    const goals = { ...ALL_ON, habits: null, food: null, body: null, workout: null, journal: ON('2026-11-01') };
    const journalByDay = new Map(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'].map((d) => [d, { day: d, mood: 4 }]));
    const game = buildGame(ctx({ goals, journalByDay }), TODAY);
    assert.equal(game.rows.length, 5);
    assert.equal(game.rows[0].day, '2026-11-01');
    assert.equal(game.rows.at(-1).day, TODAY);
    assert.equal(game.xp, 400);
    assert.equal(game.goodDays, 4);
    assert.equal(game.streak, 2, 'the 3rd was missed, then two good days');
    assert.equal(game.best, 2);
    assert.equal(game.today.good, true);
    assert.equal(game.byDay.get('2026-11-03').good, false);
    assert.equal(game.level.level, 2, '400 XP is past level 2 at 250');
});

test('no goals at all is an empty game, not a crash', () => {
    const game = buildGame(ctx({ goals: { habits: null, food: null, body: null, journal: null, workout: null } }), TODAY);
    assert.equal(game.rows.length, 0);
    assert.equal(game.xp, 0);
    assert.equal(game.level.level, 1);
});

test('the result is the same however the data got there: ticking, unticking and re-ticking', () => {
    const goals = { ...ALL_ON, food: null, body: null, journal: null, workout: null };
    const habits = [habit('a'), habit('b')];
    const set = new Set();
    for (const op of ['add', 'delete', 'add', 'add', 'delete', 'add']) set[op](TODAY);
    const once = new Set([TODAY]);
    const a = buildGame(ctx({ goals: { ...goals, habits: ON('2026-11-01') }, habits, done: new Map([['a', set]]) }), TODAY);
    const b = buildGame(ctx({ goals: { ...goals, habits: ON('2026-11-01') }, habits, done: new Map([['a', once]]) }), TODAY);
    assert.equal(a.xp, b.xp);
    // A meal copied twice, or a note edited many times, is still one day's worth.
    const twice = new Map([[TODAY, [food('breakfast'), food('breakfast')]]]);
    const one = new Map([[TODAY, [food('breakfast')]]]);
    const g = { ...ALL_ON, habits: null, body: null, journal: null, workout: null };
    assert.equal(scoreDay(TODAY, ctx({ goals: g, foodByDay: twice })).xp, scoreDay(TODAY, ctx({ goals: g, foodByDay: one })).xp);
});

test('missed days never take XP away: adding a missed day before today leaves the total unchanged', () => {
    const goals = { habits: null, food: null, body: null, workout: null, journal: ON('2026-11-04') };
    const journalByDay = new Map([[TODAY, { mood: 3 }]]);
    const withMiss = buildGame(ctx({ goals, journalByDay }), TODAY);
    const earlier = buildGame(ctx({ goals: { ...goals, journal: ON('2026-10-01') }, journalByDay }), TODAY);
    assert.equal(earlier.xp, withMiss.xp);
    assert.ok(earlier.rows.length > withMiss.rows.length);
});

test('a steady person reaches the levels the design promises', () => {
    // ~80 XP a day (a good day most days, a rest-ish day now and then) from day one.
    const days = (n, perDay) => levelFromXp(n * perDay).level;
    const l10 = Array.from({ length: 365 }, (_, i) => i + 1).find((n) => days(n, 80) >= 10);
    const l20 = Array.from({ length: 800 }, (_, i) => i + 1).find((n) => days(n, 80) >= 20);
    const l30 = Array.from({ length: 1200 }, (_, i) => i + 1).find((n) => days(n, 80) >= 30);
    assert.ok(l10 >= 40 && l10 <= 70, `level 10 after ${l10} days`);
    assert.ok(l20 >= 130 && l20 <= 200, `level 20 after ${l20} days`);
    assert.ok(l30 >= 300 && l30 <= 400, `level 30 after ${l30} days`);
});

// --- Switching goals -----------------------------------------------------------------

test('a first run starts each goal from the first day you used it, at most a year back', () => {
    const goals = defaultGoals({ habits: '2026-10-01', food: '2020-01-01', body: null, journal: null, workout: '2026-09-01' }, TODAY);
    assert.deepEqual(goals.habits, { from: '2026-10-01', to: null });
    assert.equal(goals.food.from, addDays(TODAY, -365), 'capped at a year');
    assert.equal(goals.body, null);
    assert.equal(goals.journal, null);
    assert.deepEqual(goals.workout, { from: '2026-09-01', to: null });
});

test('a first run with no data anywhere switches everything on from today', () => {
    const goals = defaultGoals({}, TODAY);
    for (const id of ['habits', 'food', 'body', 'journal', 'workout']) assert.deepEqual(goals[id], { from: TODAY, to: null }, id);
});

test('switching a goal on starts today; off ends it yesterday; the past keeps its scoring', () => {
    const start = { habits: ON('2026-10-01'), food: null, body: null, journal: null, workout: null };
    const on = withGoal(start, 'journal', true, TODAY);
    assert.deepEqual(on.journal, { from: TODAY, to: null });
    assert.equal(withGoal(on, 'journal', true, TODAY).journal, on.journal, 'already on: unchanged');

    const off = withGoal(start, 'habits', false, TODAY);
    assert.deepEqual(off.habits, { from: '2026-10-01', to: addDays(TODAY, -1) });
    assert.equal(withGoal(on, 'journal', false, TODAY).journal, null, 'switched on and off the same day: it never counted');
    assert.equal(withGoal(start, 'food', false, TODAY).food, null);
    assert.deepEqual(withGoal(off, 'habits', true, TODAY).habits, { from: TODAY, to: null });
});
