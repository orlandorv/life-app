import { dayTotals } from './totals.js';

/**
 * Saved meals: a combination of foods you eat together ("usual breakfast"),
 * kept so that logging it is one tap. Pure (no DOM, no storage), so what a saved
 * meal holds and what logging one produces is checked in Node.
 *
 * A saved meal is `{ id, name, items, createdAt, lastUsedAt? }`. Its `items` are
 * snapshots of diary entries (name, brand, portion, and the calories and macros
 * *as they were*), the same way a diary entry is a snapshot of a food: editing or
 * deleting the food later never rewrites a meal, and logging one needs no food
 * lookup, so it works offline and for foods since removed.
 */

export const MAX_NAME = 40;

/** A diary entry without what belongs to *that* time and place: its id, day, meal and when it was logged. */
export function snapshotOf(entry) {
    const { id, day, meal, loggedAt, ...item } = entry;
    return item;
}

const cleanName = (name) => (typeof name === 'string' ? name.trim().slice(0, MAX_NAME) : '');

/** The same name, ignoring case and surrounding space: saving "Usual breakfast" twice is one meal. */
export const sameName = (a, b) => cleanName(a).toLowerCase() === cleanName(b).toLowerCase();

/**
 * The saved meal made from some diary entries, or null when there's nothing to
 * save (no entries, or no name). `existing` is the meal of the same name if
 * there is one, which this replaces: its id and creation date are kept.
 */
export function mealFromEntries({ name, entries, existing = null, id, now = new Date().toISOString() }) {
    const title = cleanName(name);
    if (!title || !entries.length) return null;
    return {
        id: existing?.id ?? id,
        name: title,
        items: entries.map(snapshotOf),
        createdAt: existing?.createdAt ?? now,
        ...(existing?.lastUsedAt ? { lastUsedAt: existing.lastUsedAt } : {}),
    };
}

/**
 * The diary entries that logging a saved meal adds: fresh ids, on `day`, in
 * `meal`. The diary lists a meal by when each food was logged, so they are
 * stamped a millisecond apart, which keeps them in the order they were saved in.
 */
export function entriesFromMeal(saved, { day, meal, now = new Date().toISOString(), newId }) {
    const start = Date.parse(now);
    return saved.items.map((item, index) => ({ ...item, id: newId(), day, meal, loggedAt: new Date(start + index).toISOString() }));
}

/** What a saved meal adds up to, for the row that lists it. */
export function mealSummary(saved) {
    const { kcal, proteinG } = dayTotals(saved.items);
    return { foods: saved.items.length, kcal, proteinG };
}

/** Most recently used first (a meal never used counts from when it was saved), then by name. */
export function sortMeals(meals) {
    const when = (meal) => meal.lastUsedAt ?? meal.createdAt ?? '';
    return [...meals].sort((a, b) => when(b).localeCompare(when(a)) || a.name.localeCompare(b.name));
}

/** A well-formed saved meal, for the backup check: a name, at least one named food, and when it was saved. */
export function isValidSavedMeal(row) {
    const text = (value) => typeof value === 'string' && value.length > 0;
    return (
        text(row.id) &&
        text(row.name) &&
        Array.isArray(row.items) &&
        row.items.length > 0 &&
        row.items.every((item) => item !== null && typeof item === 'object' && text(item.name)) &&
        text(row.createdAt) &&
        (row.lastUsedAt === undefined || text(row.lastUsedAt))
    );
}
