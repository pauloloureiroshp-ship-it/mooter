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

  t('uma worktree ocupada deixa de contar como livre', () => {
    const r = wt.list(REPO, (p) => (path.resolve(p) === path.resolve(REPO) ? ['job-1'] : []));
    assert.strictEqual(r.free, 0);
    assert.strictEqual(r.worktrees[0].busy, true);
    assert.deepStrictEqual(r.worktrees[0].busy_jobs, ['job-1']);
  });

  t('cria uma worktree nova, com branch própria', () => {
    const made = wt.create(REPO, 'wave-x');
    assert.ok(made.ok, made.error);
    assert.ok(fs.existsSync(made.path), 'a pasta não foi criada');
    const r = wt.list(REPO, () => []);
    assert.strictEqual(r.total, 2);
  });

  t('firstFree evita a principal e a que está ocupada', () => {
    // principal ocupada → tem de devolver a secundária
    const free = wt.firstFree(REPO, (p) => (path.resolve(p) === path.resolve(REPO) ? ['job-1'] : []));
    assert.ok(free, 'não encontrou nenhuma livre');
    assert.notStrictEqual(path.resolve(free), path.resolve(REPO));
  });

  t('com tudo ocupado, firstFree devolve null (e não improvisa)', () => {
    const free = wt.firstFree(REPO, () => ['job-x']);
    assert.strictEqual(free, null);
  });

  t('criar duas vezes reutiliza em vez de duplicar', () => {
    const a = wt.create(REPO, 'wave-x');
    assert.ok(a.ok);
    assert.ok(a.reused, 'criou uma segunda pasta com o mesmo nome');
  });
}

function t(name, fn) {
  try { fn(); ok(name); } catch (e) { bad(name, e); }
}

console.log('\n' + pass + ' testes de worktree' + (process.exitCode ? ' — COM FALHAS' : ' — tudo verde') + '\n');
try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ }
