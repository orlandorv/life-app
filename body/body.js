import { $, el, clear, openModal, closeModal, confirmSheet, toast } from '../life/dom.js';
import { labelledStepper } from '../life/stepper.js';
import { lifeDb } from '../life/db.js';
import { localDayId, addDays, dayLabel, weekStartId } from '../life/dates.js';
import { getUnit, toDisplay, fromDisplay, formatNumber, weightPrecision } from '../gym/js/units.js';
import { state, loadEntries, entryFor, saveEntry, deleteEntry, hasAnyNumber } from './store.js';
import { trendSeries, trendChange, weeklyAverages, chartLayout, dailySeries, rollingAverage, barChartLayout, average } from './stats.js';
import { weightChart, barChart } from './chart.js';
import { pasteFromHealth, showHealthSetup } from './health-sheet.js';

/**
 * Body: weight, sleep and steps, logged a day at a time. The screen is a
 * summary of today, the weight trend, weekly averages and recent days. The
 * weight unit is Gym's global kg/lb setting, so it follows the toggle in Gym's
 * settings; weight is stored in kg and converted only here.
 */

const CHART = { width: 320, height: 170 };
const RANGES = [30, 90];
const ROLLING_DAYS = 7;

// What differs between the steps and sleep charts. `unit`/`minTop` round the
// chart's top to a number worth reading; sleep also shades a common 7–9 h band.
const TREND_CHARTS = [
    {
        title: 'Steps',
        key: 'steps',
        unit: 4000,
        minTop: 8000,
        band: null,
        format: (steps) => fmtSteps(steps),
        tick: (value) => (value === 0 ? '0' : `${formatNumber(value / 1000)}k`),
        logged: 'Logged',
        empty: 'Log steps, or paste them from Health, on a few days to see how they’re trending.',
        bars: 'Bars are each day’s steps',
    },
    {
        title: 'Sleep',
        key: 'sleepHours',
        unit: 4,
        minTop: 12,
        band: { from: 7, to: 9 },
        format: (hours) => fmtSleep(hours),
        tick: (value) => `${formatNumber(value)} h`,
        logged: 'Logged',
        empty: 'Log your sleep on a few nights to see how it’s trending.',
        bars: 'Bars are each night’s sleep, the shaded band is 7–9 hours (a common target for adults)',
    },
];
const RECENT_DAYS = 14;
const RECENT_PREVIEW = 5;

// Whether the Recent list shows all of RECENT_DAYS rather than the latest few.
let recentExpanded = false;

let ready = null;

/** Opens LifeDB. Safe to call repeatedly. */
export function initBody() {
    ready ??= lifeDb.init().catch((error) => {
        ready = null;
        throw error;
    });
    return ready;
}

/**
 * Called each time the section is opened. The caller has already waited for
 * Gym, which owns the unit. `'log'` opens today's entry sheet.
 */
export async function enterBody(action = null) {
    await initBody();
    await loadEntries();
    renderBody();
    if (action === 'log') openEntryModal(localDayId());
}

async function refresh() {
    await loadEntries();
    renderBody();
}

// --- Formatting -----------------------------------------------------------------

const fmtSleep = (hours) => `${formatNumber(Math.round(hours * 10) / 10)} h`;
const fmtSteps = (steps) => Math.round(steps).toLocaleString();

const round1 = (n) => Math.round(n * 10) / 10;

/** One decimal: a body-weight average to the hundredth of a kg claims precision a scale doesn't have. */
const fmtW = (kg) => `${formatNumber(round1(toDisplay(kg)))} ${getUnit()}`;

function fmtDelta(kg) {
    const shown = round1(toDisplay(Math.abs(kg)));
    if (shown === 0) return 'no change';
    return `${kg < 0 ? '−' : '+'}${formatNumber(shown)} ${getUnit()}`;
}

function entryText(entry) {
    return [
        entry.weightKg != null ? fmtW(entry.weightKg) : null,
        entry.sleepHours != null ? fmtSleep(entry.sleepHours) : null,
        entry.steps != null ? `${fmtSteps(entry.steps)} steps` : null,
    ]
        .filter(Boolean)
        .join(' · ');
}

// --- Screen ---------------------------------------------------------------------

export function renderBody() {
    const today = localDayId();
    clear($('#body-content')).append(
        todayCard(today),
        weightCard(today),
        ...TREND_CHARTS.map((chart) => trendCard(today, chart)),
        weeklyCard(today),
        recentCard(today),
    );
}

function sectionTitle(text, trailing = null) {
    return el('div', { class: 'body-title-row' }, [el('span', { class: 'body-title', text }), trailing]);
}

function tile(label, value) {
    return el('div', { class: 'body-tile' }, [
        el('span', { class: 'body-tile-label', text: label }),
        el('span', { class: `body-tile-value${value ? '' : ' empty'}`, text: value || '—' }),
    ]);
}

function todayCard(today) {
    const entry = entryFor(today);

    return el('div', { class: 'body-card' }, [
        sectionTitle('Today'),
        el('div', { class: 'body-tiles' }, [
            tile('Weight', entry?.weightKg != null ? fmtW(entry.weightKg) : null),
            tile('Sleep', entry?.sleepHours != null ? fmtSleep(entry.sleepHours) : null),
            tile('Steps', entry?.steps != null ? fmtSteps(entry.steps) : null),
        ]),
        el('div', { class: 'body-actions' }, [
            el('button', {
                class: 'btn btn-primary',
                type: 'button',
                text: entry ? 'Edit today' : 'Log today',
                onclick: () => openEntryModal(today),
            }),
            // Straight from the tap: reading the clipboard needs a user gesture.
            el('button', {
                class: 'btn btn-outline',
                type: 'button',
                text: 'Paste from Health',
                onclick: () => pasteFromHealth({ onSaved: refresh }),
            }),
        ]),
        el('div', { class: 'body-links' }, [
            el('button', {
                class: 'link-btn',
                type: 'button',
                text: 'Log a different day',
                onclick: () => openEntryModal(addDays(today, -1), true),
            }),
            el('button', { class: 'link-btn', type: 'button', text: 'Set up Health shortcut', onclick: showHealthSetup }),
        ]),
    ]);
}

/** The 30/90-day switch. One shared setting, so changing it on any chart changes them all. */
function rangePicker() {
    return el(
        'div',
        { class: 'segmented body-range' },
        RANGES.map((days) =>
            el('button', {
                type: 'button',
                class: state.range === days ? 'active' : '',
                text: `${days} days`,
                onclick: () => {
                    state.range = days;
                    renderBody();
                },
            }),
        ),
    );
}

function weightCard(today) {
    const range = state.range;
    const series = trendSeries(state.entries);
    const from = addDays(today, -(range - 1));
    const inRange = series.filter((point) => point.day >= from);

    const picker = rangePicker();

    const card = el('div', { class: 'body-card' }, [sectionTitle('Weight', picker)]);

    if (!series.length) {
        card.append(el('p', { class: 'hint', text: 'Log your weight on a few days to see how it’s trending.' }));
        return card;
    }

    const latest = series[series.length - 1];
    const change = trendChange(inRange);

    card.append(
        el('div', { class: 'body-tiles' }, [
            tile('Latest', fmtW(latest.weightKg)),
            tile('Trend', fmtW(latest.trendKg)),
            tile(`In ${range} days`, change === null ? null : fmtDelta(change)),
        ]),
    );

    const layout = chartLayout(series, { from, to: today, ...CHART });
    if (!layout) {
        card.append(el('p', { class: 'hint', text: 'Two or more weigh-ins in this range will draw the chart.' }));
        return card;
    }

    card.append(
        weightChart(layout, {
            ...CHART,
            formatTick: (kg) => formatNumber(Math.round(toDisplay(kg) * 10) / 10),
            fromLabel: dayLabel(from, today),
            toLabel: 'Today',
            description: `Weight over the last ${range} days. Dots are weigh-ins; the line is the trend.`,
        }),
        el('p', { class: 'hint body-legend', text: 'Dots are single weigh-ins; the line smooths out the daily ups and downs.' }),
    );
    return card;
}

/**
 * A daily total (steps, sleep) as bars with a 7-day average through them.
 * Bars, not dots: each one is a whole day's number, and a day you didn't log is
 * a gap rather than a zero. The average only counts days that were logged.
 */
function trendCard(today, chart) {
    const range = state.range;
    const from = addDays(today, -(range - 1));
    // The average reaches back a week before the window so its first days are complete.
    const all = dailySeries(state.entries, chart.key, addDays(from, -(ROLLING_DAYS - 1)), today);
    const inRange = all.filter((point) => point.day >= from);

    const card = el('div', { class: 'body-card' }, [sectionTitle(chart.title, rangePicker())]);
    if (!inRange.length) {
        card.append(el('p', { class: 'hint', text: chart.empty }));
        return card;
    }

    const lastWeek = inRange.filter((point) => point.day >= addDays(today, -(ROLLING_DAYS - 1)));
    const mean = (points) => average(points.map((point) => point.value));
    card.append(
        el('div', { class: 'body-tiles' }, [
            tile('Last 7 days', lastWeek.length ? chart.format(mean(lastWeek)) : null),
            tile(`Avg in ${range} days`, chart.format(mean(inRange))),
            tile(chart.logged, `${inRange.length} of ${range}`),
        ]),
    );

    const averages = rollingAverage(all, from, today, { window: ROLLING_DAYS });
    const layout = barChartLayout(inRange, averages, {
        from,
        to: today,
        ...CHART,
        unit: chart.unit,
        minTop: chart.minTop,
        band: chart.band,
    });
    if (!layout) {
        card.append(el('p', { class: 'hint', text: `Two or more days in this range will draw the chart.` }));
        return card;
    }

    const legend = [
        layout.line ? `${chart.bars}; the line is the 7-day average.` : `${chart.bars}. The average line appears once three days in a week are logged.`,
        chart.key === 'steps' && inRange.some((point) => point.day === today) ? 'Today’s total is still building.' : null,
    ]
        .filter(Boolean)
        .join(' ');

    card.append(
        barChart(layout, {
            ...CHART,
            formatTick: chart.tick,
            fromLabel: dayLabel(from, today),
            toLabel: 'Today',
            description: `${chart.title} over the last ${range} days. ${legend}`,
        }),
        el('p', { class: 'hint body-legend', text: legend }),
    );
    return card;
}

function weeklyCard(today) {
    const weeks = weeklyAverages(state.entries, today, 8);
    const card = el('div', { class: 'body-card' }, [sectionTitle('Weekly averages')]);

    if (!weeks.length) {
        card.append(el('p', { class: 'hint', text: 'Averages appear once you’ve logged a few days.' }));
        return card;
    }

    weeks.forEach((week) => {
        const isThisWeek = week.weekStart === weekStartId(today);
        card.append(
            el('div', { class: 'body-week' }, [
                el('div', { class: 'body-week-label', text: isThisWeek ? 'This week' : `Week of ${dayLabel(week.weekStart, today)}` }),
                el('div', { class: 'body-tiles' }, [
                    el('div', { class: 'body-tile' }, [
                        el('span', { class: 'body-tile-label', text: 'Weight' }),
                        el('span', { class: `body-tile-value${week.weightKg === null ? ' empty' : ''}`, text: week.weightKg === null ? '—' : fmtW(week.weightKg) }),
                        week.weightChangeKg === null ? null : el('span', { class: 'body-tile-note', text: fmtDelta(week.weightChangeKg) }),
                    ]),
                    tile('Sleep', week.sleepHours === null ? null : fmtSleep(week.sleepHours)),
                    tile('Steps', week.steps === null ? null : fmtSteps(week.steps)),
                ]),
            ]),
        );
    });
    return card;
}

function recentCard(today) {
    const all = [...state.entries].reverse().slice(0, RECENT_DAYS);
    const recent = recentExpanded ? all : all.slice(0, RECENT_PREVIEW);
    const card = el('div', { class: 'body-card' }, [sectionTitle('Recent')]);

    if (!all.length) {
        card.append(el('p', { class: 'hint', text: 'Nothing logged yet.' }));
        return card;
    }

    card.append(
        el(
            'div',
            { class: 'life-list' },
            recent.map((entry) =>
                el('button', { class: 'body-entry', type: 'button', onclick: () => openEntryModal(entry.day) }, [
                    el('span', { class: 'body-entry-day', text: dayLabel(entry.day, today) }),
                    el('span', { class: 'body-entry-meta', text: entryText(entry) }),
                ]),
            ),
        ),
    );

    if (all.length > RECENT_PREVIEW) {
        card.append(
            el('button', {
                class: 'link-btn body-recent-toggle',
                type: 'button',
                text: recentExpanded ? 'Show less' : `Show ${all.length - RECENT_PREVIEW} more`,
                onclick: () => {
                    recentExpanded = !recentExpanded;
                    renderBody();
                },
            }),
        );
    }
    return card;
}

// --- Log / edit sheet ---------------------------------------------------------------

/** `pickDate` adds a date field, for logging a day other than today. */
function openEntryModal(day, pickDate = false) {
    clear($('#body-entry-body')).append(entryForm(day, pickDate));
    openModal('body-modal');
}

/**
 * A stepper's first "+" from blank jumps to your last recorded value (or a
 * typical one) instead of crawling up from zero, but "blank" itself stays
 * "not recorded" — nothing is saved for a field you never touched.
 */
function jumpFromBlank(fallback, next) {
    return (base, direction) => (base <= 0 && direction > 0 ? fallback() : next(base, direction));
}

/**
 * The value logged nearest to `day`: the most recent one before it, or failing
 * that the most recent one at all (so logging yesterday when only today exists
 * still starts from a real number). Null if the field has never been recorded.
 */
function nearestRecorded(field, day) {
    const recorded = state.entries.filter((entry) => entry[field] != null);
    const before = recorded.filter((entry) => entry.day < day);
    const pick = (before.length ? before : recorded).at(-1);
    return pick ? pick[field] : null;
}

function entryForm(startDay, pickDate) {
    const unit = getUnit();
    const today = localDayId();
    let day = startDay;

    const weightStep = unit === 'kg' ? 0.1 : 0.2;

    const weight = labelledStepper(`Weight (${unit})`, {
        value: 0,
        min: 0,
        max: 1000,
        decimals: true,
        precision: weightPrecision(unit),
        // No weight has ever been logged: start somewhere plausible, not at 0.1.
        onStep: jumpFromBlank(
            () => {
                const kg = nearestRecorded('weightKg', day);
                return kg == null ? (unit === 'kg' ? 70 : 155) : toDisplay(kg);
            },
            (base, dir) => Math.max(0, round1(base + dir * weightStep)),
        ),
    });

    const sleep = labelledStepper('Sleep', {
        value: 0,
        min: 0,
        max: 24,
        step: 0.5,
        decimals: true,
        precision: 1,
        suffix: 'h',
        onStep: jumpFromBlank(() => nearestRecorded('sleepHours', day) ?? 7, (base, dir) => Math.max(0, round1(base + dir * 0.5))),
    });

    const steps = labelledStepper('Steps', { value: 0, min: 0, max: 100000, step: 1000 });
    steps.classList.add('span-2');

    const dateInput = pickDate
        ? el('input', { class: 'form-input', type: 'date', max: today, value: day })
        : null;

    const removeButton = el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete' });

    const fill = () => {
        const entry = entryFor(day);
        weight.control.setValue(entry?.weightKg != null ? toDisplay(entry.weightKg) : 0);
        sleep.control.setValue(entry?.sleepHours ?? 0);
        steps.control.setValue(entry?.steps ?? 0);
        removeButton.hidden = !entry;
        $('#body-modal-title').textContent = entry ? 'Edit entry' : 'Log';
        $('#body-modal-day').textContent = dayLabel(day, today);
    };

    dateInput?.addEventListener('change', () => {
        // A cleared field or a future date is ignored; the last valid day stands.
        if (!dateInput.value || dateInput.value > today) {
            dateInput.value = day;
            return;
        }
        day = dateInput.value;
        fill();
    });

    const finish = async (message) => {
        closeModal('body-modal');
        await refresh();
        toast(message);
    };

    const submit = async (event) => {
        event.preventDefault();
        const weightValue = weight.control.getValue();
        const values = {
            day,
            weightKg: weightValue > 0 ? fromDisplay(weightValue, unit) : null,
            sleepHours: sleep.control.getValue(),
            steps: steps.control.getValue(),
        };

        if (!hasAnyNumber(values)) {
            toast('Enter at least one number');
            return;
        }

        try {
            await saveEntry(values);
        } catch (error) {
            console.error(error);
            toast('Couldn’t save that');
            return;
        }
        await finish('Saved');
    };

    removeButton.addEventListener('click', async () => {
        const ok = await confirmSheet({
            title: 'Delete entry',
            message: `Remove the numbers logged for ${dayLabel(day, today).toLowerCase()}?`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        await deleteEntry(day);
        await finish('Entry deleted');
    });

    fill();

    return el('form', { class: 'body-form', onsubmit: submit }, [
        dateInput ? el('label', { class: 'stepper-field' }, [el('span', { class: 'stepper-label', text: 'Day' }), dateInput]) : null,
        el('div', { class: 'stepper-grid' }, [weight, sleep, steps]),
        el('p', { class: 'hint footnote', text: 'Leave anything you didn’t track at zero — it’s saved as blank, not as a real zero.' }),
        el('div', { class: 'modal-actions' }, [
            removeButton,
            el('button', { class: 'btn btn-primary', type: 'submit', text: 'Save' }),
        ]),
    ]);
}
