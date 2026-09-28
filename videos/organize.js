/**
 * Grouping and YouTube link parsing for Recommended Videos — pure, like
 * habits/streaks.js, so it can be checked without a DOM or a database.
 *
 * A video is `{id, title, url, topic, note, watched, addedAt, watchedAt}`.
 * `topic` is free text (you or I choose it when a video is added); an empty
 * topic groups under "Uncategorised" rather than needing a fixed list.
 */

export const UNCATEGORISED = 'Uncategorised';

/** Trimmed topic text, or '' for none — the one shape every comparison uses. */
export function normalizeTopic(topic) {
    return typeof topic === 'string' ? topic.trim() : '';
}

/**
 * Videos grouped by topic: alphabetical (case-insensitive), Uncategorised
 * always last since it's a leftover bucket, not a real topic. Inside a group,
 * unwatched videos come first (oldest added first, so a backlog is worked
 * through in order), then watched ones (most recently watched first).
 */
export function groupByTopic(videos) {
    // Keyed case-insensitively ("Gym" and "gym" are the same topic), but the
    // label shown is whichever casing was used first.
    const byKey = new Map();
    for (const video of videos) {
        const topic = normalizeTopic(video.topic);
        const key = topic.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, { topic, list: [] });
        byKey.get(key).list.push(video);
    }

    const groups = [...byKey.values()].map(({ topic, list }) => {
        const unwatched = list.filter((video) => !video.watched).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
        const watched = list
            .filter((video) => video.watched)
            .sort((a, b) => (b.watchedAt ?? '').localeCompare(a.watchedAt ?? ''));
        return { topic, label: topic || UNCATEGORISED, videos: [...unwatched, ...watched], unwatchedCount: unwatched.length };
    });

    return groups.sort((a, b) => {
        if (!a.topic !== !b.topic) return a.topic ? -1 : 1; // real topics before Uncategorised
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
}

export function unwatchedCount(videos) {
    return videos.filter((video) => !video.watched).length;
}

/** The video to suggest next: the oldest-added unwatched one, across every topic. */
export function nextToWatch(videos) {
    const unwatched = videos.filter((video) => !video.watched);
    if (!unwatched.length) return null;
    return unwatched.reduce((oldest, video) => (video.addedAt < oldest.addedAt ? video : oldest));
}

/**
 * Every topic already in use, for suggesting one when adding a video.
 * Case-insensitive, like grouping: "Gym" and "gym" count as one, kept in
 * whichever casing was used first.
 */
export function existingTopics(videos) {
    const seen = new Map();
    for (const video of videos) {
        const topic = normalizeTopic(video.topic);
        if (topic && !seen.has(topic.toLowerCase())) seen.set(topic.toLowerCase(), topic);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

// --- YouTube -----------------------------------------------------------------

const YOUTUBE_ID = /^[\w-]{11}$/;

/**
 * The 11-character video id from any common YouTube link shape (watch, short
 * link, Shorts, embed, youtube-nocookie, with or without other query params
 * and a leading www/m/music subdomain), or null for anything else.
 */
export function extractYouTubeId(url) {
    let parsed;
    try {
        parsed = new URL(String(url ?? '').trim());
    } catch {
        return null;
    }

    const host = parsed.hostname.replace(/^www\.|^m\.|^music\./, '');
    let id = null;

    if (host === 'youtu.be') {
        id = parsed.pathname.slice(1).split('/')[0];
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
        if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
        else if (parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.split('/')[2];
        else if (parsed.pathname.startsWith('/embed/')) id = parsed.pathname.split('/')[2];
        else if (parsed.pathname.startsWith('/live/')) id = parsed.pathname.split('/')[2];
    }

    return id && YOUTUBE_ID.test(id) ? id : null;
}

export function isYouTubeUrl(url) {
    return extractYouTubeId(url) !== null;
}

/** A decent-sized still frame for a YouTube video; null for anything else. */
export function thumbnailUrl(url) {
    const id = extractYouTubeId(url);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** A plausible http(s) link — not validating it resolves, just that it's shaped like one. */
export function isLikelyUrl(text) {
    try {
        return ['http:', 'https:'].includes(new URL(String(text ?? '').trim()).protocol);
    } catch {
        return false;
    }
}
