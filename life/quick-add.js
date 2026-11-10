import { el, openModal, closeModal } from './dom.js';
import { icon } from './icons.js';
import { QUICK_ADD_ACTIONS } from './quick-add-options.js';

/**
 * Quick Add is only a router: the chosen section still owns its form, validation and
 * storage. This keeps one canonical add flow for every kind of data.
 */
export function initQuickAdd() {
    const opener = document.getElementById('life-quick-add-btn');
    const body = document.getElementById('quick-add-body');
    if (!opener || !body || opener.dataset.ready) return;

    opener.dataset.ready = 'true';
    body.replaceChildren(
        el(
            'div',
            { class: 'quick-add-grid' },
            QUICK_ADD_ACTIONS.map((action) =>
                el(
                    'button',
                    {
                        class: 'quick-add-option',
                        type: 'button',
                        dataset: { section: action.section },
                        onclick: () => {
                            closeModal('quick-add-modal');
                            location.hash = action.route;
                        },
                    },
                    [
                        el('span', { class: 'quick-add-icon', 'aria-hidden': 'true' }, [icon(action.icon, { size: 22 })]),
                        el('span', { class: 'quick-add-copy' }, [
                            el('span', { class: 'quick-add-label', text: action.label }),
                            el('span', { class: 'quick-add-detail', text: action.detail }),
                        ]),
                    ],
                ),
            ),
        ),
    );

    opener.addEventListener('click', () => openModal('quick-add-modal'));
}
