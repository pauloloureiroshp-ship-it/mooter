'use strict';
/**
 * live-edit-task.js — LP-4.5 §1 · host-side ANCHORED TASK bridge for Live Edit.
 *
 * The default brain of the one-box UX: any pinned prompt ("valida estes números com o projecto",
 * "põe números reais") spawns live-edit-task-runner.mjs headless (the proven sdk-runner pattern —
 * subscription credentials, NO API key in the extension). Unlike the LP-4 rewrite bridge, the
 * agent runs WITH the workspace as cwd so it can READ the repo and EDIT the right place — which
 * is exactly why this whole path is HARD-GATED on Workspace Trust: runAnchoredTask refuses unless
 * opts.trusted === true (vscode.workspace.isTrusted, passed by the host). No trust, no spawn.
 *
 * Permissions are enforced runner-side via canUseTool (ALLOW Read/Grep/Glob/LS/Edit/MultiEdit
 * inside the workspace · DENY everything else — Bash and network NEVER run). Every agent edit is
 * snapshotted (before-bytes) so the panel can show a real per-file diff and offer a sha-guarded
 * per-file revert that never clobbers bytes someone else wrote since.
 *
 * SDK discovery is shared with the rewrite bridge (live-edit-cloud.bridgeStatus): the SDK is
 * resolved from the WORKSPACE, never bundled (zero new deps). Bridge absent → honest reason.
 *
 * Streaming: the runner emits JSONL progress events ({ev:'tool'|'deny', …}) while it works;
 * opts.onProgress receives each one so the panel can say "a ler X / a editar Y" live. The final
 * verdict is the one line carrying a boolean `ok`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const LEC = require('./live-edit-cloud.js');
const LECTX = require('./live-edit-context.js'); // Context Engine (Wave 2.2): $0-local repo-map + import slice

// Model per chip. AUTO routes to Sonnet — the quality/tool-use default the vision names for
// project tasks. @fable is MANUAL ONLY (tier ladder doctrine: never auto-routed; there is no T4).
const AGENT_MODEL = {
  auto: 'claude-sonnet-4-6',
  t1: 'claude-haiku-4-5',
  t2: 'claude-sonnet-4-6',
  t3: 'claude-opus-4-6',
  fable: 'claude-fable-5',
};

// An agent task reads files and iterates — 180s (the brief's budget), not the rewrite's 120s.
const DEFAULT_TASK_TIMEOUT_MS = 180000;

function taskRunnerPath() { return path.join(__dirname, 'live-edit-task-runner.mjs'); }

function sha256File(file) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
  catch { return null; }
}

/**
 * runAnchoredTask({ instruction, file, line, col, tag, nodeSource, breadcrumb, mode }, opts) →
 * Promise<{ok:true, kind:'answer'|'edits', text, filesRead, edits:[{file, abs, snapshot,
 * shaAfter}], denied, model} | {ok:false, reason, detail?}>.
 *
 * opts: trusted (MUST be exactly true — the agent reads the repo and edits files; anything else
 * refuses 'workspace-untrusted'), wsRoot, timeoutMs, onProgress(ev), runner (test injection),
 * bridge (pre-computed bridgeStatus). Fail-soft: never throws, never leaves a zombie runner.
 * Each edit's shaAfter (the file hash at verdict time) is stamped host-side — it is the revert
 * guard: revert only writes the snapshot back while the file still hashes to shaAfter.
 */
function runAnchoredTask(input, opts) {
  const o = opts || {};
  return new Promise((resolvePromise) => {
    // HARD trust gate — stricter than the rewrite bridge's (which tolerates undefined for pure
    // unit harnesses): this agent gets the whole repo as cwd, so only an explicit true passes.
    if (o.trusted !== true) { resolvePromise({ ok: false, reason: 'workspace-untrusted' }); return; }
    const wsRoot = (typeof o.wsRoot === 'string' && o.wsRoot) ? o.wsRoot : null;
    if (!wsRoot) { resolvePromise({ ok: false, reason: 'bad-request', detail: 'wsRoot required' }); return; }
    const instruction = (input && typeof input.instruction === 'string') ? input.instruction.trim() : '';
    if (!instruction) { resolvePromise({ ok: false, reason: 'bad-request' }); return; }
    const mode = (input && typeof input.mode === 'string' && input.mode) ? input.mode : 'auto';
    const model = AGENT_MODEL[mode];
    if (!model) { resolvePromise({ ok: false, reason: 'bad-request', detail: 'unknown mode ' + mode }); return; }
    const status = o.bridge || LEC.bridgeStatus(wsRoot, { trusted: o.trusted });
    if (!status || !status.available) { resolvePromise({ ok: false, reason: (status && status.reason) || 'sdk-bridge-missing' }); return; }
    let cp;
    try {
      const env = Object.assign({}, process.env, {
        ELECTRON_RUN_AS_NODE: '1',
        LE_SDK_DIR: status.dir,
        LE_WS_ROOT: wsRoot,
      });
      cp = require('child_process').spawn(process.execPath, [o.runner || taskRunnerPath()], {
        cwd: os.tmpdir(), windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      resolvePromise({ ok: false, reason: 'task-bridge-error', detail: String((e && e.message) || e).slice(0, 200) });
      return;
    }
    let done = false;
    // Same tree-kill discipline as the rewrite bridge: cp.kill() only signals the direct child;
    // an SDK grandchild would survive on Windows. Best-effort, never fatal.
    const killTree = () => {
      try { cp.kill(); } catch { /* noop */ }
      if (cp && cp.pid && process.platform === 'win32') {
        try { require('child_process').spawn('taskkill', ['/pid', String(cp.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* best-effort */ }
      }
    };
    const finish = (r) => {
      if (done) return;
      done = true;
      killTree();
      // review L3 — the revert baseline (edit.shaAfter) is stamped RUNNER-side at EDIT time (the
      // PostToolUse hook), i.e. the file hash the instant the agent's own write landed. We must
      // NEVER re-stamp it here at VERDICT time: over a long (maxTurns:40) session a concurrent
      // write during the agent's post-edit continuation window (HMR / editor autosave / another
      // task) would be silently adopted as the baseline and then destroyed by a "successful"
      // revert — the exact clobber this product exists to prevent. If the runner did not supply a
      // shaAfter (e.g. the hook was unavailable), leave it unset: revertEdit then fails CLOSED
      // ('revert-unavailable') rather than guessing a baseline that could be someone else's bytes.
      if (r && r.ok && Array.isArray(r.edits)) {
        for (const e of r.edits) {
          if (e && (typeof e.shaAfter !== 'string' || !e.shaAfter)) e.shaAfter = null;
        }
      }
      resolvePromise(r);
    };
    // LP-4.9 §8 — external cancel (additive; unchanged when no signal is passed). An aborted signal
    // kills the child tree and resolves 'task-cancelled', exactly like the timeout path.
    if (o.signal) {
      if (o.signal.aborted) { finish({ ok: false, reason: 'task-cancelled' }); return; }
      try { o.signal.addEventListener('abort', () => finish({ ok: false, reason: 'task-cancelled' }), { once: true }); } catch { /* no-op */ }
    }
    const timeoutMs = (Number.isFinite(o.timeoutMs) && o.timeoutMs > 0) ? o.timeoutMs : DEFAULT_TASK_TIMEOUT_MS;
    const timer = setTimeout(() => finish({ ok: false, reason: 'task-timeout' }), timeoutMs);
    let buf = '';
    const onLine = (line) => {
      const t = line.trim();
      if (!t) return;
      let j;
      try { j = JSON.parse(t); } catch { return; } // SDK/debug noise — not ours
      if (j && typeof j.ok === 'boolean') { clearTimeout(timer); finish(j); return; }
      if (j && typeof j.ev === 'string' && typeof o.onProgress === 'function') {
        try { o.onProgress(j); } catch { /* a broken listener must not kill the task */ }
      }
    };
    if (cp.stdout) cp.stdout.on('data', (b) => {
      buf += String(b);
      let i;
      while ((i = buf.indexOf('\n')) !== -1) { onLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
    });
    if (cp.stderr) cp.stderr.on('data', () => { /* SDK noise — the verdict travels on stdout */ });
    cp.on('error', (e) => { clearTimeout(timer); finish({ ok: false, reason: 'task-bridge-error', detail: String((e && e.message) || e).slice(0, 200) }); });
    cp.on('close', () => {
      clearTimeout(timer);
      if (buf) onLine(buf); // a verdict without a trailing newline still counts
      finish({ ok: false, reason: 'task-bridge-error', detail: 'no verdict from runner' });
    });
    // Context Engine (Wave 2.2) — compute the $0-local context pack (repo-map TOC + import slice for the
    // pinned file) BEFORE the agent runs, so it skips the 20-52s of blind Read/Grep exploration. Same
    // fence: the trust-gated agent already reads this workspace; this only front-loads what it would read.
    // Fail-soft + bounded (RULER): any error / no anchor → empty string → the agent falls back unchanged.
    let contextPack = '';
    try {
      const anchorFile = (input && typeof input.file === 'string') ? input.file : '';
      if (anchorFile && (!o.contextEngine || o.contextEngine.enabled !== false)) {
        const pack = LECTX.buildContextPack(wsRoot, anchorFile, (o.contextEngine && o.contextEngine.opts) || {});
        if (pack && typeof pack.text === 'string') contextPack = pack.text;
      }
    } catch { contextPack = ''; }
    try {
      cp.stdin.end(JSON.stringify({
        instruction,
        file: input.file, line: input.line, col: input.col, tag: input.tag,
        nodeSource: input.nodeSource, breadcrumb: input.breadcrumb,
        // LP-4.8 §4 — attach-as-reference: read-only context pointers, already sanitised host-side.
        refs: Array.isArray(input.refs) ? input.refs.slice(0, 8) : undefined,
        // LP-4.9 §1 — explicit intent: 'ask' = answer only (zero writes), else edit.
        intent: input.intent === 'ask' ? 'ask' : 'edit',
        // Wave 2.2 — pre-computed local context (workspace-relative, bounded). '' when disabled/empty.
        contextPack,
        model,
      }));
    } catch { /* the close handler still resolves */ }
  });
}

// ── diff + revert helpers (used by the host for the panel's per-file result) ──────────────────

// Real `git diff` per file, scoped to EXACTLY what this task changed: snapshot (before) vs the
// file now. --no-index works in any dir, ignores repo state, and never mixes in the user's own
// pre-existing uncommitted changes. Returns {ok:true, lines:[…]} (unified diff body, header
// stripped) or {ok:false, reason} — the caller falls back to a plain before/after readout.
function gitDiffFile(snapshotPath, filePath, opts) {
  try {
    const r = require('child_process').spawnSync(
      (opts && opts.gitBin) || 'git',
      ['diff', '--no-index', '--no-color', '--unified=3', '--', snapshotPath, filePath],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
    );
    if (r.error || typeof r.stdout !== 'string') return { ok: false, reason: 'git-unavailable' };
    // git diff --no-index exits 1 when the files differ — that IS the success case here.
    const lines = r.stdout.split(/\r?\n/)
      .filter((l) => !/^(diff --git|index |--- |\+\+\+ )/.test(l))
      .filter((l, i, arr) => !(l === '' && i === arr.length - 1));
    return { ok: true, lines };
  } catch { return { ok: false, reason: 'git-unavailable' }; }
}

// Sha-guarded per-file revert: write the snapshot's bytes back ONLY while the file still hashes
// to shaAfter (the stamp taken at verdict time). Anything else wrote it since → honest refusal,
// nothing written — a blind revert over someone else's bytes is the lie this product exists to
// avoid. (Deliberately NOT `git checkout --`: that would also wipe the user's own pre-existing
// uncommitted changes in the file; this puts back exactly — and only — what the agent changed.)
function revertEdit(edit) {
  try {
    if (!edit || !edit.abs || !edit.snapshot) return { ok: false, reason: 'bad-entry' };
    // review L3: a missing edit-time baseline means we cannot prove the file still holds ONLY the
    // agent's bytes — refuse rather than restore blindly (fail closed, never clobber).
    if (typeof edit.shaAfter !== 'string' || !edit.shaAfter) return { ok: false, reason: 'revert-unavailable' };
    const cur = sha256File(edit.abs);
    if (!cur) return { ok: false, reason: 'revert-stale' };
    if (cur !== edit.shaAfter) return { ok: false, reason: 'revert-stale' };
    const before = fs.readFileSync(edit.snapshot);
    fs.writeFileSync(edit.abs, before);
    return { ok: true };
  } catch { return { ok: false, reason: 'error' }; }
}

module.exports = {
  runAnchoredTask,
  taskRunnerPath,
  gitDiffFile,
  revertEdit,
  sha256File,
  AGENT_MODEL,
  DEFAULT_TASK_TIMEOUT_MS,
};
