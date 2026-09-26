import { bootstrap } from './store.js';
import { $$ } from '../../life/dom.js';
import { initLibrary, renderLibrary, releaseMediaUrls } from './library.js';
import { initTemplates, renderTemplates } from './templates.js';
import { initPicker } from './picker.js';
import { initTimer } from './timer.js';
import { initSfx } from './sfx.js';
import { initWorkout, render as renderWorkout, startWorkout, resumeActive } from './workout.js';
import { renderRecords } from './records.js';
import { initHistory, renderHistory } from './history.js';
import { initCheckin } from './checkin.js';
import { initSettings } from './settings.js';
import { initRewards, renderRewards } from './rewards.js';
import { syncProgressLedger } from './progress.js';

function switchTab(tab) {
    $$('#gym-section .tab-content').forEach((section) => section.classList.toggle('active', section.id === `${tab}-tab`));
    $$('#gym-section .nav-btn').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
    window.scrollTo(0, 0);
}

function initChrome() {
    $$('#gym-section .nav-btn').forEach((button) => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });

    // Gym-only: modals close generically (see life/life.js), but the library's
    // object URLs are Gym's to release once a sheet has finished closing.
    $$('.modal').forEach((modal) => {
        modal.addEventListener('transitionend', () => {
            if (!modal.classList.contains('active')) releaseMediaUrls();
        });
    });
}

/** Every weight-displaying view, refreshed after a unit toggle or a backup import. */
function renderAll() {
    renderLibrary();
    renderTemplates();
    renderWorkout();
    renderHistory();
    renderRecords();
    renderRewards();
}

/** Boots the Gym section once; Life keeps it mounted and only hides/shows it. */
export async function bootGym() {
    await bootstrap();

    initChrome();
    initLibrary();
    initPicker();
    initTimer();
    initSfx();
    initRewards();
    initWorkout({
        onWorkoutFinished: () => {
            renderHistory();
            renderRecords();
            renderRewards();
        },
    });
    initTemplates({
        onStart: (templateId) => startWorkout(templateId),
        onTemplatesChanged: () => {
            renderWorkout();
            renderHistory(); // weekly volume targets are derived from templates
        },
    });
    initHistory({ onHistoryChanged: renderRecords });
    initCheckin({ onCheckinChanged: renderHistory });
    initSettings({ onDataChanged: renderAll, onUnitChanged: renderAll });

    await resumeActive();
    // Seals this week's session target and draws its quests before anything
    // renders, so the tab never shows a week with neither.
    await syncProgressLedger();

    renderAll();
}
