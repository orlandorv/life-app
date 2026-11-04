import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATE_SIZES, DEFAULT_BAR, platesPerSide, roundToLoadable, loadableStep } from '../gym/js/plate-math.js';

const sizes = (result) => result.plates.flatMap(({ size, count }) => Array(count).fill(size));

test('plates per side, largest first', () => {
    assert.deepEqual(sizes(platesPerSide(100, 20, 'kg')), [25, 15]);
    assert.deepEqual(sizes(platesPerSide(102.5, 20, 'kg')), [25, 15, 1.25]);
    assert.deepEqual(sizes(platesPerSide(60, 20, 'kg')), [20]);
    assert.deepEqual(sizes(platesPerSide(225, 45, 'lb')), [45, 45]);
    assert.deepEqual(sizes(platesPerSide(135, 45, 'lb')), [45]);
});

test('exact when the plates can make it, and honest about the rest', () => {
    assert.equal(platesPerSide(100, 20, 'kg').exact, true);
    const short = platesPerSide(61, 20, 'kg');
    assert.equal(short.exact, false);
    assert.equal(short.loaded, 60);
});

test('the bar alone, and lighter than the bar', () => {
    const bar = platesPerSide(20, 20, 'kg');
    assert.deepEqual(bar.plates, []);
    assert.equal(bar.exact, true);
    const light = platesPerSide(15, 20, 'kg');
    assert.equal(light.belowBar, true);
    assert.equal(light.loaded, 20);
});

test('the smallest jump is a pair of the smallest plates', () => {
    assert.equal(loadableStep('kg'), 2.5);
    assert.equal(loadableStep('lb'), 5);
    assert.equal(loadableStep('kg'), 2 * Math.min(...PLATE_SIZES.kg));
});

test('rounding to something the plates can build', () => {
    assert.equal(roundToLoadable(61, 20, 'kg'), 60);
    assert.equal(roundToLoadable(61.3, 20, 'kg'), 62.5);
    assert.equal(roundToLoadable(102.5, 20, 'kg'), 102.5);
    assert.equal(roundToLoadable(137, 45, 'lb'), 135);
    assert.equal(roundToLoadable(138, 45, 'lb'), 140);
});

test('rounding down and up', () => {
    assert.equal(roundToLoadable(61, 20, 'kg', 'down'), 60);
    assert.equal(roundToLoadable(61, 20, 'kg', 'up'), 62.5);
    assert.equal(roundToLoadable(62.5, 20, 'kg', 'down'), 62.5);
    assert.equal(roundToLoadable(62.5, 20, 'kg', 'up'), 62.5);
});

test('never below the bar', () => {
    assert.equal(roundToLoadable(10, 20, 'kg'), 20);
    assert.equal(roundToLoadable(10, 20, 'kg', 'down'), 20);
    assert.equal(roundToLoadable(44, 45, 'lb', 'up'), 45);
});

test('whatever it returns, the plates can build exactly (fuzz)', () => {
    let state = 99;
    const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (const unit of ['kg', 'lb']) {
        for (const bar of [0, DEFAULT_BAR[unit], DEFAULT_BAR[unit] / 2]) {
            const step = loadableStep(unit);
            for (let i = 0; i < 2000; i += 1) {
                const target = bar + rand() * 300;
                const nearest = roundToLoadable(target, bar, unit);
                const down = roundToLoadable(target, bar, unit, 'down');
                const up = roundToLoadable(target, bar, unit, 'up');
                for (const value of [nearest, down, up]) {
                    assert.equal(platesPerSide(value, bar, unit).exact, true, `${unit} bar ${bar}: ${value} (from ${target})`);
                    assert.ok(value >= bar);
                }
                assert.ok(Math.abs(nearest - target) <= step / 2 + 1e-9, `${nearest} is not the nearest to ${target}`);
                assert.ok(down <= target + 1e-9 && target - down < step + 1e-9);
                assert.ok(up >= target - 1e-9 && up - target < step + 1e-9);
            }
        }
    }
});
