import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { icon } from '../life/icons.js';
import { lifeDb } from '../life/db.js';
import { shareOrDownload } from '../life/share.js';
import { localDayId } from '../life/dates.js';
import { state, loadTasks, addTask, updateTask, setDone, deleteTask, bumpCalendarSequence } from './store.js';
import { groupTasks, taskDateLabel, isOverdue } from './organize.js';
import { taskToIcs, icsFilename } from './ics.js';

/**
 * Tasks: a due-date to-do list. A task is bucketed by how soon it's due
 * (Overdue, Today, Tomorrow, This week, Later), and can be sent to the real
 * Calendar app as a `.ics` file — there's no way for a home-screen web app to
 * write into Calendar directly, so this hands the OS a file the same way
 * Backup hands over a JSON one (`life/share.js`), and the Share Sheet (or a
 * matching app) takes it from there.
 *
 * Same conventions as the other sections: no reactivity, every write reloads
 * and re-renders. Recurring to-dos belong in Habits — this is only for
 * something with an actual date.
 */

let ready = null;

/** Opens LifeDB. Safe to call repeatedly. */
export function initTasks() {
    ready ??= lifeDb.init().catch((error) => {
        ready = null;
        throw error;
    });
    return ready;
}

/** Called each time the section is opened. `'add'` opens the add sheet straight away. */
export async function enterTasks(action = null) {
    await initTasks();
    await loadTasks();
    renderTasks();
    if (action === 'add') openTaskModal();
}

async function refresh() {
    await loadTasks();
    renderTasks();
}

/** Runs a write and reports a failure without losing the screen. Returns whether it worked. */
async function attempt(action) {
    try {
        await action();
        return true;
    } catch (error) {
        console.error(error);
        toast('Couldn’t save that');
        return false;
    }
}

const fmtTime = (time) => {
    const [hour, minute] = time.split(':').map(Number);
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

// --- Screen ------------------------------------------------------------------

export function renderTasks() {
    const today = localDayId();
    const body = clear($('#tasks-body'));

    if (!state.tasks.length) {
        body.append(emptyState());
        body.append(addButton());
        return;
    }

    const { groups, done } = groupTasks(state.tasks, today);
    body.append(...groups.map((group) => bucketSection(group, today)));
    if (done.length) body.append(doneSection(done, today));
    body.append(addButton());
}

function addButton() {
    return el('button', {
        class: 'btn btn-outline btn-block spaced',
        type: 'button',
        text: '+ Add task',
        onclick: () => openTaskModal(),
    });
}

function emptyState() {
    return el('div', { class: 'life-empty' }, [
        el('span', { class: 'life-empty-icon' }, [icon('calendar', { size: 26 })]),
        el('p', { class: 'life-empty-title', text: 'Nothing due' }),
        el('p', {
            class: 'life-empty-text',
            text: 'Add something you need to do on a certain day, with a note and — if you want — a calendar reminder.',
        }),
    ]);
}

function bucketSection(group, today) {
    return el('section', { class: `task-bucket${group.bucket === 'overdue' ? ' overdue' : ''}` }, [
        el('h2', { class: 'task-bucket-title', text: group.label }),
        el('div', { class: 'life-list' }, group.tasks.map((task) => taskRow(task, today))),
    ]);
}

function doneSection(done, today) {
    return el('section', { class: 'task-bucket task-bucket-done' }, [
        el('h2', { class: 'task-bucket-title', text: 'Done' }),
        el('div', { class: 'life-list' }, done.map((task) => taskRow(task, today))),
    ]);
}

function taskMeta(task, today) {
    const parts = [taskDateLabel(task.date, today)];
    if (task.time) parts.push(fmtTime(task.time));
    if (task.note?.trim()) parts.push(task.note.trim());
    return parts.join(' · ');
}

function taskRow(task, today) {
    const overdue = isOverdue(task, today);

    return el('div', { class: `task-row${task.done ? ' done' : ''}${overdue ? ' overdue' : ''}` }, [
        el('button', {
            class: 'task-check',
            type: 'button',
            'aria-pressed': String(task.done),
            'aria-label': `${task.title}, ${task.done ? 'done' : 'not done'}`,
            onclick: () => toggleDone(task),
        }, [task.done ? icon('check', { size: 16 }) : null]),
        el('button', { class: 'task-main', type: 'button', onclick: () => openTaskModal(task) }, [
            el('span', { class: 'task-text' }, [
                el('span', { class: 'task-title', text: task.title }),
                el('span', { class: 'task-meta', text: taskMeta(task, today) }),
            ]),
        ]),
        el('button', {
            class: 'icon-btn task-calendar',
            type: 'button',
            'aria-label': `Add “${task.title}” to your calendar`,
            onclick: () => addToCalendar(task),
        }, [icon('calendar', { size: 18 })]),
    ]);
}

async function toggleDone(task) {
    if (!(await attempt(() => setDone(task, !task.done)))) return;
    await refresh();
}

// --- Calendar export -----------------------------------------------------------
//
// iOS Calendar isn't a registered Share Sheet target for an arbitrary file —
// confirmed on a real phone — so sharing the .ics never had a way to actually
// add it. What iOS *does* recognise is a text/calendar resource opened as a
// same-window, same-tab navigation — the same mechanism as a tel: or mailto:
// link: WebKit intercepts it before any page actually loads and shows its own
// "Add Event" screen instead, leaving this page right where it was. That's
// the technique behind every "Add to calendar" button on the web.
//
// window.open() does NOT get this treatment — confirmed on a real phone, it
// just opens a new tab that sits there trying (and failing) to render
// "data:" as a page, since a *new browsing context* isn't what iOS's
// calendar-mime interception watches for. So this has to be a real anchor
// click with no target, navigating the current window/tab.
//
// A blob: URL, not a data: one — also confirmed on a real phone: WebKit
// silently blocks top-level navigation to a data: URI outright (an
// anti-phishing measure against data: links spoofing real pages), so the
// click was simply a no-op. blob: isn't a data: URI and isn't blocked the
// same way. The reason a data: URI was used originally — window.open()
// handing off to a separate browsing context where a page-scoped blob: URL
// might not resolve — no longer applies now this is a same-window click.

/** Records that this task's calendar export was sent, so a later one updates the same event rather than duplicating it. */
async function recordCalendarExport(task) {
    if (!(await attempt(() => bumpCalendarSequence(task)))) return;
    await refresh();

    // The sheet may still be open on this task — refresh it too, so its
    // button relabels from "Add to Calendar" to "Update calendar event".
    if ($('#task-modal').classList.contains('active')) {
        const current = state.tasks.find((existing) => existing.id === task.id);
        if (current) openTaskModal(current);
    }
}

/**
 * Opens the task directly as a calendar file, via a real anchor click rather
 * than window.open() (see above) — and, like Share further down, with
 * nothing awaited beforehand, or Safari can treat the tap as not
 * user-initiated and silently ignore it.
 */
async function addToCalendar(task) {
    const sequence = (task.calendarSequence ?? 0) + 1;
    const text = taskToIcs({ ...task, calendarSequence: sequence });
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));

    const link = el('a', { href: url, style: 'display:none' });
    document.body.append(link);
    link.click();
    link.remove();
    // Give the navigation/hand-off a moment to actually pick the blob up
    // before freeing it — revoking immediately can race it.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);

    // There's no signal back from this (same as a tel: or mailto: link) —
    // just that the tap happened, not that Calendar actually opened.
    toast('Opening in Calendar…');
    await recordCalendarExport(task);
}

/**
 * The fallback for when the direct open doesn't do the right thing (a
 * different browser, an older iOS, a popup blocker): the same Save-to-Files
 * hand-off Backup already uses. From Files, opening the saved file still
 * gets you to Calendar's own "Add Event" screen — just as a second tap
 * instead of one.
 */
async function shareCalendarFile(task) {
    const sequence = (task.calendarSequence ?? 0) + 1;
    const text = taskToIcs({ ...task, calendarSequence: sequence });
    const file = new File([text], icsFilename(task.title), { type: 'text/calendar' });

    let outcome;
    try {
        outcome = await shareOrDownload(file, task.title);
    } catch (error) {
        console.error(error);
        toast('Couldn’t create the calendar file');
        return;
    }
    if (outcome === 'cancelled') return;

    toast(outcome === 'shared' ? 'Shared — open it from Files to add it to Calendar' : 'Calendar file downloaded');
    await recordCalendarExport(task);
}

// --- Add / edit sheet ----------------------------------------------------------

function openTaskModal(task = null) {
    $('#task-modal-title').textContent = task ? 'Edit task' : 'New task';
    clear($('#task-body')).append(taskForm(task));
    openModal('task-modal');
}

/** A checkbox that reveals a time input — an optional value, not just an optional-looking field. */
function timeField(existingTime) {
    const hasTime = existingTime != null;
    const checkbox = el('input', { type: 'checkbox' });
    checkbox.checked = hasTime;
    const input = el('input', { class: 'form-input', type: 'time', value: existingTime ?? '', hidden: !hasTime });

    checkbox.addEventListener('change', () => {
        input.hidden = !checkbox.checked;
        if (checkbox.checked && !input.value) input.value = '09:00';
    });

    return {
        node: el('div', { class: 'stepper-field' }, [
            el('label', { class: 'life-check' }, [checkbox, el('span', { text: 'Set a time' })]),
            input,
        ]),
        value: () => (checkbox.checked ? input.value : null),
    };
}

function taskForm(task) {
    const today = localDayId();
    const title = el('input', { class: 'form-input', type: 'text', placeholder: 'What needs doing', maxlength: 120, value: task?.title ?? '' });
    const date = el('input', { class: 'form-input', type: 'date', value: task?.date ?? today });
    const time = timeField(task?.time ?? null);
    const note = el('textarea', { class: 'form-input', rows: 2, placeholder: 'Note (optional)', maxlength: 240, value: task?.note ?? '' });
    const done = el('input', { type: 'checkbox' });
    done.checked = Boolean(task?.done);

    const submit = async (event) => {
        event.preventDefault();
        if (!title.value.trim()) {
            toast('Give it a title');
            title.focus();
            return;
        }
        if (!date.value) {
            toast('Pick a date');
            date.focus();
            return;
        }

        const values = { title: title.value, date: date.value, time: time.value(), note: note.value };

        if (task) {
            const ok = await attempt(async () => {
                const updated = await updateTask(task, values);
                if (done.checked !== task.done) await setDone(updated, done.checked);
            });
            if (!ok) return;
            closeModal('task-modal');
            await refresh();
            toast('Task updated');
        } else {
            let created;
            const ok = await attempt(async () => {
                created = await addTask(values);
            });
            if (!ok) return;
            await refresh();
            toast('Task added');
            // Reopen the same sheet in edit mode for the task just created,
            // so Add to Calendar is right there without a second trip.
            openTaskModal(created);
        }
    };

    const remove = async () => {
        const ok = await confirmSheet({
            title: 'Delete task',
            message: `Remove “${task.title}”?`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        if (!(await attempt(() => deleteTask(task.id)))) return;
        closeModal('task-modal');
        await refresh();
        toast('Task deleted');
    };

    const fields = [
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Title' }), title]),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Date' }), date]),
        time.node,
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Note' }), note]),
    ];

    if (task) {
        fields.push(el('label', { class: 'life-check' }, [done, el('span', { text: 'Done' })]));
        fields.push(
            el('div', { class: 'task-calendar-actions' }, [
                el('button', {
                    class: 'btn btn-outline btn-block',
                    type: 'button',
                    text: task.calendarSequence > 0 ? 'Update calendar event' : 'Add to Calendar',
                    onclick: () => addToCalendar(task),
                }),
                el('button', {
                    class: 'link-btn',
                    type: 'button',
                    text: 'Share the file instead',
                    onclick: () => shareCalendarFile(task),
                }),
            ]),
        );
    }

    fields.push(
        el('div', { class: 'modal-actions sheet-actions' }, [
            task ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: remove }) : null,
            el('button', { class: 'btn btn-primary', type: 'submit', text: task ? 'Save' : 'Add' }),
        ]),
    );

    return el('form', { class: 'task-form', onsubmit: submit }, fields);
}
