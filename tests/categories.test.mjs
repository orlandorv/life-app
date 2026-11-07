import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCategories } from '../life/categories.js';

const { canonicalCategory, categoriesInUse, categoryChoices, groupByCategory } = makeCategories({ presets: ['Tops', 'Shoes', 'Accessories'], noneLabel: 'Unsorted', max: 12 });
const item = (id, createdAt, category) => ({ id, createdAt, ...(category === undefined ? {} : { category }) });

test('a category takes the preset spelling, else one in use, else what was typed with a capital', () => {
    assert.equal(canonicalCategory('  shoes '), 'Shoes');
    assert.equal(canonicalCategory('books', ['Books']), 'Books');
    assert.equal(canonicalCategory('gift   ideas'), 'Gift ideas');
    assert.equal(canonicalCategory('   '), '');
    assert.equal(canonicalCategory(undefined), '');
    assert.equal(canonicalCategory('x'.repeat(40)).length, 12, 'cut to this section\'s own limit');
});

test('categories in use have one spelling each, the oldest item deciding', () => {
    assert.deepEqual(categoriesInUse([item('b', '2026-10-02', 'DENIM'), item('a', '2026-10-01', 'Denim'), item('c', '2026-10-03', 'denim'), item('d', '2026-10-04')]), ['Denim']);
});

test('the choices are this section\'s presets, then others in use alphabetically', () => {
    assert.deepEqual(categoryChoices([item('a', 'x', 'Zebra'), item('b', 'y', 'apple'), item('c', 'z', 'shoes')]), ['Tops', 'Shoes', 'Accessories', 'Apple', 'Zebra']);
});

test('groups: presets in their order, others alphabetically, none last under this section\'s own label', () => {
    const groups = groupByCategory([item('1', '2026-10-01'), item('2', '2026-10-02', 'Zebra'), item('3', '2026-10-03', 'accessories'), item('4', '2026-10-04', 'Tops'), item('5', '2026-10-05', 'Apple'), item('6', '2026-10-06', 'TOPS')]);
    assert.deepEqual(groups.map((g) => g.label), ['Tops', 'Accessories', 'Apple', 'Zebra', 'Unsorted']);
    assert.deepEqual(groups[0].items.map((i) => i.id), ['4', '6'], 'items keep their order');
    assert.deepEqual(groupByCategory([]), []);
});

test('two sections do not share presets', () => {
    const other = makeCategories({ presets: ['Perfumes'], noneLabel: 'Other' });
    assert.equal(other.canonicalCategory('shoes'), 'Shoes', 'a capital, but not a preset here');
    assert.deepEqual(other.categoryChoices([]), ['Perfumes']);
    assert.equal(other.groupByCategory([item('a', 'x')])[0].label, 'Other');
});
