import { extractYouTubeId } from './organize.js';

/**
 * YouTube's oEmbed endpoint: given a video URL, its title and a thumbnail —
 * no key, no account. Used only to save typing a title when you paste a
 * link; if it fails for any reason the title field just stays blank and you
 * type it yourself, so nothing here is load-bearing.
 */

const OEMBED_URL = 'https://www.youtube.com/oembed';
const TIMEOUT_MS = 6000;

export class OfflineError extends Error {
    constructor() {
        super('You’re offline — type the title yourself.');
        this.name = 'OfflineError';
    }
}

/**
 * `{title, thumbnailUrl}` for a YouTube link, or throws. Not called for
 * non-YouTube links — there's no equivalent free lookup for every video site.
 */
export async function fetchYouTubeTitle(url, { signal } = {}) {
    if (!extractYouTubeId(url)) throw new Error('Not a YouTube link.');
    if (!navigator.onLine) throw new OfflineError();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const forward = () => controller.abort();
    signal?.addEventListener('abort', forward);

    try {
        const params = new URLSearchParams({ url: String(url), format: 'json' });
        const response = await fetch(`${OEMBED_URL}?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404 ? 'Video not found.' : `YouTube answered ${response.status}`);

        const data = await response.json();
        if (!data.title) throw new Error('No title in the response.');
        return { title: data.title, thumbnailUrl: data.thumbnail_url ?? null };
    } catch (error) {
        if (signal?.aborted) throw error;
        if (error.name === 'AbortError') throw new Error('Took too long to answer.');
        if (!navigator.onLine) throw new OfflineError();
        throw error;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forward);
    }
}
