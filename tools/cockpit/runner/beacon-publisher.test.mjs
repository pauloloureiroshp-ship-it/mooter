/**
 * beacon-publisher.test.mjs
 *
 * O teste que importa e o terceiro: este modulo corre dentro do VAULT PESSOAL
 * do dono, que pode ter trabalho por enviar (medido a 2026-08-19: 5 commits).
 * Um publicador que empurra o que encontrou e indistinguivel de um acidente.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { publicarBeacon, estaNaHora, ligado, MINUTOS_OMISSAO } from './beacon-publisher.mjs';

const FICH = '50-fleet/mac.json';

/** Um git falso que grava o que lhe pediram e responde ao que for preciso. */
function gitFalso(respostas = {}) {
  const chamadas = [];
  const run = (bin, args) => {
    chamadas.push(args.join(' '));
    const k = args[0] + (args[1] ? ' ' + args[1] : '');
    if (Object.prototype.hasOwnProperty.call(respostas, k)) {
      const r = respostas[k];
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? r(chamadas) : r;
    }
    return '';
  };
  return { run, chamadas };
}

const existeSempre = () => true;

// ── nasce desligado ─────────────────────────────────────────────────────────

test('sem a variavel de ambiente, o publicador nao corre', () => {
  assert.equal(ligado({}), false, 'escrever no vault de alguem nao pode ser o comportamento por omissao');
  assert.equal(ligado({ MOO_PUBLICAR_BEACON: '0' }), false);
  assert.equal(ligado({ MOO_PUBLICAR_BEACON: 'sim' }), false, 'so o 1 conta: um valor qualquer nao liga isto');
  assert.equal(ligado({ MOO_PUBLICAR_BEACON: '1' }), true);
});

// ── a trava que protege trabalho alheio ─────────────────────────────────────

test('NAO publica se houver trabalho de outra pessoa em staging', () => {
  const g = gitFalso({
    remote: 'origin',
    'diff --cached': '00-core/uma-nota.md\n20-decisions/outra.md',
  });
  const r = publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  assert.equal(r.ok, false);
  assert.match(r.porque, /trabalho alheio/);
  assert.ok(!g.chamadas.some((c) => c.startsWith('commit')), 'nem sequer chegou a tentar commitar');
  assert.ok(!g.chamadas.some((c) => c.startsWith('push')), 'e muito menos empurrar');
});

test('o `git add` nomeia o ficheiro exacto — nunca um -A, nem aqui', () => {
  let vez = 0;
  const g = gitFalso({
    remote: 'origin',
    // vazio antes do add, com o beacon depois
    'diff --cached': () => (vez++ === 0 ? '' : FICH),
  });
  publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  const add = g.chamadas.find((c) => c.startsWith('add'));
  assert.equal(add, `add -- ${FICH}`);
  assert.ok(!g.chamadas.some((c) => c.includes('-A')), 'um -A aqui apanharia o vault inteiro');
});

test('empurra com rebase, e nunca com force', () => {
  let vez = 0;
  const g = gitFalso({ remote: 'origin', 'diff --cached': () => (vez++ === 0 ? '' : FICH) });
  const r = publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  assert.equal(r.ok, true);
  assert.ok(g.chamadas.includes('pull --rebase --autostash'), 'dois devices em paralelo nao podem perder o beacon um do outro');
  assert.ok(g.chamadas.includes('push'));
  assert.ok(!g.chamadas.some((c) => c.includes('--force')), 'nada aqui justifica um force num repo pessoal');
});

// ── recusa-se em vez de fingir ──────────────────────────────────────────────

test('sem vault, sem git ou sem remoto: recusa e diz porque', () => {
  const g = gitFalso({ remote: '' });
  assert.match(publicarBeacon('', FICH, { runImpl: g.run, existsImpl: existeSempre }).porque, /sem vault/);
  assert.match(publicarBeacon('/v', FICH, { runImpl: g.run, existsImpl: () => false }).porque, /sem vault/);
  assert.match(publicarBeacon('/v', FICH, { runImpl: g.run, existsImpl: existeSempre }).porque, /remoto/);
});

test('um beacon que nao mudou nao gera commit nenhum', () => {
  const g = gitFalso({ remote: 'origin', 'diff --cached': '' });
  const r = publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  assert.equal(r.ok, true);
  assert.equal(r.publicado, null);
  assert.ok(!g.chamadas.some((c) => c.startsWith('commit')), 'milhares de commits vazios era exactamente o que se queria evitar');
});

test('uma falha do git NAO derruba o loop — devolve-se, nao se lanca', () => {
  let vez = 0;
  const g = gitFalso({
    remote: 'origin',
    'diff --cached': () => (vez++ === 0 ? '' : FICH),
    push: new Error('fatal: could not read Username'),
  });
  const r = publicarBeacon('/vault', FICH, { runImpl: g.run, existsImpl: existeSempre });
  assert.equal(r.ok, false);
  assert.match(r.porque, /Username/, 'o beacon e conveniencia; a GPU e o trabalho');
});

// ── o relogio, e nao a ronda ────────────────────────────────────────────────

test('publica por relogio: uma ronda dura segundos, isto nao', () => {
  const agora = 1_760_000_000_000;
  assert.equal(estaNaHora(null, { agora }), true, 'a primeira vez publica sempre');
  assert.equal(estaNaHora(agora - 60_000, { agora }), false, 'um minuto depois, nao');
  assert.equal(estaNaHora(agora - MINUTOS_OMISSAO * 60_000, { agora }), true);
});
