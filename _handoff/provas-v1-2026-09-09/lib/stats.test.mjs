import test from 'node:test';
import assert from 'node:assert/strict';
import { binomPmf, binomTailUpper, wilson, mcnemarExact, cohenKappa, percentile } from './stats.mjs';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test('binomial: P(X=2 | n=4, 0.5) = 6/16', () => close(binomPmf(4, 2, 0.5), 0.375));

test('binomial cauda superior: P(X>=16 | n=23, 0.5) = 0.04657 (o limiar do R-24)', () => {
  close(binomTailUpper(23, 16, 0.5), 0.04657, 5e-5);
  // e P(X>=15) = 0.10502 viola o alfa — o motivo do 16.
  close(binomTailUpper(23, 15, 0.5), 0.10502, 5e-5);
});

test('Wilson 95% para 29/35 = 0.829 [0.6732, 0.9190] (calculado a mao: centro 0.796075, meia-largura 0.122896)', () => {
  const w = wilson(29, 35);
  close(w.p, 29 / 35); close(w.lo, 0.6732, 2e-4); close(w.hi, 0.9190, 2e-4);
});

test('Wilson nos extremos: 0/10 e 10/10', () => {
  const z = wilson(0, 10); close(z.lo, 0); close(z.hi, 0.2775, 1e-3);
  const o = wilson(10, 10); close(o.lo, 0.7225, 1e-3); close(o.hi, 1);
});

test('McNemar exacto direccional: b=10, c=2 -> P(X>=10 | 12, 0.5) = 79/4096', () => {
  const m = mcnemarExact(10, 2);
  close(m.p_one_sided_A_gt_B, 79 / 4096);
  close(m.p_one_sided_B_gt_A, binomTailUpper(12, 2, 0.5));
  close(m.p_two_sided, 2 * 79 / 4096);
});

test('McNemar: empate exacto (b=c) da p unilateral > 0.5 nos dois sentidos', () => {
  const m = mcnemarExact(4, 4);
  assert.ok(m.p_one_sided_A_gt_B > 0.5 && m.p_one_sided_B_gt_A > 0.5);
  assert.equal(m.p_two_sided, 1);
});

test('McNemar sem discordantes nao inventa significancia', () => {
  assert.equal(mcnemarExact(0, 0).p_two_sided, 1);
});

test('Cohen kappa: acordo perfeito = 1, acordo ao acaso ~ 0', () => {
  close(cohenKappa(['a', 'b', 'a'], ['a', 'b', 'a']).kappa, 1);
  // 2x2 classico: po = 0.7, pe = 0.5 -> kappa = 0.4
  const a = ['y', 'y', 'y', 'y', 'y', 'n', 'n', 'n', 'n', 'n'];
  const b = ['y', 'y', 'y', 'y', 'n', 'n', 'n', 'n', 'y', 'y'];
  const k = cohenKappa(a, b); close(k.po, 0.7); close(k.pe, 0.5); close(k.kappa, 0.4);
});

test('percentil: p50 de [1,2,3,4] = 2.5, p95 de 1..100 = 95.05', () => {
  close(percentile([4, 1, 3, 2], 50), 2.5);
  const v = Array.from({ length: 100 }, (_, i) => i + 1);
  close(percentile(v, 95), 95.05);
});
