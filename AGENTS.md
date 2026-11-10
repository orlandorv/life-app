# AGENTS.md

Read `CLAUDE.md` in full before changing this repository. It is the canonical
source for Life's architecture, conventions, data model, testing requirements,
deployment rules, and feature-specific decisions. Do not duplicate those rules
here; update `CLAUDE.md` when the architecture changes.

## Working agreement

- Work from the current Git checkout; do not rely on the name of its parent
  directory.
- Run `git status --short` before editing and preserve unrelated user changes.
- Keep the app zero-dependency: vanilla JavaScript ES modules, static HTML and
  CSS, relative asset paths, and no build step.
- Keep pure logic outside DOM modules and cover it with Node tests.
- Put shared design tokens in `life/life.css`; do not introduce section-local
  colour tokens or emoji UI.
- Add every new runtime file to `APP_SHELL` in `sw.js` and bump
  `CACHE_VERSION` whenever an app-shell file changes.
- Make LifeDB migrations additive. Add every new store to backup validation and
  include a valid sample row plus damaged-row coverage in the backup tests.
- Run `node --test "tests/*.test.mjs"` before committing.
- Do not commit personal exports, imports, media, or installers.
- Commit and push only when the user asks.

## Repository guide

- `README.md` gives people the short project overview and development path.
- `CLAUDE.md` is the detailed engineering handbook and architectural record.
- `DEPLOY.md` covers GitHub Pages deployment.
- Section folders own their UI, store adapter, pure logic, and stylesheet.
- `life/` owns the shell and genuinely shared primitives.
- `tests/` contains zero-dependency Node tests for pure logic and repository
  invariants.
