// Every sound effect in the app shares one AudioContext, unlocked on the
// first tap of a session. iOS blocks audio before a user gesture, and by the
// time a sound actually needs to play (a set gets ticked, a rest ends), the
// tap that could have unlocked it is long gone — so this fires eagerly on
// the first pointerdown anywhere, not lazily at the moment a sound is needed.

let audioCtx = null;

// One switch for every sound in the app. Off, nothing plays and the rest timer's
// beeps go quiet too. The preference itself is kept by life/sound.js (it is a
// choice of this phone, so it never travels in a backup); this file only obeys it.
let enabled = true;

export function setSoundEnabled(on) {
    enabled = Boolean(on);
}

export const isSoundEnabled = () => enabled;

function unlockAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    const source = audioCtx.createBufferSource();
    source.buffer = audioCtx.createBuffer(1, 1, 22050);
    source.connect(audioCtx.destination);
    source.start(0);
}

/** True when the device can actually buzz — iOS Safari cannot. */
export function canVibrate() {
    return typeof navigator.vibrate === 'function';
}

function ensureRunning() {
    if (!enabled || !audioCtx) return false;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return true;
}

/** A single short tone. `at` and `duration` are in seconds. */
function tone(freq, at, duration = 0.16, peak = 0.3, type = 'sine') {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const start = audioCtx.currentTime + at;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    // Ramped rather than switched, so it doesn't click.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
}

/** Rest timer hitting zero — three insistent beeps, plus a buzz where supported. */
export function playRestOver() {
    if (!ensureRunning()) return;
    [0, 0.28, 0.56].forEach((at) => tone(880, at, 0.22, 0.35));
    if (canVibrate()) navigator.vibrate([300, 120, 300]);
}

/**
 * A set ticked off. This can fire 15-30+ times in one workout, so it stays
 * quiet and quick — a soft two-note blip meant to fade into the background,
 * not announce itself the way the rest-over alarm does.
 */
export function playSetComplete() {
    if (!ensureRunning()) return;
    tone(660, 0, 0.09, 0.18);
    tone(988, 0.05, 0.12, 0.16);
}

/**
 * Finishing a workout. Fires once per session, so unlike the set sound it
 * can afford to be a bit more present — a short major-triad rise (C5-E5-G5).
 */
export function playWorkoutFinished() {
    if (!ensureRunning()) return;
    tone(523.25, 0, 0.2, 0.28);
    tone(659.25, 0.12, 0.2, 0.28);
    tone(783.99, 0.24, 0.34, 0.3);
}

/**
 * Levelling up. Rarer than finishing a workout and meant to feel like it — the
 * same triad carried an octave higher with a fourth note on top, so it reads
 * as a continuation of the finish sound rather than a competing jingle.
 */
export function playLevelUp() {
    if (!ensureRunning()) return;
    tone(523.25, 0, 0.16, 0.26);
    tone(659.25, 0.1, 0.16, 0.26);
    tone(783.99, 0.2, 0.16, 0.28);
    tone(1046.5, 0.3, 0.45, 0.3);
}

/**
 * A badge unlocking. Fires alongside the level sound sometimes, so it sits in
 * a different register — a bright two-note ping rather than another chord.
 */
export function playBadgeEarned() {
    if (!ensureRunning()) return;
    tone(880, 0, 0.12, 0.22);
    tone(1318.5, 0.09, 0.26, 0.24);
}

/**
 * A good day reached (the game layer). A soft two-note rise that stays well
 * under the level-up sound: it can happen once a day, and should feel like a nod.
 */
export function playGoodDay() {
    if (!ensureRunning()) return;
    tone(587.33, 0, 0.14, 0.2);
    tone(880, 0.1, 0.3, 0.2);
}

// --- Small sounds for everyday taps ---------------------------------------------------
// Kept much quieter and shorter than the rest-timer and level sounds: these fire many
// times a day and should read as the app answering your finger, not as an event.

/** A habit, task, video, book or purchase ticked (`done`) or put back. */
export function playTick(done = true) {
    if (!ensureRunning()) return;
    if (done) {
        tone(740, 0, 0.07, 0.13);
        tone(1109, 0.045, 0.11, 0.1);
    } else {
        tone(520, 0, 0.08, 0.07);
    }
}

/** Something saved: a meal logged, a weigh-in kept. Two soft rising notes. */
export function playSaved() {
    if (!ensureRunning()) return;
    tone(660, 0, 0.09, 0.1);
    tone(880, 0.07, 0.14, 0.1);
}

/** The pitch of a mood tap, 1 (rough) to 5 (great): a step up for each level, so how you feel is audible. */
export function moodFrequency(level) {
    const steps = [392, 440, 494, 587, 659]; // G4 A4 B4 D5 E5
    const n = level === null || level === undefined || level === '' ? NaN : Number(level);
    const index = Number.isFinite(n) ? Math.min(4, Math.max(0, Math.round(n) - 1)) : 2; // no mood: the middle note
    return steps[index];
}

export function playMood(level) {
    if (!ensureRunning()) return;
    tone(moodFrequency(level), 0, 0.16, 0.13);
}

/** A goal of the day finished (an arc closing, a routine complete): a small bell, longer than a tick. */
export function playGoalDone() {
    if (!ensureRunning()) return;
    tone(784, 0, 0.3, 0.14);
    tone(1175, 0.09, 0.38, 0.11);
}

export function initSfx() {
    document.addEventListener('pointerdown', unlockAudio, { once: true });
}
