import { bootGym } from '../gym/js/app.js';
import { computeProgress } from '../gym/js/progress.js';
import { closeModal } from './dom.js';

/**
 * Life: the shell that hosts every section. It owns routing (a hash, so a
 * reload or the iOS back gesture lands where you were), the home screen, and
 * the service worker. Each section is a self-contained app inside its own
 * container; adding one means a registry entry here plus its container in
 * index.html.
 */

const SECTIONS = [
    {
        id: 'gym',
        title: 'Gym',
        icon: '🏋️',
        blurb: 'Workouts, plans and records',
        summary: gymSummary,
    },
    { id: 'nutrition', title: 'Nutrition', icon: '🥗', blurb: 'Meals, calories and protein', soon: true },
    { id: 'habits', title: 'Habits', icon: '✅', blurb: 'Daily habits and to-dos', soon: true },
    { id: 'body', title: 'Body', icon: '😴', blurb: 'Weight, sleep and steps', soon: true },
];

let gymReady = false;

function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === 'text') node.textContent = value;
        else node.setAttribute(key, value);
    }
    node.append(...children.filter(Boolean));
    return node;
}

/** A live line for the Gym card; blank until Gym has loaded its data. */
function gymSummary() {
    if (!gymReady) return '';
    const week = computeProgress().currentWeek;
    if (!week) return '';
    return `${week.sessions}/${week.target} sessions this week`;
}

function sectionCard(section) {
    const summary = section.summary?.() || '';
    const body = [
        h('span', { class: 'life-card-icon', text: section.icon }),
        h('span', { class: 'life-card-title', text: section.title }),
        h('span', { class: 'life-card-blurb', text: section.soon ? 'Coming soon' : summary || section.blurb }),
    ];

    return section.soon
        ? h('div', { class: 'life-card life-card-soon', 'aria-disabled': 'true' }, body)
        : h('a', { class: 'life-card', href: `#/${section.id}` }, body);
}

function renderHome() {
    const grid = document.getElementById('life-sections');
    grid.replaceChildren(...SECTIONS.map(sectionCard));
}

function route() {
    const inGym = location.hash === '#/gym';
    document.getElementById('life-home').hidden = inGym;
    document.getElementById('gym-section').hidden = !inGym;

    // Gym's state can change while you're in it, so refresh the summary on the way out.
    if (!inGym) renderHome();
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
    document.body.prepend(h('div', { class: 'fatal-error', text: `Could not start: ${error.message}` }));
}

async function start() {
    registerServiceWorker();
    initModalChrome();
    window.addEventListener('hashchange', route);
    route();

    await bootGym();
    gymReady = true;
    if (location.hash !== '#/gym') renderHome();
}

start().catch(showFatal);
