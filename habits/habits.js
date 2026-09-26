import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { lifeDb } from '../life/db.js';
import { localDayId, addDays, dayLabel, weekStartId } from '../life/dates.js';
import { dayBar } from '../life/daybar.js';
import { icon } from '../life/icons.js';
import {
    state,
    loadHabits,
    loadLogs,
    loadTicks,
    doneDays,
    tickedSteps,
    addHabit,
    updateHabit,
    deleteHabit,
    toggleHabit,
} from './store.js';
import { EVERY_DAY, isScheduled, currentStreak, longestStreak, weekCells, weekTally } from './streaks.js';
import { isRoutine, routineProgress } from './routine.js';
import { openRoutine } from './routine-sheet.js';
import { stepEditor } from './step-editor.js';

/**
 * Habits: recurring things you tick off. Two views of the same data — Today
 * (a checklist for one day, with streaks) and Week (a seven-day grid per habit).
 * Both let you step back in time to tick something you forgot. A habit with
 * steps is a routine: pressing it opens its checklist (routine-sheet.js)
 * instead of ticking it. Same conventions as the other sections: no
 * reactivity, so every change re-renders.
 */

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WEEKDAYS = [0, 1, 2, 3, 4];

let ready = null;

/** Opens LifeDB. Safe to call repeatedly. */
export function initHabits() {
    ready ??= lifeDb.init().catch((error) => {
        ready = null;
        throw error;
    });
    return ready;
}

/** Called each time the section is opened; always starts on today's checklist. `'new'` opens the add sheet. */
export async function enterHabits(action = null) {
    await initHabits();
    await Promise.all([loadHabits(), loadLogs(), loadTicks()]);

    const today = localDayId();
    state.view = 'today';
    state.day = today;
    state.week = weekStartId(today);
    renderHabits();
    if (action === 'new') openHabitModal();
}

/** Runs a write, then redraws either way. Returns whether it worked. */
async function save(action) {
    let ok = true;
    try {
        await action();
    } catch (error) {
        console.error(error);
        toast('Couldn’t save that');
        ok = false;
    }
    renderHabits();
    return ok;
}

// --- Screen ---------------------------------------------------------------

export function renderHabits() {
    const body = clear($('#habits-body'));

    body.append(viewSwitch());
    if (!state.habits.length) {
        body.append(emptyState());
    } else {
        body.append(state.view === 'today' ? todayView() : weekView());
    }
    body.append(
        el('button', {
            class: 'btn btn-outline btn-block spaced',
            type: 'button',
            text: '+ New habit',
            onclick: () => openHabitModal(),
        }),
    );
}

function viewSwitch() {
    const tab = (view, label) =>
        el('button', {
            type: 'button',
            class: state.view === view ? 'active' : '',
            text: label,
            onclick: () => {
                state.view = view;
                renderHabits();
            },
        });

    return el('div', { class: 'segmented habits-switch' }, [tab('today', 'Today'), tab('week', 'Week')]);
}

function emptyState() {
    return el('div', { class: 'life-empty' }, [
        el('span', { class: 'life-empty-icon' }, [icon('habits', { size: 26 })]),
        el('p', { class: 'life-empty-title', text: 'Start small' }),
        el('p', { class: 'life-empty-text', text: 'Add something you want to do regularly: every day, or just on certain days.' }),
    ]);
}

/** "3 in a row" with a flame, or nothing for a streak that hasn't started. */
function streakBadge(n) {
    if (n < 1) return null;
    return el('span', { class: 'habit-streak' }, [icon('flame', { size: 14 }), `${n} in a row`]);
}

// --- Today ------------------------------------------------------------------

function todayView() {
    const today = localDayId();
    const due = state.habits.filter((habit) => isScheduled(habit, state.day));
    const doneCount = due.filter((habit) => doneDays(habit.id).has(state.day)).length;

    const view = el('div', { class: 'habits-view' }, [
        dayBar({
            label: dayLabel(state.day, today),
            canNext: state.day < today,
            onPrev: () => shiftDay(-1),
            onNext: () => shiftDay(1),
        }),
    ]);

    if (!due.length) {
        view.append(el('p', { class: 'hint', text: 'Nothing scheduled for this day.' }));
        return view;
    }

    view.append(
        el('div', { class: 'habits-summary' }, [
            el('div', { class: 'habits-summary-head' }, [
                el('span', { class: 'habits-summary-title', text: doneCount === due.length ? 'All done' : 'Done' }),
                el('span', { class: 'habits-summary-count', text: `${doneCount} of ${due.length}` }),
            ]),
            el('div', { class: 'habits-track' }, [
                el('div', {
                    class: `habits-fill${doneCount === due.length ? ' complete' : ''}`,
                    style: `width: ${(doneCount / due.length) * 100}%`,
                }),
            ]),
        ]),
        el('div', { class: 'life-list' }, due.map((habit) => habitRow(habit, today))),
    );
    return view;
}

function shiftDay(direction) {
    state.day = addDays(state.day, direction);
    renderHabits();
}

function habitRow(habit, today) {
    const done = doneDays(habit.id).has(state.day);
    // A streak is "as of now", so it only belongs on today's checklist, not on a past day.
    const streak = state.day === today ? streakBadge(currentStreak(habit, doneDays(habit.id), today)) : null;
    const routine = isRoutine(habit);
    const progress = routine ? routineProgress(habit, tickedSteps(habit.id, state.day), state.day) : null;

    // A routine's circle shows how far through it you are until it's done.
    const circle = done
        ? icon('check', { size: 17 })
        : progress?.done
          ? el('span', { class: 'habit-circle-count', text: String(progress.done) })
          : null;

    const sub = routine
        ? el('span', { class: 'habit-sub' }, [
            icon('list', { size: 14 }),
            done ? `${progress.total} steps · done` : `${progress.done} of ${progress.total} steps`,
        ])
        : habit.note
          ? el('span', { class: 'habit-sub habit-note', text: habit.note })
          : null;

    return el('div', { class: `habit-row${done ? ' done' : ''}${routine ? ' routine' : ''}` }, [
        el(
            'button',
            {
                class: 'habit-check',
                type: 'button',
                'aria-pressed': String(done),
                'aria-label': routine
                    ? `${habit.name}, ${progress.done} of ${progress.total} steps. Open checklist`
                    : `${habit.name}, ${done ? 'done' : 'not done'}`,
                onclick: () =>
                    routine
                        ? openRoutine(habit, state.day, { onChange: renderHabits })
                        : save(() => toggleHabit(habit, state.day)),
            },
            [
                el('span', { class: 'habit-circle' }, [circle]),
                el('span', { class: 'habit-text' }, [el('span', { class: 'habit-name', text: habit.name }), sub, streak]),
                routine ? icon('chevron', { size: 18, className: 'habit-open' }) : null,
            ],
        ),
        el('button', {
            class: 'icon-btn',
            type: 'button',
            'aria-label': `Edit ${habit.name}`,
            text: '⋯',
            onclick: () => openHabitModal(habit),
        }),
    ]);
}

// --- Week -------------------------------------------------------------------

function weekView() {
    const today = localDayId();
    const thisWeek = weekStartId(today);

    const view = el('div', { class: 'habits-view' }, [
        dayBar({
            label: state.week === thisWeek ? 'This week' : `Week of ${dayLabel(state.week, today)}`,
            canNext: state.week < thisWeek,
            onPrev: () => shiftWeek(-7),
            onNext: () => shiftWeek(7),
        }),
    ]);

    view.append(el('div', { class: 'stack' }, state.habits.map((habit) => weekCard(habit, today))));
    return view;
}

function shiftWeek(days) {
    state.week = addDays(state.week, days);
    renderHabits();
}

function weekCard(habit, today) {
    const done = doneDays(habit.id);
    const cells = weekCells(habit, done, state.week, today);
    const tally = weekTally(cells);
    const best = longestStreak(habit, done, today);

    return el('div', { class: 'habit-week' }, [
        el('div', { class: 'habit-week-head' }, [
            el('span', { class: 'habit-name', text: habit.name }),
            el('span', { class: 'habit-week-tally', text: tally.due ? `${tally.done} of ${tally.due}` : '—' }),
        ]),
        el(
            'div',
            { class: 'habit-week-grid' },
            cells.map((cell, index) => weekCell(habit, cell, index)),
        ),
        best > 0 ? el('div', { class: 'habit-week-best', text: `Best run: ${best}` }) : null,
    ]);
}

function weekCell(habit, cell, index) {
    // Off and future days can't be ticked; a due day up to today can, which
    // is how a forgotten one gets filled in.
    const tappable = ['done', 'open', 'missed'].includes(cell.state);

    return el('div', { class: 'habit-cell-col' }, [
        el('span', { class: 'habit-cell-letter', text: DAY_LETTERS[index] }),
        el('button', {
            class: `habit-cell ${cell.state}`,
            type: 'button',
            disabled: !tappable,
            'aria-label': `${habit.name}, ${DAY_NAMES[index]}, ${cell.state === 'off' ? 'not scheduled' : cell.state}`,
            onclick: () => save(() => toggleHabit(habit, cell.day)),
        }, [cell.state === 'done' ? icon('check', { size: 16 }) : null]),
    ]);
}

// --- Add / edit sheet ---------------------------------------------------------

function openHabitModal(habit = null) {
    $('#habit-modal-title').textContent = habit ? (isRoutine(habit) ? 'Edit routine' : 'Edit habit') : 'New habit';
    clear($('#habit-body')).append(habitForm(habit));
    openModal('habit-modal');
}

function habitForm(habit) {
    const selected = new Set(habit?.days ?? EVERY_DAY);

    const name = el('input', {
        class: 'form-input',
        type: 'text',
        placeholder: 'e.g. Stretch for 10 minutes',
        autocomplete: 'off',
        maxlength: 40,
        value: habit?.name ?? '',
    });

    const chips = DAY_LETTERS.map((letter, index) =>
        el('button', {
            class: 'habit-chip',
            type: 'button',
            'aria-label': DAY_NAMES[index],
            text: letter,
            onclick: () => {
                if (selected.has(index)) selected.delete(index);
                else selected.add(index);
                sync();
            },
        }),
    );

    const sync = () =>
        chips.forEach((chip, index) => {
            const on = selected.has(index);
            chip.classList.toggle('on', on);
            chip.setAttribute('aria-pressed', String(on));
        });

    const note = el('input', {
        class: 'form-input',
        type: 'text',
        placeholder: 'e.g. 30–60 min before a shower',
        autocomplete: 'off',
        maxlength: 140,
        value: habit?.note ?? '',
    });

    // Steps turn a habit into a routine. Hidden behind a link for a plain
    // habit so the common case stays short; open straight away for a routine.
    const editor = stepEditor(habit?.steps ?? []);
    const stepsBody = el('div', { class: 'habit-steps-body', hidden: !habit?.steps?.length }, [
        el('p', { class: 'hint', text: 'Pressing a habit with steps opens them as a checklist. Ticking the last step ticks the habit.' }),
        editor.node,
    ]);
    const stepsOpen = el('button', {
        class: 'link-btn',
        type: 'button',
        text: '+ Add steps (make it a routine)',
        hidden: Boolean(habit?.steps?.length),
        onclick: () => {
            stepsOpen.hidden = true;
            stepsBody.hidden = false;
            if (!editor.count()) editor.node.querySelector('.btn')?.click();
        },
    });

    const preset = (label, days) =>
        el('button', {
            class: 'link-btn',
            type: 'button',
            text: label,
            onclick: () => {
                selected.clear();
                days.forEach((day) => selected.add(day));
                sync();
            },
        });

    const submit = async (event) => {
        event.preventDefault();
        if (!name.value.trim()) {
            toast('Give it a name');
            name.focus();
            return;
        }
        if (!selected.size) {
            toast('Pick at least one day');
            return;
        }

        const values = { name: name.value, days: [...selected], note: note.value, steps: editor.value() };
        closeModal('habit-modal');

        if (habit) {
            await save(() => updateHabit(habit, values));
        } else {
            // A new habit starts today, so it only exists from today onwards.
            state.day = localDayId();
            if (await save(() => addHabit(values))) toast(`Added ${values.name.trim()}`);
        }
    };

    const remove = async () => {
        const ok = await confirmSheet({
            title: 'Delete habit',
            message: `“${habit.name}” and its whole history will be removed.`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        closeModal('habit-modal');
        if (await save(() => deleteHabit(habit.id))) toast('Habit deleted');
    };

    sync();

    return el('form', { class: 'habit-form', onsubmit: submit }, [
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Name' }), name]),
        el('div', { class: 'stepper-field' }, [
            el('span', { class: 'stepper-label', text: 'Repeats on' }),
            el('div', { class: 'habit-chips' }, chips),
            el('div', { class: 'habit-presets' }, [preset('Every day', EVERY_DAY), preset('Weekdays', WEEKDAYS)]),
        ]),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Note (optional)' }), note]),
        el('div', { class: 'stepper-field' }, [
            el('span', { class: 'stepper-label', text: 'Steps' }),
            stepsOpen,
            stepsBody,
        ]),
        el('div', { class: 'modal-actions' }, [
            habit ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: remove }) : null,
            el('button', { class: 'btn btn-primary', type: 'submit', text: habit ? 'Save' : 'Add' }),
        ]),
    ]);
}
