/**
 * precificavel-nao-rotavel.test.mjs
 *
 * Logica em fixtures sinteticas; UM portao ancorado nos ficheiros reais no fim.
 *
 * O teste que interessa e o penultimo — `ARAME`. Um portao que so passa nunca
 * provou nada: ele semeia o estado proibido (fable com preco) e exige que o
 * modulo o acuse. Sem ele, os assertos ancorados a seguir podiam estar verdes
 * por o codigo nao fazer nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fs from 'node:fs';

import {
  semTierNoSsot, temScoreMedido, tiersNaoDeclarados, rotaveisPorEngano, auditarRota,
  rosterOptInOnly, semGuardaNoMotor, auditarGuarda,
} from './precificavel-nao-rotavel.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../..');
const require = createRequire(import.meta.url);

// ── logica pura, fixtures sinteticas ────────────────────────────────────────

test('semTierNoSsot: precificado e sem tier — "priceable, not routable"', () => {
  const ssot = {
    comTier: { input: 5, output: 25, tier: 'T3' },
    semTier: { input: 10, output: 50 },
  };
  assert.deepEqual(semTierNoSsot(ssot), ['semTier']);
});

test('semTierNoSsot ignora modelos gratis — 0/0 sem tier e entrada incompleta, nao doutrina', () => {
  assert.deepEqual(semTierNoSsot({ local: { input: 0, output: 0 } }), []);
});

test('semTierNoSsot ignora entradas sem preco nenhum', () => {
  assert.deepEqual(semTierNoSsot({ m: { strengths: ['x'] } }), []);
  assert.deepEqual(semTierNoSsot(null), []);
});

test('temScoreMedido exige measured:true E score numerico', () => {
  const celulas = [
    { model: 'a', measured: true, score: 0.9 },
    { model: 'b', measured: true, score: null },   // citada mas qualitativa
    { model: 'c', measured: false, score: 0.9 },   // estimada, nao medida
  ];
  assert.equal(temScoreMedido(celulas, 'a'), true);
  assert.equal(temScoreMedido(celulas, 'b'), false);
  assert.equal(temScoreMedido(celulas, 'c'), false);
  assert.equal(temScoreMedido(celulas, 'inexistente'), false);
  assert.equal(temScoreMedido(null, 'a'), false);
});

test('tiersNaoDeclarados acusa o tier que aparece do nada no snapshot', () => {
  const ssot = { m: { input: 10, output: 50 } };           // sem tier: nao rotavel
  const snap = { models: { m: { tier: 'T5' } } };
  const d = tiersNaoDeclarados(snap, ssot);
  assert.equal(d.length, 1);
  assert.equal(d[0].tier_no_snapshot, 'T5');
});

test('tiersNaoDeclarados cala-se quando a divergencia esta escrita nos dados', () => {
  const ssot = { m: { input: 10, output: 50 } };
  const snap = { models: { m: { tier: 'T5', tier_diverges_from_ssot: 'porque sim, e explicado' } } };
  assert.deepEqual(tiersNaoDeclarados(snap, ssot), []);
});

test('rotaveisPorEngano: preco SEM score medido nao chega', () => {
  const ssot = { m: { input: 10, output: 50 } };
  const snap = { models: { m: { input_per_mtok: 10, output_per_mtok: 50 } } };
  assert.deepEqual(rotaveisPorEngano(snap, ssot, []), []);
});

test('rotaveisPorEngano: score medido SEM preco nao chega', () => {
  const ssot = { m: { input: 10, output: 50 } };
  const snap = { models: { m: { input_per_mtok: null, pricing_status: 'pending' } } };
  const celulas = [{ model: 'm', measured: true, score: 0.9 }];
  assert.deepEqual(rotaveisPorEngano(snap, ssot, celulas), []);
});

test('rotaveisPorEngano: as duas juntas e que sao a violacao', () => {
  const ssot = { m: { input: 10, output: 50 } };
  const snap = { models: { m: { input_per_mtok: 10, output_per_mtok: 50 } } };
  const celulas = [{ model: 'm', measured: true, score: 0.9 }];
  const r = rotaveisPorEngano(snap, ssot, celulas);
  assert.equal(r.length, 1);
  assert.equal(r[0].modelo, 'm');
});

// ── o arame: prova que o portao dispara ─────────────────────────────────────

test('ARAME: o fable-5 real REUNE as duas condicoes de rotabilidade, nos ficheiros do repo', () => {
  // Ate 2026-08-25 este teste tinha de SEMEAR o preco para provar que o modulo
  // acusava. Ja nao precisa: o snapshot traz o preco de verdade, porque a
  // guarda passou a viver no motor. O teste continua a valer, e vale MAIS —
  // agora afirma que a condicao de violacao esta REALMENTE reunida no repo, que
  // e a premissa de que todos os assertos a seguir dependem.
  const snapshot = require(path.join(RAIZ, 'data/pricing-snapshot-2026-05-27.json'));
  const { PRICES } = require(path.join(RAIZ, 'tools/router/pricing.js'));
  const { cells } = require(path.join(RAIZ, 'data/benchmark-seed-2026.json'));

  // O snapshot tem de trazer o preco do SSOT, sem divergir dele: um snapshot que
  // "esquece" o preco volta a cumprir o invariante por omissao, e o portao
  // abaixo passa a estar verde por nao haver nada que julgar.
  const ent = snapshot.models['claude-fable-5'];
  assert.equal(ent.input_per_mtok, PRICES['claude-fable-5'].input,
    'o snapshot deixou de trazer o preco de entrada que o SSOT declara');
  assert.equal(ent.output_per_mtok, PRICES['claude-fable-5'].output,
    'o snapshot deixou de trazer o preco de saida que o SSOT declara');

  const r = rotaveisPorEngano(snapshot, PRICES, cells);
  assert.ok(
    r.some((x) => x.modelo === 'claude-fable-5'),
    'o fable-5 deixou de reunir preco + celula medida. Se foi de proposito, este ficheiro '
    + 'precisa de ser reescrito; se nao foi, os assertos a seguir passaram a nao provar nada.',
  );
});

test('ARAME 2: sem roster legivel no motor, o portao TEM de falhar — nunca passar em branco', () => {
  // O modo de falha mais perigoso de um portao que le codigo-fonte: o `decide-agent.ts`
  // muda de forma, a regex deixa de bater, e "ninguem sem guarda" fica verde por
  // nao ter encontrado guarda nenhuma. Por isso `rosterOptInOnly` devolve `null`
  // e nao `[]`, e por isso isto e um teste e nao um comentario.
  assert.equal(rosterOptInOnly('sem declaracao nenhuma aqui'), null);
  assert.equal(rosterOptInOnly(null), null);
  const g = auditarGuarda({ models: {} }, {}, [], 'motor irreconhecivel');
  assert.equal(g.sem_guarda, null, 'roster ilegivel tem de propagar null, nunca uma lista vazia');
});

test('semGuardaNoMotor cobre pelas MESMAS duas vias que o isOptInOnly do motor', () => {
  const rotaveis = [{ modelo: 'pelo-roster' }, { modelo: 'pelo-tier' }, { modelo: 'descoberto' }];
  const snap = { models: { 'pelo-tier': { tier: 'T5' }, descoberto: { tier: 'T3' } } };
  assert.deepEqual(semGuardaNoMotor(rotaveis, ['pelo-roster'], snap), ['descoberto']);
  // Sem nenhuma das vias, todos ficam a descoberto — o portao acusa mesmo.
  assert.deepEqual(semGuardaNoMotor(rotaveis, [], { models: {} }),
    ['pelo-roster', 'pelo-tier', 'descoberto']);
});

// ── o portao: ancorado nos ficheiros reais ──────────────────────────────────

test('PORTAO: nenhum modelo "priceable, not routable" ficou auto-escolhivel', () => {
  const snapshot = require(path.join(RAIZ, 'data/pricing-snapshot-2026-05-27.json'));
  const { PRICES } = require(path.join(RAIZ, 'tools/router/pricing.js'));
  const { cells } = require(path.join(RAIZ, 'data/benchmark-seed-2026.json'));

  const r = auditarRota(snapshot, PRICES, cells);

  // ANTES de 2026-08-25 este asserto exigia `rotaveis_por_engano == []`, e a
  // unica forma de o cumprir era manter o snapshot sem preco. Cumpria-se por
  // omissao. Agora a guarda vive no motor e os dados podem estar completos: o
  // que se exige e que TODO o modelo que reune as condicoes esteja coberto.
  const fonte = fs.readFileSync(path.join(RAIZ, 'packages/router/src/decide-agent.ts'), 'utf8');
  const g = auditarGuarda(snapshot, PRICES, cells, fonte);

  assert.notEqual(
    g.roster, null,
    'nao consegui ler OPT_IN_ONLY_MODELS de packages/router/src/decide-agent.ts. Ou a guarda '
    + 'foi removida — e o invariante T5 caiu — ou mudou de forma e este portao ficou cego. '
    + 'As duas exigem alguem a olhar; nenhuma pode passar em silencio.',
  );

  assert.deepEqual(
    g.sem_guarda, [],
    'modelo(s) que o SSOT declarou nao-rotaveis (preco sem tier, tools/router/pricing.js) reunem '
    + 'celula medida E preco no snapshot — as duas condicoes que o decideAgent exige para ordenar '
    + 'por TES — e NAO estao cobertos pela guarda de opt-in-only do motor (nem no roster nomeado '
    + 'nem por tier T5 no snapshot). Medido a 2026-08-25: nessa situacao o decideAgent devolve o '
    + 'modelo sem ninguem ter escrito "@fable" (reasoning.science, TES 3784). Corrigir em '
    + 'packages/router/src/decide-agent.ts -> OPT_IN_ONLY_MODELS. '
    + JSON.stringify(g.sem_guarda),
  );

  assert.deepEqual(
    r.tiers_nao_declarados, [],
    'o snapshot da um "tier" a um modelo que o SSOT deixou de proposito sem tier, e nao explica '
    + 'porque. Declarar em `tier_diverges_from_ssot`, na propria entrada do modelo: '
    + JSON.stringify(r.tiers_nao_declarados),
  );

  // Ancora de existencia: se o fable sair do SSOT ou ganhar um tier la, os dois
  // assertos acima ficam vacuamente verdadeiros e este teste deixa de vigiar
  // seja o que for. Entao exige-se que o caso conhecido continue a existir.
  assert.ok(
    r.sem_tier_no_ssot.includes('claude-fable-5'),
    'claude-fable-5 deixou de estar "precificado e sem tier" em tools/router/pricing.js. Se foi '
    + 'de proposito, este portao precisa de ser reescrito; se nao foi, o invariante T5 caiu.',
  );
});
