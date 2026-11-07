import { el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { sound } from '../life/sound.js';
import { icon } from '../life/icons.js';
import { state, addBook, updateBook, setRead, deleteBook } from './books-store.js';
import { groupBooksByTopic, isRead } from './books-organize.js';
import { state as videosState } from './store.js';
import { existingTopics, UNCATEGORISED } from './organize.js';
import { cleanLink } from '../life/links.js';

/**
 * Books to read — the second tab of the Videos section: the same idea (a list to
 * work through, grouped into free-text topics, ticked off when done) for things
 * you read rather than watch. The screen and its redraw belong to videos.js; this
 * builds the Books view and its add/edit sheet, and asks `onChange` to reload and
 * redraw after a write.
 */

let onChange = async () => {};

export function bindBooks(callback) {
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

// --- The Books view --------------------------------------------------------------

export function booksView() {
    const nodes = [];
    if (!state.books.length) {
        nodes.push(
            el('div', { class: 'life-empty' }, [
                el('span', { class: 'life-empty-icon' }, [icon('book', { size: 26 })]),
                el('p', { class: 'life-empty-title', text: 'No books yet' }),
                el('p', { class: 'life-empty-text', text: 'Add a book you want to read. Group them by any topic you like, and tick one off when you’ve finished it.' }),
            ]),
        );
    } else {
        nodes.push(...groupBooksByTopic(state.books).map(topicSection));
    }
    nodes.push(el('button', { class: 'btn btn-outline btn-block spaced', type: 'button', text: '+ Add book', onclick: () => openBookSheet() }));
    return nodes;
}

function topicSection(group) {
    return el('section', { class: 'video-topic' }, [
        el('div', { class: 'video-topic-head' }, [
            el('h2', { class: 'video-topic-title', text: group.label }),
            group.toReadCount > 0 ? el('span', { class: 'video-topic-count', text: `${group.toReadCount} to read` }) : null,
            el('button', {
                class: 'icon-btn',
                type: 'button',
                'aria-label': `Add a book to “${group.label}”`,
                onclick: () => openBookSheet(null, group.topic),
            }, [icon('plus', { size: 16 })]),
        ]),
        el('div', { class: 'life-list' }, group.books.map(bookRow)),
    ]);
}

function bookRow(book) {
    const read = isRead(book);
    return el('div', { class: `video-row book-row${read ? ' watched' : ''}` }, [
        el('button', {
            class: 'video-check',
            type: 'button',
            'aria-pressed': String(read),
            'aria-label': `${book.title}, ${read ? 'read' : 'not read yet'}`,
            onclick: async () => {
                if (await attempt(() => setRead(book, !read))) {
                    sound.tick(!read);
                    await onChange();
                }
            },
        }, [read ? icon('check', { size: 16 }) : null]),
        el('button', { class: 'book-main', type: 'button', onclick: () => openBookSheet(book) }, [
            el('span', { class: 'video-text' }, [
                el('span', { class: 'video-title', text: book.title }),
                book.author ? el('span', { class: 'video-note', text: book.author }) : null,
                book.note ? el('span', { class: 'video-note', text: book.note }) : null,
            ]),
        ]),
    ]);
}

// --- Add / edit sheet ----------------------------------------------------------

function openBookSheet(book = null, presetTopic = '') {
    document.getElementById('book-modal-title').textContent = book ? 'Edit book' : 'Add book';
    clear(document.getElementById('book-body')).append(bookForm(book, presetTopic));
    openModal('book-modal');
}

/** Opens the add sheet straight away (the Today card's "Add a book"). */
export const addBookSheet = () => openBookSheet();

function bookForm(book, presetTopic) {
    const title = el('input', { class: 'form-input', type: 'text', placeholder: 'Book title', maxlength: 120, value: book?.title ?? '', autocomplete: 'off' });
    const author = el('input', { class: 'form-input', type: 'text', placeholder: 'Author (optional)', maxlength: 80, value: book?.author ?? '', autocomplete: 'off' });

    const listId = 'book-topic-options';
    const topic = el('input', {
        class: 'form-input',
        type: 'text',
        list: listId,
        placeholder: 'e.g. Fiction, Self-improvement, Money…',
        maxlength: 40,
        value: book?.topic ?? presetTopic,
    });
    // Topics already used by books or by videos are suggested, so the two tabs can share names.
    const options = existingTopics([...state.books, ...videosState.videos]).map((name) => el('option', { value: name }));

    const link = el('input', {
        class: 'form-input',
        // Text with a URL keyboard, not type=url, which would block the submit before our own check runs.
        type: 'text',
        inputmode: 'url',
        placeholder: 'Optional — where to find it',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: false,
        value: book?.link ?? '',
    });
    const note = el('textarea', { class: 'form-input', rows: 2, placeholder: 'Note (optional) — who recommended it, why', value: book?.note ?? '' });
    const read = el('input', { type: 'checkbox' });
    read.checked = Boolean(book && isRead(book));

    const open = el('a', { class: 'link-btn book-open', target: '_blank', rel: 'noopener noreferrer', text: 'Open link', hidden: !book?.link });
    if (book?.link) open.href = book.link;

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

        const values = { title: title.value, author: author.value, topic: topic.value, note: note.value, link: address };
        const ok = await attempt(async () => {
            if (book) {
                const updated = await updateBook(book, values);
                if (read.checked !== isRead(updated)) await setRead(updated, read.checked);
            } else {
                await addBook({ ...values, read: read.checked });
            }
        });
        if (!ok) return;
        closeModal('book-modal');
        await onChange();
        toast(book ? 'Book updated' : `Added to ${values.topic.trim() || UNCATEGORISED}`);
    };

    const remove = async () => {
        const ok = await confirmSheet({ title: 'Delete book', message: `Remove “${book.title}” from your list?`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        if (!(await attempt(() => deleteBook(book.id)))) return;
        closeModal('book-modal');
        await onChange();
        toast('Book deleted');
    };

    return el('form', { class: 'video-form', onsubmit: submit }, [
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Title' }), title]),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Author' }), author]),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Topic' }), el('div', { class: 'video-topic-field' }, [topic, el('datalist', { id: listId }, options)])]),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Link' }), link]),
        open,
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Note' }), note]),
        el('label', { class: 'life-check' }, [read, el('span', { text: 'Already read' })]),
        el('div', { class: 'modal-actions sheet-actions' }, [
            book ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: remove }) : null,
            el('button', { class: 'btn btn-primary', type: 'submit', text: book ? 'Save' : 'Add' }),
        ]),
    ]);
}
