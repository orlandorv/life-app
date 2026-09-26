import { el, clear } from '../life/dom.js';
import { icon } from '../life/icons.js';

/**
 * Editor for a routine's steps inside the habit sheet: text, an optional
 * detail line, and optionally the weekdays a step applies. Typing updates the
 * working copy without redrawing, so the keyboard stays put; only reordering,
 * adding and removing redraw. `value()` returns the steps for saving.
 */

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function stepEditor(initial = []) {
    // `days: null` = every day the routine runs.
    const steps = initial.map((step) => ({ ...step, days: Array.isArray(step.days) ? [...step.days] : null }));
    const list = el('div', { class: 'step-editor-list' });

    const move = (index, by) => {
        const [step] = steps.splice(index, 1);
        steps.splice(index + by, 0, step);
        render();
    };

    const render = () => {
        clear(list);
        steps.forEach((step, index) => list.append(stepCard(step, index)));
    };

    const stepCard = (step, index) => {
        const text = el('input', {
            class: 'form-input',
            type: 'text',
            placeholder: 'What to do',
            maxlength: 80,
            value: step.text ?? '',
            'aria-label': `Step ${index + 1}`,
        });
        text.addEventListener('input', () => {
            step.text = text.value;
        });

        const detail = el('textarea', {
            class: 'form-input step-detail',
            rows: 2,
            placeholder: 'How (optional), e.g. “pea-sized amount, face and neck”',
            maxlength: 240,
            value: step.detail ?? '',
            'aria-label': `Step ${index + 1} details`,
        });
        detail.addEventListener('input', () => {
            step.detail = detail.value;
        });

        return el('div', { class: 'step-edit' }, [
            el('div', { class: 'step-edit-head' }, [
                el('span', { class: 'step-edit-number', text: String(index + 1) }),
                text,
                el('div', { class: 'step-edit-tools' }, [
                    el('button', {
                        class: 'icon-btn',
                        type: 'button',
                        'aria-label': 'Move up',
                        disabled: index === 0,
                        onclick: () => move(index, -1),
                    }, [icon('up', { size: 18 })]),
                    el('button', {
                        class: 'icon-btn',
                        type: 'button',
                        'aria-label': 'Move down',
                        disabled: index === steps.length - 1,
                        onclick: () => move(index, 1),
                    }, [icon('down', { size: 18 })]),
                    el('button', {
                        class: 'icon-btn danger',
                        type: 'button',
                        'aria-label': 'Remove step',
                        onclick: () => {
                            steps.splice(index, 1);
                            render();
                        },
                    }, [icon('close', { size: 18 })]),
                ]),
            ]),
            detail,
            daysControl(step),
        ]);
    };

    const daysControl = (step) => {
        const holder = el('div', { class: 'step-days' });

        const draw = () => {
            clear(holder);
            if (!step.days) {
                holder.append(
                    el('button', {
                        class: 'link-btn',
                        type: 'button',
                        text: 'Only on some days…',
                        onclick: () => {
                            step.days = [0, 1, 2, 3, 4, 5, 6];
                            draw();
                        },
                    }),
                );
                return;
            }

            const chips = DAY_LETTERS.map((letter, day) =>
                el('button', {
                    class: `habit-chip small${step.days.includes(day) ? ' on' : ''}`,
                    type: 'button',
                    text: letter,
                    'aria-label': DAY_NAMES[day],
                    'aria-pressed': String(step.days.includes(day)),
                    onclick: () => {
                        step.days = step.days.includes(day)
                            ? step.days.filter((d) => d !== day)
                            : [...step.days, day];
                        draw();
                    },
                }),
            );
            holder.append(
                el('div', { class: 'habit-chips' }, chips),
                el('button', {
                    class: 'link-btn',
                    type: 'button',
                    text: 'Every day',
                    onclick: () => {
                        step.days = null;
                        draw();
                    },
                }),
            );
        };

        draw();
        return holder;
    };

    const add = el('button', {
        class: 'btn btn-outline btn-block btn-small',
        type: 'button',
        text: '+ Add step',
        onclick: () => {
            steps.push({ text: '', detail: '', days: null });
            render();
            list.lastElementChild?.querySelector('input')?.focus();
        },
    });

    render();

    return {
        node: el('div', { class: 'step-editor' }, [list, add]),
        count: () => steps.filter((step) => step.text?.trim()).length,
        // A step limited to no days at all would never appear; treat it as every day.
        value: () =>
            steps.map(({ id, text, detail, days }) => ({
                id,
                text,
                detail,
                days: days && days.length ? days : null,
            })),
    };
}
