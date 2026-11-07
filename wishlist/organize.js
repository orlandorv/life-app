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

export { cleanLink, linkHost } from '../life/links.js';

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

import { makeCategories } from '../life/categories.js';

/**
 * The categories offered as one-tap choices, in the order they are listed in. A
 * category is free text, though: type any other name and it becomes a group the
 * first time something is filed under it. These are only the usual ones. (The rules
 * themselves are shared with the Wardrobe: life/categories.js.)
 */
export const PRESET_CATEGORIES = ['Perfumes', 'Clothing', 'Shoes', 'Accessories', 'Tech', 'Home'];

/** What an item with no category is listed under. */
export const NO_CATEGORY = 'Other';

export const MAX_CATEGORY = 30;

const categories = makeCategories({ presets: PRESET_CATEGORIES, noneLabel: NO_CATEGORY, max: MAX_CATEGORY });

export const { canonicalCategory, categoriesInUse, categoryChoices } = categories;

/**
 * Wanted items as groups, one per category: `{ key, label, items, ...totalOf }`. The
 * usual categories come first in their own order, any others after them
 * alphabetically, and items with no category last, as "Other". Items keep the order
 * they came in (`splitItems` has already put top picks first).
 */
export function groupByCategory(items) {
    return categories.groupByCategory(items).map((group) => ({ ...group, ...totalOf(group.items) }));
}
