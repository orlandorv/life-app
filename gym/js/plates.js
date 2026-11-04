import { database } from './db.js';
import { $, el, clear, openModal } from '../../life/dom.js';
import { stepper } from '../../life/stepper.js';
import { getUnit, toDisplay, fromDisplay, stepWeight, weightPrecision, formatNumber } from './units.js';
import { PLATE_SIZES, DEFAULT_BAR, platesPerSide } from './plate-math.js';

/**
 * The plate calculator: what to hang on each side of the bar to hit a target
 * weight. The maths (plate sizes, `platesPerSide`) lives in plate-math.js, in
 * display units — see the note there.
 */

let barWeights = { ...DEFAULT_BAR };

export async function loadBarWeights() {
    const saved = await database.getSetting('barWeights', null);
    barWeights = { ...DEFAULT_BAR, ...(saved || {}) };
}

function renderResult(container, target, bar, unit) {
    clear(container);
    const result = platesPerSide(target, bar, unit);

    if (result.belowBar) {
        container.append(el('p', { class: 'hint', text: `That's lighter than the bar on its own (${formatNumber(bar)} ${unit}).` }));
        return;
    }

    if (!result.plates.length) {
        container.append(el('p', { class: 'plate-empty', text: 'Just the bar — no plates.' }));
        return;
    }

    // One chip per physical plate, biggest first: it reads as the order you'd
    // actually slide them on, rather than something to mentally unpack.
    const chips = [];
    result.plates.forEach(({ size, count }) => {
        for (let i = 0; i < count; i += 1) {
            chips.push(el('span', { class: 'plate-chip', text: formatNumber(size) }));
        }
    });

    container.append(
        el('div', { class: 'plate-side-label', text: 'Per side' }),
        el('div', { class: 'plate-chips' }, chips),
    );

    if (result.exact) {
        container.append(
            el('div', {
                class: 'plate-total',
                text: `${formatNumber(bar)} bar + ${formatNumber((result.loaded - bar) / 2)} per side = ${formatNumber(result.loaded)} ${unit}`,
            }),
        );
    } else {
        container.append(
            el('div', {
                class: 'plate-total plate-short',
                text: `Closest is ${formatNumber(result.loaded)} ${unit} — ${formatNumber(target - result.loaded)} ${unit} short of ${formatNumber(target)}.`,
            }),
        );
    }
}

export function openPlateCalculator(startWeightKg = 0) {
    const unit = getUnit();
    const body = clear($('#plate-body'));

    let target = toDisplay(startWeightKg, unit);
    let bar = barWeights[unit] ?? DEFAULT_BAR[unit];

    const result = el('div', { class: 'plate-result' });
    const refresh = () => renderResult(result, target, bar, unit);

    const targetStepper = stepper({
        value: target,
        min: 0,
        max: 2000,
        label: 'target weight',
        decimals: true,
        precision: weightPrecision(unit),
        onStep: (base, direction) => stepWeight(base, direction, false, unit),
        onChange: (value) => { target = value; refresh(); },
    });

    const barStepper = stepper({
        value: bar,
        min: 0,
        max: 60,
        label: 'bar weight',
        decimals: true,
        precision: weightPrecision(unit),
        onStep: (base, direction) => stepWeight(base, direction, true, unit),
        onChange: (value) => {
            bar = value;
            refresh();
            // Whatever bar you're on is almost certainly the one you'll be on
            // next time, so it sticks without a save step.
            barWeights = { ...barWeights, [unit]: value };
            database.setSetting('barWeights', barWeights);
        },
    });

    const field = (labelText, control) =>
        el('div', { class: 'stepper-field' }, [
            el('span', { class: 'stepper-label', text: labelText }),
            control,
        ]);

    body.append(
        el('div', { class: 'stepper-grid' }, [
            field(`Target (${unit})`, targetStepper),
            field(`Bar (${unit})`, barStepper),
        ]),
        result,
        el('p', {
            class: 'hint footnote',
            text: `Assumes a standard rack: ${PLATE_SIZES[unit].map(formatNumber).join(', ')} ${unit}.`,
        }),
    );

    refresh();
    openModal('plate-modal');
}
