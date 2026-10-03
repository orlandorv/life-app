import { fromOpenFoodFacts } from './portions.js';

/**
 * Open Food Facts: a free, open food database (no account or key). Searching
 * uses the UK site so results favour products sold here, and can be narrowed to
 * one supermarket; barcode lookups use
 * the world database, which holds every product. Both need a connection —
 * foods you log are saved locally, so they still work offline afterwards.
 *
 * What's sent is only the search text or barcode; nothing about you.
 */

const SEARCH_URL = 'https://uk.openfoodfacts.org/cgi/search.pl';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'code,product_name,brands,stores,nutriments,serving_size,serving_quantity,quantity';
// Pauses before each further attempt; five tries in all.
const RETRY_DELAYS_MS = [400, 800, 1200, 1800];
const CACHE_LIMIT = 60;
const TIMEOUT_MS = 10000;

export class OfflineError extends Error {
    constructor() {
        super('You’re offline. Your saved foods still work.');
        this.name = 'OfflineError';
    }
}

/** fetch → JSON once, with a timeout, honouring an outside AbortSignal (a newer search replacing this one). */
async function getJsonOnce(url, signal) {
    if (!navigator.onLine) throw new OfflineError();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const forward = () => controller.abort();
    signal?.addEventListener('abort', forward);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            const error = new Error(`Open Food Facts answered ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return await response.json();
    } catch (error) {
        if (signal?.aborted) throw error;
        if (error.name === 'AbortError') throw new Error('Open Food Facts took too long to answer.');
        if (!navigator.onLine) throw new OfflineError();
        throw error;
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forward);
    }
}

/**
 * Open Food Facts is a volunteer-run service that, under load, turns a share of
 * requests away — roughly one in two in testing — with a 503 "temporarily
 * unavailable" page. That page carries no CORS headers, so a browser doesn't
 * report a 503: it reports a bare network failure (a TypeError), which looks
 * exactly like a dropped connection. The very next request is usually fine, so
 * both are retried with a short back-off before being reported. Being offline,
 * a timeout, or a newer search replacing this one are not retried.
 */
const isTransient = (error) => error.status >= 500 || error instanceof TypeError;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getJson(url, signal) {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await getJsonOnce(url, signal);
        } catch (error) {
            const last = attempt >= RETRY_DELAYS_MS.length;
            if (last || signal?.aborted || error instanceof OfflineError || !isTransient(error)) throw error;
            await pause(RETRY_DELAYS_MS[attempt]);
            if (signal?.aborted) throw error;
        }
    }
}

/**
 * Foods matching `query`, most-scanned first, skipping products with no name
 * or calories. With a `store` (an entry of `STORES`) only products sold there
 * come back, and each is labelled with it — the filter already says so, and
 * the product's own list of shops can name several.
 */
// Searches already answered this session, so going back to one (or toggling a
// shop chip off and on) doesn't spend another round of a service that turns
// away about half of what it's asked. Not kept across launches: stock changes.
const cache = new Map();

export async function searchFoods(query, { signal, store = null } = {}) {
    const key = `${store?.id ?? ''}|${query.trim().toLowerCase()}`;
    if (cache.has(key)) return cache.get(key);

    const params = new URLSearchParams({
        search_terms: query,
        search_simple: '1',
        action: 'process',
        json: '1',
        page_size: '25',
        sort_by: 'unique_scans_n',
        fields: FIELDS,
    });
    if (store) {
        params.set('tagtype_0', 'stores');
        params.set('tag_contains_0', 'contains');
        params.set('tag_0', store.tag);
    }
    const data = await getJson(`${SEARCH_URL}?${params}`, signal);

    const seen = new Set();
    const foods = (data.products ?? [])
        .map(fromOpenFoodFacts)
        .filter((food) => food && !seen.has(food.id) && seen.add(food.id))
        .map((food) => (store ? { ...food, store: store.label } : food));

    cache.set(key, foods);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return foods;
}

/**
 * The food for a barcode, or null if Open Food Facts doesn't know it (or knows
 * it without calories). A 12-digit UPC is also tried as its 13-digit EAN form.
 */
export async function lookupBarcode(code) {
    const clean = String(code).replace(/\D/g, '');
    const candidates = clean.length === 12 ? [clean, `0${clean}`] : [clean];

    for (const candidate of candidates) {
        const data = await getJson(`${PRODUCT_URL}${candidate}.json?fields=${FIELDS}`);
        if (data.status === 1 && data.product) {
            const food = fromOpenFoodFacts({ ...data.product, code: data.product.code || candidate });
            if (food) return food;
        }
    }
    return null;
}
