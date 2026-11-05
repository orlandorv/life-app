import { el } from './dom.js';

/**
 * Registers the service worker and keeps the app fresh once it's open.
 *
 * A home-screen app on iOS is usually suspended rather than closed, so the page
 * you reopen is the one you left, and a browser only looks for a new version
 * when a page loads. Left alone, a deploy could sit unseen for days. So this:
 *
 * - looks for a new version whenever the app comes back to the foreground (at
 *   most every 15 minutes) and once an hour while it's open, and
 * - when a new version has installed and taken over, says so with a banner,
 *   because the page on screen is still running the old code until it reloads
 *   (and the same banner when a newer copy of the app has upgraded the database
 *   out from under this one).
 *
 * It never reloads by itself: a reload in the middle of a set would be rude, and
 * nothing is lost by waiting (the open workout is saved with every edit).
 */

const RECHECK_AFTER_MS = 15 * 60 * 1000;
const POLL_MS = 60 * 60 * 1000;

export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // Only a page that was already running under a worker has stale code when
    // the next one takes over. The very first install also "changes" the
    // controller (the worker claims the page), and there's nothing to reload for.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let announced = false;
    const announce = () => {
        if (announced) return;
        announced = true;
        showUpdateBanner();
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) announce();
    });
    // A newer copy of the app upgraded the database under this page: the page can
    // no longer read or write it, so say so plainly instead of failing on the next tap.
    window.addEventListener('life-db-outdated', announce);

    navigator.serviceWorker
        .register('./sw.js')
        .then(keepChecking)
        .catch((error) => {
            console.warn('Service worker registration failed:', error);
        });
}

function keepChecking(registration) {
    let lastCheck = Date.now();
    const check = () => {
        lastCheck = Date.now();
        // Offline, or the host is down: nothing to do, try again later.
        registration.update().catch(() => {});
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > RECHECK_AFTER_MS) check();
    });
    setInterval(() => {
        if (document.visibilityState === 'visible') check();
    }, POLL_MS);
}

function showUpdateBanner() {
    const banner = el('div', { class: 'update-banner', role: 'status' }, [
        el('span', { class: 'update-banner-text', text: 'A new version is ready.' }),
        el('button', { class: 'btn btn-primary btn-small', type: 'button', text: 'Reload', onclick: () => window.location.reload() }),
        el('button', { class: 'link-btn', type: 'button', text: 'Later', onclick: () => banner.remove() }),
    ]);
    document.body.append(banner);
}
