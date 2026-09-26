import { fromOpenFoodFacts } from './portions.js';

/**
 * Open Food Facts: a free, open food database (no account or key). Searching
 * uses the UK site so results favour products sold here; barcode lookups use
 * the world database, which holds every product. Both need a connection —
 * foods you log are saved locally, so they still work offline afterwards.
 *
 * What's sent is only the search text or barcode; nothing about you.
 */

const SEARCH_URL = 'https://uk.openfoodfacts.org/cgi/search.pl';
const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/';
const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity,quantity';
const TIMEOUT_MS = 10000;

export class OfflineError extends Error {
    constructor() {
        super('You’re offline. Your saved foods still work.');
        this.name = 'OfflineError';
    }
}

/** fetch → JSON with a timeout, honouring an outside AbortSignal (a newer search replacing this one). */
async function getJson(url, signal) {
    if (!navigator.onLine) throw new OfflineError();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const forward = () => controller.abort();
    signal?.addEventListener('abort', forward);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Open Food Facts answered ${response.status}`);
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

/** Foods matching `query`, most-scanned first, skipping products with no name or calories. */
export async function searchFoods(query, { signal } = {}) {
    const params = new URLSearchParams({
        search_terms: query,
        search_simple: '1',
        action: 'process',
        json: '1',
        page_size: '25',
        sort_by: 'unique_scans_n',
        fields: FIELDS,
    });
    const data = await getJson(`${SEARCH_URL}?${params}`, signal);

    const seen = new Set();
    return (data.products ?? [])
        .map(fromOpenFoodFacts)
        .filter((food) => food && !seen.has(food.id) && seen.add(food.id));
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
