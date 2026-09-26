const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * Draws the weight chart from a `chartLayout()` result: faint gridlines with
 * labelled values, each reading as a dot, and the smoothed trend as a line
 * through them. Built with createElementNS (never innerHTML) and coloured by
 * classes in body.css, so it follows light and dark mode.
 */
export function weightChart(layout, { width, height, formatTick, fromLabel, toLabel, description }) {
    const root = svg('svg', {
        viewBox: `0 0 ${width} ${height}`,
        class: 'body-chart',
        role: 'img',
        'aria-label': description,
    });

    layout.ticks.forEach((tick) => {
        root.append(svg('line', { class: 'body-grid', x1: 0, x2: width, y1: tick.y, y2: tick.y }));
        root.append(svg('text', { class: 'body-tick', x: 2, y: tick.y - 3 }, formatTick(tick.kg)));
    });

    layout.dots.forEach((dot) => {
        root.append(svg('circle', { class: 'body-dot', cx: dot.x, cy: dot.y, r: 2.6 }));
    });

    root.append(svg('path', { class: 'body-trend', d: layout.line }));

    root.append(svg('text', { class: 'body-axis', x: 2, y: height - 3 }, fromLabel));
    root.append(svg('text', { class: 'body-axis', x: width - 2, y: height - 3, 'text-anchor': 'end' }, toLabel));

    return root;
}
