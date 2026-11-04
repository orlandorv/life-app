const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * Draws a lift's chart from a `liftChartLayout()` result: faint gridlines with
 * labelled values, a line through the sessions, a dot on each, and a ring on the
 * ones that set a new best. Built with createElementNS (never innerHTML) and
 * coloured by classes in gym.css, so it follows light and dark mode.
 */
export function liftChart(layout, { width, height, formatTick, fromLabel, toLabel, description }) {
    const root = svg('svg', {
        viewBox: `0 0 ${width} ${height}`,
        class: 'lift-chart',
        role: 'img',
        'aria-label': description,
    });

    layout.ticks.forEach((tick) => {
        root.append(svg('line', { class: 'lift-grid', x1: 0, x2: width, y1: tick.y, y2: tick.y }));
        root.append(svg('text', { class: 'lift-tick', x: 2, y: tick.y - 3 }, formatTick(tick.value)));
    });

    root.append(svg('path', { class: 'lift-line', d: layout.line }));

    layout.dots.forEach((dot) => {
        if (dot.isBest) root.append(svg('circle', { class: 'lift-best-ring', cx: dot.x, cy: dot.y, r: 6.5 }));
        root.append(svg('circle', { class: `lift-dot${dot.isBest ? ' best' : ''}`, cx: dot.x, cy: dot.y, r: dot.isBest ? 3.4 : 2.8 }));
    });

    root.append(svg('text', { class: 'lift-axis', x: 2, y: height - 3 }, fromLabel));
    root.append(svg('text', { class: 'lift-axis', x: width - 2, y: height - 3, 'text-anchor': 'end' }, toLabel));

    return root;
}
