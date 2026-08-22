/**
 * ci-coerencia.test.mjs
 *
 * Tudo aqui usa workflows SINTETICOS, nunca os do repo. Um teste ancorado no
 * estado da configuracao de hoje parte na proxima decisao — foi o que aconteceu
 * tres vezes esta semana ao desligar pilares.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { nodeDe, runtimeDePublicacao, scriptsEmFalta, lerWorkflows } from './ci-coerencia.mjs';

const wf = (ficheiro, src) => ({ ficheiro, src });

test('le a versao de Node, e diz null quando o workflow nao instala nenhuma', () => {
  assert.equal(nodeDe('      node-version: 22\n'), '22');
  assert.equal(nodeDe("      node-version: '20.11.0'\n"), '20');
  assert.equal(nodeDe('uses: actions/checkout@v4'), null);
  assert.equal(nodeDe(''), null);
  assert.equal(nodeDe(null), null);
});

test('acusa quando se PUBLICA num runtime diferente daquele em que se TESTA', () => {
  // O caso real medido a 2026-08-22: a suite em Node 22, dois publicadores em 20.
  const r = runtimeDePublicacao([
    wf('test.yml', 'node-version: 22'),
    wf('publish-npm.yml', 'node-version: 20'),
    wf('publish-mcpb.yml', 'node-version: 22'),
  ]);
  assert.equal(r.nodeTeste, '22');
  assert.equal(r.divergentes.length, 1);
  assert.equal(r.divergentes[0].ficheiro, 'publish-npm.yml');
});

test('cala-se quando publicacao e teste correm no mesmo runtime', () => {
  const r = runtimeDePublicacao([
    wf('test.yml', 'node-version: 22'),
    wf('publish-npm.yml', 'node-version: 22'),
    wf('deploy-hub.yml', 'node-version: 22'),
  ]);
  assert.deepEqual(r.divergentes, []);
});

test('sem workflow de teste, nao inventa uma referencia', () => {
  // Comparar publicadores contra nada seria escolher um deles como verdade por
  // acaso. Sem `test.yml` nao ha referencia, e diz-se isso.
  const r = runtimeDePublicacao([wf('publish-npm.yml', 'node-version: 20')]);
  assert.equal(r.nodeTeste, null);
  assert.deepEqual(r.divergentes, [], 'sem referencia nao ha divergencia a afirmar');
});

test('um workflow que nao instala Node nao conta como divergente', () => {
  const r = runtimeDePublicacao([
    wf('test.yml', 'node-version: 22'),
    wf('deploy-hub.yml', 'uses: cloudflare/wrangler-action@v3'),
  ]);
  assert.deepEqual(r.divergentes, [], 'nao instalar Node nao e instalar o Node errado');
});

test('apanha o script que o CI manda correr e nao existe', () => {
  const existe = (p) => p.includes('existe.mjs');
  const { faltam } = scriptsEmFalta(
    [wf('test.yml', 'run: node tools/existe.mjs\nrun: node tools/fantasma.mjs')],
    '/r',
    { existsImpl: existe, checkIgnoreImpl: () => false },
  );
  assert.equal(faltam.length, 1);
  assert.equal(faltam[0].alvo, 'tools/fantasma.mjs');
});

test('nao confunde `node --test` nem `npm run x` com um caminho de script', () => {
  const { faltam } = scriptsEmFalta(
    [wf('test.yml', 'run: node --test\nrun: npm run build\nrun: node -c tools/router/classify.js')],
    '/r',
    { existsImpl: () => true },
  );
  assert.deepEqual(faltam, [], 'so caminhos com extensao contam, e este existe');
});

test('o artefacto que o proprio CI constroi nao conta como script em falta', () => {
  // O caso real: `install-reliability.yml` corre `packages/cli/mooter.js`, que o
  // passo anterior constroi com esbuild e que o repo ignora de proposito. Acusar
  // isto punha o verificador vermelho para sempre num caso legitimo.
  const { faltam, construidos } = scriptsEmFalta(
    [wf('install-reliability.yml', 'run: node packages/cli/mooter.js --version')],
    '/r',
    { existsImpl: () => false, checkIgnoreImpl: (a) => a === 'packages/cli/mooter.js' },
  );
  assert.deepEqual(faltam, [], 'gitignorado = artefacto de build, nao defeito');
  assert.equal(construidos.length, 1);
  assert.equal(construidos[0].alvo, 'packages/cli/mooter.js');
});

test('sem git a responder, o ausente continua a ser acusado', () => {
  // Falhar a acusar e pior que acusar a mais: se nao se consegue provar que e
  // artefacto, trata-se como defeito.
  const { faltam } = scriptsEmFalta(
    [wf('test.yml', 'run: node tools/fantasma.mjs')],
    '/r',
    { existsImpl: () => false, checkIgnoreImpl: () => { throw new Error('git ausente'); } },
  );
  assert.equal(faltam.length, 1, 'na duvida, acusa');
});

test('pasta de workflows ausente devolve lista vazia, sem rebentar', () => {
  assert.deepEqual(lerWorkflows('/nao/existe', { readdirImpl: () => { throw new Error('ENOENT'); } }), []);
});

test('um workflow ilegivel entra com src vazio em vez de matar a varredura', () => {
  const out = lerWorkflows('/w', {
    readdirImpl: () => ['bom.yml', 'mau.yml'],
    readImpl: (p) => { if (p.includes('mau')) throw new Error('EACCES'); return 'node-version: 22'; },
  });
  assert.equal(out.length, 2);
  assert.equal(nodeDe(out.find((x) => x.ficheiro === 'mau.yml').src), null);
});
