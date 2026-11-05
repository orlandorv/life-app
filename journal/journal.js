import { $, el, clear, toast } from '../life/dom.js';
import { lifeDb } from '../life/db.js';
import { localDayId, addDays, dayLabel } from '../life/dates.js';
import { dayBar } from '../life/daybar.js';
import { icon } from '../life/icons.js';
import { state, loadEntries, entryFor, saveEntry } from './store.js';
import { MOODS, ENERGY, SCALE, NOTE_FIELDS, entryPreview, moodLabel, energyLabel, checkInStreak, insights, MIN_DAYS, WINDOW_DAYS } from './insights.js';
import { state as gymState } from '../gym/js/store.js';
import { state as bodyState, loadEntries as loadBodyEntries } from '../body/store.js';

/**
 * Journal: a short daily check-in — mood, energy, and a note — and the
 * patterns it makes with the rest of the app (training from Gym, sleep from
 * Body). One entry per day; step back with the day bar to fill in one you
 * missed. Same conventions as the other sections: no reactivity, every write
 * reloads, and the screen redraws except while you're typing a note.
 */

const NOTE_SAVE_DELAY_MS = 700;
const RECENT_SHOWN = 14;

let ready = null;
let noteTimer = null;

/** Opens LifeDB. Safe to call repeatedly. */
export function initJournal() {
    ready ??= lifeDb.init().catch((error) => {
        ready = null;
        throw error;
    });
    return ready;
}

/** Called each time the section is opened; always starts on today. */
export async function enterJournal() {
    await initJournal();
    await Promise.all([loadEntries(), loadBodyEntries()]);
    state.day = localDayId();
    renderJournal();
}

/** Runs a write, then redraws. Returns whether it worked. */
async function save(values, { redraw = true } = {}) {
    try {
        await saveEntry(values);
    } catch (error) {
        console.error(error);
        toast('Couldn’t save that');
        return false;
    }
    if (redraw) renderJournal();
    else refreshRecent();
    return true;
}

// --- Screen -----------------------------------------------------------------------

export function renderJournal() {
    clearTimeout(noteTimer);
    const today = localDayId();
    clear($('#journal-body')).append(
        dayBar({
            label: dayLabel(state.day, today),
            canNext: state.day < today,
            onPrev: () => shiftDay(-1),
            onNext: () => shiftDay(1),
        }),
        checkInCard(today),
        insightsCard(today),
        el('div', { class: 'journal-recent-slot' }, [recentList(today)]),
    );
}

function shiftDay(direction) {
    state.day = addDays(state.day, direction);
    renderJournal();
}

/** Just the recent list, after a note save — so the note being typed keeps its focus. */
function refreshRecent() {
    const slot = document.querySelector('#journal-body .journal-recent-slot');
    if (slot) slot.replaceChildren(recentList(localDayId()));
}

// --- Check-in ---------------------------------------------------------------------

/** Five buttons for a 1–5 scale; tapping the chosen one again clears it. */
function scaleRow(label, words, value, onPick) {
    return el('div', { class: 'journal-field' }, [
        el('span', { class: 'stepper-label', text: label }),
        el(
            'div',
            { class: 'journal-scale', role: 'group', 'aria-label': label },
            SCALE.map((level) =>
                el('button', {
                    type: 'button',
                    class: level === value ? 'active' : '',
                    'aria-pressed': String(level === value),
                    'aria-label': `${label}: ${words[level - 1]} (${level} of 5)`,
                    text: words[level - 1],
                    onclick: () => onPick(level === value ? null : level),
                }),
            ),
        ),
    ]);
}

function checkInCard(today) {
    const entry = entryFor(state.day);
    const isToday = state.day === today;
    const streak = checkInStreak(new Set(state.entries.map((e) => e.day)), today);

    // One text box per part of the day, plus a general note. All of them save
    // together, so a redraw from a mood tap or a save never drops half-typed text.
    const boxes = NOTE_FIELDS.map((field) => ({
        ...field,
        input: el('textarea', {
            class: 'form-input journal-note',
            rows: field.id === 'note' ? 3 : 2,
            maxlength: 2000,
            placeholder: field.placeholder(isToday),
            value: entry?.[field.id] ?? '',
            'aria-label': field.label,
        }),
    }));
    const saved = el('span', { class: 'journal-saved', 'aria-live': 'polite' });

    const current = () => entryFor(state.day);
    const texts = () => Object.fromEntries(boxes.map((box) => [box.id, box.input.value]));
    const pick = (field) => (level) =>
        save({
            day: state.day,
            mood: field === 'mood' ? level : current()?.mood,
            energy: field === 'energy' ? level : current()?.energy,
            ...texts(),
        });

    const saveNote = async () => {
        clearTimeout(noteTimer);
        const was = current();
        if (boxes.every((box) => box.input.value.trim() === (was?.[box.id] ?? ''))) return;
        if (await save({ day: state.day, mood: was?.mood, energy: was?.energy, ...texts() }, { redraw: false })) {
            saved.textContent = 'Saved';
        }
    };
    for (const { input } of boxes) {
        input.addEventListener('input', () => {
            saved.textContent = '';
            clearTimeout(noteTimer);
            noteTimer = setTimeout(saveNote, NOTE_SAVE_DELAY_MS);
        });
        input.addEventListener('blur', saveNote);
    }

    return el('section', { class: 'life-surface journal-card' }, [
        el('div', { class: 'journal-card-head' }, [
            el('h2', { class: 'journal-card-title', text: isToday ? 'How are you today?' : 'How were you?' }),
            streak > 1 ? el('span', { class: 'journal-streak' }, [icon('flame', { size: 14 }), `${streak} days in a row`]) : null,
        ]),
        scaleRow('Mood', MOODS, entry?.mood ?? null, pick('mood')),
        scaleRow('Energy', ENERGY, entry?.energy ?? null, pick('energy')),
        ...boxes.map((box, index) =>
            el('div', { class: 'journal-field' }, [
                el('span', { class: 'journal-note-head' }, [
                    el('span', { class: 'stepper-label', text: box.label }),
                    index === boxes.length - 1 ? saved : null,
                ]),
                box.input,
            ]),
        ),
    ]);
}

// --- Patterns ---------------------------------------------------------------------

function insightsCard(today) {
    const trainedDays = new Set(gymState.workouts.map((workout) => localDayId(new Date(workout.startedAt))));
    const sleepByDay = new Map(bodyState.entries.filter((entry) => entry.sleepHours > 0).map((entry) => [entry.day, entry.sleepHours]));
    const found = insights({ entries: state.entries, trainedDays, sleepByDay, today });

    return el('section', { class: 'life-surface journal-insights' }, [
        el('h2', { class: 'life-eyebrow', text: 'Patterns' }),
        found.length
            ? el('ul', { class: 'journal-insight-list' }, found.map((item) => el('li', { text: item.text })))
            : el('p', {
                  class: 'journal-muted',
                  text: `Check in on at least ${MIN_DAYS} days with and ${MIN_DAYS} without a workout (or a good night's sleep), and how they line up with your mood and energy shows up here.`,
              }),
        found.length
            ? el('p', { class: 'journal-muted', text: `From your last ${WINDOW_DAYS} days. A pattern, not proof — other things change too.` })
            : null,
    ]);
}

// --- Recent -----------------------------------------------------------------------

function recentList(today) {
    const recent = [...state.entries].reverse().slice(0, RECENT_SHOWN);
    if (!recent.length) {
        return el('div', { class: 'life-empty journal-empty' }, [
            el('span', { class: 'life-empty-icon' }, [icon('journal', { size: 26 })]),
            el('p', { class: 'life-empty-title', text: 'Nothing here yet' }),
            el('p', { class: 'life-empty-text', text: 'A tap on your mood is enough. Add a note when there’s something worth remembering.' }),
        ]);
    }

    return el('section', {}, [
        el('h2', { class: 'life-eyebrow journal-recent-title', text: 'Recent' }),
        el(
            'div',
            { class: 'life-list' },
            recent.map((entry) =>
                el(
                    'button',
                    {
                        class: `journal-row${entry.day === state.day ? ' current' : ''}`,
                        type: 'button',
                        onclick: () => {
                            state.day = entry.day;
                            renderJournal();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        },
                    },
                    [
                        el('span', { class: 'journal-row-top' }, [
                            el('span', { class: 'journal-row-day', text: dayLabel(entry.day, today) }),
                            el('span', {
                                class: 'journal-row-levels',
                                text: [
                                    moodLabel(entry.mood) ? `Mood ${moodLabel(entry.mood).toLowerCase()}` : null,
                                    energyLabel(entry.energy) ? `energy ${energyLabel(entry.energy).toLowerCase()}` : null,
                                ]
                                    .filter(Boolean)
                                    .join(' · '),
                            }),
                        ]),
                        entryPreview(entry) ? el('span', { class: 'journal-row-note', text: entryPreview(entry) }) : null,
                    ],
                ),
            ),
        ),
    ]);
}
