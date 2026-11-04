import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDayId, addDays, dayLabel, weekdayIndex, weekStartId, daysBetween } from '../life/dates.js';

// All dates are built in LOCAL time, so these hold in any timezone. CI-style
// check: run with TZ=Pacific/Kiritimati, America/Los_Angeles and Europe/London.

test('localDayId is the local calendar day, not the UTC one', () => {
    assert.equal(localDayId(new Date(2026, 0, 31, 23, 30)), '2026-01-31');
    assert.equal(localDayId(new Date(2026, 0, 1, 0, 15)), '2026-01-01');
});

test('addDays crosses months, years and leap days', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2027-02-28', 1), '2027-03-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2026-11-04', 0), '2026-11-04');
});

test('addDays and daysBetween are not thrown by clock changes', () => {
    // UK clocks go forward on 29 Mar 2026 and back on 25 Oct 2026; US on 8 Mar and 1 Nov.
    for (const [start, n] of [['2026-03-28', 2], ['2026-03-07', 3], ['2026-10-24', 2], ['2026-10-31', 3]]) {
        const end = addDays(start, n);
        assert.equal(daysBetween(start, end), n, `${start} + ${n}`);
        assert.equal(addDays(end, -n), start, `${start} + ${n} and back`);
    }
});

test('weekdays run Monday=0 to Sunday=6 and weeks start on Monday', () => {
    assert.equal(weekdayIndex('2026-11-02'), 0); // Monday
    assert.equal(weekdayIndex('2026-11-04'), 2); // Wednesday
    assert.equal(weekdayIndex('2026-11-08'), 6); // Sunday
    assert.equal(weekStartId('2026-11-04'), '2026-11-02');
    assert.equal(weekStartId('2026-11-08'), '2026-11-02');
    assert.equal(weekStartId('2026-11-02'), '2026-11-02');
    assert.equal(weekStartId('2027-01-01'), '2026-12-28'); // across a year end
});

test('daysBetween is signed', () => {
    assert.equal(daysBetween('2026-11-01', '2026-11-04'), 3);
    assert.equal(daysBetween('2026-11-04', '2026-11-01'), -3);
    assert.equal(daysBetween('2026-11-04', '2026-11-04'), 0);
});

test('dayLabel names today and yesterday, and dates the rest', () => {
    assert.equal(dayLabel('2026-11-04', '2026-11-04'), 'Today');
    assert.equal(dayLabel('2026-11-03', '2026-11-04'), 'Yesterday');
    assert.notEqual(dayLabel('2026-11-01', '2026-11-04'), 'Today');
    assert.match(dayLabel('2026-11-01', '2026-11-04'), /1/);
});
