import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { labelledStepper } from '../life/stepper.js';
import { lifeDb } from '../life/db.js';
import { localDayId, addDays, dayLabel } from '../life/dates.js';
import {
    state,
    loadDay,
    loadFoods,
    loadTargets,
    saveTargets,
    addEntry,
    updateEntry,
    deleteEntry,
    saveFood,
    logFood,
    deleteFood,
} from './store.js';
import { dayTotals, progress } from './totals.js';

/**
 * Nutrition: one screen for a day — calories and protein against targets, the
 * day's entries, and a sheet to log food. Foods you log are remembered so the
 * next time is one tap. Same conventions as Gym: no reactivity, so every write
 * reloads the day and re-renders.
 */

let ready = null;

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

/** Called each time the section is opened; always starts on today. */
export async function enterNutrition() {
    await initNutrition();
    await refresh(localDayId());
}

async function refresh(day = state.day) {
    await loadDay(day);
    renderNutrition();
}

const fmt = (n) => Math.round(n).toLocaleString();
const macroText = (item) => `${fmt(item.kcal)} kcal · ${fmt(item.proteinG)} g protein`;

// --- Screen ---------------------------------------------------------------

export function renderNutrition() {
    const body = clear($('#nutrition-body'));
    const totals = dayTotals(state.entries);

    body.append(
        dayBar(),
        el('div', { class: 'nutrition-summary' }, [
            el('div', { class: 'nutrition-summary-head' }, [
                el('span', { class: 'nutrition-summary-title', text: 'Targets' }),
                el('button', { class: 'link-btn', type: 'button', text: 'Edit', onclick: openTargetsModal }),
            ]),
            meter('Calories', totals.kcal, state.targets.kcal, 'kcal', true),
            meter('Protein', totals.proteinG, state.targets.proteinG, 'g', false),
        ]),
        el('div', { class: 'history-group-label', text: 'Logged' }),
        entryList(),
        el('button', {
            class: 'btn btn-primary btn-block spaced',
            type: 'button',
            text: '+ Log food',
            onclick: () => openFoodModal(),
        }),
    );
}

function dayBar() {
    const today = localDayId();
    return el('div', { class: 'nutrition-daybar' }, [
        el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Previous day',
            text: '‹',
            onclick: () => refresh(addDays(state.day, -1)),
        }),
        el('span', { class: 'nutrition-day', text: dayLabel(state.day, today) }),
        el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Next day',
            text: '›',
            disabled: state.day >= today,
            onclick: () => refresh(addDays(state.day, 1)),
        }),
    ]);
}

/** A bar toward a target, or just the running total when none is set. */
function meter(label, value, target, unit, overIsBad) {
    const p = progress(value, target);

    let note = `No ${label.toLowerCase()} target set`;
    if (p) note = p.over ? `${fmt(value - target)} ${unit} over` : `${fmt(p.remaining)} ${unit} left`;

    return el('div', { class: 'nutrition-meter' }, [
        el('div', { class: 'nutrition-meter-head' }, [
            el('span', { class: 'nutrition-meter-label', text: label }),
            el('span', {
                class: 'nutrition-meter-value',
                text: p ? `${fmt(value)} / ${fmt(target)} ${unit}` : `${fmt(value)} ${unit}`,
            }),
        ]),
        p
            ? el('div', { class: 'nutrition-track' }, [
                el('div', {
                    class: `nutrition-fill${p.over ? (overIsBad ? ' over' : ' done') : ''}`,
                    style: `width: ${p.fraction * 100}%`,
                }),
            ])
            : null,
        el('div', { class: 'nutrition-meter-note', text: note }),
    ]);
}

function entryList() {
    if (!state.entries.length) {
        return el('p', { class: 'hint', text: 'Nothing logged for this day yet.' });
    }

    return el(
        'div',
        { class: 'stack' },
        state.entries.map((entry) =>
            el('button', { class: 'nutrition-entry', type: 'button', onclick: () => openFoodModal(entry) }, [
                el('span', { class: 'nutrition-entry-name', text: entry.name }),
                el('span', { class: 'nutrition-entry-meta', text: macroText(entry) }),
            ]),
        ),
    );
}

// --- Log / edit sheet -------------------------------------------------------

/** No entry: pick a saved food or add a new one. With an entry: edit it. */
function openFoodModal(entry = null) {
    $('#food-modal-title').textContent = entry ? 'Edit entry' : 'Log food';
    $('#food-modal-day').textContent = dayLabel(state.day);

    const body = clear($('#food-body'));
    body.append(...(entry ? [foodForm({ entry })] : pickerContent()));
    openModal('food-modal');
}

function pickerContent() {
    const formHolder = el('div', { class: 'nutrition-newfood' });
    const newButton = el('button', { class: 'btn btn-outline btn-block', type: 'button', text: '+ New food' });

    const showForm = () => {
        newButton.hidden = true;
        formHolder.append(foodForm({}));
    };
    newButton.addEventListener('click', showForm);

    if (!state.foods.length) {
        showForm();
        return [
            formHolder,
            el('p', { class: 'hint footnote', text: 'Foods you log are remembered here, so next time it’s one tap.' }),
        ];
    }

    const search = el('input', {
        class: 'form-input',
        type: 'search',
        placeholder: 'Search saved foods…',
        autocomplete: 'off',
    });
    const list = el('div', { class: 'stack' });

    const renderList = () => {
        const query = search.value.trim().toLowerCase();
        const matches = state.foods.filter((food) => food.name.toLowerCase().includes(query));
        clear(list);
        if (!matches.length) {
            list.append(
                el('p', {
                    class: 'hint',
                    text: state.foods.length ? 'No saved food matches.' : 'Nothing saved yet — add a new food above.',
                }),
            );
        }
        matches.forEach((food) => list.append(foodRow(food, renderList)));
    };
    search.addEventListener('input', renderList);
    renderList();

    return [newButton, formHolder, el('div', { class: 'history-group-label', text: 'Saved foods' }), search, list];
}

function foodRow(food, onRemoved) {
    const add = el(
        'button',
        {
            class: 'nutrition-food-main',
            type: 'button',
            onclick: async () => {
                await logFood(food);
                closeModal('food-modal');
                await Promise.all([loadFoods(), refresh()]);
                toast(`Added ${food.name}`);
            },
        },
        [
            el('span', { class: 'nutrition-entry-name', text: food.name }),
            el('span', { class: 'nutrition-entry-meta', text: macroText(food) }),
        ],
    );

    const remove = el('button', {
        class: 'icon-btn danger',
        type: 'button',
        'aria-label': `Remove ${food.name} from saved foods`,
        text: '✕',
        onclick: async () => {
            const ok = await confirmSheet({
                title: 'Remove saved food',
                message: `“${food.name}” won’t be suggested any more. Entries you’ve already logged are kept.`,
                confirmLabel: 'Remove',
                danger: true,
            });
            if (!ok) return;
            await deleteFood(food.id);
            await loadFoods();
            onRemoved();
        },
    });

    return el('div', { class: 'nutrition-food-row' }, [add, remove]);
}

function foodForm({ entry = null }) {
    const name = el('input', {
        class: 'form-input',
        type: 'text',
        placeholder: 'e.g. Greek yoghurt',
        autocomplete: 'off',
        maxlength: 60,
        value: entry?.name ?? '',
    });
    const kcal = labelledStepper('Calories', { value: entry?.kcal ?? 0, min: 0, max: 5000, step: 10, suffix: 'kcal' });
    const protein = labelledStepper('Protein', { value: entry?.proteinG ?? 0, min: 0, max: 500, step: 1, suffix: 'g' });
    const remember = el('input', { type: 'checkbox', checked: true });

    const values = () => ({
        name: name.value,
        kcal: kcal.control.getValue(),
        proteinG: protein.control.getValue(),
    });

    const finish = async (message) => {
        closeModal('food-modal');
        await Promise.all([loadFoods(), refresh()]);
        toast(message);
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!name.value.trim()) {
            toast('Give it a name');
            name.focus();
            return;
        }

        if (entry) {
            await updateEntry(entry, values());
            await finish('Entry updated');
        } else if (remember.checked) {
            const food = await saveFood(values());
            await logFood(food);
            await finish(`Added ${food.name}`);
        } else {
            await addEntry(values());
            await finish('Added');
        }
    };

    const remove = async () => {
        const ok = await confirmSheet({
            title: 'Delete entry',
            message: `Remove “${entry.name}” from ${dayLabel(state.day).toLowerCase()}?`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        await deleteEntry(entry.id);
        await finish('Entry deleted');
    };

    return el('form', { class: 'nutrition-form', onsubmit: submit }, [
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Name' }), name]),
        el('div', { class: 'stepper-grid' }, [kcal, protein]),
        entry
            ? null
            : el('label', { class: 'nutrition-check' }, [remember, el('span', { text: 'Remember this food' })]),
        el('div', { class: 'modal-actions' }, [
            entry
                ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: remove })
                : null,
            el('button', { class: 'btn btn-primary', type: 'submit', text: entry ? 'Save' : 'Add' }),
        ]),
    ]);
}

// --- Targets sheet ----------------------------------------------------------

function openTargetsModal() {
    const kcal = labelledStepper('Daily calories', {
        value: state.targets.kcal ?? 0,
        min: 0,
        max: 10000,
        step: 50,
        suffix: 'kcal',
    });
    const protein = labelledStepper('Daily protein', {
        value: state.targets.proteinG ?? 0,
        min: 0,
        max: 500,
        step: 5,
        suffix: 'g',
    });

    clear($('#nutrition-targets-body')).append(
        el('div', { class: 'stepper-grid' }, [kcal, protein]),
        el('p', { class: 'hint footnote', text: 'Leave one at zero to track it without a target. Your plan’s protein range is 150–170 g.' }),
    );

    $('#nutrition-targets-save').onclick = async () => {
        const positive = (value) => (value > 0 ? value : null);
        await saveTargets({
            kcal: positive(kcal.control.getValue()),
            proteinG: positive(protein.control.getValue()),
        });
        closeModal('nutrition-targets-modal');
        renderNutrition();
        toast('Targets saved');
    };

    openModal('nutrition-targets-modal');
}
