import { el } from './dom.js';

/**
 * The ‹ label › switcher shared by sections that step through time (a day in
 * Nutrition and Habits, a week in Habits' grid). Presentation only: the caller
 * owns what "previous" and "next" mean, and whether next is allowed.
 */
export function dayBar({ label, canNext, onPrev, onNext }) {
    return el('div', { class: 'life-daybar' }, [
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous', text: '‹', onclick: onPrev }),
        el('span', { class: 'life-daybar-label', text: label }),
        el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Next',
            text: '›',
            disabled: !canNext,
            onclick: onNext,
        }),
    ]);
}
