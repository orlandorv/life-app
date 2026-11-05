/**
 * Wishlist maths: reading a price and a link the way people type them, ordering
 * the list, and adding it up. Pure (no DOM, no storage), so it's unit-testable
 * in Node.
 *
 * An item is `{ id, name, price?, category?, link?, note?, starred?, boughtAt?, createdAt }`.
 * Optional fields are left off entirely when empty. `price` is a positive number
 * in `CURRENCY`; `boughtAt` (an ISO time) is what makes an item "bought", so
 * there's no separate flag to drift out of step with it.
 */

/** The one currency prices are shown in. Change it here and everything follows. */
export const CURRENCY = 'GBP';

const MAX_PRICE = 10_000_000;

/**
 * A price as typed: `12.99`, `12,99`, `£1,299.50`, `1.299,50`. Blank is `null`
 * (no price, which is fine); something that isn't a price, or isn't above zero, is
 * `NaN` so the form can say so rather than quietly dropping it.
 */
export function parsePrice(text) {
    const cleaned = String(text ?? '').replace(/[^\d.,]/g, '');
    if (!String(text ?? '').trim()) return null;
    if (!cleaned || String(text).includes('-')) return NaN; // no digits, or a negative

    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    let normal;
    if (lastDot !== -1 && lastComma !== -1) {
        // Both appear: whichever comes last is the decimal point, the other groups thousands.
        const decimal = lastDot > lastComma ? '.' : ',';
        const group = decimal === '.' ? ',' : '.';
        normal = cleaned.split(group).join('').replace(decimal, '.');
    } else if (lastComma !== -1) {
        // "12,99" is a decimal comma; "1,299" (three digits after) and "1,299,500" group thousands.
        const single = cleaned.indexOf(',') === lastComma;
        const after = cleaned.length - lastComma - 1;
        normal = single && after !== 3 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
    } else if (cleaned.indexOf('.') !== lastDot) {
        normal = cleaned.replace(/\./g, ''); // "1.299.500": more than one dot can only be grouping
    } else {
        normal = cleaned;
    }

    const value = Number(normal);
    if (!Number.isFinite(value) || value <= 0 || value > MAX_PRICE) return NaN;
    return Math.round(value * 100) / 100;
}

/** `£12.99`, or `£40` for a whole number: pence only when there are some. */
export function formatPrice(value, locale) {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: CURRENCY,
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
}

/**
 * A link as typed, as a web address, or `null` if it isn't one. "shop.example/x"
 * gets `https://`; only http and https are accepted, so a `javascript:` link
 * can never be saved and later opened.
 */
export function cleanLink(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return '';
    const withScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(withScheme);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        if (!url.hostname.includes('.')) return null;
        return url.href;
    } catch {
        return null;
    }
}

/** "amazon.co.uk" for a link, for the row's small print. */
export function linkHost(link) {
    try {
        return new URL(link).hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

export const isBought = (item) => Boolean(item.boughtAt);

/**
 * The list as the screen shows it: what's still wanted (top picks first, then the
 * newest) and what's been bought (most recently first).
 */
export function splitItems(items) {
    const wanted = items
        .filter((item) => !isBought(item))
        .sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)) || b.createdAt.localeCompare(a.createdAt));
    const bought = items.filter(isBought).sort((a, b) => b.boughtAt.localeCompare(a.boughtAt));
    return { wanted, bought };
}

/**
 * What a list of items adds up to: `total` of those with a price, `priced` how
 * many that was, out of `count`. An item with no price adds nothing, and isn't
 * counted as free: the screen says how many are included.
 */
export function totalOf(items) {
    const priced = items.filter((item) => Number.isFinite(item.price) && item.price > 0);
    const cents = priced.reduce((sum, item) => sum + Math.round(item.price * 100), 0);
    return { total: cents / 100, priced: priced.length, count: items.length };
}

// --- Categories -----------------------------------------------------------------------

/**
 * The categories offered as one-tap choices, in the order they are listed in. A
 * category is free text, though: type any other name and it becomes a group the
 * first time something is filed under it. These are only the usual ones.
 */
export const PRESET_CATEGORIES = ['Perfumes', 'Clothing', 'Shoes', 'Accessories', 'Tech', 'Home'];

/** What an item with no category is listed under. */
export const NO_CATEGORY = 'Other';

export const MAX_CATEGORY = 30;

const keyOf = (category) => category.toLowerCase();

/**
 * A category as it should be stored. Spacing is tidied; a name that matches a
 * preset takes the preset's spelling, else one already in use (so "shoes", "Shoes"
 * and "SHOES" are one group), else what was typed with a capital first letter. Blank means none: ''.
 */
export function canonicalCategory(text, existing = []) {
    const typed = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY).trim();
    if (!typed) return '';
    const match = [...PRESET_CATEGORIES, ...existing].find((known) => keyOf(known) === keyOf(typed));
    // A name of your own starts with a capital, so a group heading never reads "books".
    return match ?? typed.charAt(0).toUpperCase() + typed.slice(1);
}

/** The categories in use, one spelling each, oldest item deciding (so a group's label is stable). */
export function categoriesInUse(items) {
    const seen = new Map();
    for (const item of [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        const category = canonicalCategory(item.category);
        if (category && !seen.has(keyOf(category))) seen.set(keyOf(category), category);
    }
    return [...seen.values()];
}

/** What to offer as one-tap choices: the presets, then any other category in use. */
export function categoryChoices(items) {
    const used = categoriesInUse(items);
    const presetKeys = new Set(PRESET_CATEGORIES.map(keyOf));
    const extra = used.filter((category) => !presetKeys.has(keyOf(category))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return [...PRESET_CATEGORIES, ...extra];
}

/**
 * Wanted items as groups, one per category: `{ key, label, items, ...totalOf }`.
 * The usual categories come first in their own order, any others after them
 * alphabetically, and items with no category last, as "Other". Items keep the
 * order they came in (`splitItems` has already put top picks first).
 */
export function groupByCategory(items) {
    const labels = new Map(categoriesInUse(items).map((category) => [keyOf(category), category]));
    const groups = new Map();
    for (const item of items) {
        const category = canonicalCategory(item.category);
        const key = category ? keyOf(category) : '';
        if (!groups.has(key)) groups.set(key, { key, label: key ? labels.get(key) : NO_CATEGORY, items: [] });
        groups.get(key).items.push(item);
    }

    const presetIndex = (key) => PRESET_CATEGORIES.findIndex((preset) => keyOf(preset) === key);
    const rank = (group) => (group.key === '' ? 2 : presetIndex(group.key) !== -1 ? 0 : 1);
    return [...groups.values()]
        .sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? presetIndex(a.key) - presetIndex(b.key) : a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })))
        .map((group) => ({ ...group, ...totalOf(group.items) }));
}
