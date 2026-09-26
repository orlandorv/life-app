import { state } from './store.js';
import { $, el, clear, toast, openModal } from '../../life/dom.js';
import { weekStart } from './volume.js';
import { toDisplay, getUnit } from './units.js';
import { playLevelUp, playBadgeEarned } from './sfx.js';
import { evaluateBadges, groupBadges } from './badges.js';
import { questsForWeek, QUEST_XP, SWEEP_XP } from './quests.js';
import { computeProgress, localDayId, weekIdOf, markProgressSeen } from './progress.js';

/**
 * The Progress tab, plus the sheet that fires when a workout earns something.
 * All display — every number here comes from `computeProgress()`.
 */

/** Weeks of history in the day grid: three months reads at phone width. */
const HEATMAP_WEEKS = 12;

/** Working sets in a day at which the square steps up a shade. */
const HEAT_HEAVY = 20;
const HEAT_SOLID = 12;

function bigWeight(kg) {
    return `${Math.round(toDisplay(kg)).toLocaleString()} ${getUnit()}`;
}

function shortDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function bar(percent, className = '') {
    return el('div', { class: 'volume-bar' }, [
        el('div', { class: `volume-fill${className ? ` ${className}` : ''}`, style: `width: ${Math.max(0, Math.min(100, percent))}%` }),
    ]);
}

// --- Level ---------------------------------------------------------------

function levelCard(progress) {
    const remaining = progress.span - progress.into;

    return el('div', { class: 'level-card' }, [
        el('div', { class: 'level-head' }, [
            el('div', {}, [
                el('div', { class: 'level-rank', text: progress.rank }),
                el('div', { class: 'level-number', text: `Level ${progress.level}` }),
            ]),
            el('div', { class: 'level-total' }, [
                el('div', { class: 'level-total-value', text: progress.xpTotal.toLocaleString() }),
                el('div', { class: 'level-total-label', text: 'total XP' }),
            ]),
        ]),
        bar((progress.into / progress.span) * 100),
        el('div', { class: 'level-foot' }, [
            el('span', { text: `${progress.into} / ${progress.span} XP` }),
            el('span', { text: `${remaining} to level ${progress.level + 1}` }),
        ]),
    ]);
}

// --- Streak --------------------------------------------------------------

function streakCard(progress) {
    const week = progress.currentWeek;
    const done = week?.sessions || 0;
    const target = week?.target || 0;

    const note = week?.clean
        ? 'This week is in the bag.'
        : `${Math.max(0, target - done)} more session${target - done === 1 ? '' : 's'} to keep the chain.`;

    return el('div', { class: 'volume-section streak-card' }, [
        el('div', { class: 'volume-head' }, [
            el('span', { class: 'volume-title', text: 'Streak' }),
            el('span', {
                class: 'volume-range',
                // Freezes are only worth mentioning when you hold one — the
                // point is reassurance, not another counter to manage.
                text: progress.freezes ? `${progress.freezes} skip${progress.freezes > 1 ? 's' : ''} banked ❄️` : `Best: ${progress.longestStreak}`,
            }),
        ]),
        el('div', { class: 'streak-figure' }, [
            el('span', { class: 'streak-value', text: String(progress.streak) }),
            el('span', { class: 'streak-unit', text: progress.streak === 1 ? 'week' : 'weeks' }),
            el('span', { class: 'streak-flame', text: progress.streak > 0 ? '🔥' : '' }),
        ]),
        el('div', { class: 'volume-row-top' }, [
            el('span', { class: 'volume-muscle', text: 'This week' }),
            el('span', { class: `volume-count${week?.clean ? ' met' : ''}`, text: `${done} / ${target} sessions` }),
        ]),
        bar(target ? (done / target) * 100 : 0, week?.clean ? 'met' : ''),
        el('p', { class: 'hint', text: note }),
    ]);
}

// --- Quests --------------------------------------------------------------

function questLabel(quest) {
    switch (quest.key) {
        case 'sessions':
            return `Log ${quest.target} sessions`;
        case 'records':
            return 'Beat a personal record';
        case 'muscle-sessions':
            return `Train ${quest.muscle} ${quest.target}×`;
        case 'muscle-sets':
            return `${quest.target} sets of ${quest.muscle}`;
        case 'sets':
            return `Log ${quest.target} working sets`;
        case 'tonnage':
            return `Lift ${bigWeight(quest.target)} in total`;
        case 'breadth':
            return `Train ${quest.target} muscle groups`;
        default:
            return 'Weekly goal';
    }
}

function questProgress(quest) {
    // Clamped once cleared: "3 / 1" reads like a bug rather than an overshoot.
    const shown = Math.min(quest.progress, quest.target);
    if (quest.key === 'tonnage') return `${bigWeight(shown)} / ${bigWeight(quest.target)}`;
    return `${Math.round(shown)} / ${quest.target}`;
}

function questRow(quest) {
    return el('div', { class: `quest-row${quest.done ? ' done' : ''}` }, [
        el('div', { class: 'quest-row-top' }, [
            el('span', { class: 'quest-label' }, [
                el('span', { class: 'quest-tick', text: quest.done ? '✓' : '○' }),
                questLabel(quest),
            ]),
            el('span', { class: `volume-count${quest.done ? ' met' : ''}`, text: questProgress(quest) }),
        ]),
        bar((quest.progress / quest.target) * 100, quest.done ? 'met' : ''),
    ]);
}

function questCard(quests) {
    const done = quests.filter((quest) => quest.done).length;

    const section = el('div', { class: 'volume-section' }, [
        el('div', { class: 'volume-head' }, [
            el('span', { class: 'volume-title', text: 'This week’s quests' }),
            el('span', { class: 'volume-range', text: `${done} / ${quests.length} done` }),
        ]),
    ]);

    quests.forEach((quest) => section.append(questRow(quest)));
    section.append(
        el('p', {
            class: 'hint',
            text:
                done === quests.length
                    ? `All three cleared — ${quests.length * QUEST_XP + SWEEP_XP} XP banked.`
                    : `${QUEST_XP} XP each, plus ${SWEEP_XP} for clearing all three.`,
        }),
    );

    return section;
}

// --- Lifetime tiles ------------------------------------------------------

function statTiles(progress) {
    const tiles = [
        ['Workouts', progress.lifetime.workouts.toLocaleString()],
        ['Sets', progress.lifetime.sets.toLocaleString()],
        ['Records', String(progress.prEvents.all.length)],
    ];

    return el('div', { class: 'summary-row' }, tiles.map(([label, value]) =>
        el('div', { class: 'summary-tile' }, [
            el('div', { class: 'summary-value', text: value }),
            el('div', { class: 'summary-label', text: label }),
        ]),
    ));
}

// --- Day grid ------------------------------------------------------------

function heatLevel(day) {
    if (!day?.sets) return 0;
    if (day.sets >= HEAT_HEAVY) return 3;
    if (day.sets >= HEAT_SOLID) return 2;
    return 1;
}

function heatmap(progress) {
    const start = weekStart();
    start.setDate(start.getDate() - 7 * (HEATMAP_WEEKS - 1));

    const todayId = localDayId(new Date().toISOString());
    const grid = el('div', { class: 'heatmap' });

    for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
        for (let weekday = 0; weekday < 7; weekday += 1) {
            const date = new Date(start);
            date.setDate(start.getDate() + week * 7 + weekday);

            const dayId = localDayId(date.toISOString());
            const day = progress.dayCounts.get(dayId);

            grid.append(
                el('div', {
                    class: `heat-cell${dayId > todayId ? ' future' : ''}`,
                    dataset: { level: String(heatLevel(day)) },
                    title: day ? `${dayId}: ${day.sets} sets` : dayId,
                }),
            );
        }
    }

    const label = (date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return el('div', { class: 'volume-section' }, [
        el('div', { class: 'volume-head' }, [
            el('span', { class: 'volume-title', text: 'Last 12 weeks' }),
            el('span', { class: 'volume-range', text: `${label(start)} – ${label(new Date())}` }),
        ]),
        grid,
    ]);
}

// --- Badges --------------------------------------------------------------

function badgeTile(badge, unseen) {
    return el('button', {
        class: `badge-tile${badge.earnedAt ? '' : ' locked'}${unseen ? ' unseen' : ''}`,
        type: 'button',
        dataset: { badge: badge.id },
    }, [
        el('span', { class: 'badge-icon', text: badge.icon }),
        el('span', { class: 'badge-name', text: badge.name }),
        el('span', { class: 'badge-sub', text: badge.earnedAt ? shortDate(badge.earnedAt) : 'Locked' }),
    ]);
}

function badgeSections(badges, seen) {
    const seenIds = new Set(seen);
    const earned = badges.filter((badge) => badge.earnedAt).length;

    const wrap = el('div', {}, [
        el('div', { class: 'records-group-label', text: `Badges · ${earned} of ${badges.length}` }),
    ]);

    groupBadges(badges).forEach((group, name) => {
        // Earned first inside each group, so the grid reads as "what you have"
        // then "what's next" rather than a checkerboard.
        const ordered = [...group].sort((a, b) => Number(Boolean(b.earnedAt)) - Number(Boolean(a.earnedAt)));

        wrap.append(
            el('div', { class: 'badge-group-label', text: name }),
            el('div', { class: 'badge-grid' }, ordered.map((badge) =>
                badgeTile(badge, badge.earnedAt && !seenIds.has(badge.id)),
            )),
        );
    });

    return wrap;
}

// --- Tab -----------------------------------------------------------------

let cachedBadges = [];

export function renderRewards() {
    const container = clear($('#rewards-body'));
    const progress = computeProgress();
    const ledger = state.progressLedger || {};

    cachedBadges = evaluateBadges(progress);
    const quests = questsForWeek(weekIdOf(), progress.weeks, ledger);

    container.append(levelCard(progress), statTiles(progress), streakCard(progress));
    if (quests.length) container.append(questCard(quests));
    container.append(heatmap(progress), badgeSections(cachedBadges, ledger.seenBadges || []));

    if (!progress.lifetime.workouts) {
        container.append(
            el('div', { class: 'empty-state' }, [
                el('p', { text: 'Nothing logged yet.' }),
                el('p', { class: 'hint', text: 'Finish a workout and it starts paying out — XP for the work done, more for beating your own numbers.' }),
            ]),
        );
    }
}

export function initRewards() {
    $('#rewards-body').addEventListener('click', (event) => {
        const tile = event.target.closest('[data-badge]');
        if (!tile) return;

        const badge = cachedBadges.find((candidate) => candidate.id === tile.dataset.badge);
        if (!badge) return;

        tile.classList.remove('unseen');
        toast(badge.earnedAt ? `${badge.name} — earned ${shortDate(badge.earnedAt)}` : badge.hint);
    });
}

// --- Post-workout summary ------------------------------------------------

function xpPartLabel(part) {
    switch (part.key) {
        case 'session':
            return 'Session logged';
        case 'sets':
            return `${part.value} working sets`;
        case 'tonnage':
            return `${bigWeight(part.value)} moved`;
        case 'records':
            return `${part.value} personal record${part.value > 1 ? 's' : ''}`;
        case 'progression':
            return `${part.value} exercise${part.value > 1 ? 's' : ''} at target`;
        default:
            return 'Bonus';
    }
}

function xpLine(label, xp, className = '') {
    return el('div', { class: `xp-line${className ? ` ${className}` : ''}` }, [
        el('span', { text: label }),
        el('span', { class: 'xp-line-value', text: `+${xp}` }),
    ]);
}

/**
 * Shown only when the session actually produced something — a level, a badge,
 * a record or a cleared quest. An ordinary workout gets a toast instead, so
 * the sheet keeps meaning "look at this" rather than becoming the thing you
 * dismiss four times a week.
 */
export async function showWorkoutSummary(before, after, workout) {
    const gained = after.xpTotal - before.xpTotal;
    const session = after.sessions.find((candidate) => candidate.workout.id === workout.id);

    const previouslyEarned = new Set(evaluateBadges(before).filter((badge) => badge.earnedAt).map((badge) => badge.id));
    const badges = evaluateBadges(after);
    const fresh = badges.filter((badge) => badge.earnedAt && !previouslyEarned.has(badge.id));

    const levelledUp = after.level > before.level;
    const records = after.prEvents.byWorkout.get(workout.id) || 0;
    // The session that completes the week is worth marking: it's the one that
    // moves the streak, and it carries the weekly bonus that would otherwise
    // show up as an unexplained jump in the XP toast.
    const weekCompleted = Boolean(after.currentWeek?.clean) && !before.currentWeek?.clean;

    const weekId = weekIdOf();
    const ledger = state.progressLedger || {};
    const questsDone = questsForWeek(weekId, after.weeks, ledger).filter((quest) => quest.done);
    const questsWere = questsForWeek(weekId, before.weeks, ledger).filter((quest) => quest.done).length;
    const questsCleared = questsDone.length - questsWere;

    const notable = levelledUp || fresh.length > 0 || records > 0 || questsCleared > 0 || weekCompleted;

    if (!notable) {
        toast(`+${gained} XP · Level ${after.level}`);
        await markProgressSeen(after, badges);
        return;
    }

    const body = clear($('#workout-summary-body'));
    $('#workout-summary-title').textContent = levelledUp
        ? `Level ${after.level}`
        : weekCompleted
          ? 'Week complete'
          : 'Nice work';

    body.append(el('div', { class: 'xp-total', text: `+${gained} XP` }));

    (session?.parts || []).forEach((part) => body.append(xpLine(xpPartLabel(part), part.xp)));

    // The weekly and quest bonuses aren't attributable to this workout's sets,
    // so they're shown as what they are: the rest of the difference.
    const attributed = (session?.parts || []).reduce((sum, part) => sum + part.xp, 0);
    if (gained - attributed > 0) body.append(xpLine('Weekly bonuses', gained - attributed, 'bonus'));

    body.append(
        el('div', { class: 'xp-level' }, [
            el('div', { class: 'xp-level-top' }, [
                el('span', { text: `Level ${after.level} · ${after.rank}` }),
                el('span', { text: `${after.into} / ${after.span} XP` }),
            ]),
            bar((after.into / after.span) * 100),
        ]),
    );

    if (weekCompleted) {
        body.append(el('p', {
            class: 'summary-highlight',
            text: `🔥 Week complete — ${after.streak} week${after.streak > 1 ? 's' : ''} running`,
        }));
    }

    if (records > 0) {
        body.append(el('p', { class: 'summary-highlight', text: `🏆 ${records} new personal record${records > 1 ? 's' : ''}` }));
    }

    if (questsCleared > 0) {
        body.append(el('p', { class: 'summary-highlight', text: `🎯 ${questsCleared} quest${questsCleared > 1 ? 's' : ''} cleared` }));
    }

    if (fresh.length) {
        body.append(
            el('div', { class: 'badge-grid summary-badges' }, fresh.map((badge) =>
                el('div', { class: 'badge-tile' }, [
                    el('span', { class: 'badge-icon', text: badge.icon }),
                    el('span', { class: 'badge-name', text: badge.name }),
                    el('span', { class: 'badge-sub', text: 'New badge' }),
                ]),
            )),
        );
    }

    openModal('workout-summary-modal');

    // Held back so it doesn't collide with the workout-finished chord that
    // fires as the sheet opens.
    setTimeout(() => {
        if (levelledUp) playLevelUp();
        else if (fresh.length) playBadgeEarned();
    }, 450);

    await markProgressSeen(after, badges);
}
