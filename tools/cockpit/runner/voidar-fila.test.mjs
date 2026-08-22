/**
 * voidar-fila.test.mjs — registos SINTETICOS, nunca o ledger real.
 *
 * O caso que mais importa aqui nao e contar bem: e NAO atropelar uma decisao que
 * o dono ja tomou. Uma ferramenta que escreve 1114 linhas no ledger de outra
 * pessoa tem de provar que sabe parar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { planear, lerJsonl } from './voidar-fila.mjs';

/** Um recibo que o `ehAchado` reconhece: conclusao=achado E verdict=citacao-ok. */
const achado = (pilar, chave, extra = {}) => ({
  pilar, chave, conclusao: 'achado', verdict: 'citacao-ok', ficheiro: 'x.js', ...extra,
});

test('anula os de pilares desligados e deixa os activos em paz', () => {
  const r = planear(
    [achado('PA', 'k1'), achado('PZ', 'k2'), achado('PA', 'k3')],
    { activos: ['PA'] },
  );
  assert.deepEqual(r.anular.map((x) => x.chave), ['k2']);
  assert.deepEqual(r.ficam.map((x) => x.chave).sort(), ['k1', 'k3']);
});

test('NAO se sobrepoe a uma decisao ja tomada, mesmo de pilar desligado', () => {
  // Se alguem ja olhou para o achado, a opiniao dessa pessoa ganha a minha
  // inferencia sobre o instrumento. Sem isto, correr a ferramenta duas vezes
  // reescrevia por cima do dono.
  const decisoes = new Map([['k2', { decisao: 'aceite', por: 'dono' }]]);
  const r = planear([achado('PZ', 'k2')], { activos: ['PA'], decisoes });
  assert.deepEqual(r.anular, []);
  assert.equal(r.jaDecididos.length, 1);
});

test('e idempotente: a segunda passagem nao tem nada para fazer', () => {
  const regs = [achado('PZ', 'k2')];
  const primeira = planear(regs, { activos: ['PA'] });
  assert.equal(primeira.anular.length, 1);
  const decisoes = new Map(primeira.anular.map((a) => [a.chave, { decisao: 'descartado' }]));
  const segunda = planear(regs, { activos: ['PA'], decisoes });
  assert.deepEqual(segunda.anular, []);
});

test('a mesma chave repetida conta uma vez', () => {
  const r = planear([achado('PZ', 'k'), achado('PZ', 'k'), achado('PZ', 'k')], { activos: [] });
  assert.equal(r.anular.length, 1);
});

test('rondas sem achado e eventos nao entram', () => {
  const r = planear([
    { pilar: 'PZ', chave: 'a', conclusao: 'sem-achado', verdict: 'sem-achado' },
    { pilar: 'PZ', chave: 'b', conclusao: 'achado', verdict: 'citacao-falhou' },
    { evento: 'arranque', pilar: 'PZ', chave: 'c', conclusao: 'achado', verdict: 'citacao-ok' },
    achado('PZ', 'd'),
  ], { activos: [] });
  assert.deepEqual(r.anular.map((x) => x.chave), ['d'],
    'so o achado com citacao resolvida conta');
});

test('sem pilares activos nenhum achado sobrevive — e isso tem de ser visivel', () => {
  const r = planear([achado('PA', 'k1'), achado('PZ', 'k2')], { activos: [] });
  assert.equal(r.anular.length, 2);
  assert.deepEqual(r.ficam, []);
});

test('linha partida no jsonl e contada, nao engolida', () => {
  const falso = () => '{"a":1}\nisto nao e json\n{"b":2}\n';
  const { registos, partidas } = lerJsonl('/x', { readImpl: falso });
  assert.equal(registos.length, 2);
  assert.equal(partidas, 1, 'engolir metade do registo em silencio seria o pior resultado');
});

test('ficheiro ausente devolve vazio sem rebentar', () => {
  const { registos, partidas } = lerJsonl('/nao/existe', {
    readImpl: () => { throw new Error('ENOENT'); },
  });
  assert.deepEqual(registos, []);
  assert.equal(partidas, 0);
});
