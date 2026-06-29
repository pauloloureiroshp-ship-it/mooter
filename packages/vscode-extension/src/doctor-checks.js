// doctor-checks.js — Cockpit Doctor & Self-Heal ("simplesmente funciona").
// Six filesystem/git diagnostics that DETECT a broken state → EXPLAIN it → OFFER a
// 1-click fix. Doctrine: detection is automatic; the DESTRUCTIVE cure (removing locks,
// checkout-overwrite, deleting branches, re-packing) is NEVER auto-run — each check only
// returns a `fix` string the host turns into a `term:<cmd>` button the human clicks.
//
// This module is HOST-SIDE pure node (no vscode import, no template-literal-into-webview
// concern — it runs in the extension host, not the browser). The six check functions are
// PURE and SYNCHRONOUS over INJECTED inputs (pre-computed exec results / fs facts), so the
// whole feature is unit-testable headless with fixtures — no real git/network in tests.
// `gatherDoctorInputs` is the only async part: it shells out (via an injected exec) and
// reads the disk, then hands the facts to the pure checks. Never throws; degrades to a
// "could not determine" warn (ok:null) rather than crashing the cockpit.
'use strict';

const fsDefault = require('fs');
const pathDefault = require('path');
const crypto = require('crypto');

// FROZEN sha256 of tools/router/classify.js (CI-enforced invariant). Mirrors
// host-extra.js FROZEN_CLASSIFY_SHA — kept here so check #4 is self-contained/testable.
const FROZEN_CLASSIFY_SHA = '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f';

// Each `fix` is a data-action string the existing Doctor renderer already understands:
//   'term:<cmd>'      → host writes <cmd> into the integrated terminal (runInTerminal).
//   'openUrl:<url>'   → host opens the URL.
//   'refresh'         → re-run the snapshot.
// Destructive cures (rm lock, checkout --, branch -d, worktree prune, re-pack) are ALWAYS
// 'term:<cmd>' — offered, never executed by the extension.

// ── 1) Stale .git lock files (index.lock / HEAD.lock orphans) ──────────────
// A crashed/killed git leaves index.lock or *.lock behind → every later git op fails with
// "Unable to create '.../index.lock': File exists". Detection: the lock file is present.
// Cure: remove it (reversible — the lock holds no data; git rebuilds it). OFFERED only.
// `locks` = array of { name, path } the gatherer found; [] → healthy.
function checkGitLocks(input) {
  const locks = (input && Array.isArray(input.locks)) ? input.locks : [];
  if (!input || input.locks == null) {
    return { k: 'gitlock', t: 'Locks .git órfãos', ok: null, fix: 'refresh', detail: 'não foi possível inspeccionar .git' };
  }
  if (locks.length === 0) {
    return { k: 'gitlock', t: 'Locks .git órfãos', ok: true, fix: '', detail: 'sem index.lock/HEAD.lock pendentes' };
  }
  const names = locks.map((l) => l.name).join(', ');
  // git itself has no "rm lock" verb → offer the shell removal (reversible, no data loss).
  const rmList = locks.map((l) => '"' + l.path + '"').join(' ');
  return {
    k: 'gitlock',
    t: 'Locks .git órfãos (' + names + ')',
    ok: false,
    fix: 'term:rm -f ' + rmList,
    detail: locks.length + ' lock(s) stale a bloquear git — remover é seguro (não há dados no lock)',
  };
}

// ── 2) Truncated source files (working-tree size vs git blob size) ─────────
// The extension.js bug today: a file got truncated on disk while the committed blob was
// intact. Detection: compare working-tree byte size to `git cat-file -s <blob>`. A working
// copy MUCH smaller than its committed blob (below `ratio`, default 0.5) ⇒ likely truncated.
// Cure: `git checkout -- <file>` restores the committed version — DESTRUCTIVE (overwrites
// local edits), so OFFERED only. `files` = [{ path, wtSize, blobSize }]; sizes null = skip.
function checkTruncatedSources(input, opts) {
  const ratio = (opts && typeof opts.ratio === 'number') ? opts.ratio : 0.5;
  const files = (input && Array.isArray(input.files)) ? input.files : null;
  if (!files) {
    return { k: 'truncate', t: 'Ficheiros truncados', ok: null, fix: 'refresh', detail: 'sem dados de tamanho (git indisponível?)' };
  }
  const suspect = [];
  for (const f of files) {
    if (!f || typeof f.wtSize !== 'number' || typeof f.blobSize !== 'number') continue;
    if (f.blobSize <= 0) continue; // empty/new blob → nothing to compare
    // truncated = working copy meaningfully smaller than the committed blob.
    if (f.wtSize < f.blobSize * ratio) suspect.push(f);
  }
  if (suspect.length === 0) {
    return { k: 'truncate', t: 'Ficheiros truncados', ok: true, fix: '', detail: 'working-tree coincide com os blobs commitados' };
  }
  const worst = suspect.slice().sort((a, b) => (a.wtSize / a.blobSize) - (b.wtSize / b.blobSize))[0];
  const names = suspect.map((f) => f.path).join(', ');
  return {
    k: 'truncate',
    t: 'Ficheiro truncado? ' + names,
    ok: false,
    // checkout -- overwrites local content → DESTRUCTIVE → only offer it.
    fix: 'term:git checkout -- "' + worst.path + '"',
    detail: worst.path + ': ' + worst.wtSize + 'B no disco vs ' + worst.blobSize + 'B commitado — repor com checkout (sobrepõe edições locais)',
  };
}

// ── 3) vsix version drift (installed vsix vs package.json version) ─────────
// The packaged .vsix on disk lags the source package.json → you ship an old cockpit.
// Detection: max version among *.vsix files != package.json version. Cure: re-package
// (vsce package) — NON-destructive but offered as a terminal command. `installedVsix` =
// array of version strings parsed from filenames; `pkgVersion` = package.json version.
function checkVsixDrift(input) {
  const pkg = input && input.pkgVersion;
  const vsix = (input && Array.isArray(input.installedVsix)) ? input.installedVsix.filter(Boolean) : null;
  if (!pkg || !vsix) {
    return { k: 'vsixdrift', t: 'Versão do vsix', ok: null, fix: 'refresh', detail: 'sem package.json ou sem .vsix para comparar' };
  }
  if (vsix.length === 0) {
    // No packaged artifact at all — not drift, just "not built yet". Offer a build.
    return { k: 'vsixdrift', t: 'Versão do vsix', ok: null, fix: 'term:cd packages/vscode-extension && npx vsce package', detail: 'nenhum .vsix empacotado — package.json está em ' + pkg };
  }
  const newest = vsix.slice().sort(cmpSemver).pop();
  if (newest === pkg) {
    return { k: 'vsixdrift', t: 'Versão do vsix', ok: true, fix: '', detail: 'vsix ' + newest + ' = package.json ' + pkg };
  }
  return {
    k: 'vsixdrift',
    t: 'Drift de versão do vsix (' + newest + ' ≠ ' + pkg + ')',
    ok: false,
    fix: 'term:cd packages/vscode-extension && npx vsce package',
    detail: 'vsix empacotado em ' + newest + ' mas o source está em ' + pkg + ' — re-empacotar para alinhar',
  };
}

// Compare two dotted version strings numerically (NOT lexically — "0.16.44" > "0.16.0").
function cmpSemver(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// ── 4) classify.js frozen sha (invariant violated → RED) ───────────────────
// The routing engine's classifier is FROZEN; any byte change is a CI-failing invariant
// violation. Detection: live sha256 of tools/router/classify.js != FROZEN_CLASSIFY_SHA.
// There is NO safe auto-cure (you must `git checkout` the engine) → offer the restore
// command. `liveSha` = the computed sha, or null when the file is absent/unreadable.
function checkClassifySha(input) {
  const live = input && input.liveSha;
  if (!live) {
    return { k: 'classifysha', t: 'classify.js (engine frozen)', ok: null, fix: 'refresh', detail: 'classify.js não encontrado neste repo' };
  }
  if (live === FROZEN_CLASSIFY_SHA) {
    return { k: 'classifysha', t: 'classify.js (engine frozen)', ok: true, fix: '', detail: 'sha intacta ' + live.slice(0, 12) + '…' };
  }
  return {
    k: 'classifysha',
    t: '⚠ classify.js ALTERADO (invariante violado)',
    ok: false,
    fix: 'term:git checkout -- tools/router/classify.js',
    detail: 'sha ' + live.slice(0, 12) + '… ≠ frozen ' + FROZEN_CLASSIFY_SHA.slice(0, 12) + '… — o engine foi modificado; repor antes de commitar',
  };
}

// ── 5) Prunable worktrees + merged branches accumulated ────────────────────
// Stale worktree registrations (deleted dirs still listed) and branches already merged into
// main pile up. Detection: `git worktree list --porcelain` lines flagged `prunable`, plus the
// count of `git branch --merged main` (excluding main/current). Cure: `git worktree prune`
// (safe) and `git branch -d <names>` (-d refuses unmerged → loss-proof). Both OFFERED.
// `prunableWorktrees` = array of paths; `mergedBranches` = array of branch names.
function checkWorktreeHygiene(input) {
  const wt = (input && Array.isArray(input.prunableWorktrees)) ? input.prunableWorktrees : null;
  const merged = (input && Array.isArray(input.mergedBranches)) ? input.mergedBranches : null;
  if (!wt && !merged) {
    return { k: 'worktrees', t: 'Higiene de worktrees/branches', ok: null, fix: 'refresh', detail: 'git worktree/branch indisponível' };
  }
  const nWt = (wt || []).length;
  const nMerged = (merged || []).length;
  if (nWt === 0 && nMerged === 0) {
    return { k: 'worktrees', t: 'Higiene de worktrees/branches', ok: true, fix: '', detail: 'sem worktrees prunable nem branches merged a limpar' };
  }
  // Prefer offering the worktree prune (always safe) when present; else the branch cleanup.
  // -d (lower-case) NEVER deletes an unmerged branch → à prova de perda.
  let fix, detail;
  if (nWt > 0) {
    fix = 'term:git worktree prune';
    detail = nWt + ' worktree(s) prunable' + (nMerged ? ' + ' + nMerged + ' branch(es) merged' : '') + ' — prune é seguro';
  } else {
    const list = merged.slice(0, 20).map((b) => '"' + b + '"').join(' ');
    fix = 'term:git branch -d ' + list;
    detail = nMerged + ' branch(es) já merged em main — `branch -d` recusa não-merged (à prova de perda)';
  }
  return { k: 'worktrees', t: 'Limpar worktrees/branches (' + nWt + ' wt · ' + nMerged + ' merged)', ok: false, fix, detail };
}

// ── 6) "False-green" tests — webview-syntax gate must really pass ──────────
// A suite can be green overall while the REAL gate (webview-syntax: the CSP/concat-only
// contract) silently fails or never ran. Detection: parse `node --test` output and confirm
// the webview-syntax test reported a pass AND no failure. Never auto-runs anything; the cure
// is to OFFER running the full suite. `testOutput` = the captured stdout of `node --test`.
function checkTestsGate(input) {
  const out = input && typeof input.testOutput === 'string' ? input.testOutput : null;
  const cmd = 'cd packages/vscode-extension && node --test src/*.test.js';
  if (out == null) {
    return { k: 'testsgate', t: 'Gate de testes (webview-syntax)', ok: null, fix: 'term:' + cmd, detail: 'testes ainda não corridos — correr o gate completo' };
  }
  // The harness names the gate test "webview script parses (real template evaluation)".
  const sawGate = /webview[\s-]?syntax/i.test(out) || /webview script parses/i.test(out);
  // node:test TAP/spec markers for a failure on that line.
  const gateFail = /(✖|not ok|fail).*webview/i.test(out) || /webview.*(✖|not ok|fail)/i.test(out);
  // Any overall failure count > 0 also makes the suite false-green-suspect.
  const failCountMatch = out.match(/(?:^|\n)\s*(?:#\s*)?(?:ℹ\s*)?fail\s+(\d+)/i);
  const anyFail = (failCountMatch && parseInt(failCountMatch[1], 10) > 0) || /\n\s*not ok\s/.test(out);
  if (!sawGate) {
    return {
      k: 'testsgate', t: '⚠ Gate webview-syntax NÃO correu', ok: false, fix: 'term:' + cmd,
      detail: 'o output não menciona o gate webview-syntax — possível falso-verde; correr o suite completo',
    };
  }
  if (gateFail || anyFail) {
    return {
      k: 'testsgate', t: '⚠ Gate webview-syntax FALHOU', ok: false, fix: 'term:' + cmd,
      detail: 'o gate real (CSP/concat-only) falhou — NUNCA dispensar; corrigir o webview',
    };
  }
  return { k: 'testsgate', t: 'Gate de testes (webview-syntax)', ok: true, fix: '', detail: 'webview-syntax verde no último run' };
}

// ── Pure orchestrator: run all 6 checks over a pre-gathered input bag ───────
// Inputs are injected (the gatherer below produces them in prod; tests feed fixtures).
// Each entry of `inputs` is keyed by check: { locks, sources, vsix, classify, hygiene, tests }.
function runChecks(inputs, opts) {
  const i = inputs || {};
  return [
    checkGitLocks(i.locks),
    checkTruncatedSources(i.sources, opts),
    checkVsixDrift(i.vsix),
    checkClassifySha(i.classify),
    checkWorktreeHygiene(i.hygiene),
    checkTestsGate(i.tests),
  ];
}

// ── Async gatherer (prod) — collects the facts the pure checks consume ─────
// `deps`: { exec(cmd,args,timeout,cwd)→Promise<{ok,out}>, fs, path }. `exec` mirrors
// host-extra.execTool (never throws, resolves {ok,out}). `cwd` = the repo root to inspect.
// `extRoot` = the vscode-extension package dir (for vsix + package.json). Returns the
// `inputs` bag for runChecks. Every field degrades to null on failure → check shows warn.
async function gatherDoctorInputs(cwd, deps) {
  deps = deps || {};
  const fs = deps.fs || fsDefault;
  const path = deps.path || pathDefault;
  const exec = deps.exec || (() => Promise.resolve({ ok: false, out: '' }));
  const extRoot = deps.extRoot || cwd;
  const out = { locks: null, sources: null, vsix: null, classify: null, hygiene: null, tests: null };
  if (!cwd) return out;

  // 1) locks
  try {
    const gitDir = path.join(cwd, '.git');
    const cand = [
      { name: 'index.lock', path: path.join(gitDir, 'index.lock') },
      { name: 'HEAD.lock', path: path.join(gitDir, 'HEAD.lock') },
    ];
    out.locks = { locks: cand.filter((c) => { try { return fs.existsSync(c.path); } catch { return false; } }) };
  } catch { out.locks = null; }

  // 2) truncated sources — compare a small set of "files of interest" (the cockpit's own
  // source) working-tree size vs committed blob size. List is injectable for tests.
  try {
    const interest = (deps.sourceFiles && deps.sourceFiles.length)
      ? deps.sourceFiles
      : ['packages/vscode-extension/src/extension.js', 'packages/vscode-extension/src/host-extra.js'];
    const files = [];
    for (const rel of interest) {
      let wtSize = null, blobSize = null;
      try { wtSize = fs.statSync(path.join(cwd, rel)).size; } catch { /* missing on disk */ }
      const r = await exec('git', ['-C', cwd, 'cat-file', '-s', 'HEAD:' + rel], 4000, cwd);
      if (r && r.ok) { const n = parseInt(String(r.out).trim(), 10); if (!isNaN(n)) blobSize = n; }
      if (wtSize != null && blobSize != null) files.push({ path: rel, wtSize, blobSize });
    }
    out.sources = { files };
  } catch { out.sources = null; }

  // 3) vsix drift
  try {
    let pkgVersion = null;
    try { pkgVersion = JSON.parse(fs.readFileSync(path.join(extRoot, 'package.json'), 'utf8')).version || null; } catch { /* none */ }
    let installedVsix = [];
    try {
      installedVsix = fs.readdirSync(extRoot)
        .filter((f) => /\.vsix$/i.test(f))
        .map((f) => { const m = f.match(/(\d+\.\d+\.\d+)/); return m ? m[1] : null; })
        .filter(Boolean);
    } catch { /* none */ }
    out.vsix = { pkgVersion, installedVsix };
  } catch { out.vsix = null; }

  // 4) classify.js sha
  try {
    const p = path.join(cwd, 'tools', 'router', 'classify.js');
    let liveSha = null;
    try { liveSha = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { /* absent */ }
    out.classify = { liveSha };
  } catch { out.classify = null; }

  // 5) worktree + merged-branch hygiene
  try {
    const wtR = await exec('git', ['-C', cwd, 'worktree', 'list', '--porcelain'], 4000, cwd);
    let prunableWorktrees = [];
    if (wtR && wtR.ok) {
      const blocks = String(wtR.out).split(/\n\n+/);
      for (const b of blocks) {
        if (/\bprunable\b/.test(b)) {
          const m = b.match(/^worktree\s+(.+)$/m);
          if (m) prunableWorktrees.push(m[1].trim());
        }
      }
    }
    let mergedBranches = [];
    const base = deps.mainBranch || 'main';
    const brR = await exec('git', ['-C', cwd, 'branch', '--merged', base], 4000, cwd);
    if (brR && brR.ok) {
      mergedBranches = String(brR.out).split('\n')
        .map((l) => l.replace(/^[*+]?\s*/, '').trim())
        .filter((b) => b && b !== base && b !== 'master' && !b.startsWith('('));
    }
    out.hygiene = { prunableWorktrees, mergedBranches };
  } catch { out.hygiene = null; }

  // 6) tests gate — we DO NOT shell out here by default (running the suite on every
  // refresh would be heavy). The host passes a pre-captured testOutput when available;
  // otherwise the check reports "not run yet" and offers the command. Injectable.
  out.tests = { testOutput: (typeof deps.testOutput === 'string') ? deps.testOutput : null };

  return out;
}

module.exports = {
  FROZEN_CLASSIFY_SHA,
  checkGitLocks,
  checkTruncatedSources,
  checkVsixDrift,
  checkClassifySha,
  checkWorktreeHygiene,
  checkTestsGate,
  cmpSemver,
  runChecks,
  gatherDoctorInputs,
};
