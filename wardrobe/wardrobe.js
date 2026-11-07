import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { icon } from '../life/icons.js';
import { lifeDb } from '../life/db.js';
import { state, loadWardrobe, addItem, updateItem, deleteItem, saveOutfit, deleteOutfit } from './store.js';
import {
    groupBySection, categoryChoices, matches, outfitItems, outfitsWithItem, sortOutfits, worth, MAX_CATEGORY,
} from './organize.js';
import { parsePrice, formatPrice } from '../wishlist/organize.js';
import { photoFromFile } from './photo.js';

/**
 * Wardrobe: what you own, and what you put together from it. Two tabs — **Items** (a
 * photo grid grouped by category) and **Outfits** (named combinations of items). The
 * photos are small JPEGs kept on the phone; nothing is uploaded. Same conventions as
 * the other sections: no reactivity, every write reloads and the screen redraws.
 */

let ready = null;
let view = 'items';
let query = '';

// Which sections are open on the Items tab. A convenience of this phone, kept between visits;
// the page works the same if storage is unavailable (everything simply starts folded).
const OPEN_KEY = 'life-wardrobe-open';
const loadOpen = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(OPEN_KEY));
        return new Set(Array.isArray(saved) ? saved.filter((key) => typeof key === 'string') : []);
    } catch {
        return new Set();
    }
};
const saveOpen = () => {
    try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...expanded]));
    } catch {
        /* not saved; fine */
    }
};
const expanded = loadOpen();
let sectionIds = 0;

/** Opens LifeDB. Safe to call repeatedly. */
export function initWardrobe() {
    ready ??= lifeDb.init().catch((error) => {
        ready = null;
        throw error;
    });
    return ready;
}

/** Called each time the section is opened. `'new'` opens the add sheet; `'outfits'` the Outfits tab. */
export async function enterWardrobe(action = null) {
    await initWardrobe();
    await loadWardrobe();
    view = action === 'outfits' ? 'outfits' : 'items';
    query = '';
    renderWardrobe();
    if (action === 'new') openItemSheet();
}

async function refresh() {
    await loadWardrobe();
    renderWardrobe();
}

/** Runs a write and reports a failure without losing the screen. Returns whether it worked. */
async function attempt(action, message = 'Couldn’t save that') {
    try {
        await action();
        return true;
    } catch (error) {
        console.error(error);
        toast(message);
        return false;
    }
}

// --- Screen ---------------------------------------------------------------------------

export function renderWardrobe() {
    const body = clear($('#wardrobe-body'));
    body.append(viewSwitch());
    if (view === 'outfits') body.append(...outfitsView());
    else body.append(...itemsView());
}

function viewSwitch() {
    const tab = (id, label, count) =>
        el('button', {
            type: 'button',
            class: view === id ? 'active' : '',
            'aria-pressed': String(view === id),
            text: count ? `${label} · ${count}` : label,
            onclick: () => {
                if (view === id) return;
                view = id;
                renderWardrobe();
            },
        });
    return el('div', { class: 'segmented wardrobe-switch' }, [tab('items', 'Items', state.items.length), tab('outfits', 'Outfits', state.outfits.length)]);
}

/** A square of an item: its photo, or a tinted square with its first letter when it has none. */
function swatch(item, className = '') {
    const photo = state.photos.get(item.id);
    return el('span', { class: `ward-swatch${className ? ` ${className}` : ''}${photo ? '' : ' empty'}` }, [
        photo ? el('img', { src: photo, alt: '', loading: 'lazy', decoding: 'async' }) : el('span', { class: 'ward-initial', text: (item.name.trim()[0] ?? '?').toUpperCase() }),
    ]);
}

// --- Items ----------------------------------------------------------------------------

function itemsView() {
    const nodes = [];
    if (!state.items.length) {
        nodes.push(
            el('div', { class: 'life-empty' }, [
                el('span', { class: 'life-empty-icon' }, [icon('hanger', { size: 26 })]),
                el('p', { class: 'life-empty-title', text: 'Your wardrobe is empty' }),
                el('p', { class: 'life-empty-text', text: 'Add what you own with a photo, then put outfits together from it.' }),
            ]),
        );
    } else {
        nodes.push(searchBox(), summaryLine(), el('div', { class: 'ward-grid-slot' }, gridContent()));
    }
    nodes.push(el('button', { class: 'btn btn-outline btn-block spaced', type: 'button', text: '+ Add item', onclick: () => openItemSheet() }));
    return nodes;
}

const redrawGrid = () => document.querySelector('#wardrobe-body .ward-grid-slot')?.replaceChildren(...gridContent());

function searchBox() {
    const input = el('input', { class: 'form-input ward-search', type: 'search', placeholder: 'Search your wardrobe', autocomplete: 'off', 'aria-label': 'Search your wardrobe', value: query });
    input.addEventListener('input', () => {
        query = input.value;
        // Only the grid redraws, so typing never loses the keyboard.
        redrawGrid();
    });
    return el('div', { class: 'ward-filters' }, [input]);
}

/** "42 items · £1,230 at what you paid", saying how many had a price when not all did. */
function summaryLine() {
    const { total, priced, count } = worth(state.items);
    const items = `${count} ${count === 1 ? 'item' : 'items'}`;
    return el('p', { class: 'ward-summary', text: priced ? `${items} · ${formatPrice(total)} paid${priced < count ? ` (${priced} priced)` : ''}` : items });
}

/** The sections of whatever matches the search, folded or open; searching opens them all so the matches are in view. */
function gridContent() {
    const searching = query.trim() !== '';
    const shown = state.items.filter((item) => matches(item, query));
    if (!shown.length) return [el('p', { class: 'hint ward-none', text: 'Nothing matches that.' })];

    const sections = groupBySection(shown);
    let syncToolbar = () => {}; // replaced below when there is a toolbar to keep in step
    const nodes = sections.map((section) =>
        sectionNode(section, {
            open: searching || expanded.has(section.key),
            tile,
            onToggle: (open) => {
                // While searching, folding a section is just for now: it isn't remembered.
                if (!searching) {
                    if (open) expanded.add(section.key);
                    else expanded.delete(section.key);
                    saveOpen();
                }
                syncToolbar();
            },
        }),
    );

    if (searching || sections.length < 2) return nodes;
    const toolbar = el('button', { class: 'link-btn ward-toggle-all', type: 'button', text: sections.every((section) => expanded.has(section.key)) ? 'Collapse all' : 'Expand all' });
    syncToolbar = () => {
        const folded = document.querySelectorAll('#wardrobe-body .ward-section:not(.open)').length;
        toolbar.textContent = folded ? 'Expand all' : 'Collapse all';
    };
    toolbar.addEventListener('click', () => {
        const folded = document.querySelectorAll('#wardrobe-body .ward-section:not(.open)').length;
        for (const section of sections) {
            if (folded) expanded.add(section.key);
            else expanded.delete(section.key);
        }
        saveOpen();
        redrawGrid();
    });
    return [el('div', { class: 'ward-toolbar' }, [toolbar]), ...nodes];
}

/**
 * One section as a header you can press to open or fold, and its items inside: a grid per
 * category, with the category named when the section holds more than one. The items are only
 * built when it is first opened, so a big wardrobe stays quick. A folded section shows a few of
 * its photos in its header as a peek. `note` is extra text beside the count (the outfit picker
 * uses it for "2 picked"); the returned `setNote` changes it.
 */
function sectionNode(section, { open, tile: makeTile, onToggle, note = '' }) {
    const id = `ward-section-${(sectionIds += 1)}`;
    const body = el('div', { class: 'ward-section-body', id, hidden: !open });
    const noteEl = el('span', { class: 'ward-section-note', text: note });
    const head = el('button', { class: 'ward-section-head', type: 'button', 'aria-expanded': String(open), 'aria-controls': id }, [
        el('span', { class: 'ward-section-title', text: section.label }),
        el('span', { class: 'ward-section-count', text: String(section.items.length) }),
        noteEl,
        el('span', { class: 'ward-peek', 'aria-hidden': 'true' }, section.items.slice(0, 4).map((item) => swatch(item, 'peek'))),
        el('span', { class: 'ward-chevron', 'aria-hidden': 'true' }, [icon('chevron', { size: 18 })]),
    ]);
    const node = el('section', { class: `ward-section${open ? ' open' : ''}` }, [head, body]);

    let built = false;
    const build = () => {
        if (built) return;
        built = true;
        body.replaceChildren(
            ...section.groups
                .flatMap((group) => [
                    section.groups.length > 1 ? el('h3', { class: 'ward-subhead' }, [group.label, el('span', { class: 'ward-subcount', text: String(group.items.length) })]) : null,
                    el('div', { class: 'ward-grid' }, group.items.map(makeTile)),
                ])
                .filter(Boolean),
        );
    };
    if (open) build();

    head.addEventListener('click', () => {
        const opening = body.hidden;
        if (opening) build();
        body.hidden = !opening;
        node.classList.toggle('open', opening);
        head.setAttribute('aria-expanded', String(opening));
        onToggle?.(opening);
    });

    node.setNote = (text) => {
        noteEl.textContent = text;
    };
    return node;
}

function tile(item) {
    return el('button', { class: 'ward-tile', type: 'button', onclick: () => openItemSheet(item), 'aria-label': [item.name, item.brand, item.colour].filter(Boolean).join(', ') }, [
        swatch(item),
        el('span', { class: 'ward-tile-name', text: item.name }),
        item.brand || item.colour ? el('span', { class: 'ward-tile-sub', text: [item.brand, item.colour].filter(Boolean).join(' · ') }) : null,
    ]);
}

// --- The item sheet ---------------------------------------------------------------------

/** Opens the sheet for an item, or a new one (optionally in a category, or from a bought wishlist item). */
export function openItemSheet(item = null, presetCategory = '', seed = null) {
    $('#ward-item-title').textContent = item ? 'Edit item' : 'Add item';
    clear($('#ward-item-body')).append(itemForm(item, presetCategory, seed));
    openModal('ward-item-modal');
}

function itemForm(item, presetCategory, seed) {
    // `photo`: undefined = as it is, a data URL = a new one, null = removed.
    let photo;
    const current = () => (photo === undefined ? (item ? state.photos.get(item.id) : null) : photo);

    const preview = el('button', { class: 'ward-photo', type: 'button', 'aria-label': 'Add or change the photo' });
    const picker = el('input', { type: 'file', accept: 'image/*', hidden: true });
    const remove = el('button', { class: 'link-btn ward-photo-remove', type: 'button', text: 'Remove photo' });
    const drawPhoto = () => {
        const data = current();
        preview.replaceChildren(
            data
                ? el('img', { src: data, alt: '' })
                : el('span', { class: 'ward-photo-empty' }, [icon('plus', { size: 28 }), el('span', { text: 'Add a photo' })]),
        );
        remove.hidden = !data;
    };
    preview.addEventListener('click', () => picker.click());
    remove.addEventListener('click', () => {
        photo = null;
        drawPhoto();
    });
    picker.addEventListener('change', async () => {
        const file = picker.files?.[0];
        picker.value = '';
        if (!file) return;
        try {
            photo = await photoFromFile(file);
            drawPhoto();
        } catch (error) {
            console.error(error);
            toast(error.message || 'Couldn’t use that picture');
        }
    });
    drawPhoto();

    const text = (field, placeholder, value, maxlength = 60) => el('input', { class: 'form-input', type: 'text', placeholder, maxlength, value: value ?? '', autocomplete: 'off', 'aria-label': field });
    const name = text('Name', 'e.g. Navy linen shirt', item?.name ?? seed?.name, 80);
    const category = el('input', { class: 'form-input', type: 'text', maxlength: MAX_CATEGORY, value: item?.category ?? seed?.category ?? presetCategory, placeholder: 'Pick one below or type your own', autocomplete: 'off', 'aria-label': 'Category' });
    const chips = categoryChoices(state.items).map((choice) =>
        el('button', {
            class: 'ward-chip',
            type: 'button',
            text: choice,
            onclick: () => {
                category.value = category.value.trim().toLowerCase() === choice.toLowerCase() ? '' : choice;
                syncChips();
            },
        }),
    );
    const syncChips = () => {
        const now = category.value.trim().toLowerCase();
        chips.forEach((chip) => {
            const on = chip.textContent.toLowerCase() === now;
            chip.classList.toggle('active', on);
            chip.setAttribute('aria-pressed', String(on));
        });
    };
    category.addEventListener('input', syncChips);
    syncChips();

    const colour = text('Colour', 'Optional', item?.colour, 30);
    const brand = text('Brand', 'Optional', item?.brand, 40);
    const size = text('Size', 'Optional', item?.size, 20);
    const price = el('input', { class: 'form-input', type: 'text', inputmode: 'decimal', placeholder: 'Optional', autocomplete: 'off', 'aria-label': 'Price', value: item?.price ? String(item.price) : seed?.price ? String(seed.price) : '' });
    const note = el('textarea', { class: 'form-input', rows: 2, maxlength: 400, placeholder: 'Optional — fit, where it’s from, what it goes with', value: item?.note ?? seed?.note ?? '', 'aria-label': 'Note' });

    const holders = item ? outfitsWithItem(state.outfits, item.id) : [];

    const submit = async (event) => {
        event.preventDefault();
        if (!name.value.trim()) {
            toast('Give it a name');
            name.focus();
            return;
        }
        const amount = parsePrice(price.value);
        if (Number.isNaN(amount)) {
            toast('That doesn’t look like a price');
            price.focus();
            return;
        }
        const values = { name: name.value, category: category.value, colour: colour.value, brand: brand.value, size: size.value, price: amount, note: note.value };
        const ok = await attempt(() => (item ? updateItem(item, { ...values, photo }) : addItem({ ...values, photo: photo ?? null })));
        if (!ok) return;
        closeModal('ward-item-modal');
        await refresh();
        toast(item ? 'Saved' : 'Added to your wardrobe');
    };

    const del = async () => {
        const sure = await confirmSheet({
            title: 'Delete item',
            message: holders.length ? `Remove “${item.name}”? It will also come out of ${holders.length === 1 ? 'an outfit' : `${holders.length} outfits`}.` : `Remove “${item.name}” from your wardrobe?`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!sure) return;
        if (!(await attempt(() => deleteItem(item.id)))) return;
        closeModal('ward-item-modal');
        await refresh();
        toast('Deleted');
    };

    const field = (label, control) => el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: label }), control]);

    return el('form', { class: 'ward-form', onsubmit: submit }, [
        el('div', { class: 'ward-photo-wrap' }, [preview, picker, remove]),
        field('Name', name),
        el('div', { class: 'ward-category-field' }, [field('Category', category), el('div', { class: 'ward-chips', role: 'group', 'aria-label': 'Categories' }, chips)]),
        el('div', { class: 'ward-pair' }, [field('Colour', colour), field('Brand', brand)]),
        el('div', { class: 'ward-pair' }, [field('Size', size), field('Price', price)]),
        field('Note', note),
        holders.length ? el('p', { class: 'hint', text: `In ${holders.map((o) => `“${o.name}”`).join(', ')}` }) : null,
        el('div', { class: 'modal-actions sheet-actions' }, [
            item ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: del }) : null,
            el('button', { class: 'btn btn-primary', type: 'submit', text: item ? 'Save' : 'Add' }),
        ]),
    ]);
}

// --- Outfits --------------------------------------------------------------------------

function outfitsView() {
    const nodes = [];
    if (!state.outfits.length) {
        nodes.push(
            el('div', { class: 'life-empty' }, [
                el('span', { class: 'life-empty-icon' }, [icon('hanger', { size: 26 })]),
                el('p', { class: 'life-empty-title', text: state.items.length ? 'No outfits yet' : 'Add some items first' }),
                el('p', { class: 'life-empty-text', text: state.items.length ? 'Put items together and save the combination, so you can find it again.' : 'An outfit is made from your items, so add a few to your wardrobe, then come back.' }),
            ]),
        );
    } else {
        nodes.push(el('div', { class: 'ward-outfits' }, sortOutfits(state.outfits).map(outfitCard)));
    }
    nodes.push(el('button', { class: 'btn btn-outline btn-block spaced', type: 'button', text: '+ New outfit', disabled: !state.items.length, onclick: () => openOutfitSheet() }));
    return nodes;
}

function outfitCard(outfit) {
    const items = outfitItems(outfit, state.items);
    // A 2 × 2 mosaic of its first four items; fewer leave empty squares.
    const cells = Array.from({ length: 4 }, (_, i) => (items[i] ? swatch(items[i], 'mosaic') : el('span', { class: 'ward-swatch mosaic blank' })));
    return el('button', { class: 'ward-outfit', type: 'button', onclick: () => openOutfitSheet(outfit), 'aria-label': `${outfit.name}, ${items.length} ${items.length === 1 ? 'item' : 'items'}` }, [
        el('span', { class: 'ward-mosaic' }, cells),
        el('span', { class: 'ward-outfit-name', text: outfit.name }),
        el('span', { class: 'ward-outfit-sub', text: `${items.length} ${items.length === 1 ? 'item' : 'items'}` }),
    ]);
}

function openOutfitSheet(outfit = null) {
    $('#ward-outfit-title').textContent = outfit ? 'Edit outfit' : 'New outfit';
    clear($('#ward-outfit-body')).append(outfitForm(outfit));
    openModal('ward-outfit-modal');
}

function outfitForm(outfit) {
    const chosen = new Set(outfit ? outfitItems(outfit, state.items).map((item) => item.id) : []);
    const order = [...chosen]; // the order they were picked in

    const name = el('input', { class: 'form-input', type: 'text', maxlength: 60, placeholder: 'e.g. Dinner out', value: outfit?.name ?? '', autocomplete: 'off', 'aria-label': 'Outfit name' });
    const note = el('textarea', { class: 'form-input', rows: 2, maxlength: 300, placeholder: 'Optional — when to wear it', value: outfit?.note ?? '', 'aria-label': 'Note' });
    const count = el('span', { class: 'ward-pick-count' });
    const picks = new Map(); // item id → its tile, for the tiles built so far
    const nodes = [];

    const sync = () => {
        for (const [id, button] of picks) {
            const on = chosen.has(id);
            button.classList.toggle('picked', on);
            button.setAttribute('aria-pressed', String(on));
        }
        for (const { section, node } of nodes) {
            const n = section.items.filter((item) => chosen.has(item.id)).length;
            node.setNote(n ? `${n} picked` : '');
        }
        count.textContent = chosen.size ? `${chosen.size} picked` : 'Tap items to add them';
    };

    const pickTile = (item) => {
        const button = el('button', { class: 'ward-tile', type: 'button', 'aria-label': item.name }, [
            swatch(item),
            el('span', { class: 'ward-check' }, [icon('check', { size: 16 })]),
            el('span', { class: 'ward-tile-name', text: item.name }),
        ]);
        button.addEventListener('click', () => {
            if (chosen.has(item.id)) {
                chosen.delete(item.id);
                order.splice(order.indexOf(item.id), 1);
            } else {
                chosen.add(item.id);
                order.push(item.id);
            }
            sync();
        });
        picks.set(item.id, button);
        // Built when its section is opened, so it starts out showing what is already picked.
        button.classList.toggle('picked', chosen.has(item.id));
        button.setAttribute('aria-pressed', String(chosen.has(item.id)));
        return button;
    };

    // The same folding sections as the Items tab; a section that already holds a pick starts open.
    const sections = groupBySection(state.items).map((section) => {
        const node = sectionNode(section, { open: section.items.some((item) => chosen.has(item.id)), tile: pickTile });
        node.classList.add('pick');
        nodes.push({ section, node });
        return node;
    });
    sync();

    const submit = async (event) => {
        event.preventDefault();
        if (!name.value.trim()) {
            toast('Give it a name');
            name.focus();
            return;
        }
        if (!order.length) {
            toast('Pick at least one item');
            return;
        }
        const ok = await attempt(() => saveOutfit({ id: outfit?.id, name: name.value, itemIds: order, note: note.value, createdAt: outfit?.createdAt }));
        if (!ok) return;
        closeModal('ward-outfit-modal');
        await refresh();
        toast(outfit ? 'Saved' : 'Outfit saved');
    };

    const del = async () => {
        const sure = await confirmSheet({ title: 'Delete outfit', message: `Remove “${outfit.name}”? The items stay in your wardrobe.`, confirmLabel: 'Delete', danger: true });
        if (!sure) return;
        if (!(await attempt(() => deleteOutfit(outfit.id)))) return;
        closeModal('ward-outfit-modal');
        await refresh();
        toast('Deleted');
    };

    return el('form', { class: 'ward-form', onsubmit: submit }, [
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Name' }), name]),
        el('div', { class: 'ward-pick-bar' }, [el('span', { class: 'stepper-label', text: 'Items' }), count]),
        ...sections,
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Note' }), note]),
        el('div', { class: 'modal-actions sheet-actions' }, [
            outfit ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: del }) : null,
            el('button', { class: 'btn btn-primary', type: 'submit', text: outfit ? 'Save' : 'Save outfit' }),
        ]),
    ]);
}
