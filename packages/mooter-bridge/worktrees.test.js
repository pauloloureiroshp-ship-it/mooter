'use strict';
/**
 * worktrees.test.js — Onda C: a frota deixa de exigir git ao utilizador.
 *
 * O guard que impede dois agentes na mesma árvore está certo e fica. O que
 * mudou é a saída: em vez de "passa outra worktree" — um conceito que o vibe
 * coder não tem — o conector procura uma livre, e só fala de git se não houver.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// ⚠️ A6 — o env ANTES dos requires, e o repo de teste criado antes de tudo.
// Em Windows, com 37 worktrees reais, um `mainRepo()` que caia no repositório do
// Paulo faz `git worktree list` devolver a frota inteira e o teste falha por
// razões que nada têm a ver com o código.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-wt-'));
const REPO = path.join(HOME, 'proj');
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_WORKTREE_ROOT = HOME;
process.env.MOOTER_REPO = REPO;

const wt = require('./worktrees.js');
const P = require('./paths.js');

let pass = 0;
const ok = (n) => { console.log('  ok  ' + n); pass++; };
const bad = (n, e) => { console.log('  FAIL ' + n + '\n       ' + ((e && e.message) || e)); process.exitCode = 1; };

let gitOk = true;
try {
  fs.mkdirSync(REPO, { recursive: true });
  const g = (a, c) => execFileSync('git', a, { cwd: c || REPO, stdio: 'ignore' });
  g(['init', '-q']);
  g(['config', 'user.email', 't@t']); g(['config', 'user.name', 't']);
  fs.writeFileSync(path.join(REPO, 'a.txt'), 'x');
  g(['add', 'a.txt']); g(['commit', '-qm', 'init']);
} catch { gitOk = false; }

console.log('\nworktrees — frota sem exigir git');

if (!gitOk) {
  console.log('  (git indisponível — testes saltados)');
} else {
  process.env.MOOTER_REPO = REPO;

  t('lista a worktree principal com a sua branch', () => {
    const r = wt.list(REPO, () => []);
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.total, 1);
    assert.strictEqual(r.free, 1);
    assert.ok(r.worktrees[0].is_main);
    assert.ok(r.worktrees[0].branch, 'sem branch');
  });

  // ⚠️ este teste falhou no Windows por comparar caminhos com `path.resolve`,
  // que é EXACTAMENTE o erro que o `paths.js` existe para corrigir: o git
  // devolve a forma longa e o `mkdtemp` a forma curta 8.3. O teste estava a
  // codificar a comparação partida — usa agora o mesmo critério que a produção.
  t('uma worktree ocupada deixa de contar como livre', () => {
    const r = wt.list(REPO, (p) => (P.mesmo(p, REPO) ? ['job-1'] : []));
    assert.strictEqual(r.free, 0);
    assert.strictEqual(r.worktrees[0].busy, true);
    assert.deepStrictEqual(r.worktrees[0].busy_jobs, ['job-1']);
  });

  t('cria uma worktree nova, com branch própria', () => {
    const made = wt.create(REPO, 'wave-x');
    assert.ok(made.ok, made.error);
    assert.ok(fs.existsSync(made.path), 'a pasta não foi criada');
    assert.strictEqual(path.dirname(made.path), path.dirname(REPO), 'a pasta saiu do pai da worktree actual');
    const r = wt.list(REPO, () => []);
    assert.strictEqual(r.total, 2);
  });

  t('firstFree evita a principal e a que está ocupada', () => {
    // principal ocupada → tem de devolver a secundária
    const free = wt.firstFree(REPO, (p) => (path.resolve(p) === path.resolve(REPO) ? ['job-1'] : []));
    assert.ok(free, 'não encontrou nenhuma livre');
    assert.notStrictEqual(path.resolve(free), path.resolve(REPO));
  });

  t('firstFree prefere a candidata fresca à desactualizada e mede a distância ao ramo principal', () => {
    const stalePath = path.join(path.dirname(REPO), path.basename(REPO) + '-stale-candidate');
    execFileSync('git', ['branch', 'stale-candidate', 'HEAD'], { cwd: REPO, stdio: 'ignore' });
    execFileSync('git', ['worktree', 'add', stalePath, 'stale-candidate'], { cwd: REPO, stdio: 'ignore' });

    fs.writeFileSync(path.join(REPO, 'fresh.txt'), 'novo\n');
    execFileSync('git', ['add', 'fresh.txt'], { cwd: REPO, stdio: 'ignore' });
    execFileSync('git', ['commit', '-qm', 'fresh head'], { cwd: REPO, stdio: 'ignore' });

    const freshPath = path.join(path.dirname(REPO), path.basename(REPO) + '-fresh-candidate');
    execFileSync('git', ['branch', 'fresh-candidate', 'HEAD'], { cwd: REPO, stdio: 'ignore' });
    execFileSync('git', ['worktree', 'add', freshPath, 'fresh-candidate'], { cwd: REPO, stdio: 'ignore' });

    const selected = wt.firstFree(REPO, () => [], REPO, ['a.txt']);
    assert.ok(P.mesmo(selected, freshPath), 'escolheu a candidata desactualizada: ' + selected);

    const stale = wt.frescura(stalePath, REPO);
    const fresh = wt.frescura(freshPath, REPO);
    assert.strictEqual(stale.behind_main, 1);
    assert.strictEqual(fresh.behind_main, 0);
    assert.strictEqual(fresh.branch, 'fresh-candidate');
    assert.match(fresh.head_short, /^[0-9a-f]{7}$/i);
    assert.strictEqual(typeof fresh.commit_age_seconds, 'number');
    assert.ok(fresh.commit_age_human);
  });

  t('com tudo ocupado, firstFree devolve null (e não improvisa)', () => {
    const free = wt.firstFree(REPO, () => ['job-x']);
    assert.strictEqual(free, null);
  });

  t('criar duas vezes recusa em vez de trabalhar por cima da pasta existente', () => {
    const a = wt.create(REPO, 'wave-x');
    assert.strictEqual(a.ok, false);
    assert.ok(/já existe|por cima/i.test(a.error), a.error);
  });

  // S4 — o total deixa de contar detached/%TEMP% (nunca são candidatas reais a
  // trabalho), mas o número bruto continua visível, com o porquê da exclusão.
  t('total exclui detached; total_bruto continua a mostrar o número real', () => {
    const before = wt.list(REPO, () => []);
    const detachedPath = path.join(path.dirname(REPO), path.basename(REPO) + '-detached-x');
    execFileSync('git', ['worktree', 'add', '--detach', detachedPath], { cwd: REPO, stdio: 'ignore' });
    const r = wt.list(REPO, () => []);
    assert.strictEqual(r.total, before.total, 'a detached não pode entrar no total elegível');
    assert.strictEqual(r.total_bruto, before.total_bruto + 1, 'o bruto tem de contar a detached');
    assert.match(r.total_bruto_porque, /detached/i);
    assert.ok(r.worktrees.some((w) => w.detached), 'a lista bruta continua a mostrar a detached, sem esconder');
  });

  // ⚠️ v1.4.2 — nasceu de um caso real. Pedi ao motor local um resumo de
  // `telemetry.js` numa pasta onde esse ficheiro não existe naquela branch. A
  // recusa estava certa; o que faltava era dizer ONDE o ficheiro está, entre 37
  // pastas. Sem isso, o utilizador adivinha — e o modelo, esse, respondeu
  // "NAO CONSEGUI LER" e a seguir inventou uma função que não existe.
  t('comOsFicheiros diz em que pastas o ficheiro existe mesmo', () => {
    const com = wt.comOsFicheiros(REPO, () => [], ['a.txt']);
    assert.ok(com.length >= 1, 'não encontrou a pasta que tem o ficheiro');
    assert.ok(com.every((w) => fs.existsSync(path.join(w.path, 'a.txt'))));
    assert.ok(com.every((w) => w.path && w.name), 'a sugestão tem de trazer caminho utilizável');
  });

  t('comOsFicheiros não inventa pastas para um ficheiro que não existe', () => {
    assert.deepStrictEqual(wt.comOsFicheiros(REPO, () => [], ['nao-existe-em-lado-nenhum.js']), []);
  });

  t('comOsFicheiros inclui as ocupadas, mas marca-as', () => {
    const com = wt.comOsFicheiros(REPO, () => ['job-1'], ['a.txt']);
    assert.ok(com.length >= 1, 'esconder as ocupadas transforma a sugestão em "não há nada"');
    assert.ok(com.every((w) => w.busy === true), 'ocupada por marcar — o utilizador ia bater no guard');
  });
}

function t(name, fn) {
  try { fn(); ok(name); } catch (e) { bad(name, e); }
}

console.log('\n' + pass + ' testes de worktree' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ }
