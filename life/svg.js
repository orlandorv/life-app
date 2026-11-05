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
