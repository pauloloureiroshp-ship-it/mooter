// cockpit-loop.js — Mooter Autopilot Loop: cockpit integration (drop-in module).
//
// A new "🛸 Autopilot" tab for the Mooter cockpit (packages/vscode-extension).
// It turns the file-bus loop (_handoff/loop/) into a one-click, human-gated,
// transparent autonomous wave loop — the feature an LLM-safety company is proud of:
//   • One-click START (no typing): runInTerminal launches the headless loop-runner.
//   • CALIBRATED autonomy: the loop runs itself round-to-round, BUT pauses and
//     escalates to the human on irreversible actions (merge/push/deploy/secrets).
//   • TRANSPARENT: live ledger (every round, ok/cost), the current INBOX/OUTBOX,
//     and the exact reason it paused.
//   • HUMAN IN CONTROL: Approve / Stop buttons; STOP kill switch; never merges.
//   • LOCAL-FIRST: evaluator can run on Ollama ($0); cloud only when it earns it.
//
// This module matches the existing extension patterns (CommonJS, runInTerminal,
// execNode-free pure fs reads, postMessage webview commands).
//
// ============================ INTEGRATION (extension.js) ============================
// 1) const loop = require('./cockpit-loop');
// 2) Register a command in activate():
//      ctx.subscriptions.push(vscode.commands.registerCommand(
//        'mooter.startAutopilotWave', () => loop.startLoop(runInTerminal)));
//    and add to package.json contributes.commands:
//      { "command": "mooter.startAutopilotWave", "title": "Start Autopilot Wave", "category": "Mooter" }
// 3) In DataService.refresh(), add to the snapshot:  loop: loop.readLoopState(repoRoot())
// 4) In getHtml() tabs array, add:
//      { id:'loop', label:'🛸 Autopilot', view: loop.renderLoopTab(s.loop) }
// 5) In CockpitProvider.onDidReceiveMessage, add the cases from loop.messageCases()
//    (or inline): loopStart / loopStop / loopApprove / loopReject.
// ===================================================================================

const fs = require('fs');
const path = require('path');

// W3: cost aggregation from the shared helper (cost-reader.js lives in the loop bus).
let _costReader = null;
function _getCostReader() {
  if (_costReader) return _costReader;
  try {
    _costReader = require(path.join(__dirname, '..', 'loop', 'cost-reader.js'));
  } catch {
    _costReader = { readWaveCost: () => null, fmtCost: () => '—' };
  }
  return _costReader;
}

// The loop bus lives at <repo>/_handoff/loop/. repoRoot() should be the workspace
// folder; fall back to the first workspace folder.
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
  // W3: aggregate per-wave cost from ledger.jsonl (pure disk, cross-restart safe).
  const wave = state.wave || null;
  const cr = _getCostReader();
  const waveCost = wave ? cr.readWaveCost(d, wave) : null; // null → "—" in display

  return {
    present: true,
    status: stop ? 'stopped' : state.status,
    round: state.round || 0,
    maxRounds: state.maxRounds || null,
    wave,
    branch: state.branch || null,
    updatedAt: state.updated || state.updated_at || null,
    askHuman: ask || null,                 // the question the loop paused on (irreversible action)
    waveCost,                              // W3: number|null; null means "—" (no cost data in bus)
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

// ---- webview message cases (paste into onDidReceiveMessage) ------------------------
// if (m.cmd === 'loopStart')   { loop.startLoop(runInTerminal, repoRoot()); }
// if (m.cmd === 'loopStop')    { loop.stopLoop(repoRoot()); this.data.refresh(true); }
// if (m.cmd === 'loopApprove') { loop.approveHuman(repoRoot()); this.data.refresh(true); }
// if (m.cmd === 'loopReject')  { loop.rejectHuman(repoRoot()); this.data.refresh(true); }

// ---- render (HTML fragment, matches cockpit CSS vars: --g --r --ink --surface) -----
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
      + '<button class="btn" onclick="post({cmd:\'loopStart\'})">▶ Start Autopilot Wave</button></div>';
  }
  const human = loop.status === 'awaiting_human' && loop.askHuman
    ? '<div class="askbox"><div class="askh">⚠️ Acção irreversível — precisa de ti</div>'
      + '<pre class="ask">' + esc(loop.askHuman) + '</pre>'
      + '<button class="btn ok" onclick="post({cmd:\'loopApprove\'})">✓ Aprovar &amp; continuar</button> '
      + '<button class="btn no" onclick="post({cmd:\'loopReject\'})">✕ Parar</button></div>'
    : '';
  // W3: per-wave cost display (real numbers from bus; "—" when no cost field in ledger).
  const cr = _getCostReader();
  const costLabel = cr.fmtCost(loop.waveCost != null ? loop.waveCost : null);
  const ledger = (loop.ledger || []).map((r) => {
    const rCost = (r.cost != null && Number.isFinite(Number(r.cost)))
      ? '<span class="rcost">' + cr.fmtCost(Number(r.cost)) + '</span>' : '';
    return '<div class="lrow"><span class="r">#' + esc(r.round) + '</span>'
      + '<span class="' + (r.ok ? 'ok' : 'no') + '">' + (r.ok ? '✓' : '✕') + '</span>'
      + rCost
      + '<span class="ts">' + esc((r.ts || '').replace('T', ' ').slice(0, 19)) + '</span></div>';
  }).join('');
  const controls = (loop.status === 'done' || loop.status === 'stopped')
    ? '<button class="btn" onclick="post({cmd:\'loopStart\'})">▶ Start new wave</button>'
    : '<button class="btn no" onclick="post({cmd:\'loopStop\'})">■ Stop</button>';
  return ''
    + '<div class="loopwrap">'
    + '<div class="loophdr">' + statusPill(loop.status)
    + '<span class="round">round ' + esc(loop.round) + (loop.maxRounds ? '/' + esc(loop.maxRounds) : '') + '</span>'
    + '<span class="wave muted">' + esc(loop.wave || '') + (loop.branch ? ' · ' + esc(loop.branch) : '') + '</span>'
    + '<span class="cost muted">custo: ' + esc(costLabel) + '</span>'
    + '</div>'
    + human
    + '<div class="ledger"><div class="lh">Ledger (transparente, por ronda)</div>' + (ledger || '<div class="muted">sem rondas ainda</div>') + '</div>'
    + '<details class="out"><summary>Última resposta do CC</summary><pre>' + esc(loop.lastOut || '(vazio)') + '</pre></details>'
    + '<div class="ctl">' + controls + '</div>'
    + '<p class="muted tiny">Gates: nunca faz merge/push/deploy/secrets sozinho — escala-te. STOP a qualquer momento. Local-first.</p>'
    + '</div>'
    + LOOP_CSS;
}

const LOOP_CSS = '<style>'
  + '.loopwrap{padding:8px 10px;font-size:12px}'
  + '.loophdr{display:flex;align-items:center;gap:8px;margin-bottom:8px}'
  + '.pill{color:#0B0A09;border-radius:10px;padding:1px 8px;font-weight:700;font-size:11px}'
  + '.round{font-weight:600}.muted{opacity:.65}.tiny{font-size:10px}'
  + '.askbox{border:1px solid var(--r,#E8888A);border-radius:8px;padding:8px;margin:8px 0;background:rgba(232,136,138,.08)}'
  + '.askh{font-weight:700;margin-bottom:4px}.ask{white-space:pre-wrap;font-size:11px;max-height:160px;overflow:auto}'
  + '.btn{border:0;border-radius:6px;padding:4px 10px;cursor:pointer;background:var(--t2,#7aa2f7);color:#0B0A09;font-weight:600}'
  + '.btn.ok{background:var(--g,#4CAF6A)}.btn.no{background:var(--r,#E8888A)}'
  + '.ledger{margin:8px 0}.lh{font-weight:600;margin-bottom:4px}.lrow{display:flex;gap:8px;align-items:center;padding:1px 0}'
  + '.lrow .r{width:34px}.lrow .ok{color:var(--g,#4CAF6A)}.lrow .no{color:var(--r,#E8888A)}.lrow .ts{opacity:.6}'
  + '.lrow .rcost{opacity:.55;font-size:10px;min-width:44px}'
  + '.loophdr .cost{font-size:11px}'
  + '.out pre{white-space:pre-wrap;font-size:11px;max-height:200px;overflow:auto}.ctl{margin-top:8px}'
  + '</style>';

module.exports = {
  readLoopState, startLoop, stopLoop, approveHuman, rejectHuman, renderLoopTab,
};
