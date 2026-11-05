import test from 'node:test';
import assert from 'node:assert/strict';
import { isStorageError, createGate, SAVE_FAILED } from '../life/storage-errors.js';

const err = (name, message = '') => Object.assign(new Error(message), { name });

test('a full disk is always a storage error', () => {
    assert.equal(isStorageError(err('QuotaExceededError')), true);
    assert.equal(isStorageError(err('QuotaExceededError', 'anything')), true);
});

test('IndexedDB-flavoured errors count only when they talk about the database', () => {
    assert.equal(isStorageError(err('InvalidStateError', 'The database connection is closing.')), true);
    assert.equal(isStorageError(err('TransactionInactiveError', 'The transaction has finished.')), true);
    assert.equal(isStorageError(err('UnknownError', 'Internal error opening backing store for indexedDB.open.')), true);
    assert.equal(isStorageError(err('VersionError', 'The requested version is less than the existing version.')), false);
});

test('errors that merely share a name with a storage one are left alone', () => {
    assert.equal(isStorageError(err('InvalidStateError', 'The object is in an invalid state.')), false);
    assert.equal(isStorageError(err('AbortError', 'The operation was aborted.')), false);
    assert.equal(isStorageError(err('TypeError', 'Failed to fetch')), false);
});

test('odd rejection reasons never throw', () => {
    for (const reason of [undefined, null, 'a string', 42, {}, { name: 5 }]) {
        assert.equal(isStorageError(reason), false);
    }
});

test('the gate lets one call through per interval', () => {
    let now = 1000;
    const gate = createGate(30000, () => now);
    assert.equal(gate(), true);
    now += 29999;
    assert.equal(gate(), false);
    now += 1;
    assert.equal(gate(), true);
    assert.equal(gate(), false);
});

test('the warning text is set', () => {
    assert.match(SAVE_FAILED, /save/i);
});

test('standAsideForUpgrade closes the connection, lets the owner forget it and announces it', async () => {
    const { standAsideForUpgrade, DB_OUTDATED_EVENT } = await import('../life/storage-errors.js');
    const events = [];
    const original = globalThis.dispatchEvent;
    globalThis.dispatchEvent = (event) => events.push(event.type);
    try {
        let closed = false;
        let forgotten = false;
        const db = { close: () => { closed = true; } };
        standAsideForUpgrade(db, () => { forgotten = true; });
        db.onversionchange();
        assert.equal(closed, true);
        assert.equal(forgotten, true);
        assert.deepEqual(events, [DB_OUTDATED_EVENT]);
    } finally {
        globalThis.dispatchEvent = original;
    }
});
