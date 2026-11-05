import test from 'node:test';
import assert from 'node:assert/strict';
import { hasContent, entryPreview, NOTE_FIELDS } from '../journal/insights.js';

test('text in any part of the day is content on its own', () => {
    for (const { id } of NOTE_FIELDS) {
        assert.equal(hasContent({ day: '2026-11-01', mood: null, energy: null, [id]: 'something' }), true, id);
        assert.equal(hasContent({ day: '2026-11-01', mood: null, energy: null, [id]: '   ' }), false, `${id} blank`);
    }
    assert.equal(hasContent({ day: '2026-11-01', mood: null, energy: null }), false);
});

test('a day list shows the general note, else the first part of the day written about', () => {
    assert.equal(entryPreview({ note: 'Long day', morning: 'Slow start' }), 'Long day');
    assert.equal(entryPreview({ dreams: 'Flying', night: 'Tired' }), 'Dreams: Flying');
    assert.equal(entryPreview({ afternoon: 'Walk' }), 'Afternoon: Walk');
    assert.equal(entryPreview({ mood: 3 }), '');
});

test('the sections are Dreams, Morning, Afternoon, Night, then the general note', () => {
    assert.deepEqual(NOTE_FIELDS.map((f) => f.id), ['dreams', 'morning', 'afternoon', 'night', 'note']);
});
