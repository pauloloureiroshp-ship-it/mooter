// 05b-calibrate.test.mjs — mordida da isotónica: exemplo calculado à mão, monotonia, x iguais num bloco,
// e a garantia do pré-registo de que o candidato (b) nunca muda a decisão de v0.
//   node --test 05b-calibrate.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { pav, applyIso, fit, candidates } from './05b-calibrate.mjs';

test('(1) PAV num exemplo à mão: [0,1,0,1] em x crescente funde o par que viola', () => {
  const nodes = pav([{ x: 0.1, y: 0 }, { x: 0.2, y: 1 }, { x: 0.3, y: 0 }, { x: 0.9, y: 1 }]);
  assert.deepEqual(nodes.map((n) => [n.x_lo, n.x_hi, n.y, n.n]), [[0.1, 0.1, 0, 1], [0.2, 0.3, 0.5, 2], [0.9, 0.9, 1, 1]]);
  assert.equal(applyIso(nodes, 0.25), 0.5, 'dentro do bloco → média do bloco');
  assert.ok(Math.abs(applyIso(nodes, 0.6) - 0.75) < 1e-9, 'entre blocos → interpolação linear (0,5 → 1 a meio)');
  assert.equal(applyIso(nodes, 0.05), 0); assert.equal(applyIso(nodes, 0.95), 1, 'fora → clamp');
});

test('(1b) contra-exemplo do adversário (round 5, A6): empates em x agrupam-se ANTES de fundir', () => {
  const nodes = pav([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(nodes.map((n) => [n.x_lo, n.x_hi, +n.y.toFixed(6), n.n]), [[0, 0, +(1 / 3).toFixed(6), 3], [1, 1, 0.5, 2]], 'x=0 → 1/3, x=1 → 1/2, sem fusão');
  // invariância à permutação (a versão anterior dependia da ordem dos empates)
  const perm = pav([{ x: 1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]);
  assert.deepEqual(perm, nodes);
});

test('(2) monotonia: para qualquer par de x, applyIso não desce; x iguais partilham bloco', () => {
  const rnd = (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();
  const pairs = Array.from({ length: 300 }, () => { const x = +rnd().toFixed(2); return { x, y: rnd() < x ? 1 : 0 }; });
  const nodes = pav(pairs);
  for (let i = 1; i < nodes.length; i++) { assert.ok(nodes[i].y >= nodes[i - 1].y); assert.ok(nodes[i].x_lo > nodes[i - 1].x_hi, 'blocos disjuntos e ordenados'); }
  let prev = -1; for (let p = 0; p <= 1.0001; p += 0.01) { const v = applyIso(nodes, p); assert.ok(v >= prev - 1e-12, `não desce em ${p}`); prev = v; }
  const eq = pav([{ x: 0.5, y: 1 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }]); assert.equal(eq.length, 1); assert.equal(eq[0].n, 3);
});

test('(3) o candidato (b) nunca muda a decisão de v0; só a confiança; (c) muda só quando o guard dispara', () => {
  const rows = [
    { id: 'a', expected: 'T0', tier: 'T0', probs: { T0: 0.9, T1: 0.05, T2: 0.03, T3: 0.02 }, p_needs_repo: 0.1, p_high_stakes: 0.1 },
    { id: 'b', expected: 'T2', tier: 'T0', probs: { T0: 0.6, T1: 0.1, T2: 0.25, T3: 0.05 }, p_needs_repo: 0.8, p_high_stakes: 0.2 },
    { id: 'c', expected: 'T2', tier: 'T2', probs: { T0: 0.2, T1: 0.1, T2: 0.6, T3: 0.1 }, p_needs_repo: 0.5, p_high_stakes: 0.5 },
    { id: 'd', expected: 'T3', tier: 'T3', probs: { T0: 0.05, T1: 0.05, T2: 0.2, T3: 0.7 }, p_needs_repo: 0.9, p_high_stakes: 0.9 },
    { id: 'e', expected: 'T1', tier: 'T0', probs: { T0: 0.5, T1: 0.4, T2: 0.05, T3: 0.05 }, p_needs_repo: 0.1, p_high_stakes: 0.1 },
  ];
  const classes = fit(rows);
  const { b, c, bp } = candidates(rows, classes);
  assert.deepEqual(b.map((r) => r.tier), rows.map((r) => r.tier), '(b) decisão = v0');
  assert.ok(b.every((r) => r.p_max >= 0 && r.p_max <= 1));
  assert.deepEqual(c.map((r) => r.tier), ['T0', 'T2', 'T2', 'T3', 'T0'], '(c) só o b dispara (T0 com p_needs_repo ≥ 0,5)');
  assert.equal(c.filter((r) => r.guard_fired).length, 1);
  assert.ok(bp.every((r) => ['T0', 'T1', 'T2', 'T3'].includes(r.tier)), 'b′ é só diagnóstico, mas devolve tiers válidos');
});
