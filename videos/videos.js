import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { icon } from '../life/icons.js';
import { lifeDb } from '../life/db.js';
import {
    state,
    loadVideos,
    addVideo,
    updateVideo,
    setWatched,
    deleteVideo,
    renameTopic,
} from './store.js';
import { groupByTopic, existingTopics, thumbnailUrl, isYouTubeUrl, isLikelyUrl, UNCATEGORISED } from './organize.js';
import { fetchYouTubeTitle } from './oembed.js';

/**
 * Recommended Videos: things worth watching, grouped into topics. Topics are
 * free text rather than a fixed list — add a video under any topic name and
 * the group appears; this is also where videos sent over chat land, sorted
 * into topics by hand rather than picked from a menu.
 *
 * Same conventions as the other sections: no reactivity, every write reloads
 * and re-renders. Pasting a YouTube link tries to fetch its title (no key,
 * best-effort — typing it yourself always works).
 */

const TITLE_LOOKUP_DELAY_MS = 500;

let ready = null;

/** Opens LifeDB. Safe to call repeatedly. */
export function initVideos() {
    ready ??= lifeDb.init().catch((error) => {
        ready = null;
        throw error;
    });
    return ready;
}

/** Called each time the section is opened. `'add'` opens the add sheet straight away. */
export async function enterVideos(action = null) {
    await initVideos();
    await loadVideos();
    renderVideos();
    if (action === 'add') openVideoModal();
}

async function refresh() {
    await loadVideos();
    renderVideos();
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

// --- Screen ------------------------------------------------------------------

export function renderVideos() {
    const body = clear($('#videos-body'));

    if (!state.videos.length) {
        body.append(emptyState());
    } else {
        const groups = groupByTopic(state.videos);
        body.append(...groups.map(topicSection));
    }

    body.append(
        el('button', {
            class: 'btn btn-outline btn-block spaced',
            type: 'button',
            text: '+ Add video',
            onclick: () => openVideoModal(),
        }),
    );
}

function emptyState() {
    return el('div', { class: 'life-empty' }, [
        el('span', { class: 'life-empty-icon' }, [icon('play', { size: 26 })]),
        el('p', { class: 'life-empty-title', text: 'Nothing yet' }),
        el('p', {
            class: 'life-empty-text',
            text: 'Add a video you want to watch, or send me links in chat and I’ll sort them into topics for you.',
        }),
    ]);
}

function topicSection(group) {
    return el('section', { class: 'video-topic' }, [
        el('div', { class: 'video-topic-head' }, [
            el('h2', { class: 'video-topic-title', text: group.label }),
            group.unwatchedCount > 0 ? el('span', { class: 'video-topic-count', text: `${group.unwatchedCount} to watch` }) : null,
            el('button', {
                class: 'icon-btn',
                type: 'button',
                'aria-label': `Add a video to “${group.label}”`,
                onclick: () => openVideoModal(null, group.topic),
            }, [icon('plus', { size: 16 })]),
            group.topic
                ? el('button', {
                    class: 'icon-btn',
                    type: 'button',
                    'aria-label': `Rename “${group.label}”`,
                    onclick: () => openTopicModal(group.topic),
                }, [icon('edit', { size: 16 })])
                : null,
        ]),
        el('div', { class: 'life-list' }, group.videos.map(videoRow)),
    ]);
}

// --- Rename topic sheet ---------------------------------------------------------

function openTopicModal(oldTopic) {
    $('#topic-modal-title').textContent = `Rename “${oldTopic}”`;
    const input = el('input', { class: 'form-input', type: 'text', value: oldTopic, maxlength: 40, 'aria-label': 'New topic name' });
    clear($('#topic-body')).append(
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'New name' }), input]),
        el('p', { class: 'hint footnote', text: 'Renames every video filed under this topic.' }),
    );

    $('#topic-save').onclick = async () => {
        const newTopic = input.value.trim();
        if (!newTopic) {
            toast('Give it a name');
            return;
        }
        if (newTopic.toLowerCase() === oldTopic.toLowerCase()) {
            closeModal('topic-modal');
            return;
        }
        if (!(await attempt(() => renameTopic(oldTopic, newTopic)))) return;
        closeModal('topic-modal');
        await refresh();
        toast(`Renamed to “${newTopic}”`);
    };

    openModal('topic-modal');
}

const fmtNote = (note) => (note?.trim() ? note.trim() : null);

function videoRow(video) {
    const thumb = thumbnailUrl(video.url);

    const media = el('span', { class: 'video-thumb' }, [
        thumb ? el('img', { src: thumb, alt: '', loading: 'lazy', onerror: (event) => event.currentTarget.remove() }) : null,
        el('span', { class: 'video-thumb-play' }, [icon('play', { size: 18 })]),
    ]);

    return el('div', { class: `video-row${video.watched ? ' watched' : ''}` }, [
        el('button', {
            class: 'video-check',
            type: 'button',
            'aria-pressed': String(video.watched),
            'aria-label': `${video.title}, ${video.watched ? 'watched' : 'not watched'}`,
            onclick: () => toggleWatched(video),
        }, [video.watched ? icon('check', { size: 16 }) : null]),
        el('a', { class: 'video-link', href: video.url, target: '_blank', rel: 'noopener noreferrer' }, [
            media,
            el('span', { class: 'video-text' }, [
                el('span', { class: 'video-title', text: video.title }),
                fmtNote(video.note) ? el('span', { class: 'video-note', text: fmtNote(video.note) }) : null,
            ]),
            el('span', { class: 'video-external' }, [icon('external', { size: 14 })]),
        ]),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Edit ${video.title}`, text: '⋯', onclick: () => openVideoModal(video) }),
    ]);
}

async function toggleWatched(video) {
    await attempt(() => setWatched(video, !video.watched));
    await refresh();
}

// --- Add / edit sheet ----------------------------------------------------------

function openVideoModal(video = null, presetTopic = '') {
    $('#video-modal-title').textContent = video ? 'Edit video' : 'Add video';
    clear($('#video-body')).append(videoForm(video, presetTopic));
    openModal('video-modal');
}

/** A text input suggesting topics already in use, via a native datalist. */
function topicField(value) {
    const listId = 'video-topic-options';
    const input = el('input', {
        class: 'form-input',
        type: 'text',
        list: listId,
        placeholder: 'e.g. Gym, Nutrition, Theory test…',
        maxlength: 40,
        value,
    });
    const options = existingTopics(state.videos).map((topic) => el('option', { value: topic }));
    return { field: el('div', { class: 'video-topic-field' }, [input, el('datalist', { id: listId }, options)]), input };
}

function videoForm(video, presetTopic) {
    const title = el('input', { class: 'form-input video-title-input', type: 'text', placeholder: 'Video title', maxlength: 120, value: video?.title ?? '' });
    const url = el('input', {
        class: 'form-input video-url-input',
        // Not type="url": its native constraint validation silently blocks the
        // submit event on anything malformed, before our own check (and its
        // toast) ever runs. inputmode alone still gives iOS the URL keyboard.
        type: 'text',
        inputmode: 'url',
        placeholder: 'https://…',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: false,
        value: video?.url ?? '',
    });
    const status = el('p', { class: 'hint video-lookup-status' });
    const { field: topic, input: topicInput } = topicField(video?.topic ?? presetTopic);
    const note = el('textarea', { class: 'form-input', rows: 2, placeholder: 'Note (optional) — why it’s useful, what to remember', value: video?.note ?? '' });
    const watched = el('input', { type: 'checkbox' });
    watched.checked = Boolean(video?.watched);

    // Title is only auto-filled while the person hasn't typed one themselves,
    // so a successful lookup never clobbers something already written.
    let titleTouched = Boolean(video?.title);
    title.addEventListener('input', () => {
        titleTouched = Boolean(title.value.trim());
    });

    let lookupTimer = null;
    let lookupAbort = null;
    url.addEventListener('input', () => {
        clearTimeout(lookupTimer);
        lookupAbort?.abort();
        status.textContent = '';
        if (titleTouched || !isYouTubeUrl(url.value)) return;

        lookupTimer = setTimeout(async () => {
            const controller = new AbortController();
            lookupAbort = controller;
            status.textContent = 'Looking up the title…';
            try {
                const result = await fetchYouTubeTitle(url.value, { signal: controller.signal });
                if (controller.signal.aborted || titleTouched) return;
                title.value = result.title;
                status.textContent = '';
            } catch (error) {
                if (controller.signal.aborted) return;
                console.warn(error);
                status.textContent = '';
            }
        }, TITLE_LOOKUP_DELAY_MS);
    });

    const submit = async (event) => {
        event.preventDefault();
        if (!title.value.trim()) {
            toast('Give it a title');
            title.focus();
            return;
        }
        if (!isLikelyUrl(url.value)) {
            toast('Enter a valid link');
            url.focus();
            return;
        }

        const values = { title: title.value, url: url.value, topic: topicInput.value, note: note.value };
        let ok;
        if (video) {
            ok = await attempt(async () => {
                // updateVideo trims and returns the saved record; setWatched
                // is applied on top of *that*, not the stale pre-edit one, so
                // a watched-state change never reverts the other fields.
                const updated = await updateVideo(video, values);
                if (watched.checked !== video.watched) await setWatched(updated, watched.checked);
            });
        } else {
            ok = await attempt(() => addVideo({ ...values, watched: watched.checked }));
        }
        if (!ok) return;
        closeModal('video-modal');
        await refresh();
        toast(video ? 'Video updated' : `Added to ${values.topic.trim() || UNCATEGORISED}`);
    };

    const remove = async () => {
        const ok = await confirmSheet({
            title: 'Delete video',
            message: `Remove “${video.title}” from your list?`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        if (!(await attempt(() => deleteVideo(video.id)))) return;
        closeModal('video-modal');
        await refresh();
        toast('Video deleted');
    };

    return el('form', { class: 'video-form', onsubmit: submit }, [
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Link' }), url]),
        status,
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Title' }), title]),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Topic' }), topic]),
        el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Note' }), note]),
        el('label', { class: 'life-check' }, [watched, el('span', { text: 'Already watched' })]),
        el('div', { class: 'modal-actions sheet-actions' }, [
            video ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: remove }) : null,
            el('button', { class: 'btn btn-primary', type: 'submit', text: video ? 'Save' : 'Add' }),
        ]),
    ]);
}
