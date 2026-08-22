// montecarlo.test.js — the two laws: P90s DON'T sum (DC-06); cold-start firewall
// (DC-04); and determinism (a forecast you can't reproduce can't be audited).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { simulate, makeBlockerModel } = require('./montecarlo.js');
const { percentile } = require('./stats.js');

// A single well-sampled class: durations uniform over {1..9} (light-tailed, so
// the sum's tail is clearly BELOW twice the single-node tail).
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PAIRS = VALUES.map((v) => ({ work_ms: v, wall_ms: v }));
const BUCKETS = { 'feature_impl::CC': { pairs: PAIRS, n: PAIRS.length, calibrating: false, k: 8 } };
const NODE = (id, deps) => ({ wave_id: id, bucket: 'feature_impl::CC', deps: deps || [] });

test('P90s do NOT sum: makespan(A→B) is a real distribution, not P90(A)+P90(B) (DC-06)', () => {
  const singleP90 = percentile(VALUES, 0.9); // the naive per-node P90
  const sim = simulate({
    nodes: [NODE('A'), NODE('B', ['A'])],
    buckets: BUCKETS, iterations: 6000, seed: 'dc06',
  });
  assert.equal(sim.calibrating, false);
  // A real chain of two: strictly MORE than one node…
  assert.ok(sim.p90_work > singleP90, `chain P90 ${sim.p90_work} > single P90 ${singleP90}`);
  // …but strictly LESS than the naive sum of the two P90s (both hitting the tail
  // together is rare). This is exactly what summing P90s gets wrong.
  assert.ok(sim.p90_work < 2 * singleP90, `chain P90 ${sim.p90_work} < 2×single ${2 * singleP90}`);
});

test('cold-start firewall (DC-04): a calibrating dep → no cone, calibrating:true', () => {
  const thin = { 'feature_impl::CC': { pairs: PAIRS.slice(0, 4), n: 4, calibrating: true, k: 8 } };
  const sim = simulate({ nodes: [NODE('A')], buckets: thin, iterations: 1000, seed: 'x' });
  assert.equal(sim.calibrating, true);
  assert.equal(sim.p90_work, undefined, 'no percentiles emitted while calibrating');
  assert.match(sim.reason, /calibrating/);
});

test('missing class → cold-start firewall (no fabricated cone)', () => {
  const sim = simulate({ nodes: [NODE('A', [])], buckets: {}, iterations: 500, seed: 'y' });
  assert.equal(sim.calibrating, true);
  assert.match(sim.reason, /no samples/);
});

test('deterministic: same buckets + same seed → identical percentiles', () => {
  const a = simulate({ nodes: [NODE('A'), NODE('B', ['A'])], buckets: BUCKETS, iterations: 3000, seed: 'same' });
  const b = simulate({ nodes: [NODE('A'), NODE('B', ['A'])], buckets: BUCKETS, iterations: 3000, seed: 'same' });
  assert.equal(a.p50_work, b.p50_work);
  assert.equal(a.p90_wall, b.p90_wall);
});

test('injection rate inflates the cone (DC-17)', () => {
  const base = simulate({ nodes: [NODE('A')], buckets: BUCKETS, iterations: 4000, seed: 's', injectionRate: 0 });
  const inflated = simulate({ nodes: [NODE('A')], buckets: BUCKETS, iterations: 4000, seed: 's', injectionRate: 0.4 });
  assert.ok(inflated.p90_wall > base.p90_wall, '1.4× injection widens the cone');
});

test('makeBlockerModel: uma causa com probabilidade mas SEM duracao fica visivel', () => {
  // Sem isto, um bloqueador com p definido e p50_ms ausente entra na simulacao
  // como instantaneo (o `|| 0` faz lo=hi=0) e desaparece sem deixar rasto — um
  // zero por medir disfarcado de zero medido, numa simulacao de TEMPO.
  const m = makeBlockerModel({
    oauth: { p: 0.3, p50_ms: 60000, p90_ms: 120000 },
    rede: { p: 0.2 },
    ausente: { p: 0, p50_ms: 999 },
  });
  assert.deepEqual(m.incompletas, ['rede']);
});

test('makeBlockerModel: tabela completa nao acusa nada, e tabela vazia tambem nao', () => {
  assert.deepEqual(makeBlockerModel({ a: { p: 0.5, p50_ms: 1, p90_ms: 2 } }).incompletas, []);
  assert.deepEqual(makeBlockerModel({}).incompletas, []);
  assert.deepEqual(makeBlockerModel(null).incompletas, []);
});

test('makeBlockerModel: `incompletas` nao muda o comportamento do sorteio', () => {
  // A visibilidade e aditiva de proposito: mudar o numero aqui alterava em
  // silencio todas as previsoes ja calibradas.
  const tabela = { a: { p: 1, p50_ms: 100, p90_ms: 100 } };
  const rng = () => 0.5;
  assert.deepEqual(makeBlockerModel(tabela).extra(rng, {}), { work_ms: 50, wall_ms: 100 });
});
