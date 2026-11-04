import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReview, reviewRows as reviewRowsRaw, isReviewDay, REVIEW_WEEKDAY } from '../life/review.js';
import { localDayId } from '../life/dates.js';

// The week of Monday 2 November 2026 to Sunday 8 November.
const MON = '2026-11-02';
const SUN = '2026-11-08';
const at = (day, hour = 10) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, hour, 0).toISOString();
};

const set = (weightKg, reps, rir, extra = {}) => ({ weightKg, reps, rir, done: true, ...extra });
const entry = (id, sets, extra = {}) => ({ exerciseId: id, targetReps: 6, targetRir: 2, targetSets: sets.length, sets, ...extra });
const workout = (day, entries) => ({ id: `w-${day}`, startedAt: at(day), entries });

const review = (inputs) => buildWeeklyReview({ today: SUN, ...inputs });

// The wording glues numbers to their units with non-breaking spaces; compare it as plain text.
const plain = (text) => (text == null ? text : text.replace(/\u00a0/g, ' '));
const reviewRows = (r, options) => reviewRowsRaw(r, options).map((row) => ({ ...row, text: plain(row.text), detail: plain(row.detail) }));

test('only Sunday is review day', () => {
    assert.equal(REVIEW_WEEKDAY, 6);
    assert.equal(isReviewDay('2026-11-08'), true);
    for (const day of ['2026-11-02', '2026-11-05', '2026-11-07', '2026-11-09']) assert.equal(isReviewDay(day), false, day);
});

test('nothing to review is nothing, not an empty card', () => {
    assert.equal(review({}), null);
    assert.equal(review({ workouts: [], bodyEntries: [], habits: [], journalEntries: [] }), null);
});

test('the week runs Monday to the day given', () => {
    const r = buildWeeklyReview({ today: SUN, journalEntries: [{ day: SUN, mood: 4 }] });
    assert.equal(r.weekStart, MON);
    assert.equal(r.weekEnd, SUN);
    // and on a Wednesday it is the week so far
    const mid = buildWeeklyReview({ today: '2026-11-04', journalEntries: [{ day: '2026-11-04', mood: 4 }, { day: '2026-11-06', mood: 1 }] });
    assert.equal(mid.weekEnd, '2026-11-04');
    assert.equal(mid.journal.days, 1, 'a day that has not happened yet is not in the week');
});

// --- Gym ----------------------------------------------------------------------

test('gym uses Gym\'s own week figures, and counts lifts that met the bar this week only', () => {
    const goodBench = entry('bench', [set(100, 6, 2), set(100, 6, 2), set(100, 6, 2), set(100, 6, 2)]);
    const shortSquat = entry('squat', [set(140, 5, 2), set(140, 5, 2)]);
    const lastWeek = workout('2026-10-28', [entry('row', [set(60, 6, 2)])]);
    const r = review({
        gymWeek: { sessions: 2, target: 3, sets: 6, tonnageKg: 3600, prs: 1 },
        workouts: [workout('2026-11-03', [goodBench, shortSquat]), lastWeek],
    });
    assert.deepEqual(r.gym, { sessions: 2, target: 3, sets: 6, tonnageKg: 3600, prs: 1, liftsAtTarget: 1 });
});

test('with no workouts ever there is no gym row; with some but none this week there is', () => {
    assert.equal(review({ workouts: [], gymWeek: { sessions: 0, target: 3, sets: 0, tonnageKg: 0, prs: 0 }, journalEntries: [{ day: SUN, mood: 3 }] }).gym, null);
    const quiet = review({ workouts: [workout('2026-10-20', [entry('row', [set(60, 6, 2)])])], gymWeek: { sessions: 0, target: 3, sets: 0, tonnageKg: 0, prs: 0 } });
    assert.equal(quiet.gym.sessions, 0);
    assert.equal(quiet.gym.target, 3);
});

// --- Body ---------------------------------------------------------------------

test('body averages only the days that have each number', () => {
    const r = review({
        bodyEntries: [
            { day: '2026-10-27', weightKg: 83, sleepHours: null, steps: null },
            { day: '2026-11-02', weightKg: 82, sleepHours: 7, steps: 8000 },
            { day: '2026-11-04', weightKg: 81, sleepHours: null, steps: 10000 },
            { day: '2026-11-06', weightKg: null, sleepHours: 8, steps: null },
        ],
    });
    assert.equal(r.body.weightKg, 81.5);
    assert.equal(r.body.sleepHours, 7.5);
    assert.equal(r.body.steps, 9000);
    assert.equal(r.body.weightChangeKg, -1.5); // against last week's 83
});

test('body is left out when only older weeks have data', () => {
    assert.equal(review({ bodyEntries: [{ day: '2026-10-28', weightKg: 83, sleepHours: 7, steps: 5000 }], journalEntries: [{ day: SUN, mood: 3 }] }).body, null);
});

// --- Nutrition ----------------------------------------------------------------

const food = (kcal, proteinG) => ({ kcal, proteinG, carbsG: 0, fatG: 0 });

test('nutrition averages over the days you logged, never counting a missed day as zero', () => {
    const nutritionDays = new Map([
        ['2026-11-02', [food(1000, 50), food(1000, 50)]], // 2000 kcal, 100 g
        ['2026-11-03', []], // nothing logged: a gap
        ['2026-11-05', [food(2400, 160)]],
    ]);
    const r = review({ nutritionDays, targets: { kcal: 2300, proteinG: 160 } });
    assert.equal(r.nutrition.daysLogged, 2);
    assert.equal(r.nutrition.daysInWeek, 7);
    assert.equal(r.nutrition.kcal, 2200);
    assert.equal(r.nutrition.proteinG, 130);
    assert.equal(r.nutrition.kcalTarget, 2300);
    assert.equal(r.nutrition.proteinTarget, 160);
});

test('an unset target is not a target', () => {
    const r = review({ nutritionDays: new Map([[SUN, [food(2000, 100)]]]), targets: { kcal: null, proteinG: 0 } });
    assert.equal(r.nutrition.kcalTarget, null);
    assert.equal(r.nutrition.proteinTarget, null);
    assert.equal(review({ nutritionDays: new Map([[SUN, []]]) }), null);
});

// --- Habits -------------------------------------------------------------------

const habit = (id, days, startDay = '2026-01-01') => ({ id, days, startDay });
const everyDay = [0, 1, 2, 3, 4, 5, 6];

test('habits count what was due: skipped weekdays and a late start are not misses', () => {
    const habits = [
        habit('read', everyDay), // 7 due
        habit('gym', [0, 2, 4]), // Mon Wed Fri: 3 due
        habit('new', everyDay, '2026-11-06'), // started Friday: 3 due (Fri Sat Sun)
    ];
    const done = new Map([
        ['read', new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])], // all 7
        ['gym', new Set(['2026-11-02', '2026-11-04'])], // 2 of 3
        ['new', new Set(['2026-11-06'])], // 1 of 3
    ]);
    const r = review({ habits, done });
    assert.deepEqual(r.habits, { done: 10, due: 13, full: 1 });
});

test('days still to come this week are not counted against you', () => {
    const r = buildWeeklyReview({
        today: '2026-11-04', // Wednesday
        habits: [habit('read', everyDay)],
        done: new Map([['read', new Set(['2026-11-02', '2026-11-03', '2026-11-04'])]]),
    });
    assert.deepEqual(r.habits, { done: 3, due: 3, full: 1 });
});

test('no habits due means no habits row', () => {
    assert.equal(review({ habits: [habit('new', everyDay, '2026-12-01')], journalEntries: [{ day: SUN, mood: 3 }] }).habits, null);
});

// --- Journal ------------------------------------------------------------------

test('journal averages the levels that were recorded', () => {
    const r = review({
        journalEntries: [
            { day: '2026-11-01', mood: 1 }, // last week
            { day: '2026-11-02', mood: 4, energy: 2 },
            { day: '2026-11-04', mood: 5, energy: null },
            { day: '2026-11-06', mood: null, energy: 4, note: 'ok' },
        ],
    });
    assert.equal(r.journal.days, 3);
    assert.equal(r.journal.mood, 4.5);
    assert.equal(r.journal.energy, 3);
});

// --- Wording ------------------------------------------------------------------

const full = () =>
    review({
        gymWeek: { sessions: 3, target: 3, sets: 54, tonnageKg: 12345, prs: 2 },
        workouts: [workout('2026-11-03', [entry('bench', [set(100, 6, 2), set(100, 6, 2)])])],
        bodyEntries: [
            { day: '2026-10-28', weightKg: 83, sleepHours: null, steps: null },
            { day: '2026-11-03', weightKg: 82.1, sleepHours: 7.4, steps: 8200 },
        ],
        nutritionDays: new Map([['2026-11-03', [food(2150, 148)]], ['2026-11-04', [food(2150, 148)]]]),
        targets: { kcal: 2300, proteinG: 160 },
        habits: [habit('read', everyDay)],
        done: new Map([['read', new Set(['2026-11-02', '2026-11-03', '2026-11-04'])]]),
        journalEntries: [{ day: '2026-11-03', mood: 4, energy: 3 }, { day: '2026-11-05', mood: 4, energy: 3 }],
    });

test('every section reads as one clear row', () => {
    const rows = reviewRows(full(), { unit: 'kg', locale: 'en-GB' });
    assert.deepEqual(rows.map((r) => r.tone), ['gym', 'body', 'nutrition', 'habits', 'journal']);
    assert.deepEqual(rows.find((r) => r.tone === 'gym'), {
        tone: 'gym',
        icon: 'gym',
        label: 'Gym',
        text: '3 of 3 sessions',
        detail: '54 sets · 12,345 kg moved · 2 personal records · 1 lift at target',
    });
    const body = rows.find((r) => r.tone === 'body');
    assert.equal(body.text, '82.1 kg (−0.9 vs previous weigh-in week)');
    assert.equal(body.detail, '7.4 h sleep a night · 8,200 steps a day');
    const nutrition = rows.find((r) => r.tone === 'nutrition');
    assert.equal(nutrition.text, 'Logged 2 of 7 days');
    assert.equal(nutrition.detail, '2,150 kcal of 2,300 a day · 148 g protein of 160');
    const habits = rows.find((r) => r.tone === 'habits');
    assert.equal(habits.text, '3 of 7 done (43%)');
    assert.equal(rows.find((r) => r.tone === 'journal').text, '2 check-ins');
    assert.equal(rows.find((r) => r.tone === 'journal').detail, 'On average, mood good and energy okay');
});

test('weights follow the unit chosen, and nothing is made up for what is missing', () => {
    const rows = reviewRows(
        review({ gymWeek: { sessions: 1, target: 0, sets: 0, tonnageKg: 0, prs: 0 }, workouts: [workout('2026-11-03', [])], bodyEntries: [{ day: '2026-11-03', weightKg: 80, sleepHours: null, steps: null }] }),
        { unit: 'lb', locale: 'en-GB' },
    );
    assert.equal(rows[0].text, '1 session');
    assert.equal(rows[0].detail, null);
    assert.equal(rows[1].text, '176.4 lb');
});

test('a steady weight says so', () => {
    const r = review({
        bodyEntries: [
            { day: '2026-10-28', weightKg: 80, sleepHours: null, steps: null },
            { day: '2026-11-03', weightKg: 80, sleepHours: null, steps: null },
        ],
    });
    assert.equal(reviewRows(r, { locale: 'en-GB' })[0].text, '80 kg, steady');
});

test('day ids match the app\'s own local-day helper', () => {
    assert.equal(localDayId(new Date(at(MON))), MON);
});

test('with no weight, the first thing recorded leads', () => {
    const r = review({ bodyEntries: [{ day: '2026-11-03', weightKg: null, sleepHours: 7.5, steps: 9000 }] });
    const body = reviewRows(r, { locale: 'en-GB' })[0];
    assert.equal(body.text, '7.5 h sleep a night');
    assert.equal(body.detail, '9,000 steps a day');
});

test('a number never parts from its unit when the line wraps', () => {
    const raw = reviewRowsRaw(full(), { unit: 'kg', locale: 'en-GB' }).flatMap((row) => [row.text, row.detail]).filter(Boolean).join(' | ');
    for (const piece of ['12,345\u00a0kg moved', '82.1\u00a0kg', '7.4\u00a0h sleep', '2,150\u00a0kcal', '148\u00a0g protein']) {
        assert.ok(raw.includes(piece), `${JSON.stringify(piece)} is not glued together in: ${raw}`);
    }
});
