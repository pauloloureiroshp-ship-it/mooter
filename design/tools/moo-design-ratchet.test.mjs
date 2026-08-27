/**
 * moo-design-ratchet.test.mjs — o teste de mordida do ratchet.
 *
 * Um ratchet existe para uma coisa só: ficar VERMELHO quando alguém piora o
 * índice. Se nunca ficou vermelho, é indistinguível de um `echo ok`. Cada teste
 * aqui planta uma regressão e exige `piorou: true`.
 *
 * O caso que mais interessa é o penúltimo: passar uma verificação a `n/d` é a
 * forma silenciosa de subir o índice sem melhorar nada — foi assim que o portão
 * chegava a 8,75 com `MOO_REPO` apontado a uma pasta vazia. `n/d` não é falha,
 * mas deixar de medir o que já se media é regressão, e tem de doer.
 *
 *   node --test design/tools/moo-design-ratchet.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { comparar, instantaneo } from './moo-design-ratchet.mjs';

const rel = (indice, pares, limiar = 8) => ({
  gerado_em: '2026-08-27T00:00:00.000Z',
  tokens_versao: '2.0.0',
  indice_coerencia_visual: indice,
  limiar,
  verificacoes: Object.entries(pares).map(([id, pontos]) => ({ id, pontos, peso: 1 })),
});

const base = (indice, pares, limiar = 8) => instantaneo(rel(indice, pares, limiar));

test('sem alterações não piora', () => {
  const b = base(3.18, { a: 1, b: 0 });
  const r = comparar(b, rel(3.18, { a: 1, b: 0 }));
  assert.equal(r.piorou, false);
  assert.equal(r.delta, 0);
});

test('MORDE quando o índice desce', () => {
  const b = base(3.18, { a: 1, b: 1 });
  const r = comparar(b, rel(2.50, { a: 1, b: 0 }));
  assert.equal(r.piorou, true);
  assert.equal(r.desceu, true);
  assert.equal(r.delta, -0.68);
  assert.deepEqual(r.quedas, [{ id: 'b', de: 1, para: 0 }]);
});

test('MORDE quando uma verificação perde pontos mesmo com o índice igual', () => {
  /* Uma pode subir e outra descer e o índice ficar no mesmo sítio. Trocar uma
     regressão por uma melhoria noutro sítio não é «não piorou». */
  const b = base(5.0, { a: 2, b: 0 });
  const r = comparar(b, rel(5.0, { a: 1, b: 1 }));
  assert.equal(r.desceu, false, 'o índice não desceu');
  assert.equal(r.piorou, true, 'mas uma verificação perdeu pontos');
  assert.deepEqual(r.quedas, [{ id: 'a', de: 2, para: 1 }]);
});

test('MORDE quando uma verificação que media passa a n/d', () => {
  const b = base(3.18, { a: 1, b: 0 });
  const r = comparar(b, rel(10, { a: 1, b: null }));
  assert.equal(r.piorou, true,
    'tirar a verificação do denominador sobe o índice sem melhorar nada');
  assert.deepEqual(r.perdeu_medicao, [
    { id: 'b', porque: 'passou a n/d — deixou de medir o que já media' },
  ]);
});

test('MORDE quando uma verificação desaparece do portão', () => {
  const b = base(3.18, { a: 1, b: 0 });
  const r = comparar(b, rel(10, { a: 1 }));
  assert.equal(r.piorou, true);
  assert.deepEqual(r.perdeu_medicao, [{ id: 'b', porque: 'verificação desapareceu do portão' }]);
});

test('n/d que passa a medir é subida, não regressão', () => {
  const b = base(3.18, { a: 1, b: null });
  const r = comparar(b, rel(4.0, { a: 1, b: 0 }));
  assert.equal(r.piorou, false);
  assert.deepEqual(r.subidas, [{ id: 'b', de: 'n/d', para: 0 }]);
});

test('reporta quanto falta para o limiar publicado, sem lhe mexer', () => {
  const b = base(3.18, { a: 1 });
  const r = comparar(b, rel(3.18, { a: 1 }));
  assert.equal(r.limiar, 8, 'o alvo continua a ser 8 — o ratchet não o baixa');
  assert.equal(r.falta_para_limiar, 4.82);
});

test('o instantâneo guarda pontos por verificação, não só o índice', () => {
  const snap = base(3.18, { 'fonte-unica': 0, 'marca-unica': 0.75, contraste: null });
  assert.equal(snap.indice_coerencia_visual, 3.18);
  assert.equal(snap.limiar_alvo, 8);
  assert.deepEqual(snap.verificacoes, { 'fonte-unica': 0, 'marca-unica': 0.75, contraste: null });
});
