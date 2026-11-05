import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { lifeDb } from '../life/db.js';
import { icon } from '../life/icons.js';
import { state, loadItems, addItem, updateItem, setBought, deleteItem } from './store.js';
import { parsePrice, formatPrice, cleanLink, linkHost, splitItems, totalOf } from './organize.js';

/**
 * Wishlist: things you want to buy, in one place — what, roughly how much, and
 * where. A quick box at the top adds an item in a tap (details come later, in the
 * sheet); ticking one marks it bought and moves it to the Bought list. Same
 * conventions as the other sections: no reactivity, every write reloads and the
 * list redraws, and the quick box is built once so adding never loses the keyboard.
 */

let ready = null;

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
}

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
        if (!(await attempt(() => addItem({ name: name.value, price: amount })))) return;
        name.value = '';
        price.value = '';
        add.disabled = true;
        name.focus();
        toast('Added');
    };

    return el('form', { class: 'life-surface wish-quick', onsubmit: submit }, [name, el('div', { class: 'wish-quick-row' }, [price, add])]);
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
        parts.push(el('div', { class: 'life-list wish-list' }, wanted.map(itemRow)));
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

/** "5 things · £340", saying how many of them had a price when not all did. */
function summaryLine(wanted) {
    const { total, priced, count } = totalOf(wanted);
    const things = `${count} ${count === 1 ? 'thing' : 'things'}`;
    const text = priced ? `${things} · ${formatPrice(total)}${priced < count ? ` (${priced} priced)` : ''}` : things;
    return el('p', { class: 'wish-summary', text });
}

function itemRow(item) {
    const bought = Boolean(item.boughtAt);
    const meta = [item.price ? formatPrice(item.price) : null, item.link ? linkHost(item.link) : null, item.note].filter(Boolean).join(' · ');

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
            const updated = await updateItem(item, { name: name.value, price: amount, link: address, note: note.value, starred: starred.checked });
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
