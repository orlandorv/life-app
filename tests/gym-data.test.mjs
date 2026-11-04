import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EXERCISES } from '../gym/js/seed.js';
import { curatedFor, CURATED_IDS } from '../gym/js/alternatives.js';
import { DEMOS } from '../gym/js/demos.js';
import { EXERCISES, FAMILIES, REGIONS } from '../gym/js/strength-standards.js';
import { exercisesFor } from '../gym/js/strength.js';
import { PRESETS, prescriptionFor, REST_MIN, REST_MAX } from '../gym/js/prescription.js';

/**
 * The stock exercise library is wired to several tables (substitutes, demo
 * clips, strength standards, rep schemes). Adding an exercise to seed.js and
 * forgetting one of them fails quietly in the app, so these tests are the
 * checklist CLAUDE.md describes.
 */

const byId = new Map(DEFAULT_EXERCISES.map((exercise) => [exercise.id, exercise]));

// Exercises with no honest same-muscle substitute in the library (see alternatives.js).
const NO_SUBSTITUTES = new Set(['back-extension']);
// Left out of the strength map on purpose (see strength-standards.js).
const NOT_ON_STRENGTH_MAP = new Set(['assisted-pull-up-machine', 'hip-adduction-machine', 'ab-wheel-rollout']);

test('exercise ids and names are unique', () => {
    assert.equal(byId.size, DEFAULT_EXERCISES.length, 'duplicate id');
    assert.equal(new Set(DEFAULT_EXERCISES.map((e) => e.name.toLowerCase())).size, DEFAULT_EXERCISES.length, 'duplicate name');
});

test('every exercise has a substitute list, naming real exercises in the same muscle group', () => {
    for (const exercise of DEFAULT_EXERCISES) {
        const list = curatedFor(exercise.id);
        assert.ok(list, `${exercise.id} has no CURATED list`);
        if (!NO_SUBSTITUTES.has(exercise.id)) assert.ok(list.length >= 2, `${exercise.id} needs at least two substitutes`);

        const seen = new Set();
        for (const { id } of list) {
            const target = byId.get(id);
            assert.ok(target, `${exercise.id} → unknown exercise ${id}`);
            assert.notEqual(id, exercise.id, `${exercise.id} lists itself`);
            assert.equal(target.muscleGroup, exercise.muscleGroup, `${exercise.id} → ${id} is a different muscle group`);
            assert.ok(!seen.has(id), `${exercise.id} lists ${id} twice`);
            seen.add(id);
        }
    }
    for (const id of CURATED_IDS) assert.ok(byId.has(id), `CURATED has an entry for unknown exercise ${id}`);
});

test('every exercise has a demo clip, and every demo belongs to an exercise', () => {
    for (const exercise of DEFAULT_EXERCISES) {
        const demo = DEMOS[exercise.id];
        assert.ok(demo, `${exercise.id} has no DEMOS entry`);
        assert.match(demo[0], /^[A-Za-z0-9_-]{11}$/, `${exercise.id}: "${demo[0]}" isn't a YouTube video id`);
        assert.ok(demo[1], `${exercise.id}: no channel credited`);
    }
    for (const id of Object.keys(DEMOS)) assert.ok(byId.has(id), `DEMOS has an entry for unknown exercise ${id}`);
});

test('the strength-map tables are consistent', () => {
    for (const [name, family] of Object.entries(FAMILIES)) {
        assert.equal(family.t.length, 5, `${name} needs five thresholds`);
        assert.ok(family.t.every((value, i, all) => i === 0 || value > all[i - 1]), `${name} thresholds must ascend`);
    }
    const regionIds = new Set(REGIONS.map((region) => region.id));
    for (const [id, spec] of Object.entries(EXERCISES)) {
        assert.ok(byId.has(id), `strength standards list unknown exercise ${id}`);
        assert.ok(FAMILIES[spec.family], `${id}: unknown family ${spec.family}`);
        assert.ok(spec.regions.length && spec.regions.every((r) => regionIds.has(r)), `${id}: bad region`);
        assert.ok(spec.factor > 0, `${id}: factor must be positive`);
    }
    for (const region of REGIONS) assert.ok(exercisesFor(region.id).length > 0, `no exercise counts toward ${region.id}`);
    for (const exercise of DEFAULT_EXERCISES) {
        if (NOT_ON_STRENGTH_MAP.has(exercise.id)) assert.ok(!EXERCISES[exercise.id], `${exercise.id} is meant to be left off the map`);
        else assert.ok(EXERCISES[exercise.id], `${exercise.id} has no strength-standards entry (add one, or list it as left off)`);
    }
});

test('every exercise starts at sane sets, reps, RIR and a 2–3 minute rest, in every rep scheme', () => {
    for (const exercise of DEFAULT_EXERCISES) {
        for (const preset of PRESETS) {
            const { sets, reps, rir, restSeconds } = prescriptionFor(exercise, preset.id);
            const label = `${exercise.id} / ${preset.id}`;
            assert.ok(sets >= 1 && sets <= 4, `${label}: ${sets} sets`);
            assert.ok([3, 4, 5, 6, 8, 10, 12, 15, 20].includes(reps), `${label}: ${reps} reps isn't a known rep-range top`);
            assert.ok(rir >= 0 && rir <= 3, `${label}: RIR ${rir}`);
            assert.ok(restSeconds >= REST_MIN && restSeconds <= REST_MAX, `${label}: rest ${restSeconds}s`);
        }
    }
});
