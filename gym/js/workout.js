import { database, DEFAULTS, uid } from './db.js';
import { prescriptionFor, clampRest, REST_MIN, REST_MAX } from './prescription.js';
import { alternativesFor } from './alternatives.js';
import { state, on, loadWorkouts, findExercise, lastPerformance, lastPlanPerformance, slotOf, lastNote } from './store.js';
import { $, el, clear, openModal, closeModal, confirmSheet, toast, noteField } from '../../life/dom.js';
import { stepper } from '../../life/stepper.js';
import { openPicker } from './picker.js';
import { openPlateCalculator } from './plates.js';
import { rirGuidance, repRangeGuidance } from './guidance.js';
import { demoLink } from './demo-link.js';
import { computeProgress, syncProgressLedger } from './progress.js';
import { showWorkoutSummary } from './rewards.js';
import { startRest, stopRest, isResting } from './timer.js';
import { canVibrate, playSetComplete, playWorkoutFinished } from './sfx.js';
import { getUnit, toDisplay, fromDisplay, stepWeight, weightPrecision, formatNumber, formatWeight, formatDuration, formatStopwatch } from './units.js';

let session = null;
let wakeLock = null;
let onFinished = null;
let bannerSub = null;
let elapsedEl = null;
let elapsedInterval = null;
let timerPaused = false;
let exercisesStack = null;

// How long a +/- weight ramp has to be still before it counts as settled.
// Comfortably longer than bindHold's 90ms repeat, short enough not to lag.
const WEIGHT_SETTLE_MS = 700;

// --- Wake lock -----------------------------------------------------------

async function acquireWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
        // Denied or unsupported — the screen just sleeps as usual.
    }
}

function releaseWakeLock() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
}

// --- Elapsed-time stopwatch ------------------------------------------------
// Runs off real timestamps (Date.now() - startedAt) rather than a decrementing
// counter, same reasoning as the rest timer: a backgrounded tab throttles
// setInterval, so only wall-clock math stays accurate through that.

// Warm-up sets are excluded from every headline count (this, the summary
// banner, "all done" pausing, PRs) — they're a ramp-up, not logged training
// volume, same as the plan's own "do one lighter set before the first heavy
// lift" rule.
function allSetsDone() {
    if (!session) return false;
    const total = session.entries.reduce((sum, e) => sum + e.sets.filter((s) => !s.warmup).length, 0);
    if (total === 0) return false; // nothing to finish yet — don't show "done"
    const done = session.entries.reduce((sum, e) => sum + e.sets.filter((s) => !s.warmup && s.done).length, 0);
    return done === total;
}

function tickElapsed() {
    if (!session || !elapsedEl) return;
    elapsedEl.textContent = formatStopwatch(Date.now() - new Date(session.startedAt));
}

function stopElapsedTicker() {
    clearInterval(elapsedInterval);
    elapsedInterval = null;
}

/**
 * Re-checks whether every set is ticked and pauses/resumes the ticking clock
 * to match. Called after anything that can change the done/total count —
 * ticking a set, adding or removing one.
 */
function syncElapsedTimer() {
    if (!session || !elapsedEl) return;
    timerPaused = allSetsDone();
    elapsedEl.closest('.workout-timer')?.classList.toggle('paused', timerPaused);

    stopElapsedTicker();
    tickElapsed(); // freeze/resume from the exact moment, not the next 1s tick
    if (!timerPaused) {
        elapsedInterval = setInterval(tickElapsed, 1000);
    }
}

// --- Session lifecycle ---------------------------------------------------

function entryFromTemplate(templateEntry) {
    const exercise = findExercise(templateEntry.exerciseId);
    const previous = lastPerformance(templateEntry.exerciseId);
    const previousSets = previous?.sets ?? [];
    // Each set remembers its own weight from last time — set 1 seeds from
    // last time's set 1, set 2 from set 2, and so on, rather than copying
    // whatever the final set happened to be onto every row. A set beyond
    // what you logged last time (e.g. you added one to the template since)
    // falls back to the last known weight instead of dropping to zero.
    const lastKnownWeight = previousSets.at(-1)?.weightKg ?? 0;
    // What you actually hit last time beats the template's static target,
    // which itself beats the flat app-wide default.
    const seedRir = previousSets.at(-1)?.rir ?? templateEntry.rir ?? DEFAULTS.rir;

    return {
        exerciseId: templateEntry.exerciseId,
        exerciseName: exercise?.name || 'Unknown exercise',
        muscleGroup: exercise?.muscleGroup || '',
        attachment: exercise?.attachment || '',
        equipment: exercise?.equipment || '',
        restSeconds: clampRest(templateEntry.restSeconds),
        targetReps: templateEntry.reps,
        // Snapshotted at session start, same as targetReps — the fixed bar
        // "ready to progress" checks every set against, independent of
        // whatever set.rir gets edited to mid-session.
        targetRir: templateEntry.rir ?? DEFAULTS.rir,
        note: '',
        sets: Array.from({ length: templateEntry.sets }, (_, i) => ({
            reps: templateEntry.reps,
            weightKg: previousSets[i]?.weightKg ?? lastKnownWeight,
            rir: previousSets[i]?.rir ?? seedRir,
            done: false,
            completedAt: null,
        })),
    };
}

function entryFromExercise(exerciseId) {
    return entryFromTemplate({ exerciseId, ...prescriptionFor(findExercise(exerciseId)) });
}

async function persist() {
    if (!session) return;
    await database.saveWorkout(session);
}

export async function startWorkout(templateId = null) {
    if (session) {
        toast('Finish or discard the current workout first');
        return;
    }

    const template = templateId ? state.templates.find((t) => t.id === templateId) : null;
    const now = new Date();

    session = {
        id: uid(),
        status: 'active',
        date: now.toISOString().slice(0, 10),
        startedAt: now.toISOString(),
        finishedAt: null,
        templateId: template?.id || null,
        name: template?.name || 'Quick Workout',
        entries: (template?.exercises || []).map(entryFromTemplate),
    };

    await persist();
    acquireWakeLock();
    render();
    document.querySelector('#gym-section [data-tab="today"]').click();
}

export async function resumeActive() {
    session = state.activeWorkout;
    if (session) acquireWakeLock();
}

async function finishWorkout() {
    const doneSets = session.entries.reduce((sum, entry) => sum + entry.sets.filter((s) => !s.warmup && s.done).length, 0);
    // A note ("shoulder twinged, skipped it") is worth keeping even with
    // nothing ticked — only offer to discard when there's truly nothing to save.
    const hasNote = session.entries.some((entry) => entry.note?.trim());

    if (doneSets === 0 && !hasNote) {
        const discard = await confirmSheet({
            title: 'Nothing logged',
            message: 'No sets were ticked off. Discard this workout instead?',
            confirmLabel: 'Discard',
            danger: true,
        });
        if (discard) await discardWorkout(true);
        return;
    }

    const ok = await confirmSheet({
        title: 'Finish workout',
        message:
            doneSets > 0
                ? `${doneSets} set${doneSets > 1 ? 's' : ''} logged. Anything left unticked is dropped.`
                : 'No sets were ticked off, but your notes will be saved.',
        confirmLabel: 'Finish',
    });
    if (!ok) return;

    // Keep only what was actually performed, so history reads as a record of
    // work done rather than of work planned — but never drop an exercise you
    // left a note on ("shoulder twinged, skipped it" is worth keeping). Warm-up
    // sets never make the cut either way — they're a ramp-up, not logged
    // training volume, so History and Records only ever see working sets.
    session.entries = session.entries
        .map((entry) => ({ ...entry, sets: entry.sets.filter((s) => s.done && !s.warmup) }))
        .filter((entry) => entry.sets.length > 0 || entry.note?.trim());
    session.status = 'completed';
    session.finishedAt = new Date().toISOString();

    // Snapshotted before the save, while `state.workouts` still excludes this
    // session — diffing the two derived snapshots is what tells the summary
    // sheet what this workout actually earned.
    const finished = session;
    const before = computeProgress();

    await database.saveWorkout(session);
    session = null;
    stopRest();
    releaseWakeLock();
    await loadWorkouts();
    await syncProgressLedger();
    render();
    playWorkoutFinished();

    await showWorkoutSummary(before, computeProgress(), finished);
    // After the summary, so the Progress tab redraws with the newly earned
    // badges already marked as seen.
    onFinished?.();
}

async function discardWorkout(skipConfirm = false) {
    if (!skipConfirm) {
        const ok = await confirmSheet({
            title: 'Discard workout',
            message: 'This deletes the session and everything logged in it.',
            confirmLabel: 'Discard',
            danger: true,
        });
        if (!ok) return;
    }
    await database.deleteWorkout(session.id);
    session = null;
    stopRest();
    releaseWakeLock();
    await loadWorkouts();
    render();
    toast('Workout discarded');
}

// --- Set rows ------------------------------------------------------------

function ghostText(exerciseId) {
    const previous = lastPerformance(exerciseId);
    if (!previous) return null;
    const summary = previous.sets
        .slice(0, 4)
        .map((set) => `${formatNumber(toDisplay(set.weightKg))}×${set.reps}`)
        .join('  ');
    const when = new Date(previous.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `Last time (${when}):  ${summary}`;
}

/**
 * Free-text reminder for the next session ("go up to 75", "left shoulder
 * twinged on set 3"). Saved with the workout and shown back on this exercise
 * next time — at the machine, where it's actionable.
 */
function noteSection(entry) {
    let saveTimer = null;

    const field = el('textarea', {
        class: 'form-input note-input',
        rows: 2,
        placeholder: 'e.g. go up to 75 next time',
        value: entry.note || '',
        hidden: !entry.note,
    });

    const addLink = el('button', {
        class: 'link-btn',
        type: 'button',
        text: '+ Note for next time',
        hidden: Boolean(entry.note),
    });

    addLink.addEventListener('click', () => {
        field.hidden = false;
        addLink.hidden = true;
        field.focus();
    });

    field.addEventListener('input', () => {
        entry.note = field.value;
        // Debounced: a write per keystroke would hammer IndexedDB for no gain.
        clearTimeout(saveTimer);
        saveTimer = setTimeout(persist, 500);
    });

    field.addEventListener('blur', () => {
        clearTimeout(saveTimer);
        entry.note = field.value;
        persist();
        if (!field.value.trim()) {
            field.hidden = true;
            addLink.hidden = false;
        }
    });

    return el('div', { class: 'note-section' }, [addLink, field]);
}

/**
 * Double progression, per the plan: once every working set reaches the top
 * of its rep range while still at (or above) the intended RIR — not by
 * grinding past it — it's time to add weight rather than repeat the same
 * numbers next session.
 */
/** Seeds the plate calculator with the top working set — the one you'd
 *  actually be loading the bar for. */
function heaviestWorkingWeight(entry) {
    return entry.sets.reduce((max, set) => (set.warmup ? max : Math.max(max, set.weightKg)), 0);
}

function isReadyToProgress(entry) {
    const working = entry.sets.filter((s) => !s.warmup);
    if (!working.length || !Number.isFinite(entry.targetReps)) return false;
    return working.every((s) => s.done && s.reps >= entry.targetReps && s.rir >= (entry.targetRir ?? 0));
}

function carriedNote(entry) {
    const previous = lastNote(entry.exerciseId);
    if (!previous) return null;

    const when = new Date(previous.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    const dismiss = el('button', {
        class: 'note-done',
        type: 'button',
        'aria-label': 'Mark note as done',
        text: '✓',
        onclick: async () => {
            // Flag it on the workout it came from, so it stops surfacing without
            // erasing the record of what you wrote.
            const source = await database.getWorkoutById(previous.workoutId);
            const sourceEntry = source?.entries.find((e) => e.exerciseId === entry.exerciseId);
            if (sourceEntry) {
                sourceEntry.noteDone = true;
                await database.saveWorkout(source);
                await loadWorkouts();
            }
            banner.remove();
            toast('Note cleared');
        },
    });

    const banner = el('div', { class: 'note-banner' }, [
        el('span', { class: 'note-pin', text: '📌' }),
        el('div', { class: 'note-banner-body' }, [
            el('div', { class: 'note-banner-label', text: `Note from ${when}` }),
            el('div', { class: 'note-banner-text', text: previous.note }),
        ]),
        dismiss,
    ]);

    return banner;
}

/**
 * The first weight typed onto a brand-new exercise fills the rest of the
 * working sets, which are all still sitting at zero and would otherwise each
 * need the same number typed again.
 *
 * Only ever fills blanks: a set that already has a weight — seeded from last
 * time, or typed by hand — is left alone, as is anything already ticked off.
 * Warm-ups are skipped in both directions: they neither trigger this nor
 * receive it, since their whole point is being lighter than the work sets.
 */
function fillBlankWorkingWeights(source, weightControls, unit) {
    weightControls.forEach(({ set, control }) => {
        if (set === source || set.warmup || set.done || set.weightKg > 0) return;
        set.weightKg = source.weightKg;
        control.setValue(toDisplay(set.weightKg, unit));
    });
}

/** Puts last time's reps behind a reps stepper's number, replacing any already there. */
function paintRepsGhost(repsStepper, lastReps) {
    const box = repsStepper.querySelector('.stepper-value');
    box.querySelector('.reps-ghost')?.remove();
    if (!lastReps) return;
    box.append(
        el('span', {
            class: 'reps-ghost',
            text: `last ${lastReps}`,
            'aria-label': `Last time in this plan: ${lastReps} reps`,
        }),
    );
}

/**
 * Brings every "last N" on screen up to date with the saved workouts, in place
 * — without rebuilding the blocks, so nothing you're in the middle of (a half-
 * typed note, a ticked set, your scroll position) is touched. Runs whenever the
 * saved workouts are reloaded: a workout finished, one edited or deleted in
 * History, a backup restored.
 */
function refreshPlanHints() {
    if (!session?.templateId) return;
    document.querySelectorAll('#today-body .exercise-block').forEach((block) => {
        const entry = session.entries.find((e) => e.exerciseId === block.dataset.entryKey);
        if (!entry) return;
        const last = lastPlanPerformance(slotOf(entry), session.templateId);
        const rows = [...block.querySelectorAll('.set-row')].filter((row) => !row.classList.contains('set-row-warmup'));
        rows.forEach((row, i) => paintRepsGhost(row.children[2], last?.sets[i]?.reps ?? null));
    });
}

function setRow(entry, set, index, label, refreshSets, refreshProgress, weightControls, lastReps = null) {
    const unit = getUnit();

    // Ramping a weight with +/- arrives as a burst of small changes, so the
    // fill waits for it to settle. Without this, the first tap up from zero
    // splashes one increment across every set and then never corrects itself,
    // because those sets are no longer blank.
    let fillTimer = null;
    let fillPending = false;

    const scheduleFill = (fromButton) => {
        clearTimeout(fillTimer);
        if (!fromButton) {
            // A typed value is a finished decision — no reason to wait.
            fillPending = false;
            fillBlankWorkingWeights(set, weightControls, unit);
            return;
        }
        fillPending = true;
        fillTimer = setTimeout(() => {
            fillPending = false;
            fillBlankWorkingWeights(set, weightControls, unit);
        }, WEIGHT_SETTLE_MS);
    };

    const repsStepper = stepper({
        value: set.reps,
        min: 1, // a logged set can't have zero reps
        max: 999,
        label: 'reps',
        className: 'stepper-set',
        onChange: (value) => { set.reps = value; updateBanner(); refreshProgress(); persist(); },
    });

    // Last time's reps for this set in this plan, faded behind the number: a
    // caption to read, never a value — it isn't focusable, selectable or
    // tappable, and it isn't what gets saved.
    paintRepsGhost(repsStepper, lastReps);

    const weightStepper = stepper({
        value: toDisplay(set.weightKg, unit),
        min: 0,
        max: 2000,
        label: 'weight',
        decimals: true,
        precision: weightPrecision(unit),
        className: 'stepper-set',
        onStep: (base, direction) => stepWeight(base, direction, false, unit),
        onChange: (value, fromButton) => {
            const hadWeight = set.weightKg > 0;
            set.weightKg = fromDisplay(value, unit);

            // Filling starts when a blank set first gets a weight, and keeps
            // deferring while that same interaction is still running, so a
            // ramp lands once on its final value rather than on its first step.
            if ((!hadWeight || fillPending) && !set.warmup && set.weightKg > 0) {
                scheduleFill(fromButton);
            }

            updateBanner();
            persist();
        },
    });

    weightControls.push({ set, control: weightStepper });

    // RIR ("approximate RIR" per set, per the plan) doesn't apply to warm-ups
    // — they're a ramp-up, not a working set — so that column stays a plain
    // dash there instead of a control.
    const rirCell = set.warmup
        ? el('div', { class: 'set-rir-empty', text: '–' })
        : stepper({
              value: set.rir ?? DEFAULTS.rir,
              min: 0,
              max: 10,
              label: 'RIR',
              className: 'stepper-compact',
              onChange: (value) => { set.rir = value; refreshProgress(); persist(); },
          });

    const check = el('button', {
        class: `set-check${set.done ? ' done' : ''}`,
        type: 'button',
        'aria-label': `Mark set ${label} done`,
        text: '✓',
    });

    // The index cell doubles as the delete control while the block is in edit
    // mode. A permanent delete column doesn't fit at 375px — it squeezes the
    // weight value down to ~28px, which clips "42.5". Warm-up sets get a
    // "W1, W2…" label, numbered separately from the working sets.
    const indexCell = el('div', { class: 'set-index-cell' }, [
        el('span', { class: `set-index${set.warmup ? ' set-index-warmup' : ''}`, text: label }),
        el('button', {
            class: 'set-remove',
            type: 'button',
            'aria-label': `Remove set ${label}`,
            text: '×',
            onclick: () => removeSet(entry, index, label, refreshSets),
        }),
    ]);

    const row = el('div', { class: `set-row${set.done ? ' done' : ''}${set.warmup ? ' set-row-warmup' : ''}` }, [
        indexCell,
        weightStepper,
        repsStepper,
        rirCell,
        check,
    ]);

    check.addEventListener('click', () => {
        set.done = !set.done;
        set.completedAt = set.done ? new Date().toISOString() : null;
        // Toggle in place rather than re-rendering, so the list doesn't jump
        // under your thumb and other rows keep any half-typed values.
        row.classList.toggle('done', set.done);
        check.classList.toggle('done', set.done);
        updateBanner();
        syncElapsedTimer();
        refreshProgress();
        persist();

        if (set.done) {
            playSetComplete();
            // Warm-ups are a ramp-up, not a working set — no need to eat into
            // your session standing around a rest timer built for the real sets.
            if (!set.warmup) startRest(clampRest(entry.restSeconds));
        } else if (isResting()) {
            stopRest();
        }
    });

    return row;
}

async function removeSet(entry, index, label, refreshSets) {
    if (entry.sets.length <= 1) {
        toast('That’s the last set — remove the exercise instead');
        return;
    }

    // Ticked sets are work you actually did; don't let a stray tap erase it.
    if (entry.sets[index].done) {
        const ok = await confirmSheet({
            title: 'Discard logged set',
            message: `Set ${label} of ${entry.exerciseName} is already ticked off. Discard it?`,
            confirmLabel: 'Discard',
            danger: true,
        });
        if (!ok) return;
    }

    entry.sets.splice(index, 1);
    await persist();
    refreshSets();
    updateBanner();
    syncElapsedTimer();
    toast('Set removed');
}

// --- Drag to reorder -------------------------------------------------------
// A minimal FLIP-style sortable: the dragged block follows the pointer via a
// transform recomputed fresh every move (so it stays correct through however
// many DOM swaps happen mid-drag, with no cumulative offset math to get
// wrong); whichever blocks it crosses get a one-shot slide animation into
// their vacated spots. On release the final DOM order is written back into
// session.entries and a normal render() gives every block fresh, correct
// index-bound handlers again.
//
// Two rules keep a drag from getting stranded on a phone, and both were
// learned the hard way:
//  - The dragged block is never moved in the DOM. Taking a node out of the
//    document (which insertBefore does, even to put it straight back) makes the
//    browser drop the finger's hold on it, and the "finger lifted" event then
//    goes somewhere else — leaving the list collapsed and the block stuck to a
//    finger that isn't there. Swapping places moves the blocks it crossed
//    instead.
//  - Move and release are listened for on the window, not on the handle, for
//    the one finger that started the drag, with backups (touch end, window
//    losing focus, a new touch) in case an end event is lost anyway.

/** The block's top position with no drag transform applied, for re-anchoring. */
function naturalTop(block) {
    const prev = block.style.transform;
    block.style.transform = 'none';
    const top = block.getBoundingClientRect().top;
    block.style.transform = prev;
    return top;
}

/** Slides each of `nodes` from where it was to wherever `mutate()` puts it. */
function flipSiblings(nodes, mutate) {
    const before = nodes.map((node) => node.getBoundingClientRect().top);
    mutate();
    nodes.forEach((node, i) => {
        const dy = before[i] - node.getBoundingClientRect().top;
        if (!dy) return;
        node.style.transition = 'none';
        node.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => {
            node.style.transition = 'transform 0.18s ease-out';
            node.style.transform = '';
        });
    });
}

// How far the finger has to travel before a press on the handle becomes a drag.
// A tap (or a thumb that lands there while scrolling) must do nothing — it used
// to collapse the whole list and rebuild it.
const DRAG_START_PX = 8;
// Within this distance of the top or bottom of the screen a drag scrolls the
// page, faster the closer to the edge. The bottom edge sits above the nav bar.
const SCROLL_EDGE_TOP = 80;
const SCROLL_EDGE_BOTTOM = 130;
const SCROLL_MAX_SPEED = 20; // px per frame

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Brings one exercise block to the top of the screen and flashes it, so after
 * a move you can see where it went rather than having to hunt for it in a
 * list that just changed height.
 */
function showMovedBlock(entryKey, { editing = false } = {}) {
    const block = [...document.querySelectorAll('#today-body .exercise-block')].find((b) => b.dataset.entryKey === entryKey);
    if (!block) return;
    if (editing) block.querySelector('.edit-toggle')?.click();
    block.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    block.classList.add('just-moved');
    block.addEventListener('animationend', () => block.classList.remove('just-moved'), { once: true });
}

function initDragHandle(handle, block) {
    let pressed = false; // finger is down on the handle
    let pointerId = null; // ...which finger, so a second one can't hijack the drag
    let dragging = false; // ...and has moved far enough to be a drag
    let startY = 0;
    let lastY = 0;
    let grabOffset = 0;
    let scrollFrame = null;

    const updateVisual = (pointerY) => {
        const desiredTop = pointerY - grabOffset;
        const dy = desiredTop - naturalTop(block);
        block.style.transform = `translateY(${dy}px) scale(1.02)`;
    };

    /**
     * If the dragged block has crossed the middle of a neighbour, puts it on the
     * other side of every block it passed. It does that by moving *those* blocks
     * around it — the dragged block itself must stay where it is in the DOM (see
     * the note at the top of this section).
     */
    const checkSwap = () => {
        const container = block.parentElement;
        if (!container) return false;

        const blocks = [...container.children].filter((child) => child.classList.contains('exercise-block'));
        const index = blocks.indexOf(block);
        const rect = block.getBoundingClientRect();
        const draggedCenter = rect.top + rect.height / 2;
        const centreOf = (node) => {
            const box = node.getBoundingClientRect();
            return box.top + box.height / 2;
        };

        // Dragged up past the first block whose middle is below it...
        for (let i = 0; i < index; i++) {
            if (draggedCenter < centreOf(blocks[i])) {
                const passed = blocks.slice(i, index);
                flipSiblings(passed, () => block.after(...passed));
                return true;
            }
        }
        // ...or down past the last block whose middle is above it.
        for (let i = blocks.length - 1; i > index; i--) {
            if (draggedCenter > centreOf(blocks[i])) {
                const passed = blocks.slice(index + 1, i + 1);
                flipSiblings(passed, () => block.before(...passed));
                return true;
            }
        }
        return false;
    };

    /** Follow the finger, and re-seat the block if it crossed a neighbour. */
    const follow = () => {
        updateVisual(lastY);
        if (checkSwap()) updateVisual(lastY); // re-anchor after a DOM move
    };

    /** Scrolls the page while the finger sits near an edge, so the far end of a
     *  long list is reachable without letting go. Runs once per frame. */
    const autoScroll = () => {
        scrollFrame = null;
        if (!dragging) return;

        const bottomEdge = window.innerHeight - SCROLL_EDGE_BOTTOM;
        let speed = 0;
        if (lastY < SCROLL_EDGE_TOP) speed = -SCROLL_MAX_SPEED * ((SCROLL_EDGE_TOP - lastY) / SCROLL_EDGE_TOP) ** 2;
        else if (lastY > bottomEdge) speed = SCROLL_MAX_SPEED * Math.min(1, (lastY - bottomEdge) / SCROLL_EDGE_BOTTOM) ** 2;

        if (Math.abs(speed) >= 0.5) {
            const before = window.scrollY;
            window.scrollBy({ top: speed, behavior: 'instant' });
            if (window.scrollY !== before) follow(); // the list moved under a still finger
        }
        scrollFrame = requestAnimationFrame(autoScroll);
    };

    /** The press became a drag: collapse the list and pick the block up. */
    const begin = () => {
        dragging = true;

        // Collapse every block to just its name for the length of the drag.
        // A full block runs most of a screen, so reordering otherwise meant
        // hauling one past a lot of scrolling; collapsed, the whole list fits
        // and any position is one gesture away.
        block.parentElement?.classList.add('reordering');

        // Measured after the collapse — reading the rect forces the relayout
        // through — and centred rather than kept at the original grab point,
        // which would now sit far below a block a fraction of its old height.
        grabOffset = block.getBoundingClientRect().height / 2;
        block.classList.add('dragging');
        // The block's position is read back right after it's set (naturalTop),
        // so it must never be mid-transition. The reduced-motion rule leaves
        // every element a 0.01ms one, which is enough to return the stale
        // position until the next frame — hence !important inline, which beats
        // that rule.
        block.style.setProperty('transition', 'none', 'important');

        // The collapse shortens the page, which leaves the scroll position
        // wherever the browser clamped it — often with the top of the list
        // off-screen and out of reach. Scroll so the block lands under the
        // finger instead; whatever the page can't scroll is made up by the
        // drag transform.
        const delta = naturalTop(block) + grabOffset - lastY;
        window.scrollBy({ top: delta, behavior: 'instant' });
        updateVisual(lastY);
        scrollFrame = requestAnimationFrame(autoScroll);
    };

    const onMove = (event) => {
        if (!pressed || event.pointerId !== pointerId) return;
        // A mouse released outside the window never reports it; don't keep dragging.
        if (event.pointerType === 'mouse' && event.buttons === 0) {
            finish();
            return;
        }
        lastY = event.clientY;
        if (!dragging) {
            if (Math.abs(lastY - startY) < DRAG_START_PX) return;
            begin();
            return;
        }
        event.preventDefault();
        follow();
    };

    const onEnd = (event) => {
        if (event.pointerId === pointerId) finish();
    };

    // A second finger, or any new press, means the first one is long gone.
    const onStrayDown = (event) => {
        if (event.pointerId !== pointerId) finish();
    };

    // Touch events as a second opinion: some browsers drop the pointer-level end
    // of a gesture the document still sees finish.
    const onTouchEnd = (event) => {
        if (event.touches.length === 0) finish();
    };

    const onLeave = () => finish();
    const onHide = () => {
        if (document.hidden) finish();
    };

    const listeners = [
        ['pointermove', onMove],
        ['pointerup', onEnd],
        ['pointercancel', onEnd],
        ['pointerdown', onStrayDown],
        ['touchend', onTouchEnd],
        ['touchcancel', onTouchEnd],
        ['blur', onLeave],
        ['pagehide', onLeave],
        ['visibilitychange', onHide],
    ];
    const listen = () => listeners.forEach(([type, fn]) => window.addEventListener(type, fn, { capture: true, passive: false }));
    const unlisten = () => listeners.forEach(([type, fn]) => window.removeEventListener(type, fn, { capture: true }));

    async function finish() {
        if (!pressed) return;
        const wasDragging = dragging;
        pressed = false;
        dragging = false;
        pointerId = null;
        cancelAnimationFrame(scrollFrame);
        scrollFrame = null;
        unlisten();

        if (!wasDragging) return; // a tap — nothing to put back

        block.classList.remove('dragging');
        block.style.removeProperty('transition');
        block.style.transform = '';

        const container = block.parentElement;
        container?.classList.remove('reordering');
        if (container && session) {
            const order = [...container.children].map((el) => el.dataset.entryKey);
            session.entries.sort((a, b) => order.indexOf(a.exerciseId) - order.indexOf(b.exerciseId));
            await persist();
        }
        render();
        showMovedBlock(block.dataset.entryKey);
    }

    handle.addEventListener('pointerdown', (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        if (pressed) return; // already tracking a finger
        event.preventDefault();
        event.stopPropagation(); // our own stray-press check must not see this one
        pressed = true;
        dragging = false;
        pointerId = event.pointerId;
        startY = lastY = event.clientY;
        try {
            // Keeps the events coming to the handle even if the finger slides
            // off it. Not load-bearing — they're also caught on the window — and
            // some environments reject it, which shouldn't take the gesture down.
            handle.setPointerCapture(event.pointerId);
        } catch {
            // ignored — see above
        }
        listen();
    });
}

/** Moves an exercise one place up or down — the precise alternative to dragging. */
async function moveExercise(index, direction) {
    const target = index + direction;
    if (!session || target < 0 || target >= session.entries.length) return;

    const key = session.entries[index].exerciseId;
    [session.entries[index], session.entries[target]] = [session.entries[target], session.entries[index]];
    await persist();
    render();
    // Still in edit mode, so the next tap on Move up/down is right there.
    showMovedBlock(key, { editing: true });
}

// --- Exercise blocks -----------------------------------------------------

function exerciseBlock(entry, entryIndex) {
    // A session started before rest was limited to 2–3 minutes comes out in range.
    entry.restSeconds = clampRest(entry.restSeconds);
    const meta = [entry.equipment, entry.attachment].filter(Boolean).join(' · ');
    const ghost = ghostText(entry.exerciseId);

    // If this workout came from a template, offer to push a rest tweak back to
    // it — but only as a link that appears once the value actually differs,
    // rather than a prompt every time you nudge the stepper.
    const template = session.templateId ? state.templates.find((t) => t.id === session.templateId) : null;
    const templateEntry = template?.exercises.find((e) => e.exerciseId === entry.exerciseId);

    const saveBack = el('button', {
        class: 'link-btn',
        type: 'button',
        text: 'Save to plan',
        hidden: true,
        onclick: async () => {
            templateEntry.restSeconds = entry.restSeconds;
            await database.saveTemplate(template);
            saveBack.hidden = true;
            toast('Plan rest updated');
        },
    });

    const syncSaveBack = () => {
        if (templateEntry) saveBack.hidden = templateEntry.restSeconds === entry.restSeconds;
    };

    // Sits with the template note, reading the rep range and RIR this
    // exercise is actually programmed at — worth more mid-set than in the
    // builder, where the numbers were set in the first place.
    const guidanceHint = templateEntry
        ? el('div', { class: 'guidance-hint' }, [
              el('div', { text: repRangeGuidance(entry.targetReps ?? DEFAULTS.reps) }),
              el('div', { text: rirGuidance(entry.targetRir ?? DEFAULTS.rir) }),
          ])
        : null;

    // Every exercise gets one. Where the plan has a slot for it — including the
    // slot a swapped-in exercise took over — the note is bound straight to the
    // template's own copy so it stays in sync with the builder. With no slot to
    // hang it on (a quick workout, an exercise added mid-session) it's kept on
    // the workout entry instead.
    const planSlot = template?.exercises.find((e) => e.exerciseId === (entry.swappedFromId ?? entry.exerciseId));
    const templateNoteField = noteField({
        label: 'Plan note',
        placeholder: 'e.g. this week: pause reps',
        value: (planSlot ? planSlot.note : entry.planNote) || '',
        onSave: async (value) => {
            if (planSlot) {
                planSlot.note = value;
                await database.saveTemplate(template);
            } else {
                entry.planNote = value;
                await persist();
            }
        },
    });

    const restControl = stepper({
        value: clampRest(entry.restSeconds),
        min: REST_MIN,
        max: REST_MAX,
        step: 15,
        suffix: 's',
        label: 'rest',
        onChange: async (value) => {
            entry.restSeconds = value;
            syncSaveBack();
            await persist();
        },
    });
    syncSaveBack();

    const progressBadge = el('div', {
        class: 'progress-badge',
        hidden: true,
        text: '🎯 Ready to progress — every set hit target reps at your RIR. Add a little weight next time.',
    });
    const refreshProgress = () => { progressBadge.hidden = !isReadyToProgress(entry); };

    // Rebuilt in place rather than via a full render(), so removing a set
    // doesn't reset scroll position or drop you out of edit mode.
    const setList = el('div', { class: 'set-list' });
    // Lets one row write into its siblings' inputs directly, rather than
    // rebuilding the list mid-edit and yanking the field out from under you.
    const weightControls = [];
    const refreshSets = () => {
        clear(setList);
        weightControls.length = 0;
        // Looked up on every redraw (once per block, not per row — it walks the
        // workout history), so adding or removing a set never uses stale data.
        const lastInPlan = lastPlanPerformance(slotOf(entry), session.templateId);
        let workingCount = 0;
        let warmupCount = 0;
        entry.sets.forEach((set, index) => {
            const label = set.warmup ? `W${++warmupCount}` : String(++workingCount);
            // Working sets only, matched by position (set 3 beside last time's set 3).
            const lastReps = set.warmup ? null : (lastInPlan?.sets[workingCount - 1]?.reps ?? null);
            setList.append(setRow(entry, set, index, label, refreshSets, refreshProgress, weightControls, lastReps));
        });
        refreshProgress();
    };
    refreshSets();

    const editToggle = el('button', {
        class: 'link-btn edit-toggle',
        type: 'button',
        text: 'Edit',
        onclick: () => {
            const editing = block.classList.toggle('editing');
            editToggle.textContent = editing ? 'Done' : 'Edit';
        },
    });

    const dragHandle = el('div', {
        class: 'exercise-drag-handle',
        'aria-label': `Reorder ${entry.exerciseName}`,
        role: 'button',
    }, ['☰']);

    const block = el('div', { class: 'exercise-block', dataset: { entryKey: entry.exerciseId } }, [
        el('div', { class: 'exercise-block-head' }, [
            dragHandle,
            el('div', { class: 'exercise-block-title' }, [
                el('div', { class: 'exercise-block-name' }, [
                    entry.muscleGroup ? el('span', { class: 'muscle-dot', dataset: { muscle: entry.muscleGroup } }) : null,
                    entry.exerciseName,
                ]),
                meta ? el('div', { class: 'exercise-block-meta', text: meta }) : null,
                entry.swappedFrom ? el('div', { class: 'exercise-block-meta', text: `Swapped from ${entry.swappedFrom}` }) : null,
                demoLink(entry.exerciseId),
            ]),
            el('div', { class: 'row-controls' }, [
                editToggle,
                el('button', {
                    class: 'link-btn swap-toggle',
                    type: 'button',
                    text: 'Swap',
                    'aria-label': `Swap ${entry.exerciseName} for an alternative`,
                    onclick: () => swapExercise(entryIndex),
                }),
                el('button', {
                    class: 'icon-btn danger',
                    type: 'button',
                    'aria-label': 'Remove exercise',
                    onclick: () => removeExercise(entryIndex),
                }, ['×']),
            ]),
        ]),

        // Edit mode only: one-step moves for when a drag is more than you need.
        el('div', { class: 'block-move' }, [
            el('button', {
                class: 'btn btn-outline btn-small',
                type: 'button',
                text: '↑ Move up',
                disabled: entryIndex === 0,
                onclick: () => moveExercise(entryIndex, -1),
            }),
            el('button', {
                class: 'btn btn-outline btn-small',
                type: 'button',
                text: '↓ Move down',
                disabled: entryIndex === session.entries.length - 1,
                onclick: () => moveExercise(entryIndex, 1),
            }),
        ]),

        progressBadge,
        carriedNote(entry),
        ghost ? el('div', { class: 'ghost-hint', text: ghost }) : null,

        el('div', { class: 'stepper-head' }, [
            el('span', { text: '#' }),
            el('span', { text: `Weight (${getUnit()})` }),
            el('span', { text: 'Reps' }),
            el('span', { text: 'RIR' }),
            el('span', { text: '' }),
        ]),

        setList,

        el('div', { class: 'rest-setting' }, [
            el('div', {}, [
                el('span', { class: 'stepper-label', text: 'Rest between sets' }),
                saveBack,
            ]),
            restControl,
        ]),

        el('div', { class: 'block-actions' }, [
            el('button', {
                class: 'btn btn-outline btn-small',
                type: 'button',
                text: '+ Warm-up',
                onclick: () => addWarmupSet(entry, refreshSets),
            }),
            el('button', {
                class: 'btn btn-outline btn-small',
                type: 'button',
                text: '+ Add set',
                onclick: () => addSet(entry, refreshSets),
            }),
            // Only for barbell work — plate maths is meaningless on a cable
            // stack or a pin-loaded machine, and the button would be noise on
            // most of the list.
            entry.equipment === 'Barbell'
                ? el('button', {
                      class: 'btn btn-outline btn-small',
                      type: 'button',
                      text: 'Plates',
                      onclick: () => openPlateCalculator(heaviestWorkingWeight(entry)),
                  })
                : null,
        ]),

        guidanceHint,
        templateNoteField,
        noteSection(entry),
    ]);

    initDragHandle(dragHandle, block);
    return block;
}

function addSet(entry, refreshSets) {
    const last = entry.sets.at(-1);
    entry.sets.push({
        reps: last?.reps ?? entry.targetReps ?? DEFAULTS.reps,
        weightKg: last?.weightKg ?? 0,
        rir: last?.rir ?? DEFAULTS.rir,
        done: false,
        completedAt: null,
    });
    persist();
    refreshSets();
    updateBanner();
    syncElapsedTimer();
}

/**
 * Warm-up sets always sit ahead of the working sets in the array — inserted
 * right after any existing warm-ups, never mixed in among working sets — so
 * "last working set" lookups elsewhere (addSet, ghost text) keep working
 * unchanged via `.at(-1)`.
 */
function addWarmupSet(entry, refreshSets) {
    const warmupCount = entry.sets.filter((s) => s.warmup).length;
    const firstWorking = entry.sets.find((s) => !s.warmup);
    entry.sets.splice(warmupCount, 0, {
        reps: firstWorking?.reps ?? entry.targetReps ?? DEFAULTS.reps,
        weightKg: firstWorking?.weightKg ?? 0,
        done: false,
        completedAt: null,
        warmup: true,
    });
    persist();
    refreshSets();
    updateBanner();
    syncElapsedTimer();
}

async function removeExercise(index) {
    const entry = session.entries[index];
    const logged = entry.sets.some((s) => s.done);
    const hasNote = Boolean(entry.note?.trim());

    if (logged || hasNote) {
        const message =
            logged && hasNote
                ? `“${entry.exerciseName}” has logged sets and a note. Removing it drops both.`
                : logged
                  ? `“${entry.exerciseName}” has logged sets. Removing it drops them.`
                  : `“${entry.exerciseName}” has a note on it. Removing it drops the note.`;
        const ok = await confirmSheet({ title: 'Remove exercise', message, confirmLabel: 'Remove', danger: true });
        if (!ok) return;
    }
    session.entries.splice(index, 1);
    await persist();
    render();
}

// Which exercise the open swap sheet is for — the sheet is static markup
// (shown via the modal stack, like every other), so it has to be remembered.
let swapIndex = null;

/**
 * Opens the swap sheet: substitutes that train the same thing (see
 * `alternatives.js`), with the full exercise list one tap away for anything
 * it didn't think of.
 */
function swapExercise(index) {
    const entry = session.entries[index];
    // A deleted exercise has no record to look up, but what the entry itself
    // remembers is enough to find like-for-like.
    const current = findExercise(entry.exerciseId) ?? {
        id: entry.exerciseId,
        name: entry.exerciseName,
        muscleGroup: entry.muscleGroup,
        equipment: entry.equipment,
    };
    const taken = session.entries.map((e) => e.exerciseId);
    const options = alternativesFor(current, state.exercises, taken);

    // Already swapped once? Going back to what the plan called for is always on the table.
    const original = entry.swappedFromId ? findExercise(entry.swappedFromId) : null;
    if (original && !taken.includes(original.id)) {
        // It may already be one of the suggestions — it moves to the top, not twice.
        const rest = options.filter((option) => option.exercise.id !== original.id);
        options.length = 0;
        options.push({ exercise: original, note: 'What your plan called for' }, ...rest);
    }

    swapIndex = index;
    $('#swap-subtitle').textContent = [entry.exerciseName, entry.muscleGroup].filter(Boolean).join(' · ');
    const list = clear($('#swap-list'));
    if (!options.length) {
        list.append(el('div', { class: 'empty-state small', text: 'No close substitute in your library — browse all exercises instead.' }));
    }
    options.forEach(({ exercise, note }) => {
        list.append(
            el('button', { class: 'picker-row', type: 'button', dataset: { id: exercise.id } }, [
                el('span', { class: 'muscle-dot', dataset: { muscle: exercise.muscleGroup } }),
                el('div', { class: 'picker-row-body' }, [
                    el('div', { class: 'picker-name', text: exercise.name }),
                    el('div', {
                        class: 'picker-meta',
                        text: [exercise.equipment, exercise.attachment].filter(Boolean).join(' · '),
                    }),
                    note ? el('div', { class: 'picker-note', text: note }) : null,
                ]),
                el('span', { class: 'picker-add', text: '⇄' }),
            ]),
        );
    });
    openModal('swap-modal');
}

/**
 * Replaces an exercise in the running workout. The plan's slot (set count,
 * target reps, RIR, rest) stays; everything about the lift itself doesn't:
 * the note ("shoulder hurts on this") was written about the exercise being
 * replaced, and the weights were too — a barbell squat load means nothing on
 * a leg press — so each working set is re-seeded from what you last lifted on
 * the new exercise, or left blank if you never have. Sets already ticked were
 * done on the old exercise, so they're cleared (after asking) rather than
 * quietly credited to the new one.
 */
async function applySwap(index, exerciseId) {
    const entry = session.entries[index];
    const exercise = findExercise(exerciseId);
    if (!entry || !exercise) return false;

    const logged = entry.sets.filter((set) => set.done).length;
    if (logged) {
        const ok = await confirmSheet({
            title: 'Swap exercise',
            message: `“${entry.exerciseName}” has ${logged} logged set${logged === 1 ? '' : 's'}. Swapping to “${exercise.name}” clears ${logged === 1 ? 'it' : 'them'}.`,
            confirmLabel: 'Swap & clear',
            danger: true,
        });
        if (!ok) return false;
    }

    // Remember what the plan originally called for, so the block can say so
    // and the swap sheet can offer the way back.
    const originalId = entry.swappedFromId ?? entry.exerciseId;
    const originalName = entry.swappedFrom ?? entry.exerciseName;
    Object.assign(entry, {
        exerciseId,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscleGroup || '',
        attachment: exercise.attachment || '',
        equipment: exercise.equipment || '',
        note: '',
    });
    // A plan note kept on the entry was about the old exercise; one on the
    // plan's slot is still the slot's, so it's left where it is.
    delete entry.planNote;
    if (exerciseId === originalId) {
        delete entry.swappedFromId;
        delete entry.swappedFrom;
    } else {
        entry.swappedFromId = originalId;
        entry.swappedFrom = originalName;
    }

    const previous = lastPerformance(exerciseId)?.sets ?? [];
    const lastKnown = previous.at(-1)?.weightKg ?? 0;
    let working = 0;
    entry.sets.forEach((set) => {
        set.done = false;
        set.completedAt = null;
        set.weightKg = set.warmup ? 0 : (previous[working++]?.weightKg ?? lastKnown);
    });

    await persist();
    render();
    syncElapsedTimer();
    toast(`Swapped to ${exercise.name}`);
    return true;
}

/**
 * Inserting mid-picker plays the entrance animation while the full-screen
 * picker sheet still covers it — invisible, wasted. Instead each newly
 * appended block starts paused at its first frame, and only starts playing
 * once the picker actually closes and the block is something you can see.
 */
function addExercise() {
    const addedBlocks = [];

    const primeEntrance = (block) => {
        block.classList.add('exercise-block-new');
        addedBlocks.push(block);
    };

    openPicker({
        title: 'Add Exercise',
        exclude: session.entries.map((entry) => entry.exerciseId),
        onSelect: (exerciseId) => {
            const entry = entryFromExercise(exerciseId);
            session.entries.push(entry);
            persist();
            toast(`${entry.exerciseName} added`);

            if (!exercisesStack) {
                // Empty workout — the empty-state placeholder needs swapping
                // out for a real list, easiest done with a full rebuild.
                render();
                primeEntrance(exercisesStack.lastElementChild);
            } else {
                const block = exerciseBlock(entry, session.entries.length - 1);
                exercisesStack.append(block);
                primeEntrance(block);
                updateBanner();
                syncElapsedTimer();
            }
            return true; // keep the picker open for adding a few at once
        },
        onClose: () => {
            addedBlocks.forEach((block, index) => {
                // A short stagger reads as each one landing in turn rather
                // than everything popping at once; capped so a big batch
                // doesn't crawl.
                setTimeout(() => {
                    block.style.animationPlayState = 'running';
                    block.addEventListener('animationend', () => {
                        block.classList.remove('exercise-block-new');
                        block.style.animation = '';
                    }, { once: true });
                }, Math.min(index, 4) * 80);
            });
        },
    });
}

// --- Views ---------------------------------------------------------------

function summaryText() {
    const doneSets = session.entries.reduce((sum, e) => sum + e.sets.filter((s) => !s.warmup && s.done).length, 0);
    const totalSets = session.entries.reduce((sum, e) => sum + e.sets.filter((s) => !s.warmup).length, 0);
    const volume = session.entries.reduce(
        (sum, e) => sum + e.sets.filter((s) => !s.warmup && s.done).reduce((v, s) => v + s.weightKg * s.reps, 0),
        0,
    );
    const elapsed = formatDuration(Date.now() - new Date(session.startedAt));
    return `${doneSets}/${totalSets} sets · ${elapsed} · ${formatWeight(volume)} volume`;
}

/** Ticking a set updates in place rather than re-rendering, so the running
 *  totals have to be refreshed explicitly or the banner goes stale. */
function updateBanner() {
    if (session && bannerSub) bannerSub.textContent = summaryText();
}

function activeView() {
    const body = el('div', {});
    bannerSub = el('div', { class: 'workout-sub', text: summaryText() });

    body.append(
        el('div', { class: 'workout-banner' }, [
            el('div', {}, [
                el('div', { class: 'workout-title', text: session.name }),
                bannerSub,
            ]),
        ]),
    );

    elapsedEl = el('span', { class: 'workout-timer-value' });
    body.append(
        el('div', { class: 'workout-timer' }, [
            el('span', { class: 'workout-timer-label', text: 'Elapsed' }),
            elapsedEl,
            el('span', { class: 'workout-timer-paused-tag', text: 'Paused — confirm to finish' }),
        ]),
    );
    syncElapsedTimer();

    if (session.entries.length) {
        exercisesStack = el('div', { class: 'stack' }, session.entries.map(exerciseBlock));
        body.append(exercisesStack);
    } else {
        body.append(el('div', { class: 'empty-state', text: 'No exercises yet — add one below.' }));
    }

    body.append(
        el('button', {
            class: 'btn btn-outline btn-block spaced',
            type: 'button',
            text: '+ Add Exercise',
            onclick: addExercise,
        }),
        el('div', { class: 'finish-actions' }, [
            el('button', { class: 'btn btn-outline', type: 'button', text: 'Discard', onclick: () => discardWorkout() }),
            el('button', { class: 'btn btn-success', type: 'button', text: 'Finish Workout', onclick: finishWorkout }),
        ]),
    );

    return body;
}

export function render() {
    bannerSub = null;
    exercisesStack = null;
    stopElapsedTicker();
    elapsedEl = null;

    const container = clear($('#today-body'));
    $('#today-title').textContent = session ? 'Workout' : 'Start a Workout';

    // The launcher is static markup rather than rebuilt DOM, so the template
    // list and its buttons keep the listeners bound once at boot — the live
    // session just takes the screen over while it's running.
    $('#today-idle').hidden = Boolean(session);
    if (session) container.append(activeView());
    else refreshIdleFootnote();

    document.body.classList.toggle('resting-room', Boolean(session));
}

/** iOS Safari can't vibrate from a web app, so rest alerts lean on sound. */
function refreshIdleFootnote() {
    const footnote = $('#today-footnote');
    footnote.hidden = canVibrate();
    if (!footnote.hidden) {
        footnote.textContent =
            'Rest alerts use sound — iPhone Safari can\u2019t vibrate from a web app. Keep the volume up, or watch the timer bar.';
    }
}

export function hasActiveSession() {
    return Boolean(session);
}

export function initWorkout({ onWorkoutFinished } = {}) {
    onFinished = onWorkoutFinished;

    // The "last N" on each set follows the saved workouts wherever they change.
    on('workouts', refreshPlanHints);

    $('#start-empty-btn').addEventListener('click', () => startWorkout(null));

    $('#swap-list').addEventListener('click', (event) => {
        const row = event.target.closest('.picker-row');
        if (!row) return;
        closeModal('swap-modal');
        applySwap(swapIndex, row.dataset.id);
    });
    $('#swap-browse').addEventListener('click', () => {
        const index = swapIndex;
        openPicker({
            title: 'Swap For',
            exclude: session.entries.map((e) => e.exerciseId),
            onSelect: (exerciseId) => {
                closeModal('swap-modal');
                applySwap(index, exerciseId);
                return false;
            },
        });
    });

    // Re-request the lock after the phone is unlocked or the tab is refocused —
    // the browser drops it whenever the page loses visibility.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && session) {
            acquireWakeLock();
            // A throttled/suspended interval can be stale by several seconds
            // after the tab was backgrounded — repaint immediately.
            if (!timerPaused) tickElapsed();
        }
    });
}
