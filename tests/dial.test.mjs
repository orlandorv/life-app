import test from 'node:test';
import assert from 'node:assert/strict';
import { polar, arcPath, segments, hourAngle, daypart, dayLine } from '../life/dial.js';

const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

test('angles run clockwise from the top', () => {
    const [x0, y0] = polar(100, 100, 50, 0);
    close(x0, 100, 'top x'); close(y0, 50, 'top y');
    const [x90, y90] = polar(100, 100, 50, 90);
    close(x90, 150, 'right x'); close(y90, 100, 'right y');
    const [x180, y180] = polar(100, 100, 50, 180);
    close(x180, 100, 'bottom x'); close(y180, 150, 'bottom y');
});

test('the rim is a 24-hour clock with noon at the top and midnight at the bottom', () => {
    assert.equal(hourAngle(12), 0);
    assert.equal(hourAngle(0), 180);
    assert.equal(hourAngle(24), 180);
    assert.equal(hourAngle(6), 270, 'morning climbs the left side');
    assert.equal(hourAngle(18), 90, 'evening sets down the right');
    assert.equal(hourAngle(15), 45);
});

test('an arc uses the large-arc flag only past half a turn, and a full turn never collapses', () => {
    assert.match(arcPath(50, 50, 40, 0, 90), / 0 0 1 /);
    assert.match(arcPath(50, 50, 40, 0, 270), / 0 1 1 /);
    const full = arcPath(50, 50, 40, 0, 360);
    const [, mx, my] = full.match(/^M([\d.]+) ([\d.]+)/);
    const [, ex, ey] = full.match(/ ([\d.]+) ([\d.]+)$/);
    assert.ok(mx !== ex || my !== ey, 'start and end points differ, so the arc draws');
});

test('a ring is shared in proportion, with a gap between each part', () => {
    const parts = segments([40, 25, 20, 15], { gap: 8 });
    assert.equal(parts.length, 4);
    close(parts[0].from, 4, 'first starts half a gap in');
    close(parts[0].to, 144 - 4, 'habits: 40% of the ring, minus half a gap');
    close(parts[1].from, 144 + 4, 'next starts after the gap');
    close(parts[3].to, 360 - 4, 'last stops half a gap before the top');
    const drawn = parts.reduce((sum, p) => sum + (p.to - p.from), 0);
    close(drawn, 360 - 4 * 8, 'what is drawn is the ring minus the gaps');
    for (let i = 0; i < 3; i += 1) close(parts[i + 1].from - parts[i].to, 8, `gap ${i}`);
});

test('one part is the whole ring; no parts or no weight is nothing', () => {
    assert.deepEqual(segments([15]), [{ from: 0, to: 360 }]);
    assert.deepEqual(segments([]), []);
    assert.deepEqual(segments([0, 0]), []);
    const shifted = segments([1, 1], { gap: 0, start: 90 });
    assert.deepEqual(shifted, [{ from: 90, to: 270 }, { from: 270, to: 450 }]);
});

test('the parts of the day change at 5, 12, 17 and 21', () => {
    const at = (h) => daypart(h);
    assert.equal(at(4.99), 'night');
    assert.equal(at(5), 'morning');
    assert.equal(at(11.99), 'morning');
    assert.equal(at(12), 'afternoon');
    assert.equal(at(16.99), 'afternoon');
    assert.equal(at(17), 'evening');
    assert.equal(at(20.99), 'evening');
    assert.equal(at(21), 'night');
    assert.equal(at(0), 'night');
});

test('the line under the greeting encourages and never scolds', () => {
    const day = (base, extra = {}) => ({ applies: true, base, good: base >= 70, ...extra });
    assert.equal(dayLine('morning', day(0)), 'A fresh day. Start anywhere.');
    assert.equal(dayLine('evening', day(0)), 'Still time for one thing.');
    assert.equal(dayLine('night', day(0)), 'Rest well. Tomorrow is a fresh ring.');
    assert.equal(dayLine('afternoon', day(40)), 'On your way. Keep going.');
    assert.equal(dayLine('afternoon', day(85)), 'A good day, sealed.');
    assert.equal(dayLine('night', day(100)), 'Every ring closed. A full day.');
    assert.equal(dayLine('morning', { applies: false, base: null, good: false }), 'Nothing is due today. Enjoy it.');
    assert.equal(dayLine('morning', null), 'A fresh day.');
    const all = ['morning', 'afternoon', 'evening', 'night'].flatMap((p) => [0, 20, 69, 70, 100].map((b) => dayLine(p, day(b))));
    for (const line of all) assert.doesNotMatch(line, /miss|fail|behind|only|didn/i, `no scolding: ${line}`);
});
