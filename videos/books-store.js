import { lifeDb, uid } from '../life/db.js';

/**
 * In-memory mirror of Books to read, in the same style as the other stores: no
 * reactivity, so a write is followed by `loadBooks()` and a re-render. Optional
 * fields (`author`, `topic`, `note`, `link`, `readAt`) are left off when empty.
 */
export const state = {
    books: [],
};

export async function loadBooks() {
    const books = await lifeDb.getAll('books');
    state.books = books.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

function withOptional(book, { author, topic, note, link }) {
    const next = { ...book };
    for (const [field, value] of Object.entries({ author, topic, note, link })) {
        delete next[field];
        if (clean(value)) next[field] = clean(value);
    }
    return next;
}

export async function addBook({ title, author, topic, note, link, read = false }) {
    const now = new Date().toISOString();
    const book = withOptional({ id: uid(), title: clean(title), addedAt: now }, { author, topic, note, link });
    if (read) book.readAt = now;
    await lifeDb.put('books', book);
    state.books.push(book);
    return book;
}

export async function updateBook(book, { title, author, topic, note, link }) {
    const updated = withOptional({ ...book, title: clean(title) }, { author, topic, note, link });
    await lifeDb.put('books', updated);
    state.books = state.books.map((existing) => (existing.id === book.id ? updated : existing));
    return updated;
}

/** Marks a book finished now, or puts it back on the pile. */
export async function setRead(book, read) {
    const updated = { ...book };
    if (read) updated.readAt = new Date().toISOString();
    else delete updated.readAt;
    await lifeDb.put('books', updated);
    state.books = state.books.map((existing) => (existing.id === book.id ? updated : existing));
    return updated;
}

export async function deleteBook(id) {
    await lifeDb.delete('books', id);
    state.books = state.books.filter((book) => book.id !== id);
}
