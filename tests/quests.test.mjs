import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQuests, NO_PLAN, QUESTS_PER_WEEK } from '../gym/js/quests.js';

const week = (weekId, extra = {}) => ({ weekId, sessions: 0, target: 3, sets: 0, tonnageKg: 0, prs: 0, muscleSets: new Map(), muscleSessions: new Map(), ...extra });

/** Four past weeks of a five-session routine (the old one): 90 sets, 18 a session. */
const fiveXHistory = Array.from({ length: 4 }, (_, i) => week(`2026-10-${String(5 + i * 7).padStart(2, '0')}`, { sessions: 5, target: 5, sets: 90, tonnageKg: 25000, muscleSets: new Map([['Chest', 20], ['Back', 20], ['Legs', 24]]) }));
const thisWeek = week('2026-11-30');

// A push / pull / legs split: each muscle is trained in one session a week.
const PPL = {
    targets: new Map([['Chest', 12], ['Shoulders', 9], ['Triceps', 9], ['Back', 15], ['Biceps', 9], ['Legs', 18], ['Core', 6]]),
    frequency: new Map([['Chest', 1], ['Shoulders', 1], ['Triceps', 1], ['Back', 1], ['Biceps', 1], ['Legs', 1], ['Core', 1]]),
};

const draw = (weekId, history, plan, extra = {}) => generateQuests(weekId, [...history, { ...thisWeek, weekId, ...extra }], plan);
const allDraws = (history, plan, n = 400) => Array.from({ length: n }, (_, i) => draw(`2027-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}x${i}`, history, plan)).flat();

test('three quests are always drawn, whatever the plan', () => {
    for (const plan of [NO_PLAN, PPL]) {
        for (let i = 0; i < 100; i += 1) assert.equal(draw(`w${i}`, fiveXHistory, plan).length, QUESTS_PER_WEEK);
    }
});

test('a push/pull/legs split is never asked to train a muscle twice in a week', () => {
    const quests = allDraws(fiveXHistory, PPL);
    assert.equal(quests.filter((q) => q.key === 'muscle-sessions').length, 0, 'no "train X twice" quest on a once-each split');
    assert.ok(quests.some((q) => q.key === 'sessions'), 'the other kinds still appear');
});

test('a plan that trains a muscle twice can still ask for it twice, and only for that muscle', () => {
    const upperLower = { targets: PPL.targets, frequency: new Map([['Chest', 2], ['Back', 2], ['Legs', 2], ['Biceps', 1]]) };
    const found = allDraws(fiveXHistory, upperLower).filter((q) => q.key === 'muscle-sessions');
    assert.ok(found.length > 0);
    for (const q of found) {
        assert.equal(q.target, 2);
        assert.ok(['Chest', 'Back', 'Legs'].includes(q.muscle), `only a twice-trained muscle: ${q.muscle}`);
    }
});

test('with no plan to go by, a muscle quest is as before', () => {
    const found = allDraws([], NO_PLAN).filter((q) => q.key === 'muscle-sessions');
    assert.ok(found.length > 0);
    assert.ok(found.every((q) => q.target === 2));
});

test('sets and tonnage scale to this week\'s three sessions, not to five sessions of old history', () => {
    const quests = allDraws(fiveXHistory, PPL);
    const sets = quests.filter((q) => q.key === 'sets');
    const tonnage = quests.filter((q) => q.key === 'tonnage');
    assert.ok(sets.length > 0 && tonnage.length > 0);
    // 18 sets a session × 3 sessions × 1.1 stretch = 59.4 → 60. The old calibration asked for 90 × 1.1 = 99 → 100.
    for (const q of sets) assert.equal(q.target, 60);
    // 5,000 kg a session × 3 × 1.1 = 16,500.
    for (const q of tonnage) assert.equal(q.target, 16500);
});

test('the same history under a five-session target asks for five sessions\' worth', () => {
    const five = allDraws(fiveXHistory, PPL, 200).length;
    assert.ok(five > 0);
    const asked = draw('2027-02-01x', fiveXHistory, PPL, { target: 5 });
    const sets = asked.find((q) => q.key === 'sets');
    if (sets) assert.equal(sets.target, 100, '18 × 5 × 1.1 = 99, to the nearest 5');
});

test('a week with sessions in the history is judged per session, however many there were', () => {
    // Two sessions of 18 sets, and three of 18: same per-session average, same quest for a three-session week.
    const two = [week('2026-10-05', { sessions: 2, target: 3, sets: 36, tonnageKg: 10000 })];
    const three = [week('2026-10-05', { sessions: 3, target: 3, sets: 54, tonnageKg: 15000 })];
    const pick = (history) => draw('2026-11-02x', history, PPL).concat(draw('2026-11-09x', history, PPL)).concat(draw('2026-11-16x', history, PPL));
    const setsOf = (history) => [...new Set(allDraws(history, PPL, 300).filter((q) => q.key === 'sets').map((q) => q.target))];
    assert.deepEqual(setsOf(two), setsOf(three));
    assert.ok(pick(two).length > 0);
});

test('with no history the sets quest is the plan\'s own weekly sets, and a middling 30 with no plan', () => {
    const planned = allDraws([], PPL).filter((q) => q.key === 'sets');
    const total = [...PPL.targets.values()].reduce((a, b) => a + b, 0); // 78
    for (const q of planned) assert.equal(q.target, Math.round((total * 1.1) / 5) * 5);
    for (const q of allDraws([], NO_PLAN).filter((q) => q.key === 'sets')) assert.equal(q.target, 35, '30 × 1.1 = 33, to the nearest 5');
});

test('the sessions quest is this week\'s target', () => {
    const q = draw('2027-03-01x', [], PPL, { target: 3 }).concat(draw('2027-03-08x', [], PPL, { target: 3 }), draw('2027-03-15x', [], PPL, { target: 3 }), draw('2027-03-22x', [], PPL, { target: 3 }));
    const sessions = allDraws([], PPL, 300).filter((x) => x.key === 'sessions');
    assert.ok(sessions.length > 0);
    assert.ok(sessions.every((x) => x.target === 3));
    assert.ok(q.length > 0);
});

test('every quest has a positive whole target, and the draw is the same every time for a week', () => {
    for (let i = 0; i < 200; i += 1) {
        const id = `2027-05-${String(1 + (i % 28)).padStart(2, '0')}x${i}`;
        const a = draw(id, fiveXHistory, PPL);
        const b = draw(id, fiveXHistory, PPL);
        assert.deepEqual(a, b, 'deterministic');
        for (const q of a) assert.ok(Number.isInteger(q.target) && q.target > 0, JSON.stringify(q));
    }
});
