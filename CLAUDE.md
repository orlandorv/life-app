# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Life — a mobile-first, offline-capable personal app, installable as a home-screen PWA on iOS via GitHub Pages. Life is the shell (home screen + routing); each area of life is a **section** inside it. Today there is one built section, **Gym** (exercise library, templates, live workout logging, rest timer, history, personal records, XP/levels/badges); Nutrition, Habits and Body are placeholder cards on the home screen.

### Layout

- `index.html` — the Life shell: `#life-home` (section grid) and `#gym-section` (all Gym markup: tabs, rest bar, bottom nav). Gym's modals sit after it, at body level.
- `life/life.js` + `life/life.css` — router, home grid, service-worker registration; `life.css` also holds the shared foundation (reset, `:root` design tokens, body rules).
- `gym/js/*.js` + `gym/gym.css` — the Gym section. Its entry point is `bootGym()` in `gym/js/app.js`.

**Routing** is a hash: `#/` is home, `#/gym` is Gym. Gym is booted once at startup and only hidden/shown, so an active workout, stopwatch and rest timer keep running while you're on the home screen. Gym's selectors are scoped to `#gym-section` — keep new Gym code from using bare global selectors.

**Adding a section:** add an entry to `SECTIONS` in `life/life.js`, add its container (`<div id="x-section" hidden>`) to `index.html`, extend `route()`, and add its files to `APP_SHELL` in `sw.js`. Life-owned classes are `life-` prefixed; Gym's generic classes (`.btn`, `.modal`, tokens) are reusable as the shared design system.

Vanilla JS throughout: no framework, no bundler, no npm dependencies, no build step. `life/life.js` and `gym/js/*.js` are loaded as native ES modules straight from `index.html` (`<script type="module" src="life/life.js">`). Edit a file, refresh the browser.

## Commands

Run the dev server (a zero-dependency static file server, `server.js`):

```bash
node server.js
```

Serves on `http://localhost:8000`. (Also runnable via the `.claude/launch.json` "Gym Tracker" preview config (name kept; it serves all of Life).)

Regenerate the smaller PWA icons from the master `icons/icon-512.png` (uses macOS's built-in `sips`, no dependencies):

```bash
tools/make-icons.sh
```

Writes `icons/icon-{180,192}.png`. To change the artwork, replace `icons/icon-512.png` (square, full-bleed — iOS rounds the corners itself) and re-run this.

There is no test suite, linter, or build step in this repo.

## Deployment

Static hosting on GitHub Pages; see `DEPLOY.md` for the full walkthrough. The important constraint for any code change: **every asset reference must stay relative** (`life/life.js`, not `/life/life.js`) because Pages serves the site from a repo subpath (`/repo-name/`), not the domain root. This applies to script/link tags in `index.html`, paths inside `sw.js`, and the manifest's icon paths.

## Architecture

### Gym section internals

Everything below lives in `gym/js/`.

### Data layer: `db.js` + `store.js`

`js/db.js` wraps IndexedDB (`GymTrackerDB`) behind a single `Database` class (singleton export `database`). It owns the schema and version migrations (`DB_VERSION`, bumped in `onupgradeneeded`) across five object stores: `exercises`, `templates`, `workouts`, `media` (blobs kept separate from exercise records so listing the library never drags video into memory), and `settings`.

`js/store.js` holds an in-memory mirror of the DB in a plain `state` object (`exercises`, `templates`, `workouts`, `activeWorkout`). There is **no reactivity** — after any mutation via `db.js`, the calling code must explicitly re-run the matching `loadX()` in `store.js` to refresh `state`, then call the relevant module's `renderX()` to redraw. `bootstrap()` in `store.js` is the top-level data init, called once from `bootGym()` in `app.js`.

### Module shape

Every feature area (`library.js`, `templates.js`, `workout.js`, `history.js`, `records.js`, `settings.js`) follows the same pair of exports: `initX()` wires event listeners once at boot, `renderX()` tears down and rebuilds that tab's DOM from current `state`. `gym/js/app.js` (`bootGym()`) calls every `initX()` then does the first render pass; `life/life.js` calls it once at startup.

`js/workout.js` is the largest module: it owns the active-workout session state machine (start/finish/discard), the elapsed-time stopwatch (pauses automatically once every set is ticked, driven by a deadline timestamp rather than a decrementing counter so it survives backgrounded-tab throttling), a hand-rolled drag-to-reorder for exercises (pointer events, FLIP-style animation, no library), and timing the "exercise added" entrance animation to when the exercise picker sheet actually closes rather than when the DOM node is inserted (the picker is full-screen, so animating on insertion would play invisibly behind it).

### Shared UI primitives (`dom.js`, `stepper.js`, `sfx.js`)

`dom.js` provides `el()` (builds an element from a props+children object, always via `textContent`, never `innerHTML`), a **modal stack** (`openModal`/`closeModal`/`onModalClosed`), `toast()`, and `confirmSheet()` — a promise-based confirm dialog. Every modal in the app is static markup already present in `index.html`, shown/hidden via the stack rather than created dynamically. `confirmSheet()` resolves exactly once no matter how the sheet closes (Confirm, Cancel, backdrop tap, or Escape) — always reuse it for destructive-action confirmation rather than wiring up ad-hoc confirm logic.

`stepper.js` is the shared −/+ numeric input used everywhere (reps, weight, sets, rest seconds): live keystroke filtering plus min/max clamping. `sfx.js` owns one shared `AudioContext` (unlocked on first tap, since iOS blocks audio before a user gesture) for all sound effects — reuse it rather than creating a second context.

### Units convention

Weight is **always stored in kg** in the database. Conversion to/from the user's chosen display unit (`units.js`: `toDisplay`/`fromDisplay`, `kg`↔`lb`) happens only at the display/input boundary. Never persist a `lb` value.

### PWA / offline layer

`sw.js` is the single root service worker for all of Life (cache name `life-<version>`), versioned and cache-first. `CACHE_VERSION` **must be bumped whenever any file in `APP_SHELL` changes** (including adding a new `gym/js/*.js` or `life/*` file to that list) — otherwise the service worker keeps serving the previous cached version indefinitely, both to yourself in local testing and to real installs after a deploy. Precaching fetches each `APP_SHELL` file independently (not `cache.addAll`, which is all-or-nothing and one flaky fetch fails the entire precache) — a single miss during install still lets the rest cache normally.

`manifest.webmanifest` and the icons in `icons/` support "Add to Home Screen" on iOS. Media (exercise demo photos/clips) is excluded from the JSON export/import backup in `settings.js` — blobs can run into the hundreds of megabytes.
