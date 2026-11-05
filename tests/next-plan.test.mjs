import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPlan } from '../gym/js/next-plan.js';

const at = (day, hour = 18) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, hour, 0).toISOString();
};
const plan = (id, extra = {}) => ({ id, name: id, exercises: [], ...extra });
const done = (templateId, day) => ({ id: `w-${templateId}-${day}`, templateId, startedAt: at(day) });

const TODAY = '2026-11-05'; // Thursday; the week began Monday 2 Nov
const PUSH = plan('push');
const PULL = plan('pull');
const LEGS = plan('legs');
const pick = (templates, workouts, today = TODAY) => nextPlan(templates, workouts, today)?.template.id;

test('no plans means nothing to suggest', () => {
    assert.equal(nextPlan([], [], TODAY), null);
});

test('with nothing done yet, the first plan listed', () => {
    assert.equal(pick([PUSH, PULL, LEGS], []), 'push');
});

test('a plan not done this week comes before one that was', () => {
    assert.equal(pick([PUSH, PULL, LEGS], [done('push', '2026-11-02')]), 'pull');
    assert.equal(pick([PUSH, PULL, LEGS], [done('push', '2026-11-02'), done('pull', '2026-11-03')]), 'legs');
});

test('of the plans still to do, the one done longest ago, and never done is longest ago', () => {
    const workouts = [done('push', '2026-10-20'), done('pull', '2026-10-27'), done('legs', '2026-10-22')];
    assert.equal(pick([PUSH, PULL, LEGS], workouts), 'push');
    // legs has never been done, so it is longer ago than any of them
    assert.equal(pick([PUSH, PULL, LEGS], [done('push', '2026-10-20'), done('pull', '2026-10-27')]), 'legs');
});

test('a plan done earlier this week is not outstanding, but last week is', () => {
    assert.equal(pick([PUSH, PULL], [done('push', '2026-11-02'), done('pull', '2026-11-01')]), 'pull', 'Sunday 1 Nov was last week');
});

test('once every plan has been done this week, a new round starts from the one done longest ago', () => {
    const workouts = [done('pull', '2026-11-02'), done('legs', '2026-11-03'), done('push', '2026-11-04')];
    const result = nextPlan([PUSH, PULL, LEGS], workouts, TODAY);
    assert.equal(result.template.id, 'pull');
    assert.equal(result.newRound, true);
    assert.equal(nextPlan([PUSH, PULL, LEGS], [done('push', '2026-11-02')], TODAY).newRound, false);
});

test('it says when the plan was last done, or null', () => {
    const result = nextPlan([PUSH, PULL], [done('push', '2026-10-28'), done('push', '2026-10-21'), done('pull', '2026-11-03')], TODAY);
    assert.equal(result.template.id, 'push');
    assert.equal(result.lastDay, '2026-10-28', 'the most recent time, not the first');
    assert.equal(nextPlan([PUSH], [], TODAY).lastDay, null);
});

test('quick workouts and workouts from plans that no longer exist count for nothing', () => {
    const workouts = [{ id: 'q', templateId: null, startedAt: at('2026-11-02') }, done('deleted', '2026-11-03')];
    assert.equal(pick([PUSH, PULL], workouts), 'push');
});

test('a plan outside the weekly plan is only suggested when none is in it', () => {
    assert.equal(pick([plan('mobility', { inWeeklyPlan: false }), PUSH], []), 'push');
    assert.equal(pick([plan('mobility', { inWeeklyPlan: false }), plan('stretch', { inWeeklyPlan: false })], []), 'mobility');
    assert.equal(pick([plan('old')], []), 'old', 'a plan with no flag at all is in the plan');
});

test('the day a workout counts for is its local day, not the UTC one', () => {
    const plans = [PUSH, PULL];
    // Push at 23:00 on Sunday 1 Nov is last week, so with pull done on Monday, push is still outstanding.
    const sunday = nextPlan(plans, [{ id: 'late', templateId: 'push', startedAt: at('2026-11-01', 23) }, done('pull', '2026-11-02')], TODAY);
    assert.equal(sunday.template.id, 'push');
    assert.equal(sunday.newRound, false, 'a Sunday-night session must not count towards the next week');
    // Push at 00:30 on Monday 2 Nov is this week, so both are done and a new round starts.
    const monday = nextPlan(plans, [{ id: 'early', templateId: 'push', startedAt: at('2026-11-02', 0) }, done('pull', '2026-11-02')], TODAY);
    assert.equal(monday.newRound, true);
});

test('ties keep the order the plans are listed in', () => {
    assert.equal(pick([LEGS, PUSH, PULL], []), 'legs');
    assert.equal(pick([PULL, LEGS, PUSH], [done('pull', '2026-10-27'), done('legs', '2026-10-27'), done('push', '2026-10-27')]), 'pull');
});
