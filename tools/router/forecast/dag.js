#!/usr/bin/env node
// dag.js — DAG longest-path (critical-path) makespan. DC-06: NEVER sum P90s.
//
// A plan is a graph, not a list. If A→B (B needs A), the time to finish both is
// dur(A)+dur(B) on the critical path — but P90(A)+P90(B) ≠ P90(A+B), because
// the 90th percentile of a sum is not the sum of 90th percentiles. So the Monte
// Carlo samples a duration PER NODE each iteration and asks THIS module for the
// longest path; the makespan distribution comes from those samples, never from
// adding percentiles.
//
// Prereqs that fall OUTSIDE the node set (e.g. an already-merged dependency
// wave) contribute finish=0 — the forecast is for the REMAINING work. Pure,
// deterministic. longestPath throws on a cycle (a plan with a cycle is a bug to
// surface, not to average over).

'use strict';

function _prereqMap(nodes, prereqsOf) {
  const set = new Set(nodes);
  const prereqs = new Map();
  for (const n of nodes) {
    const ps = (prereqsOf(n) || []).filter((p) => set.has(p)); // ignore out-of-scope deps
    prereqs.set(n, ps);
  }
  return { set, prereqs };
}

// Topological order (prereqs before dependents) + cycle detection.
// Returns { order, cycle } — cycle is the offending node ring or null.
function toposort(nodes, prereqsOf) {
  const { prereqs } = _prereqMap(nodes, prereqsOf);
  const state = new Map(); // 0 unvisited · 1 visiting · 2 done
  const order = [];
  const stack = [];
  let cycle = null;

  function visit(n) {
    if (cycle) return;
    const st = state.get(n) || 0;
    if (st === 2) return;
    if (st === 1) { const idx = stack.indexOf(n); cycle = stack.slice(idx).concat(n); return; }
    state.set(n, 1); stack.push(n);
    for (const p of (prereqs.get(n) || [])) { visit(p); if (cycle) return; }
    stack.pop(); state.set(n, 2); order.push(n);
  }
  for (const n of nodes) { if (cycle) break; visit(n); }
  return { order, cycle };
}

// Longest path. durationOf(node) → number (>=0). Returns
// { makespan, finish:Map, critical:[nodeIds] }. Throws Error(cycle) on a cycle.
function longestPath(nodes, prereqsOf, durationOf) {
  const ns = Array.isArray(nodes) ? nodes : [];
  const { order, cycle } = toposort(ns, prereqsOf);
  if (cycle) { const e = new Error('dag cycle: ' + cycle.join('→')); e.cycle = cycle; throw e; }
  const { prereqs } = _prereqMap(ns, prereqsOf);
  const finish = new Map();
  const via = new Map();
  for (const n of order) {
    let best = 0, bestPrev = null;
    for (const p of (prereqs.get(n) || [])) {
      const f = finish.get(p) || 0;
      if (f > best) { best = f; bestPrev = p; }
    }
    const d = Number(durationOf(n)) || 0;
    finish.set(n, best + Math.max(0, d));
    via.set(n, bestPrev);
  }
  let end = null, makespan = 0;
  for (const n of ns) { const f = finish.get(n) || 0; if (f >= makespan) { makespan = f; end = n; } }
  const critical = [];
  let cur = end;
  const guard = new Set();
  while (cur != null && !guard.has(cur)) { critical.unshift(cur); guard.add(cur); cur = via.get(cur); }
  return { makespan, finish, critical };
}

// Convenience: does this node set + deps form a DAG?
function hasCycle(nodes, prereqsOf) { return toposort(nodes, prereqsOf).cycle != null; }

module.exports = { toposort, longestPath, hasCycle };
