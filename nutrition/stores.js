/**
 * The UK supermarkets the food search knows about. Pure, so it can be checked
 * in Node.
 *
 * `tag` is how Open Food Facts names the store in its `stores` filter; `match`
 * recognises the store in the free text that field holds, which is a
 * comma-separated list typed in by contributors ("Tesco, sainsburys",
 * "Marks & Spencer's, m&s") and often includes shops abroad.
 */
export const STORES = [
    { id: 'tesco', label: 'Tesco', tag: 'tesco', match: /\btesco\b/i },
    { id: 'aldi', label: 'Aldi', tag: 'aldi', match: /\baldi\b/i },
    { id: 'lidl', label: 'Lidl', tag: 'lidl', match: /\blidl\b/i },
    { id: 'sainsburys', label: 'Sainsbury’s', tag: 'sainsbury-s', match: /sainsbury/i },
    { id: 'asda', label: 'Asda', tag: 'asda', match: /\basda\b/i },
    { id: 'morrisons', label: 'Morrisons', tag: 'morrisons', match: /morrison/i },
    { id: 'ms', label: 'M&S', tag: 'marks-spencer', match: /marks\s*(?:&|and)?\s*spencer|(?:^|[^a-z])m\s?&\s?s(?:[^a-z]|$)/i },
    { id: 'waitrose', label: 'Waitrose', tag: 'waitrose', match: /waitrose/i },
    { id: 'coop', label: 'Co-op', tag: 'co-op', match: /\bco-?op(?:erative)?\b/i },
    { id: 'iceland', label: 'Iceland', tag: 'iceland', match: /\biceland\b/i },
];

export function storeById(id) {
    return STORES.find((store) => store.id === id) ?? null;
}

/**
 * The first UK supermarket named in an Open Food Facts `stores` string, as its
 * label, or null. Anything else in the list (foreign chains, markets) is
 * ignored rather than shown as if it were where you'd buy it.
 */
export function storeFromOff(text) {
    if (typeof text !== 'string') return null;
    for (const part of text.split(',')) {
        const store = STORES.find((candidate) => candidate.match.test(part));
        if (store) return store.label;
    }
    return null;
}

/** A food's brand and store as one short label, without saying the same thing twice ("Lidl" brand at Lidl). */
export function sourceLabel(brand, store) {
    const parts = [brand, store].filter((part) => typeof part === 'string' && part.trim()).map((part) => part.trim());
    if (parts.length === 2 && parts[0].toLowerCase().includes(parts[1].toLowerCase())) return parts[0];
    return parts.join(' · ');
}
