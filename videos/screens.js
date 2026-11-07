import { el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { sound } from '../life/sound.js';
import { icon } from '../life/icons.js';
import { state, addScreen, updateScreen, setWatched, deleteScreen } from './screens-store.js';
import { groupScreensByGenre, isWatched, isWatching, kindLine, KINDS, KIND_LABEL } from './screens-organize.js';
import { state as videosState } from './store.js';
import { state as booksState } from './books-store.js';
import { existingTopics, UNCATEGORISED } from './organize.js';
import { cleanLink, linkHost } from '../life/links.js';

/**
 * Movies & TV — the middle tab of the Watch & Read section: films and series you
 * want to watch, grouped into free-text genres, ticked off when seen. A series can
 * carry where you are in it ("S2 E4"), which is what makes it "being watched".
 * The screen and its redraw belong to videos.js; this builds the tab and its
 * add/edit sheet, and asks `onChange` to reload and redraw after a write.
 */

let onChange = async () => {};
// Which kind the list shows: null (both), 'movie' or 'series'. Kept while you stay in the section.
let filter = null;

export function bindScreens(callback) {
    onChange = callback;
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

// --- The Movies & TV view -----------------------------------------------------------

export function screensView() {
    const nodes = [];
    if (!state.screens.length) {
        nodes.push(
            el('div', { class: 'life-empty' }, [
                el('span', { class: 'life-empty-icon' }, [icon('film', { size: 26 })]),
                el('p', { class: 'life-empty-title', text: 'Nothing to watch yet' }),
                el('p', { class: 'life-empty-text', text: 'Add a film or a series you want to see. Group them by any genre you like, note where you are in a series, and tick one off when you’ve finished.' }),
            ]),
        );
    } else {
        nodes.push(kindFilter());
        const groups = groupScreensByGenre(state.screens, filter);
        nodes.push(...(groups.length ? groups.map(genreSection) : [el('p', { class: 'hint screens-none', text: `No ${filter === 'series' ? 'series' : 'movies'} on your list.` })]));
    }
    nodes.push(el('button', { class: 'btn btn-outline btn-block spaced', type: 'button', text: '+ Add movie or series', onclick: () => openScreenSheet() }));
    return nodes;
}

function kindFilter() {
    const chip = (value, label) =>
        el('button', {
            type: 'button',
            class: filter === value ? 'active' : '',
            'aria-pressed': String(filter === value),
            text: label,
            onclick: () => {
                filter = value;
                onChange();
            },
        });
    return el('div', { class: 'segmented screens-filter', role: 'group', 'aria-label': 'Show' }, [chip(null, 'All'), chip('movie', 'Movies'), chip('series', 'Series')]);
}

function genreSection(group) {
    return el('section', { class: 'video-topic' }, [
        el('div', { class: 'video-topic-head' }, [
            el('h2', { class: 'video-topic-title', text: group.label }),
            group.toWatchCount > 0 ? el('span', { class: 'video-topic-count', text: `${group.toWatchCount} to watch` }) : null,
            el('button', {
                class: 'icon-btn',
                type: 'button',
                'aria-label': `Add a movie or series to “${group.label}”`,
                onclick: () => openScreenSheet(null, group.genre),
            }, [icon('plus', { size: 16 })]),
        ]),
        el('div', { class: 'life-list' }, group.items.map(screenRow)),
    ]);
}

function screenRow(item) {
    const watched = isWatched(item);
    const small = [kindLine(item), item.where, item.link ? linkHost(item.link) : null].filter(Boolean).join(' · ');
    return el('div', { class: `video-row book-row screen-row${watched ? ' watched' : ''}${isWatching(item) ? ' watching' : ''}` }, [
        el('button', {
            class: 'video-check',
            type: 'button',
            'aria-pressed': String(watched),
            'aria-label': `${item.title}, ${watched ? 'watched' : 'not watched yet'}`,
            onclick: async () => {
                if (await attempt(() => setWatched(item, !watched))) {
                    sound.tick(!watched);
                    await onChange();
                }
            },
        }, [watched ? icon('check', { size: 16 }) : null]),
        el('button', { class: 'book-main', type: 'button', onclick: () => openScreenSheet(item) }, [
            el('span', { class: 'video-text' }, [
                el('span', { class: 'video-title', text: item.title }),
                el('span', { class: 'video-note', text: small }),
                item.note ? el('span', { class: 'video-note', text: item.note }) : null,
            ]),
        ]),
    ]);
}

// --- Add / edit sheet ----------------------------------------------------------

function openScreenSheet(item = null, presetGenre = '') {
    document.getElementById('screen-modal-title').textContent = item ? 'Edit movie or series' : 'Add movie or series';
    clear(document.getElementById('screen-body')).append(screenForm(item, presetGenre));
    openModal('screen-modal');
}

/** Opens the add sheet straight away (the Today room's link). */
export const addScreenSheet = () => openScreenSheet();

function screenForm(item, presetGenre) {
    let kind = item?.kind ?? (filter === 'series' ? 'series' : 'movie');

    const title = el('input', { class: 'form-input', type: 'text', placeholder: 'Title', maxlength: 120, value: item?.title ?? '', autocomplete: 'off' });
    const kindButtons = KINDS.map((value) =>
        el('button', {
            type: 'button',
            dataset: { kind: value },
            text: KIND_LABEL[value],
            onclick: () => {
                kind = value;
                sync();
            },
        }),
    );

    const listId = 'screen-genre-options';
    const genre = el('input', {
        class: 'form-input',
        type: 'text',
        list: listId,
        placeholder: 'e.g. Thriller, Comedy, Documentary…',
        maxlength: 40,
        value: item?.genre ?? presetGenre,
    });
    // Genres already used by films and series are suggested (and the topics of videos and books, so names can be shared).
    const options = existingTopics([...state.screens.map((s) => ({ topic: s.genre })), ...videosState.videos, ...booksState.books]).map((name) => el('option', { value: name }));

    const where = el('input', { class: 'form-input', type: 'text', placeholder: 'Optional — Netflix, cinema, a friend’s copy…', maxlength: 40, value: item?.where ?? '', autocomplete: 'off' });
    const progress = el('input', { class: 'form-input', type: 'text', placeholder: 'Where you are — S2 E4', maxlength: 24, value: item?.progress ?? '', autocomplete: 'off' });
    const progressField = el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Progress' }), progress]);

    const link = el('input', {
        class: 'form-input',
        // Text with a URL keyboard, not type=url, which would block the submit before our own check runs.
        type: 'text',
        inputmode: 'url',
        placeholder: 'Optional — a trailer, a page',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: false,
        value: item?.link ?? '',
    });
    const note = el('textarea', { class: 'form-input', rows: 2, placeholder: 'Note (optional) — who recommended it', value: item?.note ?? '' });
    const watched = el('input', { type: 'checkbox' });
    watched.checked = Boolean(item && isWatched(item));
    const open = el('a', { class: 'link-btn book-open', target: '_blank', rel: 'noopener noreferrer', text: 'Open link', hidden: !item?.link });
    if (item?.link) open.href = item.link;

    // Progress only makes sense for a series.
    const sync = () => {
        kindButtons.forEach((button) => {
            const on = button.dataset.kind === kind;
            button.classList.toggle('active', on);
            button.setAttribute('aria-pressed', String(on));
        });
        progressField.hidden = kind !== 'series';
    };
    sync();

    const submit = async (event) => {
        event.preventDefault();
        if (!title.value.trim()) {
            toast('Give it a title');
            title.focus();
            return;
        }
        const address = cleanLink(link.value);
        if (address === null) {
            toast('That doesn’t look like a web address');
            link.focus();
            return;
        }

        const values = { title: title.value, kind, genre: genre.value, where: where.value, progress: progress.value, note: note.value, link: address };
        const ok = await attempt(async () => {
            if (item) {
                const updated = await updateScreen(item, values);
                if (watched.checked !== isWatched(updated)) await setWatched(updated, watched.checked);
            } else {
                await addScreen({ ...values, watched: watched.checked });
            }
        });
        if (!ok) return;
        closeModal('screen-modal');
        await onChange();
        toast(item ? 'Updated' : `Added to ${values.genre.trim() || UNCATEGORISED}`);
    };

    const remove = async () => {
        const ok = await confirmSheet({ title: 'Delete title', message: `Remove “${item.title}” from your list?`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        if (!(await attempt(() => deleteScreen(item.id)))) return;
        closeModal('screen-modal');
        await onChange();
        toast('Deleted');
    };

    return el('form', { class: 'video-form', onsubmit: submit }, [
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Title' }), title]),
        el('div', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Kind' }), el('div', { class: 'segmented screens-kind', role: 'group', 'aria-label': 'Kind' }, kindButtons)]),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Genre' }), el('div', { class: 'video-topic-field' }, [genre, el('datalist', { id: listId }, options)])]),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Where to watch' }), where]),
        progressField,
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Link' }), link]),
        open,
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Note' }), note]),
        el('label', { class: 'life-check' }, [watched, el('span', { text: 'Already watched' })]),
        el('div', { class: 'modal-actions sheet-actions' }, [
            item ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: remove }) : null,
            el('button', { class: 'btn btn-primary', type: 'submit', text: item ? 'Save' : 'Add' }),
        ]),
    ]);
}
