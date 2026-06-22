// cockpit-loop.js — Mooter Autopilot Loop: cockpit integration (drop-in module).
//
// A "🛸 Autopilot" tab for the Mooter cockpit (packages/vscode-extension).
// It turns the file-bus loop (_handoff/loop/) into a one-click, human-gated,
// transparent autonomous wave loop — the feature an LLM-safety company is proud of:
//   • One-click START (no typing): runInTerminal launches the headless loop-runner.
//   • CALIBRATED autonomy: the loop runs itself round-to-round, BUT pauses and
//     escalates to the human on irreversible actions (merge/push/deploy/secrets).
//   • TRANSPARENT: live ledger (every round, ok/cost), the current OUTBOX, and the
//     exact reason it paused.
//   • HUMAN IN CONTROL: Approve / Stop buttons; STOP kill switch; never merges.
//   • LOCAL-FIRST: evaluator can run on Ollama ($0); cloud only when it earns it.
//
// This module is pure (fs + path only — no `vscode`), so it is unit-testable headless.
//
// ===================== INTEGRATION (extension.js) — REAL wiring =====================
// The cockpit renders each view CLIENT-SIDE from a snapshot posted to the webview, and
// the webview CSP is `script-src 'nonce-…'` (no inline onclick). So we render host-side
// and inject the HTML, exactly like `statuslineHtml`. The 6 points:
//   1) const loop = require('./cockpit-loop');
//   2) activate(): register the command + add it to package.json contributes.commands:
//        vscode.commands.registerCommand('mooter.startAutopilotWave',
//          () => loop.startLoop(runInTerminal, repoRoot()));
//        package.json: { "command": "mooter.startAutopilotWave",
//                        "title": "Start Autopilot Wave", "category": "Mooter" }
//   3) DataService.refresh(): snapshot.loop = loop.readLoopState(repoRoot())
//        (pure fs — NO spawn; safe every poll, respects the overlap guard).
//   4) project(s): loopHtml = loop.renderLoopTab(s.loop); add a STATIC tab to getHtml()
//        (<div class="tab" data-v="loop">🛸 Autopilot</div> + <div id="v-loop">…),
//        then in the webview snapshot handler: $('#v-loop').innerHTML = s.loopHtml;
//        wireLoop($('#v-loop'));
//   5) onDidReceiveMessage: loopStart / loopStop / loopApprove / loopReject (below).
//   6) repoRoot() = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath.
//
// Buttons are CSP-safe: they carry `data-loop="loopStart|loopStop|loopApprove|loopReject"`
// (NOT inline onclick). The webview wires a delegated listener:
//   function wireLoop(root){ root.querySelectorAll('[data-loop]')
//     .forEach(b=>{ b.onclick=()=>send(b.dataset.loop); }); }
// ===================================================================================

const fs = require('fs');
const path = require('path');

// The loop bus lives at <repo>/_handoff/loop/. repoRoot() should be the workspace folder.
function loopDir(repoRoot) { return path.join(repoRoot, '_handoff', 'loop'); }
const J = (d, f) => path.join(d, f);

function readJsonSafe(p, dflt) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return dflt; } }
function readTextSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function tailLines(p, n) {
  const t = readTextSafe(p); if (!t) return [];
  return t.trim().split(/\r?\n/).slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// ---- state reader (pure fs; safe to call on every cockpit refresh) ----------------
function readLoopState(repoRoot) {
  const d = loopDir(repoRoot);
  if (!fs.existsSync(d)) return { present: false };
  const state = readJsonSafe(J(d, 'STATE.json'), { status: 'idle', round: 0 });
  const ask = readTextSafe(J(d, 'ASK_HUMAN.md')).trim();   // present only when status=awaiting_human
  const stop = fs.existsSync(J(d, 'STOP'));
  return {
    present: true,
    status: stop ? 'stopped' : state.status,
    round: state.round || 0,
    maxRounds: state.maxRounds || null,
    wave: state.wave || null,
    branch: state.branch || null,
    updatedAt: state.updated_at || null,
    askHuman: ask || null,                 // the question the loop paused on (irreversible action)
    ledger: tailLines(J(d, 'ledger.jsonl'), 12),
    lastOut: readTextSafe(J(d, 'OUTBOX.md')).slice(-1200),
  };
}

// ---- actions (webview -> host) ----------------------------------------------------
// startLoop: ONE click, NO typing — launches the headless runner in the terminal.
function startLoop(runInTerminal, repoRoot) {
  const runner = J(loopDir(repoRoot), 'loop-runner.mjs');
  runInTerminal('node "' + runner + '"', 'mooter-autopilot');
}
function stopLoop(repoRoot) { try { fs.writeFileSync(J(loopDir(repoRoot), 'STOP'), ''); } catch {} }
// Human gate: approve the escalated irreversible action (loop resumes), or reject (stops).
function approveHuman(repoRoot) {
  try { fs.writeFileSync(J(loopDir(repoRoot), 'HUMAN_OK'), new Date().toISOString()); } catch {}
}
function rejectHuman(repoRoot) { stopLoop(repoRoot); }

// ---- render (HTML fragment; uses the cockpit CSS vars: --g --r --t0..--t3 --ink) ---
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function statusPill(st) {
  const map = {
    cc_running: ['CC working', 'var(--t2,#7aa2f7)'],
    awaiting_eval: ['Cowork evaluating', 'var(--t1,#9ece6a)'],
    awaiting_human: ['Needs you', 'var(--r,#E8888A)'],
    done: ['Done', 'var(--g,#4CAF6A)'],
    stopped: ['Stopped', 'var(--r,#E8888A)'],
    idle: ['Idle', 'var(--t0,#888)'],
  };
  const [label, color] = map[st] || [st || 'idle', 'var(--t0,#888)'];
  return '<span class="pill" style="background:' + color + '">' + esc(label) + '</span>';
}

function renderLoopTab(loop) {
  if (!loop || !loop.present) {
    return '<div class="loopwrap"><p class="muted">Autopilot Loop não inicializado. '
      + 'Cria <code>_handoff/loop/</code> (ver _handoff/autopilot-loop/AUTOPILOT_LOOP.md) e clica em Start.</p>'
      + '<button class="btn" data-loop="loopStart">▶ Start Autopilot Wave</button></div>'
      + LOOP_CSS;
  }
  const human = loop.status === 'awaiting_human' && loop.askHuman
    ? '<div class="askbox"><div class="askh">⚠️ Acção irreversível — precisa de ti</div>'
      + '<pre class="ask">' + esc(loop.askHuman) + '</pre>'
      + '<button class="btn ok" data-loop="loopApprove">✓ Aprovar &amp; continuar</button> '
      + '<button class="btn no" data-loop="loopReject">✕ Parar</button></div>'
    : '';
  const ledger = (loop.ledger || []).map((r) =>
    '<div class="lrow"><span class="r">#' + esc(r.round) + '</span>'
    + '<span class="' + (r.ok ? 'ok' : 'no') + '">' + (r.ok ? '✓' : '✕') + '</span>'
    + '<span class="ts">' + esc((r.ts || '').replace('T', ' ').slice(0, 19)) + '</span></div>').join('');
  const controls = (loop.status === 'done' || loop.status === 'stopped')
    ? '<button class="btn" data-loop="loopStart">▶ Start new wave</button>'
    : '<button class="btn no" data-loop="loopStop">■ Stop</button>';
  return ''
    + '<div class="loopwrap">'
    + '<div class="loophdr">' + statusPill(loop.status)
    + '<span class="round">round ' + esc(loop.round) + (loop.maxRounds ? '/' + esc(loop.maxRounds) : '') + '</span>'
    + '<span class="wave muted">' + esc(loop.wave || '') + (loop.branch ? ' · ' + esc(loop.branch) : '') + '</span>'
    + '</div>'
    + human
    + '<div class="ledger"><div class="lh">Ledger (transparente, por ronda)</div>' + (ledger || '<div class="muted">sem rondas ainda</div>') + '</div>'
    + '<details class="out"><summary>Última resposta do CC</summary><pre>' + esc(loop.lastOut || '(vazio)') + '</pre></details>'
    + '<div class="ctl">' + controls + '</div>'
    + '<p class="muted tiny">Gates: nunca faz merge/push/deploy/secrets sozinho — escala-te. STOP a qualquer momento. Local-first.</p>'
    + '</div>'
    + LOOP_CSS;
}

// Scoped under .loopwrap so nothing leaks into the rest of the cockpit (which also
// uses `.pill`, `.muted`, etc.). The .empty/non-present state shares the same scope.
const LOOP_CSS = '<style>'
  + '.loopwrap{padding:8px 10px;font-size:12px}'
  + '.loopwrap .loophdr{display:flex;align-items:center;gap:8px;margin-bottom:8px}'
  + '.loopwrap .pill{color:#0B0A09;border-radius:10px;padding:1px 8px;font-weight:700;font-size:11px}'
  + '.loopwrap .round{font-weight:600}.loopwrap .muted{opacity:.65}.loopwrap .tiny{font-size:10px}'
  + '.loopwrap .askbox{border:1px solid var(--r,#E8888A);border-radius:8px;padding:8px;margin:8px 0;background:rgba(232,136,138,.08)}'
  + '.loopwrap .askh{font-weight:700;margin-bottom:4px}.loopwrap .ask{white-space:pre-wrap;font-size:11px;max-height:160px;overflow:auto}'
  + '.loopwrap .btn{border:0;border-radius:6px;padding:4px 10px;cursor:pointer;background:var(--t2,#7aa2f7);color:#0B0A09;font-weight:600}'
  + '.loopwrap .btn.ok{background:var(--g,#4CAF6A)}.loopwrap .btn.no{background:var(--r,#E8888A)}'
  + '.loopwrap .ledger{margin:8px 0}.loopwrap .lh{font-weight:600;margin-bottom:4px}.loopwrap .lrow{display:flex;gap:8px;align-items:center;padding:1px 0}'
  + '.loopwrap .lrow .r{width:34px}.loopwrap .lrow .ok{color:var(--g,#4CAF6A)}.loopwrap .lrow .no{color:var(--r,#E8888A)}.loopwrap .lrow .ts{opacity:.6}'
  + '.loopwrap .out pre{white-space:pre-wrap;font-size:11px;max-height:200px;overflow:auto}.loopwrap .ctl{margin-top:8px}'
  + '</style>';

module.exports = {
  readLoopState, startLoop, stopLoop, approveHuman, rejectHuman, renderLoopTab,
};
