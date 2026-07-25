'use strict';
/**
 * worktrees.js — mooter-bridge v1.3.4 · Onda C: frota sem exigir git.
 *
 * O guard está certo — dois agentes na mesma árvore corrompem-se — mas a
 * consequência para quem não sabe git era brutal: a segunda tarefa era recusada
 * e a saída oferecida era um conceito que o utilizador não tem. Na auditoria de
 * 2026-07-25, correr CC e Codex ao mesmo tempo exigiu arqueologia numa wave
 * antiga para descobrir que existia `frugal-integ` — e essa árvore estava noutra
 * branch, sem o ficheiro pedido.
 *
 * Um produto que vende FROTA não pode exigir que o utilizador saiba criar
 * worktrees para ter frota.
 *
 * Três níveis, por ordem de ambição:
 *   1. listar    — caminho · branch · livre/ocupada   (sempre, read-only)
 *   2. oferecer  — o erro de ocupada passa a trazer as livres
 *   3. criar     — `git worktree add`, e SÓ com pedido explícito
 *
 * O nível 3 é a primeira coisa neste conector que escreve estado fora do job
 * dir, por isso é opt-in: `create_worktree: true`. O código existe; a decisão
 * de o usar é de quem chama.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd: cwd || undefined,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 8000,
    windowsHide: true,
  });
}

/** Raiz do repositório principal, a partir de qualquer worktree dele. */
function mainRepo(hint) {
  const cands = [hint, process.env.MOOTER_REPO, path.join(os.homedir(), 'frugal'), path.join(os.homedir(), 'Documents', 'frugal')].filter(Boolean);
  for (const c of cands) {
    try { if (fs.existsSync(path.join(c, '.git')) || fs.existsSync(path.join(c, 'tools', 'router', 'classify.js'))) return c; }
    catch { /* próximo */ }
  }
  return null;
}

/**
 * Todas as worktrees registadas, com branch e se estão livres.
 * `busyFn(path) -> string[]` diz que jobs ocupam cada uma (vem do ledger).
 */
function list(repoHint, busyFn) {
  const repo = mainRepo(repoHint);
  if (!repo) return { error: 'não encontrei o repositório — define MOOTER_REPO', worktrees: [] };
  let raw;
  try { raw = git(['worktree', 'list', '--porcelain'], repo); }
  catch (e) { return { error: 'git worktree list falhou: ' + ((e && e.message) || e).toString().slice(0, 200), worktrees: [] }; }

  const out = [];
  let cur = null;
  for (const line of String(raw).split('\n')) {
    const l = line.trim();
    if (l.startsWith('worktree ')) { cur = { path: l.slice(9), branch: null, detached: false, bare: false }; out.push(cur); }
    else if (!cur) continue;
    else if (l.startsWith('branch ')) cur.branch = l.slice(7).replace(/^refs\/heads\//, '');
    else if (l === 'detached') cur.detached = true;
    else if (l === 'bare') cur.bare = true;
  }

  for (const w of out) {
    const jobs = typeof busyFn === 'function' ? (busyFn(w.path) || []) : [];
    w.busy = jobs.length > 0;
    w.busy_jobs = jobs.length ? jobs : null;
    w.name = path.basename(w.path);
    w.is_main = path.resolve(w.path).toLowerCase() === path.resolve(repo).toLowerCase();
    try { w.exists = fs.existsSync(w.path); } catch { w.exists = false; }
  }
  const free = out.filter((w) => w.exists && !w.busy && !w.bare);
  return {
    repo,
    total: out.length,
    free: free.length,
    worktrees: out,
    // o que interessa a quem só quer trabalhar: onde é que posso pôr o próximo job
    livres: free.map((w) => ({ path: w.path, name: w.name, branch: w.branch || (w.detached ? '(detached)' : null) })),
  };
}

/** A primeira worktree livre, preferindo as que NÃO são a principal. */
function firstFree(repoHint, busyFn, avoid) {
  const r = list(repoHint, busyFn);
  if (r.error) return null;
  const av = avoid ? path.resolve(avoid).toLowerCase() : null;
  const usable = r.worktrees.filter((w) => w.exists && !w.busy && !w.bare
    && (!av || path.resolve(w.path).toLowerCase() !== av));
  if (!usable.length) return null;
  const secondary = usable.filter((w) => !w.is_main);
  return (secondary[0] || usable[0]).path;
}

/**
 * Criar uma worktree nova. ⚠️ Escreve no disco — só com pedido explícito.
 * Cria uma branch própria a partir do HEAD actual para nunca colidir com outra
 * árvore; se a branch já existir, reutiliza-a.
 */
function create(repoHint, name) {
  const repo = mainRepo(repoHint);
  if (!repo) return { ok: false, error: 'não encontrei o repositório principal' };
  const safe = String(name || 'mooter').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 40) || 'mooter';
  const dir = path.resolve(path.dirname(repo), path.basename(repo) + '-' + safe);
  const branch = 'mooter/wt-' + safe;
  if (fs.existsSync(dir)) return { ok: true, path: dir, reused: true, note: 'a pasta já existia — reutilizada' };
  try {
    try { git(['worktree', 'add', '-b', branch, dir], repo); }
    catch { git(['worktree', 'add', dir, branch], repo); }   // branch já existia
    return { ok: true, path: dir, branch, created: true, note: 'worktree criada — reversível com `git worktree remove`' };
  } catch (e) {
    return { ok: false, error: 'git worktree add falhou: ' + ((e && e.message) || e).toString().slice(0, 300) };
  }
}

module.exports = { list, firstFree, create, mainRepo };
