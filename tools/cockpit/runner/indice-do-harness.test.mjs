/**
 * Testes do indice do arnes.
 *
 * O que estes testes protegem nao e a aritmetica — e a HONESTIDADE do numero.
 * Um indice destes falha de duas maneiras, e as duas produzem um relatorio de
 * aspecto normal:
 *
 *   · uma parcela que nao se conseguiu medir vale 100% por omissao — o indice
 *     sobe por ausencia de dados, que e o contrario do que devia acontecer;
 *   · o denominador esconde alguma coisa — um limiar que nao esta no registo,
 *     um pacote que nao esta na lista — e a percentagem sobe sem nada melhorar.
 *
 * Quase todos os testes aqui sao sobre isso.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  parcela, indice, PESOS, TOTAL_PESOS,
  testesGateados, recibosDeCenso, veredictosPublicados, devicesNoMesmoSha,
  coberturaDeTelemetria, higieneDePrs, limiaresMedidos, limiaresNoCodigo,
  escreverInstantaneo, lerInstantaneo, IDADE_MAX_S, SUFIXOS_DE_LIMIAR, calcular,
  globParaRegex, comandosDe, argumentosDe, NOMES, RAIZ_REPO,
} from './indice-do-harness.mjs';

// ── a regra-mae ─────────────────────────────────────────────────────────────

test('uma parcela que NAO se consegue medir vale zero, nunca 100% por omissao', () => {
  const p = parcela('testes_gateados', { porque: 'git nao respondeu' });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
  assert.match(p.porque, /git/);
});

test('denominador zero nao e divisao por zero nem 100% — e nao medido', () => {
  const p = parcela('higiene_de_prs', { num: 0, den: 0, porque: 'zero PRs abertos' });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
});

test('o indice diz quanto PESO ficou por medir — um 10/10 com metade por medir nao existe', () => {
  const r = indice([
    parcela('testes_gateados', { num: 10, den: 10 }),
    parcela('recibos_de_censo', { porque: 'sem registo' }),
    parcela('vereditos_publicados', { porque: 'sem rede' }),
  ]);
  assert.equal(r.pontos, 2);
  assert.deepEqual(r.nao_medidas.sort(), ['recibos_de_censo', 'vereditos_publicados']);
  assert.equal(r.peso_nao_medido, PESOS.recibos_de_censo + PESOS.vereditos_publicados);
});

test('os pesos somam 10 — se alguem mexer num, o total tem de deixar de bater', () => {
  assert.equal(TOTAL_PESOS, 10);
});

test('MORDIDA: somar os pesos a 10 nao limita o indice a 10 — `num > den` e uma fonte partida e NAO CONTA', () => {
  // Um adversario reproduziu sete parcelas de `2/1`: **20/10**. O contrato e
  // `num`/`den` inteiros >= 0 e `num <= den`; fora dele a parcela sai NAO
  // MEDIDA com o porque, nunca lanca, e os numeros ficam a vista.
  const ids = Object.keys(PESOS);
  const r = indice(ids.map((id) => parcela(id, { num: 2, den: 1 })));
  assert.equal(r.pontos, 0, 'sete parcelas de 2/1 davam 20/10');
  assert.deepEqual(r.nao_medidas.sort(), [...ids].sort());
  const p = parcela('testes_gateados', { num: 2, den: 1 });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
  assert.match(p.porque, /contrato violado: num=2 > den=1/);
  assert.equal(p.num, 2, 'o numero que veio fica a vista para quem for ver a fonte');
  assert.equal(p.den, 1);
});

test('MORDIDA: um numerador NEGATIVO nao conta — nem para baixo', () => {
  // -3/10 dava valor -0,3 e pontos negativos: uma parcela a ROUBAR pontos as
  // outras. Fora do contrato e n/d, como qualquer outra fonte partida.
  const p = parcela('testes_gateados', { num: -3, den: 10 });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
  assert.match(p.porque, /contrato violado: num=-3 den=10 negativo/);
  const d = parcela('testes_gateados', { num: 0, den: -1 });
  assert.equal(d.valor, null);
  assert.match(d.porque, /negativo/);
});

test('MORDIDA: um NAO-INTEIRO nao conta — 0,5/1 nao e uma contagem', () => {
  const p = parcela('testes_gateados', { num: 0.5, den: 1 });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
  assert.match(p.porque, /contrato violado: num=0.5 den=1 nao sao inteiros/);
  // O par: dentro do contrato continua a contar como sempre.
  const ok = parcela('testes_gateados', { num: 1, den: 2, porque: 'metade' });
  assert.equal(ok.valor, 0.5);
  assert.equal(ok.pontos, 1);
  assert.equal(ok.porque, 'metade', 'o porque da fonte fica quando nao ha violacao');
});

// ── C1 · testes gateados ────────────────────────────────────────────────────

function ambienteC1({ ficheiros, workflows, pkgs = {}, extra = {}, chamadasGit = null }) {
  return {
    raiz: '/repo',
    runImpl: (_c, args) => {
      // `git ls-files -z <padroes>`
      if (chamadasGit) chamadasGit.push(args);
      const padroes = args.slice(2);
      if (padroes.some((p) => p.includes('package.json'))) return Object.keys(pkgs).join('\0');
      return ficheiros.join('\0');
    },
    readdirImpl: () => Object.keys(workflows),
    readImpl: (p) => {
      const s = String(p).split(/[\\/]/);
      const nome = s[s.length - 1];
      if (workflows[nome] !== undefined) return workflows[nome];
      const rel = String(p).replace(/\\/g, '/').replace('/repo/', '');
      if (pkgs[rel] !== undefined) return JSON.stringify({ scripts: pkgs[rel] });
      if (extra[rel] !== undefined) return extra[rel];
      throw new Error('ENOENT ' + p);
    },
  };
}
// Um workflow de um passo, com o `run:` e o `working-directory` dados.
const wf = (run, wd = '') => 'jobs:\n  x:\n    steps:\n      - name: t\n' + (wd ? '        working-directory: ' + wd + '\n' : '') + '        run: ' + run + '\n';

test('C1: um teste nomeado num `node --test` do workflow conta como coberto', () => {
  const p = testesGateados(ambienteC1({
    ficheiros: ['tools/a.test.mjs', 'tools/b.test.mjs'],
    workflows: { 'ci.yml': 'jobs:\n  x:\n    steps:\n      - name: t\n        run: node --test tools/a.test.mjs\n' },
  }));
  assert.equal(p.num, 1);
  assert.equal(p.den, 2);
  assert.deepEqual(p.orfaos, ['tools/b.test.mjs']);
});

test('C1: um runner que DESCOBRE sozinho cobre o directorio — senao um pacote inteiro daria zero', () => {
  const p = testesGateados(ambienteC1({
    ficheiros: ['packages/x/a.test.js', 'packages/x/sub/b.test.js', 'fora/c.test.js'],
    workflows: {
      'ci.yml': 'jobs:\n  x:\n    steps:\n      - name: t\n        working-directory: packages/x\n        run: npm test\n',
    },
    pkgs: { 'packages/x/package.json': { test: 'node --test' } },
  }));
  assert.equal(p.num, 2, 'os dois de packages/x contam');
  assert.deepEqual(p.orfaos, ['fora/c.test.js']);
});

test('C1: o `working-directory` do JOB vale para todos os passos', () => {
  const p = testesGateados(ambienteC1({
    ficheiros: ['packages/ext/src/a.test.js'],
    workflows: {
      'ci.yml': 'jobs:\n  x:\n    defaults:\n      run:\n        working-directory: packages/ext\n    steps:\n      - name: t\n        run: node --test src/*.test.js\n',
    },
  }));
  assert.equal(p.num, 1, 'sem o default do job, este ficheiro aparecia como orfao');
});

test('C1: um script com o MESMO NOME noutro pacote nao cobre este', () => {
  // A primeira versao procurava a string `npm run test` em qualquer sitio do
  // YAML e dava por coberto o `test` de um pacote que o CI nunca invoca.
  const p = testesGateados(ambienteC1({
    ficheiros: ['packages/nunca-corrido/a.test.js'],
    workflows: {
      'ci.yml': 'jobs:\n  x:\n    steps:\n      - name: t\n        working-directory: packages/outro\n        run: npm test\n',
    },
    pkgs: {
      'packages/outro/package.json': { test: 'node --test' },
      'packages/nunca-corrido/package.json': { test: 'node --test' },
    },
  }));
  assert.equal(p.num, 0);
  assert.deepEqual(p.orfaos, ['packages/nunca-corrido/a.test.js']);
});

test('C1: `node --test` na RAIZ nao cobre o repositorio inteiro', () => {
  // Assumi-lo daria 100% a parcela mais pesada sem ninguem correr um teste.
  const p = testesGateados(ambienteC1({
    ficheiros: ['a/x.test.js', 'b/y.test.js'],
    workflows: { 'ci.yml': 'jobs:\n  x:\n    steps:\n      - name: t\n        run: node --test\n' },
  }));
  assert.equal(p.num, 0);
});

test('C1: git a falhar da uma parcela NAO MEDIDA, nao um zero de cobertura', () => {
  const p = testesGateados({
    raiz: '/repo',
    runImpl: () => { throw new Error('fatal: not a git repository'); },
  });
  assert.equal(p.valor, null);
  assert.match(p.porque, /git ls-files/);
});

test('MORDIDA C1: o denominador pede `*.test.tsx` ao git — havia 2 no landing e nao os via', () => {
  const chamadasGit = [];
  testesGateados(ambienteC1({ ficheiros: ['a.test.js'], workflows: {}, chamadasGit }));
  const padroes = chamadasGit[0].slice(2);
  assert.ok(padroes.includes('*.test.tsx'), 'pediu: ' + padroes.join(' '));
  for (const e of ['*.test.js', '*.test.mjs', '*.test.ts', '*.test.cjs']) assert.ok(padroes.includes(e), e);
});

test('MORDIDA C1: `vitest` cobre o que o `include` do vitest.config diz — nao o directorio inteiro', () => {
  // O landing limita a `app/**`. Um adversario injectou `landing/zz.test.ts`
  // fora de `app/` e C1 contou-o como coberto (474/667). A catraca herdaria
  // esse falso negativo: um teste que o CI nunca corre a passar por gateado.
  const config = "export default defineConfig({\n  test: {\n    environment: 'node',\n    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],\n  },\n});\n";
  const base = {
    ficheiros: ['landing/zz.test.ts', 'landing/app/x.test.ts', 'landing/app/_components/y.test.tsx', 'landing/lib/z.test.tsx'],
    workflows: { 'landing.yml': wf('npm run test', 'landing') },
    pkgs: { 'landing/package.json': { test: 'vitest run' } },
  };
  const p = testesGateados(ambienteC1({ ...base, extra: { 'landing/vitest.config.ts': config } }));
  assert.deepEqual(p.orfaos, ['landing/zz.test.ts', 'landing/lib/z.test.tsx'], 'fora de app/ nao corre');
  assert.equal(p.num, 2);
  // Sem ficheiro de configuracao, vale o default do vitest, que apanha tudo.
  const semConfig = testesGateados(ambienteC1(base));
  assert.deepEqual(semConfig.orfaos, []);
  assert.equal(semConfig.num, 4);
});

test('MORDIDA C1: um nome de ficheiro so conta com um RUNNER no mesmo comando — `echo a.test.mjs` nao corre nada', () => {
  // A primeira versao recolhia nomes de qualquer sitio do texto: um `echo`
  // cobria um teste. Reproduzido por um adversario.
  const so = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs'], workflows: { 'ci.yml': wf('echo a.test.mjs') } }));
  assert.deepEqual(so.orfaos, ['a.test.mjs'], 'echo nao e runner');
  // O par: com o runner, conta.
  const com = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs'], workflows: { 'ci.yml': wf('node --test a.test.mjs') } }));
  assert.deepEqual(com.orfaos, []);
  // E num bloco com os dois, cada comando e julgado sozinho: o runner do
  // primeiro nao empresta cobertura ao segundo.
  const bloco = 'jobs:\n  x:\n    steps:\n      - name: t\n        run: |\n          node --test a.test.mjs\n          echo b.test.mjs\n';
  const ambos = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs', 'b.test.mjs'], workflows: { 'ci.yml': bloco } }));
  assert.deepEqual(ambos.orfaos, ['b.test.mjs']);
});

test('MORDIDA C1: `unit-*.test.mjs` casa `unit-x.test.mjs` e NAO casa `outro.test.mjs` — o glob e um filtro, nao um directorio', () => {
  // A primeira versao transformava o glob no directorio `tools/u` e perdia o
  // filtro: `outro.test.mjs` contava como coberto e ninguem o corria.
  const p = testesGateados(ambienteC1({
    ficheiros: ['tools/u/unit-x.test.mjs', 'tools/u/unit-y.test.mjs', 'tools/u/outro.test.mjs'],
    workflows: { 'ci.yml': wf('node --test "tools/u/unit-*.test.mjs"') },
  }));
  assert.deepEqual(p.orfaos, ['tools/u/outro.test.mjs']);
  assert.equal(p.num, 2);
});

test('MORDIDA C1: `*` fica no nivel e `**` desce — confirmado por execucao em Node v24.14.0', () => {
  // `node --test "a/*.test.mjs"` correu so `a/b.test.mjs`;
  // `"a/**` `/*.test.mjs"` correu tambem `a/sub/c.test.mjs`.
  const p = testesGateados(ambienteC1({
    ficheiros: ['a/b.test.mjs', 'a/sub/c.test.mjs', 'd/e.test.mjs', 'd/sub/f.test.mjs', 'd/sub/mais/g.test.mjs'],
    workflows: { 'ci.yml': wf('node --test "a/*.test.mjs" "d/**/*.test.mjs"') },
  }));
  assert.deepEqual(p.orfaos, ['a/sub/c.test.mjs'], 'so o `**` desce; o `*` fica no nivel');
  assert.equal(p.num, 4);
});

test('MORDIDA C1: `{a,b}` e alternativa e `?` e UM caracter', () => {
  const p = testesGateados(ambienteC1({
    ficheiros: ['t/x/a.test.mjs', 't/y/b.test.mjs', 't/z/c.test.mjs', 'u/unit-1.test.mjs', 'u/unit-10.test.mjs'],
    workflows: { 'ci.yml': wf('node --test "t/{x,y}/*.test.mjs" "u/unit-?.test.mjs"') },
  }));
  assert.deepEqual(p.orfaos, ['t/z/c.test.mjs', 'u/unit-10.test.mjs']);
  assert.equal(p.num, 3);
});

test('MORDIDA C1: `node --test && echo done` e um runner PELADO — o comando acaba no `&&`, nao no fim da linha', () => {
  // A ancora `\s*$` dava zero cobertura a qualquer coisa a seguir ao runner.
  for (const run of ['node --test && echo done', 'node --test; echo done', 'node --test | tee log', 'node --test || true', 'node --test 2>&1 | tee log']) {
    const p = testesGateados(ambienteC1({
      ficheiros: ['packages/x/a.test.js', 'packages/x/sub/b.test.js', 'fora/c.test.js'],
      workflows: { 'ci.yml': wf(run, 'packages/x') },
    }));
    assert.deepEqual(p.orfaos, ['fora/c.test.js'], run);
  }
  // E com um ficheiro nomeado deixa de ser pelado: so esse conta.
  const nomeado = testesGateados(ambienteC1({
    ficheiros: ['packages/x/a.test.js', 'packages/x/b.test.js'],
    workflows: { 'ci.yml': wf('node --test a.test.js && echo done', 'packages/x') },
  }));
  assert.deepEqual(nomeado.orfaos, ['packages/x/b.test.js']);
});

test('C1: os comandos partem-se fora de aspas — o `--test-skip-pattern="(a|b)"` do router nao parte a lista em tres', () => {
  // Partir no `|` de dentro das aspas deixava 97 ficheiros num comando sem
  // runner. O par de `comandosDe` e `argumentosDe` tem de concordar nisto.
  const c = comandosDe('node --test --test-skip-pattern="(a|b|c)" x.test.js y.test.js && echo fim');
  assert.deepEqual(c, ['node --test --test-skip-pattern="(a|b|c)" x.test.js y.test.js', 'echo fim']);
  assert.deepEqual(argumentosDe(c[0]), ['node', '--test', '--test-skip-pattern=(a|b|c)', 'x.test.js', 'y.test.js']);
  // Continuacao de linha com barra: e o mesmo comando.
  assert.deepEqual(comandosDe('node --test \\\n  a.test.js \\\n  b.test.js'), ['node --test a.test.js b.test.js']);
  // Comentarios de shell nao sao comandos.
  assert.deepEqual(comandosDe('# node --test a.test.js\nnode --test b.test.js'), ['node --test b.test.js']);
});

test('C1: `globParaRegex` — cada regra com o seu caso', () => {
  const casa = (g, p) => globParaRegex(g).test(p);
  assert.ok(casa('a/*.test.mjs', 'a/b.test.mjs'));
  assert.ok(!casa('a/*.test.mjs', 'a/sub/b.test.mjs'), '`*` nao atravessa /');
  assert.ok(casa('a/**/*.test.mjs', 'a/sub/b.test.mjs'));
  assert.ok(casa('a/**/*.test.mjs', 'a/b.test.mjs'), '`**/` e zero ou mais directorios');
  assert.ok(casa('u/unit-?.test.mjs', 'u/unit-1.test.mjs'));
  assert.ok(!casa('u/unit-?.test.mjs', 'u/unit-10.test.mjs'));
  assert.ok(casa('t/{x,y}/a.test.mjs', 't/y/a.test.mjs'));
  assert.ok(!casa('t/{x,y}/a.test.mjs', 't/z/a.test.mjs'));
  // O default do vitest, tal e qual.
  const v = '**/*.{test,spec}.?(c|m)[jt]s?(x)';
  for (const ok of ['a.test.ts', 'x/y/a.spec.tsx', 'a.test.mjs', 'a.test.cjs', 'a.test.js', 'a.test.mts']) assert.ok(casa(v, ok), ok);
  for (const nao of ['a.tests.ts', 'a.test.json', 'a.test.tss']) assert.ok(!casa(v, nao), nao);
  // O do node --test pelado: sem .ts.
  assert.ok(casa('p/**/*.test.?(c|m)js', 'p/a.test.mjs'));
  assert.ok(!casa('p/**/*.test.?(c|m)js', 'p/a.test.ts'));
  // Um ponto e um ponto, nao «qualquer caracter».
  assert.ok(!casa('a/*.test.mjs', 'a/xtestxmjs'));
});

// ── MORDIDAS da 2.ª ronda adversarial (2026-09-12) ─────────────────────────
//
// Cada uma reproduz um caso que o adversario executou de verdade (node --test,
// bash, vitest) e que C1 contava ao contrario. As que podem correr o executor
// real, correm-no: uma mordida que compara o matcher com a ideia que o autor
// tem do matcher e tautologica.

/** Ficheiros de teste num directorio temporario; devolve a raiz. */
function arvoreTemporaria(ficheiros) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'indice-c1-'));
  for (const f of ficheiros) {
    const p = path.join(raiz, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "import test from 'node:test'; test(" + JSON.stringify('EXEC:' + f) + ', () => {});\n');
  }
  return raiz;
}

/** O que o `node --test` REAL executa para um padrao, a partir de `raiz`. */
function nodeExecuta(raiz, padrao) {
  // Sem o `NODE_TEST_CONTEXT` herdado: com ele, o filho ve-se «dentro de um
  // teste» e salta os ficheiros (aviso «run() is being called recursively»)
  // — e a mordida media zero sem medir nada.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', padrao], { cwd: raiz, env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  return [...r.stdout.matchAll(/^# Subtest: EXEC:(.+)$/gm)].map((m) => m[1]).sort();
}

test('MORDIDA C1 (a): `*`, `?` e `**` NAO casam dotfiles — comparado com o `node --test` REAL num directorio temporario', () => {
  // Um adversario correu cinco padroes no node e comparou com `globParaRegex`:
  // `tests/**/*.test.mjs` dava 9 no matcher contra 6 executados — os tres a
  // mais eram `.test.mjs`, `.hidden.test.mjs` e `.hidden/d.test.mjs`. Um
  // dotfile a contar como coberto sem ninguem o correr e um orfao escondido.
  const ficheiros = ['a.test.mjs', 'b.test.mjs', 'x.test.mjs', 'y.test.mjs', '.test.mjs', 'xy.test.mjs', 'a.test.js', 'a.test.ts',
    'sub/c.test.mjs', '.hidden.test.mjs', '.hidden/d.test.mjs', 'sub/.h/e.test.mjs', '.hidden/sub/f.test.mjs', 'sub/.g.test.mjs'].map((f) => 'tests/' + f);
  const raiz = arvoreTemporaria(ficheiros);
  try {
    // Os cinco do adversario, e mais os que separam «o ponto esta escrito no
    // padrao» de «o ponto veio de um wildcard».
    // `[!a]`: 3.a ronda do adversario — a classe copiada tal e qual para
    // JavaScript era «`!` ou `a`», e `a.test.mjs`, que o node NAO corre,
    // contava como coberto (a catraca aceitava um teste nao executado).
    for (const padrao of ['tests/{a,b}.test.mjs', 'tests/?(x|y).test.mjs', 'tests/a.test.[jt]s', 'tests/**/*.test.mjs', 'tests/a.test.*',
      'tests/*.test.mjs', 'tests/*/*.test.mjs', 'tests/.hidden/*.test.mjs', 'tests/.*.test.mjs', 'tests/**/.g.test.mjs', 'tests/**', 'tests/sub/**/*.test.mjs', 'tests/{.hidden,sub}/*.test.mjs',
      'tests/[!a].test.mjs', 'tests/[!ab].test.mjs', 'tests/[ab].test.mjs']) {
      const real = nodeExecuta(raiz, padrao);
      assert.ok(real.length, `o node nao correu nada para ${padrao} — a mordida nao mediu`);
      const previsto = ficheiros.filter((f) => globParaRegex(padrao).test(f)).sort();
      assert.deepEqual(previsto, real, padrao);
    }
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('MORDIDA C1 (b1): o corpo de um heredoc e TEXTO — `cat <<EOF … node --test … EOF` nao corre nada', () => {
  // Reproduzido por um adversario: codigo 0, zero testes, C1 a contar 1/11.
  const bloco = (corpo) => 'jobs:\n  x:\n    steps:\n      - name: t\n        run: |\n' + corpo.split('\n').map((l) => '          ' + l).join('\n') + '\n';
  const so = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs', 'b.test.mjs'], workflows: { 'ci.yml': bloco("cat <<'EOF'\nnode --test a.test.mjs\nEOF") } }));
  assert.deepEqual(so.orfaos, ['a.test.mjs', 'b.test.mjs'], 'dentro do heredoc nao corre');
  // O par: o comando DEPOIS do delimitador corre — e so ele.
  const depois = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs', 'b.test.mjs'], workflows: { 'ci.yml': bloco('cat <<EOF\nnode --test a.test.mjs\nEOF\nnode --test b.test.mjs') } }));
  assert.deepEqual(depois.orfaos, ['a.test.mjs']);
  // `<<-` com tabs, e `<<<` (here-string) que NAO e heredoc.
  const tabs = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs', 'b.test.mjs'], workflows: { 'ci.yml': bloco('cat <<-EOF\n\tnode --test a.test.mjs\n\tEOF\nnode --test b.test.mjs') } }));
  assert.deepEqual(tabs.orfaos, ['a.test.mjs']);
  const herestring = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs'], workflows: { 'ci.yml': bloco("cat <<< 'x'\nnode --test a.test.mjs") } }));
  assert.deepEqual(herestring.orfaos, [], 'uma here-string nao engole a linha seguinte');
});

test('MORDIDA C1 (b2): o runner tem de ser o EXECUTAVEL — `echo node --test a.test.mjs` imprime e nao corre', () => {
  // A versao anterior aceitava `node` em qualquer posicao do comando.
  const eco = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs'], workflows: { 'ci.yml': wf('echo node --test a.test.mjs') } }));
  assert.deepEqual(eco.orfaos, ['a.test.mjs'], 'o executavel e o echo');
  const ecoNpm = testesGateados(ambienteC1({ ficheiros: ['p/a.test.mjs'], workflows: { 'ci.yml': wf('echo npm test', 'p') }, pkgs: { 'p/package.json': { test: 'node --test' } } }));
  assert.deepEqual(ecoNpm.orfaos, ['p/a.test.mjs'], 'o executavel e o echo, mesmo com `npm test` atras');
  // O par: atribuicoes e envoltorios que EXECUTAM o resto da linha nao
  // escondem o runner. O `c8` esta aqui por medicao — sem ele, os 96 testes
  // do `tools/router` (`c8 … npm test`) iam para orfaos sem ninguem ter
  // deixado de os correr (473 → 377/667 na primeira tentativa desta regra).
  for (const run of ['CI=1 node --test a.test.mjs', 'env CI=1 node --test a.test.mjs', 'npx tsx --test a.test.mjs', 'npx --yes tsx --test a.test.mjs', 'timeout 60 node --test a.test.mjs', './node_modules/.bin/tsx --test a.test.mjs']) {
    const p = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs'], workflows: { 'ci.yml': wf(run) } }));
    assert.deepEqual(p.orfaos, [], run);
  }
  const c8 = testesGateados(ambienteC1({
    ficheiros: ['tools/router/a.test.js', 'tools/router/b.test.js'],
    workflows: { 'ci.yml': wf('npm run test:coverage', 'tools/router') },
    pkgs: { 'tools/router/package.json': { 'test:coverage': 'c8 --reporter=text --reporter=lcov --check-coverage npm test', test: 'node --test a.test.js' } },
  }));
  assert.deepEqual(c8.orfaos, ['tools/router/b.test.js'], 'o c8 executa o `npm test` que vem a seguir as flags');
});

test('MORDIDA C1 (b4): aspas por fechar recusam o bloco INTEIRO — e o que o bash faz (codigo 2, zero comandos)', () => {
  // Reproduzido por um adversario: `node --test a.test.mjs "unterminated`
  // termina com «unexpected EOF while looking for matching `"'» e C1 contava
  // 1/11. Subconta, nunca sobreconta.
  assert.deepEqual(comandosDe('node --test a.test.mjs "unterminated'), []);
  assert.deepEqual(comandosDe('echo "oops && node --test a.test.mjs'), []);
  const p = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs'], workflows: { 'ci.yml': wf('node --test a.test.mjs "unterminated') } }));
  assert.deepEqual(p.orfaos, ['a.test.mjs']);
  // O par: um apostrofo num COMENTARIO nao e uma aspa por fechar. Sem isto, a
  // regra nova apagava blocos legitimos por causa de um `# don't`.
  const bloco = 'jobs:\n  x:\n    steps:\n      - name: t\n        run: |\n          # don\'t run this by hand\n          node --test a.test.mjs # it\'s fine\n';
  const c = testesGateados(ambienteC1({ ficheiros: ['a.test.mjs'], workflows: { 'ci.yml': bloco } }));
  assert.deepEqual(c.orfaos, [], 'o comentario sai antes de contar aspas');
  assert.deepEqual(comandosDe("# don't\nnode --test a.test.mjs # it's fine"), ['node --test a.test.mjs']);
  // E `$#`, `a#b` nao sao comentarios.
  assert.deepEqual(comandosDe('echo $# a#b; node --test a.test.mjs'), ['echo $# a#b', 'node --test a.test.mjs']);
});

test('MORDIDA C1 (c): o `include` do vitest le-se no objecto `test` a profundidade 1, por atribuicao, e `[]` cobre NADA', () => {
  // Tres casos reproduzidos por um adversario contra o Vitest 2.1.9 real:
  //   · `coverage: { include: [other] }` ANTES de `include: [app]` → C1 dava
  //     `other` (trocava a identidade do orfao); o vitest corre `app`;
  //   · `test.include = [app]` por atribuicao → C1 dava 2/2; o vitest 1/2;
  //   · `include: []` → C1 dava 2/2; o vitest sai com codigo 1, 0 testes.
  const base = {
    ficheiros: ['landing/app/in.test.js', 'landing/other/out.test.js'],
    workflows: { 'landing.yml': wf('npm test', 'landing') },
    pkgs: { 'landing/package.json': { test: 'vitest run' } },
  };
  const casos = {
    'nested-coverage': ["export default defineConfig({test:{globals:true,coverage:{include:['other/**/*.test.js']},include:['app/**/*.test.js']}});", ['landing/other/out.test.js']],
    'function-computed': ["export default defineConfig(() => {const test={globals:true}; test.include=['app/**/*.test.js']; return {test};});", ['landing/other/out.test.js']],
    'empty-include': ['export default defineConfig({test:{globals:true,include:[]}});', ['landing/app/in.test.js', 'landing/other/out.test.js']],
    'function-literal': ["export default defineConfig(() => ({test:{globals:true,include:['app/**/*.test.js']}}));", ['landing/other/out.test.js']],
    'coverage-only': ["export default defineConfig({test:{globals:true,coverage:{include:['other/**/*.test.js']}}});", []],
    'comment-trap': ["// test: { include: ['other/**'] }\nexport default defineConfig({test:{ /* include: ['other/**'] */ include:['app/**/*.test.js'] }});", ['landing/other/out.test.js']],
  };
  for (const [nome, [config, orfaos]] of Object.entries(casos)) {
    const p = testesGateados(ambienteC1({ ...base, extra: { 'landing/vitest.config.mjs': config } }));
    assert.deepEqual(p.orfaos, orfaos, nome);
  }
});

test('C1 (c): contra o vitest REAL, quando esta instalado em landing/node_modules', (t) => {
  // A mordida acima e contra a LEITURA do config. Esta corre o vitest de
  // verdade, se houver um — no worktree de auditoria nao ha, e diz-se. A
  // 2026-09-12 os seis casos bateram contra o Vitest 2.1.9 do checkout
  // principal (`landing/node_modules` do repositorio), com o mesmo procedimento.
  const vitest = path.join(RAIZ_REPO, 'landing', 'node_modules', 'vitest', 'vitest.mjs');
  const config = path.join(RAIZ_REPO, 'landing', 'node_modules', 'vitest', 'dist', 'config.js');
  if (!fs.existsSync(vitest) || !fs.existsSync(config)) {
    t.diagnostic(`vitest nao instalado em ${vitest} — mordida (c) so contra a leitura do config`);
    return;
  }
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'indice-vitest-'));
  try {
    const escrever = (rel, s) => { const f = path.join(raiz, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
    escrever('package.json', JSON.stringify({ type: 'module', scripts: { test: 'vitest run' } }));
    escrever('.github/workflows/test.yml', wf('npm test'));
    for (const f of ['app/in.test.js', 'other/out.test.js']) escrever(f, "test('EXEC:" + f + "', () => { expect(1).toBe(1); });\n");
    spawnSync('git', ['init', '--quiet'], { cwd: raiz, windowsHide: true });
    spawnSync('git', ['add', '--', 'package.json', 'app', 'other', '.github'], { cwd: raiz, windowsHide: true });
    for (const corpo of [
      "defineConfig({test:{globals:true,coverage:{include:['other/**/*.test.js']},include:['app/**/*.test.js']}})",
      "defineConfig(() => {const test={globals:true}; test.include=['app/**/*.test.js']; return {test};})",
      'defineConfig({test:{globals:true,include:[]}})',
      "defineConfig({test:{globals:true,coverage:{include:['other/**/*.test.js']}}})",
    ]) {
      escrever('vitest.config.mjs', 'import { defineConfig } from ' + JSON.stringify(pathToFileURL(config).href) + ';\nexport default ' + corpo + ';\n');
      const p = testesGateados({ raiz });
      const r = spawnSync(process.execPath, [vitest, 'run', '--reporter=json', '--maxWorkers=1', '--minWorkers=1', '--no-file-parallelism'], { cwd: raiz, encoding: 'utf8', windowsHide: true, timeout: 120000 });
      let saida = null;
      try { saida = JSON.parse(r.stdout); } catch { /* «No test files found» nao e JSON */ }
      const real = ((saida && saida.testResults) || []).map((x) => path.relative(raiz, x.name).split(path.sep).join('/')).sort();
      const previsto = ['app/in.test.js', 'other/out.test.js'].filter((f) => !p.orfaos.includes(f)).sort();
      assert.deepEqual(previsto, real, corpo);
    }
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('MORDIDA parcela: `num`/`den` em string nao contam E dizem porque', () => {
  // Um adversario mediu `parcela(...,{num:'1',den:'2'})` → tudo a null, sem
  // porque. Nao aumentava o indice, mas rejeitava sem explicar.
  const p = parcela('testes_gateados', { num: '1', den: '2' });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
  assert.match(p.porque, /contrato violado: num="1" den="2" nao numericos/);
});

test('C1: a descricao da parcela de telemetria diz o que ela mede', () => {
  // O id `cobertura_de_telemetria` fica (e a chave da parcela); o nome
  // mostrado e o que o numero E — turnos com custo casados com decisao —
  // e nao «cobertura de telemetria», que prometia todos os motores.
  assert.equal(NOMES.cobertura_de_telemetria, 'turnos com custo casados com decisao');
});

// ── C2 · recibos ────────────────────────────────────────────────────────────

test('C2: as rondas SEM afirmacao ficam fora das duas pontas', () => {
  const linhas = [
    { verdict: 'citacao-ok' }, { verdict: 'citacao-ok' },
    { verdict: 'refutado' },
    { verdict: 'nada-por-rever' }, { verdict: 'nada-por-rever' }, { verdict: 'nada-por-rever' },
  ].map((x) => JSON.stringify(x)).join('\n');
  const p = recibosDeCenso({ readImpl: () => linhas });
  assert.equal(p.num, 2);
  assert.equal(p.den, 3, 'as 3 rondas `nada-por-rever` nao sao afirmacoes — nem boas nem mas');
  assert.match(p.porque, /3 rondas sem afirmacao/);
});

test('C2: sem registo de recibos e NAO MEDIDO, nao zero', () => {
  const p = recibosDeCenso({ readImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(p.valor, null);
  assert.match(p.porque, /nunca correu/);
});

// ── C3 e C6 · o que depende da rede ─────────────────────────────────────────

test('C3: sem rede a parcela vale ZERO com o porque — nunca 100% por nao haver contra-prova', () => {
  const p = veredictosPublicados({ prs: null });
  assert.equal(p.valor, null);
  assert.equal(p.pontos, 0);
  assert.match(p.porque, /sem acesso ao GitHub/);
});

test('C3: conta os PRs com um veredicto publicado em comentario', () => {
  const p = veredictosPublicados({
    prs: [
      { numero: 1, comentarios: ['blá blá\nVEREDICTO: BLOQUEIA'] },
      { numero: 2, comentarios: ['obrigado!'] },
      { numero: 3, comentarios: [] },
    ],
  });
  assert.equal(p.num, 1);
  assert.equal(p.den, 3);
});

test('C6: saudavel = nao-draft e com menos de 14 dias', () => {
  const agora = Date.parse('2026-08-26T12:00:00Z');
  const dias = (n) => new Date(agora - n * 86400000).toISOString();
  const p = higieneDePrs({
    agora,
    prs: [
      { numero: 1, draft: false, criado: dias(1) },
      { numero: 2, draft: true, criado: dias(1) },
      { numero: 3, draft: false, criado: dias(40) },
    ],
  });
  assert.equal(p.num, 1);
  assert.equal(p.den, 3);
});

// ── C4 · devices ────────────────────────────────────────────────────────────

test('C4: compara o sha CARREGADO, nao o do disco — o que decide e o codigo em memoria', () => {
  const p = devicesNoMesmoSha({
    shaAlvo: '97ad846b40d7e1939e0',
    frota: [
      { device: 'a', codigo: { sha_carregado: '97ad846b40d7', sha_disco: '97ad846b40d7' } },
      // O disco esta certo e o carregado nao: este device AINDA corre o velho.
      { device: 'b', codigo: { sha_carregado: '0e4f40471de4', sha_disco: '97ad846b40d7' } },
    ],
  });
  assert.equal(p.num, 1);
  assert.equal(p.den, 2);
  assert.match(p.porque, /b@0e4f4047/);
});

test('C4: sem beacons ou sem sha de referencia e NAO MEDIDO', () => {
  assert.equal(devicesNoMesmoSha({ frota: null, shaAlvo: 'x' }).valor, null);
  assert.equal(devicesNoMesmoSha({ frota: [{ device: 'a' }], shaAlvo: null }).valor, null);
});

test('C4: tres beacons TODOS rejeitados nao e «vault nao montado» — e uma frota que deixou de emitir, e diz-se qual', () => {
  // Medido a 2026-09-11: 3 ficheiros em 50-fleet/, os 3 com assinatura
  // expirada (o mais recente com 8 dias), e a parcela culpava a montagem.
  const p = devicesNoMesmoSha({ frota: null, shaAlvo: 'abc', rejeitados: [
    { device: 'desktop-j26409q', codigo: 'expirada', ts: '2026-08-27T20:58:30.829Z' },
    { device: 'paulo-desktop', codigo: 'expirada', ts: '2026-09-03T13:23:53.880Z' },
  ] });
  assert.equal(p.valor, null);
  assert.ok(p.porque.includes('2 beacon(s), todos rejeitados'), p.porque);
  assert.ok(p.porque.includes('paulo-desktop: expirada (2026-09-03)'), p.porque);
  assert.ok(!p.porque.includes('nao esta montado'), 'nao pode culpar a montagem quando os ficheiros existem');
});

// ── C5 · telemetria ─────────────────────────────────────────────────────────
//
// A primeira versao desta parcela contava `tokens_in > 0` no decisions_v2.jsonl
// e dava 0/4830 — verdadeiro e sem sentido: o hook escreve essa linha ANTES de
// o modelo responder. A parcela passou a ler o recibo (tools/router/recibo.js):
// turnos humanos com custo medido, e quantos deles casam com uma decisao.

test('C5: o numerador e o turno COM decisao casada; o denominador e todo o turno com custo medido', () => {
  const p = coberturaDeTelemetria({ reciboImpl: () => ({ turnos: 240, comDecisao: 53, transcriptsLidos: 40, transcriptsTotais: 524, chamadas: 5958 }) });
  assert.equal(p.num, 53);
  assert.equal(p.den, 240);
  assert.ok(p.fonte.includes('recibo.js — 40/524 transcripts'), p.fonte);
  assert.match(p.porque, /187 turnos com custo medido sem decisao/);
});

test('C5: MORDIDA — um recibo que nao consegue casar NADA da 0/N, nunca n/d', () => {
  // 0 casados com N turnos medidos e um zero MEDIDO (custo real sem dono),
  // e tem de entrar no indice como zero. n/d seria esconder o pior caso.
  const p = coberturaDeTelemetria({ reciboImpl: () => ({ turnos: 1686, comDecisao: 0, transcriptsLidos: 524, transcriptsTotais: 524, chamadas: 44607 }) });
  assert.equal(p.num, 0);
  assert.equal(p.den, 1686);
  assert.equal(p.valor, 0);
});

test('C5: sem turnos medidos nao ha denominador — a parcela sai n/d e diz porque', () => {
  const p = coberturaDeTelemetria({ reciboImpl: () => ({ turnos: 0, comDecisao: 0, transcriptsLidos: 0, transcriptsTotais: 0, chamadas: 0 }) });
  assert.equal(p.valor, null);
  assert.match(p.porque, /0 turnos humanos com custo medido/);
});

test('C5: recibo.js a lancar nao vira zero — vira n/d com a excepcao escrita', () => {
  const p = coberturaDeTelemetria({ reciboImpl: () => { throw new Error('ENOENT projects'); } });
  assert.equal(p.valor, null);
  assert.ok(p.porque.includes('recibo.js indisponivel: ENOENT projects'), p.porque);
});

test('C5: a parcela real le o recibo REAL desta maquina e devolve um par num/den ou um porque', () => {
  // Contra a maquina, sem fakes: e a unica forma de apanhar um require()
  // partido entre ESM e CJS, que os testes com reciboImpl nunca exercitam.
  const p = coberturaDeTelemetria({ limite: 3 });
  if (p.valor === null) assert.ok(p.porque, 'n/d sem porque nao e permitido');
  else { assert.ok(p.den > 0); assert.ok(p.num <= p.den); }
});

// ── C7 · limiares ───────────────────────────────────────────────────────────

test('C7: o denominador vem do CODIGO — esconder um limiar do registo nao o faz desaparecer', () => {
  const noCodigo = [{ id: 'a.mjs:X_S', ficheiro: 'a.mjs', linha: 1, nome: 'X_S' }, { id: 'a.mjs:Y_MS', ficheiro: 'a.mjs', linha: 2, nome: 'Y_MS' }];
  const p = limiaresMedidos({
    scanImpl: () => noCodigo,
    readImpl: () => JSON.stringify({ limiares: { 'a.mjs:X_S': { medicao: { onde: 'medido a 2026-01-01 em 40 corridas' } } } }),
  });
  assert.equal(p.num, 1);
  assert.equal(p.den, 2, 'o limiar que nao esta no registo conta como NAO medido, nao desaparece');
  assert.match(p.porque, /1 nem sequer estao no registo/);
});

test('C7: uma `medicao` sem `onde` escrito nao conta', () => {
  const p = limiaresMedidos({
    scanImpl: () => [{ id: 'a.mjs:X_S' }],
    readImpl: () => JSON.stringify({ limiares: { 'a.mjs:X_S': { medicao: { onde: 'sim' } } } }),
  });
  assert.equal(p.num, 0, 'um `onde` de tres letras nao e proveniencia');
});

test('C7: registo ilegivel faz TODOS contarem como nao medidos', () => {
  const p = limiaresMedidos({
    scanImpl: () => [{ id: 'a.mjs:X_S' }],
    readImpl: () => { throw new Error('ENOENT'); },
  });
  assert.equal(p.num, 0);
  assert.equal(p.den, 1);
  assert.match(p.porque, /ilegivel/);
});

test('C7: o scanner apanha `LIMIARES` — o nome que a primeira regex comia', () => {
  // A primeira versao era `^export const ([A-Z][A-Z0-9_]*(?:LIMIAR|LIMIARES|...))`
  // e o `[A-Z]` comia o `L`: o alvo mais importante do repo era o unico que o
  // scanner nao via. Um denominador por regex falha primeiro no caso que mais
  // interessa.
  assert.ok(SUFIXOS_DE_LIMIAR.test('LIMIARES'));
  assert.ok(SUFIXOS_DE_LIMIAR.test('STALE_AFTER_S'));
  assert.ok(SUFIXOS_DE_LIMIAR.test('MIN_PRECISAO_PCT'));
  assert.ok(!SUFIXOS_DE_LIMIAR.test('DIFF_SYSTEM_PROMPT'), 'uma string com nome acabado em _PROMPT nao e um limiar');
});

test('C7: o scanner corre mesmo sobre o repositorio e encontra o portao', () => {
  const l = limiaresNoCodigo({});
  assert.ok(l.length > 10, `esperava dezenas de limiares, vi ${l.length}`);
  assert.ok(l.some((x) => x.nome === 'LIMIARES' && x.ficheiro.endsWith('portao.mjs')));
});

// ── publicacao ──────────────────────────────────────────────────────────────

test('o instantaneo leva o carimbo, e sem carimbo nao se publica', () => {
  let escrito = null;
  const r = indice([parcela('testes_gateados', { num: 1, den: 2 })]);
  escreverInstantaneo(r, { agoraIso: '2026-08-26T12:00:00.000Z', writeImpl: (_p, c) => { escrito = c; } });
  assert.match(escrito, /"ts": "2026-08-26T12:00:00.000Z"/);

  const semTs = lerInstantaneo({ readImpl: () => JSON.stringify({ pontos: 9 }) });
  assert.equal(semTs.presente, false);
  assert.match(semTs.porque, /carimbo/);
});

test('um instantaneo VELHO publica-se com a idade a vista, nunca em silencio', () => {
  const agora = Date.parse('2026-08-26T12:00:00Z');
  const ts = new Date(agora - (IDADE_MAX_S + 3600) * 1000).toISOString();
  const r = lerInstantaneo({ agora, readImpl: () => JSON.stringify({ ts, pontos: 3.2, total: 10, pct: 32 }) });
  assert.equal(r.presente, true);
  assert.equal(r.fresco, false, 'velho e velho, e o painel tem de o poder dizer');
  assert.ok(r.idade_s > IDADE_MAX_S);
  assert.equal(r.pontos, 3.2, 'velho nao vira zero — vira velho');
});

test('sem instantaneo nenhum, `presente: false` com o porque — nao um zero', () => {
  const r = lerInstantaneo({ readImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(r.presente, false);
  assert.match(r.porque, /nunca calculado/);
});

test('o resultado leva SEMPRE o carimbo de quando foi medido e o sha', async () => {
  // Sem isto, o "3,20/10" do titulo de um PR e uma afirmacao sem data: as sete
  // parcelas leem estado vivo e mexem-se sozinhas. Medido a 2026-08-26, com ~90
  // minutos entre duas corridas e ZERO linhas de codigo alteradas: cinco das
  // sete parcelas derivaram e o total foi de 3,20 para 3,24. Foi um adversario
  // que apanhou; quem corresse o comando concluiria que o PR mentia.
  const r = await calcular({ semRede: true, agora: Date.parse('2026-08-26T12:00:00Z') });
  assert.equal(r.medido_em, '2026-08-26T12:00:00.000Z');
  assert.ok(typeof r.sha_head === 'string' || r.sha_head === null);
  assert.ok(typeof r.sha_origin_main === 'string' || r.sha_origin_main === null);
  assert.ok(Number.isFinite(r.pontos));
});

test('MORDIDA: o resultado estampa DOIS shas — o HEAD medido e o origin/main de referencia — e nunca um so `sha`', async () => {
  // A primeira versao estampava `sha: origin/main` e chamava-lhe o sha da
  // medicao. C1 e C7 leem o checkout de HEAD; C4 compara com origin/main. Numa
  // worktree com o branch a frente, o numero dizia ser de um codigo que ninguem
  // tinha medido. Foi um adversario que apanhou.
  const r = await calcular({ semRede: true, agora: Date.parse('2026-08-26T12:00:00Z') });
  assert.ok('sha_head' in r, 'sha_head tem de existir no resultado');
  assert.ok('sha_origin_main' in r, 'sha_origin_main tem de existir no resultado');
  assert.ok(!('sha' in r), 'um `sha` sem dizer qual e a ambiguidade que se corrigiu');
});

test('o instantaneo herda o carimbo do resultado quando ninguem lho da', () => {
  let escrito = null;
  escreverInstantaneo(
    { pontos: 3.2, total: 10, pct: 32, peso_nao_medido: 0, nao_medidas: [], parcelas: [], medido_em: '2026-08-26T12:00:00.000Z', sha_head: 'abcdef123456', sha_origin_main: '0123456789ab' },
    { writeImpl: (_p, c) => { escrito = c; } },
  );
  const j = JSON.parse(escrito);
  assert.equal(j.ts, '2026-08-26T12:00:00.000Z');
  assert.equal(j.sha_head, 'abcdef123456');
  assert.equal(j.sha_origin_main, '0123456789ab');
});

test('MORDIDA: o escritor do instantaneo PRESERVA o porque de cada parcela', () => {
  // Um `n/d` sem o porque e um numero mudo. O escritor deitava-os fora.
  let escrito = null;
  const r = indice([parcela('vereditos_publicados', { porque: 'sem acesso ao GitHub' }), parcela('testes_gateados', { num: 1, den: 2, porque: '1 orfao' })]);
  escreverInstantaneo(r, { agoraIso: '2026-08-26T12:00:00.000Z', writeImpl: (_p, c) => { escrito = c; } });
  const j = JSON.parse(escrito);
  assert.equal(j.parcelas.find((p) => p.id === 'vereditos_publicados').porque, 'sem acesso ao GitHub');
  assert.equal(j.parcelas.find((p) => p.id === 'testes_gateados').porque, '1 orfao');
});

test('MORDIDA: o leitor do instantaneo PRESERVA os dois shas, e le o `sha` antigo como origin/main', () => {
  const agora = Date.parse('2026-08-26T12:00:00Z');
  const ts = new Date(agora - 60_000).toISOString();
  const r = lerInstantaneo({ agora, readImpl: () => JSON.stringify({ ts, pontos: 3.2, total: 10, pct: 32, sha_head: 'aaaaaaaaaaaa', sha_origin_main: 'bbbbbbbbbbbb' }) });
  assert.equal(r.sha_head, 'aaaaaaaaaaaa', 'o leitor deitava fora o sha');
  assert.equal(r.sha_origin_main, 'bbbbbbbbbbbb');
  // Um instantaneo de antes de 2026-09-11 so trazia `sha`, e esse era o
  // origin/main — nunca se le como o HEAD medido.
  const velho = lerInstantaneo({ agora, readImpl: () => JSON.stringify({ ts, pontos: 3.2, total: 10, pct: 32, sha: 'cccccccccccc' }) });
  assert.equal(velho.sha_origin_main, 'cccccccccccc');
  assert.equal(velho.sha_head, null);
});

test('MORDIDA: um carimbo no FUTURO nao e fresco — idade zero era a leitura mais confiante de um relogio errado', () => {
  // `Math.max(0, …)` transformava um timestamp de 2099 em `fresco: true,
  // idade_s: 0`. Um adversario mediu-o.
  const agora = Date.parse('2026-08-26T12:00:00Z');
  const r = lerInstantaneo({ agora, readImpl: () => JSON.stringify({ ts: '2099-01-01T00:00:00.000Z', pontos: 3.2, total: 10, pct: 32 }) });
  assert.equal(r.presente, true, 'presente: o ficheiro existe e le-se');
  assert.equal(r.fresco, false, 'um relogio no futuro nao e fresco');
  assert.ok(r.idade_s < 0, 'a idade negativa fica a vista, nao se recorta a zero (' + r.idade_s + ')');
  assert.match(r.porque, /relogio no futuro/);
  // O par: um carimbo de ha um minuto continua fresco e sem porque.
  const ok = lerInstantaneo({ agora, readImpl: () => JSON.stringify({ ts: new Date(agora - 60_000).toISOString(), pontos: 1 }) });
  assert.equal(ok.fresco, true);
  assert.equal(ok.porque, undefined);
});
