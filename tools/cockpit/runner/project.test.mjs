/**
 * project.test.mjs — B1, B2 e B3: que repo, onde vive o estado, que pilares.
 *
 * O runner sabia conduzir exactamente um projecto (o seu proprio), guardava o
 * estado num sitio global sem campo de repo, e tinha os pilares cravados numa
 * definicao literal. Estes testes prendem as tres coisas.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveRepoRoot, repoFlag, projectPaths, projectSlug, repoSha, ENV_KEYS , versaoDoConector} from './project.mjs';
import { loadPillars, validarPilares, PILLARS, PILLARS_FILE } from './context-pack.mjs';
import { proporPilares, entradasDeclaradas, canonDoProjecto, escreverProposta, PROPOSTA_FILE } from './pilot-init.mjs';

const tmp = (nome) => fs.mkdtempSync(path.join(os.tmpdir(), `moo-${nome}-`));

// ------------------------------------------------------------------ B1: repo

test('B1: --repo em qualquer das duas formas', () => {
  assert.equal(repoFlag(['--repo', '/a/b']), '/a/b');
  assert.equal(repoFlag(['--once', '--repo=/c/d']), '/c/d');
  assert.equal(repoFlag(['--once']), null);
});

test('B1 ACEITACAO: a ordem de resolucao e flag > env > git > script', () => {
  const flagDir = tmp('flag');
  const envDir = tmp('env');
  const gitDir = tmp('git');
  const scriptDir = tmp('script');
  const gitImpl = () => `${gitDir}\n`;

  assert.deepEqual(
    resolveRepoRoot({ argv: ['--repo', flagDir], env: { MOOTER_REPO: envDir }, gitImpl, scriptRoot: scriptDir }),
    { root: fs.realpathSync(flagDir) === flagDir ? flagDir : path.resolve(flagDir), fonte: 'flag' },
    'a flag ganha a tudo — e o gesto mais explicito que existe',
  );
  const porEnv = resolveRepoRoot({ argv: [], env: { MOOTER_REPO: envDir }, gitImpl, scriptRoot: scriptDir });
  assert.equal(porEnv.fonte, 'env');
  assert.equal(porEnv.root, path.resolve(envDir));
  assert.equal(resolveRepoRoot({ argv: [], env: {}, gitImpl, scriptRoot: scriptDir }).fonte, 'git');
  assert.equal(resolveRepoRoot({ argv: [], env: {}, gitImpl: () => { throw new Error('sem git'); }, scriptRoot: scriptDir }).fonte, 'script');
});

test('B1: os nomes de env que o repo JA usa sao honrados, por ordem', () => {
  // Inventar um terceiro nome para a mesma ideia e como ter cinco numeros de
  // versao para a mesma coisa. MOOTER_REPO ja vive em mooter-bridge/tools6.js
  // e MOOTER_REPO_ROOT em tools/router/matrix-status.js.
  assert.deepEqual(ENV_KEYS, ['MOO_REPO_ROOT', 'MOOTER_REPO_ROOT', 'MOOTER_REPO']);
  const a = tmp('a');
  const b = tmp('b');
  const r = resolveRepoRoot({ argv: [], env: { MOOTER_REPO: b, MOO_REPO_ROOT: a }, scriptRoot: a });
  assert.equal(r.root, path.resolve(a), 'o nome mais especifico ganha');
  assert.equal(r.chave, 'MOO_REPO_ROOT', 'e a resolucao diz QUAL venceu');
});

test('B1: um repo apontado que nao existe REBENTA em vez de cair para outro', () => {
  // Cair em silencio para o repo do script seria conduzir o projecto errado
  // sem ninguem dar por isso — a pior falha possivel neste sitio.
  assert.throws(() => resolveRepoRoot({ argv: ['--repo', '/nao/existe/de/certeza'] }), /--repo aponta/);
  assert.throws(() => resolveRepoRoot({ argv: [], env: { MOOTER_REPO: '/nao/existe' } }), /MOOTER_REPO aponta/);
  const f = path.join(tmp('ficheiro'), 'x.txt');
  fs.writeFileSync(f, 'nao sou uma pasta');
  assert.throws(() => resolveRepoRoot({ argv: ['--repo', f] }), /nao e uma pasta/);
});

// --------------------------------------------------------------- B2: estado

test('B2 ACEITACAO: dois projectos nao partilham ledger, cursor, lock nem STOP', () => {
  const moo = tmp('home');
  const canon = tmp('canon');
  const outro = tmp('outro');
  const a = projectPaths({ repoRoot: canon, mooDir: moo, canonicalRoot: canon });
  const b = projectPaths({ repoRoot: outro, mooDir: moo, canonicalRoot: canon });

  for (const k of ['LEDGER', 'CURSOR', 'LOCK', 'STOP_FILE', 'FOCUS', 'ANCORA', 'STATE']) {
    assert.notEqual(a[k], b[k], `${k} tem de ser por projecto — dois projectos nao podiam coexistir`);
  }
  assert.equal(a.canonico, true);
  assert.equal(b.canonico, false);
  assert.ok(b.base.includes(path.join('projects', b.slug)), 'o projecto nao canonico vive em projects/<slug>');
});

test('B2: o repo canonico deste device MANTEM os caminhos planos de sempre', () => {
  const moo = tmp('home');
  const canon = tmp('canon');
  const a = projectPaths({ repoRoot: canon, mooDir: moo, canonicalRoot: canon });
  assert.equal(a.LEDGER, path.join(moo, 'runner-ledger.jsonl'),
    'sao 5478 recibos ja escritos, e um painel e uma frota que os leem ai — mover isso e orfanar historico por simetria');
});

test('B2: o slug e legivel para um humano e unico para a maquina', () => {
  const s1 = projectSlug('/Users/x/projectos/api');
  const s2 = projectSlug('/Users/y/outro/api');
  assert.match(s1, /^api-[0-9a-f]{10}$/, 'basename para navegar, hash para nao colidir');
  assert.notEqual(s1, s2, 'dois repos com o mesmo nome nao podem partilhar pasta');
  assert.equal(s1, projectSlug('/Users/x/projectos/api/'), 'estavel: a mesma raiz da sempre a mesma pasta');
});

test('B2: repo_sha e medido ou n/d — nunca inventado', () => {
  assert.equal(repoSha(tmp('sem-git')), null, 'sem git nao ha sha, e n/d e a resposta honesta');
  assert.equal(repoSha('/x', () => 'nao-e-um-sha\n'), null, 'e uma saida que nao e um sha tambem nao passa');
  assert.equal(repoSha('/x', () => `${'a'.repeat(40)}\n`), 'a'.repeat(12));
});

// -------------------------------------------------------------- B3: pilares

test('B3: sem .mooter/pilares.json, os embutidos continuam a ser a verdade', () => {
  const r = loadPillars(tmp('vazio'));
  assert.equal(r.fonte, 'default');
  assert.deepEqual(r.pillars, PILLARS);
  assert.equal(r.erro, null, 'ausente e o caso NORMAL, nao um erro');
});

test('B3 ACEITACAO: um projecto declara os seus pilares e o runner usa-os', () => {
  const repo = tmp('projecto');
  fs.mkdirSync(path.join(repo, '.mooter'), { recursive: true });
  fs.writeFileSync(path.join(repo, PILLARS_FILE), JSON.stringify({
    pilares: { API: { label: 'API publica', files: ['src/api.ts'], ask: 'Que linha trata mal um input?' } },
  }));
  const r = loadPillars(repo);
  assert.equal(r.fonte, 'projeto');
  assert.deepEqual(r.ids, ['API']);
  assert.equal(r.pillars.API.label, 'API publica');
});

test('B3: um pilares.json partido nao para a ronda MAS tambem nao se cala', () => {
  // Um catch que devolve vazio em silencio foi como o modo diff ficou morto um
  // dia inteiro sem ninguem saber. Aqui degrada-se E reporta-se.
  const partido = loadPillars('/x', { readImpl: () => '{ isto nao e json' });
  assert.equal(partido.fonte, 'default', 'a ronda continua');
  assert.match(partido.erro, /nao e JSON valido/, 'e o dono fica a saber que o ficheiro dele foi ignorado');
});

test('B3: um caminho que sai do repo e recusado, nao normalizado', () => {
  const v = validarPilares({ P: { label: 'x', ask: 'y', files: ['../../etc/passwd'] } });
  assert.equal(v.ok, false);
  assert.match(v.erros.join(' '), /fora do repo/);
  assert.equal(validarPilares({ P: { label: 'x', ask: 'y', files: ['/etc/passwd'] } }).ok, false);
  assert.equal(validarPilares({ P: { label: 'x', ask: 'y', files: [] } }).ok, false, 'um pilar sem ficheiros aponta ao vazio');
  assert.equal(validarPilares([]).ok, false);
  assert.equal(validarPilares({ P: { label: 'x', files: ['a.js'] } }).ok, false, 'sem `ask` nao ha ronda');
});

// ------------------------------------------------- B3: moo-pilot init propoe

test('B3: o init PROPOE — escreve a proposta, nunca o ficheiro que o runner le', () => {
  const repo = tmp('init');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ main: 'index.js', scripts: { start: 'node index.js' } }));
  fs.writeFileSync(path.join(repo, 'index.js'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(repo, 'README.md'), '# projecto\n');

  const p = proporPilares(repo, { churnImpl: () => [] });
  const destino = escreverProposta(repo, p);

  assert.equal(path.relative(repo, destino), PROPOSTA_FILE);
  assert.equal(fs.existsSync(path.join(repo, PILLARS_FILE)), false,
    'escrever o ficheiro a valer seria o motor a escolher o que se revê a si proprio');
  const corpo = JSON.parse(fs.readFileSync(destino, 'utf8'));
  assert.ok(corpo._leia_me.join(' ').includes(PILLARS_FILE), 'a proposta diz como se aprova');
  assert.equal(loadPillars(repo).fonte, 'default', 'e o runner continua nos embutidos ate o dono decidir');
});

test('B3: o init so propoe ficheiros que EXISTEM, e diz o que deixou de fora', () => {
  const repo = tmp('init2');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ main: 'nao-existe.js', scripts: { t: 'node tambem-nao.js' } }));
  assert.deepEqual(entradasDeclaradas(repo), [], 'um pilar que aponta ao vazio produz rondas n/d e ensina a ignorar o painel');
  assert.deepEqual(canonDoProjecto(repo), []);
  const p = proporPilares(repo, { churnImpl: () => [] });
  assert.deepEqual(Object.keys(p.pilares), []);
  assert.deepEqual(p.rejeitados, ['P1', 'P2', 'P3', 'P4'], 'sem tectos silenciosos: o que ficou de fora diz-se');
});

test('B3: o init nao propoe rever a propria suite de testes', () => {
  const repo = tmp('init3');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    scripts: { test: 'node --test a.test.mjs b.test.mjs', build: 'node build.js' },
  }));
  for (const f of ['a.test.mjs', 'b.test.mjs', 'build.js']) fs.writeFileSync(path.join(repo, f), '// x\n');
  assert.deepEqual(entradasDeclaradas(repo), ['build.js']);
});

test('B3: a proposta que sai deste repo passa na propria validacao', () => {
  // O que o init propoe tem de ser aceite pelo loader. Se as duas metades
  // divergirem, o dono aprova um ficheiro que o runner depois recusa.
  const repoReal = path.resolve(new URL('../../..', import.meta.url).pathname);
  const p = proporPilares(repoReal);
  const v = validarPilares(p.pilares);
  assert.equal(v.ok, true, `a proposta tem de passar no loader: ${v.erros.join('; ')}`);
  assert.ok(Object.keys(p.pilares).length >= 3, 'neste repo ha material para pelo menos tres pilares');
});

// ── a versao do conector (2026-08-19) ────────────────────────────────────────

/**
 * Estava cravada a mao em `fleet-state.mjs` como '1.48.0'. Medido nesse dia: o
 * repo ia em 1.49.3 e a maquina do dono tinha 1.33.0 instalada no Claude
 * Desktop. O painel afirmava um numero que nao correspondia a NENHUM dos dois —
 * exactamente a pergunta que o pilar P7 faz sobre os numeros do proprio painel.
 */
test('a versao do conector le-se do manifest, nao se copia', () => {
  const falso = () => JSON.stringify({ version: '9.9.9' });
  assert.equal(versaoDoConector('/qualquer', { readImpl: falso }), '9.9.9');
});

test('sem manifest legivel, a versao e n/d — nunca um palpite', () => {
  const rebenta = () => { throw new Error('ENOENT'); };
  assert.equal(versaoDoConector('/qualquer', { readImpl: rebenta }), null);
  assert.equal(versaoDoConector('/qualquer', { readImpl: () => 'isto nao e json' }), null);
  assert.equal(versaoDoConector('/qualquer', { readImpl: () => JSON.stringify({}) }), null);
  assert.equal(versaoDoConector('/qualquer', { readImpl: () => JSON.stringify({ version: '  ' }) }), null,
    'uma versao em branco e ausencia, nao um valor');
});
