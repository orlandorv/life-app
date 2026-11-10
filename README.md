# Life

Life is a mobile-first personal app that works offline and installs as a PWA.
It brings daily planning, health, training, media, shopping and wardrobe tools
into one calm home screen. It is a static application built with vanilla
JavaScript ES modules, HTML and CSS: there are no package dependencies, build
steps or remote application servers.

## Run it locally

Life needs to be served over HTTP so ES modules and the service worker behave
like they do in production:

```bash
node server.js
```

Open `http://localhost:8000`. Run the complete test suite with:

```bash
node --test "tests/*.test.mjs"
```

## Repository map

```text
index.html          Static shell and modal markup
life/               Routing, home, database, backup and shared UI
gym/                Training plans, workouts, history and progression
body/               Weight, sleep and steps
habits/             Habits and routines
nutrition/          Food diary and nutrition tools
tasks/              Tasks and calendar export
journal/            Daily check-ins and patterns
inbox/               Notes and ideas
videos/              Watch, movies, television and books
wishlist/            Planned purchases
wardrobe/            Clothing items and outfits
tests/               Node tests and repository invariant checks
tools/               Maintenance scripts
sw.js                Versioned offline application shell
```

Each feature section keeps its screen/controller, store adapter, pure logic and
styles together. Code shared by more than one section belongs in `life/`. Pure
logic stays independent of the DOM and is tested directly in Node.

## Making changes

Read [`CLAUDE.md`](CLAUDE.md) before editing. It is the engineering handbook and
the source of truth for architecture, data migrations, backup validation,
design tokens, testing and service-worker rules. In particular:

1. Keep all browser paths relative so GitHub Pages subpath hosting works.
2. Add a new runtime file to `APP_SHELL` in `sw.js` and bump the cache version.
3. Make database changes additive and keep backup validation in sync.
4. Add Node tests for pure logic and repository invariants.
5. Run the full test suite before committing.

See [`DEPLOY.md`](DEPLOY.md) for the deployment process.
