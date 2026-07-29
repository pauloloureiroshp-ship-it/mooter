'use strict';
/**
 * sessao.test.js — v1.9: o cerebro da sessao, e a honestidade do resumo.
 *
 * A MEDICAO QUE JUSTIFICA TUDO ISTO (7 dias de sessoes reais, 2026-07-26):
 *   cache_read 631 500 005 tokens -> 69,8% do peso da factura
 *   output       1 278 971 tokens ->  7,1%
 * Media de 462 mil tokens RELIDOS por turno. A conversa arrasta-se atras de si
 * propria e cada pergunta paga o custo de todas as anteriores.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.MOOTER_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-ses-'));
const s = require('./sessao.js');

test('S1 — regista e retoma sem perder nada', () => {
  s.registar({ id: 't1', projecto: 'Mooter', objectivo: 'medir a quota',
    feito: ['medi 7 dias de sessoes'], por_fazer: ['commitar'], proximo: 'reinstalar o conector' });
  const r = s.retomar('t1');
  assert.ok(r.ok);
  assert.ok(/medi 7 dias/.test(r.texto));
  assert.ok(/commitar/.test(r.texto));
  assert.ok(/reinstalar o conector/.test(r.texto));
  assert.ok(r.tokens_aprox > 0 && r.tokens_aprox < 2000, 'um resumo com mais de 2000 tokens deixou de ser resumo');
});

test('S2 — o resumo DIZ que e um resumo', () => {
  // ⚠️ substituir 462 mil tokens relidos por uns milhares so e' legitimo se for
  // honesto: o que nao esta no resumo, perdeu-se. Fingir que o resumo e' a
  // conversa seria a mentira mais cara que este produto poderia contar.
  const r = s.retomar('t1');
  assert.ok(/RESUMO, não a conversa/.test(r.texto), 'nao avisa que ha coisas que se perderam');
  assert.ok(/não foi registado/.test(r.texto));
});

test('S3 — uma coisa FEITA deixa de estar por fazer', () => {
  s.registar({ id: 't2', por_fazer: ['correr a bateria de testes', 'fazer push'] });
  s.registar({ id: 't2', feito: ['correr a bateria de testes — 17 suites verdes'] });
  const e = s.ler('t2');
  assert.ok(!e.por_fazer.some((x) => /bateria/.test(x)), 'a lista de por-fazer mente: ainda tem o que ja foi feito');
  assert.ok(e.por_fazer.some((x) => /push/.test(x)), 'apagou o que ainda esta por fazer');
});

test('S4 — nao repete a mesma linha vinte vezes', () => {
  for (let i = 0; i < 20; i++) s.registar({ id: 't3', feito: ['a mesma coisa'] });
  const e = s.ler('t3');
  assert.strictEqual(e.feito.length, 1, 'um estado que repete deixa de ser um resumo');
  assert.strictEqual(e.turnos_registados, 20, 'perdeu a conta dos blocos registados');
});

test('S5 — o estado nao cresce para sempre', () => {
  for (let i = 0; i < 100; i++) s.registar({ id: 't4', feito: ['coisa numero ' + i] });
  const e = s.ler('t4');
  assert.ok(e.feito.length <= 30, 'o estado cresceu sem limite — volta a ser caro de arrastar');
  assert.ok(/99/.test(e.feito.join(' ')), 'ficou com o mais antigo em vez do mais recente');
});

test('S6 — sem estado guardado, diz o que fazer em vez de inventar', () => {
  const r = s.retomar('nunca-existiu');
  assert.strictEqual(r.ok, false);
  assert.ok(/nada foi registado/.test(r.porque));
  assert.ok(Array.isArray(r.faz_assim) && r.faz_assim.length, 'erro sem saida accionavel');
});

test('S7 — o custo de arrastar aponta a RELEITURA quando ela domina', () => {
  // os numeros reais do Paulo: 631M de releitura contra 1,2M de output
  const c = s.custoDeArrastar({ disponivel: true, longa: {
    cache_lido: 631500005, cache_criado: 16701349, saidas: 1278971, entradas: 7718 } });
  assert.ok(c.disponivel);
  assert.strictEqual(c.dominante, 'releitura');
  assert.ok(c.percentagens.releitura > 60, 'nao ve que a releitura e a maior fatia: ' + JSON.stringify(c.percentagens));
  assert.ok(/recomeçar/.test(c.veredicto), 'nao diz o que fazer com a informacao');
  assert.strictEqual(c.estimativa, true, 'apresenta racios estimados como se fossem o preco real');
});

test('S8 — quando o OUTPUT domina, o conselho MUDA', () => {
  // ⚠️ um veredicto que diz sempre a mesma coisa nao e' um veredicto
  const c = s.custoDeArrastar({ disponivel: true, longa: {
    cache_lido: 1000, cache_criado: 1000, saidas: 1000000, entradas: 100 } });
  assert.strictEqual(c.dominante, 'resposta');
  assert.ok(/mais curtas/.test(c.veredicto), 'da o mesmo conselho para um problema diferente');
});

test('S9 — sem medicao nao inventa um veredicto', () => {
  assert.strictEqual(s.custoDeArrastar(null).disponivel, false);
  assert.strictEqual(s.custoDeArrastar({ disponivel: true, longa: { cache_lido: 0, cache_criado: 0, saidas: 0, entradas: 0 } }).disponivel, false);
});

test('S10 — listar e esquecer', () => {
  const l = s.listar();
  assert.ok(l.length >= 4, 'nao lista as sessoes guardadas');
  assert.ok(l[0].actualizada_em, 'sem data nao se sabe qual e a mais recente');
  assert.strictEqual(s.esquecer('t4').ok, true);
  assert.ok(!s.listar().some((x) => x.id === 't4'), 'esquecer nao esqueceu');
});
