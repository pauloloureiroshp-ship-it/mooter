/**
 * faixa-operate.test.mjs — o Ledger conta uma historia; faltava-lhe o presente.
 *
 * O Ledger le-se de cima a baixo e acaba. O estado do loop e o que fazer a
 * seguir viviam noutra pagina, a um endereco que o dono nao decora — e a prova
 * disso sao os `.command` do `_handoff/`, que existem para fazer o que uma
 * linha de texto faz.
 *
 * A parte que estes testes guardam com mais forca e a IDADE. Uma pagina
 * carimbada continua a parecer certa depois de deixar de o ser: e o defeito
 * exacto que fez nascer o teste "a casca nao tem numeros proprios" (a v4 tinha
 * 2094 citacoes cravadas no HTML). Agendar a reconstrucao reduz a frequencia do
 * problema; o carimbo visivel e o que impede que ele minta.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CASCA = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-ledger-shell.html'), 'utf8');
const SKILL = fs.readFileSync(path.join(REPO, '.claude', 'skills', 'moo-pilot', 'SKILL.md'), 'utf8');
const PLIST = path.join(REPO, 'tools', 'ops', 'moo', 'launchd', 'ai.mooter.snapshot.plist');

// ── a faixa existe e faz alguma coisa ───────────────────────────────────────

test('a faixa esta na pagina, com estado, atalho e idade', () => {
  assert.match(CASCA, /class="operate" id="operate"/);
  for (const id of ['op-dot', 'op-estado', 'op-panel', 'op-idade']) {
    assert.match(CASCA, new RegExp(`id="${id}"`), `falta ${id}`);
  }
});

test('o atalho aponta para o cockpit desta maquina, com esquema clicavel', () => {
  assert.match(CASCA, /href="http:\/\/127\.0\.0\.1:4290\/panel"/);
});

test('o comando de reconstruir e COPIAVEL, nao so legivel', () => {
  assert.match(CASCA, /data-copy="node tools\/cockpit\/runner\/build-ledger-snapshot\.mjs"/);
});

test('no snapshot carimbado o atalho para o device esconde-se', () => {
  assert.match(CASCA, /alvo\.hidden = mode !== 'live';/,
    'uma copia carimbada nao tem device — um link que nao abre e pior do que nenhum');
});

// ── a idade nao pode ser discreta ───────────────────────────────────────────

test('a idade sai do `generated_at` do payload, nao do relogio do render', () => {
  assert.match(CASCA, /Date\.parse\(S\.generated_at\)/);
});

test('passadas 24 h o numero PINTA-SE — cinzento discreto e nao ser lido', () => {
  assert.match(CASCA, /SNAPSHOT_VELHO_MS = 24\*3600\*1000/);
  assert.match(CASCA, /idade > SNAPSHOT_VELHO_MS \? ' velho' : ''/);
  assert.match(CASCA, /\.operate \.idade\.velho\{[^}]*color:#8A3B2A/,
    'a classe existe mas nao muda nada — um aviso invisivel nao avisa');
});

test('sem `generated_at` legivel diz n/d, nunca "0s"', () => {
  assert.match(CASCA, /idade == null \? 'stamped n\/d'/);
});

test('a faixa actualiza-se ao segundo, com o resto do carimbo', () => {
  assert.match(CASCA, /function tickFresh\(\)\{[\s\S]{0,300}renderOperate\(\);/);
});

// ── nao parte o resto ───────────────────────────────────────────────────────

test('a faixa nao tapa o rodape', () => {
  assert.match(CASCA, /body\{padding-bottom:52px\}/);
});

test('e sai do retrato — senao carimbava-se por cima do fim da pagina', () => {
  assert.match(CASCA, /body\[data-capture\] \.operate\{display:none\}/);
  assert.match(CASCA, /body\[data-capture\]\{padding-bottom:0\}/);
});

// ── o agendamento ───────────────────────────────────────────────────────────

test('o molde do snapshot e diario, corre o construtor real, e e um MOLDE', () => {
  const p = fs.readFileSync(PLIST, 'utf8');
  assert.match(p, /StartCalendarInterval/);
  assert.match(p, /<key>Hour<\/key><integer>6<\/integer>/);
  assert.match(p, /build-ledger-snapshot\.mjs|__SNAPSHOT__/);
  assert.match(p, /RunAtLoad/, 'uma maquina que esteve desligada tem o instantaneo mais velho de todos');
  assert.doesNotMatch(p, /<key>KeepAlive<\/key>/);
  assert.match(p, /__NODE__/, 'um caminho absoluto commitado falha em silencio noutra maquina');
});

// ── a skill devolve o endereco ──────────────────────────────────────────────

test('a skill devolve os DOIS enderecos, com http:// para serem clicaveis', () => {
  assert.match(SKILL, /http:\/\/127\.0\.0\.1:4290\/panel/);
  assert.match(SKILL, /http:\/\/127\.0\.0\.1:4290\/ledger/);
  assert.match(SKILL, /Devolve SEMPRE o endere[cç]o vivo/);
});

test('a skill manda dizer que o F10 esta em baixo em vez de dar um link morto', () => {
  assert.match(SKILL, /npm run pilot:status/);
  assert.match(SKILL, /um link que\s*\n?não abre é pior do que nenhum|link que\s+não abre/);
});
