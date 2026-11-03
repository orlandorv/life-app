import { lifeDb } from '../life/db.js';
import { isLevel, hasContent } from './insights.js';

/**
 * In-memory mirror of the Journal, same style as the other sections' stores.
 * `entries` is chronological (oldest first). One entry per day: the store is
 * keyed by the local day, like Body's.
 */
export const state = {
    day: null,
    entries: [],
};

export async function loadEntries() {
    const entries = await lifeDb.getAll('journalEntries');
    state.entries = entries.sort((a, b) => a.day.localeCompare(b.day));
}

export function entryFor(day) {
    return state.entries.find((entry) => entry.day === day) ?? null;
}

/**
 * Saves a day's check-in. Not recorded is null (never a fake middle value),
 * an empty note is left off, and a day with nothing left in it is deleted
 * rather than kept as an empty row.
 */
export async function saveEntry({ day, mood, energy, note }) {
    const entry = {
        day,
        mood: isLevel(mood) ? mood : null,
        energy: isLevel(energy) ? energy : null,
        updatedAt: new Date().toISOString(),
    };
    if (note?.trim()) entry.note = note.trim();

    if (hasContent(entry)) await lifeDb.put('journalEntries', entry);
    else await lifeDb.delete('journalEntries', day);
    await loadEntries();
}
