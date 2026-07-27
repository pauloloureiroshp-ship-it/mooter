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
const P = require('./paths.js');

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
    w.is_main = P.mesmo(w.path, repo);
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

/**
 * ⚠️ A5 — escolher uma pasta que TENHA o ficheiro pedido.
 *
 * A v1.3.5 escolhia a primeira livre e mais nada. Resultado real: pedi trabalho
 * sobre `worktrees.js` e o job foi para uma worktree em **%TEMP%, em detached
 * HEAD**, onde esse ficheiro não existe em nenhuma branch. O cc e o codex
 * responderam correctamente "NÃO CONSEGUI LER" — o conector é que os mandou
 * para o sítio errado, com 35 pastas limpas disponíveis.
 *
 * Regras agora:
 *   · exclui `detached` e qualquer coisa sob %TEMP% (nunca são o teu trabalho)
 *   · se o goal cita ficheiros, exclui as pastas onde eles não existem em disco
 *   · prefere as secundárias à principal, para não bloquear a árvore de trabalho
 */
function isTemp(p) {
  // ⚠️ canon(): os.tmpdir() vem em 8.3 no Windows e o git devolve a forma longa
  return P.dentroDe(p, os.tmpdir());
}

/**
 * ⚠️ Uma worktree em %TEMP% só é suspeita se o REPO não estiver lá.
 *
 * A regra ingénua ("nunca %TEMP%") existia porque um job foi parar a
 * `AppData/Local/Temp/mooter-pr251-main-…` em detached HEAD. Mas as suites
 * criam repositórios inteiros em `mkdtemp` — e a regra ingénua excluía-os
 * todos, fazendo falhar um teste que estava certo. O sinal verdadeiro é a
 * DISCREPÂNCIA: repo fora do temp, worktree dentro dele.
 */
function suspeita(w, repo) {
  return isTemp(w.path) && !isTemp(repo);
}

function firstFree(repoHint, busyFn, avoid, requiredPaths) {
  const r = list(repoHint, busyFn);
  if (r.error) return null;
  const av = avoid ? P.canon(avoid) : null;
  let usable = r.worktrees.filter((w) => w.exists && !w.busy && !w.bare
    && !w.detached && !suspeita(w, r.repo)
    && (!av || P.canon(w.path) !== av));

  const req = Array.isArray(requiredPaths) ? requiredPaths.filter(Boolean) : [];
  if (req.length) {
    const comFicheiros = usable.filter((w) => req.every((rel) => {
      try { return fs.existsSync(path.join(w.path, rel)); } catch { return false; }
    }));
    // se nenhuma tem os ficheiros, é melhor não escolher do que escolher às cegas
    if (!comFicheiros.length) return null;
    usable = comFicheiros;
  }
  if (!usable.length) return null;
  const secondary = usable.filter((w) => !w.is_main);
  return (secondary[0] || usable[0]).path;
}

/**
 * Quais das pastas TÊM os ficheiros pedidos — para a recusa deixar de ser um
 * beco sem saída.
 *
 * Medido em 2026-07-25 com a v1.4.2 acabada de escrever: pedi ao motor local um
 * resumo de `telemetry.js` na pasta `frugal-w2`, onde esse ficheiro não existe
 * naquela branch. A resposta certa é recusar — mas recusar sem dizer ONDE o
 * ficheiro está obriga o utilizador a adivinhar entre 37 pastas. O modelo, esse,
 * respondeu "NAO CONSEGUI LER" e a seguir inventou uma função `emitTelemetry`
 * que não existe em lado nenhum. É este o custo de não dar saída.
 */
function comOsFicheiros(repoHint, busyFn, requiredPaths) {
  const r = list(repoHint, busyFn);
  if (r.error || !Array.isArray(requiredPaths) || !requiredPaths.length) return [];
  return r.worktrees
    .filter((w) => w.exists && !w.bare && !w.detached && !suspeita(w, r.repo))
    .filter((w) => requiredPaths.every((rel) => { try { return fs.existsSync(path.join(w.path, rel)); } catch { return false; } }))
    .map((w) => ({ name: w.name, path: w.path, branch: w.branch || null, busy: !!w.busy }));
}

/** Quais das livres NÃO têm os ficheiros pedidos — para o erro explicar-se. */
function semOsFicheiros(repoHint, busyFn, requiredPaths) {
  const r = list(repoHint, busyFn);
  if (r.error || !Array.isArray(requiredPaths) || !requiredPaths.length) return [];
  return r.worktrees
    .filter((w) => w.exists && !w.busy && !w.bare && !w.detached && !suspeita(w, r.repo))
    .filter((w) => !requiredPaths.every((rel) => { try { return fs.existsSync(path.join(w.path, rel)); } catch { return false; } }))
    .map((w) => w.name);
}

/**
 * Criar uma worktree nova. ⚠️ Escreve no disco — só com pedido explícito.
 * Cria uma branch própria a partir do HEAD da worktree de origem. Uma pasta
 * existente é sempre recusa: reutilizá-la faria `create_worktree:true` prometer
 * isolamento e entregar estado anterior.
 */
function create(repoHint, name, sourceWorktree) {
  const repo = mainRepo(repoHint);
  if (!repo) return { ok: false, error: 'não encontrei o repositório principal' };
  const safe = String(name || 'mooter').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 40) || 'mooter';
  const source = sourceWorktree ? path.resolve(sourceWorktree) : path.resolve(repo);
  if (!fs.existsSync(source)) return { ok: false, error: 'a worktree de origem não existe: ' + source };
  const dir = path.resolve(path.dirname(source), path.basename(repo) + '-' + safe);
  const branch = 'mooter/wt-' + safe;
  if (fs.existsSync(dir)) {
    return { ok: false, error: 'a pasta de destino já existe; recuso criar por cima: ' + dir, path: dir };
  }
  try {
    try { git(['worktree', 'add', '-b', branch, dir, 'HEAD'], source); }
    catch { git(['worktree', 'add', dir, branch], source); }   // branch já existia
    return {
      ok: true, path: dir, branch, source, created: true,
      note: 'worktree criada — reversível com `git worktree remove`',
    };
  } catch (e) {
    return { ok: false, error: 'git worktree add falhou: ' + ((e && e.message) || e).toString().slice(0, 300) };
  }
}

module.exports = { list, firstFree, create, mainRepo, semOsFicheiros, comOsFicheiros, isTemp, suspeita };
