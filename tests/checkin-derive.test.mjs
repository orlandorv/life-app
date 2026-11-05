import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveCheckin, derivedHint, fillsFor } from '../gym/js/checkin-derive.js';

const WEEK = '2026-11-02'; // Monday
const SUN = '2026-11-08';
const body = (day, weightKg = null, steps = null, sleepHours = null) => ({ day, weightKg, steps, sleepHours });
const food = (proteinG) => ({ kcal: proteinG * 10, proteinG, carbsG: 0, fatG: 0 });
const derive = (extra = {}) => deriveCheckin({ weekId: WEEK, today: SUN, bodyEntries: [], nutritionDays: new Map(), ...extra });

test('weight and steps average over the days that have them', () => {
    const d = derive({
        bodyEntries: [
            body('2026-11-02', 82.4, 8000),
            body('2026-11-03', null, 10000), // steps only
            body('2026-11-04', 81.8, null), // weight only
            body('2026-11-06', 82.0, 9000),
        ],
    });
    assert.equal(d.bodyWeightKg, 82.1); // (82.4 + 81.8 + 82.0) / 3 = 82.07, to one decimal
    assert.equal(d.weighIns, 3);
    assert.equal(d.steps, 9000); // (8000 + 10000 + 9000) / 3
    assert.equal(d.stepsDays, 3);
});

test('only the week asked for, and nothing after today', () => {
    const d = deriveCheckin({
        weekId: WEEK,
        today: '2026-11-04',
        bodyEntries: [
            body('2026-10-30', 90, 20000), // the week before
            body('2026-11-03', 80, 8000),
            body('2026-11-06', 70, 1000), // later in the week than today
            body('2026-11-09', 60, 500), // the week after
        ],
        nutritionDays: new Map([['2026-11-03', [food(150)]], ['2026-11-06', [food(10)]]]),
    });
    assert.equal(d.bodyWeightKg, 80);
    assert.equal(d.steps, 8000);
    assert.equal(d.proteinG, 150);
});

test('protein is the average over the days that were logged, and a gap is not a zero', () => {
    const d = derive({
        nutritionDays: new Map([
            ['2026-11-02', [food(100), food(60)]], // 160
            ['2026-11-03', []], // nothing logged
            ['2026-11-04', [food(140)]],
        ]),
    });
    assert.equal(d.proteinG, 150);
    assert.equal(d.proteinDays, 2);
});

test('with nothing recorded there is nothing to fill, not a zero', () => {
    const d = derive();
    assert.deepEqual(d, { bodyWeightKg: null, weighIns: 0, steps: null, stepsDays: 0, proteinG: null, proteinDays: 0 });
});

test('a zero or missing reading is not a reading', () => {
    const d = derive({ bodyEntries: [body('2026-11-02', 0, 0), body('2026-11-03', null, null)], nutritionDays: new Map([['2026-11-02', [food(0)]]]) });
    assert.equal(d.bodyWeightKg, null);
    assert.equal(d.steps, null);
    assert.equal(d.proteinG, null);
});

test('only blank fields are filled, so what you saved is never overwritten', () => {
    const derived = { bodyWeightKg: 82.1, weighIns: 3, steps: 9000, stepsDays: 3, proteinG: 150, proteinDays: 2 };
    assert.deepEqual(fillsFor({ bodyWeightKg: null, steps: null, proteinG: null }, derived), { weight: 82.1, steps: 9000, protein: 150 });
    assert.deepEqual(fillsFor({ bodyWeightKg: 79, steps: null, proteinG: 120 }, derived), { steps: 9000 });
    assert.deepEqual(fillsFor({ bodyWeightKg: 79, steps: 7000, proteinG: 120 }, derived), {});
    // and nothing is "filled" with nothing
    assert.deepEqual(fillsFor({ bodyWeightKg: null, steps: null, proteinG: null }, { ...derived, bodyWeightKg: null, steps: null, proteinG: null }), {});
});

test('the hint says where the number came from', () => {
    const d = { weighIns: 3, stepsDays: 1, proteinDays: 5 };
    assert.equal(derivedHint('weight', d), 'Filled from Body: average of 3 weigh-ins. Change it if you like.');
    assert.equal(derivedHint('steps', d), 'Filled from Body: average over 1 day with steps. Change it if you like.');
    assert.equal(derivedHint('protein', d), 'Filled from Nutrition: average over 5 logged days. Change it if you like.');
    assert.match(derivedHint('weight', { weighIns: 1 }), /1 weigh-in\./);
});
