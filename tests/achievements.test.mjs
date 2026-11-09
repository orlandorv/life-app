import test from 'node:test';
import assert from 'node:assert/strict';
import { LADDERS, ladderAt, achievements, amountLabel } from '../life/achievements.js';

const streak = LADDERS.find((ladder) => ladder.id === 'streak'); // 3, 7, 14, 30, 60, 100

test('every ladder is a rising list of steps, with a unique id', () => {
    assert.equal(new Set(LADDERS.map((l) => l.id)).size, LADDERS.length);
    for (const ladder of LADDERS) {
        assert.ok(ladder.steps.length >= 3, ladder.id);
        assert.ok(ladder.steps.every((at, i) => Number.isInteger(at) && at > 0 && (i === 0 || at > ladder.steps[i - 1])), `${ladder.id} rises`);
        assert.equal(ladderAt(ladder, ladder.read({})).value, 0, `${ladder.id} counts as zero from nothing`);
    }
});

test('a step is earned when the number reaches it, exactly', () => {
    const at = (value) => ladderAt(streak, value);
    assert.equal(at(0).earned, 0);
    assert.equal(at(2).earned, 0);
    assert.equal(at(3).earned, 1);
    assert.equal(at(13).earned, 2);
    assert.equal(at(14).earned, 3);
    assert.deepEqual(at(7).steps.map((s) => s.earned), [true, true, false, false, false, false]);
    assert.equal(at(7).next, 14);
    assert.equal(at(7).toGo, 7);
});

test('progress runs from the last step reached to the next one', () => {
    assert.equal(ladderAt(streak, 0).fraction, 0);
    assert.equal(ladderAt(streak, 1).fraction, 1 / 3, 'a third of the way to the first step');
    assert.equal(ladderAt(streak, 3).fraction, 0, 'just reached 3: nothing yet towards 7');
    assert.equal(ladderAt(streak, 5).fraction, 0.5, 'half way from 3 to 7');
    assert.equal(ladderAt(streak, 100).fraction, 1);
});

test('at the top of a ladder there is no next step', () => {
    const top = ladderAt(streak, 250);
    assert.equal(top.earned, 6);
    assert.equal(top.next, null);
    assert.equal(top.nextLabel, null);
    assert.equal(top.toGo, 0);
});

test('a missing, negative, fractional or odd value counts sensibly', () => {
    for (const bad of [undefined, null, NaN, -4, 'seven', Infinity]) assert.equal(ladderAt(streak, bad).value, 0, String(bad));
    assert.equal(ladderAt(streak, 7.9).value, 7);
    assert.equal(ladderAt(streak, '7').value, 0, 'a string is not a count');
});

test('amounts read naturally', () => {
    const [days, , level, workouts] = [LADDERS[0], LADDERS[1], LADDERS[2], LADDERS[3]];
    assert.equal(amountLabel(days, 1), '1 day');
    assert.equal(amountLabel(days, 365), '365 days');
    assert.equal(amountLabel(level, 5), 'Level 5');
    assert.equal(amountLabel(workouts, 1), '1 workout');
    assert.equal(amountLabel(workouts, 1000), '1,000 workouts');
    assert.equal(ladderAt(streak, 0).nextLabel, '3 days');
});

test('the page adds ladders and Gym badges into one count, and copes with having nothing', () => {
    const none = achievements(undefined);
    assert.equal(none.earned, 0);
    assert.deepEqual(none.badges, { earned: 0, total: 0 });
    assert.deepEqual(none.ladders.map((l) => l.value), [0, 0, 0, 0]);

    const some = achievements({ goodDays: 8, bestStreak: 3, level: 6, workouts: 12 }, { badgesEarned: 4, badgesTotal: 40 });
    // good days 1,7 (2) + streak 3 (1) + level 2,5 (2) + workouts 1,10 (2) = 7, plus 4 badges
    assert.equal(some.earned, 11);
    assert.deepEqual(some.badges, { earned: 4, total: 40 });
    assert.deepEqual(some.ladders.map((l) => l.id), ['good-days', 'streak', 'level', 'workouts']);
});

test('the badge total is never smaller than the badges earned', () => {
    assert.deepEqual(achievements({}, { badgesEarned: 5, badgesTotal: 2 }).badges, { earned: 5, total: 5 });
});
