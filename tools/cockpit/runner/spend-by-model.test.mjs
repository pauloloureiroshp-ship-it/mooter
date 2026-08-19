/**
 * spend-by-model.test.mjs
 *
 * O teste que importa e o primeiro: um modelo que nao esta na tabela de precos
 * TEM de sair sem numero. Foi exactamente o contrario que aconteceu na vida
 * real — `claude-opus-5` nao existia em `pricing.js`, o `getPrice()` devolveu
 * o FALLBACK_PRICE de Sonnet, e o produto passou meses a publicar um custo 40%
 * abaixo do verdadeiro sem que uma unica linha vermelha aparecesse a ninguem.
 * Um fallback silencioso e pior do que um espaco em branco.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { spendByModel, agregarPorModelo, precoDe, NAO_E_MODELO } from './spend-by-model.mjs';

const HORA = 3600 * 1000;
const AGORA = 1_760_000_000_000;

/** Imita o `filtrar` do quota.js: corta pela data e agrupa por modelo. */
function filtrarFalso(todos, desde) {
  const dentro = todos.filter((t) => t.ts >= desde);
  const por_modelo = {};
  let suspeitas = 0;
  for (const t of dentro) {
    const pm = por_modelo[t.mod] || (por_modelo[t.mod] = { entradas: 0, saidas: 0, turnos: 0 });
    pm.entradas += t.in;
    pm.saidas += t.out;
    pm.turnos += 1;
    if (t.out <= 3) suspeitas += 1;
  }
  return { turnos: dentro.length, suspeitas, por_modelo };
}

function quotaFalso(turnosPorFicheiro, { disponivel = true } = {}) {
  const CACHE = new Map();
  turnosPorFicheiro.forEach((todos, i) => CACHE.set('ficheiro-' + i, { tamanho: 1, mtime: 1, r: { todos } }));
  return {
    CACHE,
    filtrar: filtrarFalso,
    pesoDe: (m) => ({ peso: 1, familia: /opus/i.test(m) ? 'Opus' : 'n/d' }),
    medir: () => (disponivel
      ? { disponivel: true, fonte: 'fonte-de-teste', ressalva: 'ressalva-de-teste' }
      : { disponivel: false, erro: { porque: 'nao encontrei sessoes' } }),
  };
}

const precosFalsos = { PRICES: { 'modelo-caro': { input: 5, output: 25 }, 'modelo-barato': { input: 1, output: 5 } } };

// ── a regra que nasceu de um bug real ────────────────────────────────────────

test('um modelo fora da tabela sai SEM numero — nunca com o preco de outro', () => {
  const quotaImpl = quotaFalso([[{ ts: AGORA - HORA, mod: 'modelo-desconhecido', in: 1000, out: 1000 }]]);
  const r = spendByModel({ quotaImpl, pricingImpl: precosFalsos, agora: AGORA, horas: 5 });

  assert.equal(r.modelos.length, 1);
  assert.equal(r.modelos[0].usd, null, 'inventou um custo para um modelo que nao esta na tabela');
  assert.equal(r.modelos[0].preco, null);
  assert.match(r.modelos[0].porque, /nao se inventa um preco/);
  assert.deepEqual(r.sem_preco, ['modelo-desconhecido']);
  assert.equal(r.parcial, true, 'um total a que falta um modelo tem de se declarar parcial');
  assert.equal(r.total_usd, null, 'nenhum modelo tinha preco: o total nao pode ser 0 — 0 le-se como "de graca"');
});

test('precoDe() nao tem fallback nenhum, por construcao', () => {
  assert.deepEqual(precoDe('modelo-caro', precosFalsos.PRICES), { input: 5, output: 25 });
  assert.equal(precoDe('inexistente', precosFalsos.PRICES), null);
  assert.equal(precoDe('modelo-caro', {}), null);
  assert.equal(precoDe('modelo-caro', null), null);
});

test('o total conta os modelos com preco e marca-se parcial quando falta algum', () => {
  const quotaImpl = quotaFalso([[
    { ts: AGORA - HORA, mod: 'modelo-caro', in: 1_000_000, out: 1_000_000 },
    { ts: AGORA - HORA, mod: 'sem-tabela', in: 9_000_000, out: 9_000_000 },
  ]]);
  const r = spendByModel({ quotaImpl, pricingImpl: precosFalsos, agora: AGORA, horas: 5 });
  assert.equal(r.total_usd, 30, '1M in a $5 + 1M out a $25');
  assert.equal(r.parcial, true);
  assert.deepEqual(r.sem_preco, ['sem-tabela']);
});

// ── honestidade dos numeros ──────────────────────────────────────────────────

test('marcadores internos do Claude Code nao contam como modelo', () => {
  // Nota: um turno `<synthetic>` traz sempre out=0 e CONTA para o racio de
  // suspeita da guarda #25941 — porque e assim que o quota.js o conta, e este
  // modulo nao pode divergir do motor congelado num numero que o motor publica.
  // Na pratica sao 6 em 1066 turnos (0,5%), muito abaixo do limiar de 20%.
  for (const marcador of NAO_E_MODELO) {
    const reais = Array.from({ length: 5 }, () => ({ ts: AGORA - HORA, mod: 'modelo-caro', in: 200_000, out: 1_000 }));
    const quotaImpl = quotaFalso([[{ ts: AGORA - HORA, mod: marcador, in: 0, out: 0 }, ...reais]]);
    const r = spendByModel({ quotaImpl, pricingImpl: precosFalsos, agora: AGORA, horas: 5 });
    assert.deepEqual(r.modelos.map((m) => m.modelo), ['modelo-caro'], marcador + ' entrou na lista de modelos');
    assert.equal(r.ignorados[0].modelo, marcador);
    assert.equal(r.parcial, false, marcador + ' nao pode sujar o total');
  }
});

test('output_tokens de marcador (claude-code#25941): as saidas vao a n/d e o custo fica a entradas', () => {
  // 4 de 5 turnos com out ≤3 = 80%, muito acima do limiar de 20%.
  const todos = [
    { ts: AGORA - HORA, mod: 'modelo-caro', in: 1_000_000, out: 1 },
    { ts: AGORA - HORA, mod: 'modelo-caro', in: 0, out: 2 },
    { ts: AGORA - HORA, mod: 'modelo-caro', in: 0, out: 1 },
    { ts: AGORA - HORA, mod: 'modelo-caro', in: 0, out: 3 },
    { ts: AGORA - HORA, mod: 'modelo-caro', in: 0, out: 5000 },
  ];
  const r = spendByModel({ quotaImpl: quotaFalso([todos]), pricingImpl: precosFalsos, agora: AGORA, horas: 5 });
  assert.equal(r.modelos[0].saidas, null, 'publicou saidas que sabe serem marcadores');
  assert.equal(r.modelos[0].usd, 5, 'so as entradas: 1M a $5');
  assert.equal(r.parcial, true);
  assert.match(r.aviso_saidas, /25941/);
});

test('a janela e respeitada: o que esta fora dela nao entra na conta', () => {
  const todos = [
    { ts: AGORA - 1 * HORA, mod: 'modelo-caro', in: 1_000_000, out: 0 },
    { ts: AGORA - 50 * HORA, mod: 'modelo-caro', in: 9_000_000, out: 0 },
  ];
  const curta = spendByModel({ quotaImpl: quotaFalso([todos]), pricingImpl: precosFalsos, agora: AGORA, horas: 5 });
  const longa = spendByModel({ quotaImpl: quotaFalso([todos]), pricingImpl: precosFalsos, agora: AGORA, horas: 168 });
  assert.equal(curta.total_usd, 5);
  assert.equal(longa.total_usd, 50);
  assert.equal(curta.janela.horas, 5);
});

test('varios ficheiros somam-se, e a ordem e por turnos decrescente', () => {
  const quotaImpl = quotaFalso([
    [{ ts: AGORA - HORA, mod: 'modelo-barato', in: 100, out: 100 }],
    [{ ts: AGORA - HORA, mod: 'modelo-caro', in: 100, out: 100 }, { ts: AGORA - HORA, mod: 'modelo-caro', in: 100, out: 100 }],
  ]);
  const r = spendByModel({ quotaImpl, pricingImpl: precosFalsos, agora: AGORA, horas: 5 });
  assert.deepEqual(r.modelos.map((m) => m.modelo), ['modelo-caro', 'modelo-barato']);
  assert.equal(r.modelos[0].turnos, 2);
});

test('sem sessoes para ler, diz que nao sabe — nao devolve zeros', () => {
  const r = spendByModel({ quotaImpl: quotaFalso([], { disponivel: false }), pricingImpl: precosFalsos, agora: AGORA });
  assert.equal(r.disponivel, false);
  assert.equal(r.total_usd, null);
  assert.match(r.porque, /sessoes/);
});

test('a ressalva e a natureza do numero viajam sempre com ele', () => {
  const quotaImpl = quotaFalso([[{ ts: AGORA - HORA, mod: 'modelo-caro', in: 10, out: 10 }]]);
  const r = spendByModel({ quotaImpl, pricingImpl: precosFalsos, agora: AGORA, horas: 5 });
  assert.equal(r.ressalva, 'ressalva-de-teste', 'perdeu a ressalva de limite inferior do quota.js');
  assert.match(r.natureza, /NOT money spent/, 'um painel que diz "gastaste" a quem paga subscricao esta a mentir');
  assert.equal(r.fonte, 'fonte-de-teste');
});

// ── o contrato com o motor congelado ─────────────────────────────────────────

test('agregarPorModelo consome o CACHE do quota.js tal como ele e', () => {
  const cache = new Map([
    ['a', { tamanho: 1, mtime: 1, r: { todos: [{ ts: AGORA, mod: 'm', in: 1, out: 2 }] } }],
    ['b', { tamanho: 1, mtime: 1 }],            // entrada sem `r` — acontece
    ['c', { tamanho: 1, mtime: 1, r: {} }],     // `r` sem `todos` — acontece
  ]);
  const { modelos, turnos } = agregarPorModelo(cache, filtrarFalso, 0);
  assert.equal(turnos, 1, 'entradas de cache incompletas nao podem rebentar nem contar a dobrar');
  assert.equal(modelos.get('m').saidas, 2);
});

test('a familia de cada modelo vem do quota.js, nao de uma segunda tabela aqui', () => {
  const quotaImpl = quotaFalso([[{ ts: AGORA - HORA, mod: 'modelo-caro', in: 1, out: 1 }]]);
  quotaImpl.pesoDe = (m) => ({ peso: 9, familia: 'CARIMBO-' + m });
  const r = spendByModel({ quotaImpl, pricingImpl: precosFalsos, agora: AGORA, horas: 5 });
  assert.equal(r.modelos[0].familia, 'CARIMBO-modelo-caro');
});

// ── a tabela de precos real ──────────────────────────────────────────────────

test('a familia Claude 5 esta na tabela de precos e nao cai no fallback', async () => {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const pricing = req('../../router/pricing.js');
  for (const [id, esperado] of [
    ['claude-opus-5', { input: 5.0, output: 25.0 }],
    ['claude-sonnet-5', { input: 2.0, output: 10.0 }],
    ['claude-fable-5', { input: 10.0, output: 50.0 }],
  ]) {
    assert.ok(pricing.PRICES[id], id + ' faltava na tabela: seria cobrado ao preco de Sonnet sem ninguem dar por isso');
    assert.equal(pricing.PRICES[id].input, esperado.input, id + ' input');
    assert.equal(pricing.PRICES[id].output, esperado.output, id + ' output');
  }
  assert.equal(pricing.PRICES['claude-fable-5'].tier, undefined,
    'Fable nunca pode ser alcancavel por escolha de tier: T5 e so por @fable');
});
