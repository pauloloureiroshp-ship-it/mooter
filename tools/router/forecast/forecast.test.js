// forecast.test.js — the engine end-to-end: cold-start refuses a cone, class-less
// waves get no base, numbers are never-nu (P50⟺P90), auto-widen wires through,
// staleness flips on a roadmap change, and the whole build is deterministic.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { buildForecast, isStale } = require('./forecast.js');

// 10 valid feature_impl::CC sessions, one per day, active gaps 20–29 min.
const GAPS = [20, 22, 24, 26, 28, 21, 23, 25, 27, 29];
function ledger() {
  const map = {};
  GAPS.forEach((g, i) => {
    const t0 = Date.UTC(2026, 5, 1 + i, 9, 0, 0);
    map['f' + i] = [
      { ts: new Date(t0).toISOString(), kind: 'intent', input: { q: 'constrói o cockpit engine feature' } },
      { ts: new Date(t0 + g * 60000).toISOString(), kind: 'turn', assistant_snippet: 'wired', tools: [{ name: 'Edit', target: 'x.js' }] },
    ];
  });
  return map;
}

const ROADMAP = [
  '## FASE NOW',
  '| # | Wave | Objectivo | Modo | Worktree | Effort | Dep |',
  '|---|---|---|---|---|---|---|',
  '| **W1** | Constrói o cockpit engine | build the cockpit engine feature | **CC-once** | `frugal-a` | M | — |',
  '| **W2** | Mystery thing | zzz qqq neutral | **CC-once** | `frugal-b` | M | — |',
  '| **W3** | Treino do adapter | treino QLoRA nightly do adapter | **Schedule** | `frugal-c` | L | — |',
].join('\n');

function build(opts) {
  return buildForecast(Object.assign({
    roadmapMd: ROADMAP, eventsBySid: ledger(), iterations: 1200,
    calibrationEntries: [], generatedTs: null,
  }, opts));
}

test('a well-sampled class gets a real cone (P50 AND P90, both clocks)', () => {
  const fc = build();
  const W1 = fc.waves.find((w) => w.wave_id === 'W1');
  assert.equal(W1.class, 'feature_impl');
  assert.equal(W1.calibrating, false);
  assert.equal(W1.samples_n, 10);
  assert.ok(W1.p50_wall != null && W1.p90_wall != null, 'wall cone present');
  assert.ok(W1.p50_work != null && W1.p90_work != null, 'work cone present');
  assert.ok(W1.p90_wall >= W1.p50_wall, 'P90 ≥ P50');
  assert.ok(Array.isArray(W1.drivers) && W1.drivers.length >= 1, 'drivers explainable (DC-18)');
  assert.ok(W1.premises && W1.premises.scope.includes('âmbito congelado'), 'premises attached (DC-04)');
});

test('cold-start refuses a cone (DC-04): a class with no samples → calibrating, no P50/P90', () => {
  const fc = build();
  const W3 = fc.waves.find((w) => w.wave_id === 'W3'); // adapter_train — zero samples
  assert.equal(W3.calibrating, true);
  assert.equal(W3.p50_wall, null);
  assert.equal(W3.p90_wall, null);
  assert.match(W3.calibrating_progress || '', /\/8/);
});

test('a class-less wave gets "sem base comparável", never a fabricated cone (DC-01)', () => {
  const fc = build();
  const W2 = fc.waves.find((w) => w.wave_id === 'W2');
  assert.equal(W2.class, null);
  assert.equal(W2.no_base, true);
  assert.equal(W2.p50_wall, null);
});

test('never-nu (DC-04): P50 and P90 are present together or not at all — every wave, both clocks', () => {
  const fc = build();
  for (const w of fc.waves) {
    assert.equal(w.p50_wall == null, w.p90_wall == null, w.wave_id + ' wall P50⟺P90');
    assert.equal(w.p50_work == null, w.p90_work == null, w.wave_id + ' work P50⟺P90');
  }
});

test('auto-widen wires through (DC-16): overshoot history widens the published P90', () => {
  const overshoot = [80, 90, 150, 200, 300].map((a) => ({
    kind: 'closed', class: 'feature_impl', actual_wall_ms: a * 60000, pred_p90_wall: 100 * 60000,
    in_p90_wall: a <= 100,
  }));
  const wide = build({ calibrationEntries: overshoot });
  const W1 = wide.waves.find((w) => w.wave_id === 'W1');
  assert.ok(W1.auto_widen > 1, 'coverage below nominal widened the cone: ' + W1.auto_widen);
});

test('staleness (DC-14/15): the same roadmap is fresh; a changed roadmap is STALE', () => {
  const fc = build();
  assert.equal(isStale(fc, ROADMAP), false, 'unchanged scope → fresh');
  const changed = ROADMAP.replace('| M | — |\n| **W2**', '| M | W3 |\n| **W2**'); // W1 now depends on W3
  assert.equal(isStale(fc, changed), true, 'dep change → prior forecast STALE');
});

test('deterministic: identical inputs → byte-identical forecast', () => {
  assert.equal(JSON.stringify(build()), JSON.stringify(build()));
});

test('scope_hash + injection_rate are surfaced at the top level', () => {
  const fc = build();
  assert.match(fc.scope_hash, /^[0-9a-f]{64}$/);
  assert.equal(typeof fc.injection_rate, 'number');
  assert.equal(fc.schema, 'mooter.forecast/1');
});
