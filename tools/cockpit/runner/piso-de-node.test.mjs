/**
 * piso-de-node.test.mjs
 *
 * Ficheiros SINTETICOS, nunca os do repo: um teste ancorado no piso de hoje
 * partiria no dia em que o piso subir, que e exactamente o dia em que ele tem
 * de continuar a funcionar.
 */

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pisoCanonico, divergencias, buildDeriva, paresDessincronizados, CANONICO, SITIOS,
} from './piso-de-node.mjs';

/** Um `readFileSync` falso sobre um mapa caminho -> conteudo. */
const disco = (mapa) => (p) => {
  const chave = String(p).replace(/\\/g, '/').replace(/^\/r\//, '');
  if (!(chave in mapa)) { const e = new Error('ENOENT'); throw e; }
  return mapa[chave];
};

const cli = (n) => JSON.stringify({ name: '@mooter/cli', engines: { node: `>=${n}` } });

test('le o piso canonico do engines.node, e diz null quando nao consegue', () => {
  assert.equal(pisoCanonico('/r', { readImpl: disco({ [CANONICO]: cli(22) }) }), 22);
  assert.equal(pisoCanonico('/r', { readImpl: disco({ [CANONICO]: '{ "name": "x" }' }) }), null,
    'sem engines nao ha piso');
  assert.equal(pisoCanonico('/r', { readImpl: disco({ [CANONICO]: 'nao e json' }) }), null,
    'json partido nao inventa um numero');
  assert.equal(pisoCanonico('/r', { readImpl: disco({}) }), null, 'ficheiro ausente');
});

test('acusa o sitio que afirma outro piso, e diz porque e que aquele sitio importa', () => {
  const sitios = [{ ficheiro: 'i.sh', porque: 'o que o instalador recusa', padroes: [/-lt (\d+)/g] }];
  const r = divergencias('/r', 22, { readImpl: disco({ 'i.sh': 'if [ x -lt 18 ]' }), sitios });
  assert.equal(r.fora.length, 1);
  assert.equal(r.fora[0].diz, 18);
  assert.equal(r.fora[0].devia, 22);
  assert.match(r.fora[0].porque, /instalador/);
});

test('cala-se quando todos os sitios dizem o mesmo numero', () => {
  const sitios = [{ ficheiro: 'i.sh', porque: 'x', padroes: [/-lt (\d+)/g] }];
  const r = divergencias('/r', 22, { readImpl: disco({ 'i.sh': 'if [ x -lt 22 ]' }), sitios });
  assert.deepEqual(r.fora, []);
});

test('o instalador que deixou de verificar Node nenhum e acusado, nao ignorado', () => {
  // O caso perigoso: sem `obrigatorio` isto era silencio, e silencio le-se como
  // "esta tudo bem" quando na verdade o instalador deixou de recusar seja o que for.
  const sitios = [{ ficheiro: 'i.sh', porque: 'o que o instalador recusa', obrigatorio: true, padroes: [/-lt (\d+)/g] }];
  const r = divergencias('/r', 22, { readImpl: disco({ 'i.sh': '# ja nao verifico nada' }), sitios });
  assert.deepEqual(r.fora, []);
  assert.equal(r.semDeclaracao.length, 1);
  assert.equal(r.semDeclaracao[0].ficheiro, 'i.sh');
});

test('um doc que simplesmente nao fala de Node nao e acusado de nada', () => {
  const sitios = [{ ficheiro: 'D.md', porque: 'doc', padroes: [/\bNode (\d+)\+/g] }];
  const r = divergencias('/r', 22, { readImpl: disco({ 'D.md': 'nada sobre runtimes' }), sitios });
  assert.deepEqual(r.fora, []);
  assert.deepEqual(r.semDeclaracao, [], 'sem `obrigatorio`, calar-se e legitimo');
});

test('ficheiro que desapareceu entra como ausente, separado de quem esta errado', () => {
  const sitios = [{ ficheiro: 'sumiu.md', porque: 'doc', padroes: [/\bNode (\d+)\+/g] }];
  const r = divergencias('/r', 22, { readImpl: disco({}), sitios });
  assert.deepEqual(r.ausentes, ['sumiu.md']);
  assert.deepEqual(r.fora, []);
});

test('um regex /g partilhado nao come o segundo ficheiro', () => {
  // Sem reiniciar o lastIndex, o 2o sitio comeca a ler a meio do 1o e a segunda
  // divergencia desaparece — um falso verde, o pior tipo de bug num verificador.
  const partilhado = [/\bNode (\d+)\+/g];
  const sitios = [
    { ficheiro: 'a.md', porque: 'a', padroes: partilhado },
    { ficheiro: 'b.md', porque: 'b', padroes: partilhado },
  ];
  const r = divergencias('/r', 22, {
    readImpl: disco({ 'a.md': 'exige Node 18+ aqui', 'b.md': 'exige Node 20+ aqui' }),
    sitios,
  });
  assert.equal(r.fora.length, 2, 'os dois ficheiros tem de ser vistos');
  assert.deepEqual(r.fora.map((f) => f.diz).sort(), [18, 20]);
});

test('nao confunde uma tag de versao do produto com o piso de Node', () => {
  // `# Expected: v0.1.0-pastor-wave1` vive nos mesmos runbooks e nao e um runtime.
  const sitios = [{
    ficheiro: 'R.md',
    porque: 'runbook',
    padroes: [/\bNode (\d+)\+/g, /node --version[^\n]*?v(\d+)\.x/g],
  }];
  const r = divergencias('/r', 22, {
    readImpl: disco({ 'R.md': 'git tag v0.1.0-pastor-wave1\n# Expected: v0.1.0-pastor-wave1\n' }),
    sitios,
  });
  assert.deepEqual(r.fora, [], 'uma tag do produto nao e uma afirmacao sobre Node');
});

test('apanha o `node --version # Expected: vN.x` que escapava a prosa', () => {
  const sitios = [{ ficheiro: 'R.md', porque: 'runbook', padroes: [/node --version[^\n]*?v(\d+)\.x/g] }];
  const r = divergencias('/r', 22, {
    readImpl: disco({ 'R.md': 'node --version          # Expected: v20.x ou superior' }),
    sitios,
  });
  assert.equal(r.fora.length, 1);
  assert.equal(r.fora[0].diz, 20);
});

test('build.mjs: derivar passa, voltar a fixar o numero falha', () => {
  const ok = buildDeriva('/r', {
    readImpl: disco({ 'packages/cli/build.mjs': 'const a = [`--target=node${piso}`];' }),
  });
  assert.equal(ok.ok, true);

  const mau = buildDeriva('/r', {
    readImpl: disco({ 'packages/cli/build.mjs': 'const a = ["--target=node20"];' }),
  });
  assert.equal(mau.ok, false);
  assert.match(mau.motivo, /node20 fixo/);
});

test('build.mjs: um --target=nodeN dentro de COMENTARIO nao e acusado', () => {
  // A explicacao historica desta mudanca cita `--target=node20`. Um verificador
  // que se acusasse a si proprio seria desligado no mesmo dia.
  const r = buildDeriva('/r', {
    readImpl: disco({
      'packages/cli/build.mjs': '// antes isto dizia --target=node20\nconst a = [`--target=node${p}`];',
    }),
  });
  assert.equal(r.ok, true, 'comentario nao e codigo');
});

test('build.mjs: sem target nenhum tambem falha, em vez de passar por omissao', () => {
  const r = buildDeriva('/r', { readImpl: disco({ 'packages/cli/build.mjs': 'const a = [];' }) });
  assert.equal(r.ok, false);
});

test('build.mjs ausente falha em vez de passar', () => {
  assert.equal(buildDeriva('/r', { readImpl: disco({}) }).ok, false);
});

test('pares: identicos calam, diferentes acusam, um-em-falta acusa', () => {
  const pares = [['a.sh', 'b.sh']];
  assert.deepEqual(
    paresDessincronizados('/r', { readImpl: disco({ 'a.sh': 'X', 'b.sh': 'X' }), pares }),
    [],
  );
  const dif = paresDessincronizados('/r', { readImpl: disco({ 'a.sh': 'X', 'b.sh': 'Y' }), pares });
  assert.equal(dif.length, 1);
  assert.match(dif[0].motivo, /diferente/);

  const falta = paresDessincronizados('/r', { readImpl: disco({ 'a.sh': 'X' }), pares });
  assert.equal(falta.length, 1);
  assert.match(falta[0].motivo, /nao existe/);
});

test('o `paths:` do CI cobre TODOS os sitios que o verificador le', () => {
  // Uma lista nova e uma lista nova para divergir. Se alguem acrescentar um sitio
  // a SITIOS e nao ao gatilho do workflow, o verificador existe mas nunca corre
  // quando esse ficheiro muda — verde por nao ter sido executado, que e a
  // armadilha que o `test.yml` ja documenta (PR #274).
  const wf = readFileSync(
    new URL('../../../.github/workflows/install-reliability.yml', import.meta.url), 'utf8',
  );
  // Um caminho esta coberto pelo literal exacto OU por um glob de qualquer
  // prefixo seu: `packages/cli/package.json` cai dentro de `packages/cli/**`.
  // A primeira versao disto so testava o PRIMEIRO segmento (`packages/**`) e dava
  // o canonico por descoberto quando ele estava coberto — um falso alarme, que
  // custa a mesma credibilidade que um falso verde.
  const cobre = (f) => {
    if (wf.includes(`'${f}'`)) return true;
    const partes = f.split('/');
    return partes.some((_, i) => wf.includes(`'${partes.slice(0, i + 1).join('/')}/**'`));
  };
  // O canonico entra: se ele mudar e o job nao correr, o piso muda sem ninguem
  // verificar as copias — que e precisamente o cenario que isto tudo previne.
  const alvos = [...SITIOS.map((s) => s.ficheiro), CANONICO];
  assert.deepEqual(alvos.filter((f) => !cobre(f)), [], 'sitios verificados que o CI nunca dispara');
  assert.equal(cobre('docs/inventado.md'), false, 'o teste tem de saber dizer que NAO');
});
