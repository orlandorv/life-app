import { lifeDb } from './db.js';
import { el, toast } from './dom.js';
import { setSoundEnabled, isSoundEnabled, playTick, playSaved, playMood, playGoalDone } from '../gym/js/sfx.js';

/**
 * Sound for the whole app: one preference, and the few small sounds the sections
 * use. The sounds themselves are synthesised in gym/js/sfx.js (one shared
 * AudioContext, unlocked by the first tap); this keeps the on/off choice and gives
 * every section one import.
 *
 * The choice is a preference of this phone, so it lives in LifeDB `settings` under
 * `lifeGameDevice` (in `DEVICE_SETTINGS`: never exported, never restored). The game
 * layer used the same row for its own two sounds before there was a switch for all of them.
 */

const DEVICE_KEY = 'lifeGameDevice';

/** Reads the saved choice. Safe to call once at start; sound is on until it has been read. */
export async function initSound() {
    try {
        await lifeDb.init();
        const stored = await lifeDb.getSetting(DEVICE_KEY, null);
        setSoundEnabled(stored?.sound !== false);
    } catch (error) {
        console.warn(error);
    }
}

export const isSoundOn = () => isSoundEnabled();

/** Turns sound on or off and remembers it. Returns whether it was saved. */
export async function setSoundOn(on) {
    setSoundEnabled(on);
    try {
        await lifeDb.saveSetting(DEVICE_KEY, { sound: Boolean(on) });
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}

/** What the sections call. Each is a no-op when sound is off. */
export const sound = {
    /** A tick: `done` true for ticked, false for put back. */
    tick: (done = true) => playTick(done),
    /** Something saved. */
    saved: () => playSaved(),
    /** A mood tap, 1 to 5. */
    mood: (level) => playMood(level),
    /** A goal finished. */
    goal: () => playGoalDone(),
};

/**
 * The sound checkbox, for the game's sheet and Gym's settings: it saves the choice
 * as soon as it is changed, and plays a small bell when switched on so you can hear
 * what you turned on.
 */
export function soundBox() {
    const box = el('input', { type: 'checkbox' });
    box.checked = isSoundOn();
    box.addEventListener('change', async () => {
        if (!(await setSoundOn(box.checked))) toast('Couldn’t save that');
        if (box.checked) sound.goal();
    });
    return box;
}
