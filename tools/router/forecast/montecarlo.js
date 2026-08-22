#!/usr/bin/env node
// montecarlo.js — the forecast's engine of humility.
//
// Each iteration: draw a duration PER NODE from its class's empirical pairs
// (work & wall drawn TOGETHER, preserving their per-session correlation — a long
// wall usually means a long human wait, not more work), add a conditional
// blocker (DC-03), take the DAG longest path (dag.js, DC-06), and inflate by the
// historical injection rate (DC-17). The makespan distribution is the OUTPUT;
// percentiles are read off it — never summed across nodes.
//
// Cold-start firewall (DC-04): if the target wave's class OR any in-scope
// dependency's class is still calibrating (n<k) or has zero pairs, simulate()
// returns { calibrating:true } and NO percentiles. A cone you cannot honestly
// draw is not drawn.
//
// Deterministic: same buckets + same seed → same result. Pure (RNG seeded, no fs).

'use strict';

const { longestPath } = require('./dag.js');
const { percentile } = require('./stats.js');
const { mulberry32, seedFromString } = require('./rng.js');

// Build a paired draw over a bucket's { pairs:[{work_ms,wall_ms}] }.
function _drawer(pairs) {
  const arr = Array.isArray(pairs) ? pairs.filter((p) => p && Number.isFinite(p.work_ms) && Number.isFinite(p.wall_ms)) : [];
  return function draw(rng) {
    if (arr.length === 0) return { work_ms: 0, wall_ms: 0 };
    const p = arr[Math.floor(rng() * arr.length)];
    return { work_ms: Math.max(0, p.work_ms), wall_ms: Math.max(0, p.wall_ms) };
  };
}

// Is the requested scope drawable? (target + in-scope deps all have a full,
// non-calibrating bucket.) Returns { calibrating, reason }.
function _coldStart(nodes, bucketOf, buckets) {
  for (const n of nodes) {
    const key = bucketOf(n);
    const b = key ? buckets[key] : null;
    if (!b || !Array.isArray(b.pairs) || b.pairs.length === 0) {
      return { calibrating: true, reason: 'no samples for class ' + (key || '∅') };
    }
    if (b.calibrating) {
      return { calibrating: true, reason: 'class ' + key + ' calibrating (' + b.pairs.length + '/' + (b.k || 8) + ')' };
    }
  }
  return { calibrating: false, reason: null };
}

// spec: {
//   nodes: [node],                       // the sub-DAG (target + uncompleted deps)
//   idOf(node)->string,                  // stable node id (wave_id)
//   bucketOf(node)->string,              // class×mode key
//   prereqsOf(node)->[ids],              // in/out-of-scope deps (dag filters scope)
//   buckets: { key: { pairs, n, calibrating, k } },
//   blocker: { extra(rng, node)->{work_ms, wall_ms} } (optional),
//   injectionRate: number (optional, default 0),
//   iterations: number (default 2000),
//   seed: number|string (default derived from node ids),
// }
function simulate(spec) {
  const s = spec || {};
  const nodes = Array.isArray(s.nodes) ? s.nodes : [];
  const idOf = s.idOf || ((n) => (n && n.wave_id) || String(n));
  const bucketOf = s.bucketOf || ((n) => n && n.bucket);
  const prereqsOf = s.prereqsOf || ((n) => (n && n.deps) || []);
  const buckets = s.buckets || {};
  const blocker = s.blocker && typeof s.blocker.extra === 'function' ? s.blocker : null;
  const injectionRate = Number.isFinite(s.injectionRate) ? Math.max(0, s.injectionRate) : 0;
  const iterations = Number.isFinite(s.iterations) ? Math.max(1, s.iterations | 0) : 2000;

  const cold = _coldStart(nodes, bucketOf, buckets);
  if (cold.calibrating) {
    return { calibrating: true, reason: cold.reason, iterations: 0, nodes: nodes.map(idOf) };
  }

  const ids = nodes.map(idOf);
  const seed = s.seed != null ? (typeof s.seed === 'string' ? seedFromString(s.seed) : s.seed) : seedFromString(ids.join('|'));
  const rng = mulberry32(seed);

  // Pre-build drawers per bucket.
  const drawers = {};
  for (const n of nodes) { const k = bucketOf(n); if (k && !drawers[k]) drawers[k] = _drawer(buckets[k].pairs); }

  // dag helpers keyed by id.
  const byId = new Map(nodes.map((n) => [idOf(n), n]));
  const prereqIds = (id) => (prereqsOf(byId.get(id)) || []).map(String);

  const workSamples = new Array(iterations);
  const wallSamples = new Array(iterations);
  const critCount = {}; // id → times on the (wall) critical path
  const inflate = 1 + injectionRate;

  for (let it = 0; it < iterations; it++) {
    const durWork = new Map();
    const durWall = new Map();
    for (const n of nodes) {
      const id = idOf(n);
      const d = drawers[bucketOf(n)](rng);
      let work = d.work_ms, wall = d.wall_ms;
      if (blocker) { const ex = blocker.extra(rng, n) || {}; work += Math.max(0, ex.work_ms || 0); wall += Math.max(0, ex.wall_ms || 0); }
      durWork.set(id, work);
      durWall.set(id, wall);
    }
    const lpWork = longestPath(ids, prereqIds, (id) => durWork.get(id) || 0);
    const lpWall = longestPath(ids, prereqIds, (id) => durWall.get(id) || 0);
    workSamples[it] = lpWork.makespan * inflate;
    wallSamples[it] = lpWall.makespan * inflate;
    for (const id of lpWall.critical) critCount[id] = (critCount[id] || 0) + 1;
  }

  return {
    calibrating: false,
    iterations,
    nodes: ids,
    p50_work: percentile(workSamples, 0.5),
    p90_work: percentile(workSamples, 0.9),
    p50_wall: percentile(wallSamples, 0.5),
    p90_wall: percentile(wallSamples, 0.9),
    injectionRate,
    criticalCounts: critCount,
    // keep raw samples out of the default return (large); expose stats only.
  };
}

// A no-cost blocker model (DC-03): probability × duration conditioned on the
// wave's environment. `causes` maps blocker_cause → { p, p50_ms, p90_ms }.
// A wave whose env can't hit OAuth passes envHas:{oauth:false} → that tail is
// never inherited. Returns an object with .extra(rng, node) for simulate().
function makeBlockerModel(causes, envOf) {
  const table = causes || {};
  const env = typeof envOf === 'function' ? envOf : () => ({});
  // Uma causa com probabilidade mas SEM duracao entra na simulacao como um
  // bloqueador instantaneo — o `p50_ms || 0` abaixo faz `lo = hi = 0` e o
  // sorteio devolve 0ms. Numa simulacao cujo proposito e prever TEMPO, isso e um
  // zero por medir disfarcado de zero medido, e some sem deixar rasto.
  //
  // Nao se muda o numero aqui de proposito: alterar o comportamento mudava
  // silenciosamente todas as previsoes ja calibradas. O que muda e a
  // VISIBILIDADE — quem monta a tabela passa a poder ver que ela esta
  // incompleta, e decidir. `incompletas` fica vazio quando esta tudo bem.
  const incompletas = Object.keys(table).filter((nome) => {
    const c = table[nome] || {};
    return Number(c.p) > 0 && !Number.isFinite(Number(c.p50_ms));
  });
  return {
    incompletas,
    extra(rng, node) {
      const e = env(node) || {};
      let work = 0, wall = 0;
      for (const cause of Object.keys(table)) {
        if (e[cause] === false) continue;         // env can't hit this blocker
        const c = table[cause] || {};
        if (rng() < (c.p || 0)) {
          // draw between p50 and p90 (lognormal-ish via two uniforms), honest spread
          const lo = c.p50_ms || 0, hi = Math.max(c.p50_ms || 0, c.p90_ms || 0);
          const draw = lo + (hi - lo) * rng();
          wall += draw;
          work += draw * 0.5;                     // resolving a blocker is part work, part wait
        }
      }
      return { work_ms: work, wall_ms: wall };
    },
  };
}

module.exports = { simulate, makeBlockerModel };
