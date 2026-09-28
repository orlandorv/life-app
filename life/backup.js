import { $, el, clear, openModal, confirmSheet, toast } from './dom.js';
import { lifeDb } from './db.js';
import { localDayId } from './dates.js';
import { database as gymDb } from '../gym/js/db.js';
import { state as gymState } from '../gym/js/store.js';
import { icon } from './icons.js';
import { shareOrDownload } from './share.js';
import { buildBackup, inspectBackup, summarize, describeAge, backupAgeDays, needsNudge } from './backup-format.js';

/**
 * Backup and restore for all of Life: Gym, Nutrition, Habits and Body in one
 * file. Everything lives only on this phone, so this is the way off it — and
 * back onto a new one. The rules for what's a valid file live in
 * backup-format.js; this is the screen and the file handling around them.
 */

let context = null;
let prepared = null;

/** `gymReady()` resolves once Gym has booted (its database is open); `reloadGym()` redraws it after an import. */
export function initBackup({ gymReady, reloadGym }) {
    context = { gymReady, reloadGym };
    $('#life-settings-btn').addEventListener('click', openBackupSheet);
}

const lastBackupAt = () => lifeDb.getSetting('lastBackupAt', null);

// --- Home-screen nudge --------------------------------------------------------------

/** Shows the banner only when there's data to lose and no recent backup. */
export async function renderBackupBanner() {
    const banner = $('#life-backup-banner');

    try {
        await context.gymReady();
        await lifeDb.init();
        const hasData = (await lifeDb.hasAnyData()) || gymState.workouts.length > 0;
        const last = await lastBackupAt();

        if (!needsNudge({ lastBackupAt: last, hasData })) {
            banner.hidden = true;
            return;
        }

        const days = backupAgeDays(last);
        clear(banner).append(
            icon('shield', { size: 22 }),
            el('p', { class: 'life-banner-text' }, [
                el('strong', { text: days === null ? 'Back up your data' : `Last backup ${days} days ago` }),
                'Everything here lives only on this phone.',
            ]),
            el('button', { class: 'btn btn-small', type: 'button', text: 'Back up', onclick: openBackupSheet }),
        );
        banner.hidden = false;
    } catch (error) {
        // A missing nudge is not worth breaking the home screen over.
        console.warn('Backup banner skipped:', error);
        banner.hidden = true;
    }
}

// --- Sheet ---------------------------------------------------------------------------

async function openBackupSheet() {
    clear($('#backup-body')).append(el('p', { class: 'hint', text: 'Preparing…' }));
    openModal('backup-modal');

    try {
        await prepare();
        await renderSheet();
    } catch (error) {
        console.error(error);
        clear($('#backup-body')).append(el('p', { class: 'hint', text: `Couldn’t read your data: ${error.message}` }));
    }
}

/**
 * The file is built when the sheet opens, not when Export is tapped: sharing
 * needs to start straight from the tap, and awaiting database reads first can
 * make iOS treat the share as not user-initiated.
 */
async function prepare() {
    await context.gymReady();
    await lifeDb.init();
    const [gym, life] = await Promise.all([gymDb.exportAll(), lifeDb.exportAll()]);
    prepared = {
        text: JSON.stringify(buildBackup({ gym, life }), null, 2),
        filename: `life-backup-${localDayId()}.json`,
    };
}

async function renderSheet() {
    const last = await lastBackupAt();
    const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) importFile(file);
        fileInput.value = '';
    });

    clear($('#backup-body')).append(
        el('div', { class: 'backup-age' }, [
            el('span', { class: 'life-chip' }, [icon('shield', { size: 19 })]),
            el('span', { class: 'backup-age-text' }, [
                el('span', { class: 'backup-age-label', text: 'Last backup' }),
                el('span', { class: 'backup-age-value', text: describeAge(last) }),
            ]),
        ]),
        el('button', { class: 'btn btn-primary btn-block', type: 'button', text: 'Export backup', onclick: exportBackup }),
        el('label', { class: 'btn btn-outline btn-block file-btn' }, ['Import backup', fileInput]),
        el('p', {
            class: 'hint footnote',
            text: 'One file with your workouts, food, habits and body log. Exercise demo photos and clips aren’t included. Importing merges: anything with the same ID or day is replaced, and nothing is deleted.',
        }),
    );
}

// --- Export -------------------------------------------------------------------------------

async function exportBackup() {
    if (!prepared) return;

    const file = new File([prepared.text], prepared.filename, { type: 'application/json' });
    const outcome = await shareOrDownload(file, 'Life backup');
    if (outcome === 'cancelled') return;

    // Recorded here, not on the tap, so a dismissed share sheet doesn't count.
    await lifeDb.saveSetting('lastBackupAt', new Date().toISOString());
    toast(outcome === 'shared' ? 'Backup shared' : 'Backup downloaded');
    await renderSheet();
    renderBackupBanner();
}

// --- Import ------------------------------------------------------------------------------------

function importMessage(info) {
    const counts = summarize(info);
    const parts = [
        [counts.workouts, 'workout'],
        [counts.exercises, 'exercise'],
        [counts.templates, 'plan'],
        [counts.foodEntries, 'food entry', 'food entries'],
        [counts.habits, 'habit'],
        [counts.bodyDays, 'body log day'],
        [counts.videos, 'video'],
        [counts.tasks, 'task'],
    ]
        .filter(([n]) => n > 0)
        .map(([n, one, many]) => `${n} ${n === 1 ? one : many ?? `${one}s`}`);

    const when = info.exportedAt ? ` from ${new Date(info.exportedAt).toLocaleDateString()}` : '';
    const what = parts.length ? parts.join(', ') : 'no entries';
    const scope =
        info.kind === 'gym'
            ? ' This is a Gym-only backup, so your food, habits and body log are left as they are.'
            : '';

    return `This adds ${what}${when}. Anything with the same ID or day is replaced; nothing else is removed.${scope}`;
}

async function importFile(file) {
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch {
        toast('That file isn’t valid JSON');
        return;
    }

    // Everything is checked before anything is written.
    let info;
    try {
        info = inspectBackup(data);
    } catch (error) {
        toast(error.message);
        return;
    }

    const ok = await confirmSheet({
        title: 'Import backup',
        message: importMessage(info),
        confirmLabel: 'Import',
        danger: true,
    });
    if (!ok) return;

    let lifeDone = false;
    try {
        await context.gymReady();
        await lifeDb.init();
        if (info.life) {
            await lifeDb.importAll(info.life);
            lifeDone = true;
        }
        if (info.gym) await gymDb.importAll(info.gym);
    } catch (error) {
        console.error(error);
        toast(lifeDone ? `Gym failed to import (${error.message}); the rest was imported` : `Import failed: ${error.message}`);
        await context.reloadGym();
        return;
    }

    await context.reloadGym();
    await renderSheet();
    renderBackupBanner();
    toast('Backup imported');
}
