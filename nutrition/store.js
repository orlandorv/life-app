import { lifeDb, uid } from '../life/db.js';
import { nutrientsFor, mealOf } from './portions.js';

/**
 * In-memory mirror of what the Nutrition screen shows, in the same style as
 * gym/js/store.js: no reactivity, so after any write the caller reloads the
 * day and re-renders.
 *
 * An entry is a snapshot: `{id, day, meal, name, brand, foodId, amount, unit,
 * kcal, proteinG, carbsG, fatG, loggedAt}`, with `unit` 'serving', 'g' or
 * 'quick' (numbers typed straight in). Entries from before portions existed
 * have no unit or meal and are treated as quick entries filed by time.
 */

// The plan's protein target is 150–170 g; start in the middle of it. It has
// no calorie, carb or fat figure, so those start unset rather than guessed.
export const DEFAULT_TARGETS = { kcal: null, proteinG: 160, carbsG: null, fatG: null };

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

/** Most recently used first — the foods you're likely to want again. */
export async function loadFoods() {
    const foods = await lifeDb.getAll('foods');
    state.foods = foods.sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''));
}

export async function loadTargets() {
    const stored = await lifeDb.getSetting('nutritionTargets', null);
    state.targets = { ...DEFAULT_TARGETS, ...stored };
}

export async function saveTargets(targets) {
    await lifeDb.saveSetting('nutritionTargets', targets);
    state.targets = { ...DEFAULT_TARGETS, ...targets };
}

export function entriesForMeal(meal) {
    return state.entries.filter((entry) => mealOf(entry) === meal);
}

export function findFood(id) {
    return state.foods.find((food) => food.id === id) ?? null;
}

/**
 * Barcodes compared as 13 digits: a scanner reports an EAN-13 that starts with
 * 0 as its 12-digit UPC form, while a saved product may hold either.
 */
const barcodeKey = (code) => String(code ?? '').replace(/\D/g, '').padStart(13, '0');

export function foodByBarcode(code) {
    const key = barcodeKey(code);
    return state.foods.find((food) => food.barcode && barcodeKey(food.barcode) === key) ?? null;
}

const kcal = (value) => Math.max(0, Math.round(Number(value) || 0));
const grams = (value) => Math.max(0, Math.round((Number(value) || 0) * 10) / 10);

// --- Saved foods ---------------------------------------------------------

/**
 * Saves a food you've just logged, with the portion you used, so it's at the
 * top of your list next time and works offline. An Open Food Facts product
 * keeps its `off-<barcode>` id, so logging it again updates one record.
 */
async function rememberFood(food, { amount, unit }) {
    const existing = findFood(food.id);
    const saved = {
        ...existing,
        ...food,
        uses: (existing?.uses ?? 0) + 1,
        lastUsedAt: new Date().toISOString(),
        lastAmount: amount,
        lastUnit: unit,
    };
    await lifeDb.put('foods', saved);
    state.foods = [saved, ...state.foods.filter((f) => f.id !== saved.id)];
}

/**
 * A food you describe yourself, per serving or per 100 g/ml. A serving with a
 * known weight can also be logged in grams.
 */
export async function saveCustomFood({ name, brand, basis, servingGrams, baseUnit, nutrients }) {
    const values = {
        kcal: kcal(nutrients.kcal),
        proteinG: grams(nutrients.proteinG),
        carbsG: grams(nutrients.carbsG),
        fatG: grams(nutrients.fatG),
    };
    const food = {
        id: uid(),
        source: 'custom',
        name: name.trim(),
        brand: brand?.trim() || null,
        baseUnit: baseUnit === 'ml' ? 'ml' : 'g',
        per100: basis === '100g' ? values : null,
        serving: basis === 'serving' ? { grams: Number(servingGrams) > 0 ? Number(servingGrams) : null, ...values } : null,
        uses: 0,
        lastUsedAt: new Date().toISOString(),
    };
    await lifeDb.put('foods', food);
    state.foods = [food, ...state.foods];
    return food;
}

export async function deleteFood(id) {
    await lifeDb.delete('foods', id);
    state.foods = state.foods.filter((food) => food.id !== id);
}

// --- Entries -------------------------------------------------------------

/** Logs `amount` of `unit` of a food into a meal, and remembers the food. */
export async function logPortion(food, { amount, unit, meal }, day = state.day) {
    const nutrients = nutrientsFor(food, amount, unit);
    if (!nutrients) throw new Error('That food can’t be measured that way.');

    await lifeDb.put('nutritionEntries', {
        id: uid(),
        day,
        meal,
        name: food.name,
        brand: food.brand ?? null,
        foodId: food.id,
        amount,
        unit,
        ...nutrients,
        loggedAt: new Date().toISOString(),
    });
    await rememberFood(food, { amount, unit });
}

/** Changes an entry's portion or meal, recalculated from the food it came from. */
export async function updatePortion(entry, food, { amount, unit, meal }) {
    const nutrients = nutrientsFor(food, amount, unit);
    if (!nutrients) throw new Error('That food can’t be measured that way.');
    await lifeDb.put('nutritionEntries', { ...entry, meal, amount, unit, ...nutrients });
    await rememberFood(food, { amount, unit });
}

function quickValues({ name, kcal: k, proteinG, carbsG, fatG }) {
    return {
        name: name?.trim() || 'Quick add',
        kcal: kcal(k),
        proteinG: grams(proteinG),
        carbsG: grams(carbsG),
        fatG: grams(fatG),
    };
}

/** Calories (and optionally macros) typed straight in, without a food. */
export async function quickAdd(values, day = state.day) {
    await lifeDb.put('nutritionEntries', {
        id: uid(),
        day,
        meal: values.meal,
        brand: null,
        foodId: null,
        amount: null,
        unit: 'quick',
        ...quickValues(values),
        loggedAt: new Date().toISOString(),
    });
}

export async function updateQuick(entry, values) {
    await lifeDb.put('nutritionEntries', { ...entry, meal: values.meal, unit: 'quick', ...quickValues(values) });
}

export function deleteEntry(id) {
    return lifeDb.delete('nutritionEntries', id);
}

/** Copies every entry of one meal on `fromDay` into the same meal on the current day. */
export async function copyMeal(fromDay, meal, toDay = state.day) {
    const source = (await lifeDb.byIndex('nutritionEntries', 'day', fromDay)).filter((entry) => mealOf(entry) === meal);
    const now = new Date().toISOString();
    await Promise.all(
        source.map((entry) => lifeDb.put('nutritionEntries', { ...entry, id: uid(), day: toDay, meal, loggedAt: now })),
    );
    return source.length;
}

/** How many entries a meal has on another day — to offer "copy from yesterday" only when it helps. */
export async function mealCount(day, meal) {
    const entries = await lifeDb.byIndex('nutritionEntries', 'day', day);
    return entries.filter((entry) => mealOf(entry) === meal).length;
}
