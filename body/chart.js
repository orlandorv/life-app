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

/**
 * Draws a daily bar chart from a `barChartLayout()` result: an optional shaded
 * band, faint gridlines with labelled values, a bar per recorded day and the
 * rolling average as a line over them. Same construction and theming as the
 * weight chart.
 */
export function barChart(layout, { width, height, formatTick, fromLabel, toLabel, description }) {
    const root = svg('svg', {
        viewBox: `0 0 ${width} ${height}`,
        class: 'body-chart',
        role: 'img',
        'aria-label': description,
    });

    if (layout.band) {
        root.append(svg('rect', { class: 'body-band', x: 0, y: layout.band.y, width, height: layout.band.h }));
    }

    layout.ticks.forEach((tick) => {
        root.append(svg('line', { class: 'body-grid', x1: 0, x2: width, y1: tick.y, y2: tick.y }));
        root.append(svg('text', { class: 'body-tick', x: 2, y: tick.y - 3 }, formatTick(tick.value)));
    });

    layout.bars.forEach((bar) => {
        root.append(svg('rect', { class: 'body-bar', x: bar.x.toFixed(1), y: bar.y.toFixed(1), width: bar.w.toFixed(1), height: bar.h.toFixed(1), rx: Math.min(2, bar.w / 2) }));
    });

    if (layout.line) root.append(svg('path', { class: 'body-avg', d: layout.line }));

    root.append(svg('text', { class: 'body-axis', x: 2, y: height - 3 }, fromLabel));
    root.append(svg('text', { class: 'body-axis', x: width - 2, y: height - 3, 'text-anchor': 'end' }, toLabel));

    return root;
}
