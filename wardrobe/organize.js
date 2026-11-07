import { makeCategories } from '../life/categories.js';
import { totalOf } from '../wishlist/organize.js';

/**
 * Wardrobe maths: categories, search, photo sizing, and what an outfit is made of.
 * Pure (no DOM, no storage), so it is unit-testable in Node.
 *
 * An item is `{ id, name, createdAt, category?, colour?, brand?, size?, price?, note? }`
 * (its photo is kept apart, see store.js); an outfit is `{ id, name, itemIds, note?,
 * createdAt }`. Optional fields are left off when empty. An outfit is a list of item
 * ids, so editing an item changes it everywhere it appears, and an item that has been
 * deleted simply drops out of the outfits that held it.
 */

/** The categories offered as one-tap choices; any other name you type becomes a group too. */
export const PRESET_CATEGORIES = ['Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories', 'Fragrances'];
export const NO_CATEGORY = 'Other';
export const MAX_CATEGORY = 30;

const categories = makeCategories({ presets: PRESET_CATEGORIES, noneLabel: NO_CATEGORY, max: MAX_CATEGORY });
export const { canonicalCategory, categoriesInUse, categoryChoices, groupByCategory } = categories;

// --- Sections ----------------------------------------------------------------------

/**
 * The areas the wardrobe is browsed in. Each lists the category names that belong to it,
 * in the order they are shown inside it (lower case; a few usual synonyms are included).
 * A category is still your own free text: "Polos" stays "Polos", it is simply *shown* under
 * Tops. A category that is in none of these gets a section of its own, and items with no
 * category end up under "Other".
 */
export const SECTIONS = [
    { label: 'Outerwear', members: ['outerwear', 'jackets', 'jacket', 'coats', 'coat'] },
    { label: 'Tops', members: ['shirts', 'shirt', 'polos', 'polo', 't-shirts', 't-shirt', 'tees', 'hoodies & jumpers', 'hoodies', 'jumpers', 'sweaters', 'knitwear', 'jerseys', 'tops'] },
    { label: 'Bottoms', members: ['jeans', 'trousers', 'chinos', 'cargos', 'joggers', 'shorts', 'bottoms'] },
    { label: 'Shoes', members: ['shoes', 'trainers', 'sneakers', 'boots', 'sandals', 'slides', 'footwear'] },
    { label: 'Accessories', members: ['caps', 'hats', 'watches', 'jewellery', 'jewelry', 'bags', 'belts', 'accessories'] },
    { label: 'Fragrances', members: ['fragrances', 'fragrance', 'cologne', 'colognes', 'perfumes', 'perfume'] },
];

const sectionIndex = (key) => SECTIONS.findIndex((section) => section.label.toLowerCase() === key || section.members.includes(key));

/**
 * Items as sections to browse: `{ key, label, items, groups: [{ key, label, items }] }`. The
 * sections are the areas above in their order, then any category of your own, then items with
 * no category last under "Other". Inside a section the categories keep the order listed above
 * (others after, alphabetically); a section with only one category has just that one group, and
 * where a category is the section's own name beside others it reads "Other". Items keep the
 * order they came in.
 */
export function groupBySection(items) {
    const sections = new Map();
    for (const group of groupByCategory(items)) {
        const at = group.key ? sectionIndex(group.key) : -1;
        const section = at === -1 ? { key: group.key || '', label: group.label } : { key: SECTIONS[at].label.toLowerCase(), label: SECTIONS[at].label };
        if (!sections.has(section.key)) sections.set(section.key, { ...section, rank: at === -1 ? (group.key ? SECTIONS.length : SECTIONS.length + 1) : at, items: [], groups: [] });
        const into = sections.get(section.key);
        // A category that is the section's own name ("Tops" in Tops) is the catch-all: it goes last.
        const order = at === -1 ? 0 : group.key === section.key ? 1000 : SECTIONS[at].members.indexOf(group.key);
        into.groups.push({ key: group.key, label: group.label, items: group.items, order });
    }
    return [...sections.values()]
        .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
        .map(({ rank, groups, ...section }) => {
            const ordered = [...groups].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
            const sectionItems = ordered.flatMap((group) => group.items);
            return {
                ...section,
                items: sectionItems,
                groups: ordered.map(({ order, ...group }) => ({ ...group, label: ordered.length > 1 && group.key === section.key ? 'Other' : group.label })),
            };
        });
}

// --- Search ---------------------------------------------------------------------------

/** Does the item match every word of `query` in its name, brand, colour, category or note (case-insensitive)? A blank query matches everything. */
export function matches(item, query) {
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const text = [item.name, item.brand, item.colour, item.category, item.note].filter(Boolean).join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
}

// --- Photos ---------------------------------------------------------------------------

/** The longest edge a stored photo has: big enough to see a texture, small enough to keep a hundred of them. */
export const PHOTO_MAX_EDGE = 720;
export const PHOTO_QUALITY = 0.72;
/** The most a stored photo's data may be (a data URL, in characters); a backup refuses anything past it. */
export const MAX_PHOTO_CHARS = 600_000;

/**
 * The size a photo of `width` × `height` is drawn at: its longest edge brought down to
 * `max`, the shape kept, and never scaled up. Whole pixels, at least one each way.
 */
export function fitWithin(width, height, max = PHOTO_MAX_EDGE) {
    if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
    const scale = Math.min(1, max / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Is this a stored photo: a JPEG or PNG data URL of a sensible size? */
export const isPhotoData = (data) => typeof data === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(data) && data.length <= MAX_PHOTO_CHARS;

// --- Outfits --------------------------------------------------------------------------

/** The items of an outfit, in the order they were put in it, leaving out any that no longer exist. */
export function outfitItems(outfit, items) {
    const byId = new Map(items.map((item) => [item.id, item]));
    return (outfit.itemIds ?? []).map((id) => byId.get(id)).filter(Boolean);
}

/** The outfits that contain an item. */
export const outfitsWithItem = (outfits, itemId) => outfits.filter((outfit) => (outfit.itemIds ?? []).includes(itemId));

/** An outfit with an item taken out of it (the same object if it wasn't in it). */
export function withoutItem(outfit, itemId) {
    if (!(outfit.itemIds ?? []).includes(itemId)) return outfit;
    return { ...outfit, itemIds: outfit.itemIds.filter((id) => id !== itemId) };
}

/** A chosen list of item ids, tidied: no repeats, no ids that aren't items, order kept. */
export function cleanItemIds(ids, items) {
    const known = new Set(items.map((item) => item.id));
    const seen = new Set();
    return (ids ?? []).filter((id) => known.has(id) && !seen.has(id) && seen.add(id));
}

/** Newest outfits first, then by name. */
export const sortOutfits = (outfits) => [...outfits].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));

// --- From the Wishlist ----------------------------------------------------------------

/** The wardrobe category a wishlist category becomes. Clothing could be anything, so it's left for you to choose. */
const FROM_WISHLIST = { perfumes: 'Fragrances', shoes: 'Shoes', accessories: 'Accessories' };

/** What a bought wishlist item becomes in the wardrobe: its name, price, a matching category if there is one, and its note. */
export function fromWishlist(wish) {
    return {
        name: wish.name,
        category: FROM_WISHLIST[String(wish.category ?? '').trim().toLowerCase()] ?? '',
        price: wish.price ?? null,
        note: wish.note ?? '',
    };
}

/** Which wishlist categories are about things you wear (so the wishlist offers "Add to wardrobe" for them). */
export const isWearable = (category) => ['perfumes', 'clothing', 'shoes', 'accessories'].includes(String(category ?? '').trim().toLowerCase());

/** What the wardrobe is worth at what you paid, over the items that have a price: `{ total, priced, count }`. */
export const worth = (items) => totalOf(items);
