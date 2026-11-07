/**
 * The Day Dial's geometry and the words around it. Pure (no DOM), so the
 * maths is checked in Node: angles, arcs, how a ring is split between goals,
 * which part of the day it is, and the one line under the greeting.
 *
 * Angles are degrees clockwise from the top (12 o'clock). The dial's rim is a
 * 24-hour clock with **noon at the top and midnight at the bottom**, so the sun
 * climbs the left side in the morning and sets down the right in the evening.
 */

/** A point `r` from the centre at `deg` degrees clockwise from the top. */
export function polar(cx, cy, r, deg) {
    const radians = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(radians), cy + r * Math.sin(radians)];
}

const fixed = (n) => Math.round(n * 100) / 100;

/**
 * An SVG path for the arc from `from` to `to` degrees (clockwise). A full turn
 * can't be one arc command (its ends coincide), so it stops a hair short; at
 * the stroke widths used that is invisible.
 */
export function arcPath(cx, cy, r, from, to) {
    const end = to - from >= 360 ? from + 359.99 : to;
    const [x1, y1] = polar(cx, cy, r, from);
    const [x2, y2] = polar(cx, cy, r, end);
    const large = end - from > 180 ? 1 : 0;
    return `M${fixed(x1)} ${fixed(y1)} A${r} ${r} 0 ${large} 1 ${fixed(x2)} ${fixed(y2)}`;
}

/**
 * A ring split between parts in proportion to `weights`, with `gap` degrees
 * between neighbours (half a gap trimmed from each end of every part). One part
 * is the whole ring with no gap. Returns `[{ from, to }]` in order, clockwise
 * from `start`.
 */
export function segments(weights, { gap = 7, start = 0 } = {}) {
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (!weights.length || !(total > 0)) return [];
    if (weights.length === 1) return [{ from: start, to: start + 360 }];
    let at = start;
    return weights.map((w) => {
        const span = (w / total) * 360;
        const part = { from: at + gap / 2, to: at + span - gap / 2 };
        at += span;
        return part;
    });
}

/** Where an hour of the day (0–24, fractions allowed) sits on the rim: noon at the top. */
export const hourAngle = (hours) => ((((hours / 24) * 360 + 180) % 360) + 360) % 360;

/** The part of the day: it sets the light behind Today and the greeting. */
export function daypart(hour) {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

/** "Good morning", with the part of the day as its own word so it can be set in italic. */
export const greetingFor = (part) => ({ lead: 'Good', word: part });

/**
 * One quiet line under the greeting, read from the day so far. It encourages and
 * never scolds: an empty evening is "still time", never "you missed". `day` is a
 * scored day (game-rules.js `scoreDay`), or null when no goals are on.
 */
export function dayLine(part, day) {
    if (!day) return part === 'night' ? 'Rest well.' : 'A fresh day.';
    if (!day.applies) return 'Nothing is due today. Enjoy it.';
    if (day.good) return day.base >= 100 ? 'Every ring closed. A full day.' : 'A good day, sealed.';
    if (day.base === 0) {
        if (part === 'morning') return 'A fresh day. Start anywhere.';
        if (part === 'night') return 'Rest well. Tomorrow is a fresh ring.';
        return 'Still time for one thing.';
    }
    if (part === 'night') return 'Rest well. Tomorrow is a fresh ring.';
    return 'On your way. Keep going.';
}
