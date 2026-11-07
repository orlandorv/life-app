// Bump this on every deploy that changes any cached file. Old caches are
// dropped automatically on activate, so this one line is the whole release
// process — nothing else in here needs to change per deploy.
const CACHE_VERSION = 'v129';
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
    './life/backup.js',
    './life/home.js',
    './life/icons.js',
    './life/backup-format.js',
    './life/storage-errors.js',
    './life/updates.js',
    './life/review.js',
    './life/svg.js',
    './life/daybar.js',
    './nutrition/nutrition.css',
    './nutrition/nutrition.js',
    './nutrition/store.js',
    './nutrition/totals.js',
    './nutrition/week.js',
    './nutrition/saved-meals.js',
    './nutrition/portions.js',
    './nutrition/off.js',
    './nutrition/stores.js',
    './nutrition/whole-foods.js',
    './nutrition/colombian-foods.js',
    './nutrition/scanner.js',
    './habits/habits.css',
    './habits/habits.js',
    './habits/store.js',
    './habits/streaks.js',
    './habits/times.js',
    './journal/journal.css',
    './journal/journal.js',
    './journal/store.js',
    './journal/insights.js',
    './inbox/inbox.css',
    './inbox/inbox.js',
    './inbox/store.js',
    './inbox/organize.js',
    './wishlist/wishlist.css',
    './wishlist/wishlist.js',
    './wishlist/store.js',
    './wishlist/organize.js',
    './habits/routine.js',
    './habits/routine-sheet.js',
    './habits/step-editor.js',
    './body/body.css',
    './body/body.js',
    './body/chart.js',
    './body/stats.js',
    './body/store.js',
    './body/health-import.js',
    './body/health-sheet.js',
    './videos/videos.css',
    './videos/videos.js',
    './videos/store.js',
    './videos/organize.js',
    './videos/oembed.js',
    './videos/books.js',
    './videos/books-store.js',
    './videos/books-organize.js',
    './videos/screens.js',
    './videos/screens-store.js',
    './videos/screens-organize.js',
    './life/links.js',
    './life/categories.js',
    './life/game-rules.js',
    './life/sound.js',
    './life/dial.js',
    './life/game-inputs.js',
    './life/game.js',
    './life/game.css',
    './life/share.js',
    './tasks/tasks.css',
    './tasks/tasks.js',
    './tasks/store.js',
    './tasks/organize.js',
    './tasks/ics.js',
    './tasks/recurrence.js',
    './tasks/completions.js',
    './wardrobe/organize.js',
    './wardrobe/store.js',
    './wardrobe/photo.js',
    './wardrobe/wardrobe.js',
    './wardrobe/wardrobe.css',
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
    './gym/js/plate-math.js',
    './gym/js/progression.js',
    './gym/js/week-streak.js',
    './gym/js/plan-scale.js',
    './gym/js/next-plan.js',
    './gym/js/plan-from-workout.js',
    './gym/js/warmup.js',
    './gym/js/lift-history.js',
    './gym/js/lift-chart.js',
    './gym/js/lift-sheet.js',
    './gym/js/guidance.js',
    './gym/js/prescription.js',
    './gym/js/alternatives.js',
    './gym/js/strength.js',
    './gym/js/strength-standards.js',
    './gym/js/body-shapes.js',
    './gym/js/body-map.js',
    './gym/js/goals.js',
    './gym/js/goals-ui.js',
    './gym/js/demos.js',
    './gym/js/demo-link.js',
    './gym/js/checkin.js',
    './gym/js/checkin-derive.js',
    './gym/js/settings.js',
    './gym/js/progress.js',
    './gym/js/badges.js',
    './gym/js/quests.js',
    './gym/js/rewards.js',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
];

// How hard installing tries before giving up on a file. The shell is ~100 files,
// fetched in small groups with a retry or two each, because the likeliest time
// to install an update is on a gym's spotty wifi.
const PRECACHE_ATTEMPTS = 3;
const PRECACHE_PARALLEL = 6;
const PRECACHE_RETRY_MS = 400;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A missing file (404) won't appear on a retry; a server hiccup or a dropped
// connection might.
const worthRetrying = (status) => status === undefined || status >= 500 || status === 408 || status === 429;

async function precacheOne(cache, url) {
    let failure = 'no attempt made';
    for (let attempt = 1; attempt <= PRECACHE_ATTEMPTS; attempt += 1) {
        let status;
        try {
            // no-store: straight to the network, never the browser's HTTP cache,
            // or an update could install yesterday's file under today's version.
            const response = await fetch(url, { cache: 'no-store' });
            status = response.status;
            if (response.ok) return cache.put(url, response);
            failure = `${url} -> ${response.status}`;
        } catch (error) {
            failure = `${url} -> ${error?.message ?? 'network error'}`;
        }
        if (!worthRetrying(status) || attempt === PRECACHE_ATTEMPTS) break;
        await wait(PRECACHE_RETRY_MS * attempt);
    }
    throw new Error(failure);
}

/** Caches the whole shell, a few files at a time; rejects if any file can't be had. */
async function precacheShell(cache) {
    const queue = [...APP_SHELL];
    const failures = [];
    const worker = async () => {
        // Once one file has failed the install is doomed, so stop pulling the rest.
        while (queue.length && !failures.length) {
            const url = queue.shift();
            try {
                await precacheOne(cache, url);
            } catch (error) {
                failures.push(error.message);
            }
        }
    };
    await Promise.all(Array.from({ length: PRECACHE_PARALLEL }, worker));
    if (failures.length) throw new Error(`${failures.length} app file(s) could not be cached: ${failures.slice(0, 3).join('; ')}`);
}

// A version is installed whole or not at all. Precaching used to shrug off
// individual misses and activate anyway; then the update that wasn't quite
// complete replaced the old, complete one, and a file that never arrived left
// the app unable to start the next time it opened offline. Now one miss fails
// the install: the previous version keeps running untouched, nothing half-built
// is left behind, and the browser tries again the next time the app loads or is
// brought back to the foreground.
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            try {
                await precacheShell(await caches.open(CACHE_NAME));
            } catch (error) {
                await caches.delete(CACHE_NAME);
                console.warn('life sw: not installing this version —', error.message);
                throw error;
            }
            // Don't wait for old tabs to close before this version takes
            // over installing — see the note by clients.claim() below for
            // why that still isn't quite instant for an already-open tab.
            return self.skipWaiting();
        })(),
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
    // Only the app's own files are cached. Other sites (Open Food Facts
    // searches and lookups) always go to the network: caching them would
    // serve stale results forever and grow the cache without limit.
    if (new URL(event.request.url).origin !== self.location.origin) return;

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
