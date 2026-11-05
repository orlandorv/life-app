import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PRESETS,
    UNITS,
    isValidRepeat,
    repeatLabel,
    presetOf,
    occurrence,
    nextOccurrence,
    rolledTask,
    rruleFor,
} from '../tasks/recurrence.js';
import { taskToIcs } from '../tasks/ics.js';
import { addDays, daysBetween } from '../life/dates.js';

const rep = (unit, every, anchor) => ({ unit, every, anchor });

// --- Which occurrences there are ----------------------------------------------------

test('days and weeks step by whole days', () => {
    assert.equal(occurrence(rep('day', 1, '2026-11-04'), 0), '2026-11-04');
    assert.equal(occurrence(rep('day', 3, '2026-11-04'), 2), '2026-11-10');
    assert.equal(occurrence(rep('week', 1, '2026-11-04'), 1), '2026-11-11');
    assert.equal(occurrence(rep('week', 2, '2026-11-04'), 3), '2026-12-16');
    // across a clock change, a day is still a day
    assert.equal(occurrence(rep('day', 1, '2026-03-28'), 2), '2026-03-30');
});

test('a month keeps the anchor\'s day where the month has it, and the last day where it does not', () => {
    const m = rep('month', 1, '2026-01-31');
    assert.deepEqual([0, 1, 2, 3, 4].map((k) => occurrence(m, k)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    assert.equal(occurrence(rep('month', 1, '2028-01-31'), 1), '2028-02-29', 'a leap year keeps the 29th');
    assert.equal(occurrence(rep('month', 1, '2026-01-30'), 1), '2026-02-28');
    assert.equal(occurrence(rep('month', 1, '2026-01-30'), 2), '2026-03-30');
});

test('months roll over the year, and every n months works', () => {
    assert.equal(occurrence(rep('month', 1, '2026-11-15'), 2), '2027-01-15');
    assert.equal(occurrence(rep('month', 3, '2026-11-15'), 1), '2027-02-15');
    assert.equal(occurrence(rep('month', 12, '2026-11-15'), 1), '2027-11-15');
});

test('a yearly task born on 29 February lands on 28 Feb in a common year and 29 in a leap year', () => {
    const y = rep('year', 1, '2028-02-29');
    assert.deepEqual([0, 1, 2, 3, 4].map((k) => occurrence(y, k)), ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
});

test('occurrences are worked from the anchor, so a clamped month does not drag the rest down', () => {
    const m = rep('month', 1, '2026-01-31');
    // if each step started from the last one, March would be the 28th
    assert.equal(occurrence(m, 2), '2026-03-31');
    let date = occurrence(m, 0);
    for (let k = 1; k <= 24; k += 1) {
        date = occurrence(m, k);
        assert.ok(['28', '29', '30', '31'].includes(date.slice(8)), `${date} is not at the end of a month`);
    }
});

// --- Ticking one -----------------------------------------------------------------------

const weekly = (date, anchor = date) => ({ date, repeat: rep('week', 1, anchor) });

test('ticked on its due day, it moves on one step', () => {
    assert.equal(nextOccurrence(weekly('2026-11-04'), '2026-11-04'), '2026-11-11');
});

test('ticked early, it still moves on a whole step, not to the day after today', () => {
    assert.equal(nextOccurrence(weekly('2026-11-06'), '2026-11-04'), '2026-11-13');
});

test('ticked late, it skips the occurrences missed instead of leaving them overdue', () => {
    // due 4 Nov, ticked 25 Nov: 11, 18 and 25 Nov are behind it or today, so the next is 2 Dec
    assert.equal(nextOccurrence(weekly('2026-11-04'), '2026-11-25'), '2026-12-02');
    assert.equal(nextOccurrence({ date: '2026-11-04', repeat: rep('day', 1, '2026-11-04') }, '2026-11-20'), '2026-11-21');
});

test('a repeating task rolls with the series, not from where it was ticked', () => {
    // anchor on the 31st, now sitting on 28 Feb: the next is 31 Mar, not 28 Mar
    const task = { date: '2026-02-28', repeat: rep('month', 1, '2026-01-31') };
    assert.equal(nextOccurrence(task, '2026-02-28'), '2026-03-31');
});

test('ticking returns the task moved to its next date, still not done', () => {
    const rolled = rolledTask({ id: 't', title: 'Bins', date: '2026-11-04', done: true, doneAt: 'x', repeat: rep('week', 1, '2026-11-04') }, '2026-11-04');
    assert.equal(rolled.date, '2026-11-11');
    assert.equal(rolled.done, false);
    assert.equal(rolled.doneAt, null);
    assert.equal(rolled.title, 'Bins');
    assert.deepEqual(rolled.repeat, rep('week', 1, '2026-11-04'));
});

test('however late it is ticked, the next date is in the future and is a real occurrence (fuzz)', () => {
    let state = 1234;
    const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 3000; i += 1) {
        const unit = UNITS[Math.floor(rand() * 4)];
        const every = 1 + Math.floor(rand() * 4);
        const anchor = addDays('2025-01-01', Math.floor(rand() * 800));
        const repeat = rep(unit, every, anchor);
        const k = Math.floor(rand() * 20);
        const date = occurrence(repeat, k);
        const today = addDays(date, Math.floor(rand() * 400) - 40); // from 40 days early to 360 late
        const next = nextOccurrence({ date, repeat }, today);
        assert.ok(next > today, `${JSON.stringify(repeat)} due ${date}, ticked ${today}: ${next} is not after today`);
        assert.ok(next > date, `${next} is not after the due date ${date}`);
        // it is one of the series' own dates...
        let found = false;
        for (let j = 0; j < 4000 && !found; j += 1) {
            const candidate = occurrence(repeat, j);
            if (candidate === next) found = true;
            if (candidate > next) break;
        }
        assert.ok(found, `${next} is not an occurrence of ${JSON.stringify(repeat)}`);
        // ...and the first one after both, so nothing was skipped that shouldn't have been
        const after = date > today ? date : today;
        for (let j = 0; j < 4000; j += 1) {
            const candidate = occurrence(repeat, j);
            if (candidate > after) {
                assert.equal(candidate, next);
                break;
            }
        }
    }
});

// --- Checking and naming ---------------------------------------------------------------

test('a repeat is a known unit, 1 to 99 of them, from a real day', () => {
    assert.equal(isValidRepeat(rep('week', 2, '2026-11-04')), true);
    for (const bad of [
        null,
        undefined,
        'weekly',
        rep('fortnight', 1, '2026-11-04'),
        rep('week', 0, '2026-11-04'),
        rep('week', 100, '2026-11-04'),
        rep('week', 1.5, '2026-11-04'),
        rep('week', '2', '2026-11-04'),
        rep('week', 1, '04/11/2026'),
        rep('week', 1, undefined),
        { unit: 'week', every: 1 },
    ]) assert.equal(isValidRepeat(bad), false, JSON.stringify(bad));
});

test('how a repeat reads', () => {
    assert.equal(repeatLabel({ unit: 'day', every: 1 }), 'Every day');
    assert.equal(repeatLabel({ unit: 'week', every: 1 }), 'Every week');
    assert.equal(repeatLabel({ unit: 'week', every: 2 }), 'Every 2 weeks');
    assert.equal(repeatLabel({ unit: 'month', every: 1 }), 'Every month');
    assert.equal(repeatLabel({ unit: 'day', every: 3 }), 'Every 3 days');
});

test('the sheet\'s presets, and a repeat that isn\'t one of them', () => {
    assert.deepEqual(PRESETS.map((p) => p.label), ['Never', 'Every day', 'Every week', 'Every 2 weeks', 'Every month', 'Every year']);
    assert.equal(presetOf(null).id, 'none');
    assert.equal(presetOf(rep('week', 2, '2026-01-01')).id, 'fortnightly');
    assert.equal(presetOf(rep('day', 3, '2026-01-01')), null, 'an unusual repeat is left as it is');
});

// --- The calendar rule -----------------------------------------------------------------

test('the repeat rules a calendar understands', () => {
    assert.equal(rruleFor(rep('day', 1, '2026-11-04')), 'RRULE:FREQ=DAILY;INTERVAL=1');
    assert.equal(rruleFor(rep('week', 2, '2026-11-04')), 'RRULE:FREQ=WEEKLY;INTERVAL=2');
    assert.equal(rruleFor(rep('month', 1, '2026-11-04')), 'RRULE:FREQ=MONTHLY;INTERVAL=1');
    assert.equal(rruleFor(rep('month', 3, '2026-11-28')), 'RRULE:FREQ=MONTHLY;INTERVAL=3');
    assert.equal(rruleFor(rep('year', 1, '2026-11-04')), 'RRULE:FREQ=YEARLY;INTERVAL=1');
});

test('the 29th to the 31st are "the last of these days that exists", which is the app\'s own clamp', () => {
    assert.equal(rruleFor(rep('month', 1, '2026-01-31')), 'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
    assert.equal(rruleFor(rep('month', 1, '2026-01-30')), 'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30;BYSETPOS=-1');
    assert.equal(rruleFor(rep('month', 1, '2026-01-29')), 'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29;BYSETPOS=-1');
    assert.equal(rruleFor(rep('year', 1, '2028-02-29')), 'RRULE:FREQ=YEARLY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1');
    // a 31st in a month that has one is not special for a yearly task
    assert.equal(rruleFor(rep('year', 1, '2026-12-31')), 'RRULE:FREQ=YEARLY;INTERVAL=1');
});

const NOW = new Date('2026-11-04T12:00:00Z');
const task = (extra = {}) => ({ id: 'abc', title: 'Bins', date: '2026-11-06', time: null, note: '', calendarSequence: 1, ...extra });

test('a repeating task exports as a repeating event, and a plain one is unchanged', () => {
    const repeating = taskToIcs(task({ repeat: rep('week', 1, '2026-11-06') }), NOW).split('\r\n');
    assert.ok(repeating.includes('RRULE:FREQ=WEEKLY;INTERVAL=1'));
    // the rule sits inside the event, after its times
    assert.ok(repeating.indexOf('RRULE:FREQ=WEEKLY;INTERVAL=1') > repeating.findIndex((l) => l.startsWith('DTEND')));
    assert.ok(repeating.indexOf('RRULE:FREQ=WEEKLY;INTERVAL=1') < repeating.indexOf('END:VEVENT'));
    const plain = taskToIcs(task(), NOW);
    assert.ok(!plain.includes('RRULE'));
});

test('the event starts on the task\'s current date, and the rule is one of its own dates', () => {
    // a monthly task on the 31st that has rolled to 28 Feb: the event starts 28 Feb and repeats on the last of 28-31
    const ics = taskToIcs(task({ date: '2026-02-28', repeat: rep('month', 1, '2026-01-31') }), NOW);
    assert.match(ics, /DTSTART;VALUE=DATE:20260228/);
    assert.match(ics, /RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30,31;BYSETPOS=-1/);
    assert.equal(daysBetween('2026-02-28', occurrence(rep('month', 1, '2026-01-31'), 1)), 0);
});
