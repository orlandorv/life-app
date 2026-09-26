import { lifeDb, uid } from '../life/db.js';

/**
 * In-memory mirror of what the Nutrition screen shows, in the same style as
 * gym/js/store.js: no reactivity, so after any write the caller reloads the
 * day and re-renders.
 */

// The plan's protein target is 150–170 g; start in the middle of it. It has
// no calorie figure, so that starts unset rather than guessed.
export const DEFAULT_TARGETS = { kcal: null, proteinG: 160 };

export const state = {
    day: null,
    entries: [],
    foods: [],
    targets: { ...DEFAULT_TARGETS },
};

export async function loadDay(day) {
    state.day = day;
    const entries = await lifeDb.byIndex('nutritionEntries', 'day', day);
    state.entries = entries.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

/** Most-used first, so the foods you actually eat sit at the top. */
export async function loadFoods() {
    const foods = await lifeDb.getAll('foods');
    state.foods = foods.sort((a, b) => b.uses - a.uses || b.lastUsedAt.localeCompare(a.lastUsedAt));
}

export async function loadTargets() {
    const stored = await lifeDb.getSetting('nutritionTargets', null);
    state.targets = { ...DEFAULT_TARGETS, ...stored };
}

export async function saveTargets(targets) {
    await lifeDb.saveSetting('nutritionTargets', targets);
    state.targets = { ...DEFAULT_TARGETS, ...targets };
}

const clean = (value) => Math.max(0, Math.round(Number(value) || 0));

// --- Entries -------------------------------------------------------------

export async function addEntry({ name, kcal, proteinG }, day = state.day) {
    const entry = {
        id: uid(),
        day,
        name: name.trim(),
        kcal: clean(kcal),
        proteinG: clean(proteinG),
        loggedAt: new Date().toISOString(),
    };
    await lifeDb.put('nutritionEntries', entry);
    return entry;
}

export async function updateEntry(entry, { name, kcal, proteinG }) {
    await lifeDb.put('nutritionEntries', {
        ...entry,
        name: name.trim(),
        kcal: clean(kcal),
        proteinG: clean(proteinG),
    });
}

export function deleteEntry(id) {
    return lifeDb.delete('nutritionEntries', id);
}

// --- Saved foods ---------------------------------------------------------

/**
 * Remembers a food. The same name (ignoring case) updates the existing one
 * rather than piling up near-duplicates, so re-saving "Greek yoghurt" with
 * new numbers corrects it.
 */
export async function saveFood({ name, kcal, proteinG }) {
    const trimmed = name.trim();
    const existing = state.foods.find((food) => food.name.toLowerCase() === trimmed.toLowerCase());

    const food = {
        id: existing?.id ?? uid(),
        name: trimmed,
        kcal: clean(kcal),
        proteinG: clean(proteinG),
        uses: existing?.uses ?? 0,
        lastUsedAt: existing?.lastUsedAt ?? new Date().toISOString(),
    };
    await lifeDb.put('foods', food);
    return food;
}

/** Logs one serving of a saved food and counts the use, which drives the ordering. */
export async function logFood(food, day = state.day) {
    await addEntry(food, day);
    await lifeDb.put('foods', { ...food, uses: food.uses + 1, lastUsedAt: new Date().toISOString() });
}

export function deleteFood(id) {
    return lifeDb.delete('foods', id);
}
