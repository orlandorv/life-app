/**
 * Reading a web address the way people type it. Pure, so it's checked in Node;
 * shared by the sections that keep links (Wishlist, Books).
 */

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
