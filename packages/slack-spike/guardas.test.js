'use strict';
/** ⚠️ THROWAWAY — spike Slack. Ver README.md e morte.js. Nao copiar para o produto. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const morte = require('./morte.js');
const gate = require('./gate.js');
const { criarAllowlist } = require('./allowlist.js');
const denylist = require('./denylist.js');

// ── morte declarada (o spike nasce com data de morte) ─────────────────────
test('morte · SPIKE_MORRE_EM e uma data real, nao um comentario', () => {
  assert.match(morte.SPIKE_MORRE_EM, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Number.isFinite(Date.parse(morte.SPIKE_MORRE_EM)));
});

test('morte · antes do prazo esta vivo; depois esta morto e diz porque', () => {
  const antes = morte.estadoDeMorte(new Date('2026-08-18T00:00:00Z'));
  assert.equal(antes.morto, false);
  assert.ok(antes.dias_restantes > 0);

  const depois = morte.estadoDeMorte(new Date('2099-01-01T00:00:00Z'));
  assert.equal(depois.morto, true);
  assert.match(depois.porque, /morre|prazo|arquiv/i);
});

// ── o gate do MODO VIVO (o `if` que o masterprompt manda escrever) ────────
function comSync(conteudo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-sync-'));
  const p = path.join(dir, 'SYNC.md');
  if (conteudo != null) fs.writeFileSync(p, conteudo, 'utf8');
  return p;
}

test('gate · SEM a linha no SYNC.md o modo vivo esta TRANCADO', () => {
  const r = gate.modoVivo({ syncPath: comSync('# SYNC\n\nkimi-egress ainda aberta.\n') });
  assert.equal(r.vivo, false);
  assert.match(r.porque, /kimi-egress/i);
});

test('gate · COM a linha exacta o modo vivo destrava', () => {
  const r = gate.modoVivo({
    syncPath: comSync('# SYNC\n\nkimi-egress FECHADA — slack-spike destravado\n\noutra coisa\n'),
  });
  assert.equal(r.vivo, true);
});

test('gate · fail-closed: SYNC.md inexistente NAO destrava', () => {
  const r = gate.modoVivo({ syncPath: path.join(os.tmpdir(), 'nao-existe-' + Date.now(), 'SYNC.md') });
  assert.equal(r.vivo, false);
  assert.match(r.porque, /nao (foi )?(lido|encontrado)|ilegivel/i);
});

test('gate · uma linha PARECIDA nao destrava (a frase e um contrato, nao uma pista)', () => {
  const r = gate.modoVivo({ syncPath: comSync('kimi-egress quase fechada — slack-spike quase destravado\n') });
  assert.equal(r.vivo, false);
});

// ── allowlist de UM id, usada nos DOIS caminhos (kimi #1 — ALTO) ──────────
test('allowlist · permite o id de dentro e recusa o de fora', () => {
  const a = criarAllowlist(['U_PAULO']);
  assert.equal(a.permite('U_PAULO').ok, true);
  assert.equal(a.permite('U_ESTRANHO').ok, false);
  assert.match(a.permite('U_ESTRANHO').porque, /allowlist/i);
});

test('allowlist · UM id e um INVARIANTE de codigo, nao um comentario', () => {
  assert.throws(() => criarAllowlist(['U_A', 'U_B']), /um id|1 id|maximo/i);
});

test('allowlist · fail-closed perante lixo', () => {
  assert.throws(() => criarAllowlist([]), /vazia|pelo menos/i);
  const a = criarAllowlist(['U_PAULO']);
  for (const mau of [null, undefined, '', '  ', 42, {}]) {
    assert.equal(a.permite(mau).ok, false, 'devia recusar ' + JSON.stringify(mau));
  }
});

// ── denylist: o NOME de um segredo nunca sai (kimi #5) ────────────────────
test('denylist · apanha segredo.env e outros nomes sensiveis', () => {
  const casos = ['segredo.env', 'prod.env', 'chave.pem', 'id_rsa', '.npmrc', 'serviceAccount.json'];
  for (const c of casos) {
    assert.ok(denylist.nomesSensiveis('mexi em ' + c + ' agora').length > 0, 'devia apanhar ' + c);
  }
});

test('denylist · limpar() remove o NOME e diz o que removeu', () => {
  const r = denylist.limpar('o agente tocou em segredo.env e em README.md');
  assert.ok(!r.texto.includes('segredo.env'), 'o nome do segredo sobreviveu: ' + r.texto);
  assert.ok(r.texto.includes('README.md'), 'limpou de mais');
  assert.equal(r.removidos.length, 1);
});

test('denylist · nao inventa segredos em texto normal', () => {
  const r = denylist.limpar('custo 0.08 USD, modelo claude-opus-5, 4 ficheiros');
  assert.equal(r.removidos.length, 0);
  assert.equal(r.texto, 'custo 0.08 USD, modelo claude-opus-5, 4 ficheiros');
});
