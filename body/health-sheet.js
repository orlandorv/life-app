import { $, el, clear, openModal, closeModal, toast } from '../life/dom.js';
import { localDayId, dayLabel } from '../life/dates.js';
import { getUnit, toDisplay, formatNumber } from '../gym/js/units.js';
import { state, saveEntry } from './store.js';
import { parseHealthText, planHealthImport } from './health-import.js';

/**
 * Filling Body from Apple Health. A home-screen web app can't read Health, so
 * an Apple Shortcut does: it copies the last week's steps, weigh-ins and sleep
 * as text, and "Paste from Health" reads that text, shows what it found, and
 * saves it on confirmation. No account, key or server — the text never leaves the phone.
 */

let onSavedCallback = null;

function setHeader(title, sub = '') {
    $('#health-title').textContent = title;
    $('#health-sub').textContent = sub;
}

const fmtSteps = (n) => Math.round(n).toLocaleString();
const fmtKg = (kg) => `${formatNumber(Math.round(toDisplay(kg) * 10) / 10)} ${getUnit()}`;
const fmtSleep = (hours) => `${formatNumber(Math.round(hours * 10) / 10)} h sleep`;

/**
 * Reads the clipboard (iPhone shows a small "Paste" button to allow it) and
 * previews what it found. Call straight from a tap: browsers only allow
 * reading the clipboard during a user gesture.
 */
export async function pasteFromHealth({ onSaved } = {}) {
    onSavedCallback = onSaved;

    let text = '';
    try {
        text = await navigator.clipboard.readText();
    } catch (error) {
        // Denied, dismissed, or not supported: offer a box to paste into instead.
        console.warn('Clipboard read failed:', error);
        showPasteBox('Tap the box below, then Paste.');
        return;
    }
    handleText(text);
}

function handleText(text) {
    const today = localDayId();
    const parsed = parseHealthText(text, today);

    if (!parsed.days.size) {
        showPasteBox(
            text.trim()
                ? 'That doesn’t look like numbers from the Health shortcut. Run the shortcut first, then come back and paste.'
                : 'Nothing copied yet. Run the “Life: copy Health” shortcut first, then come back and paste.',
            text,
        );
        return;
    }

    const plan = planHealthImport(parsed, state.entries);
    if (!plan.length) {
        closeModal('health-modal');
        toast('Already up to date with Health');
        return;
    }
    showPreview(plan, parsed);
}

function showPreview(plan, { skipped, partialDay }) {
    const today = localDayId();
    setHeader('From Apple Health', `${plan.length} day${plan.length === 1 ? '' : 's'} to save`);

    const rows = plan.map(({ day, entry, replaces }) =>
        el('div', { class: 'health-row' }, [
            el('span', { class: 'health-row-day', text: dayLabel(day, today) }),
            el('span', { class: 'health-row-values' }, [
                [
                    entry.weightKg != null ? fmtKg(entry.weightKg) : null,
                    entry.sleepHours != null ? fmtSleep(entry.sleepHours) : null,
                    entry.steps != null ? `${fmtSteps(entry.steps)} steps` : null,
                ]
                    .filter(Boolean)
                    .join(' · '),
                replaces ? el('span', { class: 'health-row-tag', text: 'updates' }) : null,
            ]),
        ]),
    );

    const save = async () => {
        try {
            for (const { entry } of plan) await saveEntry(entry);
        } catch (error) {
            console.error(error);
            toast('Couldn’t save that');
            return;
        }
        closeModal('health-modal');
        await onSavedCallback?.();
        toast(`Saved ${plan.length} day${plan.length === 1 ? '' : 's'} from Health`);
    };

    clear($('#health-body')).append(
        el('div', { class: 'life-list health-list' }, rows),
        el('p', {
            class: 'hint footnote',
            text: [
                'Anything Health doesn’t have for a day stays as you logged it.',
                partialDay ? `The night of ${dayLabel(partialDay, today)} is left out — Health’s date range may cut it short.` : null,
                skipped ? `${skipped} line${skipped === 1 ? '' : 's'} couldn’t be read and ${skipped === 1 ? 'was' : 'were'} skipped.` : null,
            ]
                .filter(Boolean)
                .join(' '),
        }),
        el('div', { class: 'modal-actions sheet-actions' }, [
            el('button', { class: 'btn btn-primary', type: 'button', text: `Save ${plan.length} day${plan.length === 1 ? '' : 's'}`, onclick: save }),
        ]),
    );
    openModal('health-modal');
}

/** The fallback: paste into a box by hand (long-press › Paste), then read it. */
function showPasteBox(message, prefill = '') {
    setHeader('Paste from Health');
    const box = el('textarea', {
        class: 'form-input health-paste',
        rows: 6,
        placeholder: 'steps 2026-09-21 8,412\nweight 2026-09-26 82.4 kg\nsleep 2026-09-25 23:10 1 hr 5 min Core',
        value: prefill,
        'aria-label': 'Text copied by the shortcut',
    });

    clear($('#health-body')).append(
        el('p', { class: 'health-message', text: message }),
        box,
        el('div', { class: 'modal-actions sheet-actions' }, [
            el('button', { class: 'btn btn-outline', type: 'button', text: 'How to set it up', onclick: showHealthSetup }),
            el('button', { class: 'btn btn-primary', type: 'button', text: 'Read it', onclick: () => handleText(box.value) }),
        ]),
    );
    openModal('health-modal');
}

/** Step-by-step instructions for building the shortcut, on the phone where it's built. */
export function showHealthSetup() {
    setHeader('Set up the Health shortcut', 'Once, about 3 minutes');

    const step = (title, detail) => el('li', {}, [el('strong', { text: title }), detail ? el('span', { text: detail }) : null]);

    clear($('#health-body')).append(
        el('p', { class: 'health-message', text: 'In Renpho, turn on Apple Health (Me › Apple Health) so your weigh-ins reach Health. Sleep comes from your watch or sleep app, via Health. Then build this in the Shortcuts app. Labels can differ slightly between iOS versions.' }),
        el('ol', { class: 'health-steps' }, [
            step('New shortcut', 'Shortcuts app › + › name it “Life: copy Health”.'),
            step('Find Health Samples', 'Add Filter › Type is Steps. Add Filter › Start Date is in the last 7 days. Group By: Day. Sort by: Start Date, Oldest First.'),
            step('Repeat with Each', 'For each Health Sample.'),
            step('Inside the repeat: Format Date', 'Date: Repeat Item › Start Date. Format: Custom, yyyy-MM-dd.'),
            step('Inside the repeat: Text', 'Type “steps ”, insert Formatted Date, a space, then Repeat Item › Value.'),
            step('Inside the repeat: Add to Variable', 'Add the Text to a variable called Lines.'),
            step('Find Health Samples again', 'Type is Weight. Start Date is in the last 7 days. No grouping. Sort by: Start Date, Oldest First.'),
            step('Repeat with Each, Format Date', 'Same as before: Repeat Item › Start Date, Custom yyyy-MM-dd.'),
            step('Inside: Text', 'Type “weight ”, insert Formatted Date, a space, Repeat Item › Value, a space, Repeat Item › Unit.'),
            step('Inside: Add to Variable', 'Add the Text to Lines.'),
            step('Find Health Samples a third time, for sleep', 'Type is Sleep Analysis. Start Date is in the last 8 days (a day more than the others — when there are several nights, Life leaves out the oldest, which the window may cut short). No grouping. Sort by: Start Date, Oldest First.'),
            step('Repeat with Each, Format Date', 'Repeat Item › Start Date (not Date Created — that’s when it was saved), Custom yyyy-MM-dd HH:mm (if the format doesn’t stick, Life also reads your phone’s usual date style) — this one includes the time, so Life can tell which morning a night belongs to.'),
            step('Inside: Text', 'Type “sleep ”, insert Formatted Date, a space, Repeat Item › Duration, a space, Repeat Item › Value.'),
            step('Inside: Add to Variable', 'Add the Text to Lines. Life ignores Awake and In Bed segments by itself, so no extra filter is needed.'),
            step('After all the repeats: Combine Text', 'Combine Lines with New Lines as the separator. Without this only the first line reaches the clipboard — a list is copied as separate pieces and Life can only read the first.'),
            step('Copy to Clipboard', 'Copy the Combined Text.'),
            step('Run it', 'Allow access to Steps, Weight and Sleep when asked. Then open Life › Body › Paste from Health.'),
        ]),
        el('p', { class: 'hint footnote', text: 'Already built it before sleep was added? Add the four sleep steps above just before Combine Text.' }),
        el('p', { class: 'hint footnote', text: 'Tip: add the shortcut to your Home Screen (share button in the shortcut › Add to Home Screen) so it’s one tap before you open Life.' }),
    );
    openModal('health-modal');
}
