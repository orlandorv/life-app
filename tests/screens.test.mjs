import test from 'node:test';
import assert from 'node:assert/strict';
import { groupScreensByGenre, toWatchCount, nextToWatch, isWatching, isWatched, kindLine } from '../videos/screens-organize.js';

const t = (id, addedAt, extra = {}) => ({ id, title: id, kind: 'movie', addedAt, ...extra });

test('watched means having a watchedAt; watching is a series with progress that is not watched', () => {
    assert.equal(isWatched(t('a', 'x', { watchedAt: 'y' })), true);
    assert.equal(isWatched(t('a', 'x')), false);
    assert.equal(isWatching(t('a', 'x', { kind: 'series', progress: 'S2 E4' })), true);
    assert.equal(isWatching(t('a', 'x', { kind: 'series', progress: '  ' })), false);
    assert.equal(isWatching(t('a', 'x', { kind: 'series' })), false);
    assert.equal(isWatching(t('a', 'x', { kind: 'movie', progress: 'S2 E4' })), false, 'a movie has no episodes');
    assert.equal(isWatching(t('a', 'x', { kind: 'series', progress: 'S2 E4', watchedAt: 'y' })), false, 'finished is not partway');
});

test('genres group case-insensitively, alphabetical, with no genre last', () => {
    const groups = groupScreensByGenre([
        t('a', '2026-10-01T00:00:00Z', { genre: 'Thriller' }),
        t('b', '2026-10-02T00:00:00Z'),
        t('c', '2026-10-03T00:00:00Z', { genre: 'comedy' }),
        t('d', '2026-10-04T00:00:00Z', { genre: 'Comedy' }),
        t('e', '2026-10-05T00:00:00Z', { genre: 'thriller' }),
    ]);
    assert.deepEqual(groups.map((g) => g.label), ['comedy', 'Thriller', 'Uncategorised']);
    assert.deepEqual(groups[0].items.map((i) => i.id), ['c', 'd'], 'shown as first written');
    assert.equal(groups.at(-1).genre, '');
});

test('inside a genre: partway through first, then the queue oldest first, then watched most recent first', () => {
    const [group] = groupScreensByGenre([
        t('w1', '2026-10-01T00:00:00Z', { genre: 'G', watchedAt: '2026-10-10T00:00:00Z' }),
        t('q2', '2026-10-04T00:00:00Z', { genre: 'G' }),
        t('w2', '2026-10-02T00:00:00Z', { genre: 'G', watchedAt: '2026-10-12T00:00:00Z' }),
        t('q1', '2026-10-03T00:00:00Z', { genre: 'G' }),
        t('s', '2026-10-05T00:00:00Z', { genre: 'G', kind: 'series', progress: 'S1 E3' }),
    ]);
    assert.deepEqual(group.items.map((i) => i.id), ['s', 'q1', 'q2', 'w2', 'w1']);
    assert.equal(group.toWatchCount, 3);
});

test('a kind filter narrows the list and drops genres that become empty', () => {
    const items = [t('m', '2026-10-01T00:00:00Z', { genre: 'Drama' }), t('s', '2026-10-02T00:00:00Z', { genre: 'Crime', kind: 'series' })];
    assert.deepEqual(groupScreensByGenre(items, 'series').map((g) => g.label), ['Crime']);
    assert.deepEqual(groupScreensByGenre(items, 'movie').map((g) => g.label), ['Drama']);
    assert.equal(groupScreensByGenre(items, null).length, 2);
    assert.deepEqual(groupScreensByGenre([]), []);
});

test('next to watch prefers a series you are partway through, else the longest-waiting title', () => {
    const items = [
        t('old', '2026-10-01T00:00:00Z'),
        t('done', '2026-09-01T00:00:00Z', { watchedAt: '2026-09-02T00:00:00Z' }),
        t('s2', '2026-10-05T00:00:00Z', { kind: 'series', progress: 'S1 E2' }),
        t('s1', '2026-10-03T00:00:00Z', { kind: 'series', progress: 'S3 E1' }),
    ];
    assert.equal(nextToWatch(items).id, 's1', 'partway through, added first');
    assert.equal(nextToWatch(items.filter((i) => i.id !== 's1' && i.id !== 's2')).id, 'old');
    assert.equal(nextToWatch([items[1]]), null);
    assert.equal(toWatchCount(items), 3);
});

test('the small print says the kind, and where you are in a series you are watching', () => {
    assert.equal(kindLine(t('a', 'x')), 'Movie');
    assert.equal(kindLine(t('a', 'x', { kind: 'series' })), 'Series');
    assert.equal(kindLine(t('a', 'x', { kind: 'series', progress: 'S2 E4' })), 'Series · S2 E4');
    assert.equal(kindLine(t('a', 'x', { kind: 'series', progress: 'S2 E4', watchedAt: 'y' })), 'Series');
});
