import { lifeDb } from '../life/db.js';

/**
 * In-memory mirror of Body's entries, same style as the other sections'
 * stores. `entries` is chronological (oldest first), which is what every
 * calculation in stats.js expects.
 */
export const state = {
    range: 30,
    entries: [],
};

export async function loadEntries() {
    const entries = await lifeDb.getAll('bodyEntries');
    state.entries = entries.sort((a, b) => a.day.localeCompare(b.day));
}

export function entryFor(day) {
    return state.entries.find((entry) => entry.day === day) ?? null;
}

/** Zero or blank means "not recorded", stored as null rather than a fake 0. */
const orNull = (value) => (Number.isFinite(value) && value > 0 ? value : null);

export function saveEntry({ day, weightKg, sleepHours, steps }) {
    return lifeDb.put('bodyEntries', {
        day,
        weightKg: orNull(weightKg),
        sleepHours: orNull(sleepHours),
        steps: orNull(steps === null ? null : Math.round(steps)),
        updatedAt: new Date().toISOString(),
    });
}

export function deleteEntry(day) {
    return lifeDb.delete('bodyEntries', day);
}

export function hasAnyNumber({ weightKg, sleepHours, steps }) {
    return [weightKg, sleepHours, steps].some((value) => orNull(value) !== null);
}
