import { uid } from './db.js';
import { state, saveGoals, findExercise } from './store.js';
import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../../life/dom.js';
import { labelledStepper } from '../../life/stepper.js';
import { openPicker } from './picker.js';
import { formatWeight, formatNumber, getUnit, toDisplay, fromDisplay, stepWeight, weightPrecision } from './units.js';
import { goalStatus, sortGoals, goalReps, cleanGoal, targetEstimate, GOAL_REPS_MIN, GOAL_REPS_MAX } from './goals.js';

/**
 * The Goals card at the top of the Records tab, and the sheet that adds or
 * edits one. A goal is a lift target — "bench 100 kg", "squat 140 kg × 3" —
 * tracked against logged sets (see goals.js for how "reached" and "progress"
 * are decided).
 */

/** "100 kg × 3", in the user's unit. */
export const goalLabel = (goal) => `${formatWeight(goal.targetKg)}${goalReps(goal)}`;

const shortDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Whole units only — "104.83 kg" would claim more precision than an estimate has. */
const wholeWeight = (kg) => `${formatNumber(Math.round(toDisplay(kg)))} ${getUnit()}`;

/**
 * One line saying where a goal stands. The card's says what's behind the
 * percentage — the heaviest set, and the estimated max the bar is measured by
 * (often from a lighter set done for more reps) — while the workout screen's
 * `short` one is just how far there is to go.
 */
export function goalProgressText(goal, status, { short = false } = {}) {
    if (status.reached) return `Reached ${shortDate(status.reached.date)} with ${formatWeight(status.reached.weightKg)} × ${status.reached.reps}`;
    if (!status.best) return short ? 'not logged yet' : 'Not logged yet — your first set starts the bar';
    // The estimate already says it's within reach, but it isn't done until the
    // set is logged — so say that, rather than a puzzling "99%".
    const ready = status.best.estimateKg >= targetEstimate(goal);
    const percent = ready ? 'ready to try it' : `${Math.round(status.progress * 100)}% there`;
    if (short) return percent;
    return `Heaviest ${formatWeight(status.heaviest.weightKg)} × ${status.heaviest.reps} · est. max ${wholeWeight(status.best.estimateKg)} · ${percent}`;
}

function goalRow(goal, status, onChanged) {
    const name = findExercise(goal.exerciseId)?.name ?? goal.exerciseName;
    const percent = Math.round(status.progress * 100);
    return el(
        'button',
        {
            class: `goal-row${status.reached ? ' reached' : ''}`,
            type: 'button',
            'aria-label': `${name}, goal ${goalLabel(goal)}, ${status.reached ? 'reached' : `${percent}% there`}. Edit`,
            onclick: () => openGoalSheet(goal, { onChanged }),
        },
        [
            el('span', { class: 'goal-row-top' }, [
                el('span', { class: 'goal-name', text: name }),
                el('span', { class: 'goal-target', text: status.reached ? `✓ ${goalLabel(goal)}` : goalLabel(goal) }),
            ]),
            el('span', { class: 'goal-meter', 'aria-hidden': 'true' }, [el('span', { class: 'goal-meter-fill', style: `width: ${percent}%` })]),
            el('span', { class: 'goal-sub', text: goalProgressText(goal, status) }),
        ],
    );
}

/** The card. `onChanged` redraws whatever it sits in after a goal is added, edited or removed. */
export function goalsCard({ onChanged }) {
    const goals = sortGoals(state.goals, state.workouts);
    const add = el('button', { class: 'link-btn', type: 'button', text: '+ Add goal', onclick: () => openGoalSheet(null, { onChanged }) });

    return el('div', { class: 'card goals-card' }, [
        el('div', { class: 'goals-head' }, [el('h2', { class: 'goals-title', text: 'Goals' }), goals.length ? add : null]),
        goals.length
            ? el('div', { class: 'goals-list' }, goals.map(({ goal, status }) => goalRow(goal, status, onChanged)))
            : el('div', { class: 'goals-empty' }, [
                  el('p', { class: 'goals-note', text: 'Pick a lift and a target — bench 100 kg, say — and watch your logged sets close the gap.' }),
                  el('button', { class: 'btn btn-outline btn-small', type: 'button', text: '+ Add a goal', onclick: () => openGoalSheet(null, { onChanged }) }),
              ]),
    ]);
}

// --- The sheet --------------------------------------------------------------------

/** A sensible starting target: the next round number above the best estimated max. */
function suggestedTargetDisplay(exerciseId) {
    const best = goalStatus({ exerciseId, targetKg: Infinity, reps: 1 }, state.workouts).best;
    if (!best) return null;
    const round = getUnit() === 'kg' ? 5 : 10;
    const now = toDisplay(best.estimateKg);
    const next = Math.ceil(now / round) * round;
    return next > now ? next : next + round;
}

export function openGoalSheet(goal, { onChanged } = {}) {
    const unit = getUnit();
    let exerciseId = goal?.exerciseId ?? null;
    let targetTouched = Boolean(goal);

    const exerciseButton = el('button', { class: 'form-input goal-exercise', type: 'button' });
    const bestLine = el('p', { class: 'hint goal-best' });

    const weightField = labelledStepper(`Target (${unit})`, {
        value: goal ? Number(formatNumber(toDisplay(goal.targetKg))) : 0,
        min: 0,
        max: 2000,
        decimals: true,
        precision: weightPrecision(unit),
        label: 'target weight',
        onStep: (base, direction) => stepWeight(base, direction, false, unit),
        onChange: () => {
            targetTouched = true;
        },
    });
    const repsField = labelledStepper('Reps', {
        value: goal?.reps ?? 1,
        min: GOAL_REPS_MIN,
        max: GOAL_REPS_MAX,
        label: 'reps',
    });

    const syncExercise = () => {
        const exercise = exerciseId ? findExercise(exerciseId) : null;
        exerciseButton.textContent = exercise?.name ?? goal?.exerciseName ?? 'Choose an exercise';
        exerciseButton.classList.toggle('placeholder', !exerciseId);
        const status = exerciseId ? goalStatus({ exerciseId, targetKg: Infinity, reps: 1 }, state.workouts) : null;
        bestLine.textContent = !exerciseId
            ? 'Reached when you log a set of at least this weight for this many reps.'
            : status.best
              ? `So far: heaviest ${formatWeight(status.heaviest.weightKg)} × ${status.heaviest.reps}, est. max ${wholeWeight(status.best.estimateKg)}. Reached when you log a set of at least the target for this many reps.`
              : 'Nothing logged on this yet. Reached when you log a set of at least the target for this many reps.';
    };

    exerciseButton.addEventListener('click', () =>
        openPicker({
            title: 'Goal for which lift?',
            onSelect: (id) => {
                exerciseId = id;
                // Offer a starting target until one has been typed or kept.
                if (!targetTouched) {
                    const suggestion = suggestedTargetDisplay(id);
                    if (suggestion) weightField.control.setValue(suggestion);
                }
                syncExercise();
                return false; // one pick, then the picker closes
            },
        }),
    );

    const save = async () => {
        const targetKg = fromDisplay(weightField.control.getValue());
        const cleaned = cleanGoal({
            id: goal?.id ?? uid(),
            exerciseId,
            exerciseName: findExercise(exerciseId)?.name ?? goal?.exerciseName ?? '',
            targetKg,
            reps: repsField.control.getValue(),
            createdAt: goal?.createdAt ?? new Date().toISOString(),
        });
        if (!exerciseId) {
            toast('Choose an exercise');
            return;
        }
        if (!cleaned) {
            toast('Set a target weight');
            return;
        }
        const next = goal ? state.goals.map((g) => (g.id === goal.id ? cleaned : g)) : [...state.goals, cleaned];
        await saveGoals(next);
        closeModal('goal-modal');
        toast(goal ? 'Goal updated' : `Goal set: ${goalLabel(cleaned)}`);
        onChanged?.();
    };

    const remove = async () => {
        const ok = await confirmSheet({
            title: 'Delete goal',
            message: `Remove the ${goalLabel(goal)} goal? Your logged sets stay as they are.`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        await saveGoals(state.goals.filter((g) => g.id !== goal.id));
        closeModal('goal-modal');
        toast('Goal deleted');
        onChanged?.();
    };

    syncExercise();
    $('#goal-modal-title').textContent = goal ? 'Edit goal' : 'New goal';
    clear($('#goal-body')).append(
        el('div', { class: 'goal-form' }, [
            el('div', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Exercise' }), exerciseButton]),
            el('div', { class: 'goal-form-row' }, [weightField, repsField]),
            bestLine,
            el('div', { class: 'modal-actions' }, [
                goal ? el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: remove }) : null,
                el('button', { class: 'btn btn-primary', type: 'button', text: goal ? 'Save' : 'Set goal', onclick: save }),
            ]),
        ]),
    );
    openModal('goal-modal');
}
