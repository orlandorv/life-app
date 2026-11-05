/**
 * Wishlist maths: reading a price and a link the way people type them, ordering
 * the list, and adding it up. Pure (no DOM, no storage), so it's unit-testable
 * in Node.
 *
 * An item is `{ id, name, price?, link?, note?, starred?, boughtAt?, createdAt }`.
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
