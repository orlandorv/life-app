/**
 * LifeDB — storage for every Life section except Gym, which keeps its own
 * GymTrackerDB untouched (its data and backups predate Life). One database
 * with a store per concern; a new section adds its stores by bumping
 * DB_VERSION and creating them in `onupgradeneeded`.
 *
 * Same shape as gym/js/db.js: a singleton with thin promise wrappers over
 * IndexedDB. Sections keep their own record shapes and helpers on top of the
 * generic get/getAll/put/delete/byIndex here.
 */

import { LIFE_STORES, DEVICE_SETTINGS } from './backup-format.js';

const DB_NAME = 'LifeDB';
const DB_VERSION = 3;

export function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

class LifeDatabase {
    constructor() {
        this.db = null;
        this.opening = null;
    }

    /** Idempotent: every caller can `await lifeDb.init()` and share one open. */
    init() {
        if (this.opening) return this.opening;

        this.opening = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Database upgrade blocked — close other tabs running this app.'));
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // v1 — Nutrition
                if (!db.objectStoreNames.contains('foods')) {
                    const store = db.createObjectStore('foods', { keyPath: 'id' });
                    store.createIndex('name', 'name', { unique: false });
                }

                // `day` is the local `YYYY-MM-DD` the entry belongs to, so a
                // day's log is one index lookup.
                if (!db.objectStoreNames.contains('nutritionEntries')) {
                    const store = db.createObjectStore('nutritionEntries', { keyPath: 'id' });
                    store.createIndex('day', 'day', { unique: false });
                }

                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // v2 — Habits. `days` is the weekdays a habit is due (Monday=0
                // … Sunday=6); a log's presence means "done that day", so a
                // toggle is put/delete and can never double-count.
                if (!db.objectStoreNames.contains('habits')) {
                    db.createObjectStore('habits', { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains('habitLogs')) {
                    const store = db.createObjectStore('habitLogs', { keyPath: 'id' });
                    store.createIndex('day', 'day', { unique: false });
                    store.createIndex('habitId', 'habitId', { unique: false });
                }

                // v3 — Body. One record per local day, keyed by the day itself,
                // so logging a day twice replaces it. Any of the numbers may be
                // null: "not recorded" is different from zero.
                if (!db.objectStoreNames.contains('bodyEntries')) {
                    db.createObjectStore('bodyEntries', { keyPath: 'day' });
                }
            };
        }).catch((error) => {
            this.opening = null;
            throw error;
        });

        return this.opening;
    }

    _run(storeName, mode, work) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode);
            let result;
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
            result = work(tx);
        });
    }

    _request(request) {
        return new Promise((resolve, reject) => {
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    get(storeName, key) {
        return this._request(this.db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
    }

    getAll(storeName) {
        return this._request(this.db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
    }

    byIndex(storeName, indexName, value) {
        return this._request(
            this.db.transaction(storeName, 'readonly').objectStore(storeName).index(indexName).getAll(value),
        );
    }

    put(storeName, value) {
        return this._run(storeName, 'readwrite', (tx) => {
            tx.objectStore(storeName).put(value);
            return value;
        });
    }

    delete(storeName, key) {
        return this._run(storeName, 'readwrite', (tx) => {
            tx.objectStore(storeName).delete(key);
        });
    }

    count(storeName) {
        return this._request(this.db.transaction(storeName, 'readonly').objectStore(storeName).count());
    }

    /** Is there anything here worth backing up? Settings alone don't count. */
    async hasAnyData() {
        const counts = await Promise.all(['foods', 'nutritionEntries', 'habits', 'bodyEntries'].map((name) => this.count(name)));
        return counts.some((n) => n > 0);
    }

    /** Every Life store, minus settings that belong to this device (see DEVICE_SETTINGS). */
    async exportAll() {
        const names = Object.keys(LIFE_STORES);
        const rows = await Promise.all(names.map((name) => this.getAll(name)));
        const life = Object.fromEntries(names.map((name, i) => [name, rows[i]]));
        life.settings = life.settings.filter((row) => !DEVICE_SETTINGS.includes(row.key));
        return life;
    }

    /**
     * Writes rows by key in one transaction — same as re-saving them, so a row
     * sharing a key with existing data replaces it and nothing else is touched.
     * All-or-nothing: any bad row aborts the whole transaction.
     */
    async importAll(life) {
        const names = Object.keys(LIFE_STORES).filter((name) => Array.isArray(life[name]));
        if (!names.length) return;

        await this._run(names, 'readwrite', (tx) => {
            try {
                names.forEach((name) => {
                    const store = tx.objectStore(name);
                    life[name].forEach((row) => store.put(row));
                });
            } catch (error) {
                // A thrown error alone would still commit the rows put before
                // it; aborting is what makes this genuinely all-or-nothing.
                tx.abort();
                throw error;
            }
        });
    }

    async getSetting(key, fallback = null) {
        const record = await this.get('settings', key);
        return record ? record.value : fallback;
    }

    saveSetting(key, value) {
        return this.put('settings', { key, value });
    }
}

export const lifeDb = new LifeDatabase();
