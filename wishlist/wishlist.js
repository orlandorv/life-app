import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { lifeDb } from '../life/db.js';
import { icon } from '../life/icons.js';
import { state, loadItems, addItem, updateItem, setBought, deleteItem } from './store.js';
import { parsePrice, formatPrice, cleanLink, linkHost, splitItems, totalOf, groupByCategory, categoryChoices, MAX_CATEGORY } from './organize.js';

/**
 * Wishlist: things you want to buy, in one place — what, roughly how much, and
 * where. A quick box at the top adds an item in a tap (details come later, in the
 * sheet); ticking one marks it bought and moves it to the Bought list. Same
 * conventions as the other sections: no reactivity, every write reloads and the
 * list redraws, and the quick box is built once so adding never loses the keyboard.
 */

let ready = null;
// The category the quick box files new items under; kept while you add several in a row.
let quickCategory = '';

/** Opens LifeDB. Safe to call repeatedly. */
export function initWishlist() {
    ready ??= lifeDb.init().catch((error) => {
        ready = null;
        throw error;
    });
    return ready;
}

/** Called each time the section is opened. `'new'` puts the cursor straight in the quick box. */
export async function enterWishlist(action = null) {
    await initWishlist();
    await loadItems();
    quickCategory = '';
    renderWishlist();
    if (action === 'new') $('#wishlist-body .wish-name')?.focus();
}

/** Runs a write, then redraws the list. Returns whether it worked. */
async function attempt(work, message = 'Couldn’t save that') {
    try {
        await work();
    } catch (error) {
        console.error(error);
        toast(message);
        return false;
    }
    refreshList();
    return true;
}

// --- Screen -----------------------------------------------------------------------

export function renderWishlist() {
    clear($('#wishlist-body')).append(quickAdd(), el('div', { class: 'wish-list-slot' }));
    refreshList();
}

function refreshList() {
    const slot = document.querySelector('#wishlist-body .wish-list-slot');
    if (slot) slot.replaceChildren(...listContent());

    // A category made in an item's sheet is a choice in the quick box from then on.
    const select = document.querySelector('#wishlist-body .wish-category-select');
    if (select) {
        const choices = categoryChoices(state.items);
        if (quickCategory && !choices.includes(quickCategory)) quickCategory = '';
        select.replaceChildren(...categoryOptions(choices));
        select.value = quickCategory;
    }
}

const categoryOptions = (choices) => [
    el('option', { value: '', text: 'No category' }),
    ...choices.map((choice) => el('option', { value: choice, text: choice })),
];

function quickAdd() {
    const name = el('input', {
        class: 'form-input wish-name',
        type: 'text',
        placeholder: 'Something you want…',
        autocomplete: 'off',
        maxlength: 80,
        'aria-label': 'What you want',
    });
    const price = el('input', {
        class: 'form-input wish-price-input',
        type: 'text',
        inputmode: 'decimal',
        placeholder: 'Price',
        autocomplete: 'off',
        'aria-label': 'Price (optional)',
    });
    // A new category is made in the item's sheet; this picks from the ones there are.
    const choices = categoryChoices(state.items);
    if (quickCategory && !choices.includes(quickCategory)) quickCategory = '';
    const category = el('select', { class: 'form-input wish-category-select', 'aria-label': 'Category' }, categoryOptions(choices));
    category.value = quickCategory;
    category.addEventListener('change', () => {
        quickCategory = category.value;
    });
    const add = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Add', disabled: true });
    name.addEventListener('input', () => {
        add.disabled = !name.value.trim();
    });

    const submit = async (event) => {
        event.preventDefault();
        if (!name.value.trim()) return;
        const amount = parsePrice(price.value);
        if (Number.isNaN(amount)) {
            toast('That doesn’t look like a price');
            price.focus();
            return;
        }
        if (!(await attempt(() => addItem({ name: name.value, price: amount, category: category.value })))) return;
        name.value = '';
        price.value = '';
        add.disabled = true;
        name.focus();
        toast('Added');
    };

    return el('form', { class: 'life-surface wish-quick', onsubmit: submit }, [
        el('div', { class: 'wish-quick-row' }, [name, add]),
        el('div', { class: 'wish-quick-row' }, [price, category]),
    ]);
}

function listContent() {
    if (!state.items.length) {
        return [
            el('div', { class: 'life-empty' }, [
                el('span', { class: 'life-empty-icon' }, [icon('wishlist', { size: 26 })]),
                el('p', { class: 'life-empty-title', text: 'Nothing on your list yet' }),
                el('p', { class: 'life-empty-text', text: 'Add things you want to buy. Tap one later for a link, a note or to mark it a top pick.' }),
            ]),
        ];
    }

    const { wanted, bought } = splitItems(state.items);
    const parts = [];

    if (wanted.length) {
        parts.push(summaryLine(wanted));
        parts.push(...groupByCategory(wanted).map(categorySection));
    } else {
        parts.push(el('p', { class: 'hint wish-all-bought', text: 'Everything on your list is bought.' }));
    }

    if (bought.length) {
        const spent = totalOf(bought);
        parts.push(
            el('section', { class: 'wish-bought' }, [
                el('h2', { class: 'wish-bought-title', text: 'Bought' }),
                spent.priced ? el('p', { class: 'hint wish-total', text: `${formatPrice(spent.total)} spent${spent.priced < spent.count ? ` (${spent.priced} of ${spent.count} had a price)` : ''}` }) : null,
                el('div', { class: 'life-list wish-list' }, bought.map(itemRow)),
            ]),
        );
    }
    return parts;
}

/** One category: its name, how many and what they come to, then the items. */
function categorySection(group) {
    const sub = group.priced ? `${group.count} · ${formatPrice(group.total)}` : String(group.count);
    return el('section', { class: 'wish-category' }, [
        el('div', { class: 'wish-category-head' }, [
            el('h2', { class: 'wish-category-title', text: group.label }),
            el('span', { class: 'wish-category-count', text: sub }),
        ]),
        el('div', { class: 'life-list wish-list' }, group.items.map(itemRow)),
    ]);
}

/** "5 things · £340", saying how many of them had a price when not all did. */
function summaryLine(wanted) {
    const { total, priced, count } = totalOf(wanted);
    const things = `${count} ${count === 1 ? 'thing' : 'things'}`;
    const text = priced ? `${things} · ${formatPrice(total)}${priced < count ? ` (${priced} priced)` : ''}` : things;
    return el('p', { class: 'wish-summary', text });
}

function itemRow(item) {
    const bought = Boolean(item.boughtAt);
    // A wanted item sits under its category's heading; a bought one is in a list of its own, so it says.
    const meta = [item.price ? formatPrice(item.price) : null, bought ? item.category : null, item.link ? linkHost(item.link) : null, item.note]
        .filter(Boolean)
        .join(' · ');

    return el('div', { class: `wish-row${bought ? ' bought' : ''}` }, [
        el('button', {
            class: 'wish-check',
            type: 'button',
            'aria-pressed': String(bought),
            'aria-label': `${item.name}, ${bought ? 'bought' : 'not bought yet'}`,
            onclick: async () => {
                if (!(await attempt(() => setBought(item, !bought)))) return;
                toast(bought ? 'Back on your list' : 'Marked as bought');
            },
        }, [bought ? icon('check', { size: 16 }) : null]),
        el('button', { class: 'wish-main', type: 'button', onclick: () => openItemSheet(item) }, [
            el('span', { class: 'wish-text' }, [
                el('span', { class: 'wish-title' }, [item.name, item.starred && !bought ? el('span', { class: 'wish-star', text: 'Top pick' }) : null]),
                meta ? el('span', { class: 'wish-meta', text: meta }) : null,
            ]),
        ]),
    ]);
}

// --- The item sheet ---------------------------------------------------------------

function openItemSheet(item) {
    const name = el('input', { class: 'form-input', type: 'text', maxlength: 80, value: item.name, autocomplete: 'off', 'aria-label': 'Name' });
    const price = el('input', {
        class: 'form-input',
        type: 'text',
        inputmode: 'decimal',
        value: item.price ? String(item.price) : '',
        placeholder: 'Optional',
        autocomplete: 'off',
        'aria-label': 'Price',
    });
    const category = el('input', {
        class: 'form-input',
        type: 'text',
        maxlength: MAX_CATEGORY,
        value: item.category ?? '',
        placeholder: 'Pick one below or type your own',
        autocomplete: 'off',
        'aria-label': 'Category',
    });
    const chips = categoryChoices(state.items).map((choice) =>
        el('button', {
            class: 'wish-chip',
            type: 'button',
            text: choice,
            onclick: () => {
                // Tapping the lit one clears it.
                category.value = category.value.trim().toLowerCase() === choice.toLowerCase() ? '' : choice;
                syncChips();
            },
        }),
    );
    const syncChips = () => {
        const current = category.value.trim().toLowerCase();
        chips.forEach((chip) => {
            const on = chip.textContent.toLowerCase() === current;
            chip.classList.toggle('active', on);
            chip.setAttribute('aria-pressed', String(on));
        });
    };
    category.addEventListener('input', syncChips);
    syncChips();
    const link = el('input', {
        class: 'form-input',
        // Text with a URL keyboard, not type=url: the browser would refuse "shop.example/x"
        // before cleanLink() gets to add the https:// itself.
        type: 'text',
        inputmode: 'url',
        value: item.link ?? '',
        placeholder: 'Optional — where to buy it',
        autocapitalize: 'off',
        autocomplete: 'off',
        'aria-label': 'Link',
    });
    const note = el('textarea', { class: 'form-input', rows: 3, maxlength: 500, value: item.note ?? '', placeholder: 'Optional — size, colour, why…', 'aria-label': 'Note' });
    const starred = el('input', { type: 'checkbox' });
    starred.checked = Boolean(item.starred);
    const bought = el('input', { type: 'checkbox' });
    bought.checked = Boolean(item.boughtAt);

    const open = el('a', { class: 'link-btn wish-open', target: '_blank', rel: 'noopener noreferrer', text: 'Open link', hidden: !item.link });
    if (item.link) open.href = item.link;

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
        const address = cleanLink(link.value);
        if (address === null) {
            toast('That doesn’t look like a web address');
            link.focus();
            return;
        }
        const ok = await attempt(async () => {
            const updated = await updateItem(item, { name: name.value, price: amount, category: category.value, link: address, note: note.value, starred: starred.checked });
            if (bought.checked !== Boolean(updated.boughtAt)) await setBought(updated, bought.checked);
        });
        if (!ok) return;
        closeModal('wish-modal');
        toast('Saved');
    };

    const remove = async () => {
        const ok = await confirmSheet({ title: 'Delete item', message: `Remove “${item.name}” from your list?`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        if (!(await attempt(() => deleteItem(item.id)))) return;
        closeModal('wish-modal');
        toast('Deleted');
    };

    $('#wish-modal-title').textContent = 'Edit item';
    clear($('#wish-body')).append(
        el('form', { class: 'wish-form', onsubmit: submit }, [
            el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'What' }), name]),
            el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Price' }), price]),
            el('div', { class: 'wish-category-field' }, [
                el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Category' }), category]),
                el('div', { class: 'wish-chips', role: 'group', 'aria-label': 'Categories' }, chips),
            ]),
            el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Link' }), link]),
            open,
            el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Note' }), note]),
            el('label', { class: 'life-check' }, [starred, el('span', { text: 'Top pick' })]),
            el('label', { class: 'life-check' }, [bought, el('span', { text: 'Bought' })]),
            el('div', { class: 'modal-actions' }, [
                el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: remove }),
                el('button', { class: 'btn btn-primary', type: 'submit', text: 'Save' }),
            ]),
        ]),
    );
    openModal('wish-modal');
}
