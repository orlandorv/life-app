/**
 * Foods, portions and meals — pure, like totals.js, so it can be checked in
 * Node. A food describes its nutrition per 100 g (or ml) and/or per serving;
 * an entry is a snapshot of what one portion of it came to, so editing a food
 * later never rewrites what you already logged.
 */

import { storeFromOff } from './stores.js';

export const MEALS = [
    { id: 'breakfast', label: 'Breakfast' },
    { id: 'lunch', label: 'Lunch' },
    { id: 'dinner', label: 'Dinner' },
    { id: 'snacks', label: 'Snacks' },
];

const MEAL_IDS = new Set(MEALS.map((meal) => meal.id));
export const NUTRIENTS = ['kcal', 'proteinG', 'carbsG', 'fatG'];

/** The meal a time of day most likely belongs to — the default for a new entry. */
export function mealForTime(date = new Date()) {
    const hour = date.getHours();
    if (hour < 11) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour >= 17 && hour < 22) return 'dinner';
    return 'snacks';
}

/** Entries from before meals existed are filed by the time they were logged. */
export function mealOf(entry) {
    return MEAL_IDS.has(entry.meal) ? entry.meal : mealForTime(new Date(entry.loggedAt));
}

/** A finite, non-negative number, or null for anything else (blank, "", NaN, negative). */
function num(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

function pickNutrients(source) {
    if (!source) return null;
    const kcal = num(source.kcal);
    if (kcal === null) return null;
    return {
        kcal,
        proteinG: num(source.proteinG) ?? 0,
        carbsG: num(source.carbsG) ?? 0,
        fatG: num(source.fatG) ?? 0,
    };
}

function scale(nutrients, factor) {
    return Object.fromEntries(NUTRIENTS.map((key) => [key, nutrients[key] * factor]));
}

/**
 * A food in one shape, whatever it was saved as:
 * - `per100`: nutrition per 100 g/ml, or null;
 * - `serving`: `{grams, ...nutrition}` for one serving (grams may be null), or null;
 * - `baseUnit`: 'g' or 'ml'.
 * Foods saved before portions existed have bare `kcal`/`proteinG`, meaning one
 * serving of unknown weight.
 */
export function normalizeFood(food) {
    let per100 = pickNutrients(food.per100);
    let serving = null;

    if (food.serving) {
        const grams = num(food.serving.grams) || null;
        const own = pickNutrients(food.serving);
        const nutrients = own ?? (per100 && grams ? scale(per100, grams / 100) : null);
        if (nutrients) serving = { grams, ...nutrients };
    } else if (!per100 && num(food.kcal) !== null) {
        serving = { grams: null, ...pickNutrients(food) };
    }

    if (!per100 && serving?.grams) per100 = scale(serving, 100 / serving.grams);

    return { ...food, per100, serving, baseUnit: food.baseUnit === 'ml' ? 'ml' : 'g' };
}

/** The units a food can be logged in: 'serving' and/or 'g' (weight/volume). */
export function unitsFor(food) {
    const f = normalizeFood(food);
    return [f.serving ? 'serving' : null, f.per100 ? 'g' : null].filter(Boolean);
}

/** What to start the portion at: the last amount you logged, else one serving, else 100 g. */
export function defaultPortion(food) {
    const units = unitsFor(food);
    if (units.includes(food.lastUnit) && num(food.lastAmount)) return { amount: food.lastAmount, unit: food.lastUnit };
    if (units.includes('serving')) return { amount: 1, unit: 'serving' };
    return { amount: 100, unit: 'g' };
}

const round1 = (n) => Math.round(n * 10) / 10;

/** Nutrition for `amount` of `unit` of a food, or null if the food can't be measured that way. */
export function nutrientsFor(food, amount, unit) {
    const f = normalizeFood(food);
    const quantity = num(amount);
    const base = unit === 'serving' ? f.serving : f.per100;
    if (!base || quantity === null) return null;

    const factor = unit === 'serving' ? quantity : quantity / 100;
    return {
        kcal: Math.round(base.kcal * factor),
        proteinG: round1(base.proteinG * factor),
        carbsG: round1(base.carbsG * factor),
        fatG: round1(base.fatG * factor),
    };
}

const trimNumber = (n) => String(round1(n));

/**
 * What one serving is called: foods from the built-in whole-food list say
 * `servingLabel: ['medium egg', 'medium eggs']`, everything else is just "serving".
 */
function servingWords(food) {
    const names = food.servingLabel;
    return Array.isArray(names) && names.length === 2 ? names : ['serving', 'servings'];
}

/** The unit's name for headings and buttons: "Servings", or "Medium eggs" for an egg. */
export function servingName(food) {
    const plural = servingWords(food)[1];
    return plural.charAt(0).toUpperCase() + plural.slice(1);
}

/** "150 g", "1 serving (125 g)", "2.5 servings", "2 medium eggs (100 g)". */
export function portionLabel(food, amount, unit) {
    const f = normalizeFood(food);
    if (unit === 'g') return `${trimNumber(amount)} ${f.baseUnit}`;
    const [one, many] = servingWords(f);
    const servings = `${trimNumber(amount)} ${amount === 1 ? one : many}`;
    return f.serving?.grams ? `${servings} (${trimNumber(f.serving.grams * amount)} ${f.baseUnit})` : servings;
}

/** "115 kcal per 100 g · 144 kcal per serving" — a one-line summary for lists. */
export function foodSummary(food) {
    const f = normalizeFood(food);
    const parts = [];
    if (f.serving) parts.push(`${Math.round(f.serving.kcal)} kcal per ${servingWords(f)[0]}${f.serving.grams ? ` (${trimNumber(f.serving.grams)} ${f.baseUnit})` : ''}`);
    if (f.per100) parts.push(`${Math.round(f.per100.kcal)} kcal per 100 ${f.baseUnit}`);
    return parts.join(' · ');
}

// --- Open Food Facts ---------------------------------------------------------

const KJ_PER_KCAL = 4.184;

/**
 * A product from the Open Food Facts API as a food, or null when it lacks a
 * name or any calorie figure (not worth offering). Missing macros count as 0;
 * energy given only in kJ is converted.
 */
export function fromOpenFoodFacts(product) {
    if (!product) return null;
    const name = typeof product.product_name === 'string' ? product.product_name.trim() : '';
    if (!name) return null;

    const n = product.nutriments ?? {};
    const kcalFrom = (suffix) => num(n[`energy-kcal_${suffix}`]) ?? (num(n[`energy_${suffix}`]) === null ? null : num(n[`energy_${suffix}`]) / KJ_PER_KCAL);
    const read = (suffix) => {
        const kcal = kcalFrom(suffix);
        if (kcal === null) return null;
        return {
            kcal,
            proteinG: num(n[`proteins_${suffix}`]) ?? 0,
            carbsG: num(n[`carbohydrates_${suffix}`]) ?? 0,
            fatG: num(n[`fat_${suffix}`]) ?? 0,
        };
    };

    const per100 = read('100g');
    const grams = num(product.serving_quantity) || null;
    const perServing = read('serving') ?? (per100 && grams ? scale(per100, grams / 100) : null);
    if (!per100 && !perServing) return null;

    const text = `${product.serving_size ?? ''} ${product.quantity ?? ''}`;
    const brand = typeof product.brands === 'string' ? product.brands.split(',')[0].trim() : '';

    return {
        id: `off-${product.code}`,
        source: 'off',
        barcode: String(product.code ?? ''),
        name,
        brand: brand || null,
        store: storeFromOff(product.stores),
        baseUnit: /\d\s*(ml|cl|l)\b/i.test(text) ? 'ml' : 'g',
        per100,
        serving: perServing ? { grams, ...perServing } : null,
    };
}
