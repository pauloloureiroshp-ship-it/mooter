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

import {
  semTierNoSsot, temScoreMedido, tiersNaoDeclarados, rotaveisPorEngano, auditarRota,
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

test('ARAME: precificar o fable-5 real no snapshot real acusa, com os ficheiros do repo', () => {
  // Nao e uma fixture inventada: le o SSOT e o seed REAIS, e so muda a UNICA
  // coisa que o plano refutado propunha mudar — por o preco no snapshot.
  const snapshot = require(path.join(RAIZ, 'data/pricing-snapshot-2026-05-27.json'));
  const { PRICES } = require(path.join(RAIZ, 'tools/router/pricing.js'));
  const { cells } = require(path.join(RAIZ, 'data/benchmark-seed-2026.json'));

  const comPreco = {
    ...snapshot,
    models: {
      ...snapshot.models,
      'claude-fable-5': {
        ...snapshot.models['claude-fable-5'],
        input_per_mtok: PRICES['claude-fable-5'].input,
        output_per_mtok: PRICES['claude-fable-5'].output,
        pricing_status: undefined,
      },
    },
  };

  const r = rotaveisPorEngano(comPreco, PRICES, cells);
  assert.ok(
    r.some((x) => x.modelo === 'claude-fable-5'),
    'o portao NAO acusou o fable-5 precificado. Se isto falha, o arame esta partido e os '
    + 'assertos ancorados a seguir passam por nao fazerem nada.',
  );
});

// ── o portao: ancorado nos ficheiros reais ──────────────────────────────────

test('PORTAO: nenhum modelo "priceable, not routable" ficou auto-escolhivel', () => {
  const snapshot = require(path.join(RAIZ, 'data/pricing-snapshot-2026-05-27.json'));
  const { PRICES } = require(path.join(RAIZ, 'tools/router/pricing.js'));
  const { cells } = require(path.join(RAIZ, 'data/benchmark-seed-2026.json'));

  const r = auditarRota(snapshot, PRICES, cells);

  assert.deepEqual(
    r.rotaveis_por_engano, [],
    'modelo(s) que o SSOT declarou nao-rotaveis (preco sem tier, tools/router/pricing.js) tem '
    + 'AGORA celula medida E preco no snapshot — as duas condicoes que o decideAgent exige para '
    + 'ordenar por TES. Medido a 2026-08-25: nessa situacao o decideAgent devolve o modelo sem '
    + 'ninguem ter escrito "@fable". Antes de precificar, o invariante tem de passar a viver em '
    + 'codigo dentro do decideAgent (exige entrada nova no allowlist de Wave 58 + o dono). '
    + JSON.stringify(r.rotaveis_por_engano),
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
