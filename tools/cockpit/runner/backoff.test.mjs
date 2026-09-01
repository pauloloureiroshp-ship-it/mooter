/**
 * backoff.test.mjs — um 503 nao e uma avaria: e um "ainda nao".
 *
 * Medido pelo dono a 2026-09-01: 5/5 fetches ao `/fleet.json` com 4s de
 * espacamento deram 200 OK (~250ms); em rajada (<3s) deram 503 SEM
 * `Retry-After`. As duas cascas batiam de 3 em 3 segundos e nunca recuavam —
 * bater na mesma cadencia depois de um 503 e a unica resposta que
 * garantidamente nao ajuda. E do lado do ecra, "throttled" e "morto" pintavam
 * igual, o que ensina o dono a ignorar os dois.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..', '..');
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PAINEL = semComentarios(fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-pilot-shell.html'), 'utf8'));
const LEDGER = semComentarios(fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-ledger-shell.html'), 'utf8'));

// ── o servidor diz QUANTO esperar ───────────────────────────────────────────

test('TODO 503 deste servidor leva `Retry-After` — nao so o do fleet.json', async () => {
  const { RETRY_AFTER_S } = await import('./f10-server.mjs');
  const src = fs.readFileSync(path.join(AQUI, 'f10-server.mjs'), 'utf8');
  assert.ok(RETRY_AFTER_S >= 4, 'mais curto do que o poll de 3s nao muda nada');
  assert.match(src, /code === 503 \? \{ 'Retry-After'/,
    'o cabecalho tem de sair do sendJson, senao cada 503 novo nasce mudo');
});

test('e nenhum 503 do servidor foi deixado a escrever o cabecalho a mao', () => {
  const src = semComentarios(fs.readFileSync(path.join(AQUI, 'f10-server.mjs'), 'utf8'));
  const quantos = (src.match(/sendJson\(res, 503/g) || []).length;
  assert.ok(quantos >= 3, `esperava >=3 sitios com 503, encontrei ${quantos}`);
});

// ── as duas cascas recuam ───────────────────────────────────────────────────

for (const [nome, casca] of [['painel', PAINEL], ['ledger', LEDGER]]) {
  test(`${nome}: reconhece 503 E 429`, () => {
    assert.match(casca, /status === 503/, `${nome} nao trata 503`);
    assert.match(casca, /status === 429/, `${nome} nao trata 429`);
  });

  test(`${nome}: obedece ao \`Retry-After\` quando ele vem`, () => {
    assert.match(casca, /Retry-After/, `${nome} ignora o que o servidor pediu`);
  });

  test(`${nome}: sem \`Retry-After\`, duplica a espera ate um tecto`, () => {
    assert.match(casca, /\* 2/, `${nome} nao duplica`);
    assert.match(casca, /60000|BACKOFF_MAX_MS/, `${nome} nao tem tecto — pode recuar para sempre`);
  });
}

// ── throttled NAO e uma avaria ──────────────────────────────────────────────

test('PAINEL: um 503 nao conta como falha de ligacao', () => {
  // O ramo do 503 tem de sair da funcao ANTES do `throw`, senao cai no `catch`
  // que incrementa `fails` — e a pagina declarava-se offline por obedecer.
  const bloco = /if \(res\.status === 503 \|\| res\.status === 429\)\{([\s\S]{0,220}?)\}/.exec(PAINEL);
  assert.ok(bloco, 'nao encontrei o ramo de throttle no painel');
  assert.match(bloco[1], /return;/, 'o ramo do 503 tem de sair antes do throw');
  assert.doesNotMatch(bloco[1], /fails\s*\+=/, 'um 503 nao pode contar como falha');
});

test('PAINEL: `throttled` e um estado PROPRIO, nao um sabor de `stale`', () => {
  assert.match(PAINEL, /throttled \? 'throttled'/, 'o estado de confianca nao distingue throttle de stale');
  assert.match(PAINEL, /data-trust="throttled"/, 'sem regra de estilo, o estado novo nao se ve');
  assert.match(PAINEL, /holding off — the device asked for/,
    'o chip tem de explicar que o device RESPONDEU');
});

test('PAINEL: um 200 bom limpa o backoff — senao a pagina fica lenta para sempre', () => {
  assert.match(PAINEL, /backoffMs = 0; backoffAte = 0; throttled = false;/);
});

test('PAINEL: enquanto o backoff dura, nao se bate a porta', () => {
  assert.match(PAINEL, /if \(Date\.now\(\) < backoffAte\) return;/);
});
