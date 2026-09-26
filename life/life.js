import { bootGym, reloadGym } from '../gym/js/app.js';
import { closeModal } from './dom.js';
import { hydrateIcons } from './icons.js';
import { initHome, renderHome } from './home.js';
import { enterNutrition } from '../nutrition/nutrition.js';
import { enterHabits } from '../habits/habits.js';
import { enterBody } from '../body/body.js';
import { initBackup, renderBackupBanner } from './backup.js';

/**
 * Life: the shell that hosts every section. It owns routing (a hash, so a
 * reload or the iOS back gesture lands where you were), the Today home screen
 * (life/home.js), and the service worker. Each section is a self-contained app
 * inside its own `#<id>-section` container.
 *
 * A route is `#/<section>` or `#/<section>/<action>`: the action lets Today
 * open a section straight into what you tapped (`#/nutrition/log` opens the
 * food sheet). Each section's `enter(action)` handles its own actions.
 */

const SECTIONS = [
    // Gym is booted once up front, so entering it only needs to pick a tab.
    { id: 'gym', enter: (action) => action === 'workout' && document.querySelector('#gym-section [data-tab="today"]').click() },
    { id: 'nutrition', enter: enterNutrition },
    { id: 'habits', enter: enterHabits },
    // Weight follows Gym's kg/lb setting, which Gym loads while booting.
    { id: 'body', enter: (action) => gymBoot.then(() => enterBody(action)) },
];

let gymReady = false;
let gymBoot = null;

function route() {
    const [id = '', action = null] = location.hash.replace(/^#\/?/, '').split('/');
    const section = SECTIONS.find((candidate) => candidate.id === id);

    // Each section lives in `#<id>-section`; exactly one view is showing.
    document.getElementById('life-home').hidden = Boolean(section);
    SECTIONS.forEach(({ id: sectionId }) => {
        const container = document.getElementById(`${sectionId}-section`);
        if (container) container.hidden = sectionId !== section?.id;
    });

    // The section's colour becomes --primary for everything, modals included.
    if (section) document.body.dataset.section = section.id;
    else delete document.body.dataset.section;

    if (section) {
        // An action is a one-shot: drop it from the URL so a reload or coming
        // back doesn't reopen the sheet. replaceState doesn't fire hashchange.
        if (action) history.replaceState(null, '', `#/${section.id}`);
        Promise.resolve(section.enter?.(action)).catch(showFatal);
    } else {
        renderHome();
        if (gymReady) renderBackupBanner();
    }
    window.scrollTo(0, 0);
}

/**
 * Registered relative ('./sw.js'), not '/sw.js' — GitHub Pages serves this
 * from /<repo>/, not the domain root, so an absolute path would 404 there
 * even though it works fine in local dev at the root. Fire-and-forget: a
 * registration failure shouldn't block the app from working, it just means
 * no offline support this session.
 */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('Service worker registration failed:', error);
    });
}

/**
 * Modal chrome shared by every section: the close/cancel buttons, a tap on
 * the backdrop, and Escape. Delegated from the document, so a section's
 * static modal markup is covered without it wiring anything itself.
 * Close buttons resolve their own modal, so nested sheets close one layer at
 * a time instead of collapsing the whole stack.
 */
function initModalChrome() {
    document.addEventListener('click', (event) => {
        const button = event.target.closest('.modal-close, .modal-cancel');
        if (button) {
            closeModal(button.closest('.modal').id);
            return;
        }
        if (event.target.classList?.contains('modal')) closeModal(event.target.id);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeModal();
    });
}

function showFatal(error) {
    console.error(error);
    const banner = document.createElement('div');
    banner.className = 'fatal-error';
    banner.textContent = `Could not start: ${error.message}`;
    document.body.prepend(banner);
}

async function start() {
    registerServiceWorker();
    initModalChrome();

    // Started before the first route so a section that needs Gym's data (Body
    // reads its weight unit) can wait on it, even on a direct load of its URL.
    hydrateIcons();
    gymBoot = bootGym();
    initBackup({ gymReady: () => gymBoot, reloadGym });
    initHome({ gymReady: () => gymBoot });
    window.addEventListener('hashchange', route);
    route();

    await gymBoot;
    gymReady = true;
    renderBackupBanner();
}

start().catch(showFatal);
