import { $, el, clear, openModal, closeModal, toast } from '../life/dom.js';
import { icon } from '../life/icons.js';
import { dayLabel } from '../life/dates.js';
import { tickedSteps, setStepDone } from './store.js';
import { routineProgress, stepApplies, stepDaysLabel } from './routine.js';

/**
 * The checklist for a routine on one day: every step in order, ticked as you
 * go. Opened from Habits and from Today, so it lives on its own; the caller
 * passes `onChange` to redraw whatever opened it. Ticking the last step ticks
 * the routine itself and closes the sheet.
 */

let current = null;

export function openRoutine(habit, day, { onChange } = {}) {
    current = { habit, day, onChange };
    render();
    openModal('routine-modal');
}

function render() {
    const { habit, day } = current;
    const ticked = tickedSteps(habit.id, day);
    const progress = routineProgress(habit, ticked, day);

    $('#routine-title').textContent = habit.name;
    $('#routine-sub').textContent = progress.complete
        ? `${dayLabel(day)} · all done`
        : `${dayLabel(day)} · ${progress.done} of ${progress.total} steps`;

    let number = 0;
    const rows = habit.steps.map((step) => {
        const applies = stepApplies(step, day);
        if (applies) number += 1;
        return stepRow(step, applies ? number : null, ticked.has(step.id));
    });

    clear($('#routine-body')).append(
        habit.note ? el('p', { class: 'routine-note', text: habit.note }) : null,
        el('div', { class: 'habits-track routine-track' }, [
            el('div', {
                class: 'habits-fill',
                style: `width: ${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
            }),
        ]),
        el('div', { class: 'life-list routine-steps' }, rows),
    );
}

/** `number` is null for a step that doesn't apply today: shown, but not tickable. */
function stepRow(step, number, done) {
    const skipped = number === null;
    const daysLabel = stepDaysLabel(step);

    return el(
        'button',
        {
            class: `routine-step${done && !skipped ? ' done' : ''}${skipped ? ' skipped' : ''}`,
            type: 'button',
            disabled: skipped,
            'aria-pressed': String(done && !skipped),
            onclick: () => tick(step, !done),
        },
        [
            el('span', { class: 'routine-tick' }, [
                done && !skipped ? icon('check', { size: 16 }) : el('span', { text: skipped ? '–' : String(number) }),
            ]),
            el('span', { class: 'routine-step-text' }, [
                el('span', { class: 'routine-step-title', text: step.text }),
                step.detail ? el('span', { class: 'routine-step-detail', text: step.detail }) : null,
                daysLabel
                    ? el('span', { class: 'routine-step-days', text: skipped ? `Not today · ${daysLabel}` : daysLabel })
                    : null,
            ]),
        ],
    );
}

async function tick(step, done) {
    const { habit, day, onChange } = current;
    const wasComplete = routineProgress(habit, tickedSteps(habit.id, day), day).complete;

    let progress;
    try {
        progress = await setStepDone(habit, day, step.id, done);
    } catch (error) {
        console.error(error);
        toast('Couldn’t save that');
        return;
    }

    render();
    onChange?.();

    if (progress.complete && !wasComplete) {
        toast(`${habit.name} done`);
        // A beat to see the last tick land before the sheet goes.
        setTimeout(() => {
            if (current?.habit.id === habit.id) closeModal('routine-modal');
        }, 500);
    }
}
