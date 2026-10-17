import { database } from './db.js';
import { state } from './store.js';
import { $, el, clear, toast } from '../../life/dom.js';
import { labelledStepper } from '../../life/stepper.js';
import { lifeDb } from '../../life/db.js';
import { localDayId } from '../../life/dates.js';
import { formatWeight, formatNumber, getUnit, toDisplay, fromDisplay, weightPrecision } from './units.js';
import { LEVELS } from './strength-standards.js';
import { computeStrengthMap, currentAge, exercisesFor, profileIsComplete } from './strength.js';
import { CENTRE_X, HEAD, OUTLINE_SIDE, VIEWS, VIEW_BOX } from './body-shapes.js';
import { findExercise } from './store.js';

/**
 * The muscle map at the top of the Records tab: a front and back figure with
 * each muscle shaded by how strong it is — your best lift for it, set against
 * standards for your bodyweight, age and sex (see strength.js).
 *
 * Colour is the six-step level scale from the --level-* tokens, one hue from
 * light to dark. It is never the only channel: the legend, the detail panel
 * and the list under the figures all say the level in words.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROFILE_KEY = 'strengthProfile';

// What's selected survives a redraw (a workout finishing, a unit toggle).
let selectedId = null;

const svgEl = (tag, attrs = {}, children = []) => {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    children.forEach((child) => node.append(child));
    return node;
};

// --- Drawing ----------------------------------------------------------------------

/** A closed Catmull-Rom curve through the points, as an SVG path. */
function smoothPath(points) {
    const n = points.length;
    const at = (i) => points[(i + n) % n];
    let d = `M ${at(0)[0]} ${at(0)[1]}`;
    for (let i = 0; i < n; i++) {
        const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0]} ${p2[1]}`;
    }
    return `${d} Z`;
}

const mirror = ([x, y]) => [2 * CENTRE_X - x, y];

/** The whole silhouette as one loop: down one side, back up the other. */
function outlinePath() {
    const left = OUTLINE_SIDE.map(mirror).reverse();
    return smoothPath([...OUTLINE_SIDE, ...left]);
}

/** One muscle: its `side` shape on both halves, plus any `centre` shape once. */
function regionShapes(shape) {
    const paths = [];
    if (shape.centre) paths.push(svgEl('path', { d: smoothPath(shape.centre) }));
    if (shape.side) {
        paths.push(svgEl('path', { d: smoothPath(shape.side) }));
        paths.push(svgEl('path', { d: smoothPath(shape.side.map(mirror)) }));
    }
    return paths;
}

/** Whole units only: an estimate has no business claiming "142.32 kg". */
const wholeWeight = (kg) => `${formatNumber(Math.round(toDisplay(kg)))} ${getUnit()}`;

const levelName = (result) => (result.level === null ? 'No data yet' : LEVELS[result.level]);

function buildFigure(view, regions) {
    const svg = svgEl('svg', {
        class: 'map-svg',
        viewBox: `0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`,
        role: 'group',
        'aria-label': `${view.label} view of the body, muscles shaded by strength`,
    });

    svg.append(
        svgEl('path', { class: 'map-body', d: outlinePath() }),
        svgEl('circle', { class: 'map-body', cx: HEAD.cx, cy: HEAD.cy, r: HEAD.r }),
    );

    Object.entries(view.regions).forEach(([id, shape]) => {
        const result = regions.get(id);
        const group = svgEl(
            'g',
            {
                class: `map-region${id === selectedId ? ' selected' : ''}`,
                'data-region': id,
                'data-level': result.level === null ? 'none' : String(result.level),
                role: 'button',
                tabindex: '0',
                'aria-label': `${result.label}: ${levelName(result)}`,
                'aria-pressed': String(id === selectedId),
            },
            [svgEl('title', {}, []), ...regionShapes(shape)],
        );
        group.querySelector('title').textContent = `${result.label} — ${levelName(result)}`;
        svg.append(group);
    });

    return svg;
}

// --- Profile --------------------------------------------------------------------------

async function latestBodyWeight() {
    await lifeDb.init();
    const entries = await lifeDb.getAll('bodyEntries');
    const logged = entries.filter((entry) => entry.weightKg > 0).sort((a, b) => b.day.localeCompare(a.day));
    return logged.length ? { kg: logged[0].weightKg, day: logged[0].day } : null;
}

const loadProfile = () => database.getSetting(PROFILE_KEY, null);

function profileForm({ profile, bodyWeight, onSaved, onCancel }) {
    const unit = getUnit();
    let sex = profile?.sex ?? null;

    const ageField = labelledStepper('Age', { value: profile ? currentAge(profile) : 30, min: 14, max: 90, label: 'age' });

    const maleBtn = el('button', { type: 'button', text: 'Men’s' });
    const femaleBtn = el('button', { type: 'button', text: 'Women’s' });
    const syncSex = () => {
        maleBtn.classList.toggle('active', sex === 'male');
        femaleBtn.classList.toggle('active', sex === 'female');
    };
    maleBtn.addEventListener('click', () => { sex = 'male'; syncSex(); });
    femaleBtn.addEventListener('click', () => { sex = 'female'; syncSex(); });
    syncSex();

    // Bodyweight comes from Body when there's a reading; typed in only if not.
    let weightField = null;
    if (!bodyWeight) {
        weightField = labelledStepper(`Bodyweight (${unit})`, {
            value: profile?.weightKg ? Math.round(toDisplay(profile.weightKg) * 10) / 10 : unit === 'kg' ? 75 : 165,
            min: 30,
            max: 400,
            decimals: true,
            precision: weightPrecision(unit),
            label: 'bodyweight',
        });
    }

    const save = el('button', {
        class: 'btn btn-primary',
        type: 'button',
        text: 'Save',
        onclick: async () => {
            if (!sex) {
                toast('Choose which standards to compare against');
                return;
            }
            const age = Math.round(ageField.control.getValue());
            const next = { age, ageOn: localDayId(), sex };
            if (weightField) next.weightKg = fromDisplay(weightField.control.getValue());
            else if (profile?.weightKg) next.weightKg = profile.weightKg;
            await database.setSetting(PROFILE_KEY, next);
            onSaved();
        },
    });

    return el('div', { class: 'strength-form' }, [
        ageField,
        el('div', { class: 'stepper-field' }, [
            el('span', { class: 'stepper-label', text: 'Compare me with' }),
            el('div', { class: 'segmented segmented-fill' }, [maleBtn, femaleBtn]),
        ]),
        weightField ??
            el('div', { class: 'strength-note' }, [
                `Bodyweight: ${formatWeight(bodyWeight.kg)}, from your latest weigh-in in Body.`,
            ]),
        el('div', { class: 'strength-form-actions' }, [
            onCancel ? el('button', { class: 'btn btn-outline', type: 'button', text: 'Cancel', onclick: onCancel }) : null,
            save,
        ]),
    ]);
}

// --- Detail panel and list ---------------------------------------------------------

const dateLabel = (day) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function detailPanel(result, person) {
    const name = levelName(result);
    const head = el('div', { class: 'strength-detail-head' }, [
        el('span', { class: 'level-swatch', dataset: { level: result.level === null ? 'none' : String(result.level) } }),
        el('div', {}, [
            el('div', { class: 'strength-detail-title', text: result.label }),
            el('div', { class: 'strength-detail-level', text: name }),
        ]),
    ]);

    if (result.level === null) {
        const names = exercisesFor(result.id)
            .map((id) => findExercise(id)?.name)
            .filter(Boolean)
            .slice(0, 4);
        return el('div', { class: 'strength-detail' }, [
            head,
            el('p', {
                class: 'strength-note',
                text: names.length
                    ? `Nothing logged counts yet. Finish a workout with ${names.join(', ')} to light this up.`
                    : 'Nothing logged counts yet.',
            }),
        ]);
    }

    const best = result.best;
    const source = best.bodyweight
        ? `${formatWeight(best.weightKg)} added × ${best.reps}`
        : `${formatWeight(best.weightKg)} × ${best.reps}`;

    const lines = [
        el('p', { class: 'strength-detail-line' }, [
            el('strong', { text: best.exerciseName }),
            ` — est. max ${best.bodyweight ? '+' : ''}${wholeWeight(Math.max(0, best.estimateKg))}`,
            el('span', { class: 'strength-muted', text: ` (from ${source}${best.rir ? ` @ ${best.rir} RIR` : ''})` }),
        ]),
    ];

    if (result.next) {
        lines.push(
            el('div', { class: 'strength-meter', role: 'img', 'aria-label': `${Math.round(result.progress * 100)}% of the way to ${LEVELS[result.next.level]}` }, [
                el('div', { class: 'strength-meter-fill', style: `width: ${Math.round(result.progress * 100)}%` }),
            ]),
            el('p', { class: 'strength-detail-line' }, [
                `${Math.round(result.progress * 100)}% of the way to `,
                el('strong', { text: LEVELS[result.next.level] }),
                `, which is about ${best.bodyweight ? '+' : ''}${wholeWeight(result.next.kg)} est. max on this lift for you.`,
            ]),
        );
    } else {
        lines.push(el('p', { class: 'strength-detail-line', text: 'Top of the scale for this muscle.' }));
    }

    return el('div', { class: 'strength-detail' }, [head, ...lines]);
}

function legend() {
    const items = LEVELS.map((name, level) =>
        el('li', {}, [el('span', { class: 'level-swatch', dataset: { level: String(level) } }), name]),
    );
    items.push(el('li', {}, [el('span', { class: 'level-swatch', dataset: { level: 'none' } }), 'No data']));
    return el('ul', { class: 'strength-legend', 'aria-label': 'Strength levels' }, items);
}

function summaryLine(regions) {
    const scored = [...regions.values()].filter((r) => r.level !== null).sort((a, b) => b.level + b.progress - (a.level + a.progress));
    if (scored.length < 2) return null;
    const top = scored[0];
    const bottom = scored[scored.length - 1];
    if (top.level === bottom.level && Math.abs(top.progress - bottom.progress) < 0.05) return null;
    return el('p', { class: 'strength-summary' }, [
        'Strongest ',
        el('strong', { text: `${top.label} (${LEVELS[top.level]})` }),
        ' · Weakest ',
        el('strong', { text: `${bottom.label} (${LEVELS[bottom.level]})` }),
    ]);
}

function muscleList(regions, select) {
    const rows = [...regions.values()].map((result) =>
        el(
            'button',
            { class: `strength-row${result.id === selectedId ? ' selected' : ''}`, type: 'button', dataset: { region: result.id }, onclick: () => select(result.id) },
            [
                el('span', { class: 'level-swatch', dataset: { level: result.level === null ? 'none' : String(result.level) } }),
                el('span', { class: 'strength-row-name', text: result.label }),
                el('span', { class: 'strength-row-level', text: levelName(result) }),
            ],
        ),
    );
    return el('div', { class: 'strength-list' }, rows);
}

// --- The card -------------------------------------------------------------------------

async function draw(host) {
    const [profile, bodyWeight] = await Promise.all([loadProfile(), latestBodyWeight()]);
    if (!host.isConnected) return; // the tab was redrawn while this was loading

    const bodyKg = bodyWeight?.kg ?? profile?.weightKg ?? null;
    const ready = profileIsComplete(profile) && bodyKg > 0;

    const card = el('div', { class: 'card strength-card' });
    clear(host).append(card);

    const redraw = () => draw(host);
    const header = (action) =>
        el('div', { class: 'strength-head' }, [
            el('h2', { class: 'strength-title', text: 'Strength map' }),
            action,
        ]);

    if (!ready) {
        card.append(
            header(null),
            el('p', {
                class: 'strength-note',
                text: 'See which muscles are strong and which are lagging. Tell me a little about you and each one is shaded by how your best lift compares with typical standards for your bodyweight and age.',
            }),
            profileForm({ profile, bodyWeight, onSaved: redraw }),
        );
        return;
    }

    const { regions, person } = computeStrengthMap({ workouts: state.workouts, profile, bodyKg });

    const detail = el('div', { class: 'strength-detail-slot', 'aria-live': 'polite' });
    const select = (id) => {
        selectedId = id === selectedId ? null : id;
        // Repaint selection in place; redrawing would drop focus and scroll.
        card.querySelectorAll('[data-region]').forEach((node) => {
            const on = node.dataset.region === selectedId;
            node.classList.toggle('selected', on);
            if (node.getAttribute('role') === 'button') node.setAttribute('aria-pressed', String(on));
        });
        showDetail();
    };
    const showDetail = () => {
        clear(detail);
        detail.append(
            selectedId
                ? detailPanel(regions.get(selectedId), person)
                : el('p', { class: 'strength-hint', text: 'Tap a muscle to see your best lift for it and what’s next.' }),
        );
    };

    const figures = el(
        'div',
        { class: 'strength-figures' },
        VIEWS.map((view) => {
            const svg = buildFigure(view, regions);
            svg.addEventListener('click', (event) => {
                const region = event.target.closest('.map-region');
                if (region) select(region.dataset.region);
            });
            svg.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const region = event.target.closest('.map-region');
                if (!region) return;
                event.preventDefault();
                select(region.dataset.region);
            });
            return el('figure', { class: 'strength-figure' }, [svg, el('figcaption', { text: view.label })]);
        }),
    );

    const editing = el('div', { class: 'strength-edit', hidden: true });
    const aboutLink = el('button', {
        class: 'link-btn',
        type: 'button',
        text: 'About you',
        onclick: () => {
            editing.hidden = !editing.hidden;
            if (!editing.hidden && !editing.firstChild) {
                editing.append(profileForm({ profile, bodyWeight, onSaved: redraw, onCancel: () => { editing.hidden = true; } }));
            }
        },
    });

    const who = `${person.sex === 'female' ? 'Women’s' : 'Men’s'} standards · age ${person.ageYears} · ${formatWeight(bodyKg)}${
        bodyWeight ? ` (Body, ${dateLabel(bodyWeight.day)})` : ''
    }`;

    card.append(
        header(aboutLink),
        el('p', { class: 'strength-sub', text: who }),
        editing,
        summaryLine(regions),
        figures,
        legend(),
        detail,
        muscleList(regions, select),
        el('p', {
            class: 'strength-footnote',
            text: 'A guide, not a measurement: estimated maxes from your logged sets, set against rounded rule-of-thumb standards. Dumbbell lifts are read as the weight of one dumbbell; custom exercises and assisted pull-ups aren’t counted.',
        }),
    );
    showDetail();
}

/** Fills `host` with the muscle map. Safe to call again whenever the data changes. */
export function renderStrengthMap(host) {
    return draw(host);
}
