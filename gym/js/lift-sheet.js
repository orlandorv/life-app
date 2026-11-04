import { state } from './store.js';
import { $, el, clear, openModal } from '../../life/dom.js';
import { localDayId } from '../../life/dates.js';
import { getUnit, toDisplay, formatNumber } from './units.js';
import { liftSessions, metricPoints, pointsInRange, liftChartLayout, liftStats, METRICS, RANGES } from './lift-history.js';
import { liftChart } from './lift-chart.js';

/**
 * One lift's history, opened from its card on the PRs tab: a chart over time
 * (top weight, estimated one-rep max, or volume; the last 3 months, a year, or
 * everything), a few plain facts, and the recent sessions. The numbers come from
 * `lift-history.js`; this is only layout and wording.
 */

const CHART = { width: 360, height: 170 };

const NB = ' ';
const oneDecimal = (kg) => formatNumber(Math.round(toDisplay(kg) * 10) / 10);
const whole = (kg) => Math.round(toDisplay(kg)).toLocaleString();
const weight = (kg) => `${oneDecimal(kg)}${NB}${getUnit()}`;
const dayLabel = (dayId, withYear = false) => {
    const [year, month, day] = dayId.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
};

/** A row of exclusive buttons, in the shared `.segmented` style. */
function segmented(options, current, onPick, label) {
    const buttons = Object.entries(options).map(([key, option]) =>
        el('button', {
            type: 'button',
            class: key === current ? 'active' : '',
            'aria-pressed': String(key === current),
            disabled: option.disabled,
            text: option.label,
            onclick: () => {
                buttons.forEach((button) => {
                    const on = button.dataset.key === key;
                    button.classList.toggle('active', on);
                    button.setAttribute('aria-pressed', String(on));
                });
                onPick(key);
            },
            dataset: { key },
        }),
    );
    return el('div', { class: 'segmented lift-segmented', role: 'group', 'aria-label': label }, buttons);
}

function stat(label, value) {
    return el('div', { class: 'lift-stat' }, [
        el('span', { class: 'lift-stat-label', text: label }),
        el('span', { class: 'lift-stat-value', text: value }),
    ]);
}

export function openLiftSheet(exerciseId, exerciseName) {
    const sessions = liftSessions(state.workouts, exerciseId);
    const stats = liftStats(sessions);
    const today = localDayId();

    // The estimate is the better reading of strength when there is one to draw;
    // a high-rep lift has none, and starts on top weight instead.
    const canDraw = (metric) => metricPoints(sessions, metric).length >= 2;
    let metric = canDraw('e1rm') ? 'e1rm' : 'top';
    let range = 'all';

    $('#lift-modal-title').textContent = exerciseName;
    const body = clear($('#lift-body'));

    if (!stats) {
        body.append(el('p', { class: 'hint', text: 'No logged sets for this lift yet.' }));
        openModal('lift-modal');
        return;
    }

    const chartHost = el('div', { class: 'lift-chart-host' });

    const formatValue = (value) => (metric === 'volume' ? `${whole(value)}${NB}${getUnit()}` : metric === 'e1rm' ? `${whole(value)}${NB}${getUnit()}` : weight(value));

    const paintChart = () => {
        const points = pointsInRange(metricPoints(sessions, metric), range, today);
        const layout = liftChartLayout(points, CHART);
        clear(chartHost);

        if (!layout) {
            chartHost.append(el('p', { class: 'hint lift-chart-empty', text: 'Not enough sessions in this range to draw a line.' }));
            return;
        }

        const first = points[0];
        const last = points[points.length - 1];
        const bests = points.filter((point) => point.isBest).length;
        chartHost.append(
            liftChart(layout, {
                ...CHART,
                formatTick: (value) => (metric === 'top' ? oneDecimal(value) : whole(value)),
                fromLabel: dayLabel(layout.from),
                toLabel: dayLabel(layout.to),
                description:
                    `${METRICS[metric].label} for ${exerciseName}: ${points.length} sessions, from ${formatValue(first.value)} on ${dayLabel(first.day, true)} ` +
                    `to ${formatValue(last.value)} on ${dayLabel(last.day, true)}${bests ? `, with ${bests} new best${bests > 1 ? 's' : ''}` : ''}.`,
            }),
        );
        chartHost.append(
            el('p', {
                class: 'lift-chart-note',
                text: bests ? `Rings mark a new best (${bests}).` : 'No new best in this range.',
            }),
        );
    };

    const metrics = Object.fromEntries(Object.entries(METRICS).map(([key, { label }]) => [key, { label, disabled: !canDraw(key) }]));

    body.append(
        el('div', { class: 'lift-controls' }, [
            segmented(metrics, metric, (key) => { metric = key; paintChart(); }, 'Show'),
            segmented(RANGES, range, (key) => { range = key; paintChart(); }, 'Time range'),
        ]),
        chartHost,
        el('div', { class: 'lift-stats' }, [
            stat('Sessions', String(stats.sessions)),
            stat('Best set', `${weight(stats.bestKg)} × ${stats.bestReps}`),
            stat('Est. 1RM', stats.e1rmKg === null ? '—' : `${whole(stats.e1rmKg)}${NB}${getUnit()}`),
            stat('First → latest', `${oneDecimal(stats.firstTopKg)} → ${oneDecimal(stats.latestTopKg)}${NB}${getUnit()}`),
        ]),
        el('div', { class: 'lift-sessions-label', text: 'Recent sessions' }),
        el(
            'div',
            { class: 'lift-sessions' },
            [...sessions].reverse().slice(0, 10).map((session) =>
                el('div', { class: 'lift-session' }, [
                    el('span', { class: 'lift-session-day', text: dayLabel(session.day, true) }),
                    el('span', { class: 'lift-session-top', text: `${weight(session.topKg)} × ${session.topReps}` }),
                    el('span', {
                        class: 'lift-session-extra',
                        text: session.e1rmKg === null ? `${session.sets} sets` : `est. ${whole(session.e1rmKg)}${NB}${getUnit()}`,
                    }),
                ]),
            ),
        ),
    );

    paintChart();
    openModal('lift-modal');
}
