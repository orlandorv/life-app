const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An SVG element, built with createElementNS and set only through attributes and
 * textContent (never innerHTML). Shared by every hand-built chart in the app.
 */
export function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * The region under a line chart's path (an "M x y L x y …" string), closed down
 * to `baseY`: the soft fill the app draws under a trend so a line reads as a
 * shape, in the same colour as the line. Null for a path with fewer than two
 * points. Pure, so it is checked in Node.
 */
export function areaUnder(line, baseY) {
    const points = [...String(line ?? '').matchAll(/[ML]\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)/g)];
    if (points.length < 2) return null;
    const firstX = points[0][1];
    const lastX = points[points.length - 1][1];
    return `${line} L${lastX} ${baseY} L${firstX} ${baseY} Z`;
}
