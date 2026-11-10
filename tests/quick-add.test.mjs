import test from 'node:test';
import assert from 'node:assert/strict';
import { QUICK_ADD_ACTIONS, quickAddAction } from '../life/quick-add-options.js';

test('Quick Add offers the common captures once, in a useful order', () => {
    assert.deepEqual(QUICK_ADD_ACTIONS.map((action) => action.id), ['food', 'task', 'note', 'journal', 'habit', 'body', 'wishlist', 'wardrobe']);
    assert.equal(new Set(QUICK_ADD_ACTIONS.map((action) => action.id)).size, QUICK_ADD_ACTIONS.length);
    assert.equal(new Set(QUICK_ADD_ACTIONS.map((action) => action.route)).size, QUICK_ADD_ACTIONS.length);
});

test('every Quick Add choice is complete and routes through the Life shell', () => {
    for (const action of QUICK_ADD_ACTIONS) {
        for (const field of ['id', 'label', 'detail', 'icon', 'section', 'route']) assert.equal(typeof action[field], 'string', `${action.id}.${field}`);
        assert.match(action.route, /^#\/[a-z]+(?:\/[a-z]+)?$/);
        assert.ok(!/[\p{Extended_Pictographic}]/u.test(`${action.label}${action.detail}`), `${action.id} uses emoji`);
    }
});

test('a Quick Add choice can be found by id, and an unknown one is absent', () => {
    assert.equal(quickAddAction('task')?.route, '#/tasks/add');
    assert.equal(quickAddAction('wardrobe')?.section, 'wardrobe');
    assert.equal(quickAddAction('missing'), null);
});
