import { el } from '../../life/dom.js';
import { demoUrl, demoThumbnail, demoChannel } from './demos.js';

/**
 * A link out to an exercise's demo clip, or null when it has none (a custom
 * exercise). Opens the real video in a new tab — there's no embedded player to
 * keep working offline.
 *
 * `inline` is a one-line text link for the workout screen; `card` is a
 * thumbnail with the channel credited, for the exercise details.
 */
export function demoLink(exerciseId, { variant = 'inline' } = {}) {
    const href = demoUrl(exerciseId);
    if (!href) return null;

    const attrs = { href, target: '_blank', rel: 'noopener noreferrer' };

    if (variant === 'inline') {
        return el('a', { ...attrs, class: 'link-btn demo-link', text: '▶ Watch demo' });
    }

    const channel = demoChannel(exerciseId);
    const thumb = el('img', {
        class: 'demo-thumb',
        src: demoThumbnail(exerciseId),
        alt: '',
        loading: 'lazy',
    });
    // Offline (or the still is gone): the text link below is still enough.
    thumb.addEventListener('error', () => thumb.remove());

    return el('a', { ...attrs, class: 'demo-card' }, [
        thumb,
        el('span', { class: 'demo-card-body' }, [
            el('span', { class: 'demo-card-title', text: '▶ Watch demo' }),
            channel ? el('span', { class: 'demo-card-meta', text: `Video by ${channel} · opens YouTube` }) : null,
        ]),
    ]);
}
