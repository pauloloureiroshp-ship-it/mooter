/**
 * bind-check.test.mjs — o bind e MEDIDO, e o que nao se mede diz `n/d`.
 *
 * A regra que estes testes existem para segurar tem uma so linha: nao-saber
 * NUNCA se arredonda para "esta seguro". Um `lsof` em falta, um timeout ou uma
 * porta sem ninguem em escuta dao `n/d` — nao `loopback`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { verificarBind, enderecosEmEscuta, linhaDeLog } from './bind-check.mjs';

const LOCAL = `COMMAND   PID            USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    30712 pauloloureiro   23u  IPv4 0x9c1a5b2c3d4e5f60      0t0  TCP 127.0.0.1:4290 (LISTEN)
`;
const EXPOSTO = `COMMAND   PID            USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node    30712 pauloloureiro   23u  IPv4 0x9c1a5b2c3d4e5f60      0t0  TCP *:4290 (LISTEN)
`;

test('um socket em 127.0.0.1 le-se como loopback, e o lsof e citado', () => {
  const r = verificarBind(4290, { runImpl: () => LOCAL });
  assert.equal(r.estado, 'loopback');
  assert.deepEqual(r.enderecos, ['127.0.0.1:4290']);
  assert.match(linhaDeLog(r, 4290), /medido por lsof/);
});

test('`*:4290` e o alarme — e a linha de log grita', () => {
  const r = verificarBind(4290, { runImpl: () => EXPOSTO });
  assert.equal(r.estado, 'exposto');
  assert.match(r.porque, /\*:4290/);
  assert.match(linhaDeLog(r, 4290), /BIND EXPOSTO/);
});

test('`0.0.0.0` tambem e exposto — nao ha lista branca generosa', () => {
  const r = verificarBind(4290, {
    runImpl: () => 'node 1 u 23u IPv4 0x0 0t0 TCP 0.0.0.0:4290 (LISTEN)\n',
  });
  assert.equal(r.estado, 'exposto');
});

test('IPv6 loopback conta como local — o `:` do endereco nao engana o parser', () => {
  const r = verificarBind(4290, {
    runImpl: () => 'node 1 u 23u IPv6 0x0 0t0 TCP [::1]:4290 (LISTEN)\n',
  });
  assert.equal(r.estado, 'loopback');
  assert.deepEqual(r.enderecos, ['[::1]:4290']);
});

test('local E exposto ao mesmo tempo continua a ser EXPOSTO', () => {
  const r = verificarBind(4290, { runImpl: () => LOCAL + EXPOSTO.split('\n')[1] + '\n' });
  assert.equal(r.estado, 'exposto', 'um socket local nao absolve o que esta aberto ao mundo');
  assert.equal(r.enderecos.length, 2);
});

test('sem lsof (Windows) da `n/d` COM o motivo — nunca um sim por omissao', () => {
  const r = verificarBind(4290, {
    runImpl: () => { throw new Error('spawnSync lsof ENOENT'); },
  });
  assert.equal(r.estado, 'n/d');
  assert.match(r.porque, /ENOENT/);
  assert.match(linhaDeLog(r, 4290), /bind n\/d/);
});

test('ninguem em escuta na porta pedida tambem e `n/d`, nao `loopback`', () => {
  // Outra porta em escuta nao diz nada sobre a nossa: o filtro tem de a apanhar.
  const r = verificarBind(4290, {
    runImpl: () => 'node 1 u 23u IPv4 0x0 0t0 TCP 127.0.0.1:11434 (LISTEN)\n',
  });
  assert.equal(r.estado, 'n/d');
});

test('linhas sem (LISTEN) sao ignoradas — uma ligacao ESTABLISHED nao e um bind', () => {
  const com = LOCAL + 'node 1 u 24u IPv4 0x0 0t0 TCP 127.0.0.1:4290->127.0.0.1:55123 (ESTABLISHED)\n';
  assert.deepEqual(enderecosEmEscuta(com).map((e) => e.bruto), ['127.0.0.1:4290']);
});

test('o lsof e chamado com -nP (sem DNS, sem nomes de servico) e so LISTEN', () => {
  let args = null;
  verificarBind(4290, { runImpl: (a) => { args = a; return LOCAL; } });
  // `-n` sem resolucao de DNS: um bind-check que faca uma consulta de rede para
  // decidir se o servidor e local seria comico e lento.
  assert.deepEqual(args, ['-nP', '-iTCP:4290', '-sTCP:LISTEN']);
});
