/**
 * Line icons for Life, drawn on a 24×24 grid with one stroke weight so they
 * read as a set. Each is a list of SVG path `d` strings; `icon()` builds the
 * element with createElementNS (never innerHTML) and colours it with
 * currentColor, so it takes the colour of whatever it sits in.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export const ICONS = {
    // Sections
    gym: ['M6 7.5h2.5v9H6z', 'M15.5 7.5H18v9h-2.5z', 'M3.5 10v4', 'M20.5 10v4', 'M8.5 12h7'],
    nutrition: ['M4 11h16a8 8 0 0 1-16 0Z', 'M12 7c0-2 1.5-3.5 3.5-3.5', 'M9 7.5c0-1.4.6-2.5 1.6-3.2', 'M9 21h6'],
    habits: ['M12 3.5a8.5 8.5 0 1 0 8.5 8.5', 'M8.5 11.5l3 3 8-8.5'],
    body: [
        'M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3Z',
        'M5.2 12.5h3.3l1.6-2.6 2.4 4.8 1.6-2.2h4.7',
    ],

    // Chrome
    settings: ['M4 7h10', 'M18 7h2', 'M4 17h4', 'M12 17h8', 'M16 5v4', 'M10 15v4'],
    back: ['M14.5 5.5 8 12l6.5 6.5'],
    chevron: ['M9.5 5.5 16 12l-6.5 6.5'],
    plus: ['M12 5v14', 'M5 12h14'],
    check: ['M5.5 12.5l4 4 9-9.5'],
    up: ['M6.5 14.5 12 9l5.5 5.5'],
    down: ['M6.5 9.5 12 15l5.5-5.5'],
    close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
    search: ['M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'M20 20l-4.5-4.5'],
    barcode: ['M3.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2', 'M17 3.5h2A1.5 1.5 0 0 1 20.5 5v2', 'M20.5 17v2a1.5 1.5 0 0 1-1.5 1.5h-2', 'M7 20.5H5A1.5 1.5 0 0 1 3.5 19v-2', 'M7.5 8v8', 'M10.5 8v8', 'M13 8v8', 'M16.5 8v8'],
    copy: ['M9 9h9.5a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 19V9.5', 'M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5'],
    list: ['M9 6.5h11', 'M9 12h11', 'M9 17.5h11', 'M4.5 6.5h.01', 'M4.5 12h.01', 'M4.5 17.5h.01'],

    // Detail
    flame: ['M12 21c-3.6 0-6.5-2.6-6.5-6.2 0-2.3 1.1-4 2.3-5.3.2 1.5 1 2.6 2.1 3.1-.6-3.3 1-6.5 4.1-8.6.4 3.2 4.5 5.4 4.5 10.8 0 3.6-2.9 6.2-6.5 6.2Z', 'M12 21c-1.5 0-2.6-1.1-2.6-2.6 0-1.5 1.2-2.4 2.6-3.8 1.4 1.4 2.6 2.3 2.6 3.8 0 1.5-1.1 2.6-2.6 2.6Z'],
    moon: ['M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z'],
    steps: [
        'M8 3.5c1.7 0 2.7 1.8 2.7 4.3S9.6 12 8 12s-2.7-1.7-2.7-4.2S6.3 3.5 8 3.5Z',
        'M6 14.5h4v2a2 2 0 0 1-4 0v-2Z',
        'M16 8c1.7 0 2.7 1.8 2.7 4.3S17.6 16.5 16 16.5s-2.7-1.7-2.7-4.2S14.3 8 16 8Z',
        'M14 19h4v.5a2 2 0 0 1-4 0V19Z',
    ],
    scale: ['M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z', 'M8.5 10a3.5 3.5 0 0 1 7 0', 'M12 10l1.3-1.8'],
    library: ['M5 4.5h3.5v15H5z', 'M10.5 4.5H14v15h-3.5z', 'M16 5.5l3.2-.8 3 14.3-3.2.8z'],
    history: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
    trophy: ['M8 4.5h8v5a4 4 0 0 1-8 0v-5Z', 'M8 6.5H5v1.5a3 3 0 0 0 3 3', 'M16 6.5h3v1.5a3 3 0 0 1-3 3', 'M12 13.5v3.5', 'M8.5 20h7', 'M9.5 17h5v3h-5z'],
    level: ['M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z'],
    shield: ['M12 3.5 19 6v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6l7-2.5Z', 'M9 12l2.2 2.2L15.5 10'],
};

/** An inline SVG icon. `size` is in px; stroke scales with it. */
export function icon(name, { size = 22, className = '', label = null } = {}) {
    const root = document.createElementNS(SVG_NS, 'svg');
    root.setAttribute('viewBox', '0 0 24 24');
    root.setAttribute('width', String(size));
    root.setAttribute('height', String(size));
    root.setAttribute('fill', 'none');
    root.setAttribute('stroke', 'currentColor');
    root.setAttribute('stroke-width', '1.8');
    root.setAttribute('stroke-linecap', 'round');
    root.setAttribute('stroke-linejoin', 'round');
    root.setAttribute('class', `life-icon${className ? ` ${className}` : ''}`);
    if (label) {
        root.setAttribute('role', 'img');
        root.setAttribute('aria-label', label);
    } else {
        root.setAttribute('aria-hidden', 'true');
    }

    for (const d of ICONS[name] ?? []) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        root.append(path);
    }
    return root;
}

/**
 * Swaps every `<span data-icon="name">` in static markup for its SVG, so
 * index.html can place icons without repeating path data.
 */
export function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((slot) => {
        const size = Number(slot.dataset.iconSize) || 22;
        slot.replaceChildren(icon(slot.dataset.icon, { size }));
    });
}
