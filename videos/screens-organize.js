import { normalizeTopic, UNCATEGORISED } from './organize.js';

/**
 * Grouping for Movies & TV — pure, like books-organize.js, so it can be checked
 * without a DOM or a database.
 *
 * A title is `{ id, title, kind, addedAt, genre?, where?, progress?, note?, link?,
 * watchedAt? }`. `kind` is `'movie'` or `'series'`. `genre` is free text, with the
 * same rules as a video's topic (grouped case-insensitively, shown as first
 * written, none last). `watchedAt` being present is what makes a title watched.
 * `progress` is where you are in a series ("S2 E4"); a series with progress that
 * isn't watched is **being watched**, so there is no separate status to drift.
 */

export const KINDS = ['movie', 'series'];
export const KIND_LABEL = { movie: 'Movie', series: 'Series' };

export const isWatched = (item) => Boolean(item.watchedAt);
export const isWatching = (item) => item.kind === 'series' && !isWatched(item) && Boolean(item.progress?.trim());

/** Today's rank inside a genre: what you're partway through, then the queue, then what's done. */
const rank = (item) => (isWatched(item) ? 2 : isWatching(item) ? 0 : 1);

/**
 * Titles grouped by genre: alphabetical (case-insensitive), no genre last. Inside
 * a group, series you're partway through come first, then the queue (oldest added
 * first, so a list is worked through in order), then what you've watched (most
 * recently first). `kind` (`'movie'`, `'series'` or null for both) narrows the list.
 */
export function groupScreensByGenre(items, kind = null) {
    const byKey = new Map();
    for (const item of [...items].sort((a, b) => a.addedAt.localeCompare(b.addedAt))) {
        if (kind && item.kind !== kind) continue;
        const genre = normalizeTopic(item.genre);
        const key = genre.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, { genre, list: [] });
        byKey.get(key).list.push(item);
    }

    const groups = [...byKey.values()].map(({ genre, list }) => {
        const ordered = [...list].sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.watchedAt.localeCompare(a.watchedAt) : 0));
        return { genre, label: genre || UNCATEGORISED, items: ordered, toWatchCount: list.filter((item) => !isWatched(item)).length };
    });

    return groups.sort((a, b) => {
        if (!a.genre !== !b.genre) return a.genre ? -1 : 1; // real genres before the leftover bucket
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
}

export const toWatchCount = (items) => items.filter((item) => !isWatched(item)).length;

/** What to watch next: a series you're partway through (the one added first), else the longest-waiting title. */
export function nextToWatch(items) {
    const waiting = items.filter((item) => !isWatched(item));
    if (!waiting.length) return null;
    const oldest = (list) => list.reduce((first, item) => (item.addedAt < first.addedAt ? item : first));
    const partway = waiting.filter(isWatching);
    return oldest(partway.length ? partway : waiting);
}

/** "Movie", "Series", or "Series · S2 E4" for a row's small print. */
export function kindLine(item) {
    return isWatching(item) ? `${KIND_LABEL[item.kind]} · ${item.progress.trim()}` : KIND_LABEL[item.kind] ?? 'Movie';
}
