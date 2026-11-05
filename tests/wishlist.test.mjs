import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, formatPrice, cleanLink, linkHost, splitItems, totalOf } from '../wishlist/organize.js';

test('prices are read the way people type them', () => {
    const cases = { '12.99': 12.99, '12,99': 12.99, '£1,299.50': 1299.5, '1.299,50': 1299.5, 40: 40, '1,299': 1299, '1,299,500': 1299500, ' 7 ': 7, '5,5': 5.5, '1.299.500': 1299500 };
    for (const [typed, value] of Object.entries(cases)) assert.equal(parsePrice(typed), value, typed);
});

test('a blank price is no price; anything else that is not a price is NaN', () => {
    assert.equal(parsePrice(''), null);
    assert.equal(parsePrice('   '), null);
    assert.equal(parsePrice(undefined), null);
    for (const bad of ['abc', '£', '0', '-5', '0.00', '99999999999']) assert.ok(Number.isNaN(parsePrice(bad)), bad);
});

test('prices are rounded to pence and shown without them when whole', () => {
    assert.equal(parsePrice('12.345'), 12.35);
    assert.equal(parsePrice('12.344'), 12.34);
    assert.equal(formatPrice(40, 'en-GB'), '£40');
    assert.equal(formatPrice(12.5, 'en-GB'), '£12.50');
});

test('only web links are accepted, and a bare address gets https', () => {
    assert.equal(cleanLink(''), '');
    assert.equal(cleanLink('shop.example/x'), 'https://shop.example/x');
    assert.equal(cleanLink('https://a.co.uk/p?x=1'), 'https://a.co.uk/p?x=1');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://a.b', 'nodots', 'not a link at all']) assert.equal(cleanLink(bad), null, bad);
    assert.equal(linkHost('https://www.amazon.co.uk/dp/1'), 'amazon.co.uk');
});

const item = (id, createdAt, extra = {}) => ({ id, name: id, createdAt, ...extra });

test('wanted items list top picks first then newest; bought ones most recently bought first', () => {
    const { wanted, bought } = splitItems([
        item('old', '2026-10-01T00:00:00Z'),
        item('new', '2026-10-05T00:00:00Z'),
        item('star', '2026-10-02T00:00:00Z', { starred: true }),
        item('b1', '2026-09-01T00:00:00Z', { boughtAt: '2026-10-03T00:00:00Z' }),
        item('b2', '2026-09-02T00:00:00Z', { boughtAt: '2026-10-04T00:00:00Z', starred: true }),
    ]);
    assert.deepEqual(wanted.map((i) => i.id), ['star', 'new', 'old']);
    assert.deepEqual(bought.map((i) => i.id), ['b2', 'b1']);
});

test('the total counts only items with a price, in whole pence, and says how many that was', () => {
    const t = totalOf([item('a', 'x', { price: 0.1 }), item('b', 'x', { price: 0.2 }), item('c', 'x')]);
    assert.equal(t.total, 0.3, '0.1 + 0.2 has no floating-point noise');
    assert.equal(t.priced, 2);
    assert.equal(t.count, 3);
    assert.deepEqual(totalOf([]), { total: 0, priced: 0, count: 0 });
});

import { canonicalCategory, categoriesInUse, categoryChoices, groupByCategory, PRESET_CATEGORIES, NO_CATEGORY } from '../wishlist/organize.js';

test('a category takes the preset spelling, else one already in use, else what was typed', () => {
    assert.equal(canonicalCategory('  shoes '), 'Shoes');
    assert.equal(canonicalCategory('PERFUMES'), 'Perfumes');
    assert.equal(canonicalCategory('books', ['Books']), 'Books');
    assert.equal(canonicalCategory('Gift   ideas'), 'Gift ideas', 'spacing is tidied');
    assert.equal(canonicalCategory('books'), 'Books', 'a name of your own gets a capital');
    assert.equal(canonicalCategory('   '), '');
    assert.equal(canonicalCategory(undefined), '');
    assert.equal(canonicalCategory('x'.repeat(60)).length, 30);
});

test('categories in use have one spelling each, decided by the oldest item', () => {
    const used = categoriesInUse([
        item('b', '2026-10-02T00:00:00Z', { category: 'BOOKS' }),
        item('a', '2026-10-01T00:00:00Z', { category: 'Books' }),
        item('c', '2026-10-03T00:00:00Z', { category: 'books' }),
        item('d', '2026-10-04T00:00:00Z'),
    ]);
    assert.deepEqual(used, ['Books']);
});

test('the choices are the usual categories then any others in use, alphabetically', () => {
    const choices = categoryChoices([item('a', 'x', { category: 'Zebra' }), item('b', 'y', { category: 'apple' }), item('c', 'z', { category: 'shoes' })]);
    assert.deepEqual(choices, [...PRESET_CATEGORIES, 'Apple', 'Zebra']);
});

test('groups: usual categories in their own order, others alphabetically, no category last as Other', () => {
    const groups = groupByCategory([
        item('1', '2026-10-01T00:00:00Z'),
        item('2', '2026-10-02T00:00:00Z', { category: 'Zebra' }),
        item('3', '2026-10-03T00:00:00Z', { category: 'shoes', price: 50 }),
        item('4', '2026-10-04T00:00:00Z', { category: 'Perfumes', price: 80 }),
        item('5', '2026-10-05T00:00:00Z', { category: 'Apple' }),
        item('6', '2026-10-06T00:00:00Z', { category: 'SHOES', price: 25.5 }),
    ]);
    assert.deepEqual(groups.map((g) => g.label), ['Perfumes', 'Shoes', 'Apple', 'Zebra', NO_CATEGORY]);
    const shoes = groups.find((g) => g.label === 'Shoes');
    assert.deepEqual(shoes.items.map((i) => i.id), ['3', '6'], 'items keep the order they came in');
    assert.equal(shoes.total, 75.5);
    assert.equal(shoes.count, 2);
    assert.equal(groups.at(-1).key, '');
});

test('with no categories at all there is a single Other group', () => {
    const groups = groupByCategory([item('a', 'x'), item('b', 'y')]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, NO_CATEGORY);
    assert.deepEqual(groupByCategory([]), []);
});
