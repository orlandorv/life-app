import { lifeDb, uid } from '../life/db.js';

/**
 * In-memory mirror of the Inbox, same style as the other sections' stores.
 * `query` and `tag` are the current search and tag filter (a lower-case key).
 */
export const state = {
    notes: [],
    query: '',
    tag: null,
};

export async function loadNotes() {
    state.notes = await lifeDb.getAll('notes');
}

export async function addNote(text) {
    const now = new Date().toISOString();
    const note = { id: uid(), text: text.trim(), createdAt: now, updatedAt: now };
    await lifeDb.put('notes', note);
    state.notes.push(note);
    return note;
}

/** `updatedAt` only moves when the text changes, so pinning doesn't reshuffle the list. */
export async function updateNote(note, changes) {
    const updated = { ...note, ...changes };
    if (typeof updated.text === 'string') updated.text = updated.text.trim();
    if (updated.text !== note.text) updated.updatedAt = new Date().toISOString();
    if (!updated.pinned) delete updated.pinned; // left off when false, like the other optional fields
    await lifeDb.put('notes', updated);
    state.notes = state.notes.map((existing) => (existing.id === note.id ? updated : existing));
    return updated;
}

export async function deleteNote(id) {
    await lifeDb.delete('notes', id);
    state.notes = state.notes.filter((note) => note.id !== id);
}
