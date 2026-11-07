import test from 'node:test';
import assert from 'node:assert/strict';
import { areaUnder } from '../life/svg.js';

test('the area under a line closes straight down to the base and back', () => {
    assert.equal(areaUnder('M0 50 L10 40 L20 45', 100), 'M0 50 L10 40 L20 45 L20 100 L0 100 Z');
    assert.equal(areaUnder('M2.5 30.1 L40.2 12.7', 80), 'M2.5 30.1 L40.2 12.7 L40.2 80 L2.5 80 Z');
});

test('a path with fewer than two points has no area', () => {
    assert.equal(areaUnder('M0 50', 100), null);
    assert.equal(areaUnder('', 100), null);
    assert.equal(areaUnder(null, 100), null);
});
