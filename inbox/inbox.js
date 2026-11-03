import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { lifeDb } from '../life/db.js';
import { localDayId, dayLabel } from '../life/dates.js';
import { icon } from '../life/icons.js';
import { state, loadNotes, addNote, updateNote, deleteNote } from './store.js';
import { parseTags, allTags, sortNotes, filterNotes, noteToTask } from './organize.js';
import { addTask } from '../tasks/store.js';

/**
 * Inbox: a place to get things out of your head fast — ideas, things to
 * remember, half-plans — and sort them later with #tags written into the note.
 * Same conventions as the other sections: no reactivity, every write reloads.
 * The capture box is built once per visit and the list redraws beneath it, so
 * saving a note or typing a search never loses the keyboard.
 */

let ready = null;

/** Opens LifeDB. Safe to call repeatedly. */
export function initInbox() {
    ready ??= lifeDb.init().catch((error) => {
        ready = null;
        throw error;
    });
    return ready;
}

/** Called each time the section is opened. `'new'` puts the cursor straight in the capture box. */
export async function enterInbox(action = null) {
    await initInbox();
    await loadNotes();
    state.query = '';
    state.tag = null;
    renderInbox();
    if (action === 'new') $('#inbox-body .inbox-capture-text')?.focus();
}

const noteDay = (note) => dayLabel(localDayId(new Date(note.createdAt)), localDayId());

// --- Screen -----------------------------------------------------------------------

export function renderInbox() {
    clear($('#inbox-body')).append(captureCard(), filters(), el('div', { class: 'inbox-list-slot' }));
    refreshList();
}

/** Redraws the tag chips and the list, leaving the capture box and search field alone. */
function refreshList() {
    const chips = document.querySelector('#inbox-body .inbox-tags');
    if (chips) chips.replaceWith(tagChips());
    const slot = document.querySelector('#inbox-body .inbox-list-slot');
    if (slot) slot.replaceChildren(noteList());
}

function captureCard() {
    const text = el('textarea', {
        class: 'form-input inbox-capture-text',
        rows: 3,
        maxlength: 4000,
        placeholder: 'Jot something down… add #tags to sort it',
        'aria-label': 'New note',
    });
    const saveBtn = el('button', { class: 'btn btn-primary btn-small', type: 'button', text: 'Save', disabled: true });
    text.addEventListener('input', () => {
        saveBtn.disabled = !text.value.trim();
    });
    saveBtn.addEventListener('click', async () => {
        if (!text.value.trim()) return;
        try {
            await addNote(text.value);
        } catch (error) {
            console.error(error);
            toast('Couldn’t save that');
            return;
        }
        text.value = '';
        saveBtn.disabled = true;
        text.focus();
        toast('Saved');
        refreshList();
    });

    return el('section', { class: 'life-surface inbox-capture' }, [text, el('div', { class: 'inbox-capture-actions' }, [saveBtn])]);
}

function filters() {
    const search = el('input', {
        class: 'form-input inbox-search',
        type: 'search',
        placeholder: 'Search notes',
        autocomplete: 'off',
        'aria-label': 'Search notes',
        value: state.query,
    });
    search.addEventListener('input', () => {
        state.query = search.value;
        refreshList();
    });
    return el('div', { class: 'inbox-filters' }, [search, tagChips()]);
}

function tagChips() {
    const tags = allTags(state.notes);
    // A tag that no note uses any more can't stay selected.
    if (state.tag && !tags.some((tag) => tag.key === state.tag)) state.tag = null;
    if (!tags.length) return el('div', { class: 'inbox-tags', hidden: true });

    const chip = (key, label) =>
        el('button', {
            type: 'button',
            class: `inbox-tag${state.tag === key ? ' active' : ''}`,
            'aria-pressed': String(state.tag === key),
            text: label,
            onclick: () => {
                state.tag = state.tag === key ? null : key;
                refreshList();
            },
        });

    return el('div', { class: 'inbox-tags', role: 'group', 'aria-label': 'Filter by tag' }, [
        chip(null, 'All'),
        ...tags.map((tag) => chip(tag.key, `#${tag.label}`)),
    ]);
}

function noteList() {
    if (!state.notes.length) {
        return el('div', { class: 'life-empty' }, [
            el('span', { class: 'life-empty-icon' }, [icon('inbox', { size: 26 })]),
            el('p', { class: 'life-empty-title', text: 'Clear head, empty inbox' }),
            el('p', { class: 'life-empty-text', text: 'Anything you don’t want to forget goes here. Sort it later with #tags.' }),
        ]);
    }

    const shown = sortNotes(filterNotes(state.notes, { query: state.query, tag: state.tag }));
    if (!shown.length) return el('p', { class: 'hint inbox-none', text: 'No notes match that.' });

    return el('div', { class: 'life-list inbox-list' }, shown.map(noteRow));
}

function noteRow(note) {
    const tags = parseTags(note.text);
    return el(
        'button',
        { class: `inbox-note${note.pinned ? ' pinned' : ''}`, type: 'button', onclick: () => openNoteSheet(note) },
        [
            el('span', { class: 'inbox-note-text', text: note.text }),
            el('span', { class: 'inbox-note-meta' }, [
                note.pinned ? el('span', { class: 'inbox-pin', text: 'Pinned' }) : null,
                el('span', { text: noteDay(note) }),
                ...tags.map((tag) => el('span', { class: 'inbox-note-tag', text: `#${tag}` })),
            ]),
        ],
    );
}

// --- The note sheet ---------------------------------------------------------------

function openNoteSheet(note) {
    const text = el('textarea', { class: 'form-input inbox-edit-text', rows: 8, maxlength: 4000, value: note.text, 'aria-label': 'Note' });

    const run = async (work, message) => {
        try {
            await work();
        } catch (error) {
            console.error(error);
            toast('Couldn’t save that');
            return;
        }
        closeModal('note-modal');
        if (message) toast(message);
        refreshList();
    };

    const save = () => {
        if (!text.value.trim()) {
            toast('A note needs some text — or delete it');
            return;
        }
        run(() => updateNote(note, { text: text.value }), text.value.trim() === note.text ? null : 'Saved');
    };

    const togglePin = () => run(() => updateNote(note, { text: text.value.trim() ? text.value : note.text, pinned: !note.pinned }), note.pinned ? 'Unpinned' : 'Pinned');

    const makeTask = () => {
        const body = text.value.trim() || note.text;
        const { title, note: taskNote } = noteToTask(body);
        run(() => addTask({ title, date: localDayId(), time: null, note: taskNote }), 'Added to Tasks for today — change the date there');
    };

    const remove = async () => {
        const ok = await confirmSheet({ title: 'Delete note', message: 'This note will be removed.', confirmLabel: 'Delete', danger: true });
        if (ok) run(() => deleteNote(note.id), 'Note deleted');
    };

    $('#note-modal-title').textContent = noteDay(note);
    clear($('#note-body')).append(
        el('div', { class: 'inbox-edit' }, [
            text,
            el('div', { class: 'inbox-edit-links' }, [
                el('button', { class: 'link-btn', type: 'button', text: note.pinned ? 'Unpin' : 'Pin to top', onclick: togglePin }),
                el('button', { class: 'link-btn', type: 'button', text: 'Make it a task', onclick: makeTask }),
            ]),
            el('div', { class: 'modal-actions' }, [
                el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: remove }),
                el('button', { class: 'btn btn-primary', type: 'button', text: 'Save', onclick: save }),
            ]),
        ]),
    );
    openModal('note-modal');
}
