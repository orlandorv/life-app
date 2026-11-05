/**
 * The Life backup file: what goes in, how it's checked on the way back, and
 * when to nag. Pure — no DOM, no storage — so the rules that decide whether a
 * file is safe to import can be tested on their own.
 *
 * A Life backup wraps the Gym export whole (`gym`, exactly what Gym's own
 * Export writes) alongside every Life store (`life`). Importing also accepts a
 * bare Gym backup, so files made before Life existed still restore.
 */

import { isTimeOfDay } from '../habits/times.js';
import { isValidRepeat } from '../tasks/recurrence.js';
import { isValidSavedMeal } from '../nutrition/saved-meals.js';

export const LIFE_FORMAT = 'life-backup';
export const LIFE_VERSION = 1;
export const GYM_FORMAT = 'gym-tracker-backup';

/** Each Life store and the field that is its key. */
export const LIFE_STORES = {
    foods: 'id',
    nutritionEntries: 'id',
    habits: 'id',
    habitLogs: 'id',
    bodyEntries: 'day',
    routineTicks: 'id',
    videos: 'id',
    tasks: 'id',
    journalEntries: 'day',
    notes: 'id',
    savedMeals: 'id',
    wishlist: 'id',
    books: 'id',
    settings: 'key',
};

/**
 * Settings that describe *this device*, not the data. `lastBackupAt` must
 * never travel: restoring an old backup would otherwise reset it to that
 * backup's date and make a fresh one look stale.
 */
export const DEVICE_SETTINGS = ['lastBackupAt'];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const GYM_STORES = ['exercises', 'templates', 'workouts', 'settings', 'checkins'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.length > 0;
const isNumberOrNull = (value) => value === null || value === undefined || (Number.isFinite(value) && value > 0);
const isWeekdays = (days) => Array.isArray(days) && days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
const isOptionalText = (value) => value === undefined || value === null || typeof value === 'string';
const isBoolean = (value) => typeof value === 'boolean';
const isLevelOrNull = (value) => value === null || value === undefined || (Number.isInteger(value) && value >= 1 && value <= 5);

/** A routine step: an id and text, optionally a detail line and the weekdays it applies. */
const isStep = (step) =>
    isObject(step) &&
    isText(step.id) &&
    isText(step.text) &&
    isOptionalText(step.detail) &&
    (step.days === undefined || isWeekdays(step.days));

export function buildBackup({ gym, life, now = new Date() }) {
    return { format: LIFE_FORMAT, version: LIFE_VERSION, exportedAt: now.toISOString(), gym, life };
}

// --- Checking a file on the way in --------------------------------------------

/** Per-store checks: a row that fails one throws, so nothing half-valid is written. */
const ROW_CHECKS = {
    foods: (row) => isText(row.id) && isText(row.name),
    nutritionEntries: (row) => isText(row.id) && DAY.test(row.day) && isText(row.name),
    habits: (row) =>
        isText(row.id) &&
        isText(row.name) &&
        DAY.test(row.startDay) &&
        isWeekdays(row.days) &&
        (row.weeklyTarget === undefined || (Number.isInteger(row.weeklyTarget) && row.weeklyTarget >= 1 && row.weeklyTarget <= 6)) &&
        isOptionalText(row.note) &&
        (row.timeOfDay === undefined || isTimeOfDay(row.timeOfDay)) &&
        (row.steps === undefined || (Array.isArray(row.steps) && row.steps.every(isStep))),
    habitLogs: (row) => isText(row.id) && isText(row.habitId) && DAY.test(row.day),
    routineTicks: (row) =>
        isText(row.id) && isText(row.habitId) && DAY.test(row.day) && Array.isArray(row.steps) && row.steps.every(isText),
    bodyEntries: (row) =>
        DAY.test(row.day) && isNumberOrNull(row.weightKg) && isNumberOrNull(row.sleepHours) && isNumberOrNull(row.steps),
    videos: (row) =>
        isText(row.id) &&
        isText(row.title) &&
        isText(row.url) &&
        isOptionalText(row.topic) &&
        isOptionalText(row.note) &&
        isBoolean(row.watched) &&
        isText(row.addedAt) &&
        isOptionalText(row.watchedAt),
    tasks: (row) =>
        isText(row.id) &&
        isText(row.title) &&
        DAY.test(row.date) &&
        (row.time === null || row.time === undefined || TIME.test(row.time)) &&
        isOptionalText(row.note) &&
        isBoolean(row.done) &&
        isOptionalText(row.doneAt) &&
        isText(row.createdAt) &&
        (row.calendarSequence === undefined || (Number.isInteger(row.calendarSequence) && row.calendarSequence >= 0)) &&
        (row.repeat === undefined || isValidRepeat(row.repeat)),
    settings: (row) => isText(row.key),
    journalEntries: (row) => DAY.test(row.day) && isLevelOrNull(row.mood) && isLevelOrNull(row.energy) && isOptionalText(row.note) && ['dreams', 'morning', 'afternoon', 'night'].every((id) => isOptionalText(row[id])),
    notes: (row) => isText(row.id) && isText(row.text) && isText(row.createdAt) && isOptionalText(row.updatedAt) && (row.pinned === undefined || isBoolean(row.pinned)),
    savedMeals: isValidSavedMeal,
    books: (row) =>
        isText(row.id) &&
        isText(row.title) &&
        isText(row.addedAt) &&
        isOptionalText(row.author) &&
        isOptionalText(row.topic) &&
        isOptionalText(row.note) &&
        isOptionalText(row.link) &&
        (row.readAt === undefined || isText(row.readAt)),
    wishlist: (row) =>
        isText(row.id) &&
        isText(row.name) &&
        isText(row.createdAt) &&
        (row.price === undefined || (Number.isFinite(row.price) && row.price > 0)) &&
        isOptionalText(row.category) &&
        isOptionalText(row.link) &&
        isOptionalText(row.note) &&
        (row.starred === undefined || isBoolean(row.starred)) &&
        (row.boughtAt === undefined || isText(row.boughtAt)),
};

function checkLife(life) {
    if (!isObject(life)) throw new Error('This backup is missing its Life data.');

    const clean = {};
    for (const store of Object.keys(LIFE_STORES)) {
        const rows = life[store];
        if (rows === undefined) continue;
        if (!Array.isArray(rows)) throw new Error(`This backup’s ${store} data is damaged.`);

        const kept = store === 'settings' ? rows.filter((row) => !DEVICE_SETTINGS.includes(row?.key)) : rows;
        for (const row of kept) {
            if (!isObject(row) || !ROW_CHECKS[store](row)) {
                throw new Error(`This backup has a damaged ${store} entry, so nothing was imported.`);
            }
        }
        clean[store] = kept;
    }
    return clean;
}

function checkGym(gym) {
    if (!isObject(gym) || gym.format !== GYM_FORMAT) throw new Error('This backup’s Gym data is damaged.');

    for (const store of GYM_STORES) {
        const rows = gym[store];
        if (rows === undefined) continue; // older Gym backups have no `checkins`
        if (!Array.isArray(rows) || rows.some((row) => !isObject(row))) {
            throw new Error(`This backup’s Gym ${store} data is damaged.`);
        }
    }
    return gym;
}

/**
 * Validates a parsed file and says what it holds. Throws an Error whose
 * message is safe to show as-is. Returns `{kind, gym, life, exportedAt}` with
 * `gym`/`life` null when the file has no such part.
 */
export function inspectBackup(data) {
    if (!isObject(data)) throw new Error('That isn’t a Life or Gym Tracker backup.');

    if (data.format === GYM_FORMAT) {
        return { kind: 'gym', gym: checkGym(data), life: null, exportedAt: data.exportedAt ?? null };
    }

    if (data.format !== LIFE_FORMAT) throw new Error('That isn’t a Life or Gym Tracker backup.');

    if (!Number.isInteger(data.version) || data.version > LIFE_VERSION) {
        throw new Error('This backup was made by a newer version of Life. Update the app, then try again.');
    }

    return {
        kind: 'life',
        gym: data.gym === undefined || data.gym === null ? null : checkGym(data.gym),
        life: checkLife(data.life),
        exportedAt: data.exportedAt ?? null,
    };
}

/** Counts for the confirmation message, zero-valued ones left out by the caller. */
export function summarize(info) {
    const count = (rows) => rows?.length ?? 0;
    return {
        workouts: count(info.gym?.workouts),
        exercises: count(info.gym?.exercises),
        templates: count(info.gym?.templates),
        foodEntries: count(info.life?.nutritionEntries),
        habits: count(info.life?.habits),
        bodyDays: count(info.life?.bodyEntries),
        videos: count(info.life?.videos),
        tasks: count(info.life?.tasks),
        journalDays: count(info.life?.journalEntries),
        notes: count(info.life?.notes),
        savedMeals: count(info.life?.savedMeals),
        wishlist: count(info.life?.wishlist),
        books: count(info.life?.books),
    };
}

// --- When to nudge ---------------------------------------------------------------

export const NUDGE_AFTER_DAYS = 7;

/** Whole days since `lastBackupAt`, or null if there has never been one. */
export function backupAgeDays(lastBackupAt, now = new Date()) {
    if (!lastBackupAt) return null;
    const then = new Date(lastBackupAt);
    if (Number.isNaN(then.getTime())) return null;
    return Math.max(0, Math.floor((now - then) / 86400000));
}

export function describeAge(lastBackupAt, now = new Date()) {
    const days = backupAgeDays(lastBackupAt, now);
    if (days === null) return 'Never';
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
}

/** Nag only when there's something to lose, and it's been a while (or never). */
export function needsNudge({ lastBackupAt, hasData, now = new Date() }) {
    if (!hasData) return false;
    const days = backupAgeDays(lastBackupAt, now);
    return days === null || days >= NUDGE_AFTER_DAYS;
}
