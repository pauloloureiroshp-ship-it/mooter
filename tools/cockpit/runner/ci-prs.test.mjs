/**
 * ci-prs.test.mjs — "zero" e "nao perguntei" nao sao a mesma coisa.
 *
 * Este bloco do Ledger dizia `n/d` por nunca ter perguntado, e a decisao foi
 * alimenta-lo em vez de o remover: os PRs e o CI sao a unica parte do trabalho
 * deste projecto que existe FORA da maquina do dono. O risco de ligar e obvio e
 * e o que estes testes guardam: um `gh` sem sessao a devolver nada podia virar
 * "0 PRs abertos, tudo verde" — que e a mentira mais confortavel que este
 * ficheiro podia contar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { ciEPrs, TIMEOUT_MS, CORRIDAS } = await import('./ci-prs.mjs');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const gh = (mapa) => (bin, args) => {
  assert.equal(bin, 'gh');
  const qual = args[0] === 'pr' ? 'pr' : 'run';
  if (mapa[qual] instanceof Error) throw mapa[qual];
  return JSON.stringify(mapa[qual]);
};

// ── n/d COM MOTIVO, nunca zero ──────────────────────────────────────────────

test('sem `gh` instalado diz isso — nao diz "0 PRs"', () => {
  const r = ciEPrs({ execImpl: () => { const e = new Error('spawn gh ENOENT'); throw e; } });
  assert.equal(r.disponivel, false);
  assert.match(r.porque, /^n\/d/);
  assert.match(r.porque, /nao esta instalado/);
  assert.equal(r.prs_abertos, undefined, 'um numero aqui seria inventado');
});

test('sem sessao iniciada diz isso, e nao se confunde com o anterior', () => {
  const r = ciEPrs({ execImpl: () => { throw new Error('gh auth login required'); } });
  assert.match(r.porque, /sessao iniciada/);
});

test('qualquer outra falha viaja com a mensagem, truncada', () => {
  const r = ciEPrs({ execImpl: () => { throw new Error('x'.repeat(500)); } });
  assert.equal(r.disponivel, false);
  assert.ok(r.porque.length < 160, 'o motivo nao pode despejar 500 caracteres no HTML');
});

// ── contagens reais ─────────────────────────────────────────────────────────

test('classifica os PRs pelo rollup dos checks', () => {
  const r = ciEPrs({
    execImpl: gh({
      pr: [
        { number: 1, isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'SUCCESS' }] },
        { number: 2, isDraft: true, statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }] },
        { number: 3, isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS', conclusion: null }] },
        { number: 4, isDraft: false, statusCheckRollup: [] },
      ],
      run: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }],
    }),
  });
  assert.equal(r.prs_abertos, 4);
  assert.equal(r.rascunhos, 1);
  assert.deepEqual(r.prs_por_estado, { verde: 1, vermelho: 1, 'a-correr': 1, 'sem-checks': 1 });
  assert.deepEqual(r.ci, { janela: 2, verdes: 1, vermelhas: 1 });
});

test('UM check vermelho pinta o PR de vermelho — a media esconderia o que interessa', () => {
  const r = ciEPrs({
    execImpl: gh({
      pr: [{ number: 1, isDraft: false, statusCheckRollup: Array(19).fill({ conclusion: 'SUCCESS' }).concat({ conclusion: 'FAILURE' }) }],
      run: [],
    }),
  });
  assert.equal(r.prs_por_estado.vermelho, 1);
});

test('corridas AINDA A CORRER nao entram no numerador nem no denominador', () => {
  const r = ciEPrs({
    execImpl: gh({
      pr: [],
      run: [{ status: 'completed', conclusion: 'success' }, { status: 'in_progress', conclusion: null }],
    }),
  });
  assert.equal(r.ci.janela, 1, 'uma corrida a meio nao tem veredicto');
});

test('sem corridas terminadas, o CI e n/d — nunca "0% verde"', () => {
  const r = ciEPrs({ execImpl: gh({ pr: [], run: [] }) });
  assert.equal(r.disponivel, true, 'os PRs sozinhos ja valem');
  assert.equal(r.ci.verdes, null);
  assert.match(r.ci.porque, /^n\/d/);
});

test('os PRs respondem e as corridas falham: metade medida, metade n/d', () => {
  const r = ciEPrs({
    execImpl: (bin, args) => {
      if (args[0] === 'run') throw new Error('rede em baixo');
      return JSON.stringify([{ number: 1, isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }] }]);
    },
  });
  assert.equal(r.prs_abertos, 1);
  assert.equal(r.ci.verdes, null);
  assert.match(r.ci.porque, /nao consegui listar/);
});

// ── nada de conteudo ────────────────────────────────────────────────────────

test('so se pedem campos sem conteudo — isto acaba num HTML que se envia', () => {
  let pedidos = [];
  ciEPrs({ execImpl: (bin, args) => { pedidos.push(args.join(' ')); return '[]'; } });
  const tudo = pedidos.join(' ');
  for (const proibido of ['title', 'body', 'author', 'headRefName', 'comments']) {
    assert.ok(!tudo.includes(proibido), `pede \`${proibido}\` — conteudo nao entra no Ledger`);
  }
});

test('o timeout e curto — isto corre num launchd diario', () => {
  assert.ok(TIMEOUT_MS <= 10000);
  assert.ok(CORRIDAS <= 30, 'uma janela, nao a historia toda');
  let opcoes = null;
  ciEPrs({ execImpl: (bin, args, o) => { opcoes = o; return '[]'; } });
  assert.equal(opcoes.timeout, TIMEOUT_MS);
});

// ── chega ao Ledger ─────────────────────────────────────────────────────────

test('o snapshot leva o campo e a casca le-o', () => {
  const build = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'runner', 'build-ledger-snapshot.mjs'), 'utf8');
  assert.match(build, /ci_prs: ciPrsImpl\(\)/);
  const casca = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-ledger-shell.html'), 'utf8');
  assert.match(casca, /S\.ci_prs/);
  assert.doesNotMatch(casca, /Not measured by this build/,
    'a seccao ainda declara que nunca perguntou');
  assert.match(casca, /An empty slot beats an invented one/,
    'o caminho de n/d tem de continuar la, para quando o gh falhar');
});
