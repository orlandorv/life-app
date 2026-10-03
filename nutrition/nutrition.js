import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { labelledStepper } from '../life/stepper.js';
import { lifeDb } from '../life/db.js';
import { localDayId, addDays, dayLabel } from '../life/dates.js';
import { dayBar } from '../life/daybar.js';
import { icon } from '../life/icons.js';
import {
    state,
    loadDay,
    loadFoods,
    loadTargets,
    saveTargets,
    entriesForMeal,
    findFood,
    foodByBarcode,
    saveCustomFood,
    deleteFood,
    logPortion,
    updatePortion,
    quickAdd,
    updateQuick,
    deleteEntry,
    copyMeal,
} from './store.js';
import { dayTotals, hasTarget, progress, kcalFromMacros } from './totals.js';
import {
    MEALS,
    mealOf,
    mealForTime,
    normalizeFood,
    unitsFor,
    defaultPortion,
    nutrientsFor,
    portionLabel,
    foodSummary,
    servingName,
} from './portions.js';
import { searchFoods, lookupBarcode, OfflineError } from './off.js';
import { STORES, storeById, sourceLabel } from './stores.js';
import { CATEGORIES, searchWholeFoods } from './whole-foods.js';
import { scanBarcode } from './scanner.js';

/**
 * Nutrition, modelled on the way MyFitnessPal works: a day is a diary of
 * meals, the top says how many calories are left, and adding food is search
 * first — your recent foods instantly, the built-in whole foods (eggs, bananas,
 * chicken…) offline, Open Food Facts as you type (optionally for one
 * supermarket), a barcode scan, or a quick add. Every food is logged as a portion (grams or servings)
 * and the numbers scale with it.
 *
 * Same conventions as the other sections: no reactivity, so every write
 * reloads the day and re-renders.
 */

const SEARCH_DELAY_MS = 450;
const RECENT_SHOWN = 30;

let ready = null;
// Meals on the previous day that had entries, to offer "Copy yesterday" into an empty meal.
let previousDayMeals = new Set();

/** Opens LifeDB and loads what doesn't depend on the day. Safe to call repeatedly. */
export function initNutrition() {
    ready ??= (async () => {
        await lifeDb.init();
        await Promise.all([loadFoods(), loadTargets()]);
    })().catch((error) => {
        ready = null;
        throw error;
    });
    return ready;
}

/** Called each time the section is opened; always starts on today. `'log'` opens the add sheet. */
export async function enterNutrition(action = null) {
    await initNutrition();
    await refresh(localDayId());
    if (action === 'log') openAddSheet(mealForTime());
}

async function refresh(day = state.day) {
    await loadDay(day);
    const previous = await lifeDb.byIndex('nutritionEntries', 'day', addDays(day, -1));
    previousDayMeals = new Set(previous.map(mealOf));
    renderNutrition();
}

const fmt = (n) => Math.round(n).toLocaleString();
const mealLabel = (id) => MEALS.find((meal) => meal.id === id)?.label ?? 'Snacks';

function macroLine(item) {
    return `P ${fmt(item.proteinG || 0)} · C ${fmt(item.carbsG || 0)} · F ${fmt(item.fatG || 0)}`;
}

/** Runs a write and reports a failure without losing the screen. Returns whether it worked. */
async function attempt(action, message = 'Couldn’t save that') {
    try {
        await action();
        return true;
    } catch (error) {
        console.error(error);
        toast(error.message && error.message !== 'Failed to fetch' ? error.message : message);
        return false;
    }
}

// --- Diary ------------------------------------------------------------------------

export function renderNutrition() {
    const today = localDayId();
    clear($('#nutrition-body')).append(
        dayBar({
            label: dayLabel(state.day, today),
            canNext: state.day < today,
            onPrev: () => refresh(addDays(state.day, -1)),
            onNext: () => refresh(addDays(state.day, 1)),
        }),
        summaryCard(),
        ...MEALS.map(mealSection),
    );
}

function summaryCard() {
    const totals = dayTotals(state.entries);
    const { kcal, proteinG, carbsG, fatG } = state.targets;
    const withGoal = hasTarget(kcal);
    const left = withGoal ? kcal - totals.kcal : totals.kcal;

    return el('div', { class: 'nutrition-summary' }, [
        el('div', { class: 'nutrition-summary-head' }, [
            el('span', { class: 'life-eyebrow', text: withGoal ? 'Calories remaining' : 'Calories eaten' }),
            el('button', { class: 'link-btn', type: 'button', text: 'Targets', onclick: openTargetsModal }),
        ]),
        el('div', { class: `nutrition-hero${withGoal && left < 0 ? ' over' : ''}` }, [
            el('span', { class: 'nutrition-hero-value', text: fmt(Math.abs(left)) }),
            el('span', { class: 'nutrition-hero-unit', text: withGoal && left < 0 ? 'kcal over' : 'kcal' }),
        ]),
        // MyFitnessPal's equation: goal − food = remaining.
        withGoal
            ? el('div', { class: 'nutrition-equation' }, [
                term(fmt(kcal), 'Goal'),
                el('span', { class: 'nutrition-op', text: '−' }),
                term(fmt(totals.kcal), 'Food'),
                el('span', { class: 'nutrition-op', text: '=' }),
                term(fmt(left), 'Remaining'),
            ])
            : el('p', { class: 'hint', text: 'Set a calorie target to see what’s left for the day.' }),
        el('div', { class: 'nutrition-macros' }, [
            macro('Carbs', totals.carbsG, carbsG, 'carbs'),
            macro('Protein', totals.proteinG, proteinG, 'protein'),
            macro('Fat', totals.fatG, fatG, 'fat'),
        ]),
    ]);
}

function term(value, label) {
    return el('span', { class: 'nutrition-term' }, [
        el('span', { class: 'nutrition-term-value', text: value }),
        el('span', { class: 'nutrition-term-label', text: label }),
    ]);
}

function macro(label, value, target, kind) {
    const p = progress(value, target);
    return el('div', { class: `nutrition-macro ${kind}` }, [
        el('span', { class: 'nutrition-macro-label', text: label }),
        el('span', { class: 'nutrition-macro-value' }, [
            fmt(value),
            el('small', { text: hasTarget(target) ? ` / ${fmt(target)} g` : ' g' }),
        ]),
        el('div', { class: 'nutrition-track' }, [
            el('div', { class: `nutrition-fill${p?.over ? ' over' : ''}`, style: `width: ${(p?.fraction ?? 0) * 100}%` }),
        ]),
    ]);
}

function mealSection(meal) {
    const entries = entriesForMeal(meal.id);
    const subtotal = entries.reduce((sum, entry) => sum + (entry.kcal || 0), 0);

    const actions = el('div', { class: 'meal-actions' }, [
        el('button', { class: 'meal-add', type: 'button', onclick: () => openAddSheet(meal.id) }, [
            icon('plus', { size: 18 }),
            'Add food',
        ]),
        !entries.length && previousDayMeals.has(meal.id)
            ? el('button', { class: 'meal-copy', type: 'button', onclick: () => copyFromPreviousDay(meal.id) }, [
                icon('copy', { size: 16 }),
                'Copy yesterday',
            ])
            : null,
    ]);

    return el('section', { class: 'meal' }, [
        el('div', { class: 'meal-head' }, [
            el('h2', { class: 'meal-title', text: meal.label }),
            entries.length ? el('span', { class: 'meal-kcal', text: `${fmt(subtotal)} kcal` }) : null,
        ]),
        el('div', { class: 'life-list meal-list' }, [...entries.map(entryRow), actions]),
    ]);
}

function entryRow(entry) {
    // An entry whose food was since removed still shows its portion, just without the serving weight.
    const portion = entry.unit === 'serving' || entry.unit === 'g'
        ? portionLabel(findFood(entry.foodId) ?? {}, entry.amount, entry.unit)
        : null;
    const meta = [sourceLabel(entry.brand, entry.store), portion, macroLine(entry)].filter(Boolean).join(' · ');

    return el('button', { class: 'meal-entry', type: 'button', onclick: () => openEntry(entry) }, [
        el('span', { class: 'meal-entry-text' }, [
            el('span', { class: 'meal-entry-name', text: entry.name }),
            el('span', { class: 'meal-entry-meta', text: meta }),
        ]),
        el('span', { class: 'meal-entry-kcal', text: fmt(entry.kcal || 0) }),
    ]);
}

async function copyFromPreviousDay(meal) {
    let copied = 0;
    const ok = await attempt(async () => {
        copied = await copyMeal(addDays(state.day, -1), meal);
    });
    if (!ok) return;
    await refresh();
    toast(`Copied ${copied} item${copied === 1 ? '' : 's'} into ${mealLabel(meal)}`);
}

// --- Add sheet ------------------------------------------------------------------------
// One sheet, several views: search (the default), a food's portion, quick add,
// and create a food. `sheet` carries what should survive moving between them.

const sheet = {
    meal: 'breakfast',
    query: '',
    category: null, // a whole-food category being browsed
    store: null, // a STORES id narrowing the online search and your foods
    remote: { state: 'idle', foods: [], message: '' },
    abort: null,
    timer: null,
};

function setSheetHeader(title) {
    $('#food-modal-title').textContent = title;
    $('#food-modal-day').textContent = dayLabel(state.day);
}

function openAddSheet(meal) {
    sheet.meal = meal;
    sheet.query = '';
    sheet.category = null;
    sheet.store = null;
    sheet.remote = { state: 'idle', foods: [], message: '' };
    showSearch();
    openModal('food-modal');
}

function mealPicker() {
    return el(
        'div',
        { class: 'segmented meal-picker', role: 'group', 'aria-label': 'Meal' },
        MEALS.map((meal) =>
            el('button', {
                type: 'button',
                class: sheet.meal === meal.id ? 'active' : '',
                'aria-pressed': String(sheet.meal === meal.id),
                text: meal.label,
                onclick: (event) => {
                    sheet.meal = meal.id;
                    event.currentTarget.parentElement.querySelectorAll('button').forEach((button) => {
                        const on = button === event.currentTarget;
                        button.classList.toggle('active', on);
                        button.setAttribute('aria-pressed', String(on));
                    });
                },
            }),
        ),
    );
}

function showSearch() {
    setSheetHeader('Add food');
    const results = el('div', { class: 'food-results' });

    const input = el('input', {
        class: 'form-input food-search-input',
        type: 'search',
        placeholder: 'Search foods, e.g. “eggs”',
        autocomplete: 'off',
        enterkeyhint: 'search',
        value: sheet.query,
        'aria-label': 'Search foods',
    });

    input.addEventListener('input', () => {
        sheet.query = input.value;
        // Marks the online search as started before drawing, so it reads "Searching…" at once.
        scheduleRemoteSearch(results);
        renderResults(results);
    });

    clear($('#food-body')).append(
        mealPicker(),
        el('div', { class: 'food-search' }, [
            el('span', { class: 'food-search-icon' }, [icon('search', { size: 18 })]),
            input,
            el('button', { class: 'icon-btn food-scan', type: 'button', 'aria-label': 'Scan a barcode', onclick: startScan }, [
                icon('barcode', { size: 22 }),
            ]),
        ]),
        el('div', { class: 'food-shortcuts' }, [
            el('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Quick add', onclick: () => showQuick() }),
            el('button', { class: 'btn btn-outline btn-small', type: 'button', text: 'Create a food', onclick: () => showCreate() }),
        ]),
        el('div', { class: 'food-chips-label', text: 'Whole foods' }),
        chipRow(
            CATEGORIES.map((category) => ({ id: category, label: category })),
            () => sheet.category,
            (id) => {
                sheet.category = id;
                renderResults(results);
            },
        ),
        el('div', { class: 'food-chips-label', text: 'Shop' }),
        chipRow(
            STORES.map((store) => ({ id: store.id, label: store.label })),
            () => sheet.store,
            (id) => {
                sheet.store = id;
                // The online search is per shop, so choosing or clearing one re-runs it.
                scheduleRemoteSearch(results);
                renderResults(results);
            },
        ),
        results,
    );

    renderResults(results);
}

/**
 * A scrolling row of toggle chips: tapping the lit one clears it. `current()`
 * is read at tap time so the row never goes stale against `sheet`.
 */
function chipRow(items, current, onPick) {
    const row = el('div', { class: 'food-chips', role: 'group' });
    const sync = () =>
        row.querySelectorAll('button').forEach((button) => {
            const on = button.dataset.id === current();
            button.classList.toggle('active', on);
            button.setAttribute('aria-pressed', String(on));
        });

    items.forEach((item) =>
        row.append(
            el('button', {
                class: 'food-chip',
                type: 'button',
                text: item.label,
                dataset: { id: item.id },
                onclick: () => {
                    onPick(current() === item.id ? null : item.id);
                    sync();
                },
            }),
        ),
    );
    sync();
    return row;
}

function scheduleRemoteSearch(results) {
    clearTimeout(sheet.timer);
    sheet.abort?.abort();
    const query = sheet.query.trim();

    if (query.length < 2) {
        sheet.remote = { state: 'idle', foods: [], message: '' };
        renderResults(results);
        return;
    }

    sheet.remote = { state: 'loading', foods: [], message: '' };
    sheet.timer = setTimeout(async () => {
        const controller = new AbortController();
        sheet.abort = controller;
        try {
            const store = storeById(sheet.store);
            const foods = await searchFoods(query, { signal: controller.signal, store });
            if (controller.signal.aborted) return;
            sheet.remote = {
                state: 'done',
                foods,
                message: foods.length ? '' : store ? `No ${store.label} matches on Open Food Facts.` : 'No matches on Open Food Facts.',
            };
        } catch (error) {
            if (controller.signal.aborted) return;
            console.warn(error);
            sheet.remote = {
                state: 'error',
                foods: [],
                message: error instanceof OfflineError ? error.message : 'Couldn’t reach Open Food Facts. Try again in a moment.',
            };
        }
        if (results.isConnected) renderResults(results);
    }, SEARCH_DELAY_MS);
}

function renderResults(results) {
    const query = sheet.query.trim().toLowerCase();
    const store = storeById(sheet.store);

    // Your own foods: matching the search, and from the chosen shop if there is one.
    const fromYou = state.foods.filter((food) => !store || food.store === store.label);
    const saved = query
        ? fromYou.filter((food) => `${food.name} ${food.brand ?? ''} ${food.store ?? ''}`.toLowerCase().includes(query))
        : fromYou.slice(0, RECENT_SHOWN);

    // Whole foods are generic, not any one shop's, so they step aside when a shop is chosen.
    const savedIds = new Set(saved.map((food) => food.id));
    const whole = store ? [] : searchWholeFoods(query, sheet.category).filter((food) => !savedIds.has(food.id));

    const nodes = [];

    if (saved.length) {
        nodes.push(el('div', { class: 'history-group-label', text: [query ? 'Your foods' : 'Recent', store?.label].filter(Boolean).join(' · ') }));
        nodes.push(el('div', { class: 'life-list' }, saved.map(foodRow)));
    }

    if (whole.length) {
        nodes.push(el('div', { class: 'history-group-label', text: sheet.category ? `Whole foods · ${sheet.category}` : 'Whole foods' }));
        nodes.push(el('div', { class: 'life-list' }, whole.map(foodRow)));
    }

    if (!saved.length && !whole.length && !query) {
        nodes.push(
            el('div', { class: 'life-empty food-empty' }, [
                el('span', { class: 'life-empty-icon' }, [icon('search', { size: 24 })]),
                el('p', { class: 'life-empty-title', text: store ? `Find a ${store.label} food` : 'Find a food' }),
                el('p', {
                    class: 'life-empty-text',
                    text: store
                        ? `Type a food to search products sold at ${store.label}. Foods you log show up here next time.`
                        : 'Search by name — eggs, banana, chicken — or browse a category. You can also scan a barcode, pick a shop, or quick add calories. Foods you log show up here next time.',
                }),
            ]),
        );
    }

    if (query.length >= 2) {
        // Anything already shown above is left out of the online list.
        const shownIds = new Set([...saved, ...whole].map((food) => food.id));
        const remote = sheet.remote.foods.filter((food) => !shownIds.has(food.id));
        nodes.push(el('div', { class: 'history-group-label', text: store ? `Open Food Facts · ${store.label}` : 'Open Food Facts' }));
        if (sheet.remote.state === 'loading') {
            nodes.push(el('p', { class: 'hint food-status', text: 'Searching…' }));
        } else if (remote.length) {
            nodes.push(el('div', { class: 'life-list' }, remote.map(foodRow)));
        } else {
            nodes.push(el('p', { class: 'hint food-status', text: sheet.remote.message || 'No other matches.' }));
            if (sheet.remote.state === 'error') {
                nodes.push(el('button', { class: 'btn btn-outline btn-small food-retry', type: 'button', text: 'Try again', onclick: () => scheduleRemoteSearch(results) }));
            }
        }
    }

    clear(results).append(...nodes);
}

/** Where a food comes from, for a list: its category for a whole food, else brand and shop. */
const originOf = (food) => (food.source === 'whole' ? food.category : sourceLabel(food.brand, food.store));

function foodRow(food) {
    const portion = defaultPortion(food);
    const nutrients = nutrientsFor(food, portion.amount, portion.unit);
    const amount = portionLabel(food, portion.amount, portion.unit);

    return el('div', { class: 'food-row' }, [
        el('button', { class: 'food-row-main', type: 'button', onclick: () => showPortion(food) }, [
            el('span', { class: 'food-row-name', text: food.name }),
            el('span', {
                class: 'food-row-meta',
                text: [originOf(food), amount, `${fmt(nutrients?.kcal ?? 0)} kcal`].filter(Boolean).join(' · '),
            }),
        ]),
        // One tap logs your usual portion, like the old saved-food list.
        el('button', {
            class: 'icon-btn food-row-add',
            type: 'button',
            'aria-label': `Add ${amount} of ${food.name}`,
            onclick: () => logQuickly(food, portion),
        }, [icon('plus', { size: 20 })]),
    ]);
}

async function logQuickly(food, portion) {
    const ok = await attempt(() => logPortion(food, { ...portion, meal: sheet.meal }));
    if (!ok) return;
    closeModal('food-modal');
    await refresh();
    toast(`Added ${food.name} to ${mealLabel(sheet.meal)}`);
}

// --- Scanning ------------------------------------------------------------------------------

async function startScan() {
    const code = await scanBarcode();
    if (!code) return;

    const saved = foodByBarcode(code);
    if (saved) {
        showPortion(saved);
        return;
    }

    setSheetHeader('Looking it up…');
    clear($('#food-body')).append(el('p', { class: 'hint food-status', text: `Barcode ${code}` }));

    try {
        const food = await lookupBarcode(code);
        if (food) showPortion(food);
        else showNotFound(code, 'Open Food Facts doesn’t have this product yet.');
    } catch (error) {
        console.warn(error);
        showNotFound(code, error instanceof OfflineError ? error.message : 'Couldn’t reach Open Food Facts.');
    }
}

function showNotFound(code, message) {
    setSheetHeader('Not found');
    clear($('#food-body')).append(
        el('div', { class: 'life-empty food-empty' }, [
            el('span', { class: 'life-empty-icon' }, [icon('barcode', { size: 24 })]),
            el('p', { class: 'life-empty-title', text: 'No match for that barcode' }),
            el('p', { class: 'life-empty-text', text: `${message} Add it from the label and it’ll be found next time you scan.` }),
        ]),
        el('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Create this food', onclick: () => showCreate({ barcode: code }) }),
        el('button', { class: 'btn btn-outline btn-block spaced', type: 'button', text: 'Back to search', onclick: showSearch }),
    );
}

// --- Portion ----------------------------------------------------------------------------------

function backLink(label, onclick) {
    return el('button', { class: 'link-btn sheet-back', type: 'button', onclick }, [icon('back', { size: 16 }), label]);
}

/**
 * Choose how much and which meal, with the numbers updating as you go.
 * With `entry`, edits that entry instead of adding a new one.
 */
function showPortion(food, entry = null) {
    const f = normalizeFood(food);
    const units = unitsFor(food);
    let { amount, unit } = entry && units.includes(entry.unit) ? { amount: entry.amount, unit: entry.unit } : defaultPortion(food);
    if (entry) sheet.meal = mealOf(entry);

    setSheetHeader(entry ? 'Edit entry' : 'Add food');

    const preview = el('div', { class: 'portion-preview' });
    const amountHolder = el('div');

    const drawPreview = () => {
        const n = nutrientsFor(food, amount, unit) ?? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
        clear(preview).append(
            el('div', { class: 'portion-kcal' }, [
                el('span', { class: 'portion-kcal-value', text: fmt(n.kcal) }),
                el('span', { class: 'portion-kcal-unit', text: 'kcal' }),
            ]),
            el('div', { class: 'portion-macros' }, [
                pill('Carbs', n.carbsG, 'carbs'),
                pill('Protein', n.proteinG, 'protein'),
                pill('Fat', n.fatG, 'fat'),
            ]),
        );
    };

    const drawAmount = () => {
        const isServing = unit === 'serving';
        const control = labelledStepper(isServing ? servingName(f) : `Amount (${f.baseUnit})`, {
            value: amount,
            min: 0,
            max: isServing ? 50 : 5000,
            step: isServing ? 0.5 : 10,
            decimals: true,
            precision: isServing ? 2 : 1,
            onChange: (value) => {
                amount = value;
                drawPreview();
            },
        });

        const unitSwitch = units.length > 1
            ? el('div', { class: 'segmented portion-units' }, units.map((u) =>
                el('button', {
                    type: 'button',
                    class: u === unit ? 'active' : '',
                    text: u === 'serving' ? servingName(f) : f.baseUnit,
                    onclick: () => {
                        if (u === unit) return;
                        // Keep the same real amount where a serving's weight is known.
                        const grams = f.serving?.grams;
                        if (u === 'g') amount = grams ? Math.round(amount * grams) : 100;
                        else amount = grams ? Math.max(0.25, Math.round((amount / grams) * 4) / 4) : 1;
                        unit = u;
                        drawAmount();
                        drawPreview();
                    },
                })))
            : null;

        clear(amountHolder).append(el('div', { class: 'portion-amount' }, [control, unitSwitch]));
    };

    const save = async () => {
        if (!(amount > 0)) {
            toast('Enter an amount');
            return;
        }
        const values = { amount, unit, meal: sheet.meal };
        const ok = await attempt(() => (entry ? updatePortion(entry, food, values) : logPortion(food, values)));
        if (!ok) return;
        closeModal('food-modal');
        await refresh();
        toast(entry ? 'Entry updated' : `Added ${food.name} to ${mealLabel(sheet.meal)}`);
    };

    drawAmount();
    drawPreview();

    clear($('#food-body')).append(
        entry ? null : backLink('Search', showSearch),
        el('div', { class: 'portion-food' }, [
            el('h3', { class: 'portion-name', text: food.name }),
            el('p', { class: 'hint', text: [originOf(food), foodSummary(food)].filter(Boolean).join(' · ') }),
        ]),
        amountHolder,
        el('div', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Meal' }), mealPicker()]),
        preview,
        el('div', { class: 'modal-actions sheet-actions' }, [
            entry ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: () => removeEntry(entry) }) : null,
            el('button', { class: 'btn btn-primary', type: 'button', text: entry ? 'Save' : 'Add', onclick: save }),
        ]),
        !entry && findFood(food.id)
            ? el('button', { class: 'link-btn sheet-danger-link', type: 'button', text: 'Remove from your foods', onclick: () => forgetFood(food) })
            : null,
    );
}

function pill(label, grams, kind) {
    return el('span', { class: `portion-pill ${kind}` }, [
        el('span', { class: 'portion-pill-value', text: `${fmt(grams)} g` }),
        el('span', { class: 'portion-pill-label', text: label }),
    ]);
}

async function forgetFood(food) {
    const ok = await confirmSheet({
        title: 'Remove from your foods',
        message: `“${food.name}” won’t be suggested any more. Anything you’ve already logged stays.`,
        confirmLabel: 'Remove',
        danger: true,
    });
    if (!ok) return;
    if (await attempt(() => deleteFood(food.id))) showSearch();
}

async function removeEntry(entry) {
    const ok = await confirmSheet({
        title: 'Delete entry',
        message: `Remove “${entry.name}” from ${mealLabel(mealOf(entry)).toLowerCase()}?`,
        confirmLabel: 'Delete',
        danger: true,
    });
    if (!ok) return;
    if (!(await attempt(() => deleteEntry(entry.id)))) return;
    closeModal('food-modal');
    await refresh();
    toast('Entry deleted');
}

/** Tapping an entry: its portion if the food is still saved, otherwise its numbers. */
function openEntry(entry) {
    const food = entry.foodId ? findFood(entry.foodId) : null;
    if (food && (entry.unit === 'serving' || entry.unit === 'g')) showPortion(food, entry);
    else showQuick(entry);
    openModal('food-modal');
}

// --- Quick add ---------------------------------------------------------------------------------

function nutrientSteppers(values = {}) {
    const kcal = labelledStepper('Calories', { value: values.kcal ?? 0, min: 0, max: 10000, step: 10, suffix: 'kcal' });
    const grams = (label, value) =>
        labelledStepper(label, { value: value ?? 0, min: 0, max: 1000, step: 1, decimals: true, precision: 1, suffix: 'g' });
    const protein = grams('Protein', values.proteinG);
    const carbs = grams('Carbs', values.carbsG);
    const fat = grams('Fat', values.fatG);
    return {
        node: el('div', { class: 'stepper-grid' }, [kcal, protein, carbs, fat]),
        read: () => ({
            kcal: kcal.control.getValue(),
            proteinG: protein.control.getValue(),
            carbsG: carbs.control.getValue(),
            fatG: fat.control.getValue(),
        }),
    };
}

/** Calories typed straight in. With `entry`, edits it (also how entries without a food are edited). */
function showQuick(entry = null) {
    if (entry) sheet.meal = mealOf(entry);
    setSheetHeader(entry ? 'Edit entry' : 'Quick add');

    const name = el('input', {
        class: 'form-input',
        type: 'text',
        placeholder: 'Quick add',
        maxlength: 60,
        value: entry && entry.name !== 'Quick add' ? entry.name : '',
    });
    const numbers = nutrientSteppers(entry ?? {});

    const save = async () => {
        const values = { name: name.value, meal: sheet.meal, ...numbers.read() };
        if (!(values.kcal > 0)) {
            toast('Enter the calories');
            return;
        }
        const ok = await attempt(() => (entry ? updateQuick(entry, values) : quickAdd(values)));
        if (!ok) return;
        closeModal('food-modal');
        await refresh();
        toast(entry ? 'Entry updated' : `Added to ${mealLabel(sheet.meal)}`);
    };

    clear($('#food-body')).append(
        entry ? null : backLink('Search', showSearch),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Name (optional)' }), name]),
        numbers.node,
        el('div', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Meal' }), mealPicker()]),
        el('div', { class: 'modal-actions sheet-actions' }, [
            entry ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: () => removeEntry(entry) }) : null,
            el('button', { class: 'btn btn-primary', type: 'button', text: entry ? 'Save' : 'Add', onclick: save }),
        ]),
    );
}

// --- Create a food ---------------------------------------------------------------------------------

/** A food of your own, from its label. `barcode` links it to a scan that found nothing. */
function showCreate({ barcode = null } = {}) {
    setSheetHeader('Create a food');
    let basis = 'serving';

    const name = el('input', { class: 'form-input', type: 'text', placeholder: 'e.g. Chicken wrap', maxlength: 60 });
    const brand = el('input', { class: 'form-input', type: 'text', placeholder: 'Brand (optional)', maxlength: 40 });
    const store = el('input', { class: 'form-input', type: 'text', placeholder: 'Shop (optional) — Tesco, Lidl…', maxlength: 30, list: 'food-store-options' });
    const storeOptions = el('datalist', { id: 'food-store-options' }, STORES.map((option) => el('option', { value: option.label })));
    const servingGrams = labelledStepper('Serving size in g (optional)', { value: 0, min: 0, max: 5000, step: 5, decimals: true, precision: 1 });
    const drink = el('input', { type: 'checkbox' });
    const numbers = nutrientSteppers();

    const basisSwitch = el('div', { class: 'segmented' }, [
        ['serving', 'Per serving'],
        ['100g', 'Per 100 g'],
    ].map(([value, label]) =>
        el('button', {
            type: 'button',
            class: value === basis ? 'active' : '',
            text: label,
            onclick: (event) => {
                basis = value;
                event.currentTarget.parentElement.querySelectorAll('button').forEach((button) => button.classList.toggle('active', button === event.currentTarget));
                servingGrams.hidden = basis !== 'serving';
            },
        })));

    const save = async () => {
        if (!name.value.trim()) {
            toast('Give it a name');
            name.focus();
            return;
        }
        const nutrients = numbers.read();
        if (!(nutrients.kcal > 0)) {
            toast('Enter the calories');
            return;
        }

        let food;
        const ok = await attempt(async () => {
            food = await saveCustomFood({
                name: name.value,
                brand: brand.value,
                store: store.value,
                basis,
                servingGrams: servingGrams.control.getValue(),
                baseUnit: drink.checked ? 'ml' : 'g',
                nutrients,
            });
            if (barcode) {
                food = { ...food, barcode };
                await lifeDb.put('foods', food);
                await loadFoods();
            }
        });
        if (ok) showPortion(food);
    };

    clear($('#food-body')).append(
        backLink('Search', showSearch),
        barcode ? el('p', { class: 'hint', text: `Barcode ${barcode} will find this food next time you scan it.` }) : null,
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Name' }), name]),
        brand,
        store,
        storeOptions,
        el('div', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Nutrition from the label' }), basisSwitch]),
        servingGrams,
        numbers.node,
        el('label', { class: 'life-check' }, [drink, el('span', { text: 'It’s a drink (measured in ml)' })]),
        el('div', { class: 'modal-actions sheet-actions' }, [
            el('button', { class: 'btn btn-primary', type: 'button', text: 'Save and choose amount', onclick: save }),
        ]),
    );
}

// --- Targets ---------------------------------------------------------------------------------------

function openTargetsModal() {
    const t = state.targets;
    const check = el('p', { class: 'hint footnote' });
    // Declared before the steppers that call it; it only runs once they exist.
    const drawCheck = () => {
        const fromMacros = kcalFromMacros({
            proteinG: protein.control.getValue(),
            carbsG: carbs.control.getValue(),
            fatG: fat.control.getValue(),
        });
        const goal = kcal.control.getValue();
        check.textContent = fromMacros
            ? `Your macros add up to ${fmt(fromMacros)} kcal${goal ? ` against a ${fmt(goal)} kcal target` : ''}. Protein and carbs are 4 kcal per gram, fat is 9.`
            : 'Leave any at zero to track it without a target. Your plan’s protein range is 150–170 g.';
    };

    const target = (label, value, step, suffix) =>
        labelledStepper(label, { value: value ?? 0, min: 0, max: label === 'Calories' ? 10000 : 1000, step, suffix, onChange: drawCheck });
    const kcal = target('Calories', t.kcal, 50, 'kcal');
    const protein = target('Protein', t.proteinG, 5, 'g');
    const carbs = target('Carbs', t.carbsG, 5, 'g');
    const fat = target('Fat', t.fatG, 5, 'g');
    drawCheck();

    clear($('#nutrition-targets-body')).append(el('div', { class: 'stepper-grid' }, [kcal, protein, carbs, fat]), check);

    $('#nutrition-targets-save').onclick = async () => {
        const positive = (value) => (value > 0 ? value : null);
        const ok = await attempt(() => saveTargets({
            kcal: positive(kcal.control.getValue()),
            proteinG: positive(protein.control.getValue()),
            carbsG: positive(carbs.control.getValue()),
            fatG: positive(fat.control.getValue()),
        }));
        if (!ok) return;
        closeModal('nutrition-targets-modal');
        renderNutrition();
        toast('Targets saved');
    };

    openModal('nutrition-targets-modal');
}
