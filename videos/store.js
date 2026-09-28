import { lifeDb, uid } from '../life/db.js';

/**
 * In-memory mirror of Recommended Videos, in the same style as the other
 * sections' stores: no reactivity, so a write is followed by `loadVideos()`
 * and a re-render.
 */
export const state = {
    videos: [],
};

export async function loadVideos() {
    const videos = await lifeDb.getAll('videos');
    state.videos = videos.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export function findVideo(id) {
    return state.videos.find((video) => video.id === id) ?? null;
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

export async function addVideo({ title, url, topic, note, watched = false }) {
    const now = new Date().toISOString();
    const video = {
        id: uid(),
        title: clean(title),
        url: clean(url),
        topic: clean(topic),
        note: clean(note),
        watched: Boolean(watched),
        addedAt: now,
        watchedAt: watched ? now : null,
    };
    await lifeDb.put('videos', video);
    state.videos.push(video);
    return video;
}

export async function updateVideo(video, { title, url, topic, note }) {
    const updated = { ...video, title: clean(title), url: clean(url), topic: clean(topic), note: clean(note) };
    await lifeDb.put('videos', updated);
    state.videos = state.videos.map((existing) => (existing.id === video.id ? updated : existing));
    return updated;
}

/** Ticks or unticks watched, stamping (or clearing) when — used for the "watched most recently" order. */
export async function setWatched(video, watched) {
    const updated = { ...video, watched, watchedAt: watched ? new Date().toISOString() : null };
    await lifeDb.put('videos', updated);
    state.videos = state.videos.map((existing) => (existing.id === video.id ? updated : existing));
    return updated;
}

export async function deleteVideo(id) {
    await lifeDb.delete('videos', id);
    state.videos = state.videos.filter((video) => video.id !== id);
}

/** Renames a topic everywhere it's used — e.g. tidying up after several videos arrive under slightly different spellings. */
export async function renameTopic(oldTopic, newTopic) {
    const target = oldTopic.trim().toLowerCase();
    const affected = state.videos.filter((video) => video.topic.trim().toLowerCase() === target);
    for (const video of affected) await updateVideo(video, { ...video, topic: newTopic });
    return affected.length;
}
