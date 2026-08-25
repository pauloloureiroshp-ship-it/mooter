/**
 * frescura-de-precos.test.mjs
 *
 * A logica e testada com snapshots SINTETICOS (o estado do repo de hoje muda na
 * proxima decisao e um teste ancorado nele parte sozinho — ver o aviso no topo
 * de ci-coerencia.test.mjs).
 *
 * No fim ha UM teste ancorado, de proposito: e o portao. Sem ele isto seria uma
 * biblioteca bonita que nunca acusa nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  estaPending, idadeEmDias, divergencias, falsosPending, ausentesDoSsot, auditar,
} from './frescura-de-precos.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../..');
const require = createRequire(import.meta.url);

// ── logica pura, fixtures sinteticas ────────────────────────────────────────

test('estaPending: declarado, ou preco em falta, ou entrada corrompida', () => {
  assert.equal(estaPending({ pricing_status: 'pending', input_per_mtok: 5 }), true);
  assert.equal(estaPending({ input_per_mtok: null, output_per_mtok: null }), true);
  assert.equal(estaPending({ input_per_mtok: 5, output_per_mtok: 25 }), false);
  assert.equal(estaPending(null), true);
});

test('idadeEmDias conta a partir de last_verified_at, nao de snapshot_date', () => {
  const snap = { snapshot_date: '2026-05-27', last_verified_at: '2026-08-25' };
  assert.equal(idadeEmDias(snap, '2026-08-25'), 0);
  assert.equal(idadeEmDias(snap, '2026-09-04'), 10);
});

test('sem data nenhuma devolve null — ignorancia, nunca 0', () => {
  // Um 0 aqui leria-se "verificado hoje". E a classe de defeito que o PR #385
  // passou uma wave inteira a arrancar: zero fabricado onde falta medicao.
  assert.equal(idadeEmDias({}, '2026-08-25'), null);
  assert.equal(idadeEmDias({ last_verified_at: 'nao-e-uma-data' }, '2026-08-25'), null);
});

test('auditar trata "sem data" como estagnado', () => {
  const r = auditar({ models: {} }, {}, '2026-08-25');
  assert.equal(r.idade_dias, null);
  assert.equal(r.estagnado, true);
});

test('divergencias acusa preco contradito pelo SSOT vivo', () => {
  const snap = { models: { m: { input_per_mtok: 5, output_per_mtok: 25 } } };
  assert.deepEqual(divergencias(snap, { m: { input: 5, output: 25 } }), []);
  const d = divergencias(snap, { m: { input: 8, output: 25 } });
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].vivo, { input: 8, output: 25 });
});

test('falsosPending: "sem fonte" enquanto o repo tem o preco', () => {
  const snap = { models: { m: { input_per_mtok: null, pricing_status: 'pending' } } };
  assert.deepEqual(falsosPending(snap, {}), []); // pending honesto: ninguem sabe o preco
  const f = falsosPending(snap, { m: { input: 5, output: 25 } });
  assert.equal(f.length, 1);
  assert.equal(f[0].modelo, 'm');
});

test('ausentesDoSsot: snapshot precifica um modelo que o SSOT vivo nao conhece', () => {
  const snap = { models: { fantasma: { input_per_mtok: 5, output_per_mtok: 25 } } };
  assert.deepEqual(ausentesDoSsot(snap, {}), ['fantasma']);
  assert.deepEqual(ausentesDoSsot(snap, { fantasma: { input: 5, output: 25 } }), []);
});

// ── o portao: ancorado nos ficheiros reais ──────────────────────────────────

test('PORTAO: o snapshot de precos nao mente ao router de custo', () => {
  const snapshot = require(path.join(RAIZ, 'data/pricing-snapshot-2026-05-27.json'));
  const { PRICES } = require(path.join(RAIZ, 'tools/router/pricing.js'));
  const hoje = new Date().toISOString().slice(0, 10);

  const r = auditar(snapshot, PRICES, hoje, 30);

  assert.deepEqual(
    r.falsos_pending, [],
    'modelo(s) marcados "pending" no snapshot com preco no SSOT vivo. decide-agent.ts nunca os '
    + 'escolhe ("you cannot rank what you cannot price") apesar de o preco estar no repo: '
    + JSON.stringify(r.falsos_pending),
  );

  assert.deepEqual(
    r.divergencias, [],
    'o snapshot contradiz tools/router/pricing.js: ' + JSON.stringify(r.divergencias),
  );

  assert.equal(
    r.estagnado, false,
    `precos verificados ha ${r.idade_dias} dias (limite ${r.limite_dias}). Re-verificar contra `
    + 'tools/router/pricing.js e actualizar last_verified_at no snapshot. Nunca inventar um preco: '
    + 'sem fonte, o modelo fica pricing_status "pending".',
  );
});
