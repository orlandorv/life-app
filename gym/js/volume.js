import { MUSCLE_GROUPS } from './seed.js';
import { state, findExercise } from './store.js';
import { el } from '../../life/dom.js';
import { cleanGoal, DEFAULT_GOAL } from './week-streak.js';
import { planScale, scaleTargets, scaleFrequency } from './plan-scale.js';

/**
 * Weekly set volume per muscle group, measured against what the templates
 * actually prescribe. Targets are derived rather than hardcoded so editing a
 * template moves its target with it — there's no second copy of the plan to
 * keep in sync.
 */

/** Monday 00:00 of the week containing `date` — the plan runs Mon–Sun. */
export function weekStart(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // getDay(): 0 = Sunday
    return start;
}

/** Templates that count toward the weekly plan. Undefined counts as in-plan, so templates predating the flag keep working; only an explicit opt-out is excluded. */
const planTemplates = () => state.templates.filter((template) => template.inWeeklyPlan !== false);

/** The sessions a week is aimed at (your weekly goal). Read from the progress ledger, where the goal is kept. */
const weeklySessions = () => cleanGoal(state.progressLedger?.goal ?? DEFAULT_GOAL).target;

/**
 * How much of the plan a week actually trains: the plans that count toward it,
 * against the sessions you aim for. Five plans for a three-session week is 3/5;
 * a plan no bigger than the week is 1 (see plan-scale.js).
 */
export function planShare() {
    const plans = planTemplates().length;
    return { plans, sessions: weeklySessions(), scale: planScale(plans, weeklySessions()) };
}

/** The plan's sets per muscle group across every plan that counts, before fitting it to the week. */
function plannedSets() {
    const totals = new Map();

    for (const template of planTemplates()) {
        for (const entry of template.exercises || []) {
            const muscle = findExercise(entry.exerciseId)?.muscleGroup;
            if (!muscle) continue;
            totals.set(muscle, (totals.get(muscle) || 0) + entry.sets);
        }
    }

    return totals;
}

/**
 * This week's target working sets per muscle group: the plan's sets, scaled to the
 * sessions you aim to train (so five plans in a three-session week don't ask for
 * five sessions' worth).
 */
export function weeklyTargets() {
    return scaleTargets(plannedSets(), planShare().scale);
}

/**
 * The plan as quests read it: planned sets per muscle (`targets`) and how many of
 * a week's sessions train each muscle (`frequency`), both fitted to the week. A muscle trained in
 * only one session a week (a push/pull/legs split) can't be asked for twice.
 */
export function weeklyPlan() {
    const frequency = new Map();
    for (const template of planTemplates()) {
        const muscles = new Set((template.exercises || []).map((entry) => findExercise(entry.exerciseId)?.muscleGroup).filter(Boolean));
        muscles.forEach((muscle) => frequency.set(muscle, (frequency.get(muscle) || 0) + 1));
    }
    // A week that trains three of five plans trains a muscle in two of them only 1.2 times.
    return { targets: weeklyTargets(), frequency: scaleFrequency(frequency, planShare().scale) };
}

/**
 * Working sets actually logged since Monday. Muscle group comes off the
 * workout entry's own snapshot rather than the library, so a session still
 * counts correctly for an exercise that's since been deleted or moved to a
 * different group. Only completed workouts are in `state.workouts`, so a
 * session in progress counts once it's finished.
 */
export function weeklyActual() {
    const totals = new Map();
    const since = weekStart().getTime();

    for (const workout of state.workouts) {
        if (new Date(workout.startedAt).getTime() < since) continue;

        for (const entry of workout.entries || []) {
            if (!entry.muscleGroup) continue;
            // Finishing already strips warm-ups; filtering again keeps older
            // and imported workouts honest too.
            const sets = entry.sets.filter((set) => !set.warmup).length;
            if (!sets) continue;
            totals.set(entry.muscleGroup, (totals.get(entry.muscleGroup) || 0) + sets);
        }
    }

    return totals;
}

function volumeRow(muscle, done, target) {
    const tracked = target > 0;
    const met = tracked && done >= target;
    const pct = tracked ? Math.min(100, Math.round((done / target) * 100)) : 100;

    return el('div', { class: 'volume-row' }, [
        el('div', { class: 'volume-row-top' }, [
            el('span', { class: 'volume-muscle' }, [
                el('span', { class: 'muscle-dot', dataset: { muscle } }),
                muscle,
            ]),
            el('span', {
                class: `volume-count${met ? ' met' : ''}${tracked ? '' : ' untracked'}`,
                text: tracked ? `${done} / ${target} sets` : `${done} sets · not in plan`,
            }),
        ]),
        el('div', { class: 'volume-bar' }, [
            el('div', {
                class: `volume-fill${met ? ' met' : ''}${tracked ? '' : ' untracked'}`,
                style: `width: ${pct}%`,
            }),
        ]),
    ]);
}

export function renderVolume(container) {
    const targets = weeklyTargets();
    const actual = weeklyActual();

    // Fixed muscle order everywhere, and only groups that are either
    // programmed or actually trained — an untouched group with no target is
    // just noise.
    const muscles = MUSCLE_GROUPS.filter((muscle) => targets.get(muscle) || actual.get(muscle));

    const start = weekStart();
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const label = (date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const section = el('div', { class: 'volume-section' }, [
        el('div', { class: 'volume-head' }, [
            el('span', { class: 'volume-title', text: 'This week’s volume' }),
            el('span', { class: 'volume-range', text: `${label(start)} – ${label(end)}` }),
        ]),
    ]);

    if (!muscles.length) {
        // "Build a template" is actively misleading when templates exist but
        // are all opted out — say which of the two situations this actually is.
        const excluded = state.templates.filter((template) => template.inWeeklyPlan === false).length;

        section.append(
            el('p', {
                class: 'hint',
                text: excluded
                    ? `No plans are counting toward the weekly plan (${excluded} opted out). Open one from Workout and switch “Counts toward weekly plan” to Yes.`
                    : 'Build a plan — the sets it prescribes become this week’s target.',
            }),
        );
    } else {
        muscles.forEach((muscle) => section.append(volumeRow(muscle, actual.get(muscle) || 0, targets.get(muscle) || 0)));
        const { plans, sessions, scale } = planShare();
        if (scale < 1) {
            section.append(
                el('p', { class: 'hint volume-scaled', text: `Fitted to your ${sessions}-session week: your plans add up to ${plans} sessions, so each muscle's target is ${sessions}/${plans} of what they prescribe.` }),
            );
        }
    }

    container.append(section);
}
