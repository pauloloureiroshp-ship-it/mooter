/**
 * actualizacao.test.mjs — o endpoint aponta, nunca instala.
 *
 * O teste que importa mais e o ultimo: `instala_sozinho` tem de continuar
 * `false`. Nao e um campo decorativo — e a decisao de 2026-09-01 escrita num
 * sitio onde uma alteracao a reprova.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { estadoDaActualizacao, nomeDoBundle } from './actualizacao.mjs';

const REPO = '/repo';
const semDisco = { existsImpl: () => false };

test('nomeDoBundle segue a regra do pack-mcpb, e so ela', () => {
  assert.equal(nomeDoBundle('1.53.0'), 'mooter-v1530.mcpb');
  assert.equal(nomeDoBundle('1.52.0'), 'mooter-v1520.mcpb');
});

test('nomeDoBundle recusa o que nao e semver — sem inventar um nome', () => {
  for (const mau of ['', null, undefined, '1.53', 'v1.53.0', '1.53.0-rc1', 'latest']) {
    assert.equal(nomeDoBundle(mau), null, `${JSON.stringify(mau)} nao devia dar nome`);
  }
});

test('o bundle existe: aponta o caminho relativo e o gesto e do dono', () => {
  const alvo = path.join(REPO, '_handoff', 'mooter-v1530.mcpb');
  const r = estadoDaActualizacao({
    repoRoot: REPO, instalada: '1.49.4', disponivel: '1.53.0',
    existsImpl: (p) => p === alvo,
    statImpl: () => ({ size: 1234144 }),
  });
  assert.equal(r.bundle, path.join('_handoff', 'mooter-v1530.mcpb'));
  assert.equal(r.bundle_existe, true);
  assert.equal(r.bundle_bytes, 1234144);
  assert.equal(r.atrasado, true);
  assert.match(r.faz_assim, /duplo clique/);
});

test('o bundle NAO existe: nao se aponta um caminho que ninguem provou', () => {
  const r = estadoDaActualizacao({
    repoRoot: REPO, instalada: '1.49.4', disponivel: '1.53.0', ...semDisco,
  });
  assert.equal(r.bundle, null, 'um caminho inexistente e pior do que nenhum caminho');
  assert.equal(r.bundle_existe, false);
  assert.equal(r.bundle_bytes, null);
  assert.match(r.faz_assim, /pack-mcpb\.mjs/);
});

test('versoes iguais: `atrasado` e false, e continua a dizer onde esta o ficheiro', () => {
  const r = estadoDaActualizacao({
    repoRoot: REPO, instalada: '1.53.0', disponivel: '1.53.0', ...semDisco,
  });
  assert.equal(r.atrasado, false);
});

test('sem versao instalada, `atrasado` e null — nao-saber nao e estar em dia', () => {
  const r = estadoDaActualizacao({
    repoRoot: REPO, instalada: null, disponivel: '1.53.0', ...semDisco,
  });
  assert.equal(r.atrasado, null);
  assert.equal(r.instalada, null);
});

test('sem versao no repo, tambem null — e o faz_assim di-lo em vez de mentir', () => {
  const r = estadoDaActualizacao({ repoRoot: REPO, instalada: '1.49.4', disponivel: null, ...semDisco });
  assert.equal(r.atrasado, null);
  assert.equal(r.bundle, null);
  assert.match(r.faz_assim, /nao declara uma versao/);
});

test('um stat que falhe nao rebenta — o tamanho fica n/d e o caminho fica', () => {
  const r = estadoDaActualizacao({
    repoRoot: REPO, instalada: '1.49.4', disponivel: '1.53.0',
    existsImpl: () => true,
    statImpl: () => { throw new Error('EACCES'); },
  });
  assert.equal(r.bundle_existe, true);
  assert.equal(r.bundle_bytes, null);
});

test('O ENDPOINT NAO INSTALA — e a recusa viaja no payload, com a razao', () => {
  const r = estadoDaActualizacao({ repoRoot: REPO, disponivel: '1.53.0', ...semDisco });
  assert.equal(r.instala_sozinho, false);
  assert.match(r.porque_nao, /gesto do dono/);
});
