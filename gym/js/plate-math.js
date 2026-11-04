/**
 * What a barbell can be loaded to, and what goes on it. Pure (no DOM, storage or
 * settings), so it is checked in Node and shared by the plate calculator and the
 * progression suggestion.
 *
 * All of this works in *display* units rather than the app's usual kg — you
 * load 20 kg plates on a 20 kg bar, or 45 lb plates on a 45 lb bar, and
 * converting between them would invent plate sizes that don't exist in the
 * rack. The caller converts to and from kg at the edge.
 */

export const PLATE_SIZES = {
    kg: [25, 20, 15, 10, 5, 2.5, 1.25],
    lb: [45, 35, 25, 10, 5, 2.5],
};

export const DEFAULT_BAR = { kg: 20, lb: 45 };

// Plate maths lands on values like 12.499999999999998; every comparison here
// is fuzzed rather than exact so a clean 12.5 doesn't get reported as short.
const EPSILON = 1e-6;

/**
 * Greedy largest-first, which is optimal for the standard doubling-ish plate
 * sets above. Returns the plates for ONE side, plus what that actually
 * loads to — the target isn't always reachable (a 61 kg target on a 20 kg
 * bar leaves 0.5 kg per side that no plate covers).
 */
export function platesPerSide(target, bar, unit) {
    const perSide = (target - bar) / 2;
    if (perSide < -EPSILON) return { belowBar: true, plates: [], loaded: bar, exact: false };

    const plates = [];
    let remaining = perSide;

    for (const size of PLATE_SIZES[unit]) {
        const count = Math.floor((remaining + EPSILON) / size);
        if (count > 0) {
            plates.push({ size, count });
            remaining -= count * size;
        }
    }

    return {
        belowBar: false,
        plates,
        loaded: target - remaining * 2,
        exact: remaining < EPSILON,
    };
}

/**
 * The smallest jump a loaded bar can make: a pair of the smallest plates, one
 * on each side (2.5 kg, or 5 lb). Every plate is a whole multiple of the
 * smallest, so every bar-plus-a-multiple-of-this weight can be built.
 */
export function loadableStep(unit) {
    return 2 * Math.min(...PLATE_SIZES[unit]);
}

/**
 * `target` moved to the nearest weight the plates can actually build on this
 * bar (or the next one `'down'` or `'up'`), in display units. Never below the
 * bar itself.
 */
export function roundToLoadable(target, bar, unit, direction = 'nearest') {
    const step = loadableStep(unit);
    const steps = (target - bar) / step;
    const whole =
        direction === 'down' ? Math.floor(steps + EPSILON) : direction === 'up' ? Math.ceil(steps - EPSILON) : Math.round(steps);
    const loaded = bar + Math.max(0, whole) * step;
    // Back to a clean number: bar + whole * 1.25 style sums can carry float noise.
    return Math.round(loaded * 1e6) / 1e6;
}
