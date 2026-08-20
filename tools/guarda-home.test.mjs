/**
 * guarda-home.test.mjs — o guarda dinamico do ~/.mooter, e o ratchet da divida.
 *
 * Sem estes testes o `guarda-home.mjs` seria mais uma peca construida e nao
 * ligada: passaria em CI sem nunca se saber se morde. Aqui morde-se a ele.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fotografar, comparar, homeDoMooter } from './guarda-home.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = JSON.parse(fs.readFileSync(path.join(AQUI, 'guarda-home.baseline.json'), 'utf8'));

/** Uma arvore falsa: nada toca no disco, nem no home de ninguem. */
function arvore(mapa) {
  const dirs = new Map();
  for (const [rel, conteudo] of Object.entries(mapa)) {
    const partes = rel.split('/');
    let prefixo = '';
    for (let i = 0; i < partes.length - 1; i += 1) {
      const pai = prefixo ? `${prefixo}/${partes[i]}` : partes[i];
      if (!dirs.has(prefixo)) dirs.set(prefixo, []);
      if (!dirs.get(prefixo).some((e) => e.name === partes[i])) {
        dirs.get(prefixo).push({ name: partes[i], isDirectory: () => true });
      }
      prefixo = pai;
    }
    if (!dirs.has(prefixo)) dirs.set(prefixo, []);
    dirs.get(prefixo).push({ name: partes[partes.length - 1], isDirectory: () => false });
  }
  const raiz = '/raiz';
  const rel = (dir) => (dir === raiz ? '' : dir.slice(raiz.length + 1).split(path.sep).join('/'));
  return {
    readdir: (dir) => {
      const k = rel(dir);
      if (!dirs.has(k)) throw new Error('ENOENT');
      return dirs.get(k);
    },
    read: (f) => Buffer.from(mapa[rel(f)] ?? ''),
    raiz,
  };
}

const fotoDe = (mapa) => { const a = arvore(mapa); return fotografar(a.raiz, a.readdir, a.read); };

test('um ficheiro APAGADO falha sempre — nao ha baseline que o perdoe', () => {
  const antes = fotoDe({ 'runner-ledger.jsonl': 'a', 'revistos.json': 'b' });
  const depois = fotoDe({ 'revistos.json': 'b' });
  const d = comparar(antes, depois, {
    novos_tolerados: ['runner-ledger.jsonl'],
    mutaveis_pelo_loop: ['runner-ledger.jsonl'],
  });
  assert.deepEqual(d.apagados, ['runner-ledger.jsonl']);
  assert.equal(d.limpo, false, 'estar nas duas listas nao pode salvar um apagado');
});

test('o ledger a crescer durante a suite NAO e uma violacao', () => {
  const antes = fotoDe({ 'runner-ledger.jsonl': 'linha1' });
  const depois = fotoDe({ 'runner-ledger.jsonl': 'linha1linha2' });
  assert.equal(comparar(antes, depois, BASELINE).limpo, true);
});

test('um ficheiro que a suite NAO devia tocar, alterado, falha', () => {
  const antes = fotoDe({ 'auth.token': 'segredo' });
  const depois = fotoDe({ 'auth.token': 'outro' });
  const d = comparar(antes, depois, BASELINE);
  assert.deepEqual(d.alterados, ['auth.token']);
});

test('poluicao nova fora da baseline falha; a que esta nomeada passa', () => {
  const antes = fotoDe({});
  const nomeada = comparar(antes, fotoDe({ 'fable-5-escalations.jsonl': '{}' }), BASELINE);
  assert.equal(nomeada.limpo, true, 'a divida medida esta nomeada e nao volta a partir o CI');

  const anonima = comparar(antes, fotoDe({ 'coisa-nova.json': '{}' }), BASELINE);
  assert.deepEqual(anonima.novos, ['coisa-nova.json']);
});

test('o que SAIU da baseline volta a falhar — o ratchet aperta mesmo', () => {
  // `cache/` e `effort.json` estavam tolerados de manha e sairam a tarde, quando
  // o `packages/cli` passou a resolver o home por uma fonte unica. Se voltarem,
  // isto acusa — que e o unico sentido de encolher uma baseline.
  const cache = comparar(fotoDe({}), fotoDe({ 'cache/quant-snapshot.json': 'x' }), BASELINE);
  assert.deepEqual(cache.novos, ['cache/', 'cache/quant-snapshot.json']);
  const lm = comparar(fotoDe({}), fotoDe({ 'local-models.json': '{}' }), BASELINE);
  assert.deepEqual(lm.novos, ['local-models.json'], 'saiu da baseline ao fim do dia — se voltar, acusa');
  const effort = comparar(fotoDe({}), fotoDe({ 'effort.json': '{}' }), BASELINE);
  assert.deepEqual(effort.novos, ['effort.json'],
    'a suite deixou de mudar o modo de esforco da maquina; se voltar a mudar, falha aqui');
});

test('criar uma pasta vazia tambem conta como novidade', () => {
  const a = arvore({ 'sub/f': 'x' });
  const foto = fotografar(a.raiz, a.readdir, a.read);
  assert.ok(foto.has('sub/'), 'o directorio tem de entrar na fotografia por si');
});

test('o home segue o MESMO contrato que o codigo sob teste honra', () => {
  assert.equal(homeDoMooter({ MOOTER_HOME: '/x/y' }), '/x/y');
  assert.match(homeDoMooter({}).split(path.sep).join('/'), /\.mooter$/);
});

/**
 * O ratchet. A baseline e divida, e divida so anda num sentido. Se alguem
 * precisar de a aumentar, tem de mudar este numero — e ai a pergunta "porque e
 * que a suite passou a sujar mais?" aparece na revisao, que e onde deve estar.
 */
test('a baseline da poluicao SO PODE ENCOLHER', () => {
  assert.ok(
    BASELINE.novos_tolerados.length <= 1,
    `a baseline tem ${BASELINE.novos_tolerados.length} entradas e o tecto e 1 (eram 6 de manha) — `
    + 'a suite passou a sujar mais do que sujava, e isso decide-se na revisao',
  );
  assert.ok(BASELINE._comment && BASELINE._porque_esta_uma_fica,
    'cada entrada tolerada tem de vir com o porque escrito ao lado');
});
