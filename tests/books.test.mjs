import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBooksByTopic, toReadCount, nextToRead, isRead } from '../videos/books-organize.js';
import { cleanLink, linkHost } from '../life/links.js';

const book = (id, addedAt, extra = {}) => ({ id, title: id, addedAt, ...extra });

test('books group by topic, case-insensitively, alphabetical with Uncategorised last', () => {
    const groups = groupBooksByTopic([
        book('a', '2026-10-01T00:00:00Z', { topic: 'Money' }),
        book('b', '2026-10-02T00:00:00Z'),
        book('c', '2026-10-03T00:00:00Z', { topic: 'fiction' }),
        book('d', '2026-10-04T00:00:00Z', { topic: 'Fiction' }),
        book('e', '2026-10-05T00:00:00Z', { topic: 'money' }),
    ]);
    assert.deepEqual(groups.map((g) => g.label), ['fiction', 'Money', 'Uncategorised']);
    assert.deepEqual(groups[0].books.map((b) => b.id), ['c', 'd'], 'shown as first written');
    assert.equal(groups.at(-1).topic, '');
});

test('inside a topic: still to read oldest first, then read most recently finished first', () => {
    const [group] = groupBooksByTopic([
        book('r1', '2026-10-01T00:00:00Z', { topic: 'T', readAt: '2026-10-10T00:00:00Z' }),
        book('u2', '2026-10-03T00:00:00Z', { topic: 'T' }),
        book('r2', '2026-10-02T00:00:00Z', { topic: 'T', readAt: '2026-10-12T00:00:00Z' }),
        book('u1', '2026-10-02T00:00:00Z', { topic: 'T' }),
    ]);
    assert.deepEqual(group.books.map((b) => b.id), ['u1', 'u2', 'r2', 'r1']);
    assert.equal(group.toReadCount, 2);
});

test('read means having a readAt; the count and the next book ignore read ones', () => {
    const books = [book('old', '2026-10-01T00:00:00Z', { readAt: '2026-10-05T00:00:00Z' }), book('b', '2026-10-03T00:00:00Z'), book('a', '2026-10-02T00:00:00Z')];
    assert.equal(isRead(books[0]), true);
    assert.equal(isRead(books[1]), false);
    assert.equal(toReadCount(books), 2);
    assert.equal(nextToRead(books).id, 'a', 'the longest-waiting one');
    assert.equal(nextToRead([books[0]]), null);
    assert.deepEqual(groupBooksByTopic([]), []);
});

test('links moved to life/links.js still read the same', () => {
    assert.equal(cleanLink('shop.example/x'), 'https://shop.example/x');
    assert.equal(cleanLink('javascript:alert(1)'), null);
    assert.equal(linkHost('https://www.amazon.co.uk/dp/1'), 'amazon.co.uk');
});
