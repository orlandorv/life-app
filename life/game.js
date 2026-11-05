import { $, el, clear, openModal } from './dom.js';
import { icon } from './icons.js';
import { localDayId, addDays, weekStartId, daysBetween } from './dates.js';
import { computeGame, saveLedger } from './game-inputs.js';
import { withGoal, WEIGHTS, BONUS, MAX_BASE_XP, GOOD_AT, FREEZE_EVERY, MAX_FREEZES } from './game-rules.js';

/**
 * The game, as you see it: one card at the top of Today (a level bar, a streak,
 * and today's goals filling a daily bar) and a sheet behind it with the detail.
 * The numbers all come from game-rules.js, derived from what the sections have
 * recorded; this file only draws them and writes the one thing you choose
 * (which goals count).
 */

/** What each goal is called, where it leads, and its section colour. */
const GOALS = {
    habits: { label: 'Habits', icon: 'habits', href: '#/habits', tone: 'habits', blurb: 'The share of today’s habits you tick.' },
    food: { label: 'Food', icon: 'nutrition', href: '#/nutrition/log', tone: 'nutrition', blurb: 'Log two different meals. Reaching your protein target is a bonus.' },
    body: { label: 'Body', icon: 'body', href: '#/body/log', tone: 'body', blurb: 'Log a weight, your sleep or your steps.' },
    journal: { label: 'Check-in', icon: 'journal', href: '#/journal', tone: 'journal', blurb: 'A mood, an energy level or a note.' },
    workout: { label: 'Workout', icon: 'gym', href: '#/gym/workout', tone: 'gym', blurb: 'A bonus for a finished workout. Never required, so rest days are fine.' },
};
const DAILY = ['habits', 'food', 'body', 'journal'];

const unit = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The state the card and sheet draw from; replaced on every refresh. */
let current = null;

/** Works the game out as of today. Safe to call often; reads storage and changes nothing but a first-run ledger. */
export async function loadGame(today = localDayId()) {
    current = { ...(await computeGame(today)), today };
    return current;
}

const bar = (fraction, label, className = '') =>
    el('span', { class: `life-game-bar ${className}`, role: 'img', 'aria-label': label }, [
        el('span', { class: 'life-game-bar-fill', style: `width:${Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10}%` }),
    ]);

/** Today's bar: a segment per goal that applies, as wide as it is worth, filled by how much of it is done. */
function todayBar(day) {
    const total = day.goals.reduce((sum, goal) => sum + goal.weight, 0);
    return el(
        'span',
        { class: 'life-game-today-bar', role: 'img', 'aria-label': `Today: ${day.base} of ${MAX_BASE_XP}` },
        day.goals.map((goal) =>
            el('span', { class: 'life-game-seg', dataset: { goal: goal.id }, style: `flex:${goal.weight / total}` }, [
                el('span', { class: 'life-game-seg-fill', style: `width:${Math.round(goal.fraction * 100)}%` }),
            ]),
        ),
    );
}

function chip(id, state) {
    const meta = GOALS[id];
    const day = state.game.today;
    const goal = day.goals.find((g) => g.id === id);
    const isBonus = id === 'workout';
    const done = isBonus ? day.bonuses.includes('workout') : goal.fraction >= 1;
    const progress = goal?.of ? `${goal.done}/${goal.of}` : '';
    const text = isBonus ? `+${BONUS.workout}` : progress;
    const spoken = isBonus
        ? `Workout bonus, ${done ? 'earned' : 'not yet'}`
        : `${meta.label}: ${goal.of ? `${goal.done} of ${goal.of}` : done ? 'done' : 'not yet'}`;

    return el('a', { class: `life-game-chip${done ? ' done' : ''}`, href: meta.href, dataset: { goal: id }, 'aria-label': spoken }, [
        done ? icon('check', { size: 14 }) : icon(meta.icon, { size: 14 }),
        el('span', { text: meta.label }),
        text ? el('small', { text }) : null,
    ]);
}

/** The card for the top of Today, or null when no goal is switched on. */
export function gameCard(state = current) {
    if (!state?.game.today) return null;
    const { game, ledger } = state;
    const day = game.today;
    const { level, into, span } = game.level;
    const chips = [...DAILY.filter((id) => day.goals.some((g) => g.id === id)), ...(ledger.goals.workout && goalOnToday(ledger.goals.workout, state.today) ? ['workout'] : [])];

    return el('section', { class: 'life-game life-surface', 'aria-label': 'Your progress' }, [
        el('button', { class: 'life-game-main', type: 'button', onclick: () => openGameSheet() }, [
            el('span', { class: 'life-game-head' }, [
                el('span', { class: 'life-chip life-game-chip-icon' }, [icon('level', { size: 19 })]),
                el('span', { class: 'life-game-level' }, [`Level ${level}`]),
                el('span', { class: `life-game-streak${game.streak ? '' : ' none'}` }, [
                    icon('flame', { size: 16 }),
                    game.streak ? unit(game.streak, 'day') : 'No streak yet',
                ]),
            ]),
            bar(into / span, `Level progress: ${into} of ${span} XP`),
            el('span', { class: 'life-game-xp', text: `${into.toLocaleString()} / ${span.toLocaleString()} XP` }),
            el('span', { class: 'life-game-today' }, [
                el('span', { class: 'life-game-today-label', text: 'Today' }),
                el('span', { class: 'life-game-today-score', text: day.applies ? `${day.base} / ${MAX_BASE_XP}${day.good ? ' · Good day' : ''}` : 'Nothing due' }),
            ]),
            day.applies ? todayBar(day) : null,
        ]),
        chips.length ? el('div', { class: 'life-game-chips' }, chips.map((id) => chip(id, state))) : null,
    ]);
}

const goalOnToday = (range, today) => Boolean(range) && today >= range.from && (range.to == null || today <= range.to);

// --- The sheet -------------------------------------------------------------------------

/** Opens the detail sheet. `onChange` is called after a goal is switched, so the caller can redraw. */
export function openGameSheet() {
    if (!current) return;
    drawSheet();
    openModal('game-modal');
}

/** Redraws the card on Today and, if open, the sheet, from `current`. */
export function redrawGame() {
    const card = document.querySelector('.life-game');
    const next = gameCard();
    if (card && next) {
        next.style.animation = 'none';
        card.replaceWith(next);
    }
    if (document.getElementById('game-modal')?.classList.contains('active')) drawSheet();
}

/** Recomputes, then redraws. */
export async function refreshGame() {
    await loadGame();
    redrawGame();
}

function stat(value, label) {
    return el('div', { class: 'life-game-stat' }, [el('strong', { text: String(value) }), el('span', { text: label })]);
}

function drawSheet() {
    const { game, ledger, today } = current;
    const { level, into, span } = game.level;
    const day = game.today;

    const body = clear($('#game-body'));
    body.append(
        el('section', { class: 'life-game-hero' }, [
            el('div', { class: 'life-game-hero-level', text: `Level ${level}` }),
            el('div', { class: 'life-game-hero-sub', text: `${into.toLocaleString()} / ${span.toLocaleString()} XP · ${(span - into).toLocaleString()} to level ${level + 1}` }),
            bar(into / span, `Level progress: ${into} of ${span} XP`, 'big'),
        ]),
        el('section', { class: 'life-game-stats' }, [
            stat(game.streak, 'day streak'),
            stat(game.best, 'best'),
            stat(`${game.freezes}/${MAX_FREEZES}`, 'freezes'),
            stat(game.goodDays, 'good days'),
        ]),
        el('p', {
            class: 'hint life-game-explain',
            text: `Every ${FREEZE_EVERY} good days in a row banks a freeze. A missed day uses one to keep your streak, so one bad day doesn’t undo a month.`,
        }),
        todaySection(day),
        el('section', {}, [
            el('h3', { class: 'life-eyebrow life-game-h', text: 'The last 12 weeks' }),
            heatmap(game, today),
            el('p', { class: 'hint', text: `Each square is a day. The stronger the colour, the better the day; ${GOOD_AT}+ is a good one.` }),
        ]),
        el('section', {}, [
            el('h3', { class: 'life-eyebrow life-game-h', text: 'What counts' }),
            el('div', { class: 'life-list life-game-goals' }, Object.keys(GOALS).map((id) => goalToggle(id, ledger, today))),
        ]),
        el('p', {
            class: 'hint life-game-explain',
            text: `Your level comes only from good days, and a day can pay at most ${MAX_BASE_XP} (plus bonuses), so it can’t be farmed. Missed days never take XP away. Gym keeps its own level and XP.`,
        }),
    );
}

function todaySection(day) {
    if (!day.applies && !day.bonuses.length) {
        return el('section', {}, [
            el('h3', { class: 'life-eyebrow life-game-h', text: 'Today' }),
            el('p', { class: 'hint', text: 'Nothing is due today, so it doesn’t count for or against your streak.' }),
        ]);
    }
    const applicable = day.goals.reduce((sum, goal) => sum + goal.weight, 0);
    const rows = day.goals.map((goal) => {
        const worth = Math.round((MAX_BASE_XP * goal.weight) / applicable);
        const earned = Math.round(worth * goal.fraction);
        return el('div', { class: 'life-game-row' }, [
            el('span', { class: 'life-game-row-label', text: GOALS[goal.id].label }),
            el('span', { class: 'life-game-row-detail', text: goal.of ? `${goal.done} of ${goal.of}` : goal.fraction >= 1 ? 'Done' : 'Not yet' }),
            el('span', { class: 'life-game-row-xp', text: `${earned} / ${worth}` }),
        ]);
    });
    for (const id of day.bonuses) {
        rows.push(
            el('div', { class: 'life-game-row bonus' }, [
                el('span', { class: 'life-game-row-label', text: id === 'workout' ? 'Workout bonus' : 'Protein target bonus' }),
                el('span', { class: 'life-game-row-detail', text: 'Earned' }),
                el('span', { class: 'life-game-row-xp', text: `+${BONUS[id]}` }),
            ]),
        );
    }
    return el('section', {}, [el('h3', { class: 'life-eyebrow life-game-h', text: `Today · ${day.xp} XP` }), el('div', { class: 'life-list life-game-today-list' }, rows)]);
}

/** Twelve weeks of days, Monday first, a column a week. A day with no score (or yet to come) is blank. */
function heatmap(game, today) {
    const start = addDays(weekStartId(today), -11 * 7);
    const cells = [];
    for (let i = 0; i < 84; i += 1) {
        const day = addDays(start, i);
        const row = game.byDay.get(day);
        let level = 'none';
        if (day <= today && row?.applies) level = row.base >= 100 ? '5' : row.base >= GOOD_AT ? '4' : row.base >= 40 ? '2' : row.base > 0 ? '1' : '0';
        cells.push(
            el('span', {
                class: 'life-game-cell',
                dataset: { level },
                title: row?.applies ? `${day}: ${row.base} / ${MAX_BASE_XP}` : day,
            }),
        );
    }
    return el('div', { class: 'life-game-heat', role: 'img', 'aria-label': `Good days in the last 12 weeks: ${recentGood(game, today)}` }, cells);
}

const recentGood = (game, today) => game.rows.filter((row) => row.good && daysBetween(row.day, today) < 84).length;

function goalToggle(id, ledger, today) {
    const meta = GOALS[id];
    const on = goalOnToday(ledger.goals[id], today);
    const box = el('input', { type: 'checkbox' });
    box.checked = on;
    box.addEventListener('change', async () => {
        const goals = withGoal(ledger.goals, id, box.checked, today);
        try {
            await saveLedger({ ...ledger, goals });
        } catch (error) {
            console.error(error);
            box.checked = !box.checked;
            return;
        }
        await refreshGame();
    });
    const worth = id === 'workout' ? `+${BONUS.workout} bonus` : `${WEIGHTS[id]} of 100`;
    return el('label', { class: 'life-check life-game-goal' }, [
        box,
        el('span', { class: 'life-game-goal-text' }, [el('span', { text: `${meta.label} · ${worth}` }), el('small', { text: meta.blurb })]),
    ]);
}
