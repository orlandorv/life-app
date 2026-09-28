# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Life — a mobile-first, offline-capable personal app, installable as a home-screen PWA on iOS via GitHub Pages. Life is the shell (home screen + routing); each area of life is a **section** inside it. Built sections: **Gym** (exercise library, templates, live workout logging, rest timer, history, personal records, XP/levels/badges), **Nutrition** (a MyFitnessPal-style diary: meals, calories remaining, carbs/protein/fat, Open Food Facts search, barcode scanning, portions), **Habits** (recurring habits on every day or chosen weekdays, with streaks, a Today checklist and a Week grid, and backfilling past days), **Body** (daily weight, sleep and steps, with a smoothed weight-trend chart, weekly averages and editable history), **Videos** (a watch-list of helpful videos, grouped into free-text topics rather than a fixed list) and **Tasks** (a due-date to-do list, bucketed by how soon each is due, that can hand a task to the real Calendar app as a `.ics` file). All six home-screen cards are live.

### Layout

- `index.html` — the Life shell: `#life-home` (section grid) and `#gym-section` (all Gym markup: tabs, rest bar, bottom nav). Gym's modals sit after it, at body level.
- `life/life.js` + `life/life.css` — router, home grid, service-worker registration, and the modal chrome shared by every section (close buttons, backdrop tap, Escape, delegated from `document`); `life.css` also holds the shared foundation (reset, `:root` design tokens, body rules).
- `life/dom.js`, `life/stepper.js` — shared UI primitives used by every section (element builder, modal stack, toast, `confirmSheet`, −/+ stepper). Import these, don't copy them.
- `life/db.js` + `life/dates.js` — **LifeDB** (see below) and local-day helpers (`localDayId`, `addDays`, `dayLabel`). Use local days, never `toISOString().slice(0,10)`, which is UTC.
- `life/backup.js` + `life/backup-format.js` — Life-wide backup and restore (see Backup below). `backup-format.js` is pure and unit-testable in Node.
- `life/share.js` — `shareOrDownload(file, title)`: hands a generated file to the Web Share API, falling back to a plain download. Shared by Backup and Tasks' calendar export — both need the same "must start straight from the tap on iOS" handling.
- `life/daybar.js` — the shared ‹ label › day/week switcher (`dayBar()`); its styles, plus `.life-main`, live in `life.css`.
- `body/` — the Body section: `body.js` (screen + entry sheet), `store.js`, `stats.js` (pure trend/weekly-average/chart-geometry/reminder maths, unit-testable in Node), `chart.js` (hand-built SVG), `health-import.js` (pure: parse Apple Health text, plan the save) + `health-sheet.js` (Paste from Health UI and setup guide), `body.css`.
- `habits/` — the Habits section: `habits.js` (Today/Week views + habit sheet), `store.js`, `streaks.js` and `routine.js` (pure schedule/streak and routine-step maths, unit-testable in Node), `routine-sheet.js` (a routine's checklist, also opened from Today), `step-editor.js`, `habits.css`.
- `nutrition/` — the Nutrition section: `nutrition.js` (diary + add-food sheet), `store.js` (state and writes), `portions.js` and `totals.js` (pure food/portion/meal and total maths, unit-testable in Node), `off.js` (Open Food Facts client), `scanner.js` (camera barcode scanning), `nutrition.css`.
- `vendor/zxing/` — ZXing barcode decoder (`@zxing/library` 0.23.0 UMD, Apache-2.0, LICENSE alongside). Vendored because there's no build step; loaded lazily by `nutrition/scanner.js` on first scan and deliberately **not** in `APP_SHELL`.
- `videos/` — the Videos section: `videos.js` (grouped list + add/edit/rename sheets), `store.js`, `organize.js` (pure grouping and YouTube-link parsing, unit-testable in Node), `oembed.js` (best-effort title lookup), `videos.css`.
- `tasks/` — the Tasks section: `tasks.js` (bucketed list + add/edit sheet), `store.js`, `organize.js` (pure due-date bucketing, unit-testable in Node), `ics.js` (pure `.ics` file building, also unit-testable), `tasks.css`.
- `gym/js/*.js` + `gym/gym.css` — the Gym section. Its entry point is `bootGym()` in `gym/js/app.js`.

**Routing** is a hash: `#/` is Today (home), `#/<section>` a section, `#/<section>/<action>` a section opened straight into something (see Today below). `route()` shows the one `#<id>-section` matching the hash, sets `body[data-section]`, and calls that section's optional `enter(action)`. Gym is booted once at startup and only hidden/shown, so an active workout, stopwatch and rest timer keep running while you're on the home screen. Gym's selectors are scoped to `#gym-section` — keep new Gym code from using bare global selectors.

**Adding a section:** add an entry to `SECTIONS` in `life/life.js` (with an `enter` function if it needs to load data), add its container (`<div id="x-section" hidden>`) and any modals as static markup to `index.html`, add its stylesheet `<link>`, and add its files to `APP_SHELL` in `sw.js`. Store its data in LifeDB by adding stores and bumping `DB_VERSION` in `life/db.js`. Life-owned classes are `life-` prefixed; Gym's generic classes (`.btn`, `.modal`, tokens) are reusable as the shared design system.

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

### Design system (`life/life.css`, `life/icons.js`)

Warm and calm: paper background, white cards, ink text, one colour per section. **Change colours as tokens in `life/life.css`, never in a section's CSS.**

- **Tokens:** surfaces `--bg` (paper) / `--bg-raised` (cards) / `--bg-secondary` (wells, tracks); `--text-primary` / `--text-secondary`; section colours `--gym`, `--nutrition`, `--habits`, `--body`; `--card-border` / `--card-shadow` for anything card-like; `--radius` / `--radius-sm`. Dark mode redefines them all under `prefers-color-scheme: dark`.
- **`--primary` follows the section.** `route()` sets `body[data-section]`, which maps `--primary` to that section's colour, so buttons, links, steppers, progress and modals (which sit outside the section container) all take it. On Today it's `--ink`.
- **Text on a coloured fill uses `--on-accent`,** not `#fff`: white in light mode, dark ink in dark mode where the fills are lighter. Every section colour was chosen to keep ≥4.5:1 either way.
- **Type:** `--font-sans` for UI; `--font-display` (New York serif on Apple devices) for page and sheet titles and the greeting; `--font-rounded` for big figures. System fonts only, so it works fully offline.
- **Icons:** `life/icons.js` — 24px line icons, one stroke weight, `currentColor`. Build with `icon(name)`; in static HTML use `<span data-icon="name">`, swapped in by `hydrateIcons()` at start. No emoji in UI chrome.
- **Shared pieces:** `.life-surface` (card), `.life-list` (grouped list with hairlines — rows inside drop their own box), `.life-empty` (icon + title + line), `.life-eyebrow`, `.life-daybar`, `.life-check` (a checkbox with a label, in a row). Gym's `.btn`, `.card`, `.modal*`, `.stepper*`, `.segmented`, `.form-input` in `gym/gym.css` are the shared form controls. A style used by more than one section belongs here, not copied into each — `.life-check` moved here from Nutrition once Videos needed it too.

### Nutrition data (`nutrition/portions.js`, `off.js`, `scanner.js`)

- **Foods** hold nutrition `per100` (per 100 g/ml) and/or per `serving` (`{grams?, kcal, proteinG, carbsG, fatG}`), plus `baseUnit` 'g'|'ml'. Foods saved before portions existed have bare `kcal`/`proteinG` (one serving); `normalizeFood()` reads every shape — always go through it rather than reading fields directly.
- **Entries are snapshots** (`amount`, `unit` 'serving'|'g'|'quick', `meal`, and the computed nutrients), so editing or deleting a food never rewrites history. Old entries without `meal` are filed by `loggedAt` time (`mealOf()`); without `unit` they edit as quick entries.
- **Open Food Facts** (`off.js`): search uses `uk.openfoodfacts.org/cgi/search.pl` (UK-sold products first, sorted by popularity); barcode lookups use `world.openfoodfacts.org/api/v2/product/`. No key; only the search text or barcode is sent. Foods are saved locally the first time they're logged (id `off-<barcode>`), so they work offline after that. `fromOpenFoodFacts()` skips products without a name or calories and converts kJ-only energy.
- **Scanning** decodes cropped camera frames with ZXing, restricted to EAN-13/8 and UPC-A/E. Barcodes are compared as 13 digits (`foodByBarcode`) because an EAN-13 starting with 0 is reported as a 12-digit UPC. Typing the number in the scan sheet is the fallback when the camera is blocked or missing.
- **The service worker only caches same-origin requests.** Open Food Facts calls pass straight through, so results are never stale and the cache can't grow unbounded — keep that guard if you touch the fetch handler.

### Apple Health import (`body/health-import.js`, `health-sheet.js`)

A home-screen web app can't read HealthKit, so a user-built Apple Shortcut ("Life: copy Health") copies the last 7 days as text — `steps YYYY-MM-DD <count>` (grouped by day) and `weight YYYY-MM-DD <value> <unit>` (every weigh-in, oldest first) — and **Paste from Health** in Body reads it with `navigator.clipboard.readText()` (must be called straight from the tap), previews, and saves on confirm. No key, account or server; nothing leaves the phone. The setup steps live in the app (`showHealthSetup()`) since the Shortcut is built on the phone.

- `parseHealthText()` is deliberately forgiving (thousands separators, comma decimals, kg/lb/st, times after the date, junk lines) but rejects implausible numbers, future days, impossible dates, negatives and lines with no number. The last weigh-in of a day wins.
- `planHealthImport()` merges into existing entries: sleep is kept, a 0 step count never wipes a typed number, unchanged days are skipped, and days that change existing values are flagged "updates".
- If the clipboard can't be read (denied, dismissed, unsupported), the sheet falls back to a box you paste into by hand.

### Routines (`habits/routine.js`, `routine-sheet.js`, `step-editor.js`)

A habit may carry optional `note` and `steps: [{id, text, detail?, days?}]`; a habit with steps is a **routine**. A step's `days` (Monday=0…Sunday=6) limits it to certain weekdays; without it the step follows the routine. Pressing a routine opens its checklist instead of ticking it.

- **One rule keeps them consistent:** a routine is done on a day exactly when every step due that day is ticked. `setStepDone()` maintains it tick by tick; `toggleHabit()` (the week grid, Today) ticks or clears all of that day's steps; `updateHabit()` re-checks *today* after an edit. Use `toggleHabit`, not the low-level `toggleDone`, from UI.
- Step ids survive edits, so reordering or rewording steps keeps today's ticks.
- Personal routines are not in the repo (it's public for GitHub Pages): they're imported as a `life-backup` file. `.gitignore` excludes `*-backup-*.json` and `life-routines*.json`.

### Today (`life/home.js`)

The home screen is a live summary of the day, one block per section, each with its most likely next action. It reads through the sections' own stores and maths (`nutrition/store.js`, `habits/streaks.js`, `body/stats.js`, `computeProgress()`), so its numbers always match the sections. Habits can be ticked in place. Buttons deep-link with a route action — `#/gym/workout`, `#/nutrition/log`, `#/body/log`, `#/habits/new` — handled by each section's `enter(action)`; the action is dropped from the URL once used. Today re-renders when the app comes back to the foreground, so it rolls over to a new day.

**Weekly weigh-in reminder:** from Saturday 12:00 until that weekend (Sat or Sun) has a Body weight and a steps entry, Today shows a card linking to `#/body/log` (`weeklyLogReminder()` in `body/stats.js`, pure and tested). A home-screen web app can't schedule notifications without a push server, so the actual phone alert is a repeating calendar event: `life-weekly-weigh-in.ics`, generated locally and git-ignored (`life-*.ics`).

### LifeDB (`life/db.js`)

Storage for every section **except Gym**, which keeps its own `GymTrackerDB` (its data and backups predate Life, so it was deliberately left alone). Stores: `foods`, `nutritionEntries` (index `day`, a local `YYYY-MM-DD`), `settings` (v1, Nutrition); `habits` and `habitLogs` (v2, Habits — a log's id is `habitId|day` and its presence means done; a habit's `days` are Monday=0…Sunday=6); `bodyEntries` (v3, Body — keyPath is the local `day`, so one record per day; any of `weightKg`, `sleepHours`, `steps` may be `null` = not recorded, never a fake 0); `routineTicks` (v4 — `habitId|day` → the step ids ticked that day); `videos` (v5, Videos — free-text `topic`, no separate topics table); `tasks` (v6, Tasks — index `date`; `time` is a local `HH:MM` or `null` for all-day; `calendarSequence` tracks the `.ics` export version). Upgrades are additive (`contains` guards in `onupgradeneeded`), so existing data survives a version bump. A generic get/getAll/byIndex/put/delete wrapper; each section keeps its record shapes and helpers in its own `store.js`. Call `await lifeDb.init()` before use (idempotent).

### Videos (`videos/organize.js`, `store.js`, `oembed.js`)

A watch-list, not a fixed-category browser: a video's `topic` is free text, so a group appears the first time something is filed under it. This is also the section a video ends up in when links arrive over chat rather than typed into the app — sorted into a topic by hand, same as any other addition.

- **Grouping is case-insensitive** (`groupByTopic()`/`existingTopics()` in `organize.js`): "Gym" and "gym" are the same topic, shown under whichever casing was used first. `Uncategorised` (an empty topic) always sorts last. Inside a group, unwatched videos come first (oldest added first — a backlog worked through in order), then watched ones (most recently watched first).
- **Renaming a topic** (`renameTopic()` in `store.js`) updates every video that used it — there's no separate topics table to keep in sync.
- **YouTube links** get a thumbnail (`thumbnailUrl()`, parsed from any common URL shape — watch, `youtu.be`, Shorts, embed) and, when a link is pasted into the add sheet, a best-effort title fetch from YouTube's oEmbed endpoint (`oembed.js`, no key, times out quietly). Neither is load-bearing: a failed lookup just leaves the title for you to type, and a non-YouTube link still saves fine with no thumbnail.
- Tapping a video's title/thumbnail opens the real link in a new tab (`target="_blank" rel="noopener noreferrer"`) — there's no embedded player to keep working offline or in sync with the source.
- **Videos sent over chat** (there's no live connection from here into the person's phone) go into a `life-backup`-shaped file with just `life.videos` set — the same mechanism as `life-routines*.json` — for them to bring in via Backup → Import. `.gitignore` excludes `life-videos*.json` alongside the routines pattern.

### Tasks (`tasks/organize.js`, `store.js`, `ics.js`)

A due-date to-do list — not recurring (that's Habits), and not a browsable library (that's Videos): a task has exactly one date, and once it's `done` when it was due stops mattering.

- **Bucketing** (`groupTasks()` in `organize.js`) is by how soon a not-done task is due — Overdue, Today, Tomorrow, This week (≤7 days out), Later — each sorted soonest-first, timed tasks before an all-day one on the same date. Done tasks are never in a date bucket; they're returned separately, most-recently-completed first, since *when* a finished task was due isn't the point any more.
- **The calendar export is why this section exists.** A home-screen web app has no API to write into Calendar directly. **Calendar isn't a registered Share Sheet target on iOS** (confirmed on a real phone — sharing an `.ics` file offers Mail/Messages/Files, never Calendar), so `addToCalendar()` in `tasks.js` doesn't share it: it opens a `data:text/calendar` URI with `window.open()`, which iOS intercepts as a navigation and shows its own "Add Event" screen for, instead of really navigating there — the same trick behind every "Add to calendar" web button. A `data:` URI, not a `blob:` one: `window.open` can hand the request to Safari in a separate process from this standalone app, and a `blob:` URL, scoped to this page's own memory, wouldn't resolve there. `shareCalendarFile()` (`life/share.js`'s share-or-download) is kept as an explicit secondary "Share the file instead" link in the sheet, for a browser or iOS version where the direct open doesn't behave — Files → tapping the saved `.ics` still reaches Calendar's own add screen, just as a second tap.
- Each task's own id becomes the event's stable UID (`calendarUid()` in `ics.js`), and `calendarSequence` (bumped by whichever export path is used, saved in the task) is the event's SEQUENCE — so exporting again after editing a task updates the same calendar entry instead of creating a duplicate, which is what most calendar apps (Apple's included) do with a repeated UID and a higher SEQUENCE.
- **Timing matters for both export paths**: the `.ics` text and the `window.open()`/`File`+`shareOrDownload()` call must happen with *nothing else awaited first* — the same iOS constraint Backup's export works around (see below) — or Safari treats the call as not user-initiated and silently blocks it. The `calendarSequence` bump is saved to LifeDB only *after* the hand-off, via `recordCalendarExport()`, so an aborted or cancelled attempt doesn't burn a sequence number for nothing.
- DTSTART/DTEND use floating local time (no `Z`, no `TZID`) for a timed task, and `VALUE=DATE` (with an exclusive, next-day DTEND) for an all-day one — the same choice already made for the weekly weigh-in reminder, chosen so a DST change can't shift it.
- A brand-new task's sheet, once saved, **reopens itself in edit mode** for the task just created (rather than closing), so Add to Calendar is available without a second trip back into the list.

### Backup (`life/backup.js`, `life/backup-format.js`)

Opened from the ⚙️ on the Life home. One `life-backup` file wraps the Gym export whole (`gym`, exactly what Gym's own Export writes) plus every LifeDB store (`life`); `lifeDb.exportAll()` / `importAll()` do the Life side. Gym's own Export/Import in its settings still works unchanged, and a bare Gym backup (the pre-Life `gym-tracker-backup` format) is still accepted on import, restoring only Gym.

- **Import merges** (same as Gym's): rows are `put` by key, so a matching ID or day is replaced and nothing is deleted. `inspectBackup()` validates the *whole* file before anything is written — one damaged row rejects it — and `lifeDb.importAll` is a single aborting transaction. Gym and Life are two databases, so the pair isn't atomic; a Gym failure after Life succeeded is reported as such.
- **When you add a LifeDB store,** add it to `LIFE_STORES` (with its key field) and a row check in `ROW_CHECKS` in `backup-format.js`, or it silently won't be backed up. Bump `LIFE_VERSION` only for a change older Life versions can't read.
- `lastBackupAt` is a device setting: it lives in LifeDB `settings` but is excluded from export and import (`DEVICE_SETTINGS`), so restoring an old backup can't make a fresh one look stale.
- **Export** builds the file when the sheet opens (sharing must start straight from the tap on iOS), then hands it to `shareOrDownload()` (`life/share.js`) — the Web Share API where there is one (on iPhone, "Save to Files", AirDrop…), a download otherwise. A cancelled share isn't recorded as a backup.
- The home screen nudges (`needsNudge`) when there's data and no backup for 14+ days, or never.
- After an import, `reloadGym()` (in `gym/js/app.js`) re-reads Gym's data; the other sections reload on every `enter()`.

**Weight unit:** Body follows Gym's global kg/lb setting (`getUnit()` in `gym/js/units.js`, loaded while Gym boots). `life/life.js` starts `bootGym()` before the first route and Body's `enter` waits on it, so loading straight onto `#/body` can't read the unit too early. Weight is stored in kg and converted only at the display/input edge, same as Gym.

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
