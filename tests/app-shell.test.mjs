import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The offline copy of the app (sw.js `APP_SHELL`) must list every file the app
 * actually loads. A file missing from it still works while online, then breaks
 * offline, and the only symptom is on a real phone. These tests are the guard
 * for the most common mistake here: adding a file and forgetting to register it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// Loaded on demand and deliberately not precached (size); see CLAUDE.md.
const LAZY = ['vendor/zxing/zxing.min.js'];
const SECTION_DIRS = ['life', 'gym', 'nutrition', 'habits', 'body', 'videos', 'tasks', 'journal', 'inbox'];

const sw = read('sw.js');
const shellBlock = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
const entries = [...shellBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const asPath = (entry) => (entry === './' ? 'index.html' : normalize(entry));
const shell = new Set(entries.map(asPath));

function walk(dir) {
    return readdirSync(join(ROOT, dir)).flatMap((name) => {
        const path = join(dir, name);
        return statSync(join(ROOT, path)).isDirectory() ? walk(path) : [path];
    });
}

test('the shell list is well-formed and every entry exists on disk', () => {
    assert.ok(entries.length > 50, `only ${entries.length} entries parsed`);
    assert.equal(new Set(entries).size, entries.length, 'duplicate entries in APP_SHELL');
    for (const entry of entries) {
        assert.ok(entry === './' || entry.startsWith('./'), `${entry} must be relative (GitHub Pages serves from a sub-path)`);
        assert.ok(existsSync(join(ROOT, asPath(entry))), `${entry} is listed but missing`);
    }
});

test('CACHE_VERSION looks like v<number>', () => {
    assert.match(sw, /const CACHE_VERSION = 'v\d+';/);
});

test('every .js and .css file in a section folder is in the shell', () => {
    const missing = SECTION_DIRS.flatMap(walk)
        .filter((path) => /\.(js|css)$/.test(path))
        .filter((path) => !shell.has(path) && !LAZY.includes(path));
    assert.deepEqual(missing, [], `register these in sw.js APP_SHELL (and bump CACHE_VERSION): ${missing.join(', ')}`);
});

test('every local file index.html loads is in the shell', () => {
    const html = read('index.html');
    const refs = [...html.matchAll(/\b(?:href|src)="([^"#]+)"/g)]
        .map((m) => m[1])
        .filter((ref) => !/^(https?:|data:|mailto:|tel:)/.test(ref) && !ref.startsWith('#'));
    const missing = [...new Set(refs)].filter((ref) => !shell.has(normalize(ref)) && !LAZY.includes(ref));
    assert.deepEqual(missing, [], `index.html loads these but the shell doesn't list them: ${missing.join(', ')}`);
});

test('every static import between shell modules resolves to a shell file', () => {
    const problems = [];
    let checked = 0;
    for (const path of shell) {
        if (!path.endsWith('.js')) continue;
        const source = read(path);
        const specs = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"\n]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)].map((m) => m[1]);
        for (const spec of specs) {
            checked += 1;
            const target = normalize(relative(ROOT, resolve(ROOT, dirname(path), spec)));
            if (!existsSync(join(ROOT, target))) problems.push(`${path} imports ${spec}, which doesn't exist`);
            else if (!shell.has(target)) problems.push(`${path} imports ${spec}, which isn't in the shell`);
        }
    }
    assert.deepEqual(problems, []);
    // Guards the check itself: a pattern that matched nothing would pass vacuously.
    assert.ok(checked > 150, `only ${checked} imports were examined — has the import pattern stopped matching?`);
});

test('lazy files exist and stay out of the shell on purpose', () => {
    for (const path of LAZY) {
        assert.ok(existsSync(join(ROOT, path)), `${path} is missing`);
        assert.ok(!shell.has(path), `${path} is meant to load on demand, not precache`);
    }
});
