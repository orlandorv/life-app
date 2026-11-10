import { el } from './dom.js';
import { icon } from './icons.js';
import { achievements } from './achievements.js';

/**
 * The home screen's pages: Explore, Today, and Achievements, side by side in a row
 * you swipe along (`#life-pager`, a horizontal scroll container that snaps to a page).
 * Each page scrolls up and down on its own, so being half way down Today never hides the
 * top of Achievements. The dots under it say where you are and jump to a page.
 *
 * Nothing here is remembered: opening the home screen always starts on Today in the centre.
 */

const pager = () => document.getElementById('life-pager');
const pages = () => [...document.querySelectorAll('#life-pager > .life-page')];
const dots = () => [...document.querySelectorAll('#life-pager-dots button')];
const todayIndex = () => pages().findIndex((page) => page.id === 'life-page-today');

/** Which page is showing: the nearest one to where the row is scrolled. */
function pageIndex() {
    const row = pager();
    return row?.clientWidth ? Math.round(row.scrollLeft / row.clientWidth) : 0;
}

function syncDots() {
    const here = pageIndex();
    dots().forEach((dot, n) => {
        dot.classList.toggle('active', n === here);
        if (n === here) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
    });
}

/** Slides to a page (without the slide when the person has asked for less motion). */
export function goToPage(n) {
    const row = pager();
    if (!row) return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: n * row.clientWidth, behavior: calm ? 'auto' : 'smooth' });
}

/** Back to Today in the centre, each page at its top. */
export function resetPager() {
    const row = pager();
    if (!row) return;
    row.scrollLeft = Math.max(0, todayIndex()) * row.clientWidth;
    pages().forEach((page) => {
        page.scrollTop = 0;
    });
    syncDots();
}

export function initPager() {
    const row = pager();
    if (!row) return;
    // Cheap enough (three buttons) to run on every scroll event.
    row.addEventListener('scroll', syncDots, { passive: true });
    window.addEventListener('resize', syncDots);
    dots().forEach((dot, n) => dot.addEventListener('click', () => goToPage(n)));
}

// --- Achievements -----------------------------------------------------------------------

const MORE_BADGES = 12;

/** One ladder: its number, its steps (earned ones gold), and how far to the next. */
function ladderCard(ladder) {
    const value = ladder.id === 'level' ? String(ladder.value) : ladder.value.toLocaleString('en-GB');
    return el('section', { class: 'life-surface life-ladder', 'aria-label': ladder.title }, [
        el('div', { class: 'life-ladder-head' }, [el('h2', { class: 'life-ladder-title', text: ladder.title }), el('span', { class: 'life-ladder-value', text: value })]),
        el('p', { class: 'life-ladder-blurb', text: ladder.blurb }),
        el(
            'ol',
            { class: 'life-ladder-steps' },
            ladder.steps.map((step) =>
                el('li', { class: `life-ladder-step${step.earned ? ' earned' : ''}`, 'aria-label': `${step.label}, ${step.earned ? 'earned' : 'not yet'}` }, [
                    el('span', { class: 'life-ladder-ring', text: step.at.toLocaleString('en-GB') }),
                ]),
            ),
        ),
        ladder.next === null
            ? el('p', { class: 'life-ladder-next', text: 'Every step reached.' })
            : el('div', { class: 'life-ladder-way' }, [
                el('span', { class: 'life-ladder-bar', role: 'img', 'aria-label': `${Math.round(ladder.fraction * 100)}% of the way to ${ladder.nextLabel}` }, [
                    el('span', { class: 'life-ladder-bar-fill', style: `width:${Math.round(ladder.fraction * 1000) / 10}%` }),
                ]),
                el('p', { class: 'life-ladder-next', text: `Next: ${ladder.nextLabel} · ${ladder.toGo.toLocaleString('en-GB')} to go` }),
            ]),
    ]);
}

/** Gym's own badges: the ones earned, most recent first, and how many there are in all. */
function badgesCard(badges, total) {
    const earned = [...badges].sort((a, b) => String(b.earnedAt).localeCompare(String(a.earnedAt)));
    const shown = earned.slice(0, MORE_BADGES);
    return el('section', { class: 'life-surface life-ladder', 'aria-label': 'Gym badges' }, [
        el('div', { class: 'life-ladder-head' }, [el('h2', { class: 'life-ladder-title', text: 'Gym badges' }), el('span', { class: 'life-ladder-value', text: String(earned.length) })]),
        el('p', { class: 'life-ladder-blurb', text: total ? `${earned.length} of ${total} earned` : 'Earned by training in Gym' }),
        shown.length
            ? el('ul', { class: 'life-badge-list' }, shown.map((badge) => el('li', { class: 'life-badge' }, [el('span', { class: 'life-badge-icon' }, [icon(badge.icon, { size: 16 })]), el('span', { text: badge.name })])))
            : el('p', { class: 'life-ladder-next', text: 'Finish a workout to start earning them.' }),
        earned.length > shown.length ? el('p', { class: 'life-ladder-next', text: `and ${earned.length - shown.length} more` }) : null,
    ]);
}

/**
 * Fills the Achievements page. `stats` is `{ goodDays, bestStreak, level, workouts }`
 * and `badges` the Gym badges already earned (`badgesTotal` is how many exist).
 */
export function renderAchievements({ stats, badges = [], badgesTotal = 0 }) {
    const result = achievements(stats, { badgesEarned: badges.length, badgesTotal });
    const line = document.getElementById('life-achievements-line');
    if (line) line.textContent = result.earned ? 'Keep building on what you’ve done.' : 'Every journey starts somewhere.';
    const next = result.ladders.find((ladder) => ladder.next !== null);
    document.getElementById('life-achievements-hero')?.replaceChildren(
        el('span', { class: 'life-achievements-hero-kicker', text: 'Your collection' }),
        el('div', { class: 'life-achievements-hero-main' }, [
            el('span', { class: 'life-achievements-hero-number', text: String(result.earned) }),
            el('span', { class: 'life-achievements-hero-label', text: result.earned === 1 ? 'milestone earned' : 'milestones earned' }),
        ]),
        el('div', { class: 'life-achievements-hero-next' }, [
            icon('spark', { size: 20 }),
            el('span', { text: next ? `Up next · ${next.title}: ${next.nextLabel}` : 'Every listed milestone reached.' }),
        ]),
    );
    document.getElementById('life-achievements')?.replaceChildren(...result.ladders.map(ladderCard), badgesCard(badges, result.badges.total));
}
