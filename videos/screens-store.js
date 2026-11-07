import { lifeDb, uid } from '../life/db.js';

/**
 * In-memory mirror of Movies & TV, in the same style as the other stores: no
 * reactivity, so a write is followed by `loadScreens()` and a re-render. Optional
 * fields (`genre`, `where`, `progress`, `note`, `link`, `watchedAt`) are left off
 * when empty; `progress` is only kept for a series.
 */
export const state = {
    screens: [],
};

export async function loadScreens() {
    const screens = await lifeDb.getAll('screens');
    state.screens = screens.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

function withOptional(item, { genre, where, progress, note, link }) {
    const next = { ...item };
    for (const field of ['genre', 'where', 'progress', 'note', 'link']) delete next[field];
    const values = { genre, where, progress: item.kind === 'series' ? progress : '', note, link };
    for (const [field, value] of Object.entries(values)) if (clean(value)) next[field] = clean(value);
    return next;
}

export async function addScreen({ title, kind, genre, where, progress, note, link, watched = false }) {
    const now = new Date().toISOString();
    const item = withOptional({ id: uid(), title: clean(title), kind: kind === 'series' ? 'series' : 'movie', addedAt: now }, { genre, where, progress, note, link });
    if (watched) item.watchedAt = now;
    await lifeDb.put('screens', item);
    state.screens.push(item);
    return item;
}

export async function updateScreen(item, { title, kind, genre, where, progress, note, link }) {
    const next = { ...item, title: clean(title), kind: kind === 'series' ? 'series' : 'movie' };
    const updated = withOptional(next, { genre, where, progress, note, link });
    await lifeDb.put('screens', updated);
    state.screens = state.screens.map((existing) => (existing.id === item.id ? updated : existing));
    return updated;
}

/** Marks a title watched now, or puts it back in the queue. */
export async function setWatched(item, watched) {
    const updated = { ...item };
    if (watched) updated.watchedAt = new Date().toISOString();
    else delete updated.watchedAt;
    await lifeDb.put('screens', updated);
    state.screens = state.screens.map((existing) => (existing.id === item.id ? updated : existing));
    return updated;
}

export async function deleteScreen(id) {
    await lifeDb.delete('screens', id);
    state.screens = state.screens.filter((item) => item.id !== id);
}
