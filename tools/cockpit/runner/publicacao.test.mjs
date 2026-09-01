/**
 * publicacao.test.mjs — «a frota ve este device?» respondido pelo git, nunca
 * por uma variavel de ambiente.
 *
 * O caso que estes testes fixam e o que estava vivo na bancada a 2026-09-01: o
 * beacon em disco era de hoje e o ultimo COMMIT dele era de 26/08. Sem esta
 * medicao, o painel dizia "vivo" e a frota nao via nada ha seis dias.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { estadoDaPublicacao, caminhoDoBeacon } from './publicacao.mjs';

const gitFalso = (respostas) => (args) => {
  const cmd = args[0];
  if (cmd in respostas) {
    const v = respostas[cmd];
    if (v instanceof Error) throw v;
    return v;
  }
  throw new Error(`git ${cmd} nao esperado`);
};

const base = {
  vaultPath: '/vault', device: 'mac-mini-de-paulo', existsImpl: () => true,
};

test('o caminho do beacon e o mesmo que o runner publica', () => {
  assert.equal(caminhoDoBeacon('mac-mini-de-paulo'), '50-fleet/mac-mini-de-paulo.json');
});

test('sem vault: n/d com o motivo, e nenhum campo a fingir-se medido', () => {
  const r = estadoDaPublicacao({ device: 'x' });
  assert.equal(r.transporte, null);
  assert.equal(r.ultima_publicacao, null);
  assert.equal(r.por_publicar, null);
  assert.match(r.porque, /sem vault/);
});

test('vault sem .git: transporte local, e diz que o beacon nao sai do disco', () => {
  const r = estadoDaPublicacao({ ...base, existsImpl: () => false });
  assert.equal(r.transporte, 'local');
  assert.equal(r.remoto, false);
  assert.match(r.porque, /nao e um repositorio git/);
});

test('vault sem remoto: o commit fica aqui, e o porque di-lo', () => {
  const r = estadoDaPublicacao({
    ...base,
    runImpl: gitFalso({ remote: '', log: '2026-08-26T08:15:21-03:00', diff: '' }),
  });
  assert.equal(r.remoto, false);
  assert.match(r.porque, /nao tem remoto/);
});

test('O CASO REAL: beacon commitado a 26/08 e alterado em disco desde entao', () => {
  const r = estadoDaPublicacao({
    ...base,
    runImpl: gitFalso({
      remote: 'origin\n',
      log: '2026-08-26T08:15:21-03:00\n',
      diff: '50-fleet/mac-mini-de-paulo.json\n',
    }),
  });
  assert.equal(r.remoto, true);
  assert.equal(r.ultima_publicacao, '2026-08-26T08:15:21-03:00');
  assert.equal(r.por_publicar, true);
  assert.match(r.porque, /por publicar/);
});

test('em dia: por_publicar false, e a data e a do commit — nao a do ficheiro', () => {
  const r = estadoDaPublicacao({
    ...base,
    runImpl: gitFalso({ remote: 'origin\n', log: '2026-09-01T05:00:00-03:00\n', diff: '' }),
  });
  assert.equal(r.por_publicar, false);
  assert.match(r.porque, /e o que esta publicado/);
});

test('nunca commitado: `ultima_publicacao` e null, e isso diz-se por extenso', () => {
  const r = estadoDaPublicacao({
    ...base,
    runImpl: gitFalso({ remote: 'origin\n', log: '', diff: '' }),
  });
  assert.equal(r.ultima_publicacao, null);
  assert.match(r.porque, /nunca foi commitado/);
});

test('git que rebenta da n/d na publicacao — nunca "em dia" por omissao', () => {
  const r = estadoDaPublicacao({
    ...base,
    runImpl: gitFalso({ remote: 'origin\n', log: new Error('not a git repository') }),
  });
  assert.equal(r.ultima_publicacao, null);
  assert.equal(r.por_publicar, null);
  assert.match(r.porque, /nao foi medida/);
});

/**
 * A tentacao obvia era ler `MOO_PUBLICAR_BEACON`. Seria o processo errado (a
 * variavel e do loop) e a pergunta errada (intencao, nao resultado).
 */
test('o modulo NAO le MOO_PUBLICAR_BEACON — mede o resultado, nao a intencao', async () => {
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const src = fs.readFileSync(fileURLToPath(new URL('./publicacao.mjs', import.meta.url)), 'utf8');
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal(/process\.env/.test(codigo), false,
               'ler o ambiente aqui responde sobre o processo errado');
});
