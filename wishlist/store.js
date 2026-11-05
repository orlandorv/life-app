import { lifeDb, uid } from '../life/db.js';
import { canonicalCategory, categoriesInUse } from './organize.js';

/**
 * In-memory mirror of the Wishlist, same style as the other sections' stores.
 * Optional fields are left off entirely when empty, so a plain item stays plain.
 */
export const state = {
    items: [],
};

export async function loadItems() {
    state.items = await lifeDb.getAll('wishlist');
}

/** `price` is a number or null, `category` already canonical or '', `link` an already-cleaned address or ''. */
function withOptional(item, { price, category, link, note, starred }) {
    const next = { ...item };
    delete next.price;
    delete next.category;
    delete next.link;
    delete next.note;
    delete next.starred;
    if (Number.isFinite(price) && price > 0) next.price = price;
    if (category) next.category = category;
    if (link) next.link = link;
    if (note?.trim()) next.note = note.trim();
    if (starred) next.starred = true;
    return next;
}

export async function addItem({ name, price = null, category = '', link = '', note = '', starred = false }) {
    const item = withOptional({ id: uid(), name: name.trim(), createdAt: new Date().toISOString() }, { price, category: canonicalCategory(category, categoriesInUse(state.items)), link, note, starred });
    await lifeDb.put('wishlist', item);
    state.items.push(item);
    return item;
}

export async function updateItem(item, { name, price, category, link, note, starred }) {
    const updated = withOptional({ ...item, name: name.trim() }, { price, category: canonicalCategory(category, categoriesInUse(state.items)), link, note, starred });
    await lifeDb.put('wishlist', updated);
    state.items = state.items.map((existing) => (existing.id === item.id ? updated : existing));
    return updated;
}

/** Marks an item bought now, or puts it back on the list. */
export async function setBought(item, bought) {
    const updated = { ...item };
    if (bought) updated.boughtAt = new Date().toISOString();
    else delete updated.boughtAt;
    await lifeDb.put('wishlist', updated);
    state.items = state.items.map((existing) => (existing.id === item.id ? updated : existing));
    return updated;
}

export async function deleteItem(id) {
    await lifeDb.delete('wishlist', id);
    state.items = state.items.filter((item) => item.id !== id);
}
