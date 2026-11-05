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
