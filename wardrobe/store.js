import { lifeDb, uid } from '../life/db.js';
import { canonicalCategory, categoriesInUse, cleanItemIds, withoutItem, outfitsWithItem, fromWishlist } from './organize.js';

/**
 * In-memory mirror of the Wardrobe, in the same style as the other stores: no
 * reactivity, so a write is followed by `loadWardrobe()` and a re-render.
 *
 * Three LifeDB stores: `wardrobe` (the items), `wardrobePhotos` (one photo per
 * item, `{ id: itemId, data }` where `data` is a small JPEG data URL — a string, so
 * it round-trips through a JSON backup unchanged and an <img> can show it directly),
 * and `outfits`. Photos are kept apart so listing the items never carries them.
 */
export const state = {
    items: [],
    photos: new Map(),
    outfits: [],
};

export async function loadWardrobe() {
    const [items, photos, outfits] = await Promise.all([lifeDb.getAll('wardrobe'), lifeDb.getAll('wardrobePhotos'), lifeDb.getAll('outfits')]);
    state.items = items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    state.photos = new Map(photos.map((photo) => [photo.id, photo.data]));
    state.outfits = outfits;
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** Optional fields are left off entirely when empty, so a plain item stays plain. */
function withOptional(item, { category, colour, brand, size, price, note }) {
    const next = { ...item };
    for (const field of ['category', 'colour', 'brand', 'size', 'price', 'note']) delete next[field];
    const text = { category: canonicalCategory(category, categoriesInUse(state.items)), colour, brand, size, note };
    for (const [field, value] of Object.entries(text)) if (clean(value)) next[field] = clean(value);
    if (Number.isFinite(price) && price > 0) next.price = price;
    return next;
}

/** Adds an item, with its photo (a data URL) if there is one, in one transaction. */
export async function addItem({ name, photo = null, ...rest }) {
    const item = withOptional({ id: uid(), name: clean(name), createdAt: new Date().toISOString() }, rest);
    const writes = [['wardrobe', item]];
    if (photo) writes.push(['wardrobePhotos', { id: item.id, data: photo }]);
    await lifeDb.putAll(writes);
    state.items.push(item);
    if (photo) state.photos.set(item.id, photo);
    return item;
}

/**
 * Saves an item's changes. `photo` is `undefined` to leave the photo as it is, a data
 * URL to replace it, or `null` to remove it.
 */
export async function updateItem(item, { name, photo, ...rest }) {
    const updated = withOptional({ ...item, name: clean(name) }, rest);
    const writes = [['wardrobe', updated]];
    if (typeof photo === 'string') writes.push(['wardrobePhotos', { id: item.id, data: photo }]);
    await lifeDb.changeAll(writes, photo === null ? [['wardrobePhotos', item.id]] : []);
    state.items = state.items.map((existing) => (existing.id === item.id ? updated : existing));
    if (typeof photo === 'string') state.photos.set(item.id, photo);
    if (photo === null) state.photos.delete(item.id);
    return updated;
}

/** Deletes an item, its photo, and its place in every outfit that held it. */
export async function deleteItem(id) {
    const touched = outfitsWithItem(state.outfits, id).map((outfit) => withoutItem(outfit, id));
    // One transaction: the item, its photo and its place in every outfit go together or not at all.
    await lifeDb.changeAll(touched.map((outfit) => ['outfits', outfit]), [['wardrobe', id], ['wardrobePhotos', id]]);
    state.items = state.items.filter((item) => item.id !== id);
    state.photos.delete(id);
    state.outfits = state.outfits.map((outfit) => touched.find((t) => t.id === outfit.id) ?? outfit);
}

/**
 * Is this wishlist item already in the wardrobe? Its `wardrobeId` says so, and the item
 * it names must still exist (delete it from the wardrobe and the link is free again).
 */
export async function wardrobeItemFor(wish) {
    return wish.wardrobeId ? (await lifeDb.get('wardrobe', wish.wardrobeId)) ?? null : null;
}

/**
 * Makes a wardrobe item from a bought wishlist item and records it on the wishlist item
 * (`wardrobeId`), in one transaction, so it can't be added twice. Returns the new item.
 */
export async function addFromWishlist(wish) {
    const existing = await wardrobeItemFor(wish);
    if (existing) return existing;
    const { name, category, price, note } = fromWishlist(wish);
    const item = withOptional({ id: uid(), name: clean(name), createdAt: new Date().toISOString() }, { category, price, note });
    await lifeDb.changeAll([['wardrobe', item], ['wishlist', { ...wish, wardrobeId: item.id }]]);
    state.items.push(item);
    return item;
}

/** Saves an outfit (a new one when it has no `id`). Only items that exist are kept. */
export async function saveOutfit({ id, name, itemIds, note, createdAt }) {
    const outfit = { id: id ?? uid(), name: clean(name), itemIds: cleanItemIds(itemIds, state.items), createdAt: createdAt ?? new Date().toISOString() };
    if (clean(note)) outfit.note = clean(note);
    await lifeDb.put('outfits', outfit);
    state.outfits = [...state.outfits.filter((existing) => existing.id !== outfit.id), outfit];
    return outfit;
}

export async function deleteOutfit(id) {
    await lifeDb.delete('outfits', id);
    state.outfits = state.outfits.filter((outfit) => outfit.id !== id);
}
