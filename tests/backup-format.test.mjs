import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    LIFE_FORMAT,
    LIFE_VERSION,
    GYM_FORMAT,
    LIFE_STORES,
    DEVICE_SETTINGS,
    NUDGE_AFTER_DAYS,
    buildBackup,
    inspectBackup,
    summarize,
    needsNudge,
} from '../life/backup-format.js';

// One valid row per store, shaped like what each section's own add/save writes.
const SAMPLE = {
    foods: { id: 'f1', name: 'Oats' },
    nutritionEntries: { id: 'n1', day: '2026-11-01', name: 'Oats' },
    habits: { id: 'h1', name: 'Stretch', days: [0, 2, 4], startDay: '2026-10-01', timeOfDay: 'night' },
    habitLogs: { id: 'h1|2026-11-01', habitId: 'h1', day: '2026-11-01' },
    bodyEntries: { day: '2026-11-01', weightKg: 82, sleepHours: null, steps: 9000 },
    routineTicks: { id: 'h1|2026-11-01', habitId: 'h1', day: '2026-11-01', steps: ['s1'] },
    videos: { id: 'v1', title: 'Form check', url: 'https://example.com/v', watched: false, addedAt: '2026-10-01T10:00:00.000Z' },
    tasks: { id: 't1', title: 'Renew passport', date: '2026-11-10', time: null, done: false, createdAt: '2026-10-01T10:00:00.000Z', calendarSequence: 0 },
    journalEntries: { day: '2026-11-01', mood: 4, energy: null, note: 'Good session' },
    notes: { id: 'i1', text: 'Try a deload #gym', createdAt: '2026-10-01T10:00:00.000Z', pinned: true },
    settings: { key: 'someSetting', value: 1 },
};

const life = (overrides = {}) => ({ ...Object.fromEntries(Object.entries(SAMPLE).map(([k, v]) => [k, [v]])), ...overrides });
const file = (lifeData = life()) => JSON.parse(JSON.stringify(buildBackup({ gym: null, life: lifeData })));

test('every store has a sample row here — add one when a store is added', () => {
    assert.deepEqual(Object.keys(SAMPLE).sort(), Object.keys(LIFE_STORES).sort());
});

test('a full backup survives JSON and is accepted, with every row kept', () => {
    const info = inspectBackup(file());
    assert.equal(info.kind, 'life');
    for (const store of Object.keys(LIFE_STORES)) assert.equal(info.life[store].length, 1, `${store} lost rows`);
});

test('every store rejects a damaged row (so no store is left unchecked)', () => {
    for (const store of Object.keys(LIFE_STORES)) {
        assert.throws(() => inspectBackup(file(life({ [store]: [{}] }))), /damaged/, `${store} accepted an empty row`);
    }
});

test('a store that is not an array is rejected', () => {
    assert.throws(() => inspectBackup(file(life({ habits: 'nope' }))), /damaged/);
});

test('optional fields: absent or valid is fine, an invalid value is not', () => {
    const habit = SAMPLE.habits;
    const { timeOfDay, ...plain } = habit;
    assert.doesNotThrow(() => inspectBackup(file(life({ habits: [plain] }))));
    assert.doesNotThrow(() => inspectBackup(file(life({ habits: [{ ...habit, timeOfDay: 'morning' }] }))));
    assert.throws(() => inspectBackup(file(life({ habits: [{ ...habit, timeOfDay: 'dawn' }] }))), /damaged/);
    assert.throws(() => inspectBackup(file(life({ journalEntries: [{ ...SAMPLE.journalEntries, mood: 9 }] }))), /damaged/);
    assert.throws(() => inspectBackup(file(life({ notes: [{ ...SAMPLE.notes, text: '' }] }))), /damaged/);
});

test('device-only settings never travel on import', () => {
    const rows = [{ key: DEVICE_SETTINGS[0], value: '2020-01-01' }, SAMPLE.settings];
    const info = inspectBackup(file(life({ settings: rows })));
    assert.deepEqual(info.life.settings.map((r) => r.key), [SAMPLE.settings.key]);
});

test('files that are not backups, or are from a newer version, are refused', () => {
    assert.throws(() => inspectBackup(null), /isn’t a Life/);
    assert.throws(() => inspectBackup({ format: 'something-else' }), /isn’t a Life/);
    assert.throws(() => inspectBackup({ ...file(), version: LIFE_VERSION + 1 }), /newer version/);
});

test('a bare Gym backup (from before Life existed) is still accepted', () => {
    const gym = { format: GYM_FORMAT, version: 3, exercises: [{ id: 'x' }], templates: [], workouts: [], settings: [] };
    const info = inspectBackup(gym);
    assert.equal(info.kind, 'gym');
    assert.equal(info.life, null);
});

test('summarize counts what the import preview shows', () => {
    const counts = summarize(inspectBackup(file()));
    assert.equal(counts.habits, 1);
    assert.equal(counts.journalDays, 1);
    assert.equal(counts.notes, 1);
    assert.equal(counts.tasks, 1);
});

test('the backup reminder: needs data, then waits NUDGE_AFTER_DAYS from the last backup', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
    assert.equal(needsNudge({ lastBackupAt: null, hasData: false, now }), false, 'nothing to lose, nothing to say');
    assert.equal(needsNudge({ lastBackupAt: null, hasData: true, now }), true, 'data and never backed up');
    assert.equal(needsNudge({ lastBackupAt: daysAgo(NUDGE_AFTER_DAYS - 1), hasData: true, now }), false);
    assert.equal(needsNudge({ lastBackupAt: daysAgo(NUDGE_AFTER_DAYS), hasData: true, now }), true);
});

test('format constants are the strings the files on disk already use', () => {
    assert.equal(LIFE_FORMAT, 'life-backup');
    assert.equal(GYM_FORMAT, 'gym-tracker-backup');
});
