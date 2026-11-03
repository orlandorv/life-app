/**
 * Inbox: quick notes and ideas, sorted by the #tags written into them. Pure
 * (no DOM, no storage), so tag parsing, search and ordering are unit-testable
 * in Node.
 *
 * A note is `{ id, text, pinned?, createdAt, updatedAt }`. Tags aren't stored
 * separately: they're whatever `#words` the text contains, so editing the text
 * is the only way to change them and they can never drift out of sync.
 */

// A tag is # followed by letters, digits, - or _ (any language), at the start
// or after a space — so "C#" or a URL fragment isn't one.
const TAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

/** The note's tags, in order, without repeats (compared case-insensitively). */
export function parseTags(text = '') {
    const seen = new Set();
    const tags = [];
    for (const match of text.matchAll(TAG)) {
        const tag = match[2];
        const key = tag.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            tags.push(tag);
        }
    }
    return tags;
}

/**
 * Every tag in use, most-used first, as `{ key, label, count }`. Case doesn't
 * split a tag: #Gym and #gym are one, shown the way it was first written.
 */
export function allTags(notes) {
    const byKey = new Map();
    for (const note of notes) {
        for (const tag of parseTags(note.text)) {
            const key = tag.toLowerCase();
            const entry = byKey.get(key) ?? { key, label: tag, count: 0 };
            entry.count += 1;
            byKey.set(key, entry);
        }
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Pinned first; then the most recently changed. */
export function sortNotes(notes) {
    return [...notes].sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
    );
}

/** Notes matching every word of `query` (case-insensitive) and, if given, carrying `tag` (a lower-case key). */
export function filterNotes(notes, { query = '', tag = null } = {}) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return notes.filter((note) => {
        const text = note.text.toLowerCase();
        if (tag && !parseTags(note.text).some((t) => t.toLowerCase() === tag)) return false;
        return words.every((word) => text.includes(word));
    });
}

/**
 * A note turned into a task: the first line becomes the title (trimmed to a
 * sensible length), and the whole note goes in the task's note when there's
 * more to it than that line.
 */
export function noteToTask(text) {
    const trimmed = text.trim();
    const [firstLine] = trimmed.split('\n');
    const title = firstLine.length > 80 ? `${firstLine.slice(0, 77).trimEnd()}…` : firstLine;
    return { title, note: trimmed === firstLine && firstLine.length <= 80 ? '' : trimmed };
}
