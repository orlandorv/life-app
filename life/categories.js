/**
 * Free-text categories with a few usual ones offered — the rules the Wishlist and the
 * Wardrobe share. Pure (no DOM, no storage), so they are checked in Node.
 *
 * A category is whatever you type; a few presets are offered as one-tap choices, and
 * any other name becomes a group the first time something is filed under it. The same
 * name in a different case is one group ("shoes", "Shoes" and "SHOES"), shown as the
 * preset's spelling, else as first written.
 *
 * `makeCategories({ presets, noneLabel, max })` returns the functions bound to one
 * section's presets, so each section keeps its own list and its own heading for the
 * things with no category.
 */

const keyOf = (category) => category.toLowerCase();
const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

export function makeCategories({ presets, noneLabel = 'Other', max = 30 }) {
    const presetKey = (key) => presets.findIndex((preset) => keyOf(preset) === key);

    /**
     * A category as it should be stored. Spacing is tidied; a name that matches a preset
     * takes the preset's spelling, else one already in use, else what was typed with a
     * capital first letter. Blank means none: ''.
     */
    function canonicalCategory(text, existing = []) {
        const typed = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
        if (!typed) return '';
        const match = [...presets, ...existing].find((known) => keyOf(known) === keyOf(typed));
        // A name of your own starts with a capital, so a group heading never reads "books".
        return match ?? typed.charAt(0).toUpperCase() + typed.slice(1);
    }

    /** The categories in use, one spelling each, the oldest item deciding (so a group's label is stable). */
    function categoriesInUse(items) {
        const seen = new Map();
        for (const item of [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
            const category = canonicalCategory(item.category);
            if (category && !seen.has(keyOf(category))) seen.set(keyOf(category), category);
        }
        return [...seen.values()];
    }

    /** What to offer as one-tap choices: the presets, then any other category in use, alphabetically. */
    function categoryChoices(items) {
        const extra = categoriesInUse(items)
            .filter((category) => presetKey(keyOf(category)) === -1)
            .sort(byName);
        return [...presets, ...extra];
    }

    /**
     * Items as groups, one per category: `{ key, label, items }`. The presets come first in
     * their own order, other categories after them alphabetically, and items with none last
     * under `noneLabel`. Items keep the order they came in.
     */
    function groupByCategory(items) {
        const labels = new Map(categoriesInUse(items).map((category) => [keyOf(category), category]));
        const groups = new Map();
        for (const item of items) {
            const category = canonicalCategory(item.category);
            const key = category ? keyOf(category) : '';
            if (!groups.has(key)) groups.set(key, { key, label: key ? labels.get(key) : noneLabel, items: [] });
            groups.get(key).items.push(item);
        }

        const rank = (group) => (group.key === '' ? 2 : presetKey(group.key) !== -1 ? 0 : 1);
        return [...groups.values()].sort(
            (a, b) => rank(a) - rank(b) || (rank(a) === 0 ? presetKey(a.key) - presetKey(b.key) : byName(a.label, b.label)),
        );
    }

    return { presets, noneLabel, max, canonicalCategory, categoriesInUse, categoryChoices, groupByCategory };
}
