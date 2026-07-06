'use strict';
/**
 * live-edit-cloud.js — LP-4 §2 · host-side SUBSCRIPTION escalation bridge for Live Edit.
 *
 * "Subir para Sonnet/Opus" spawns live-edit-sdk-runner.mjs headless (the proven
 * _handoff/loop/sdk-runner.mjs + overclock-fill.mjs pattern): NO API key in the extension —
 * the Agent SDK runs on the user's Claude plan. The runner is fed ONLY the selected subtree +
 * the prompt; the reply comes back through the SAME fence (spliceNodeRange + sha256 hash-guard)
 * as the local moo — a cloud model gets zero extra write power.
 *
 * @fable is MANUAL ONLY (tier ladder doctrine: never auto-routed; there is no T4) — it is only
 * reachable when the user explicitly clicks the @fable chip.
 *
 * The SDK itself is NOT a dependency of the extension (zero new deps this wave). It is resolved
 * from the WORKSPACE (where the loop runner already proved it installed); bridge absent →
 * { available:false, reason } and the panel disables the cloud tiers with the honest reason.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Tier → subscription model id (same era ids the loop runner's MODE_MODEL_MAP uses).
const TIER_MODEL = {
  t1: 'claude-haiku-4-5',
  t2: 'claude-sonnet-4-6',
  t3: 'claude-opus-4-6',
  fable: 'claude-fable-5', // manual-only: reached ONLY by an explicit @fable click in the chip
};

const DEFAULT_TIMEOUT_MS = 120000; // cloud round-trips are slower than the 30s local budget

function sdkDirCandidates(wsRoot) {
  const dirs = [];
  if (wsRoot && typeof wsRoot === 'string') {
    dirs.push(path.join(wsRoot, 'node_modules', '@anthropic-ai', 'claude-agent-sdk'));
    dirs.push(path.join(wsRoot, '_handoff', 'loop', 'node_modules', '@anthropic-ai', 'claude-agent-sdk'));
  }
  return dirs;
}

// Is the subscription bridge usable from this workspace? Honest: reports WHERE the SDK was found
// or the exact reason it was not. Never throws — the panel renders this verbatim.
function bridgeStatus(wsRoot) {
  try {
    for (const dir of sdkDirCandidates(wsRoot)) {
      try { if (fs.existsSync(path.join(dir, 'package.json'))) return { available: true, dir }; }
      catch { /* keep probing */ }
    }
    return { available: false, reason: 'sdk-bridge-missing' };
  } catch { return { available: false, reason: 'sdk-bridge-missing' }; }
}

function runnerPath() { return path.join(__dirname, 'live-edit-sdk-runner.mjs'); }

/**
 * rewriteElementCloud({ nodeSource, prompt, file, line, tier }, opts?) →
 * Promise<{ok:true, text} | {ok:false, reason, detail?}>. opts: wsRoot (bridge discovery),
 * timeoutMs, runner (test injection), bridge (pre-computed bridgeStatus). Fail-soft: never
 * throws, never leaves a zombie runner (kill on timeout).
 */
function rewriteElementCloud(input, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const status = o.bridge || bridgeStatus(o.wsRoot);
    if (!status || !status.available) { resolve({ ok: false, reason: (status && status.reason) || 'sdk-bridge-missing' }); return; }
    const tier = (input && typeof input.tier === 'string') ? input.tier : 't2';
    const model = TIER_MODEL[tier];
    if (!model) { resolve({ ok: false, reason: 'bad-request', detail: 'unknown tier ' + tier }); return; }
    let cp;
    try {
      // ELECTRON_RUN_AS_NODE=1 makes process.execPath behave as plain Node inside VS Code
      // (without it a new editor window would open) — same as the overclock runner.
      const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', LE_SDK_DIR: status.dir });
      cp = require('child_process').spawn(process.execPath, [o.runner || runnerPath()], {
        cwd: os.tmpdir(), windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      resolve({ ok: false, reason: 'cloud-bridge-error', detail: String((e && e.message) || e).slice(0, 200) });
      return;
    }
    let done = false;
    const finish = (r) => { if (done) return; done = true; try { cp.kill(); } catch { /* noop */ } resolve(r); };
    const timeoutMs = (Number.isFinite(o.timeoutMs) && o.timeoutMs > 0) ? o.timeoutMs : DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => finish({ ok: false, reason: 'cloud-model-timeout' }), timeoutMs);
    let outBuf = '';
    if (cp.stdout) cp.stdout.on('data', (b) => { outBuf += String(b); });
    if (cp.stderr) cp.stderr.on('data', () => { /* SDK noise — the verdict travels on stdout */ });
    cp.on('error', (e) => { clearTimeout(timer); finish({ ok: false, reason: 'cloud-bridge-error', detail: String((e && e.message) || e).slice(0, 200) }); });
    cp.on('close', () => {
      clearTimeout(timer);
      // The verdict is the LAST parseable JSON line — SDK/debug noise on stdout must not break us.
      const lines = outBuf.split(/\r?\n/).filter((l) => l.trim());
      for (let i = lines.length - 1; i >= 0; i--) {
        try { const j = JSON.parse(lines[i]); if (j && typeof j.ok === 'boolean') { finish(j); return; } }
        catch { /* not the verdict line */ }
      }
      finish({ ok: false, reason: 'cloud-bridge-error', detail: 'no verdict from runner' });
    });
    try {
      cp.stdin.end(JSON.stringify({
        nodeSource: input.nodeSource, prompt: input.prompt, file: input.file, line: input.line, model,
      }));
    } catch { /* the close handler still resolves */ }
  });
}

module.exports = {
  bridgeStatus,
  rewriteElementCloud,
  sdkDirCandidates,
  runnerPath,
  TIER_MODEL,
  DEFAULT_TIMEOUT_MS,
};
