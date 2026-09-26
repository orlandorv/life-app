// Bump this on every deploy that changes any cached file. Old caches are
// dropped automatically on activate, so this one line is the whole release
// process — nothing else in here needs to change per deploy.
const CACHE_VERSION = 'v38';
const CACHE_NAME = `life-${CACHE_VERSION}`;

// Registered as a relative path from index.html, so these resolve under
// wherever the app is actually hosted (e.g. /repo-name/ on GitHub Pages)
// rather than assuming the domain root.
const APP_SHELL = [
    './',
    './index.html',
    './life/life.css',
    './life/life.js',
    './gym/gym.css',
    './life/db.js',
    './life/dates.js',
    './nutrition/nutrition.css',
    './nutrition/nutrition.js',
    './nutrition/store.js',
    './nutrition/totals.js',
    './manifest.webmanifest',
    './gym/js/app.js',
    './gym/js/db.js',
    './gym/js/seed.js',
    './gym/js/units.js',
    './life/dom.js',
    './gym/js/store.js',
    './gym/js/library.js',
    './gym/js/picker.js',
    './life/stepper.js',
    './gym/js/templates.js',
    './gym/js/workout.js',
    './gym/js/timer.js',
    './gym/js/sfx.js',
    './gym/js/records.js',
    './gym/js/history.js',
    './gym/js/volume.js',
    './gym/js/plates.js',
    './gym/js/guidance.js',
    './gym/js/checkin.js',
    './gym/js/settings.js',
    './gym/js/progress.js',
    './gym/js/badges.js',
    './gym/js/quests.js',
    './gym/js/rewards.js',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Deliberately not cache.addAll(APP_SHELL): that's all-or-nothing —
            // one flaky request out of 23, fetched in a single burst, fails
            // the whole precache and silently leaves it empty. On a gym's
            // spotty wifi (the entire reason this exists) that's the most
            // likely time for exactly that to happen. Caching each file on
            // its own means a single miss doesn't cost the other 22 — and
            // whatever didn't make it here still gets picked up the first
            // time it's actually requested, via the fetch handler below.
            const results = await Promise.allSettled(
                APP_SHELL.map(async (url) => {
                    const response = await fetch(url, { cache: 'no-store' });
                    if (!response.ok) throw new Error(`${url} -> ${response.status}`);
                    await cache.put(url, response);
                }),
            );
            const failed = results.filter((r) => r.status === 'rejected');
            if (failed.length) {
                console.warn('life sw: some app-shell files failed to precache', failed.map((r) => r.reason?.message));
            }
            // Don't wait for old tabs to close before this version takes
            // over installing — see the note by clients.claim() below for
            // why that still isn't quite instant for an already-open tab.
            return self.skipWaiting();
        }),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
            // Take control of any already-open tab immediately rather than
            // only new ones. The tab's already-loaded HTML/JS is still the
            // old version in memory though — that's what needs a reload,
            // not the control handoff itself.
            .then(() => self.clients.claim()),
    );
});

// Cache-first for the app shell: this is what makes the app open instantly
// with no network at all, which is the entire point on a gym's spotty wifi.
// Anything not precached falls through to the network, and quietly gets
// cached for next time if it succeeds.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
        }),
    );
});
