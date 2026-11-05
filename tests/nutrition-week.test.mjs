import test from 'node:test';
import assert from 'node:assert/strict';
import { weekDays, weekSummary, chartTop, weekBarsLayout } from '../nutrition/week.js';

const MON = '2026-11-02';
const food = (kcal, proteinG = 0, carbsG = 0, fatG = 0) => ({ kcal, proteinG, carbsG, fatG });
const targets = (extra = {}) => ({ kcal: null, proteinG: null, carbsG: null, fatG: null, ...extra });

test('the week runs Monday to the day given, and never into the future', () => {
    assert.deepEqual(weekDays(MON, '2026-11-08'), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    assert.deepEqual(weekDays(MON, '2026-11-04'), ['2026-11-02', '2026-11-03', '2026-11-04']);
    assert.deepEqual(weekDays(MON, '2026-11-15'), weekDays(MON, '2026-11-08'), 'a past week is whole whatever today is');
    assert.deepEqual(weekDays('2026-11-09', '2026-11-04'), [], 'a week that has not begun has no days');
});

test('averages are over the days that were logged: a gap is not a zero', () => {
    const byDay = new Map([
        ['2026-11-02', [food(1000, 50), food(1000, 50)]], // 2000 kcal, 100 g
        ['2026-11-03', []], // nothing logged
        ['2026-11-04', [food(2400, 160, 250, 80)]],
    ]);
    const w = weekSummary({ days: weekDays(MON, '2026-11-04'), byDay, targets: targets() });
    assert.equal(w.daysLogged, 2);
    assert.equal(w.daysInWeek, 3);
    assert.deepEqual(w.avg, { kcal: 2200, proteinG: 130, carbsG: 125, fatG: 40 });
    assert.deepEqual(w.days.map((d) => d.logged), [true, false, true]);
    assert.equal(w.days[1].kcal, 0, 'an unlogged day carries zeros but is marked unlogged');
});

test('a week with nothing logged has no average, not an average of zero', () => {
    const w = weekSummary({ days: weekDays(MON, '2026-11-08'), byDay: new Map(), targets: targets({ kcal: 2300 }) });
    assert.equal(w.avg, null);
    assert.equal(w.daysLogged, 0);
    assert.equal(w.daysInWeek, 7);
});

test('a target of zero or blank is no target', () => {
    const w = weekSummary({ days: [MON], byDay: new Map([[MON, [food(2000, 100)]]]), targets: { kcal: 0, proteinG: null, carbsG: undefined, fatG: -5 } });
    assert.deepEqual(w.targets, { kcal: null, proteinG: null, carbsG: null, fatG: null });
    assert.equal(w.proteinDaysHit, null);
});

test('days that reached the protein target are counted among the logged ones only', () => {
    const byDay = new Map([
        ['2026-11-02', [food(2000, 160)]], // hit
        ['2026-11-03', [food(2000, 159)]], // just short
        ['2026-11-04', []], // not logged: neither hit nor miss
        ['2026-11-05', [food(2000, 170)]], // hit
    ]);
    const w = weekSummary({ days: weekDays(MON, '2026-11-05'), byDay, targets: targets({ proteinG: 160 }) });
    assert.equal(w.proteinDaysHit, 2);
    assert.equal(w.daysLogged, 3);
});

test('entries from before carbs and fat were tracked count them as zero', () => {
    const w = weekSummary({ days: [MON], byDay: new Map([[MON, [{ kcal: 500, proteinG: 20 }]]]), targets: targets() });
    assert.deepEqual(w.avg, { kcal: 500, proteinG: 20, carbsG: 0, fatG: 0 });
});

// --- Chart ------------------------------------------------------------------------------

const slots = (...values) => values.map((kcal, i) => ({ day: `d${i}`, kcal }));
const size = { width: 360, height: 160 };

test('the scale tops out above the biggest day and the target, on a round number', () => {
    assert.equal(chartTop([1800, 2250, 2100], 2300), 3000, '2300 * 1.12 = 2576 -> 3000');
    assert.equal(chartTop([1800], null), 2500, '1800 * 1.12 = 2016 -> 2500');
    assert.equal(chartTop([], null), 1000, 'never smaller than 1000');
    assert.equal(chartTop([200], 300), 1000);
    assert.ok(chartTop([4000], null) > 4000, 'the biggest bar never touches the top');
});

test('a bar is as tall as its value, from the baseline, and a gap draws nothing', () => {
    const layout = weekBarsLayout(slots(1500, null, 3000, null, null, null, null), null, size);
    const [mon, tue, wed] = layout.bars;
    assert.ok(mon.h > 0 && wed.h > 0);
    assert.equal(tue.h, 0);
    assert.equal(tue.value, null);
    assert.ok(Math.abs(wed.h / mon.h - 2) < 1e-9, 'twice the calories is twice the height');
    assert.ok(Math.abs(mon.y + mon.h - layout.baseline) < 1e-9, 'bars stand on the baseline');
    assert.ok(wed.y > 0, 'the tallest bar is inside the chart');
});

test('seven columns, left to right in order, none overlapping, all inside the frame', () => {
    const layout = weekBarsLayout(slots(1, 2, 3, 4, 5, 6, 7).map((s) => ({ ...s, kcal: s.kcal * 300 })), 2000, size);
    assert.equal(layout.bars.length, 7);
    for (let i = 1; i < 7; i += 1) assert.ok(layout.bars[i].x >= layout.bars[i - 1].x + layout.bars[i - 1].w, `column ${i} overlaps`);
    assert.ok(layout.bars[0].x >= 0);
    assert.ok(layout.bars[6].x + layout.bars[6].w <= size.width);
});

test('the target line sits at the target\'s height, or is absent', () => {
    const withTarget = weekBarsLayout(slots(1000, 2000, null, null, null, null, null), 2000, size);
    const second = withTarget.bars[1];
    assert.ok(Math.abs(withTarget.targetY - second.y) < 1e-9, 'a bar exactly at target reaches the line');
    assert.equal(weekBarsLayout(slots(1000, null, null, null, null, null, null), null, size).targetY, null);
    // a target above every bar still fits on the chart
    assert.ok(weekBarsLayout(slots(500, null, null, null, null, null, null), 3000, size).targetY >= 0);
});

test('a week with nothing logged still lays out (the target line, no bars)', () => {
    const layout = weekBarsLayout(slots(null, null, null, null, null, null, null), 2300, size);
    assert.ok(layout.bars.every((b) => b.h === 0));
    assert.ok(Number.isFinite(layout.targetY));
});
