import { normalizeTopic, UNCATEGORISED } from './organize.js';

/**
 * Grouping for Books to read — pure, like organize.js (which it borrows the
 * topic rules from), so it can be checked without a DOM or a database.
 *
 * A book is `{ id, title, author?, topic?, note?, link?, addedAt, readAt? }`.
 * `topic` is free text, exactly as for videos: type any name and the group
 * appears. `readAt` being present is what makes a book "read", so there's no
 * separate flag to drift out of step with it. Optional fields are left off
 * when empty.
 */

export const isRead = (book) => Boolean(book.readAt);

/**
 * Books grouped by topic: alphabetical (case-insensitive), Uncategorised last,
 * like videos. Inside a group, books still to read come first (oldest added
 * first, so a pile is worked through in order), then read ones (most recently
 * finished first).
 */
export function groupBooksByTopic(books) {
    // Keyed case-insensitively ("Fiction" and "fiction" are one topic), shown as
    // first written.
    const byKey = new Map();
    for (const book of [...books].sort((a, b) => a.addedAt.localeCompare(b.addedAt))) {
        const topic = normalizeTopic(book.topic);
        const key = topic.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, { topic, list: [] });
        byKey.get(key).list.push(book);
    }

    const groups = [...byKey.values()].map(({ topic, list }) => {
        const toRead = list.filter((book) => !isRead(book));
        const read = list.filter(isRead).sort((a, b) => b.readAt.localeCompare(a.readAt));
        return { topic, label: topic || UNCATEGORISED, books: [...toRead, ...read], toReadCount: toRead.length };
    });

    return groups.sort((a, b) => {
        if (!a.topic !== !b.topic) return a.topic ? -1 : 1; // real topics before Uncategorised
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
}

export const toReadCount = (books) => books.filter((book) => !isRead(book)).length;

/** The book to suggest next: the longest-waiting one still to read, across every topic. */
export function nextToRead(books) {
    const waiting = books.filter((book) => !isRead(book));
    if (!waiting.length) return null;
    return waiting.reduce((oldest, book) => (book.addedAt < oldest.addedAt ? book : oldest));
}
