import { database } from './db.js';
import { DEFAULT_EXERCISES } from './seed.js';
import { setUnit } from './units.js';
import { loadBarWeights } from './plates.js';

// Shared in-memory cache. Every view reads from here rather than hitting
// IndexedDB on each render — the library re-renders on every keystroke.
export const state = {
    exercises: [],
    templates: [],
    workouts: [],
    checkins: [],
    activeWorkout: null,
    progressLedger: null,
};

const listeners = new Map();

export function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
}

export function emit(event, payload) {
    listeners.get(event)?.forEach((handler) => handler(payload));
}

export async function loadExercises() {
    state.exercises = (await database.getExercises()).sort((a, b) => a.name.localeCompare(b.name));
    emit('exercises');
    return state.exercises;
}

export async function loadTemplates() {
    state.templates = (await database.getTemplates()).sort((a, b) => a.name.localeCompare(b.name));
    emit('templates');
    return state.templates;
}

export async function loadWorkouts() {
    const all = await database.getWorkouts();
    state.workouts = all
        .filter((w) => w.status === 'completed')
        .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    state.activeWorkout = all.find((w) => w.status === 'active') || null;
    emit('workouts');
    return state.workouts;
}

export async function loadCheckins() {
    state.checkins = await database.getCheckins();
    emit('checkins');
    return state.checkins;
}

/**
 * The one piece of progress state that isn't derived: what's already been
 * celebrated, plus each week's sealed session target and drawn quests. Kept
 * as a single row in `settings` rather than its own store, so it needs no
 * schema version bump and rides along in the existing backup export for free.
 */
const EMPTY_LEDGER = { version: 1, seenBadges: [], seenLevel: 0, weekTargets: {}, quests: {} };

export async function loadProgressLedger() {
    const stored = await database.getSetting('progress', null);
    state.progressLedger = { ...EMPTY_LEDGER, ...(stored || {}) };
    emit('progress');
    return state.progressLedger;
}

/** Shallow-merges a patch into the ledger and writes it back. */
export async function saveProgressLedger(patch) {
    state.progressLedger = { ...(state.progressLedger || EMPTY_LEDGER), ...patch };
    await database.setSetting('progress', state.progressLedger);
    emit('progress');
    return state.progressLedger;
}

export function findExercise(id) {
    return state.exercises.find((exercise) => exercise.id === id) || null;
}

/**
 * Most recent completed sets for an exercise, used to show "last time" ghost
 * text while logging. Returns null when there's no history yet.
 */
export function lastPerformance(exerciseId) {
    for (const workout of state.workouts) {
        const entry = workout.entries?.find((e) => e.exerciseId === exerciseId);
        const done = entry?.sets.filter((s) => s.done);
        if (done?.length) {
            return { date: workout.startedAt, sets: done };
        }
    }
    return null;
}

/**
 * The most recent note left on an exercise — a "go up to 75 next time"
 * reminder, surfaced when you're next about to do that movement.
 */
export function lastNote(exerciseId) {
    for (const workout of state.workouts) {
        const entry = workout.entries?.find((e) => e.exerciseId === exerciseId);
        // noteDone means you've already acted on it, so it stops nagging.
        if (entry?.note?.trim() && !entry.noteDone) {
            return { workoutId: workout.id, date: workout.startedAt, note: entry.note.trim() };
        }
    }
    return null;
}

export async function bootstrap() {
    await database.init();
    await database.seedExercises(DEFAULT_EXERCISES);
    await database.pruneStockExercises(new Set(DEFAULT_EXERCISES.map((exercise) => exercise.id)));
    await database.excludeExampleTemplatesOnce();
    setUnit(await database.getSetting('unit', 'kg'));
    await loadBarWeights();
    await Promise.all([loadExercises(), loadTemplates(), loadWorkouts(), loadCheckins(), loadProgressLedger()]);
}
