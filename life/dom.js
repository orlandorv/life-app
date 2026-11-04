export function $(selector, root = document) {
    return root.querySelector(selector);
}

export function $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

/**
 * Builds an element. Text content is set via textContent, never innerHTML, so
 * user-entered exercise names containing quotes or angle brackets are inert.
 */
export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'value') node.value = value;
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, value);
    });
    (Array.isArray(children) ? children : [children])
        .filter(Boolean)
        .forEach((child) => node.append(child));
    return node;
}

export function clear(node) {
    node.replaceChildren();
    return node;
}

// --- Modal stack ---------------------------------------------------------
// A stack rather than a single reference, because the exercise picker opens on
// top of the template editor and closing it must not dismiss both.

const stack = [];
const closeHandlers = new Map();
// Modal id → the element that had focus when it opened, so closing the sheet
// puts you back where you were (a keyboard or VoiceOver user would otherwise
// land at the top of the page).
const openers = new Map();

const TEXT_ENTRY = 'input, textarea, select, [contenteditable]';
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const NOT_CONTENT = new Set(['SCRIPT', 'STYLE', 'LINK', 'META']);

/**
 * Gives a sheet the semantics a screen reader needs, once: it is a dialog (the
 * confirm sheet an alertdialog), it is modal, and it is named by its heading.
 * Done here from the existing markup so none of the 23 sheets needs editing.
 */
function describeModal(modal) {
    const panel = modal.querySelector('.modal-content');
    if (!panel || panel.hasAttribute('role')) return;
    const alert = modal.id === 'confirm-modal';
    panel.setAttribute('role', alert ? 'alertdialog' : 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const heading = modal.querySelector('.modal-header h2');
    if (heading) {
        heading.id ||= `${modal.id}-heading`;
        panel.setAttribute('aria-labelledby', heading.id);
    }
    if (alert) panel.setAttribute('aria-describedby', 'confirm-body');
    // Focusable by script only: opening a sheet moves focus here rather than to
    // a field, so the on-screen keyboard doesn't rise unasked.
    panel.setAttribute('tabindex', '-1');
}

function releaseBackground(node) {
    node.inert = false;
    node.removeAttribute('aria-hidden');
    delete node.dataset.modalInert;
}

/**
 * Makes everything outside the top sheet unreachable (not focusable, not
 * clickable, not read out), except the toast, which has to be heard over it.
 * With no sheet open it releases everything it ever marked, so a missed close
 * can't leave the app frozen.
 */
function syncBackground() {
    const top = stack.length ? document.getElementById(stack[stack.length - 1]) : null;
    const toastNode = document.getElementById('toast');
    const wanted = new Set();
    for (let node = top; node && node !== document.body; node = node.parentElement) {
        for (const sibling of node.parentElement.children) {
            if (sibling !== node && sibling !== toastNode && !NOT_CONTENT.has(sibling.tagName)) wanted.add(sibling);
        }
    }
    for (const node of document.querySelectorAll('[data-modal-inert]')) {
        if (!wanted.has(node)) releaseBackground(node);
    }
    for (const node of wanted) {
        node.inert = true;
        node.setAttribute('aria-hidden', 'true');
        node.dataset.modalInert = '';
    }
}

/** Back to what had focus before the sheet opened, if that's still sensible. */
function restoreFocus(id) {
    const opener = openers.get(id);
    openers.delete(id);
    // Never to a text field: on iOS that would raise the keyboard for no reason.
    if (opener?.isConnected && !opener.closest('[inert]') && !opener.matches(TEXT_ENTRY)) {
        opener.focus({ preventScroll: true });
    }
    if (stack.length && (!document.activeElement || document.activeElement === document.body)) {
        document.getElementById(stack[stack.length - 1])?.querySelector('.modal-content')?.focus({ preventScroll: true });
    }
}

export function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal || stack.includes(id)) return;
    const active = document.activeElement;
    openers.set(id, active && active !== document.body ? active : null);
    describeModal(modal);
    modal.style.zIndex = String(200 + stack.length * 10);
    modal.classList.add('active');
    stack.push(id);
    document.body.classList.add('modal-open');
    syncBackground();
    modal.querySelector('.modal-content')?.focus({ preventScroll: true });
}

export function closeModal(id) {
    const target = id || stack[stack.length - 1];
    const index = target ? stack.indexOf(target) : -1;
    if (index === -1) {
        if (!stack.length) syncBackground();
        return;
    }
    const wasTop = index === stack.length - 1;
    document.getElementById(target)?.classList.remove('active');
    stack.splice(index, 1);
    if (stack.length === 0) document.body.classList.remove('modal-open');
    syncBackground();
    if (wasTop) restoreFocus(target);
    else openers.delete(target);
    closeHandlers.get(target)?.forEach((handler) => handler());
}

/** Keeps Tab inside the top sheet: from its last control it wraps to the first, and back. */
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || !stack.length) return;
    const modal = document.getElementById(stack[stack.length - 1]);
    const panel = modal?.querySelector('.modal-content');
    if (!panel) return;
    const items = $$(FOCUSABLE, panel).filter((node) => node.getClientRects().length > 0);
    if (!items.length) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    } else if (!panel.contains(active)) {
        event.preventDefault();
        first.focus();
    }
});

/**
 * Fires once the given modal actually closes, however that happens (Done
 * button, backdrop tap, Escape). Useful for work that only makes sense once
 * the sheet is out of the way and its content is visible again — e.g.
 * playing an entrance animation for something added while a picker covered
 * the screen. Returns an unsubscribe function.
 */
export function onModalClosed(id, handler) {
    if (!closeHandlers.has(id)) closeHandlers.set(id, new Set());
    closeHandlers.get(id).add(handler);
    return () => closeHandlers.get(id)?.delete(handler);
}

export function closeAllModals() {
    while (stack.length) closeModal();
}

export function isModalOpen(id) {
    return stack.includes(id);
}

// --- Feedback ------------------------------------------------------------

let toastTimer = null;

export function toast(message) {
    let node = document.getElementById('toast');
    if (!node) {
        node = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
        document.body.append(node);
    }
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), 2600);
}

/**
 * Promise-based confirm sheet — window.confirm is ugly and blocking on iOS.
 *
 * Must resolve no matter how the sheet goes away — Confirm, Cancel, a
 * backdrop tap, or Escape — and must resolve exactly once. Without both of
 * those: dismissing via backdrop/Escape left the promise hanging forever
 * *and* left that dismissed call's button listeners attached to the shared
 * #confirm-accept/#confirm-cancel elements, so the next time any confirm
 * sheet was genuinely confirmed, every abandoned one fired alongside it —
 * confirming a harmless dialog could silently also execute a "Delete" or
 * "Discard" from a dialog you thought you'd backed out of.
 */
export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
        const okBtn = $('#confirm-accept');
        const cancelBtn = $('#confirm-cancel');
        $('#confirm-title').textContent = title;
        $('#confirm-body').textContent = message;
        okBtn.textContent = confirmLabel;
        okBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            unsubscribeClose();
            resolve(result);
        };

        // Covers backdrop tap and Escape — anything that isn't a direct
        // Confirm/Cancel click still has to settle this promise and detach
        // these listeners.
        const unsubscribeClose = onModalClosed('confirm-modal', () => finish(false));

        const onOk = () => { finish(true); closeModal('confirm-modal'); };
        const onCancel = () => { finish(false); closeModal('confirm-modal'); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        openModal('confirm-modal');
    });
}

// --- Note fields -----------------------------------------------------------

/**
 * Add-link + autosaving textarea: collapsed to a "+ {label}" link when empty,
 * an editable field (debounced on input, flushed on blur) once it has
 * content. Shared by the exercise-level and template-level note fields so
 * they read as the same interaction wherever they appear.
 */
export function noteField({ label, placeholder = '', value = '', onSave }) {
    let saveTimer = null;

    const caption = el('span', { class: 'stepper-label note-field-label', text: label, hidden: !value });

    const field = el('textarea', {
        class: 'form-input note-input',
        rows: 2,
        placeholder,
        value,
        hidden: !value,
    });

    const addLink = el('button', {
        class: 'link-btn',
        type: 'button',
        text: `+ ${label}`,
        hidden: Boolean(value),
    });

    addLink.addEventListener('click', () => {
        caption.hidden = false;
        field.hidden = false;
        addLink.hidden = true;
        field.focus();
    });

    field.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => onSave(field.value), 500);
    });

    field.addEventListener('blur', () => {
        clearTimeout(saveTimer);
        onSave(field.value);
        if (!field.value.trim()) {
            caption.hidden = true;
            field.hidden = true;
            addLink.hidden = false;
        }
    });

    return el('div', { class: 'note-section' }, [addLink, caption, field]);
}

// --- Steppers ------------------------------------------------------------

// A click this soon after a finger or mouse was last on the button is the tail of
// that same press, which has already acted; a long hold ends in a click too.
const POINTER_CLICK_WINDOW_MS = 600;

/**
 * Wires press-and-hold repeat onto a +/- button. Uses pointer events so it
 * works for both touch and mouse, and cancels on pointercancel (which fires
 * when iOS decides a touch became a scroll).
 *
 * A press acts on pointerdown, so a plain `click` is only ever one that no
 * pointer made: Enter or Space from a keyboard, or a switch or screen reader
 * activating the button. Those did nothing before; now they step once.
 */
export function bindHold(button, action) {
    let timeout = null;
    let interval = null;
    let held = false;
    let lastPointerAt = -Infinity;

    const stop = () => {
        clearTimeout(timeout);
        clearInterval(interval);
        timeout = null;
        interval = null;
    };

    const release = () => {
        held = false;
        lastPointerAt = performance.now();
        stop();
    };

    button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        held = true;
        lastPointerAt = performance.now();
        action();
        timeout = setTimeout(() => {
            interval = setInterval(action, 90);
        }, 450);
    });

    ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => {
        button.addEventListener(type, release);
    });

    button.addEventListener('click', () => {
        if (held || performance.now() - lastPointerAt < POINTER_CLICK_WINDOW_MS) return;
        action();
    });
}
