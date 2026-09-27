import { el } from './dom.js';
import { icon } from './icons.js';
import { lifeDb } from './db.js';
import { localDayId, weekStartId, addDays } from './dates.js';
import { state as gymState } from '../gym/js/store.js';
import { computeProgress } from '../gym/js/progress.js';
import { getUnit, toDisplay, formatNumber } from '../gym/js/units.js';
import { state as food, loadDay, loadTargets } from '../nutrition/store.js';
import { dayTotals, hasTarget } from '../nutrition/totals.js';
import { state as habitsState, loadHabits, loadLogs, loadTicks, doneDays, tickedSteps, toggleHabit } from '../habits/store.js';
import { isScheduled, currentStreak } from '../habits/streaks.js';
import { isRoutine, routineProgress } from '../habits/routine.js';
import { openRoutine } from '../habits/routine-sheet.js';
import { state as bodyState, loadEntries, entryFor } from '../body/store.js';
import { trendSeries, weeklyLogReminder } from '../body/stats.js';

/**
 * Today — the home screen. Instead of a menu of sections it's a summary of the
 * day, one block per section in that section's colour, each with the one
 * thing you're most likely to do next (tick a habit, log food, start a
 * workout). Everything is read through the sections' own stores and maths, so
 * a number here always matches the one inside the section.
 */

let gymReady = () => Promise.resolve();
let renderToken = 0;

const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HABITS_SHOWN = 6;

export function initHome({ gymReady: waitForGym }) {
    gymReady = waitForGym;

    // Coming back to the app on a later day (or hours later) should show that
    // day, not whatever was on screen when it was last open.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !document.getElementById('life-home').hidden) renderHome();
    });
}

function greeting(hour) {
    if (hour < 5) return 'Good night';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

function renderHeader(now) {
    document.getElementById('life-date').textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
    document.getElementById('life-greeting').textContent = greeting(now.getHours());
}

export async function renderHome() {
    const token = ++renderToken;
    const now = new Date();
    const today = localDayId(now);
    renderHeader(now);

    try {
        await Promise.all([gymReady(), lifeDb.init()]);
        await Promise.all([loadDay(today), loadTargets(), loadHabits(), loadLogs(), loadTicks(), loadEntries()]);
    } catch (error) {
        console.error(error);
        return;
    }

    // A newer render started while this one was loading; let it win.
    if (token !== renderToken) return;

    document.getElementById('life-today').replaceChildren(
        ...[weighInReminder()].filter(Boolean),
        gymBlock(today),
        nutritionBlock(),
        habitsBlock(today),
        bodyBlock(today),
    );
}

// --- Pieces -----------------------------------------------------------------

function block(tone, title, iconName, children) {
    return el('section', { class: 'life-block life-surface', dataset: { tone } }, [
        el('a', { class: 'life-block-head', href: `#/${tone}` }, [
            el('span', { class: 'life-chip' }, [icon(iconName, { size: 19 })]),
            el('span', { class: 'life-block-title', text: title }),
            icon('chevron', { size: 18 }),
        ]),
        ...children,
    ]);
}

function figure(value, unit) {
    return el('div', { class: 'life-figure' }, [value, unit ? el('small', { text: unit }) : null]);
}

function action(label, href, quiet = false) {
    return el('a', {
        class: `btn btn-block life-block-action${quiet ? ' quiet' : ''}`,
        href,
        text: label,
    });
}

const fmt = (n) => Math.round(n).toLocaleString();

// --- Weekly weigh-in reminder -------------------------------------------------------

/** Saturday noon to Sunday night, until that weekend has a weight and a steps entry. */
function weighInReminder() {
    const { due, missing } = weeklyLogReminder(bodyState.entries);
    if (!due) return null;

    const text = missing.length === 2
        ? 'Log this week’s weight and steps.'
        : `Just your ${missing[0]} left for this week.`;

    return el('section', { class: 'life-reminder', dataset: { tone: 'body' } }, [
        el('span', { class: 'life-chip' }, [icon('scale', { size: 19 })]),
        el('p', { class: 'life-reminder-text' }, [el('strong', { text: 'Weekly weigh-in' }), text]),
        // Body itself, not straight into the sheet, so pasting from Health is one tap away too.
        el('a', { class: 'btn btn-small life-reminder-action', href: '#/body', text: 'Log now' }),
    ]);
}

// --- Gym ----------------------------------------------------------------------

function gymBlock(today) {
    const active = gymState.activeWorkout;

    if (active) {
        const started = new Date(active.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return block('gym', 'Gym', 'gym', [
            figure('In progress'),
            el('p', { class: 'life-sub', text: `${active.name} · started ${started}` }),
            action('Resume workout', '#/gym/workout'),
        ]);
    }

    const progress = computeProgress();
    const week = progress.currentWeek;
    const weekStart = weekStartId(today);
    const trainedDays = new Set(
        gymState.workouts
            .map((workout) => localDayId(new Date(workout.startedAt)))
            .filter((day) => day >= weekStart),
    );
    const trainedToday = trainedDays.has(today);

    const targetHit = week && week.sessions >= week.target;
    const streak = progress.streak > 1 ? `${progress.streak}-week streak` : null;

    let note = 'A good week starts with one session.';
    if (trainedToday) note = 'Trained today. Nice work.';
    else if (targetHit) note = streak ? `Weekly target hit · ${streak}` : 'Weekly target hit. Anything more is a bonus.';
    else if (streak) note = `${streak} going.`;
    else if (week?.sessions) note = `${week.target - week.sessions} more to hit this week’s target.`;

    const dots = el(
        'div',
        { class: 'life-week', 'aria-label': `Trained on ${trainedDays.size} days this week` },
        WEEK_LETTERS.map((letter, index) => {
            const day = addDays(weekStart, index);
            const classes = ['life-week-day', trainedDays.has(day) ? 'trained' : '', day === today ? 'today' : '']
                .filter(Boolean)
                .join(' ');
            return el('div', { class: classes }, [el('span', { class: 'life-week-dot' }), el('span', { text: letter })]);
        }),
    );

    return block('gym', 'Gym', 'gym', [
        figure(String(week?.sessions ?? 0), `of ${week?.target ?? 0} sessions this week`),
        el('p', { class: 'life-sub', text: note }),
        dots,
        action(trainedToday ? 'Start another workout' : 'Start a workout', '#/gym/workout', trainedToday || targetHit),
    ]);
}

// --- Nutrition ----------------------------------------------------------------

function ring(value, target, label, unit) {
    const size = 38;
    const stroke = 5;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const fraction = hasTarget(target) ? Math.min(1, value / target) : 0;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('aria-hidden', 'true');
    for (const cls of ['life-ring-track', 'life-ring-fill']) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', cls);
        circle.setAttribute('cx', String(size / 2));
        circle.setAttribute('cy', String(size / 2));
        circle.setAttribute('r', String(radius));
        circle.setAttribute('stroke-width', String(stroke));
        if (cls === 'life-ring-fill') {
            circle.setAttribute('stroke-dasharray', String(circumference));
            circle.setAttribute('stroke-dashoffset', String(circumference * (1 - fraction)));
        }
        svg.append(circle);
    }

    return el('div', { class: 'life-ring' }, [
        svg,
        el('span', { class: 'life-ring-label', text: label }),
        el('span', { class: 'life-ring-value' }, [
            fmt(value),
            el('small', { text: hasTarget(target) ? ` / ${fmt(target)} ${unit}` : ` ${unit}` }),
        ]),
    ]);
}

function nutritionBlock() {
    const totals = dayTotals(food.entries);
    const { kcal, proteinG } = food.targets;

    let note = food.entries.length ? `${food.entries.length} logged today` : 'Nothing logged yet today.';
    if (hasTarget(proteinG) && totals.proteinG < proteinG && food.entries.length) {
        note = `${fmt(proteinG - totals.proteinG)} g of protein to go`;
    } else if (hasTarget(proteinG) && totals.proteinG >= proteinG) {
        note = 'Protein target reached.';
    }

    return block('nutrition', 'Nutrition', 'nutrition', [
        el('div', { class: 'life-rings' }, [
            ring(totals.kcal, kcal, 'Calories', 'kcal'),
            ring(totals.proteinG, proteinG, 'Protein', 'g'),
        ]),
        el('p', { class: 'life-sub', text: note, style: 'margin-top: 12px' }),
        action('Log food', '#/nutrition/log', food.entries.length > 0),
    ]);
}

// --- Habits -------------------------------------------------------------------

function habitsBlock(today) {
    if (!habitsState.habits.length) {
        return block('habits', 'Habits', 'habits', [
            el('p', { class: 'life-sub', text: 'Small things, done often. Add one to start a streak.' }),
            action('Add a habit', '#/habits/new'),
        ]);
    }

    const due = habitsState.habits.filter((habit) => isScheduled(habit, today));
    if (!due.length) {
        return block('habits', 'Habits', 'habits', [
            figure('Rest day'),
            el('p', { class: 'life-sub', text: 'Nothing scheduled for today.' }),
        ]);
    }

    const doneCount = due.filter((habit) => doneDays(habit.id).has(today)).length;
    const shown = due.slice(0, HABITS_SHOWN);
    const extra = due.length - shown.length;

    const node = block('habits', 'Habits', 'habits', [
        figure(`${doneCount} of ${due.length}`, doneCount === due.length ? 'all done' : 'done today'),
        el('div', { class: 'life-habit-list', style: 'margin-top: 10px' }, shown.map((habit) => habitRow(habit, today))),
        extra > 0 ? el('a', { class: 'link-btn', href: '#/habits', text: `+${extra} more`, style: 'margin-top: 6px' }) : null,
    ]);
    return node;
}

/** Redraws just the Habits block, so the others don't replay their entrance. */
function refreshHabitsBlock(today) {
    const section = document.querySelector('.life-block[data-tone="habits"]');
    if (!section) return;
    const next = habitsBlock(today);
    next.style.animation = 'none';
    section.replaceWith(next);
}

function habitRow(habit, today) {
    const done = doneDays(habit.id).has(today);
    const streak = currentStreak(habit, doneDays(habit.id), today);
    const routine = isRoutine(habit);
    const progress = routine ? routineProgress(habit, tickedSteps(habit.id, today), today) : null;

    return el(
        'button',
        {
            class: `life-habit${done ? ' done' : ''}`,
            type: 'button',
            'aria-pressed': String(done),
            'aria-label': routine ? `${habit.name}, ${progress.done} of ${progress.total} steps. Open checklist` : null,
            onclick: async () => {
                // A routine opens its checklist; a plain habit ticks in place.
                if (routine) {
                    openRoutine(habit, today, { onChange: () => refreshHabitsBlock(today) });
                    return;
                }
                try {
                    await toggleHabit(habit, today);
                } catch (error) {
                    console.error(error);
                    return;
                }
                refreshHabitsBlock(today);
            },
        },
        [
            el('span', { class: 'life-tick' }, [
                done ? icon('check', { size: 16 }) : progress?.done ? el('span', { text: String(progress.done) }) : null,
            ]),
            el('span', { class: 'life-habit-name' }, [
                habit.name,
                routine && !done ? el('small', { text: `${progress.done} of ${progress.total} steps` }) : null,
            ]),
            streak > 1
                ? el('span', { class: 'life-habit-streak', 'aria-label': `${streak} in a row` }, [
                    icon('flame', { size: 14 }),
                    String(streak),
                ])
                : null,
            routine ? icon('chevron', { size: 16, className: 'life-habit-open' }) : null,
        ],
    );
}

// --- Body ----------------------------------------------------------------------

const fmtWeight = (kg) => `${formatNumber(Math.round(toDisplay(kg) * 10) / 10)}`;

function stat(iconName, label, value, note) {
    return el('div', { class: 'life-stat' }, [
        el('span', { class: 'life-stat-label' }, [icon(iconName, { size: 14 }), label]),
        el('span', { class: `life-stat-value${value ? '' : ' empty'}`, text: value || '—' }),
        note ? el('span', { class: 'life-stat-note', text: note }) : null,
    ]);
}

function bodyBlock(today) {
    const entry = entryFor(today);
    const series = trendSeries(bodyState.entries);
    const latest = series.at(-1);

    let weightNote = null;
    if (latest) {
        const weekAgo = series.filter((point) => point.day <= addDays(today, -7)).at(-1);
        if (weekAgo) {
            const change = Math.round(toDisplay(latest.trendKg - weekAgo.trendKg) * 10) / 10;
            weightNote = change === 0 ? 'steady this week' : `${change < 0 ? '−' : '+'}${formatNumber(Math.abs(change))} this week`;
        } else if (latest.day !== today) {
            weightNote = 'last logged';
        }
    }

    return block('body', 'Body', 'body', [
        el('div', { class: 'life-stats' }, [
            stat('scale', 'Weight', latest ? `${fmtWeight(latest.weightKg)} ${getUnit()}` : null, weightNote),
            stat('moon', 'Sleep', entry?.sleepHours != null ? `${formatNumber(entry.sleepHours)} h` : null),
            stat('steps', 'Steps', entry?.steps != null ? fmt(entry.steps) : null),
        ]),
        action(entry ? 'Edit today' : 'Log today', '#/body/log', Boolean(entry)),
    ]);
}
