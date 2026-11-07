import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PRESET_CATEGORIES, canonicalCategory, categoryChoices, groupByCategory, matches, fitWithin, isPhotoData, MAX_PHOTO_CHARS, PHOTO_MAX_EDGE,
    SECTIONS, groupBySection, outfitItems, outfitsWithItem, withoutItem, cleanItemIds, sortOutfits, fromWishlist, isWearable, worth,
} from '../wardrobe/organize.js';

const item = (id, extra = {}) => ({ id, name: id, createdAt: `2026-10-${id.padStart(2, '0')}`, ...extra });

test('the wardrobe has its own usual categories, with the shared rules', () => {
    assert.deepEqual(PRESET_CATEGORIES, ['Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories', 'Fragrances']);
    assert.equal(canonicalCategory(' fragrances '), 'Fragrances');
    assert.equal(canonicalCategory('perfumes'), 'Perfumes', 'a wishlist preset is not a wardrobe one');
    assert.deepEqual(categoryChoices([item('1', { category: 'hats' })]), [...PRESET_CATEGORIES, 'Hats']);
    const groups = groupByCategory([item('1'), item('2', { category: 'shoes' }), item('3', { category: 'Tops' })]);
    assert.deepEqual(groups.map((g) => g.label), ['Tops', 'Shoes', 'Other']);
});

test('search matches every word in the name, brand, colour, category or note, in any case', () => {
    const shirt = item('1', { name: 'Linen shirt', brand: 'Uniqlo', colour: 'Navy', category: 'Tops', note: 'Summer weddings' });
    for (const q of ['', '  ', 'linen', 'NAVY shirt', 'uniqlo tops', 'wedd', 'tops summer']) assert.equal(matches(shirt, q), true, q);
    for (const q of ['denim', 'linen black', 'nike']) assert.equal(matches(shirt, q), false, q);
    assert.equal(matches({ id: 'x', name: 'Bare' }, 'bare'), true, 'an item with nothing but a name');
    assert.equal(matches(shirt, undefined), true);
});

test('a photo is brought down to the longest edge, keeps its shape and is never scaled up', () => {
    assert.deepEqual(fitWithin(4032, 3024), { width: 720, height: 540 });
    assert.deepEqual(fitWithin(3024, 4032), { width: 540, height: 720 });
    assert.deepEqual(fitWithin(500, 400), { width: 500, height: 400 });
    assert.deepEqual(fitWithin(720, 720), { width: 720, height: 720 });
    assert.deepEqual(fitWithin(10000, 1), { width: 720, height: 1 }, 'a hair-thin image still has a pixel');
    assert.deepEqual(fitWithin(0, 100), { width: 0, height: 0 });
    assert.deepEqual(fitWithin(NaN, 100), { width: 0, height: 0 });
    assert.deepEqual(fitWithin(2000, 1000, 100), { width: 100, height: 50 });
    assert.equal(PHOTO_MAX_EDGE, 720);
});

test('stored photo data is an image data URL of a sensible size', () => {
    assert.equal(isPhotoData('data:image/jpeg;base64,/9j/4AAQ'), true);
    assert.equal(isPhotoData('data:image/png;base64,iVBOR'), true);
    for (const bad of ['', null, undefined, 5, 'https://example.com/a.jpg', 'data:text/html;base64,PGh0bWw+', 'javascript:alert(1)']) assert.equal(isPhotoData(bad), false, String(bad));
    assert.equal(isPhotoData(`data:image/jpeg;base64,${'A'.repeat(MAX_PHOTO_CHARS)}`), false, 'too big');
});

test('an outfit lists its items in order and drops ones that no longer exist', () => {
    const items = [item('1'), item('2'), item('3')];
    assert.deepEqual(outfitItems({ itemIds: ['3', 'gone', '1'] }, items).map((i) => i.id), ['3', '1']);
    assert.deepEqual(outfitItems({}, items), []);
});

test('which outfits hold an item, and taking an item out of one', () => {
    const outfits = [{ id: 'a', itemIds: ['1', '2'] }, { id: 'b', itemIds: ['2'] }, { id: 'c', itemIds: [] }];
    assert.deepEqual(outfitsWithItem(outfits, '2').map((o) => o.id), ['a', 'b']);
    assert.deepEqual(outfitsWithItem(outfits, 'nope'), []);
    assert.deepEqual(withoutItem(outfits[0], '1').itemIds, ['2']);
    assert.equal(withoutItem(outfits[2], '1'), outfits[2], 'untouched if it was not in it');
});

test('a chosen list of ids is tidied: no repeats, nothing that isn\'t an item, order kept', () => {
    const items = [item('1'), item('2'), item('3')];
    assert.deepEqual(cleanItemIds(['3', '1', '3', 'x', '2', '1'], items), ['3', '1', '2']);
    assert.deepEqual(cleanItemIds(undefined, items), []);
});

test('outfits sort newest first, then by name', () => {
    const sorted = sortOutfits([{ id: 'a', name: 'B', createdAt: '2026-10-01' }, { id: 'b', name: 'A', createdAt: '2026-10-02' }, { id: 'c', name: 'A', createdAt: '2026-10-01' }]);
    assert.deepEqual(sorted.map((o) => o.id), ['b', 'c', 'a']);
});

test('a bought wishlist item becomes a wardrobe item, with a category where one is clear', () => {
    assert.deepEqual(fromWishlist({ name: 'Sauvage', category: 'Perfumes', price: 95, note: 'EDP' }), { name: 'Sauvage', category: 'Fragrances', price: 95, note: 'EDP' });
    assert.equal(fromWishlist({ name: 'x', category: ' SHOES ' }).category, 'Shoes');
    assert.equal(fromWishlist({ name: 'x', category: 'Accessories' }).category, 'Accessories');
    assert.equal(fromWishlist({ name: 'Linen shirt', category: 'Clothing' }).category, '', 'clothing could be anything: left to choose');
    assert.deepEqual(fromWishlist({ name: 'Plain' }), { name: 'Plain', category: '', price: null, note: '' });
    for (const c of ['Perfumes', 'clothing', 'Shoes', 'ACCESSORIES']) assert.equal(isWearable(c), true, c);
    for (const c of ['Tech', 'Home', '', undefined, 'Books']) assert.equal(isWearable(c), false, String(c));
});

test('what the wardrobe is worth counts only the items with a price, and says how many', () => {
    assert.deepEqual(worth([item('1', { price: 40 }), item('2', { price: 12.5 }), item('3')]), { total: 52.5, priced: 2, count: 3 });
});

test('items are browsed in sections: areas in their order, your own categories inside them', () => {
    const items = [
        item('1', { category: 'Polos' }), item('2', { category: 'Jackets' }), item('3', { category: 'Shirts' }), item('4', { category: 'Joggers' }),
        item('5', { category: 'Caps' }), item('6', { category: 'Cologne' }), item('7', { category: 'Shoes' }), item('8', { category: 'T-Shirts' }),
        item('9', { category: 'jeans' }), item('10', { category: 'Hoodies & Jumpers' }),
    ];
    const sections = groupBySection(items);
    assert.deepEqual(sections.map((s) => s.label), ['Outerwear', 'Tops', 'Bottoms', 'Shoes', 'Accessories', 'Fragrances']);
    assert.deepEqual(sections[1].groups.map((g) => g.label), ['Shirts', 'Polos', 'T-Shirts', 'Hoodies & Jumpers'], 'shirts, polos, tees, then hoodies');
    assert.deepEqual(sections[2].groups.map((g) => g.label), ['Jeans', 'Joggers'], 'case is tidied by the shared rules');
    assert.deepEqual(sections[1].items.map((i) => i.id), ['3', '1', '8', '10'], 'a section lists its items group by group');
    assert.deepEqual(SECTIONS.map((s) => s.label), ['Outerwear', 'Tops', 'Bottoms', 'Shoes', 'Accessories', 'Fragrances']);
});

test('a category of the section\'s own name is the catch-all; one of your own kind gets its own section; none comes last', () => {
    const sections = groupBySection([
        item('1', { category: 'Tops' }), item('2', { category: 'Polos' }), item('3'), item('4', { category: 'Gadgets' }), item('5', { category: 'Outerwear' }), item('6', { category: 'Accessories' }), item('7', { category: 'Caps' }),
    ]);
    assert.deepEqual(sections.map((s) => s.label), ['Outerwear', 'Tops', 'Accessories', 'Gadgets', 'Other']);
    assert.deepEqual(sections[1].groups.map((g) => g.label), ['Polos', 'Other'], '"Tops" beside Polos reads Other');
    assert.deepEqual(sections[2].groups.map((g) => g.label), ['Caps', 'Other']);
    assert.deepEqual(sections[0].groups.map((g) => g.label), ['Outerwear'], 'alone, it keeps its name');
    assert.deepEqual(sections.at(-1).items.map((i) => i.id), ['3']);
    assert.deepEqual(groupBySection([]), []);
});

test('sections lose nothing: every item appears once, in the order it came within its group', () => {
    const items = ['Shirts', 'Polos', 'Shirts', 'Jeans', undefined, 'Shirts'].map((category, i) => item(String(i + 1), category ? { category } : {}));
    const sections = groupBySection(items);
    assert.equal(sections.flatMap((s) => s.items).length, items.length);
    assert.deepEqual(sections.find((s) => s.label === 'Tops').groups[0].items.map((i) => i.id), ['1', '3', '6']);
});
