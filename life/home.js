import { el } from './dom.js';
import { icon } from './icons.js';
import { lifeDb } from './db.js';
import { localDayId, weekStartId, addDays, dayLabel } from './dates.js';
import { state as gymState } from '../gym/js/store.js';
import { computeProgress } from '../gym/js/progress.js';
import { nextPlan } from '../gym/js/next-plan.js';
import { weekStanding } from '../gym/js/week-streak.js';
import { getUnit, toDisplay, formatNumber } from '../gym/js/units.js';
import { state as food, loadDay, loadDays, loadTargets } from '../nutrition/store.js';
import { dayTotals, hasTarget } from '../nutrition/totals.js';
import { state as habitsState, loadHabits, loadLogs, loadTicks, doneDays, tickedSteps, toggleHabit } from '../habits/store.js';
import { isScheduled, isDue, isWeekly, weekCount, weekTarget, currentStreak } from '../habits/streaks.js';
import { isRoutine, routineProgress } from '../habits/routine.js';
import { timeRank } from '../habits/times.js';
import { openRoutine } from '../habits/routine-sheet.js';
import { state as bodyState, loadEntries, entryFor } from '../body/store.js';
import { trendSeries, weeklyLogReminder } from '../body/stats.js';
import { state as videosState, loadVideos } from '../videos/store.js';
import { state as booksState, loadBooks } from '../videos/books-store.js';
import { toReadCount, nextToRead } from '../videos/books-organize.js';
import { state as screensState, loadScreens } from '../videos/screens-store.js';
import { toWatchCount, nextToWatch as nextScreen } from '../videos/screens-organize.js';
import { unwatchedCount, nextToWatch } from '../videos/organize.js';
import { state as tasksState, loadTasks } from '../tasks/store.js';
import { nextTask, overdueCount, dueCount, taskDateLabel } from '../tasks/organize.js';
import { state as journalState, loadEntries as loadJournal, entryFor as journalEntryFor, saveEntry as saveJournalEntry } from '../journal/store.js';
import { MOODS, SCALE, moodLabel, energyLabel, entryPreview } from '../journal/insights.js';
import { state as inboxState, loadNotes } from '../inbox/store.js';
import { sortNotes } from '../inbox/organize.js';
import { state as wishState, loadItems as loadWishlist } from '../wishlist/store.js';
import { splitItems, totalOf, formatPrice } from '../wishlist/organize.js';
import { buildWeeklyReview, reviewRows, isReviewDay } from './review.js';
import { loadGame, gameCard, currentGame, openGameSheet, paintDayLine } from './game.js';
import { daypart, arcPath } from './dial.js';
import { svg } from './svg.js';

/**
 * Today — the home screen. Instead of a menu of sections it's a summary of the
 * day, one block per section in that section's colour, each with the one
 * thing you're most likely to do next (tick a habit, log food, start a
 * workout). Everything is read through the sections' own stores and maths, so
 * a number here always matches the one inside the section.
 */

let gymReady = () => Promise.resolve();
let renderToken = 0;

const HABITS_SHOWN = 6;

export function initHome({ gymReady: waitForGym }) {
    gymReady = waitForGym;

    // Coming back to the app on a later day (or hours later) should show that
    // day, not whatever was on screen when it was last open.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && !document.getElementById('life-home').hidden) renderHome();
    });
}

/**
 * The date, "Good *morning*" (the part of the day in italic) and the light of the
 * hour: `body[data-daypart]` picks the wash behind the top of Today (life.css).
 */
function renderHeader(now) {
    const part = daypart(now.getHours() + now.getMinutes() / 60);
    document.body.dataset.daypart = part;
    document.getElementById('life-date').textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
    document.getElementById('life-greeting').replaceChildren('Good ', el('em', { text: part }));
}

export async function renderHome() {
    const token = ++renderToken;
    const now = new Date();
    const today = localDayId(now);
    renderHeader(now);

    // The week's food is only needed for the Sunday review.
    let weekFood = new Map();

    try {
        await Promise.all([gymReady(), lifeDb.init()]);
        // Journal, Inbox and the Sunday food week are each their own block, so one
        // of them failing to load leaves only that block empty, not the whole screen.
        const optional = (load) => load.catch((error) => console.error(error));
        await Promise.all([
            loadDay(today), loadTargets(), loadHabits(), loadLogs(), loadTicks(), loadEntries(), loadVideos(), loadTasks(),
            optional(loadJournal()),
            optional(loadNotes()),
            optional(loadWishlist()),
            optional(loadBooks()),
            optional(loadScreens()),
            optional(loadGame(today)),
            isReviewDay(today)
                ? optional(loadDays(Array.from({ length: 7 }, (_, i) => addDays(weekStartId(today), i))).then((byDay) => { weekFood = byDay; }))
                : null,
        ]);
    } catch (error) {
        console.error(error);
        if (token === renderToken) {
            document.getElementById('life-today').replaceChildren(
                el('p', { class: 'life-sub', role: 'alert', text: 'Couldn’t load Today. Close and reopen the app; your data is untouched.' }),
            );
        }
        return;
    }

    // A newer render started while this one was loading; let it win.
    if (token !== renderToken) return;

    document.getElementById('life-today').replaceChildren(
        ...[gameCard(undefined, undefined, { enter: true }), weighInReminder(), reviewCard(today, weekFood)].filter(Boolean),
        // Every section as a room in one list: the same arc, the same anatomy.
        el('h2', { class: 'life-eyebrow life-rooms-title', text: 'Your rooms' }),
        el('div', { class: 'life-rooms life-surface' }, [
            gymBlock(today),
            nutritionBlock(),
            habitsBlock(today),
            bodyBlock(today),
            journalBlock(today),
            videosBlock(),
            tasksBlock(today),
            inboxBlock(),
            wishlistBlock(),
        ]),
    );
    paintDayLine();
}

// --- Pieces -----------------------------------------------------------------

/**
 * A section's arc at 44px: the Day Dial's shape in miniature, in the section's
 * colour, with a short label in the middle. Every room on Today has one, so the
 * page reads as one system rather than nine different cards.
 */
function roomArc(fraction, label) {
    const f = Math.max(0, Math.min(1, fraction || 0));
    const root = svg('svg', { viewBox: '0 0 44 44', class: 'life-room-arc', 'aria-hidden': 'true', focusable: 'false' });
    const d = arcPath(22, 22, 18, 0, 360);
    root.append(svg('circle', { cx: 22, cy: 22, r: 18, class: 'life-room-track' }));
    if (f > 0) root.append(svg('path', { d, pathLength: 1, 'stroke-dasharray': '1 1', style: `stroke-dashoffset:${(1 - f).toFixed(4)}`, class: 'life-room-fill' }));
    if (label !== undefined && label !== null) root.append(svg('text', { x: 22, y: 26.5, class: `life-room-label${String(label).length > 3 ? ' small' : ''}` }, String(label)));
    return root;
}

/**
 * One room on Today: its arc, its name and one line of what matters now (both
 * opening the section), an optional action, and optional content below (the
 * day's habits to tick, the mood buttons). `warn` colours the line for something
 * overdue — information, never a scolding.
 */
function room(tone, title, { arc = null, line = null, warn = false, act = null, quietAct = false, body = [] } = {}) {
    return el('section', { class: 'life-room', dataset: { tone } }, [
        el('div', { class: 'life-room-head' }, [
            el('a', { class: 'life-room-link', href: `#/${tone}` }, [
                roomArc(arc?.fraction ?? 0, arc?.label ?? null),
                el('span', { class: 'life-room-text' }, [
                    el('span', { class: 'life-room-name', text: title }),
                    line ? el('span', { class: `life-room-line${warn ? ' warn' : ''}`, text: line }) : null,
                ]),
            ]),
            act ? el('a', { class: `life-room-go${quietAct ? ' quiet' : ''}`, href: act.href, text: act.label }) : null,
        ]),
        ...(body.filter(Boolean).length ? [el('div', { class: 'life-room-body' }, body.filter(Boolean))] : []),
    ]);
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

// --- Weekly review ---------------------------------------------------------------

const dayDate = (dayId) => {
    const [year, month, day] = dayId.split('-').map(Number);
    return new Date(year, month - 1, day);
};

/** Sundays: how the week went, one row per section, each opening its section. */
function reviewCard(today, weekFood) {
    if (!isReviewDay(today)) return null;

    const review = buildWeeklyReview({
        today,
        gymWeek: computeProgress().currentWeek,
        workouts: gymState.workouts,
        bodyEntries: bodyState.entries,
        nutritionDays: weekFood,
        targets: food.targets,
        habits: habitsState.habits,
        done: habitsState.done,
        journalEntries: journalState.entries,
        game: currentGame(),
    });
    if (!review) return null;

    const short = (dayId) => dayDate(dayId).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

    return el('section', { class: 'life-review life-surface', 'aria-label': 'Your week' }, [
        el('div', { class: 'life-review-head' }, [
            el('h2', { class: 'life-review-title', text: 'Your week' }),
            el('span', { class: 'life-review-range', text: `${short(review.weekStart)} – ${short(review.weekEnd)}` }),
        ]),
        ...reviewRows(review, { unit: getUnit() }).map((row) =>
            // The Life row has no section of its own: it opens the game's sheet.
            el('a', { class: 'life-review-row', href: row.tone === 'life' ? '#/' : `#/${row.tone}`, dataset: { tone: row.tone }, onclick: row.tone === 'life' ? (event) => { event.preventDefault(); openGameSheet(); } : undefined }, [
                el('span', { class: 'life-chip' }, [icon(row.icon, { size: 19 })]),
                el('span', { class: 'life-review-text' }, [
                    el('span', { class: 'life-review-label', text: row.label }),
                    el('span', { class: 'life-review-main', text: row.text }),
                    row.detail ? el('span', { class: 'life-review-detail', text: row.detail }) : null,
                ]),
                icon('chevron', { size: 16 }),
            ]),
        ),
    ]);
}

// --- Gym ----------------------------------------------------------------------

function gymBlock(today) {
    const active = gymState.activeWorkout;

    if (active) {
        const started = new Date(active.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        return room('gym', 'Gym', {
            arc: { fraction: 1, label: 'Now' },
            line: `${active.name} in progress · started ${started}`,
            act: { label: 'Resume', href: '#/gym/workout' },
        });
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

    // Gym keeps its own level and rank; the game card above is separate and says so.
    const level = gymState.workouts.length ? `Gym level ${progress.level} · ${progress.rank}` : null;

    // Where the week stands against its target and its minimum (the fewest that keep the streak).
    const standing = weekStanding({ sessions: week?.sessions ?? 0, target: week?.target ?? 0, minimum: week?.minimum ?? week?.target ?? 0 });
    let note = 'A good week starts with one session';
    if (trainedToday) {
        const where = standing.state === 'hit' ? 'target hit' : standing.state === 'kept' ? 'streak safe' : week?.sessions ? `${standing.toKeep} more keeps your streak` : '';
        note = `Trained today${where ? ` · ${where}` : '. Nice work'}`;
    } else if (standing.state === 'hit') note = streak ? `Weekly target hit · ${streak}` : 'Weekly target hit';
    else if (standing.state === 'kept') note = `Streak safe · ${standing.toTarget} more for your target`;
    else if (week?.sessions) note = `${standing.toKeep} more keeps your streak`;
    else if (streak) note = `${streak} going`;

    // The plan to do next, offered as a one-tap start — unless today is already
    // trained or the week's target is met, when a push to train would be nagging.
    const next = !trainedToday && !targetHit ? nextPlan(gymState.templates, gymState.workouts, today) : null;
    const sessions = week?.sessions ?? 0;
    const target = week?.target ?? 0;

    return room('gym', 'Gym', {
        arc: { fraction: target ? sessions / target : 0, label: `${sessions}/${target}` },
        line: [note, level].filter(Boolean).join(' · '),
        act: next
            ? { label: `Start ${next.template.name}`, href: `#/gym/workout:${next.template.id}` }
            : { label: trainedToday ? 'Another' : 'Start', href: '#/gym/workout' },
        quietAct: trainedToday || targetHit,
        body: [
            next
                ? el('p', { class: 'life-room-note' }, [
                      `Up next: ${next.template.name} · ${next.lastDay ? `last done ${dayLabel(next.lastDay, today)}` : 'not done yet'} · `,
                      el('a', { class: 'link-btn', href: '#/gym/workout', text: 'other plans' }),
                  ])
                : null,
        ],
    });
}

// --- Nutrition ----------------------------------------------------------------

function nutritionBlock() {
    const totals = dayTotals(food.entries);
    const { kcal, proteinG } = food.targets;
    const logged = food.entries.length > 0;

    // The arc is protein against its target when there is one, else calories against theirs.
    const arc = hasTarget(proteinG)
        ? { fraction: totals.proteinG / proteinG, label: `${Math.min(999, Math.round((totals.proteinG / proteinG) * 100))}%` }
        : hasTarget(kcal)
          ? { fraction: totals.kcal / kcal, label: `${Math.min(999, Math.round((totals.kcal / kcal) * 100))}%` }
          : { fraction: logged ? 1 : 0, label: String(food.entries.length) };

    const parts = logged
        ? [
              `${fmt(totals.kcal)}${hasTarget(kcal) ? ` of ${fmt(kcal)}` : ''} kcal`,
              hasTarget(proteinG) ? (totals.proteinG >= proteinG ? 'protein target reached' : `${fmt(totals.proteinG)} of ${fmt(proteinG)} g protein`) : `${fmt(totals.proteinG)} g protein`,
          ]
        : ['Nothing logged yet today'];

    return room('nutrition', 'Nutrition', {
        arc,
        line: parts.join(' · '),
        act: { label: 'Log', href: '#/nutrition/log' },
        quietAct: logged,
    });
}

// --- Inbox --------------------------------------------------------------------

/** How many notes, the newest (or pinned) one, and a quick way to jot another. */
function inboxBlock() {
    const notes = sortNotes(inboxState.notes);
    if (!notes.length) {
        return room('inbox', 'Inbox', { arc: { fraction: 0, label: '0' }, line: 'Ideas and things to remember', act: { label: 'Jot', href: '#/inbox/new' } });
    }
    return room('inbox', 'Inbox', {
        arc: { fraction: 0, label: String(notes.length) },
        line: notes[0].text,
        act: { label: 'Jot', href: '#/inbox/new' },
        quietAct: true,
    });
}

// --- Wishlist -----------------------------------------------------------------

/** How much is on the list and what it comes to, the top pick, and a quick way to add. */
function wishlistBlock() {
    const { wanted } = splitItems(wishState.items);
    if (!wanted.length) {
        return room('wishlist', 'Wishlist', { arc: { fraction: 0, label: '0' }, line: 'Things you want to buy', act: { label: 'Add', href: '#/wishlist/new' } });
    }
    const { total, priced } = totalOf(wanted);
    return room('wishlist', 'Wishlist', {
        arc: { fraction: 0, label: String(wanted.length) },
        line: [priced ? formatPrice(total) : null, `${wanted[0].starred ? 'top pick' : 'latest'}: ${wanted[0].name}`].filter(Boolean).join(' · '),
        act: { label: 'Add', href: '#/wishlist/new' },
        quietAct: true,
    });
}

// --- Journal ------------------------------------------------------------------

/**
 * Today's check-in. Until there's a mood, five buttons save one with a single
 * tap; after, it shows how the day was and opens the journal for the rest.
 */
function journalBlock(today) {
    const entry = journalEntryFor(today);

    if (entry?.mood) {
        const detail = [energyLabel(entry.energy) ? `Energy ${energyLabel(entry.energy).toLowerCase()}` : null, entryPreview(entry)]
            .filter(Boolean)
            .join(' · ');
        return room('journal', 'Journal', {
            arc: { fraction: 1, label: `${entry.mood}/5` },
            line: [moodLabel(entry.mood), detail].filter(Boolean).join(' · '),
            act: entryPreview(entry) ? null : { label: 'Add a note', href: '#/journal' },
            quietAct: true,
        });
    }

    return room('journal', 'Journal', { arc: { fraction: 0, label: '–' }, line: 'How are you today?', body: [
        el(
            'div',
            { class: 'life-journal-scale', role: 'group', 'aria-label': 'Mood today' },
            SCALE.map((level) =>
                el('button', {
                    type: 'button',
                    text: MOODS[level - 1],
                    'aria-label': `Mood today: ${MOODS[level - 1]} (${level} of 5)`,
                    onclick: async () => {
                        try {
                            await saveJournalEntry({ ...entry, day: today, mood: level });
                        } catch (error) {
                            console.error(error);
                            return;
                        }
                        refreshJournalBlock(today);
                    },
                }),
            ),
        ),
    ] });
}

/** Redraws just the Journal block, so the others don't replay their entrance. */
function refreshJournalBlock(today) {
    const section = document.querySelector('.life-room[data-tone="journal"]');
    if (!section) return;
    const next = journalBlock(today);
    next.style.animation = 'none';
    section.replaceWith(next);
}

// --- Habits -------------------------------------------------------------------

function habitsBlock(today) {
    if (!habitsState.habits.length) {
        return room('habits', 'Habits', { arc: { fraction: 0, label: '0' }, line: 'Small things, done often', act: { label: 'Add a habit', href: '#/habits/new' } });
    }

    // In the day's order (morning first, all day last); the sort is stable, so
    // habits keep their own order within a time of day.
    const listed = habitsState.habits.filter((habit) => isScheduled(habit, today));
    if (!listed.length) {
        return room('habits', 'Habits', { arc: { fraction: 0, label: '–' }, line: 'A rest day: nothing scheduled' });
    }

    // What's still asked of you today. A weekly habit whose week is done drops
    // off (until the week turns over) unless you ticked it today.
    const due = listed.filter((habit) => isDue(habit, doneDays(habit.id), today)).sort((a, b) => timeRank(a) - timeRank(b));
    if (!due.length) {
        return room('habits', 'Habits', { arc: { fraction: 1, label: 'Week' }, line: 'Your weekly habits are done for this week' });
    }

    const doneCount = due.filter((habit) => doneDays(habit.id).has(today)).length;
    const shown = due.slice(0, HABITS_SHOWN);
    const extra = due.length - shown.length;

    return room('habits', 'Habits', {
        arc: { fraction: doneCount / due.length, label: `${doneCount}/${due.length}` },
        line: doneCount === due.length ? 'All done today' : `${doneCount} of ${due.length} done today`,
        body: [
            el('div', { class: 'life-habit-list' }, shown.map((habit) => habitRow(habit, today))),
            extra > 0 ? el('a', { class: 'link-btn life-room-more', href: '#/habits', text: `+${extra} more` }) : null,
        ],
    });
}

/** Redraws just the Habits block, so the others don't replay their entrance. */
function refreshHabitsBlock(today) {
    const section = document.querySelector('.life-room[data-tone="habits"]');
    if (!section) return;
    const next = habitsBlock(today);
    next.style.animation = 'none';
    section.replaceWith(next);
}

function habitRow(habit, today) {
    const done = doneDays(habit.id).has(today);
    const streak = currentStreak(habit, doneDays(habit.id), today);
    const weekly = isWeekly(habit);
    const routine = isRoutine(habit);
    const progress = routine ? routineProgress(habit, tickedSteps(habit.id, today), today) : null;
    const week = weekly ? weekStartId(today) : null;
    const weeklyText = weekly ? `${weekCount(habit, doneDays(habit.id), week)} of ${weekTarget(habit, week)} this week` : null;

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
                !routine && weekly && !done ? el('small', { text: weeklyText }) : null,
            ]),
            streak > 1
                ? el('span', { class: 'life-habit-streak', 'aria-label': weekly ? `${streak} weeks in a row` : `${streak} in a row` }, [
                    icon('flame', { size: 14 }),
                    weekly ? `${streak}w` : String(streak),
                ])
                : null,
            routine ? icon('chevron', { size: 16, className: 'life-habit-open' }) : null,
        ],
    );
}

// --- Body ----------------------------------------------------------------------

const fmtWeight = (kg) => `${formatNumber(Math.round(toDisplay(kg) * 10) / 10)}`;

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

    // The arc is how much of today is in: a weight, a night's sleep, the steps.
    const logged = [entry?.weightKg, entry?.sleepHours, entry?.steps].filter((v) => v != null && v > 0).length;
    const parts = [
        latest ? `${fmtWeight(latest.weightKg)}\u00a0${getUnit()}${weightNote ? ` (${weightNote})` : ''}` : null,
        entry?.sleepHours != null ? `${formatNumber(entry.sleepHours)}\u00a0h sleep` : null,
        entry?.steps != null ? `${fmt(entry.steps)} steps` : null,
    ].filter(Boolean);

    return room('body', 'Body', {
        arc: { fraction: logged / 3, label: `${logged}/3` },
        line: parts.length ? parts.join(' · ') : 'Nothing logged yet',
        act: { label: entry ? 'Edit' : 'Log', href: '#/body/log' },
        quietAct: Boolean(entry),
    });
}

// --- Videos ----------------------------------------------------------------------

/** A tab's line in the Watch & Read room: how many are waiting and which is next, opening that tab. */
function tabLine(href, count, noun, next) {
    if (!count) return null;
    return el('a', { class: 'link-btn life-books-line', href }, [`${count} ${noun}${next ? ` · next: ${next.title}` : ''}`]);
}

const booksLine = () => {
    const waiting = toReadCount(booksState.books);
    return tabLine('#/videos/books', waiting, waiting === 1 ? 'book to read' : 'books to read', nextToRead(booksState.books));
};

const screensLine = () => {
    const waiting = toWatchCount(screensState.screens);
    return tabLine('#/videos/screens', waiting, waiting === 1 ? 'movie or series to watch' : 'movies and series to watch', nextScreen(screensState.screens));
};

/** The Watch & Read room: videos lead (it is the section's first tab), with a line for each of the other two. */
function videosBlock() {
    const videos = videosState.videos;
    const others = [screensLine(), booksLine()];
    const title = 'Watch & read';

    if (!videos.length) {
        return room('videos', title, { arc: { fraction: 0, label: '0' }, line: 'Videos, films and books to come back to', act: { label: 'Add', href: '#/videos/add' }, body: others });
    }

    const remaining = unwatchedCount(videos);
    const next = nextToWatch(videos);
    const arc = { fraction: (videos.length - remaining) / videos.length, label: String(remaining) };

    if (!remaining) {
        return room('videos', title, { arc, line: 'Videos: all caught up', act: { label: 'Add', href: '#/videos/add' }, quietAct: true, body: others });
    }

    return room('videos', title, {
        arc,
        line: next ? `${remaining} video${remaining === 1 ? '' : 's'} to watch · next: ${next.title}` : `${remaining} to watch`,
        body: others,
    });
}

// --- Tasks -----------------------------------------------------------------------

function tasksBlock(today) {
    const tasks = tasksState.tasks;

    if (!tasks.length) {
        return room('tasks', 'Tasks', { arc: { fraction: 0, label: '0' }, line: 'Nothing on your list yet', act: { label: 'Add', href: '#/tasks/add' } });
    }

    const due = dueCount(tasks);
    const overdue = overdueCount(tasks, today);
    const next = nextTask(tasks, today);

    if (!due) {
        return room('tasks', 'Tasks', { arc: { fraction: 1, label: '0' }, line: 'All done', act: { label: 'Add', href: '#/tasks/add' }, quietAct: true });
    }

    const note = overdue
        ? `${overdue} overdue`
        : next
          ? `next: ${next.title}, ${taskDateLabel(next.date, today).toLowerCase()}`
          : null;

    return room('tasks', 'Tasks', {
        arc: { fraction: 0, label: String(due) },
        line: note ? `${due} due · ${note}` : `${due} due`,
        warn: Boolean(overdue),
    });
}
