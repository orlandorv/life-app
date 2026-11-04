/**
 * Telling a failed save from every other kind of error. Pure (no DOM, no
 * storage), so the rules can be checked in Node.
 *
 * A write to IndexedDB can fail for reasons the user can do something about
 * (the phone is low on space) or at least should hear about (iOS closed the
 * connection while the app was in the background). Left alone the app carried
 * on as if it had saved, which is the worst outcome for a tracker. But a toast
 * for *every* error would just be noise, and some "InvalidStateError"s have
 * nothing to do with storage, so only errors that look like storage ones count.
 */

export const SAVE_FAILED = 'Couldn’t save that. Your phone may be low on storage.';

const ALWAYS_STORAGE = new Set(['QuotaExceededError']);
const STORAGE_WHEN_ABOUT_A_DATABASE = new Set(['InvalidStateError', 'TransactionInactiveError', 'UnknownError', 'VersionError']);
const ABOUT_A_DATABASE = /database|transaction|object ?store|indexeddb|connection|quota/i;

/** Does this thrown value (or rejection reason) look like a failed IndexedDB or storage write? */
export function isStorageError(reason) {
    const name = reason?.name ?? '';
    if (ALWAYS_STORAGE.has(name)) return true;
    return STORAGE_WHEN_ABOUT_A_DATABASE.has(name) && ABOUT_A_DATABASE.test(String(reason?.message ?? ''));
}

/**
 * A gate that lets one call through per `intervalMs` and refuses the rest, so
 * a burst of failing saves (one per tapped set) raises one warning, not twenty.
 */
export function createGate(intervalMs, clock = () => Date.now()) {
    let last = -Infinity;
    return () => {
        const now = clock();
        if (now - last < intervalMs) return false;
        last = now;
        return true;
    };
}

/** Shared by every place that warns about a failed save, so together they stay under the limit. */
export const mayWarnAboutSave = createGate(30000);
