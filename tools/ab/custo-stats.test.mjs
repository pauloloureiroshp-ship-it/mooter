import test from 'node:test';
import assert from 'node:assert/strict';
import { wilson, tangoIC, tangoICPorVarrimento, scoreDeTango, arred } from './custo-stats.mjs';

// ── Wilson: valores calculados à mão e o caso que o pacote já usa ───────────

test('wilson · 0/20 e 20/20 dão os limites que o pacote de provas já publicou', () => {
  // O `conferir-cartoes.mjs` do pacote reconhece o P3 pelo limite superior de
  // 0/20 = 0.16112516018512968. Se este Wilson divergir daquele, um dos dois
  // esta errado, e nao se sabe qual — por isso o numero e afirmado aqui.
  const w0 = wilson(0, 20);
  assert.equal(w0.lo, 0);
  assert.ok(Math.abs(w0.hi - 0.16112516018512968) < 1e-12, `hi=${w0.hi}`);
  const w20 = wilson(20, 20);
  assert.equal(w20.hi, 1);
  assert.ok(Math.abs(w20.lo - (1 - 0.16112516018512968)) < 1e-12);
});

test('wilson · 10/20 e simetrico em torno de 0.5', () => {
  const w = wilson(10, 20);
  assert.ok(Math.abs((0.5 - w.lo) - (w.hi - 0.5)) < 1e-12);
  assert.ok(w.lo > 0.29 && w.lo < 0.30, `lo=${w.lo}`);   // 0.2993 conhecido
});

test('wilson · recusa entradas impossiveis em vez de devolver numero', () => {
  assert.throws(() => wilson(21, 20), RangeError);
  assert.throws(() => wilson(-1, 20), RangeError);
  assert.throws(() => wilson(0, 0), RangeError);
});

// ── Tango: propriedades que tem de ter, e o controlo por varrimento ────────

test('tango · o ponto esta sempre dentro do intervalo', () => {
  for (const [b, c, n] of [[3, 1, 20], [0, 0, 20], [5, 5, 20], [10, 0, 20], [0, 7, 20], [1, 0, 3]]) {
    const r = tangoIC(b, c, n);
    assert.ok(r.lo <= r.diferenca + 1e-9 && r.diferenca <= r.hi + 1e-9, `${b},${c},${n}: ${JSON.stringify(r)}`);
  }
});

test('tango · b = c da intervalo simetrico em torno de zero', () => {
  const r = tangoIC(4, 4, 20);
  assert.equal(r.diferenca, 0);
  assert.ok(Math.abs(r.lo + r.hi) < 1e-5, `lo=${r.lo} hi=${r.hi}`);
});

test('tango · mais pares, intervalo mais estreito, mesma diferenca', () => {
  const a = tangoIC(2, 1, 10);
  const b = tangoIC(20, 10, 100);
  assert.ok(Math.abs(a.diferenca - b.diferenca) < 1e-12);
  assert.ok((b.hi - b.lo) < (a.hi - a.lo));
});

test('tango · trocar A por B espelha o intervalo', () => {
  const r1 = tangoIC(6, 2, 20);
  const r2 = tangoIC(2, 6, 20);
  assert.ok(Math.abs(r1.lo + r2.hi) < 1e-5 && Math.abs(r1.hi + r2.lo) < 1e-5);
});

test('tango · CONTROLO — bisseccao e varrimento fino concordam', () => {
  // Dois metodos independentes para o mesmo intervalo. Se so um o calculasse,
  // ninguem o teria verificado.
  for (const [b, c, n] of [[3, 1, 20], [0, 2, 20], [7, 0, 20], [4, 4, 20], [1, 1, 5]]) {
    const bis = tangoIC(b, c, n);
    const var_ = tangoICPorVarrimento(b, c, n, undefined, 5e-5);
    assert.ok(Math.abs(bis.lo - var_.lo) < 2e-4, `${b},${c},${n} lo: ${bis.lo} vs ${var_.lo}`);
    assert.ok(Math.abs(bis.hi - var_.hi) < 2e-4, `${b},${c},${n} hi: ${bis.hi} vs ${var_.hi}`);
  }
});

test('tango · o score e zero no ponto e muda de sinal a volta dele', () => {
  const b = 3, c = 1, n = 20, ponto = (b - c) / n;
  assert.ok(Math.abs(scoreDeTango(b, c, n, ponto)) < 1e-12);
  assert.ok(scoreDeTango(b, c, n, ponto - 0.05) > 0);
  assert.ok(scoreDeTango(b, c, n, ponto + 0.05) < 0);
});

test('tango · n = 0 devolve null, nao um numero', () => {
  const r = tangoIC(0, 0, 0);
  assert.equal(r.diferenca, null);
  assert.equal(r.lo, null);
  assert.equal(r.hi, null);
});

test('tango · recusa b + c > n', () => {
  assert.throws(() => tangoIC(15, 10, 20), RangeError);
});

// ── arredondamento do pre-registo ─────────────────────────────────────────

test('arred · segue o pre-registo e nao toca em null', () => {
  assert.equal(arred.prop(0.123456), 0.123);
  assert.equal(arred.usd(0.58975), 0.5898);
  assert.equal(arred.tok(1234.6), 1235);
  assert.equal(arred.prop(null), null);
  assert.equal(arred.usd(undefined), undefined);
});
