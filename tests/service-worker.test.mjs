import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/**
 * Runs the real sw.js against a small fake of the worker environment, so what
 * install, activate and fetch do is checked rather than assumed. The fake has an
 * in-memory Cache Storage and a scriptable network.
 */

const SOURCE = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

// Cache Storage keys by absolute URL, resolving a relative one against the
// worker's own address — which is how './index.html' and the page's request for
// https://host/repo/index.html meet.
const norm = (url) => new URL(String(url), 'https://example.test/sw.js').href;

function makeWorld({ script = {}, caches: existing = {} } = {}) {
    const handlers = {};
    const stores = new Map(
        Object.entries(existing).map(([name, files]) => [name, new Map(Object.entries(files).map(([url, value]) => [norm(url), value]))]),
    );
    const log = { fetches: [], skipWaiting: 0, claimed: 0, inFlight: 0, maxInFlight: 0 };
    const attempts = new Map();

    const cacheApi = {
        open: async (name) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const files = stores.get(name);
            return {
                put: async (url, response) => { files.set(norm(url), response); },
                match: async (url) => files.get(norm(url)),
            };
        },
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
        match: async (request) => {
            const url = norm(typeof request === 'string' ? request : request.url);
            for (const files of stores.values()) if (files.has(url)) return files.get(url);
            return undefined;
        },
    };

    // What the "network" answers for a url on its nth attempt: a status number,
    // 'error' (connection dropped), or undefined for a normal 200.
    const fakeFetch = async (url, options = {}) => {
        log.fetches.push({ url: String(url), options });
        log.inFlight += 1;
        log.maxInFlight = Math.max(log.maxInFlight, log.inFlight);
        await Promise.resolve();
        await Promise.resolve();
        log.inFlight -= 1;
        const n = (attempts.get(String(url)) ?? 0) + 1;
        attempts.set(String(url), n);
        const plan = script[String(url)];
        const outcome = Array.isArray(plan) ? plan[Math.min(n - 1, plan.length - 1)] : plan;
        if (outcome === 'error') throw new TypeError('network down');
        const status = outcome ?? 200;
        return { ok: status >= 200 && status < 300, status, clone() { return this; } };
    };

    const self = {
        addEventListener: (type, fn) => { handlers[type] = fn; },
        location: { origin: 'https://example.test' },
        skipWaiting: async () => { log.skipWaiting += 1; },
        clients: { claim: async () => { log.claimed += 1; } },
    };

    const context = vm.createContext({
        self,
        caches: cacheApi,
        fetch: fakeFetch,
        URL,
        console: { warn() {}, log() {}, error() {} },
        setTimeout: (fn) => { fn(); return 0; },
        Promise,
        Error,
        Array,
        Map,
    });
    vm.runInContext(SOURCE, context);

    const lifecycle = async (type) => {
        const pending = [];
        handlers[type]({ waitUntil: (p) => pending.push(p) });
        return Promise.all(pending);
    };
    return {
        context,
        handlers,
        stores,
        log,
        attempts,
        norm,
        shell: vm.runInContext('APP_SHELL', context),
        name: vm.runInContext('CACHE_NAME', context),
        install: () => lifecycle('install'),
        activate: () => lifecycle('activate'),
    };
}

const installResult = async (world) => {
    try {
        await world.install();
        return 'installed';
    } catch (error) {
        return error.message;
    }
};

test('a version that downloads completely installs, and takes over', async () => {
    const world = makeWorld();
    assert.equal(await installResult(world), 'installed');
    const cached = world.stores.get(world.name);
    assert.equal(cached.size, world.shell.length);
    for (const url of world.shell) assert.ok(cached.has(world.norm(url)), `${url} was not cached`);
    assert.equal(world.log.skipWaiting, 1);
});

test('every file is fetched from the network, never the browser cache', async () => {
    const world = makeWorld();
    await world.install();
    assert.ok(world.log.fetches.length >= world.shell.length);
    for (const { url, options } of world.log.fetches) assert.equal(options.cache, 'no-store', `${url} could come from the HTTP cache`);
});

test('one file that cannot be had fails the whole install and leaves the old version alone', async () => {
    const missing = './life/life.js';
    const world = makeWorld({ script: { [missing]: 404 }, caches: { 'life-old': { './index.html': 'old page' } } });
    const message = await installResult(world);
    assert.match(message, /could not be cached/);
    assert.match(message, /life\/life\.js -> 404/);
    // not half-built, not activated, and the working version is still there
    assert.equal(world.stores.has(world.name), false, 'the partial cache was left behind');
    assert.equal(world.log.skipWaiting, 0);
    assert.equal(world.stores.get('life-old').get(world.norm('./index.html')), 'old page');
});

test('a server hiccup or a dropped connection is retried, and the install still succeeds', async () => {
    const world = makeWorld({ script: { './index.html': [500, 'error', 200], './sw.js': ['error', 200] } });
    assert.equal(await installResult(world), 'installed');
    assert.equal(world.attempts.get('./index.html'), 3);
});

test('a file that keeps failing gives up after three tries', async () => {
    const world = makeWorld({ script: { './index.html': 503 } });
    assert.match(await installResult(world), /index\.html -> 503/);
    assert.equal(world.attempts.get('./index.html'), 3);
});

test('a missing file is not retried: it will not appear', async () => {
    const world = makeWorld({ script: { './life/life.js': 404 } });
    await installResult(world);
    assert.equal(world.attempts.get('./life/life.js'), 1);
});

test('the shell is fetched a few files at a time, not all at once', async () => {
    const world = makeWorld();
    await world.install();
    assert.ok(world.log.maxInFlight > 1, 'no parallelism at all');
    assert.ok(world.log.maxInFlight <= 6, `${world.log.maxInFlight} requests at once`);
});

test('activating drops every other version and takes control of open pages', async () => {
    const world = makeWorld({ caches: { 'life-old': { a: 1 }, 'life-older': { b: 2 } } });
    await world.install();
    await world.activate();
    assert.deepEqual([...world.stores.keys()], [world.name]);
    assert.equal(world.log.claimed, 1);
});

test('the app shell is still served from the cache first, and other sites are left alone', async () => {
    const world = makeWorld();
    await world.install();
    let responded = null;
    const request = (url) => ({ url, method: 'GET' });
    const page = 'https://example.test/index.html';
    const run = (req) => {
        responded = null;
        world.handlers.fetch({ request: req, respondWith: (p) => { responded = p; } });
        return responded;
    };
    assert.ok(run(request(page)), 'a cached file should be answered by the worker');
    assert.equal(run(request('https://world.openfoodfacts.org/api/v2/product/1')), null, 'a request to another site must pass straight through');
    assert.equal(run({ url: page, method: 'POST' }), null, 'only GETs are served');
});
