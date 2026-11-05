import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotOf, sameName, mealFromEntries, entriesFromMeal, mealSummary, sortMeals, isValidSavedMeal, MAX_NAME } from '../nutrition/saved-meals.js';

const entry = (name, kcal, proteinG, extra = {}) => ({
    id: `e-${name}`,
    day: '2026-11-04',
    meal: 'breakfast',
    loggedAt: '2026-11-04T08:00:00.000Z',
    name,
    brand: null,
    store: null,
    foodId: `f-${name}`,
    amount: 1,
    unit: 'serving',
    kcal,
    proteinG,
    carbsG: 20,
    fatG: 5,
    ...extra,
});
const NOW = '2026-11-05T09:00:00.000Z';

test('a snapshot keeps the food and its numbers but not when or where it was eaten', () => {
    const item = snapshotOf(entry('Oats', 150, 5));
    assert.deepEqual(Object.keys(item).sort(), ['amount', 'brand', 'carbsG', 'fatG', 'foodId', 'kcal', 'name', 'proteinG', 'store', 'unit']);
    assert.equal(item.kcal, 150);
    assert.equal('id' in item || 'day' in item || 'meal' in item || 'loggedAt' in item, false);
});

test('a meal is its foods in order, with a name and a date', () => {
    const meal = mealFromEntries({ name: '  Usual breakfast ', entries: [entry('Oats', 150, 5), entry('Banana', 105, 1)], id: 'm1', now: NOW });
    assert.equal(meal.id, 'm1');
    assert.equal(meal.name, 'Usual breakfast');
    assert.deepEqual(meal.items.map((i) => i.name), ['Oats', 'Banana']);
    assert.equal(meal.createdAt, NOW);
    assert.equal('lastUsedAt' in meal, false);
});

test('no name or no foods means nothing to save', () => {
    assert.equal(mealFromEntries({ name: '   ', entries: [entry('Oats', 150, 5)], id: 'm' }), null);
    assert.equal(mealFromEntries({ name: 'Empty', entries: [], id: 'm' }), null);
    assert.equal(mealFromEntries({ name: undefined, entries: [entry('Oats', 150, 5)], id: 'm' }), null);
});

test('a long name is cut to the limit', () => {
    const meal = mealFromEntries({ name: 'x'.repeat(100), entries: [entry('Oats', 150, 5)], id: 'm' });
    assert.equal(meal.name.length, MAX_NAME);
});

test('saving over a meal of the same name replaces its foods and keeps its identity', () => {
    const existing = { id: 'old', name: 'Usual breakfast', items: [snapshotOf(entry('Toast', 100, 3))], createdAt: '2026-10-01T00:00:00.000Z', lastUsedAt: '2026-11-01T00:00:00.000Z' };
    const meal = mealFromEntries({ name: 'usual BREAKFAST', entries: [entry('Oats', 150, 5)], existing, id: 'new', now: NOW });
    assert.equal(meal.id, 'old');
    assert.equal(meal.createdAt, '2026-10-01T00:00:00.000Z');
    assert.equal(meal.lastUsedAt, '2026-11-01T00:00:00.000Z');
    assert.deepEqual(meal.items.map((i) => i.name), ['Oats']);
    assert.equal(sameName('Usual breakfast', '  usual BREAKFAST '), true);
    assert.equal(sameName('Usual breakfast', 'Usual lunch'), false);
});

test('logging a meal adds fresh entries on the day and meal chosen, with the numbers as saved', () => {
    const meal = mealFromEntries({ name: 'B', entries: [entry('Oats', 150, 5), entry('Banana', 105, 1)], id: 'm1', now: NOW });
    let n = 0;
    const rows = entriesFromMeal(meal, { day: '2026-11-06', meal: 'snacks', now: '2026-11-06T12:00:00.000Z', newId: () => `new-${++n}` });
    assert.deepEqual(rows.map((r) => r.id), ['new-1', 'new-2']);
    assert.ok(rows.every((r) => r.day === '2026-11-06' && r.meal === 'snacks'));
    // stamped a millisecond apart, so the diary (which orders by time logged) keeps the saved order
    assert.deepEqual(rows.map((r) => r.loggedAt), ['2026-11-06T12:00:00.000Z', '2026-11-06T12:00:00.001Z']);
    assert.deepEqual([...rows].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)).map((r) => r.name), ['Oats', 'Banana']);
    assert.deepEqual(rows.map((r) => [r.name, r.kcal, r.proteinG]), [['Oats', 150, 5], ['Banana', 105, 1]]);
    // the saved meal itself is untouched by logging it
    assert.equal('id' in meal.items[0], false);
});

test('what a meal adds up to', () => {
    const meal = mealFromEntries({ name: 'B', entries: [entry('Oats', 150, 5), entry('Banana', 105, 1)], id: 'm' });
    assert.deepEqual(mealSummary(meal), { foods: 2, kcal: 255, proteinG: 6 });
});

test('most recently used first, an unused one from when it was saved, then by name', () => {
    const m = (name, createdAt, lastUsedAt) => ({ id: name, name, items: [{ name: 'x' }], createdAt, ...(lastUsedAt ? { lastUsedAt } : {}) });
    const sorted = sortMeals([m('B', '2026-10-01'), m('A', '2026-10-01'), m('Used', '2026-09-01', '2026-11-02'), m('New', '2026-11-03')]);
    assert.deepEqual(sorted.map((s) => s.name), ['New', 'Used', 'A', 'B']);
});

test('the backup check accepts a real meal and rejects a damaged one', () => {
    const good = { id: 'm', name: 'B', items: [snapshotOf(entry('Oats', 150, 5))], createdAt: NOW };
    assert.equal(isValidSavedMeal(good), true);
    assert.equal(isValidSavedMeal({ ...good, lastUsedAt: NOW }), true);
    for (const bad of [{ ...good, id: '' }, { ...good, name: '' }, { ...good, items: [] }, { ...good, items: 'oats' }, { ...good, items: [{ kcal: 1 }] }, { ...good, items: [null] }, { ...good, createdAt: 5 }, { ...good, lastUsedAt: 5 }]) {
        assert.equal(isValidSavedMeal(bad), false, JSON.stringify(bad).slice(0, 80));
    }
});
