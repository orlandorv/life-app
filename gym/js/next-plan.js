import { localDayId, weekStartId } from '../../life/dates.js';

/**
 * Which saved plan to suggest next. Pure (no DOM, no storage), so the choice is
 * checked in Node.
 *
 * The weekly plan is a set of sessions to fit in a Monday-to-Sunday week, so the
 * next one is a plan you haven't done *this week*, and of those the one you did
 * longest ago (a plan you've never done counts as longest ago). Once every plan
 * has been done this week, a new round starts from the one done longest ago.
 * Ties go to the order the plans are listed in. A plan that has opted out of the
 * weekly plan is only suggested when no plan is in it.
 *
 * "Done" means a finished workout started from that plan (`templateId`); a quick
 * workout counts for none.
 */
export function nextPlan(templates, workouts, today) {
    if (!templates.length) return null;

    const inPlan = templates.filter((template) => template.inWeeklyPlan !== false);
    const candidates = inPlan.length ? inPlan : templates;

    // The most recent day each plan was done.
    const lastDone = new Map();
    for (const workout of workouts) {
        if (!workout.templateId) continue;
        const day = localDayId(new Date(workout.startedAt));
        if (!lastDone.has(workout.templateId) || day > lastDone.get(workout.templateId)) lastDone.set(workout.templateId, day);
    }

    const thisWeek = weekStartId(today);
    const outstanding = candidates.filter((template) => !((lastDone.get(template.id) ?? '') >= thisWeek));
    const pool = outstanding.length ? outstanding : candidates;

    let pick = pool[0];
    for (const template of pool) {
        if ((lastDone.get(template.id) ?? '') < (lastDone.get(pick.id) ?? '')) pick = template;
    }

    return { template: pick, lastDay: lastDone.get(pick.id) ?? null, newRound: outstanding.length === 0 };
}
