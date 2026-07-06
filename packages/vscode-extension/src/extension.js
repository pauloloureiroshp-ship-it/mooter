// mooter-cockpit v0.9.0 — extension host
// v0.9.0 (2026-06-14, Windows-test feedback): mode-switch promoted to the Cockpit
//   (segment + clickable header badge); model-picker for the next prompt (clipboard
//   bridge → /pin command); 9 tabs consolidated to 5 (Cockpit/Setup/Herd/Decisions/Doctor).
// v0.8.0 (2026-06-14): publish-perfect + cross-platform —
//   · external links via env.openExternal (Windows/Linux safe, no macOS `open`)
//   · Claude Code CLI detection no longer assumes a Unix path
//   · keyboard-navigable tab strip (role=tab + arrow keys)
//   · manifest: extensionKind/capabilities/walkthrough/CHANGELOG; fixed .vscodeignore.
// 7 requisitos (2026-06-12): brand colors · terminal parity · setup wizard ·
// slash commands mgmt · model/subscription picker · rich metrics · marketplace-ready.
// v0.7.0 (2026-06-14): resource hygiene + honesty —
//   · visibility-aware polling (fast when panel visible, slow shallow when hidden)
//   · overlap guard (no piled-up CLI process batches)
//   · expanded Decisions survive the periodic re-render
//   · explicit "tracker offline · last known" so stale numbers never read as live.
// Doctrine: read-only over the runtime; zero routing logic here.
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const data_ = require('./data.js');
const extra = require('./host-extra.js');
// WCOCKPIT: cowork-waiting + mode-registry (aditivo; fallback seguro se ficheiros ausentes)
let COWORK = null, MR = null;
try { COWORK = require('./cowork-waiting'); } catch { COWORK = { badge: () => null, CSS: '' }; }
try { MR = require('./mode-registry'); } catch { MR = { byProject: (rows) => ({ Unassigned: rows }) }; }
// WCOCKPIT-3: row renderer module (serialised into webview via fn.toString())
let RR = null;
try { RR = require('./row-renderer'); } catch { RR = null; }
// ── GUARDIAN:F3 ── pre-baked handoff reader + F1 pressure ladder (defensive copy). Fail-soft:
// if the module is missing the jump handler falls back to a live handoff and never offers the
// button (shouldOfferJump returns false on unknown fill).
let GJ = null;
try { GJ = require('./guardian-jump'); } catch { GJ = null; }
// Frente E · Arquitectura Viva: renderArchTree(snapshot, mode) — serialised into the webview
// via fn.toString() (concat-only). Fail-soft: cockpit works without it (stub fallback).
let ARCH = null;
try { ARCH = require('./arch-tree'); } catch { ARCH = null; }
// Mission Control · Frente 0 (additive; safe fallback if files absent). The snapshot
// assembler + the local scoped Moo assistant. Both fail-soft — the cockpit works without them.
let MCSNAP = null, MCA = null;
try { MCSNAP = require('./mc-snapshot'); } catch { MCSNAP = null; }
try { MCA = require('./mc-assistant'); } catch { MCA = null; }
// ── GUARDIAN:F2 ── Moo pre-bakes the handoff in background ($0, idle GPU) for filling
// sessions, so the F3 jump is instant. Additive; fail-soft (cockpit works without it).
let GUARDIAN_PREBAKE = null;
try { GUARDIAN_PREBAKE = require('./guardian-prebake'); } catch { GUARDIAN_PREBAKE = null; }
const GUARDIAN_PREBAKE_DEBOUNCE_MS = 15000; // cap pre-bake ticks to ~1/15s — never on the render path
// ── MISSION CONTROL TAB · Frente G — the Mission Control view renderer (serialised into the
// webview via .toString(), same trick as row-renderer). Fail-soft: absent → tab shows n/d.
let MCV = null;
try { MCV = require('./mission-control-view'); } catch { MCV = null; }
// ── DELIVERY COCKPIT · Frente B (🛩️ Project command) — the wave-timeline view renderer
// (serialised into the webview via .toString()) + its host-side snapshot builder (reads the
// RUNTIME forecast.json, the roadmap, and the Ledger). Both fail-soft: absent → tab shows n/d.
let PCV = null, PCSNAP = null;
try { PCV = require('./project-command-view'); } catch { PCV = null; }
try { PCSNAP = require('./pc-snapshot'); } catch { PCSNAP = null; }
// ── GUARDIAN:F1 ── Compaction-pressure chip 🪶 (reads ctxPct → advisor.pressureLadder).
// Serialised into the webview via fn.toString() (see the sibling injection below). Fail-soft.
let GCHIP = null;
try { GCHIP = require('./guardian-chip'); } catch { GCHIP = null; }
// ── Cockpit Doctor & Self-Heal — 6 filesystem/git diagnostics (stale .git locks, truncated
// sources, vsix drift, classify.js frozen-sha, worktree/branch hygiene, false-green tests).
// Pure module: detection is automatic; the destructive cure is a `term:` button the human
// clicks. Additive; fail-soft (cockpit works without it — the slice is just absent).
let DOCTOR = null;
try { DOCTOR = require('./doctor-checks'); } catch { DOCTOR = null; }
// ── LIVE PREVIEW · MP1 (additive, read-only) — Director's Cut + Brain render module
// (serialised into its OWN webview panel via fn.toString(), same trick as row-renderer.js)
// + the file-bus producer's eventsPath() helper (MP0 foundation). Both fail-soft: absent →
// the command still registers but the panel shows nothing to render (no crash).
let LPV = null;
try { LPV = require('./live-preview-view.js'); } catch { LPV = null; }
let HC = null;
try { HC = require('./hook-collector.js'); } catch { HC = null; }
// ── LIVE PREVIEW · MP2 (App Stage) — the PURE dev-server detector + honest stage resolver +
// the origin-lock URL validator (loop hole #3). fs reads / TCP probes live host-side below;
// this module only decides. Fail-soft: absent → the panel still renders Director's Cut + Brain
// and the App Stage stays in its honest "a detetar…" state (no crash).
let LPS = null;
try { LPS = require('./lp-stage.js'); } catch { LPS = null; }
// ── LIVE PREVIEW · MP4 (Honest Diagnostics) — the PURE normaliser + ×N grouper + honest strip
// renderer + the tap-message ORIGIN LOCK (acceptTapOrigin) + the file-open resolver. The
// fs.existsSync (file resolve) and the clipboard write live host-side below; this module only
// decides. Fail-soft: absent → the strip stays hidden and the App Stage is unchanged (no crash).
let LPD = null;
try { LPD = require('./lp-diagnostics.js'); } catch { LPD = null; }
// ── LIVE EDIT · MP5.1 — the deterministic $0 edit engine (byte-splice via @babel/parser, ZERO LLM).
// Pure; the fs read/write lives host-side below. Fail-soft: absent (or @babel/parser missing) → the
// select panel still opens files (click-to-code), and lp-edit reports 'engine-unavailable' honestly.
let LEA = null;
try { LEA = require('./live-edit-ast.js'); } catch { LEA = null; }
// LP-3.2 — a MISSING parser (broken/old install: the vsix must ship @babel/parser) is not a file
// parse error; give it its own reason so the panel says "reinstall" instead of blaming the file.
function leaFailReason(res) {
  if (res && res.reason === 'parse-error' && res.detail === 'parser-unavailable') return 'parser-unavailable';
  return (res && res.reason) || 'refused';
}

function trackerPort() { return vscode.workspace.getConfiguration('mooter').get('trackerPort', 7821); }

// Cross-platform Claude Code detection: the installed extension is the strongest
// signal; otherwise probe the usual CLI locations on macOS/Linux/Windows.
function detectClaude() {
  if (vscode.extensions.getExtension('anthropic.claude-code')) return true;
  const home = require('os').homedir();
  const cands = [
    path.join(home, '.local', 'bin', 'claude'),
    path.join(home, '.local', 'bin', 'claude.exe'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'claude'),
    path.join(home, 'AppData', 'Local', 'Programs', 'claude', 'claude.exe'),
    path.join(home, 'scoop', 'shims', 'claude.cmd'),
    path.join(home, 'scoop', 'shims', 'claude'),
    'C:\\ProgramData\\chocolatey\\bin\\claude.exe',
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  return cands.some((p) => { try { return fs.existsSync(p); } catch { return false; } });
}

// WCOCKPIT-9 (Bloco F): is the autopilot loop-runner alive? Honest signal from its heartbeat
// (<workspace>/_handoff/loop/heartbeat.json, rewritten each round by sdk-runner.mjs). Fresh
// (<90s) → active. Best-effort, never throws. Degrades the per-session LoopMoo toggle to
// "armado (loop não activo)" when nothing is actually looping — never fakes an active loop.
function loopRunnerActive() {
  try {
    const wfs = vscode.workspace.workspaceFolders || [];
    for (const wf of wfs) {
      try {
        const hb = path.join(wf.uri.fsPath, '_handoff', 'loop', 'heartbeat.json');
        const j = JSON.parse(fs.readFileSync(hb, 'utf8'));
        if (j && j.ts && (Date.now() - Date.parse(j.ts)) < 90000) return true;
      } catch { /* try next folder */ }
    }
  } catch { /* no workspace */ }
  return false;
}

// Mission Control · Frente 0: honest loop STATE (round/maxRounds/model) from the loop-runner's
// own file (<workspace>/_handoff/loop/STATE.json). Cheap read, fail-soft → null (no fabrication).
function readLoopState() {
  try {
    const wfs = vscode.workspace.workspaceFolders || [];
    for (const wf of wfs) {
      try {
        const st = path.join(wf.uri.fsPath, '_handoff', 'loop', 'STATE.json');
        return JSON.parse(fs.readFileSync(st, 'utf8'));
      } catch { /* try next folder */ }
    }
  } catch { /* no workspace */ }
  return null;
}

// Mission Control · Frente 0: write an honest, reversible flag/request to ~/.mooter/cache/flags
// (file-bus). Pilot actions (pauseAll/subtree) write here; runners/views honor it. Best-effort.
function writeMcFlag(name, obj) {
  try {
    const dir = (MCSNAP && typeof MCSNAP.mooterCacheDir === 'function')
      ? path.join(MCSNAP.mooterCacheDir(), 'flags')
      : path.join(require('os').homedir(), '.mooter', 'cache', 'flags');
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
    const safe = String(name || 'flag').replace(/[^a-zA-Z0-9._-]/g, '');
    fs.writeFileSync(path.join(dir, safe + '.json'), JSON.stringify(obj || {}));
    return true;
  } catch { return false; }
}

class DataService {
  constructor() { this.listeners = new Set(); this.snapshot = {}; this.timer = null; this.watcher = null; this.tick = 0; this.busy = false; this.visible = true; this.selectedSession = 'auto'; }
  onUpdate(fn) { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; }
  async refresh(deep) {
    // Overlap guard: deep refreshes fan out up to 8 CLI execs (≤9s each). Without
    // this, a slow batch + the interval would stack process batches. Drop, don't queue.
    if (this.busy) return;
    this.busy = true;
    try {
    this.tick++;
    const p = trackerPort();
    // Resolve which session the cockpit reflects: 'all' → global; 'auto' → follow the
    // session of the most-recent prompt (.last-classified.json); else a pinned id.
    const activeSid = extra.activeSession();
    const sel = this.selectedSession;
    const effSid = sel === 'all' ? null : (sel === 'auto' ? (activeSid && activeSid.id) : sel);
    const jobs = [data_.httpJson(p, '/metrics'), data_.httpJson(p, '/last'), data_.httpJson(p, '/health'), data_.httpJson(p, '/me'), data_.httpJson(p, '/last-execution')];
    // Deep (CLI-spawning) work only when the panel is visible — never churn processes for a hidden view.
    // Deep work runs when visible; ALSO force it on the very first refresh (deep && tick 1)
    // so a panel that starts collapsed still gets a full first paint instead of 60s of zeros.
    const doDeep = ((deep || this.tick % 3 === 1) && this.visible) || (deep && this.tick === 1);
    if (doDeep) jobs.push(extra.ollamaModels(), extra.statuslineHtml(), extra.slashStatus(), extra.effortGet(), extra.whyNotFable(), extra.trailJson(), extra.securitySummary(), extra.feedbackSpans());
    // Per-session savings come from the SAME tracker pipeline (/metrics?session_id) so
    // they can never drift from the global figure — one source of truth (honesty).
    const sessMetricsP = effSid ? data_.httpJson(p, '/metrics?session_id=' + encodeURIComponent(effSid)) : Promise.resolve(null);
    // Async deep-only work (git/gh + transcript-cwd resolution). recentSessions is now
    // async (resolves each session's branch via git, deduped per cwd); prList shells out
    // to gh. Both null-safe with timeouts — gathered in parallel, never blocking the panel.
    const prev = this.snapshot;
    // recentSessions resolves each session's branch AND its repo-scoped PR (gh run in the
    // session's own cwd) — so PR/stage is attached per session, never matched cross-repo.
    const recentP = doDeep ? extra.recentSessions() : Promise.resolve(prev.recent);
    const [results, sessionMetrics, recent] = await Promise.all([Promise.all(jobs), sessMetricsP, recentP]);
    const [metrics, last, health, me, lastExec, ollama, sline, slash, effort, whynot, trail, security, spans] = results;
    this.snapshot = {
      at: Date.now(),
      runtimeInstalled: data_.runtimeInstalled(),
      trackerUp: !!(health && health.ok),
      metrics, last, me, lastExec,
      mode: extra.readMode(),
      sub: extra.readSubProfile(),
      device: extra.deviceProfile(),
      hw: extra.hwCapability(),
      quant: extra.quantSnapshot(),
      prefs: extra.preferences(),
      budget: extra.readBudget(),
      packs: extra.installedPacks(),
      pinNext: extra.readPinNext(),
      ollama: doDeep ? ollama : prev.ollama,
      statuslineHtml: doDeep ? sline : prev.statuslineHtml,
      slash: doDeep ? slash : prev.slash,
      effort: doDeep ? effort : prev.effort,
      whynot: doDeep ? whynot : prev.whynot,
      trail: doDeep ? trail : prev.trail,
      security: doDeep ? security : prev.security,
      spans: doDeep ? spans : prev.spans,
      herd: doDeep ? extra.herd() : prev.herd,
      ledger: doDeep ? extra.tokenLedger() : prev.ledger,
      recent,
      localTok: doDeep ? extra.localTokens() : prev.localTok,
      // session scope (cheap single-file aggregate → computed every refresh so
      // auto-follow is snappy when you send a prompt in another tab).
      activeSession: activeSid, selectedSession: this.selectedSession, effectiveSession: effSid,
      sessionMetrics,
      sessionLedger: effSid ? extra.tokenLedger(effSid, { sessionOnly: true }) : null,
      claudeCli: detectClaude(),
      loopActive: loopRunnerActive(), // WCOCKPIT-9 (Bloco F): honest LoopMoo liveness
      fleet: doDeep ? fleetSnapshot() : prev.fleet, // Deck Floor (Fase 2): read-only pillar aggregate
      decisions: data_.readDecisions(),
    };
    // Mission Control · Frente 0: assemble the single MissionControlSnapshot (additive). Cheap —
    // it REUSES the collectors already computed above (recent/herd/ledger/localTok) and only adds
    // pure mapping + small cache reads (gpu/remote/sync), so the render tick stays <50ms. Deep-gated
    // like the other heavy slices; reuses prev.mc on shallow ticks. Fail-soft → null (never blocks).
    try {
      if (MCSNAP && doDeep) {
        const mcCwd = (recent && recent[0] && recent[0].cwd)
          || (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri.fsPath)
          || process.cwd();
        this.snapshot.mc = await MCSNAP.buildSnapshot(mcCwd, {
          extra,
          recent: this.snapshot.recent,
          herd: this.snapshot.herd,
          ledger: this.snapshot.ledger,
          localTok: this.snapshot.localTok,
          loopActive: this.snapshot.loopActive,
          loopState: readLoopState(),
        });
      } else if (MCSNAP) {
        this.snapshot.mc = (prev && prev.mc) || null;
      }
    } catch { this.snapshot.mc = (prev && prev.mc) || null; }
    // DELIVERY COCKPIT · Frente B — assemble the ProjectCommandSnapshot (additive). Cheap: it
    // REUSES the sessions already mapped for the mc snapshot (branch@sha/git chips), only ADDS
    // three small reads (runtime forecast.json + roadmap MD + the Ledger dir). Deep-gated like
    // the other heavy slices; reuses prev.pc on shallow ticks. Fail-soft → null (never blocks).
    try {
      if (PCSNAP && doDeep) {
        const pcRoot = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri.fsPath)
          || (recent && recent[0] && recent[0].cwd)
          || process.cwd();
        const pcSessions = (this.snapshot.mc && Array.isArray(this.snapshot.mc.sessions)) ? this.snapshot.mc.sessions : [];
        // v2 · real git signals for squad HEALTH + WIP (worktree list + recent log). Two cheap
        // shell-outs, deep-tick only (same budget as the Doctor slice). Best-effort → [] (honest
        // dormant/n-d, never a fabricated dot). \x1f is the field separator git writes literally.
        let gitSignals = { worktrees: [], commits: [] };
        try {
          const wt = await extra.execTool('git', ['-C', pcRoot, 'worktree', 'list', '--porcelain'], 4000);
          const lg = await extra.execTool('git', ['-C', pcRoot, 'log', '--all', '--since=30.days', '--format=%H%x1f%ct%x1f%p%x1f%s', '--max-count=300'], 5000);
          const worktrees = (wt && wt.ok) ? PCSNAP.parseWorktrees(wt.out) : [];
          const commits = (lg && lg.ok) ? String(lg.out || '').split('\n').filter(Boolean).map((l) => { const a = l.split('\x1f'); return { sha: a[0], ts: parseInt(a[1], 10), isMerge: String(a[2] || '').trim().split(/\s+/).length >= 2, subject: a[3] }; }) : [];
          gitSignals = { worktrees, commits };
        } catch { /* git signals best-effort → dormant/n-d, honest */ }
        this.snapshot.pc = PCSNAP.buildProjectCommand({ repoRoot: pcRoot, sessions: pcSessions, gitSignals, now: Date.now() });
      } else if (PCSNAP) {
        this.snapshot.pc = (prev && prev.pc) || null;
      }
    } catch { this.snapshot.pc = (prev && prev.pc) || null; }
    // Cockpit Doctor & Self-Heal — gather the 6 diagnostic checks during the deep tick only
    // (git shell-outs are heavy). Reuse prev.doctor on shallow ticks. Fail-soft → [] (the
    // Doctor tab simply shows the original setup checks, never crashes). Scoped to the
    // active session's repo (recent[0].cwd), falling back to the workspace folder.
    try {
      if (DOCTOR && doDeep) {
        const docCwd = (recent && recent[0] && recent[0].cwd)
          || (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri.fsPath)
          || process.cwd();
        const inputs = await DOCTOR.gatherDoctorInputs(docCwd, {
          exec: extra.execTool, fs, path,
          extRoot: path.join(__dirname, '..'), // packages/vscode-extension (src/.. )
        });
        this.snapshot.doctor = DOCTOR.runChecks(inputs);
      } else {
        this.snapshot.doctor = (prev && prev.doctor) || [];
      }
    } catch { this.snapshot.doctor = (prev && prev.doctor) || []; }
    try {
      // WCOCKPIT polish: pull the founder back when a parallel session newly needs a reply.
      // Fires only on the false->true transition (per session), capped, never on first snapshot.
      const _rec = (this.snapshot && this.snapshot.recent) || [];
      if (this._lastNeeds) { let _n = 0; for (const _r of _rec) { if (_r && _r.needsYou && !this._lastNeeds.has(_r.fullId) && _n < 3) { _n++; const _nm = String(_r.coworkTitle || _r.brainTitle || _r.name || _r.id || 'A Claude Code session').slice(0, 60); vscode.window.showInformationMessage('\u{1F42E} ' + _nm + ' \u2014 your turn (Claude is waiting for your reply)'); } } }
      this._lastNeeds = new Set(_rec.filter((_r) => _r && _r.needsYou).map((_r) => _r.fullId));
    } catch { /* notifications are best-effort */ }
    for (const fn of this.listeners) { try { fn(this.snapshot); } catch { /* never */ } }
    // ── GUARDIAN:F2 ── pre-bake the handoff for filling sessions ($0, idle GPU), AFTER
    // the panel has already painted — debounced, fire-and-forget, never on the render path.
    try { this._guardianPrebakeTick(); } catch { /* best-effort, never blocks the refresh */ }
    } finally { this.busy = false; }
  }
  // ── GUARDIAN:F2 ── one debounced, fire-and-forget pre-bake pass over the current
  // sessions. Reuses the existing handoff generator (composeHandoff/generateHandoff) and
  // the F1 advisor; writes _handoff/guardian/<sid>.md atomically. Honest: $0 maintenance
  // work, never counted as "time recovered". All side effects live in guardian-prebake.js.
  _guardianPrebakeTick() {
    if (!GUARDIAN_PREBAKE || typeof GUARDIAN_PREBAKE.tickPrebake !== 'function') return;
    const now = Date.now();
    if (this._gpLast && (now - this._gpLast) < GUARDIAN_PREBAKE_DEBOUNCE_MS) return;
    this._gpLast = now;
    const recent = (this.snapshot && this.snapshot.recent) || [];
    if (!recent.length) return;
    const wsRoot = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri.fsPath)
      || path.resolve(__dirname, '..', '..', '..');
    const baseDir = path.join(wsRoot, '_handoff', 'guardian');
    Promise.resolve(GUARDIAN_PREBAKE.tickPrebake(recent, {
      generateHandoff: extra.generateHandoff,
      composeHandoff: extra.composeHandoff, // $0 local narrative (rolling summary / bounded Ollama)
      gitSnapshot: extra.gitSnapshot,
      vaultFreshness: extra.vaultFreshness,
      readJournalLast: extra.readJournalLast,
      extractPending: extra.extractPending,
      recent,
      baseDir,
    })).catch(() => { /* never throws into the refresh loop */ });
  }
  schedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(false), data_.pollIntervalMs(this.visible));
  }
  // Called by the webview provider on visibility change. Visible → fast cadence + an
  // immediate refresh; hidden → slow shallow polling (keeps the status bar warm cheaply).
  setVisible(v) {
    v = !!v;
    if (v === this.visible && this.timer) return;
    this.visible = v;
    this.schedule();
    if (v) this.refresh(true);
  }
  start() {
    this.refresh(true);
    this.schedule();
    try {
      this.watcher = fs.watch(path.dirname(data_.DECISIONS_LOG), { persistent: false }, (_e, f) => {
        if (f === 'decisions.log') this.refresh(false);
      });
    } catch { /* poll covers */ }
  }
  dispose() { if (this.timer) clearInterval(this.timer); if (this.watcher) this.watcher.close(); this.listeners.clear(); }
}

function makeStatusBar(ctx, data) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  item.name = 'Mooter';
  item.command = 'mooter.openCockpit';
  ctx.subscriptions.push(item);
  ctx.subscriptions.push(data.onUpdate((s) => {
    if (!vscode.workspace.getConfiguration('mooter').get('statusBar.enabled', true)) return item.hide();
    item.text = data_.statusBarText(s);
    const lastModel = (s.last && s.last.model_full) || '—';
    item.tooltip = new vscode.MarkdownString(
      `**mooter** · mode **${s.mode}**\n\nlast: ${lastModel}` +
      (s.metrics ? `\n\nsaved **$${(s.metrics.saved || 0).toFixed(2)}** · ${s.metrics.saved_pct || 0}% vs all-Opus` : '') +
      (s.runtimeInstalled && !s.trackerUp ? `\n\n⚠️ tracker offline — last known values` : '') +
      `\n\n_Click → Mooter Cockpit_`);
    item.show();
  }));
}

// Route a `mooter <args>` command through the resolved CLI via node — PATH-independent
// and Windows-safe (the `mooter` shim is often not on PATH). Falls back to the literal.
function mooterCmd(cmd) {
  try {
    if (/^mooter\s/.test(cmd) && extra.MOOTER_CLI && fs.existsSync(extra.MOOTER_CLI)) {
      return 'node "' + extra.MOOTER_CLI + '" ' + cmd.replace(/^mooter\s+/, '');
    }
  } catch { /* fall through */ }
  return cmd;
}

function runInTerminal(cmd, name = 'mooter') {
  const t = vscode.window.terminals.find((x) => x.name === name) || vscode.window.createTerminal(name);
  t.show(); t.sendText(cmd);
}

// ── Deck Floor (Fase 2) ──────────────────────────────────────────────────────
// openSessionTab: the deep-link that makes wave = sessão = aba. Opens/focuses the CC editor for
// a session id — claude-vscode's custom editor is a singleton per session, so re-opening the same
// id focuses the existing tab instead of duplicating it (coherence, law 4). Registered as a
// first-class command so every surface (Floor row, Project Command wave, palette, keybinding)
// lands on the SAME tab. Honest: never spawns a second session.
function openSessionTab(arg) {
  let id = '', title = '';
  if (arg && typeof arg === 'object') { id = String(arg.id || ''); title = String(arg.title || ''); }
  else id = String(arg || '');
  id = id.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!id) return;
  try { vscode.commands.executeCommand('claude-vscode.primaryEditor.open', id); }
  catch { try { vscode.env.openExternal(vscode.Uri.parse('vscode://anthropic.claude-code/open?session=' + id)); } catch { /* no-op */ } }
  vscode.window.setStatusBarMessage('🐮 a abrir a aba' + (title ? ' · ' + title : '') + ' em Claude Code', 4000);
}

// fleetSnapshot: read-only aggregate of the pillar fleet (_handoff/fleet/*/STATE.json). Never
// throws; null when there is no fleet dir. A pillar is "loop" (in-flight) only when it ran within
// the last 6h — a stale STATE file reads as idle, never fabricated as a live loop (honest-copy).
function fleetSnapshot() {
  try {
    const folders = (vscode.workspace.workspaceFolders || []).map((f) => f.uri && f.uri.fsPath).filter(Boolean);
    for (const root of folders) {
      const dir = path.join(root, '_handoff', 'fleet');
      let names = [];
      try { names = fs.readdirSync(dir); } catch { continue; }
      const pillars = [];
      const ACTIVE_MS = 6 * 3600 * 1000;
      for (const n of names) {
        let st;
        try { st = JSON.parse(fs.readFileSync(path.join(dir, n, 'STATE.json'), 'utf8')); } catch { continue; }
        if (!st || typeof st !== 'object') continue;
        const ts = Date.parse(st.last_run_ts || st.updated_at || '') || 0;
        const ageMs = ts ? (Date.now() - ts) : null;
        pillars.push({ pillar: String(st.pillar || n), status: String(st.status || 'unknown'),
          lastOk: st.lastOk === true, round: Number(st.round) || 0, ageMs,
          active: ageMs != null && ageMs <= ACTIVE_MS });
      }
      if (!pillars.length) continue;
      pillars.sort((a, b) => (a.ageMs == null ? 1 : b.ageMs == null ? -1 : a.ageMs - b.ageMs));
      const activeN = pillars.filter((p) => p.active).length;
      return { count: pillars.length, activeN, idleN: pillars.length - activeN, pillars };
    }
  } catch { /* never throws — the Floor degrades to no Fleet Console */ }
  return null;
}

class CockpitProvider {
  constructor(ctx, data) { this.ctx = ctx; this.data = data; }
  resolveWebviewView(view) {
    view.webview.options = { enableScripts: true };
    // ── GUARDIAN:F0 ── current auto-compact override (read once at view creation — env changes
    // via SetEnvironmentVariable only land in NEW processes, so process.env IS the honest "active" value).
    const _gPctRaw = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
    const guardianPct = (_gPctRaw && /^\d+$/.test(_gPctRaw)) ? parseInt(_gPctRaw, 10) : null;
    view.webview.html = getHtml(guardianPct);
    // ── /GUARDIAN:F0 ──
    // ⇄ Handoff v2 (#3b): pré-aquece o modelo de geração local (best-effort, nunca bloqueia) para o
    // 1º handoff já vir do LLM em vez do fallback determinístico por cold-start do Ollama.
    // ⇄ v2.1 KEEP-WARM: re-aquece quando o cockpit fica visível / no refresh, THROTTLED (máx 1×/8min)
    // para renovar a janela keep_alive '30m' sem martelar o Ollama. Nunca bloqueia (fire-and-forget).
    let lastWarmTs = 0;
    const reWarm = () => { try { if (!view.visible) return; const now = Date.now(); if (now - lastWarmTs < 8 * 60 * 1000) return; lastWarmTs = now; extra.warmLocalGenModel(); } catch { /* best-effort */ } };
    try { extra.warmLocalGenModel(); lastWarmTs = Date.now(); } catch { /* best-effort */ }
    // ⇄ Handoff v2: cache do último texto de handoff por id (sessão OU projectKey) → o botão
    // 📋 Copiar re-copia sem regenerar. Vive no closure desta view (limpa ao recriar a view).
    const hoffCache = {};
    const sub = this.data.onUpdate((s) => { try { view.webview.postMessage({ type: 'snapshot', s: project(s) }); } catch {} });
    // Throttle polling to the panel's visibility (fewer background CLI spawns when hidden).
    this.data.setVisible(view.visible);
    const vis = view.onDidChangeVisibility(() => { this.data.setVisible(view.visible); reWarm(); });
    view.onDidDispose(() => { sub.dispose(); vis.dispose(); });
    view.webview.onDidReceiveMessage(async (m) => {
      if (!m) return;
      if (m.cmd === 'launch') vscode.commands.executeCommand('mooter.newSession');
      if (m.cmd === 'refresh') { this.data.refresh(true); reWarm(); }
      if (m.cmd === 'term') runInTerminal(mooterCmd(m.arg || 'mooter doctor'));
      if (m.cmd === 'openUrl') { const u = String(m.arg || ''); if (/^https?:\/\//i.test(u)) vscode.env.openExternal(vscode.Uri.parse(u)); }
      // B2 — abre o ficheiro local de uma integração (Obsidian) no editor. Só ficheiros locais reais.
      if (m.cmd === 'openFile') {
        const p = String(m.arg || '');
        if (p) {
          try { await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(p)); }
          catch { vscode.window.setStatusBarMessage('🐮 não consegui abrir ' + p.slice(0, 60), 3500); }
        }
      }
      if (m.cmd === 'pin') { const t = String(m.arg || '').replace(/[^a-zA-Z0-9/_.:-]/g, ''); if (t) { await vscode.env.clipboard.writeText(t); vscode.window.setStatusBarMessage('🐮 ' + t + ' copied — paste it in Claude Code for your next prompt', 5000); } }
      if (m.cmd === 'pinNext') {
        const r = extra.writePinNext(m.arg);
        if (r.ok) vscode.window.setStatusBarMessage(r.model ? '🐮 next prompt → ' + r.model + ' (auto-routed — no paste needed)' : '🐮 next prompt → Auto (let Moo decide)', 5000);
        else vscode.window.setStatusBarMessage('🐮 could not set next-prompt model', 3500);
        this.data.refresh(true);
      }
      if (m.cmd === 'selectSession') { const a = String(m.arg || 'auto'); this.data.selectedSession = (a === 'all' || a === 'auto') ? a : a.replace(/[^a-zA-Z0-9._-]/g, ''); this.data.refresh(true); }
      if (m.cmd === 'openSession') {
        // Open/focus that exact Claude Code session in the editor. The extension's URI
        // handler maps /open?session=<id> → claude-vscode.primaryEditor.open(id); we call
        // the command directly (URI as fallback), then scope the cockpit to it.
        const id = String(m.arg || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (id) {
          try { await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', id); }
          catch { try { vscode.env.openExternal(vscode.Uri.parse('vscode://anthropic.claude-code/open?session=' + id)); } catch { /* no-op */ } }
          this.data.selectedSession = id; this.data.refresh(true);
        }
      }
      // ── DELIVERY COCKPIT · Frente B — play a wave: ⚠️ acção com CUSTO (sessão CC / GPU) that
      // RESPECTS dependencies. A locked wave (unproven upstream in the Ledger) warns and never
      // launches into the void; an unlocked wave confirms cost, seeds the wave masterprompt
      // scaffold into the clipboard, and opens a fresh CC session (reusing mooter.newSession —
      // the same "New CC Moo Loop Session" affordance). Honest: the extension never claims to
      // auto-run the masterprompt; it hands you a seeded session to launch it.
      if (m.cmd === 'playWave') {
        const wid = String(m.arg || '').toUpperCase().replace(/[^A-Z0-9.]/g, '');
        const pc = (this.data.snapshot && this.data.snapshot.pc) || null;
        const wave = pc && Array.isArray(pc.phases)
          ? pc.phases.reduce((acc, p) => acc || (p.waves || []).find((w) => w.wave_id === wid), null) : null;
        if (!wave) { vscode.window.setStatusBarMessage('🛩️ wave ' + wid + ' não encontrada no forecast', 4000); return; }
        if (wave.locked) {
          vscode.window.showWarningMessage('🔒 ' + wid + ' está bloqueada — ' + (wave.lock_reason || 'dependência por concluir') + '. Fecha a dependência primeiro (o gate regista-se no Ledger).');
          return;
        }
        const eff = wave.effort ? (' · esforço ' + wave.effort) : '';
        const pick = await vscode.window.showWarningMessage(
          '▶ Play ' + wid + ' — ' + (wave.name || '') + eff + '. Isto abre uma sessão Claude Code (conta para o teu limite; se for Loop/Schedule usa GPU local). O scaffold do masterprompt vai para o clipboard. Continuar?',
          { modal: true }, 'Abrir sessão CC', 'Cancelar');
        if (pick !== 'Abrir sessão CC') return;
        const seed = '# ' + wid + ' · ' + (wave.name || '') + '\n'
          + (wave.goal ? ('Objectivo: ' + wave.goal + '\n') : '')
          + (wave.worktree ? ('Worktree sugerida: ' + String(wave.worktree).replace(/[`]/g, '') + '\n') : '')
          + (wave.type ? ('Modo: ' + wave.type + '\n') : '')
          + (Array.isArray(wave.deps) && wave.deps.length ? ('Depende de: ' + wave.deps.map((d) => d.id).join(', ') + '\n') : '')
          + '\nEscreve/expande o masterprompt desta wave e executa-o nesta sessão.';
        try { await vscode.env.clipboard.writeText(seed); } catch { /* best-effort */ }
        vscode.commands.executeCommand('mooter.newSession');
        vscode.window.setStatusBarMessage('🛩️ ' + wid + ' — scaffold no clipboard · cola-o (Ctrl+V) na sessão nova', 8000);
        return;
      }
      // "design a new wave" / "re-prioritise" — seed a Cowork/CC prompt into the clipboard and
      // open a session (the human assembles strategy → masterprompt). Honest: no silent write-back.
      if (m.cmd === 'designWave' || m.cmd === 'reprioritise') {
        const prompt = (m.cmd === 'designWave')
          ? 'Desenha uma NOVA wave para o roadmap do Mooter (docs/strategy/MOOTER_ROADMAP.md): tese, modo (CC-once/Loop/Schedule), worktree, effort, deps — e escreve o masterprompt. Confronta com a arquitectura antes de propor.'
          : 'Re-prioritiza as waves do roadmap por performance-por-esforço (usa o forecast.json + o Ledger). Mostra o caminho crítico e propõe a nova ordem — não reescrevas o roadmap sem o meu OK.';
        try { await vscode.env.clipboard.writeText(prompt); } catch { /* best-effort */ }
        vscode.commands.executeCommand('mooter.newSession');
        vscode.window.setStatusBarMessage('🛩️ prompt no clipboard — cola-o (Ctrl+V) na sessão nova para o Cowork', 7000);
        return;
      }
      if (m.cmd === 'mode') { await extra.setMode(m.arg); this.data.refresh(true); }
      if (m.cmd === 'slashInstall') {
        const r = await extra.installSlashCommands();
        vscode.window.setStatusBarMessage(r.ok ? '🐮 /mooter slash command installed' : ('🐮 slash install failed — ' + (r.out || 'unknown')), 6000);
        this.data.refresh(true);
      }
      if (m.cmd === 'packInstall') {
        const r = await extra.installPack(m.arg || null);
        vscode.window.setStatusBarMessage(r.ok ? ('🐮 Moo Pack installed · ' + (r.name || '')) : ('🐮 pack install failed — ' + (r.out || 'unknown')), 6000);
        this.data.refresh(true);
      }
      if (m.cmd === 'install') runInTerminal('npx @mooter/cli', 'mooter setup');
      if (m.cmd === 'budget') {
        const r = extra.writeBudget(m.arg);
        if (r.ok) vscode.window.setStatusBarMessage('🐮 budget set: $' + r.value + '/month', 4000);
        this.data.refresh(true);
      }
      // ── GUARDIAN:F0 ── context guardrail: lower CC's auto-compact threshold by writing the
      // CLAUDE_AUTOCOMPACT_PCT_OVERRIDE User env var (the only reliable way to compact BEFORE the
      // ~83% delirium line). CLAUDE_AUTOCOMPACT_PCT_OVERRIDE is Math.min-clamped by CC → only lowers.
      // Values above ~83 are ignored by CC, so we validate 1..82 and warn. Applies to NEW sessions only.
      if (m.cmd === 'setAutoCompact') {
        const pct = parseInt(String(m.arg), 10);
        if (!Number.isFinite(pct) || pct < 1 || pct > 82) {
          vscode.window.setStatusBarMessage('🛡️ guardrail — valor inválido (usa 1–82; acima de ~83% o Claude Code ignora)', 6000);
        } else {
          runInTerminal("[Environment]::SetEnvironmentVariable('CLAUDE_AUTOCOMPACT_PCT_OVERRIDE','" + pct + "','User')", 'mooter guardrail');
          vscode.window.setStatusBarMessage('🛡️ guardrail → auto-compact aos ' + pct + '% · aplica-se a sessões NOVAS (reabre o VS Code)', 8000);
        }
      }
      // ── /GUARDIAN:F0 ──
      if (m.cmd === 'pull') runInTerminal('ollama pull ' + String(m.arg || '').replace(/[^a-zA-Z0-9:._-]/g, ''));
      if (m.cmd === 'effort') { await extra.effortSet(m.arg); this.data.refresh(true); }
      if (m.cmd === 'rate') {
        const r = await extra.rateSpan(m.arg && m.arg.id, m.arg && m.arg.n);
        vscode.window.setStatusBarMessage(r.ok ? '🐮 feedback saved — the Pastor learns' : '🐮 could not save feedback', 3500);
      }
      if (m.cmd === 'intent') {
        const res = await extra.intentResolve(m.arg);
        try { view.webview.postMessage({ type: 'intent', res }); } catch {}
      }
      // PASSO 0 — dev diagnostic sink (gated webview-side by HERD_DIAG, default off). Persists the
      // one-shot ground-truth report of why herd rows may be hidden to <workspace>/_handoff/herd-diag.json.
      if (m.cmd === 'herdDiag') {
        try {
          const wfs = vscode.workspace.workspaceFolders || [];
          if (wfs.length && m.arg) {
            const out = path.join(wfs[0].uri.fsPath, '_handoff', 'herd-diag.json');
            fs.writeFileSync(out, JSON.stringify(Object.assign({ ts: new Date().toISOString() }, m.arg), null, 2));
          }
        } catch { /* best-effort */ }
      }
      // WCOCKPIT: per-session auto-pilot controls
      if (m.cmd === 'setMode') {
        const sid = String(m.arg && m.arg.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
        const mode = String(m.arg && m.arg.mode || '').replace(/[^a-z]/g, '');
        if (sid && mode) { try { MR.set(sid, { mode }); } catch {} this.data.refresh(true); }
      }
      if (m.cmd === 'setModel') {
        const sid = String(m.arg && m.arg.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
        const model = m.arg && m.arg.model != null ? String(m.arg.model).replace(/[^a-zA-Z0-9:._-]/g, '') : null;
        if (sid) { try { MR.set(sid, { model: model || null }); } catch {} this.data.refresh(true); }
      }
      if (m.cmd === 'setAuto') {
        const sid = String(m.arg && m.arg.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (sid) { try { MR.set(sid, { auto: !!m.arg.auto }); } catch {} this.data.refresh(true); }
      }
      // WCOCKPIT-9 (Bloco E): escolhe um slash command (skills/Moo Packs) para a sessão.
      // Copia para o clipboard E arma-o como "próximo prompt" (registry nextSlash). Toast honesto:
      // copiado — cola na sessão (a injeção automática depende da ponte CC; não fingimos que injetou).
      if (m.cmd === 'pickSlash') {
        const sid = String(m.arg && m.arg.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
        const cmd = String(m.arg && m.arg.cmd || '').replace(/[^a-zA-Z0-9 :._/-]/g, '').slice(0, 80);
        if (sid) {
          if (cmd) {
            try { await vscode.env.clipboard.writeText(cmd); } catch {}
            try { (MR.setNextSlash ? MR.setNextSlash(sid, cmd) : MR.set(sid, { nextSlash: cmd })); } catch {}
            vscode.window.setStatusBarMessage('🐮 ' + cmd + ' copiado — cola no prompt da sessão ' + sid.slice(0, 8), 5000);
          } else {
            try { (MR.setNextSlash ? MR.setNextSlash(sid, null) : MR.set(sid, { nextSlash: null })); } catch {}
            vscode.window.setStatusBarMessage('🐮 slash desarmado · ' + sid.slice(0, 8), 3000);
          }
          this.data.refresh(true);
        }
      }
      // WCOCKPIT-9 (Bloco F): arma/desarma o LoopMoo da sessão (estado persistente no registo).
      // O loop-runner (_handoff/loop/sdk-runner.mjs) inscreve a sessão quando estiver activo;
      // se não estiver, o estado fica "armado" e o cartão mostra a degradação honesta.
      if (m.cmd === 'setLoop') {
        const sid = String(m.arg && m.arg.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (sid) {
          const on = !!(m.arg && m.arg.loop);
          try { (MR.setLoop ? MR.setLoop(sid, on) : MR.set(sid, { loop: on })); } catch {}
          this.data.refresh(true);
          vscode.window.setStatusBarMessage(on
            ? (loopRunnerActive() ? '🔁 LoopMoo ON · ' + sid.slice(0, 8) : '🔁 LoopMoo armado · ' + sid.slice(0, 8) + ' — loop-runner não está activo')
            : '🔁 LoopMoo OFF · ' + sid.slice(0, 8), 4000);
        }
      }
      // Deck Floor (Fase 2): persistent session pin (mode-registry — survives reload).
      if (m.cmd === 'pinSession') {
        const sid = String(m.arg && m.arg.sid || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (sid) {
          const on = !!(m.arg && m.arg.pinned);
          try { (MR.setPinned ? MR.setPinned(sid, on) : MR.set(sid, { pinned: on })); } catch {}
          this.data.refresh(true);
          vscode.window.setStatusBarMessage(on ? '📌 sessão fixada · ' + sid.slice(0, 8) + ' — fica no topo, não arquiva' : '📌 sessão solta · ' + sid.slice(0, 8), 4000);
        }
      }
      // Deck Floor (Fase 2): deep-link — click a Floor row → focus/open the CC tab of the same
      // session (wave=sessão=aba). Routes through the registered mooter.openSessionTab command.
      if (m.cmd === 'openSessionTab') {
        vscode.commands.executeCommand('mooter.openSessionTab', m.arg);
        const _id = String((m.arg && m.arg.id) || m.arg || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (_id) { this.data.selectedSession = _id; this.data.refresh(true); }
      }
      // ════════════════════════════════════════════════════════════════════════
      // WCOCKPIT-9 (Bloco C): fluxo Commit & Push por sessão. SEMPRE host-side (execFile git,
      // nunca terminal → não pode ser sequestrado por uma sessão CC). Garantias: preview
      // obrigatório, stage SELECTIVO (nunca git add -A), guarda da sha de classify.js ANTES de
      // commitar, aviso de harmonia entre sessões no mesmo repo+branch, push só com confirmação
      // modal explícita, NUNCA --force, merge NÃO exposto (acção separada/gated por design).
      // ════════════════════════════════════════════════════════════════════════
      if (m.cmd === 'gitFlow') {
        const sid = String(m.arg || '').replace(/[^a-zA-Z0-9._-]/g, '');
        const rows = (this.data.snapshot && this.data.snapshot.recent) || [];
        const row = rows.find((r) => r.fullId === sid);
        if (!row || !row.cwd) { vscode.window.showWarningMessage('🐮 sessão sem repo git — nada para commitar.'); return; }
        const cwd = row.cwd, branch = row.branch || null;
        // 1) GUARDA da sha de classify.js — aborta se o engine foi alterado neste repo.
        const sha = extra.classifyShaGuard(cwd);
        if (sha.checked && !sha.ok) {
          vscode.window.showErrorMessage('🛑 classify.js está ALTERADO (sha ' + String(sha.sha).slice(0, 12) + '… ≠ frozen). Commit ABORTADO pelo guardrail — reverte classify.js primeiro.');
          return;
        }
        // 2) PREVIEW obrigatório (read-only).
        const prev = await extra.gitCommitPreview(cwd);
        if (!prev || !prev.files.length) { vscode.window.setStatusBarMessage('🐮 nada para commitar nesta sessão', 3000); this.data.refresh(true); return; }
        // 3) HARMONIA — outras sessões no mesmo repo+branch (mesmo trabalho).
        const harmony = extra.gitHarmony(rows, cwd, branch);
        // 4) Mensagem editável (default convencional).
        const msg = await vscode.window.showInputBox({ value: prev.message, ignoreFocusOut: true,
          prompt: 'Mensagem de commit · ' + prev.files.length + ' ficheiro' + (prev.files.length === 1 ? '' : 's') + ' · stage selectivo (nunca git add -A)' });
        if (!msg) { vscode.window.setStatusBarMessage('🐮 commit cancelado', 2500); return; }
        // 5) Confirmação MODAL com preview + comandos exactos + aviso de harmonia.
        const fileList = prev.files.slice(0, 12).map((f) => '  ' + f.x + f.y + ' ' + f.path).join('\n')
          + (prev.files.length > 12 ? '\n  …+' + (prev.files.length - 12) + ' more' : '');
        const harmonyNote = harmony.shared
          ? '\n\n⚠ HARMONIA: ' + harmony.count + ' sessões no mesmo repo+branch (' + (branch || '?') + ') — confirma que não pisas trabalho de outra sessão.'
          : '';
        const detail = 'Branch: ' + (branch || '(detached)') + '\n\nFicheiros (' + prev.files.length + '):\n' + fileList
          + '\n\nComandos exactos:\n  git add -- <' + prev.files.length + ' selectivo' + (prev.files.length === 1 ? '' : 's') + '>\n  git commit -m "' + msg + '"'
          + (sha.checked ? '\n\n✓ classify.js sha intacta' : '') + harmonyNote;
        const choice = await vscode.window.showWarningMessage(
          'Commit ' + prev.files.length + ' ficheiro' + (prev.files.length === 1 ? '' : 's') + ' em ' + (branch || '(detached)') + '?',
          { modal: true, detail }, 'Commit', 'Commit & Push');
        if (!choice) { vscode.window.setStatusBarMessage('🐮 commit cancelado', 2500); return; }
        // 6) COMMIT selectivo. Resultado real (nunca presumido).
        const cres = await extra.gitCommit(cwd, prev.files.map((f) => f.path), msg);
        if (!cres.ok) { vscode.window.showErrorMessage('🛑 commit falhou: ' + String(cres.out || 'erro desconhecido').slice(0, 300)); this.data.refresh(true); return; }
        vscode.window.showInformationMessage('✓ commit · ' + sid.slice(0, 8) + ' — ' + String(cres.out || '').slice(0, 160));
        // 7) PUSH só quando o Paulo escolheu explicitamente "Commit & Push" (gate). Nunca --force.
        if (choice === 'Commit & Push') {
          const pres = await extra.gitPush(cwd);
          if (pres.ok) vscode.window.showInformationMessage('⇡ push ok · ' + (branch || '') + ' — ' + String(pres.out || '').slice(0, 160));
          else vscode.window.showErrorMessage('🛑 push falhou (o commit já está local): ' + String(pres.out || '').slice(0, 300));
        }
        this.data.refresh(true);
      }
      // ⇄ Handoff: gera o handoff desta sessão (estado + última acção + pergunta pendente),
      // copia para o clipboard (cola no Cowork = contexto total sem screenshots) e faz UPSERT
      // no SYNC.md do repo da sessão (rota local "o contexto nunca se perde"). Determinístico
      // primeiro (row + pending já lidos pelo host); Ollama local é opcional e nunca bloqueia.
      if (m.cmd === 'handoff') {
        const sid = String(m.arg || '').replace(/[^a-zA-Z0-9._-]/g, '');
        const rows = (this.data.snapshot && this.data.snapshot.recent) || [];
        const row = rows.find((r) => r.fullId === sid);
        if (!row) { vscode.window.showWarningMessage('🐮 sessão não encontrada — refresca o cockpit e tenta outra vez.'); return; }
        const pending = row.pending || extra.extractPending([]);
        const mode = (Number(row.turns) || 0) >= 12 ? 'full' : 'quick';
        // ⇄ v3 deterministic facts (sync, best-effort) — computed ONCE so the skeleton AND the enriched
        //  text share a single git read: HEAD/BASE/GATE/TREE snapshot, vault freshness, journal delta.
        const recent = (this.data.snapshot && this.data.snapshot.recent) || [];
        // PERFECT HANDOFF v2 / FASE 1: resolve git facts against the session's OWN branch (journal/
        // worktree ground-truth), NEVER the live tree HEAD another session may have swapped. Only when
        // certain (journal or dedicated worktree); uncertain (tree-only) → null → generateHandoff prints
        // `n/d (sem journal)` rather than a shared-tree lie.
        const _sgb = (row.sessionGit && !row.sessionGit.uncertain && row.sessionGit.branch) ? row.sessionGit.branch : null;
        const snapshot = extra.gitSnapshot(row.cwd, { recent, branch: row.branch, pr: row.pr, sessionBranch: _sgb });
        const vaultMtime = extra.vaultFreshness();
        let deltaTurns = null;
        try { const jl = extra.readJournalLast(row.fullId); if (jl && Number.isFinite(jl.n_turn)) deltaTurns = jl.n_turn; } catch { /* best-effort */ }
        // PERFECT HANDOFF v2 — enrich the render: STATE + PARA TI banner + PENDING-completo + qwen demoted
        // (perfect:true), and PROJECT the session's Ledger events (INTENT/DECISIONS/mechanical GATE).
        let ledgerEvents = []; try { ledgerEvents = extra.sessionLedgerEvents(row.fullId); } catch { /* best-effort */ }
        const v3 = { snapshot, vaultMtime, deltaTurns, recent, perfect: true, ledgerEvents, sessionGit: row.sessionGit };
        // ⇄ v2.1 BACKGROUND ENRICHMENT — o handoff copia SEMPRE, e enriquece DEPOIS:
        //  PASSO 1: esqueleto determinístico (git/branch/ficheiros + PENDING verbatim) revelado no
        //   painel ('ready') e COPIADO já, ANTES de qualquer await de LLM → o clipboard nunca espera.
        //  PASSO 2: composeHandoff (DOING+RECAP em paralelo, deadline longo ~12s porque o webview já
        //   tem o esqueleto) corre a narrativa LLM local; SÓ quando ela CORREU (c.model!=null) e o
        //   texto mudou, substitui o painel ('enriched') e RE-COPIA. Ollama down/lento → fica o
        //   esqueleto (já copiado). O LLM NUNCA toca no PENDING. mode segue o tamanho da sessão.
        const text0 = extra.generateHandoff(row, pending, Object.assign({ mode }, v3));
        hoffCache[sid] = text0;
        try { view.webview.postMessage({ type: 'handoff', sid, status: 'ready', text: text0 }); } catch {}
        try { await vscode.env.clipboard.writeText(text0); } catch { /* clipboard best-effort */ }
        try { (MR.setHandoff ? MR.setHandoff(sid) : MR.set(sid, { handoffSentAt: new Date().toISOString() })); } catch {}
        vscode.window.setStatusBarMessage('🐮 handoff copiado — a gerar narrativa local…', 5000);
        let best = text0;
        // ⇄ F2 LIVE STREAMING — o handoff a construir-se ao vivo no painel: os FACTOS determinísticos
        // (ASK/HEAD/BASE/GATE/TREE/FRESH/DELTA/PENDING) já apareceram e foram copiados (skeleton
        // 'ready'); agora a NARRATIVA local stream-a token-a-token ('handoff-stream' por chunk →
        // DOING/RECAP a aparecer). Quando produz texto, reconstrói o handoff enriquecido (PENDING
        // SEMPRE verbatim; narrativa marcada "(local best-effort)") e fixa-o ('handoff-done') +
        // re-copia. Stream indisponível/falhou → fallback ao caminho actual (composeHandoff: rolling
        // summary instantâneo ou determinístico). Em qualquer caso 'handoff-done' dispara → o painel
        // nunca fica preso em "a gerar". NUNCA bloqueia (o clipboard já tem o skeleton).
        let streamed = false;
        try {
          const sres = await extra.streamHandoffNarrative(row, { mode, doingMs: 8000, recapMs: 10000,
            lastToolActions: (pending && pending.lastToolActions) || [],
            onChunk: (chunk) => { try { view.webview.postMessage({ type: 'handoff-stream', sid, chunk }); } catch {} } });
          if (sres && sres.ok && (sres.doing || sres.recap)) {
            const enriched = extra.generateHandoff(row, pending, Object.assign({ mode, doing: sres.doing, recap: sres.recap, genModel: sres.model, bestEffort: true }, v3));
            if (enriched && enriched !== text0) {
              best = enriched; hoffCache[sid] = best;
              try { await vscode.env.clipboard.writeText(best); } catch { /* clipboard best-effort */ }
              vscode.window.setStatusBarMessage('✓ narrativa local (' + sres.model + ') — recopiado', 5000);
            }
            try { view.webview.postMessage({ type: 'handoff-done', sid, text: best, model: sres.model }); } catch {}
            streamed = true;
          }
        } catch { /* stream falhou → fallback abaixo (nunca hang) */ }
        if (!streamed) {
          try {
            const c = await extra.composeHandoff(row, pending, Object.assign({ mode, deadlineMs: 12000, doingMs: 11000, recapMs: 11500 }, v3));
            if (c && c.model && c.text && c.text !== text0) { best = c.text; hoffCache[sid] = best; try { await vscode.env.clipboard.writeText(best); } catch {} vscode.window.setStatusBarMessage('✓ enriquecido (' + c.model + ') — recopiado', 5000); }
          } catch { /* Ollama down/lento → fica o esqueleto (nunca hang/vazio) */ }
          try { view.webview.postMessage({ type: 'handoff-done', sid, text: best, model: null }); } catch {}
        }
        // SYNC.md upsert com o MELHOR texto (enriquecido se houve, senão o esqueleto) — rota local
        // "o contexto nunca se perde". §SAVINGS: o rodapé visível ("~Xk tok saved vs screenshot
        // (est.)") já viaja no texto; o registo advisory no savings-tracker fica deferido até a sua
        // API estar confirmada (não fabricamos um writer).
        if (row.cwd) { try { extra.writeHandoffToSync(row.cwd, sid, best, { name: row.name }); } catch { /* SYNC.md best-effort */ } }
        this.data.refresh(true);
      }
      // ⇄ Handoff de PROJECTO (todas as sessões do grupo). Mesmo painel inline (data-hoff=<projectKey>)
      // + clipboard + upsert SYNC.md sob sid '__fleet__'. INSTANTÂNEO a partir do snapshot em memória
      // ('ready', copiado já); enriquece em background com recentSessions(30) + síntese local.
      if (m.cmd === 'projHandoff') {
        const proj = String(m.arg || '').slice(0, 80);
        if (!proj) return;
        // Replica do agrupamento do webview (projOf): Cowork project > repo folder (só repo real) > Unassigned.
        const projOf = (r) => (r && r.coworkProject) ? r.coworkProject
          : ((r && r.repoFolder && (r.branch || r.gitStage)) ? r.repoFolder : 'Unassigned');
        const snapRows = ((this.data.snapshot && this.data.snapshot.recent) || []).filter((r) => projOf(r) === proj);
        // GATE #1 (worktree-aware honesty): enumerate the project's PARKED branches (commits on no
        // remote, across every linked worktree — even those no live session sits on) so the board can
        // never falsely read "0 UNPUSHED · projecto limpo". Bounded (parallel git reads); [] on failure.
        const projBranches = async (rws) => { try { const cwds = Array.from(new Set((rws || []).map((r) => r && r.cwd).filter(Boolean))); return await extra.worktreeParked(cwds); } catch { return []; } };
        // ⇄ v2.1 BACKGROUND ENRICHMENT (mesmo padrão do handoff de sessão):
        //  PASSO 1: board instantânea (determinística) revelada ('ready') + COPIADA já, antes de awaits LLM.
        let branches = await projBranches(snapRows);
        const text0 = extra.generateProjectHandoff(proj, snapRows, { branches, perfect: true });
        hoffCache[proj] = text0;
        try { view.webview.postMessage({ type: 'handoff', sid: proj, status: 'ready', text: text0 }); } catch {}
        try { await vscode.env.clipboard.writeText(text0); } catch { /* clipboard best-effort */ }
        vscode.window.setStatusBarMessage('🐮 handoff do projecto ' + proj.slice(0, 24) + ' copiado — a gerar síntese local…', 5000);
        // PASSO 2: recentSessions(30) capta sessões além das visíveis + síntese local. Deadline longo
        //  (~11.5s) — o webview já tem a board. SÓ re-copia/substitui se o texto enriquecido mudou.
        let prows = snapRows;
        try { const all = await extra.recentSessions(30); const f = all.filter((r) => projOf(r) === proj); if (f.length) prows = f; } catch { /* mantém snapRows */ }
        if (prows !== snapRows) { branches = await projBranches(prows); } // re-enumerate over the wider session set
        // ⇄ F2 LIVE STREAMING (per-projecto = mesmo padrão visual): a síntese OVERALL a aparecer ao
        // vivo ('handoff-stream' por chunk). Falha/indisponível → fallback ao caminho actual: rolling
        // summaries on-disk (instantâneo, sem eco) → ollamaProjectSynth (deadline ~11.5s) → contadores
        // determinísticos. 'handoff-done' fixa a board. NUNCA bloqueia (a board já foi copiada).
        let synth = null;
        try {
          const pres = await extra.streamProjectSynth(prows, { onChunk: (chunk) => { try { view.webview.postMessage({ type: 'handoff-stream', sid: proj, chunk }); } catch {} } });
          if (pres && pres.ok && pres.synth) synth = pres.synth;
        } catch { synth = null; }
        if (!synth) { try { synth = extra.projectSynthFromSummaries(prows); } catch { synth = null; } }
        if (!synth) { try { synth = await extra.ollamaProjectSynth(prows, 11500); } catch { synth = null; } }
        let best = text0;
        const enriched = extra.generateProjectHandoff(proj, prows, { synth, branches, perfect: true });
        if (enriched && enriched !== text0) {
          best = enriched;
          hoffCache[proj] = best;
          try { await vscode.env.clipboard.writeText(best); } catch { /* clipboard best-effort */ }
          vscode.window.setStatusBarMessage(synth
            ? '✓ enriquecido (síntese local) — recopiado'
            : '🐮 handoff do projecto ' + proj.slice(0, 24) + ' actualizado — recopiado', 5000);
        }
        try { view.webview.postMessage({ type: 'handoff-done', sid: proj, text: best, model: synth ? 'local' : null }); } catch {}
        const cwd = (prows.find((r) => r && r.cwd) || {}).cwd;
        if (cwd) { try { extra.writeHandoffToSync(cwd, '__fleet__', best, { name: proj }); } catch { /* SYNC.md best-effort */ } }
        this.data.refresh(true);
      }
      // ⇄ Handoff v2 — 📋 Copiar: re-copia o último handoff (sessão OU projecto) da cache host-side.
      // Sem regenerar, sem tocar no SYNC.md. id = data-x do botão (sid sanitizado ou projectKey).
      if (m.cmd === 'hoffCopy') {
        const id = String(m.arg || '').slice(0, 80);
        const txt = hoffCache[id];
        if (txt) { try { await vscode.env.clipboard.writeText(txt); } catch {} vscode.window.setStatusBarMessage('🐮 handoff copiado outra vez para o clipboard', 3000); }
        else vscode.window.setStatusBarMessage('🐮 nada para copiar — gera o handoff primeiro', 3000);
      }
      if (m.cmd === 'toggleProject') {
        const proj = String(m.arg || '').slice(0, 64);
        if (proj) {
          try {
            const prefs = extra.preferences() || {};
            const key = 'project_collapsed_' + proj;
            prefs[key] = !prefs[key];
            extra.preferences.__set && extra.preferences.__set(prefs); // noop if not supported
          } catch {}
          this.data.refresh(true);
        }
      }
      // WCOCKPIT-2: refresh integrations — updates sync timestamps in registry (via bus, NOT direct API)
      if (m.cmd === 'refreshIntegrations') {
        const sid = String(m.arg || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (sid) {
          try { MR.touchSync(sid, 'notion'); } catch {}
          try { MR.touchSync(sid, 'obsidian'); } catch {}
          this.data.refresh(true);
          // HONESTO: isto carimba a hora de revisão LOCAL (não há sync remoto a partir do cockpit).
          vscode.window.setStatusBarMessage('🐮 marcado como visto · ' + sid.slice(0, 8) + ' — carimbo local (sem sync remoto)', 4000);
        }
      }
      // WCOCKPIT-7: close/archive a single session from the cockpit (reversible)
      if (m.cmd === 'archiveSession') {
        const sid = String(m.arg || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (sid) { try { MR.archive(sid); } catch {} this.data.refresh(true); vscode.window.setStatusBarMessage('🐮 session closed · ' + sid.slice(0, 8) + ' — returns if it becomes active again', 4000); }
      }
      // WCOCKPIT-7: bulk-close all sessions that already did their job (safe set computed by the webview)
      if (m.cmd === 'clearDoneSessions') {
        const ids = Array.isArray(m.arg) ? m.arg : [];
        let n = 0;
        for (const raw of ids) { const sid = String(raw || '').replace(/[^a-zA-Z0-9._-]/g, ''); if (sid) { try { MR.archive(sid); n++; } catch {} } }
        this.data.refresh(true);
        vscode.window.setStatusBarMessage(n ? ('🐮 cleared ' + n + ' done session' + (n === 1 ? '' : 's') + ' — they return if active again') : '🐮 nothing safe to clear', 4000);
      }
      // ── GUARDIAN:F3 ── Salto para sessão fresca no limiar de delírio (advise ≥90).
      // Entrega o handoff pré-cozinhado da F2 (_handoff/guardian/<sid>.md) — ou, na ausência,
      // gera-o ao vivo (mesmo esqueleto determinístico do botão ⇄ Handoff) — e SEMEIA uma sessão
      // CC nova com ele. Research-gate (verificado no bundle do plugin 2.1.195): o comando
      // `claude-vscode.primaryEditor.open(session, prompt)` ACEITA um 2º argumento `prompt` e, para
      // uma sessão NOVA (session=undefined), entrega-o ao input da nova sessão (createPanel →
      // setupPanel → getHtmlForWebview(webview, session, prompt, …)). O deep-link
      // `vscode://anthropic.claude-code/open?prompt=<enc>` faz a MESMA chamada. É seed real, não
      // clipboard-only. Mesmo assim copiamos SEMPRE para o clipboard como rede de segurança (builds
      // antigos do plugin ignoram o 2º arg → Ctrl+V recupera). NUNCA editamos o .jsonl da sessão.
      if (m.cmd === 'guardianJump') {
        const sid = String(m.arg || '').replace(/[^a-zA-Z0-9._-]/g, '');
        const rows = (this.data.snapshot && this.data.snapshot.recent) || [];
        const row = rows.find((r) => r.fullId === sid);
        if (!row) { vscode.window.showWarningMessage('🐮 sessão não encontrada — refresca o cockpit e tenta outra vez.'); return; }
        // 1) Texto: F2 pré-cozinhado primeiro; senão, esqueleto determinístico ao vivo (sync,
        //    instantâneo — o MESMO generateHandoff que o botão ⇄ Handoff copia como 'ready').
        const roots = [];
        try { (vscode.workspace.workspaceFolders || []).forEach((wf) => roots.push(wf.uri.fsPath)); } catch { /* no folders */ }
        if (row.cwd) roots.push(row.cwd);
        let text = null; let source = 'live';
        if (GJ && GJ.readPrebakedHandoff) { const pre = GJ.readPrebakedHandoff(roots, sid); if (pre && pre.text) { text = pre.text; source = 'prebaked'; } }
        if (!text) {
          const pending = row.pending || extra.extractPending([]);
          const mode = (Number(row.turns) || 0) >= 12 ? 'full' : 'quick';
          const _sgb = (row.sessionGit && !row.sessionGit.uncertain && row.sessionGit.branch) ? row.sessionGit.branch : null;
          const snapshot = extra.gitSnapshot(row.cwd, { recent: rows, branch: row.branch, pr: row.pr, sessionBranch: _sgb });
          const vaultMtime = extra.vaultFreshness();
          let deltaTurns = null;
          try { const jl = extra.readJournalLast(row.fullId); if (jl && Number.isFinite(jl.n_turn)) deltaTurns = jl.n_turn; } catch { /* best-effort */ }
          let ledgerEvents = []; try { ledgerEvents = extra.sessionLedgerEvents(row.fullId); } catch { /* best-effort */ }
          text = extra.generateHandoff(row, pending, { mode, snapshot, vaultMtime, deltaTurns, recent: rows, perfect: true, ledgerEvents, sessionGit: row.sessionGit });
        }
        hoffCache[sid] = text;
        // 2) Entrega: clipboard SEMPRE (rede de segurança) + seed da sessão nova (comando → deep-link).
        try { await vscode.env.clipboard.writeText(text); } catch { /* clipboard best-effort */ }
        const ext = vscode.extensions.getExtension('anthropic.claude-code');
        let delivered = false;
        if (ext) {
          try { await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', undefined, text); delivered = true; }
          catch {
            try { vscode.env.openExternal(vscode.Uri.parse('vscode://anthropic.claude-code/open?prompt=' + encodeURIComponent(text))); delivered = true; }
            catch { /* cai no clipboard-only abaixo */ }
          }
        } else {
          vscode.commands.executeCommand('mooter.newSession');
        }
        const tag = source === 'prebaked' ? 'pré-cozinhado' : 'ao vivo';
        vscode.window.setStatusBarMessage(
          delivered
            ? '🐮 sessão nova aberta · handoff ' + tag + ' entregue (Ctrl+V se não aparecer — já copiado)'
            : '🐮 handoff ' + tag + ' copiado — abre o Claude Code e Ctrl+V na sessão nova',
          7000);
        try { (MR.setHandoff ? MR.setHandoff(sid) : MR.set(sid, { handoffSentAt: new Date().toISOString() })); } catch { /* registry best-effort */ }
        // 3) Opcional (não-bloqueante): arquivar a sessão velha (reusa a lógica de archiveSession).
        Promise.resolve(vscode.window.showInformationMessage('🐮 Saltaste para uma sessão fresca com o contexto entregue.', 'Arquivar a antiga')).then((pick) => {
          if (pick === 'Arquivar a antiga') { try { MR.archive(sid); } catch { /* best-effort */ } this.data.refresh(true); }
        });
        this.data.refresh(true);
      }
      // ── Mission Control · Frente 0 — pilot actions (additive; reuse the {cmd,arg} bus) ──
      // 🐮 Ask the local Moo. Scoped + $0: streams from Ollama using ONLY the snapshot as context,
      // re-using the handoff-stream mechanism (moo-stream chunks → moo-done). Refuses out-of-snapshot.
      if (m.cmd === 'askMoo') {
        const q = String(m.arg || '').slice(0, 800);
        const snap = (this.data.snapshot && this.data.snapshot.mc) || null;
        if (!MCA) { try { view.webview.postMessage({ type: 'moo-done', text: '🐮 assistente local indisponível.', model: null }); } catch {} }
        else if (!snap) { try { view.webview.postMessage({ type: 'moo-done', text: '🐮 ainda não há snapshot — abre o painel e espera o primeiro refresh.', model: null }); } catch {} }
        else {
          try { view.webview.postMessage({ type: 'moo', status: 'thinking' }); } catch {}
          try {
            const res = await MCA.askMoo(q, snap, { onChunk: (chunk) => { try { view.webview.postMessage({ type: 'moo-stream', chunk }); } catch {} } });
            const txt = (res && res.text) ? res.text : (res && res.ok ? '' : '🐮 não consegui responder localmente (Ollama em baixo?).');
            view.webview.postMessage({ type: 'moo-done', text: txt, model: (res && res.model) || null });
          } catch { try { view.webview.postMessage({ type: 'moo-done', text: '🐮 erro local.', model: null }); } catch {} }
        }
      }
      // + spawn moo (encher a GPU com um worker local, $0). Abre um Ollama no terminal.
      if (m.cmd === 'spawnMoo') {
        const model = String(m.arg || '').replace(/[^a-zA-Z0-9._:\-]/g, '') || 'qwen3:30b';
        runInTerminal('ollama run ' + model, 'moo ' + model);
        vscode.window.setStatusBarMessage('🐮 a encher a GPU com ' + model + ' (local, $0)', 4000);
      }
      // 🔥 Overclock Moo — reclaims idle GPU with local moos ($0, idle-fill).
      // Launches the Node-pure overclock-fill.mjs via the editor's OWN Node
      // (process.execPath + ELECTRON_RUN_AS_NODE) — NO tsx, NO ../../overclock-moo.
      // The script ships INSIDE the .vsix next to this file, so an installed
      // extension can actually run it. (The previous `spawn tsx src/runner.mjs`
      // silently failed installed: runner.mjs imports .ts engine files → needs tsx,
      // and tsx ships in neither the .vsix nor the user's PATH.)
      // On completion, refreshes the webview so snapshot.gpu.overclock updates.
      if (m.cmd === 'overclockMoo') {
        try {
          const fillScript = path.join(__dirname, 'overclock-fill.mjs');
          // Warn if OLLAMA_NUM_PARALLEL is unset or low (batching may be limited).
          const numPar = process.env.OLLAMA_NUM_PARALLEL;
          if (!numPar || parseInt(numPar, 10) < 2) {
            vscode.window.setStatusBarMessage('⚠ OLLAMA_NUM_PARALLEL não configurado — batching pode ser limitado (define ≥2 para maior saturação)', 7000);
          }
          vscode.window.setStatusBarMessage('🔥 Overclock Moo — a saturar GPU ociosa (idle-fill, $0)…', 6000);
          // ELECTRON_RUN_AS_NODE=1 makes process.execPath behave as plain Node;
          // without it VS Code would open a new editor window instead of running
          // the script.
          const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
          const cp = require('child_process').spawn(process.execPath, [fillScript, '--idle-fill'], {
            cwd: __dirname, windowsHide: true, env,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          // Live progress: surface the runner's latest honest line in the status bar.
          let lastLine = '';
          const onData = (buf) => {
            for (const ln of String(buf).split('\n')) { const t = ln.trim(); if (t) lastLine = t; }
            try { vscode.window.setStatusBarMessage('🔥 ' + lastLine.slice(0, 80), 4000); } catch { /* best-effort */ }
          };
          if (cp.stdout) cp.stdout.on('data', onData);
          if (cp.stderr) cp.stderr.on('data', onData);
          cp.on('error', (err) => {
            vscode.window.showWarningMessage('🔥 Overclock Moo: não foi possível lançar o runner — ' + String(err && err.message || err).slice(0, 140));
          });
          const dataRef = this.data;
          cp.on('close', (code) => {
            try { dataRef.refresh(true); } catch { /* best-effort */ }
            const msg = (code === 0 || code == null)
              ? '🔥 Overclock Moo concluído — ' + (lastLine || 'snapshot atualizado') + ' ($0 local)'
              : '🔥 Overclock Moo terminou (código ' + code + ') — verifica o output do runner';
            try { vscode.window.setStatusBarMessage(msg, 6000); } catch { /* best-effort */ }
          });
        } catch (err) {
          vscode.window.showWarningMessage('🔥 Overclock Moo: erro ao lançar — ' + String(err && err.message || err).slice(0, 140));
        }
      }
      // ⏸ pausar tudo / ▶ retomar — escreve uma flag reversível no file-bus (runners honram-na).
      // HONESTO: o cockpit não mata processos; carimba o pedido e quem corre os loops lê a flag.
      if (m.cmd === 'pauseAll' || m.cmd === 'resumeAll') {
        const paused = m.cmd === 'pauseAll';
        writeMcFlag('pause-all', { paused, at: Date.now() });
        this.data.refresh(true);
        vscode.window.setStatusBarMessage(paused
          ? '⏸ Mooter — pausa global pedida (flag escrita; os runners honram-na)'
          : '▶ Mooter — retomado', 4000);
      }
      // 🌳+ subtree ligada a uma sessão — pede uma sub-fila de moos para o sid (fila local, $0).
      if (m.cmd === 'subtree') {
        const sid = String((m.arg && m.arg.sid) || m.arg || '').replace(/[^a-zA-Z0-9._-]/g, '');
        if (sid) {
          writeMcFlag('subtree-' + sid, { sid, requested: true, at: Date.now() });
          vscode.window.setStatusBarMessage('🌳 subtree pedida para ' + sid.slice(0, 8) + ' (fila local)', 4000);
        }
      }
    });
    this.data.refresh(true);
  }
}

function project(s) {
  const base = data_.publicSnapshot(s);
  const sub = s.sub ? { profile: s.sub.sub_profile || s.sub.profile || ((s.sub.profiles && s.sub.profiles.anthropic && s.sub.profiles.anthropic !== 'unknown') ? s.sub.profiles.anthropic : ((s.sub.profiles || s.sub.budget_strategy) ? 'configured' : 'unknown')), raw: s.sub } : null;
  const ctx = { runtimeInstalled: s.runtimeInstalled, trackerUp: s.trackerUp, ollama: s.ollama, hw: s.hw, sub, budget: s.budget, slash: s.slash, doctorChecks: s.doctor || [] };
  // Session scope: when a session is in effect, the Live cow reads THAT session's
  // host model (its ledger) and THAT session's most-recent decision (not the global
  // /last, which could belong to another terminal) — so the cow is coherent with the
  // numbers below it.
  const effSid = s.effectiveSession || null;
  const sLedger = (effSid && s.sessionLedger) ? s.sessionLedger : s.ledger;
  const hostModel = (sLedger && sLedger.session && sLedger.session.lastModel) || null;
  let lastForCow = s.last;
  if (effSid) {
    const dd = (base.decisions || []).find((d) => d.sid === effSid);
    lastForCow = dd ? { model_full: dd.model, tier: dd.tier, confidence: dd.conf, ts: dd.ts, cascade_path: '', user_override: dd.rule === 'user_override' } : null;
  }
  return Object.assign(base, {
    mode: s.mode, me: s.me, ollama: s.ollama, slash: s.slash, pinNext: s.pinNext,
    statuslineHtml: s.statuslineHtml, claudeCli: s.claudeCli,
    sub, device: s.device, hw: s.hw, quant: s.quant, prefs: s.prefs,
    budget: s.budget, packs: s.packs,
    effort: s.effort, whynot: s.whynot, trail: s.trail, security: s.security, spans: s.spans,
    insights: extra.insights(s.decisions),
    slashList: extra.slashCommands(), // WCOCKPIT-9 (Bloco E): real slash commands (skills + installed packs)
    // Each session in `recent` already carries its repo-scoped { pr: {number,stage,…} }
    // (resolved host-side in recentSessions; stage from the pure prStage). No global PR
    // list and no cross-repo branch-name matching in the webview.
    herd: s.herd, recent: s.recent || [],
    mc: s.mc || null, // Mission Control · Frente 0: the single snapshot the 4 views render from
    pc: s.pc || null, // Delivery Cockpit · Frente B: the ProjectCommandSnapshot the 🛩️ tab renders from
    loopActive: !!s.loopActive, // WCOCKPIT-9 (Bloco F)
    fleet: s.fleet || null, // Deck Floor (Fase 2): pillar aggregate for the Fleet Console
    localTok: s.localTok || null,
    localSpeed: extra.localSpeed(), // WS3: measured local tok/s (WS1 speed-meter) for the Local Moo Fleet
    ledger: s.ledger, sessionLedger: s.sessionLedger || null, sessionMetrics: s.sessionMetrics || null,
    activeSession: s.activeSession || null, selectedSession: s.selectedSession || 'auto', effectiveSession: effSid,
    live: extra.liveRouting(lastForCow, { hostModel, lastExecution: s.lastExec }),
    paired: (() => { const e = vscode.extensions.getExtension('anthropic.claude-code'); return e ? { ok: true, version: (e.packageJSON && e.packageJSON.version) || '' } : { ok: false }; })(),
    projectName: (vscode.workspace.name || (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].name) || 'no folder'),
    score: extra.mooterScore(ctx),
    slashCmds: extra.SLASH_CMDS,
  });
}

async function newSession() {
  const ext = vscode.extensions.getExtension('anthropic.claude-code');
  if (ext) return void vscode.env.openExternal(vscode.Uri.parse('vscode://anthropic.claude-code/open'));
  const pick = await vscode.window.showInformationMessage('Claude Code extension not found.', 'Install Claude Code', 'Use terminal');
  if (pick === 'Install Claude Code') vscode.commands.executeCommand('workbench.extensions.search', 'anthropic.claude-code');
  if (pick === 'Use terminal') runInTerminal('claude', 'claude');
}

// ── LIVE PREVIEW · MP1 (additive, read-only) ────────────────────────────────────────────
// Tail-read the file-bus (last ~128KB max — never the whole file), mirroring data.js's
// readDecisions() / hook-collector.js's capFile() tail technique. Fail-soft: any error
// (missing dir, corrupted file, not-yet-armed bus) returns '' — the panel then renders the
// honest "nenhum evento ainda" empty state instead of throwing.
function readBusTail(busFile, maxBytes) {
  const cap = maxBytes || 128 * 1024;
  try {
    const st = fs.statSync(busFile);
    if (!st.isFile() || st.size === 0) return '';
    const start = Math.max(0, st.size - cap);
    const fd = fs.openSync(busFile, 'r');
    try {
      const buf = Buffer.alloc(st.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
}

// Assemble the payload the Live Preview panel renders PURELY from: the file-bus events
// (filtered to the active session — see detectActiveSid's heuristic doc in
// live-preview-view.js), and the Brain overlay (decisions.log + the EXISTING GPU-snapshot
// cache reader from mc-snapshot.js — reused, not reinvented). Never throws.
function livePreviewSnapshot() {
  try {
    const wsRoot = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri.fsPath) || process.cwd();
    const busFile = HC ? HC.eventsPath(wsRoot) : path.join(wsRoot, '_handoff', 'live-preview', 'events.jsonl');
    const raw = readBusTail(busFile, 128 * 1024);
    const events = LPV ? LPV.parseBusJsonl(raw, 500) : [];
    const sid = LPV ? LPV.detectActiveSid(events) : null;
    const scoped = LPV ? LPV.filterBySession(events, sid) : events;
    const decisions = data_.readDecisions(80);
    let gpu = null;
    try { if (MCSNAP) gpu = MCSNAP.readCache('gpu', MCSNAP.mooterCacheDir()); } catch { gpu = null; }
    const brain = LPV ? LPV.buildBrainData(decisions, sid, events, gpu) : null;
    return { events: scoped, sid, sidKnown: !!sid, brain };
  } catch {
    return { events: [], sid: null, sidKnown: false, brain: null };
  }
}

// ── LIVE PREVIEW · MP2 (App Stage) host-side plumbing ────────────────────────────────────
// The two side-effectful halves the PURE lp-stage.js is deliberately kept free of:
//   1. readStageConfigText — read the (small) dev-config files so lp-stage.parseConfigPort can
//      learn the configured port (e.g. landing's `next dev -H 127.0.0.1 -p 7819`).
//   2. probePorts — a fast TCP connect probe telling resolveStage() which candidate ports are
//      ACTUALLY listening. We do NOT spawn the dev server (it lives in the user's own terminal),
//      so probing is the honest substitute for "capture the port from stdout" (loop hole #6).
// Both are fully fail-soft: any error degrades to "nothing configured / nothing live", which
// resolveStage() then reports honestly as the degraded (Director's-Cut-only) state.
const STAGE_CONFIG_FILES = [
  ['landing', 'package.json'], ['landing', 'next.config.ts'], ['landing', 'next.config.js'], ['landing', 'next.config.mjs'],
  ['landing', 'vite.config.ts'], ['landing', 'vite.config.js'],
  ['package.json'], ['vite.config.ts'], ['vite.config.js'], ['next.config.ts'], ['next.config.js'], ['next.config.mjs'],
];
function readStageConfigText(wsRoot) {
  let out = '';
  for (const parts of STAGE_CONFIG_FILES) {
    try {
      const f = path.join(wsRoot, ...parts);
      const st = fs.statSync(f);
      if (st.isFile() && st.size > 0 && st.size < 64 * 1024) out += '\n' + fs.readFileSync(f, 'utf8');
    } catch { /* file absent — skip */ }
    if (out.length > 200 * 1024) break;
  }
  return out;
}
// Fast TCP connect probe (127.0.0.1:port). Resolves to the port when something answers within
// timeoutMs, else drops it. Never throws; probes the small candidate set in parallel.
function probePorts(ports, timeoutMs) {
  let net; try { net = require('net'); } catch { return Promise.resolve([]); }
  const uniq = Array.from(new Set((Array.isArray(ports) ? ports : []).filter((p) => Number.isInteger(p) && p >= 1 && p <= 65535)));
  const to = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : 500;
  return Promise.all(uniq.map((p) => new Promise((resolve) => {
    let done = false;
    const sock = new net.Socket();
    const finish = (ok) => { if (done) return; done = true; try { sock.destroy(); } catch { /* noop */ } resolve(ok ? p : null); };
    try {
      sock.setTimeout(to);
      sock.once('connect', () => finish(true));
      sock.once('timeout', () => finish(false));
      sock.once('error', () => finish(false));
      sock.connect(p, '127.0.0.1');
    } catch { finish(false); }
  }))).then((a) => a.filter((x) => x != null));
}

// Singleton WebviewPanel (editor area, ViewColumn.Beside — MP2 hosts the App Stage <iframe>
// that needs the width). Read-only over the runtime: only ever posts livePreviewSnapshot()
// to the webview; never writes user code or routing state. retainContextWhenHidden keeps the
// stream/scroll position across tab switches.
class LivePreviewPanel {
  constructor(panel) {
    this.panel = panel;
    this.timer = null;       // fast bus/Brain poll
    this.stageTimer = null;  // slower App Stage re-probe (TCP sweep)
    this.watcher = null;
    this.overrideUrl = null; // user-pasted URL (already origin-validated) or null = auto-detect
    this.urlError = null;    // transient origin-lock rejection note (its OWN channel — never
                             // folded into stage.reason, so it can't mislabel a stale/degraded state)
    this.stage = null;       // last resolved App Stage state (lp-stage.resolveStage output)
    this.lastState = null;   // MP4: last {path, scrollY} the dev-only tap reported (for a
                             // state-preserving reload — the webview restores it after a reload)
    this.routes = null;      // MP3.3: cached list of the site's navigable routes (landing/app/**/page.*)
    this._detecting = false;
    // Shared secret stamped into the webview HTML and onto every host→webview message. The
    // App Stage <iframe> is a DIFFERENT origin (http://localhost) and cannot read this token
    // (same-origin policy), so it cannot forge a message the webview will trust — closing the
    // origin-lock hole where framed content could postMessage the panel to re-point the iframe.
    this.token = 'lp' + String(Math.random()).slice(2) + String(Math.random()).slice(2);
    this._wire();
  }
  static createOrReveal() {
    if (LivePreviewPanel.current) {
      LivePreviewPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return LivePreviewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'mooterLivePreview', 'Mooter — Live Preview 🎬', vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true });
    LivePreviewPanel.current = new LivePreviewPanel(panel);
    return LivePreviewPanel.current;
  }
  _wsRoot() {
    return (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri.fsPath) || process.cwd();
  }
  _post() {
    try {
      const s = livePreviewSnapshot();
      s.stage = this.stage;              // MP2: App Stage state alongside the bus/Brain snapshot
      s.stageError = this.urlError || null; // rejected-paste feedback on its own channel
      s.routes = this.routes || this._discoverRoutes(); // MP3.3: routes for the "known routes" picker
      // __t authenticates this as a HOST message (see this.token) — the framed iframe can't forge it.
      this.panel.webview.postMessage({ type: 'lp-snapshot', __t: this.token, s });
    } catch { /* best-effort */ }
  }
  // MP3.3 — discover the site's navigable routes by walking landing/app for Next page files, then
  // mapping them via the PURE lp-stage.discoverRoutes (route groups stripped, dynamic routes dropped).
  // Cached (routes rarely change); a lp-redetect refreshes it. Bounded + fail-soft: any fs error →
  // the last list (or []). Read-only — never writes into the workspace.
  _discoverRoutes() {
    try {
      if (!LPS) return this.routes || [];
      const base = path.join(this._wsRoot(), 'landing', 'app');
      if (!fs.existsSync(base)) { this.routes = this.routes || []; return this.routes; }
      const rels = [];
      const walk = (dir, depth) => {
        if (depth > 8 || rels.length > 500) return;
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          if (e.name === 'node_modules' || e.name.charAt(0) === '.') continue;
          const abs = path.join(dir, e.name);
          if (e.isDirectory()) walk(abs, depth + 1);
          else if (/^page\.(tsx|ts|jsx|js|mjs)$/.test(e.name)) rels.push(path.relative(base, abs).split(path.sep).join('/'));
        }
      };
      walk(base, 0);
      this.routes = LPS.discoverRoutes(rels);
      return this.routes;
    } catch { return this.routes || []; }
  }
  // App Stage detection: read config → probe candidate ports → resolveStage() (all fail-soft).
  // The last-good URL stays sticky so a transient server restart never tears down the iframe
  // (native HMR reconnects on its own). Never throws; on any error the previous stage is kept.
  async _detectStage() {
    if (this._detecting || !LPS) return;
    this._detecting = true;
    try {
      const wsRoot = this._wsRoot();
      const configPort = LPS.parseConfigPort(readStageConfigText(wsRoot));
      const stickyUrl = (this.stage && this.stage.url) ? this.stage.url : null;
      const probeList = LPS.candidatePortList({ overrideUrl: this.overrideUrl, stickyUrl, configPort });
      const livePorts = await probePorts(probeList, 500);
      const next = LPS.resolveStage({ overrideUrl: this.overrideUrl, stickyUrl, configPort, livePorts });
      // urlError travels on s.stageError (see _post), NOT on next.reason — folding it in here
      // used to mislabel an unrelated stale/degraded state as "URL inválido".
      this.stage = next;
    } catch { /* keep last stage */ }
    finally { this._detecting = false; }
    this._post();
  }
  // Webview → host messages. SECURITY (loop hole #3): a pasted URL is ONLY ever accepted after
  // lp-stage.normalizeStageUrl() confirms it is http(s)://localhost:<port>; nothing is ever
  // eval'd/executed and no non-localhost origin can enter the stage.
  _onMessage(m) {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'lp-set-url') {
      const n = LPS ? LPS.normalizeStageUrl(m.url) : null;
      if (n) { this.overrideUrl = n.url; this.urlError = null; }
      else { this.urlError = 'URL inválido — só http://localhost:<porta> é aceite'; }
      this._detectStage();
      return;
    }
    if (m.type === 'lp-clear-url') { this.overrideUrl = null; this.urlError = null; this._detectStage(); return; }
    if (m.type === 'lp-redetect') { this.routes = null; this._detectStage(); return; } // also refresh routes
    // MP3.3 — address bar / route picker. resolveNavTarget keeps the localhost origin lock in ONE
    // place: a same-origin path navigates the frame (lp-goto, no re-point); a different localhost
    // origin re-points the stage through the existing override lock; anything else is refused.
    if (m.type === 'lp-nav-input') {
      const origin = (this.stage && this.stage.url) ? this.stage.url : null;
      const r = LPS ? LPS.resolveNavTarget(origin, m.input) : { kind: 'invalid' };
      if (r.kind === 'path') {
        this.urlError = null;
        this.panel.webview.postMessage({ type: 'lp-goto', __t: this.token, url: r.url });
      } else if (r.kind === 'origin') {
        this.overrideUrl = r.url; this.urlError = null; this._detectStage(); // r.url is already normalized
      } else {
        this.urlError = 'Rota/URL inválido — usa /rota ou http://localhost:<porta>'; this._post();
      }
      return;
    }
    // ── MP4 (Honest Diagnostics) host commands. Each is a REAL action (honest-controls: no dead
    //    buttons). The strip/accumulation itself lives webview-side; these are the two actions that
    //    genuinely need a VS Code API (open a file, write the clipboard) + the state mirror.
    if (m.type === 'lp-open-file') { this._openErrorFile(m); return; }
    if (m.type === 'lp-open-source') { this._openSourceFile(m); return; } // MP5.1 click-to-code
    if (m.type === 'lp-edit') { this._applyEdit(m); return; } // MP5.1 deterministic $0 edit
    if (m.type === 'lp-delete') { this._deleteNode(m); return; } // MP5.2a deterministic $0 delete (preview → diff, apply → write)
    if (m.type === 'lp-copy-error') { this._copyErrorToClipboard(m); return; }
    if (m.type === 'lp-state') {
      // Mirror the tap's last route+scroll so a future reload (or panel re-open) can restore it.
      const p = (typeof m.path === 'string') ? m.path.slice(0, 2048) : null;
      const y = (typeof m.scrollY === 'number' && isFinite(m.scrollY)) ? m.scrollY : 0;
      if (p != null) this.lastState = { path: p, scrollY: y };
      return;
    }
  }
  // Resolve a tap error's file→a real workspace file and reveal the line. MP5's first brick: a
  // best-effort resolver (lp-diagnostics.resolveErrorFileCandidates → fs.existsSync under the
  // workspace roots). Honest: when nothing resolves we say so instead of opening the wrong file.
  async _openErrorFile(m) {
    try {
      if (!LPD) return;
      const cands = LPD.resolveErrorFileCandidates(m && m.file);
      const line = (m && Number.isInteger(m.line) && m.line > 0) ? m.line : null;
      // Containment guard (path traversal defence-in-depth): `path.relative` avoids the sibling-dir
      // trap of a raw prefix check (`C:\ws` must NOT accept `C:\ws-evil`), and realpath re-checks
      // after resolving symlinks so a workspace symlink cannot point the open outside the workspace.
      const contained = (root, abs) => { const r = path.relative(root, abs); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
      const roots = [this._wsRoot()];
      let hit = null;
      for (const root of roots) {
        for (const rel of cands) {
          const abs = path.join(root, rel);
          if (!contained(root, abs)) continue;
          try {
            if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
              const real = fs.realpathSync(abs);
              const rootReal = fs.realpathSync(root);
              if (!contained(rootReal, real)) continue; // symlink escaped the workspace — refuse
              hit = real; break;
            }
          } catch { /* skip */ }
        }
        if (hit) break;
      }
      if (!hit) {
        vscode.window.showWarningMessage('Live Preview: não encontrei o ficheiro do erro no workspace' + (m && m.file ? (' (' + String(m.file).slice(0, 120) + ')') : '') + '. Abre a consola do dev server.');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(hit));
      const opts = {};
      if (line != null) {
        const pos = new vscode.Position(line - 1, 0);
        opts.selection = new vscode.Range(pos, pos);
      }
      await vscode.window.showTextDocument(doc, opts);
    } catch { /* best-effort — never crash the panel over an open */ }
  }
  // MP5.1 click-to-code — open the SELECTED element's source at file:line:col. The value comes from
  // data-insp-path (code-inspector stamps an ABSOLUTE path in dev). Accept it ONLY if it resolves to
  // a real file INSIDE the workspace: same path.relative + realpath/symlink containment guard as
  // _openErrorFile (an open can never escape the workspace), then reveal line:col. Honest fallback.
  async _openSourceFile(m) {
    try {
      const raw = (m && typeof m.file === 'string') ? m.file.trim() : '';
      if (!raw) return;
      const line = (m && Number.isInteger(m.line) && m.line > 0) ? m.line : null;
      const col = (m && Number.isInteger(m.col) && m.col > 0) ? m.col : null;
      const contained = (root, abs) => { const r = path.relative(root, abs); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
      const root = this._wsRoot();
      const abs = path.isAbsolute(raw) ? path.normalize(raw) : path.join(root, raw);
      let real = null;
      try {
        if (contained(root, abs) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          const r = fs.realpathSync(abs);
          if (contained(fs.realpathSync(root), r)) real = r; // symlink must not escape the workspace
        }
      } catch { /* fall through to the honest warning */ }
      if (!real) {
        vscode.window.showWarningMessage('Live Preview: não abri a seleção — o ficheiro não está no workspace (' + String(raw).slice(0, 120) + ').');
        return;
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(real));
      const opts = {};
      if (line != null) { const pos = new vscode.Position(line - 1, col != null ? col - 1 : 0); opts.selection = new vscode.Range(pos, pos); }
      await vscode.window.showTextDocument(doc, opts);
    } catch { /* best-effort — never crash the panel over an open */ }
  }
  // MP5.1 deterministic $0 edit — resolve the selected file (same workspace-containment guard as the
  // opens), run the byte-splice engine (ZERO LLM), and write it back so Next's HMR repaints the frame.
  // Honest result: every refusal/failure is reported to the panel with its exact reason (no silent
  // no-op, no fabricated success). The write is a single full-source writeFileSync — atomic enough,
  // and the diff is minimal (only the edited span changed), so an editor/git undo is a clean rollback.
  //
  // LP-4 §0 — SYMMETRIC staleness fence (audit P1-2 / FIX-MP-2): text/class edits get the exact
  // sha256 preview→apply hash-guard the delete has had since 5.2a. Preview computes the byte-splice
  // diff and stamps the source hash; apply re-reads the disk and REFUSES to write when the content
  // moved ('file-changed' → a REGENERATED stale-flagged preview for re-approval). FAIL-CLOSED: an
  // edit can never land on a line:col that drifted between the approved diff and the click.
  async _applyEdit(m) {
    const preview = !!(m && m.preview);
    const fail = (reason) => {
      if (preview) this._postEditDiff({ ok: false, reason: String(reason || 'refused') });
      else this._postEditResult(false, reason);
    };
    try {
      const raw = (m && typeof m.file === 'string') ? m.file.trim() : '';
      const edit = (m && m.edit && typeof m.edit === 'object') ? m.edit : null;
      if (!raw || !edit) { fail('bad-request'); return; }
      if (!LEA) { fail('engine-unavailable'); return; }
      const contained = (root, abs) => { const r = path.relative(root, abs); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
      const root = this._wsRoot();
      const abs = path.isAbsolute(raw) ? path.normalize(raw) : path.join(root, raw);
      let real = null;
      try {
        if (contained(root, abs) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          const r = fs.realpathSync(abs);
          if (contained(fs.realpathSync(root), r)) real = r;
        }
      } catch { /* fall through to the honest result */ }
      if (!real) { fail('file-not-in-workspace'); return; }
      const source = fs.readFileSync(real, 'utf8');
      // Same fence order as _deleteNode: hash first, missing echo = bad-request, THEN the engine —
      // so a broken engine still reports its own honest reason (parser-unavailable etc.).
      const h = crypto.createHash('sha256').update(source, 'utf8').digest('hex');
      if (!preview && (typeof m.h !== 'string' || !m.h)) { fail('bad-request'); return; }
      const stale = !preview && m.h !== h; // apply against a moved file → NEVER write; re-preview
      const res = LEA.applyDeterministicEdit(source, { line: m.line, col: m.col, tag: m.tag }, edit);
      if (!res.ok) { fail(leaFailReason(res)); return; }
      if (!res.changed) { this._postEditResult(true, 'no-op'); return; }
      if (preview || stale) {
        const d = LEA.diffRemovedLines(source, res.code);
        this._postEditDiff({ ok: true, stale, kind: res.kind, start: d.start, removed: d.removed, added: d.added, h, abs: real });
        return;
      }
      fs.writeFileSync(real, res.code, 'utf8');
      this._postEditResult(true, 'applied');
    } catch { fail('error'); }
  }
  _postEditResult(ok, reason) {
    try { this.panel.webview.postMessage({ type: 'lp-edit-result', __t: this.token, ok: !!ok, reason: String(reason || '') }); } catch { /* best-effort */ }
  }
  _postEditDiff(payload) {
    try { this.panel.webview.postMessage(Object.assign({ type: 'lp-edit-diff', __t: this.token }, payload)); } catch { /* best-effort */ }
  }
  // MP5.2a deterministic $0 delete — same containment guard as _applyEdit, but TWO-PHASE and
  // stateless: preview computes the exact removed/added lines for the panel's mini-diff; apply
  // re-reads + re-computes from disk at click time (no held state → no preview/apply divergence)
  // and only then writes. ZERO LLM in either phase; every refusal carries its honest reason
  // (deleteNode itself refuses a delete that would break the parse).
  async _deleteNode(m) {
    const preview = !!(m && m.preview);
    const fail = (reason) => {
      if (preview) this._postDeleteDiff({ ok: false, reason: String(reason || 'refused') });
      else this._postEditResult(false, reason);
    };
    try {
      const raw = (m && typeof m.file === 'string') ? m.file.trim() : '';
      if (!raw) { fail('bad-request'); return; }
      if (!LEA || typeof LEA.deleteNode !== 'function') { fail('engine-unavailable'); return; }
      const contained = (root, abs) => { const r = path.relative(root, abs); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
      const root = this._wsRoot();
      const abs = path.isAbsolute(raw) ? path.normalize(raw) : path.join(root, raw);
      let real = null;
      try {
        if (contained(root, abs) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          const r = fs.realpathSync(abs);
          if (contained(fs.realpathSync(root), r)) real = r;
        }
      } catch { /* fall through to the honest result */ }
      if (!real) { fail('file-not-in-workspace'); return; }
      const source = fs.readFileSync(real, 'utf8');
      // Staleness fence between the two phases: preview stamps a hash of the source it diffed;
      // apply refuses unless the disk still matches EXACTLY that content. Without it, an edit (or
      // HMR write) landing between preview and apply could make locate() resolve a DIFFERENT node
      // than the one the user approved in the mini-diff — the delete must be the diff, always.
      const h = crypto.createHash('sha256').update(source, 'utf8').digest('hex');
      if (!preview && (typeof m.h !== 'string' || !m.h)) { fail('bad-request'); return; }
      const stale = !preview && m.h !== h; // apply against a moved file → NEVER write; re-preview
      const res = LEA.deleteNode(source, { line: m.line, col: m.col, tag: m.tag });
      if (!res.ok) { fail(leaFailReason(res)); return; }
      if (preview || stale) {
        // Fail-closed recovery on stale: the diff the user approved no longer matches the disk,
        // so nothing is written — instead the preview is REGENERATED from the disk as it is now,
        // flagged stale, and the user re-approves what would really go.
        const d = LEA.diffRemovedLines(source, res.code);
        const inExpr = typeof LEA.isInsideExpression === 'function'
          ? LEA.isInsideExpression(source, { line: m.line, col: m.col, tag: m.tag }) : false;
        this._postDeleteDiff({ ok: true, stale, start: d.start, removed: d.removed, added: d.added, h, inExpr });
        return;
      }
      fs.writeFileSync(real, res.code, 'utf8');
      this._postEditResult(true, 'deleted');
    } catch { fail('error'); }
  }
  _postDeleteDiff(payload) {
    try { this.panel.webview.postMessage(Object.assign({ type: 'lp-delete-diff', __t: this.token }, payload)); } catch { /* best-effort */ }
  }
  // Format the error (message + location + stack) and put it on the clipboard, ready to paste
  // into the active Claude Code session. MVP of "enviar à sessão CC" (V2: inject via the cockpit
  // seam). Honest toast confirms exactly what happened.
  async _copyErrorToClipboard(m) {
    try {
      if (!LPD) return;
      const txt = LPD.formatForClipboard(m && m.error ? m.error : m);
      await vscode.env.clipboard.writeText(txt);
      vscode.window.showInformationMessage('Live Preview: erro copiado — cola no Claude Code (Ctrl/Cmd+V).');
    } catch {
      // Honest-controls: never let the button silently no-op — say the copy failed.
      try { vscode.window.showWarningMessage('Live Preview: não consegui copiar o erro para o clipboard.'); } catch { /* noop */ }
    }
  }
  _wire() {
    this.panel.webview.html = getLivePreviewHtml(this.token);
    this._post();
    this._detectStage();
    // Visibility-aware polling (mirrors data.js's pollIntervalMs idea) — only tick while shown.
    this.timer = setInterval(() => { if (this.panel.visible) this._post(); }, data_.pollIntervalMs(true));
    // App Stage re-probe on a slower cadence (a TCP sweep, never on the render path).
    this.stageTimer = setInterval(() => { if (this.panel.visible) this._detectStage(); }, 4000);
    this.panel.onDidChangeViewState(() => { if (this.panel.visible) { this._post(); this._detectStage(); } });
    this.panel.webview.onDidReceiveMessage((m) => this._onMessage(m));
    // Best-effort fs.watch on the bus directory for near-live updates between polls — a missed
    // event (dir not created yet, watcher error) is still covered by the poll above, so this
    // never blocks or throws. Read-only: never creates the directory itself.
    try {
      const busFile = HC ? HC.eventsPath(this._wsRoot()) : path.join(this._wsRoot(), '_handoff', 'live-preview', 'events.jsonl');
      this.watcher = fs.watch(path.dirname(busFile), { persistent: false }, (_e, f) => {
        if (f === 'events.jsonl' && this.panel.visible) this._post();
      });
    } catch { this.watcher = null; }
    this.panel.onDidDispose(() => {
      if (this.timer) clearInterval(this.timer);
      if (this.stageTimer) clearInterval(this.stageTimer);
      try { if (this.watcher) this.watcher.close(); } catch { /* best-effort */ }
      LivePreviewPanel.current = null;
    });
  }
}
LivePreviewPanel.current = null;

// getLivePreviewHtml(token) — MP2 App Stage. Same nonce'd script-src / default-src 'none' shape
// as the cockpit's getHtml(), PLUS `frame-src {http,https}://{localhost,127.0.0.1}:*` so the App
// Stage <iframe> may embed the local dev server (red-team loop hole #2 mitigation (a); mitigation
// (b) — dropping the landing dev X-Frame-Options — lives in landing/next.config.ts). The CSP host
// set is kept EXACTLY equal to what lp-stage.normalizeStageUrl() accepts, so a validated URL can
// always render (no "green server up" over a CSP-blocked blank frame). Serialises
// renderDirectorsCut/renderBrain/renderStageStatus via fn.toString() exactly like the cockpit
// injects row-renderer.js's renderRow — those three ARE the concat-only contract; this outer
// template literal is the host template (free to use normal JS).
//
// SECURITY: the message listener accepts ONLY host messages carrying the shared secret `token`
// (HOST_TOKEN). The App Stage <iframe> is a separate origin and cannot read HOST_TOKEN, so framed
// content cannot postMessage the panel into re-pointing the iframe — the host stays the sole
// authority over what is framed.
//
// LAYOUT: a persistent left <iframe> (the App Stage — its src is set ONCE per URL change so a
// bus/Brain poll never reloads it and native HMR survives) + a right rail (Brain + Director's
// Cut, innerHTML-refreshed each poll). The iframe is deliberately NOT sandboxed: it frames the
// user's OWN trusted dev server and needs same-origin scripts + websockets for HMR to work.
function getLivePreviewHtml(token) {
  const nonce = String(Math.random()).slice(2);
  const hostToken = JSON.stringify(String(token == null ? '' : token));
  const renderDirectorsCutSrc = LPV ? LPV.renderDirectorsCut.toString() : 'function renderDirectorsCut(){return "";}';
  const renderBrainSrc = LPV ? LPV.renderBrain.toString() : 'function renderBrain(){return "";}';
  const renderStageStatusSrc = LPS ? LPS.renderStageStatus.toString() : 'function renderStageStatus(){return "";}';
  const renderErrorStripSrc = LPD ? LPD.renderErrorStrip.toString() : 'function renderErrorStrip(){return "";}';
  // MP4-polish — the honest-severity predicates, serialised so the webview's lpIngest classifies
  // with the SAME source of truth as the pure decision layer (no JS drift between them).
  const isSelfNoiseSrc = LPD ? LPD.isLivePreviewSelfNoise.toString() : 'function isLivePreviewSelfNoise(){return false;}';
  const isBenignCssSrc = LPD ? LPD.isBenignCssWarning.toString() : 'function isBenignCssWarning(){return false;}';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:*;">
<style>
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  html,body{height:100%}
  body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:0}
  #lp-root{display:flex;flex-direction:row;height:100vh;min-height:0}
  #lp-stagewrap{flex:1 1 62%;display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid var(--vscode-widget-border)}
  #lp-side{flex:0 0 340px;max-width:46%;overflow:auto;padding:12px 14px;min-width:0}
  #lp-toolbar{display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid var(--vscode-widget-border);background:var(--vscode-editorWidget-background);flex-wrap:wrap}
  .lp-status{flex:1 1 auto;min-width:120px;display:flex;align-items:center;gap:7px;font-size:12px;overflow:hidden}
  .lp-status .lps-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #lp-controls{display:flex;gap:5px;align-items:center;flex:none}
  #lp-url{width:190px;max-width:40vw;font:12px var(--vscode-font-family);color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-widget-border));border-radius:5px;padding:3px 7px}
  #lp-controls button{font:12px var(--vscode-font-family);color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:5px;padding:3px 9px;cursor:pointer}
  #lp-controls button:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}
  #lp-back,#lp-fwd{padding:3px 7px;font-weight:700}
  #lp-routes{font:12px var(--vscode-font-family);color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-widget-border));border-radius:5px;padding:3px 5px;max-width:24vw;cursor:pointer}
  #lp-controls button:focus-visible,#lp-url:focus-visible,#lp-routes:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  /* MP5.1 — select-to-edit: pressed 🎯 toggle + the selection panel in the side rail. */
  #lp-select-btn.lp-on{background:var(--vscode-charts-red,#E8888A);color:#0B0A09;border-color:transparent;font-weight:700}
  #lp-sel{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:10px 12px;margin-bottom:10px}
  #lp-sel .lp-sel-hd{font-weight:700;margin-bottom:4px}
  #lp-sel .lp-sel-loc{font-family:var(--vscode-editor-font-family,monospace);font-size:11px;opacity:.85;word-break:break-all}
  #lp-sel .lp-sel-txt{font-size:11.5px;opacity:.75;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #lp-sel .lp-sel-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;align-items:center}
  #lp-sel .lp-sel-btn{font:11.5px var(--vscode-font-family);color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:5px;padding:3px 9px;cursor:pointer}
  #lp-sel .lp-sel-btn:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}
  #lp-sel .lp-sel-btn:focus-visible,#lp-select-btn:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  /* MP5.2a — breadcrumb chips (root→leaf) + honest shared-component warning. */
  #lp-sel .lp-crumbs{display:flex;align-items:center;gap:3px;flex-wrap:wrap;margin:7px 0 2px}
  #lp-sel .lp-crumb{font:10.5px var(--vscode-editor-font-family,monospace);color:var(--vscode-foreground);background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:999px;padding:1px 8px;cursor:pointer}
  #lp-sel .lp-crumb:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}
  #lp-sel .lp-crumb.on{background:var(--vscode-charts-red,#E8888A);color:#0B0A09;border-color:transparent;font-weight:700;cursor:default}
  #lp-sel .lp-crumb:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  #lp-sel .lp-crumb-sep{opacity:.55;font-size:10.5px}
  #lp-sel .lp-sel-warn{font-size:11px;line-height:1.45;margin-top:7px;padding:6px 8px;border-radius:5px;color:var(--vscode-inputValidation-warningForeground,var(--vscode-charts-yellow,#E5C07B));background:var(--vscode-inputValidation-warningBackground,rgba(229,192,123,.12));border:1px solid var(--vscode-inputValidation-warningBorder,rgba(229,192,123,.4))}
  #lp-sel .lp-ed-l{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;opacity:.7;margin:9px 0 3px}
  #lp-sel .lp-ed-row{display:flex;gap:6px;align-items:center}
  #lp-sel .lp-ed-in{flex:1 1 auto;min-width:60px;font:12px var(--vscode-font-family);color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-widget-border));border-radius:5px;padding:3px 7px}
  #lp-sel .lp-ed-in:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  #lp-sel .lp-ed-msg{font-size:11px;margin-top:8px;min-height:14px}
  #lp-sel .lp-ed-ok{color:var(--vscode-charts-green,#4CAF6A)}
  #lp-sel .lp-ed-no{color:var(--vscode-inputValidation-warningForeground,var(--vscode-charts-yellow,#E5C07B))}
  #lp-sel .lp-ed-pending{opacity:.7}
  /* MP5.2a — delete mini-diff: exactly the lines that would go, before anything is written. */
  #lp-sel .lp-diff{margin-top:9px;border:1px solid var(--vscode-widget-border);border-radius:7px;background:var(--vscode-textCodeBlock-background,var(--vscode-input-background));padding:7px 9px;overflow-x:auto}
  #lp-sel .lp-diff-hd{font-size:10.5px;opacity:.8;margin-bottom:5px}
  #lp-sel .lp-diff-l{font:11px var(--vscode-editor-font-family,monospace);white-space:pre;line-height:1.5}
  #lp-sel .lp-diff-rm{color:var(--vscode-errorForeground,#D9484B);background:var(--vscode-inputValidation-errorBackground,rgba(217,72,75,.10))}
  #lp-sel .lp-diff-ad{color:var(--vscode-charts-green,#4CAF6A)}
  /* MP5.1 — router-native model chip: honest $0 for deterministic edits + manual override. */
  #lp-sel .lp-chip{margin:9px 0 2px;padding:7px 9px;border:1px solid var(--vscode-widget-border);border-radius:7px;background:var(--vscode-input-background)}
  #lp-sel .lp-chip-hd{font-size:11.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  #lp-sel .lp-chip-0{color:var(--vscode-charts-green,#4CAF6A);font-weight:700}
  #lp-sel .lp-tiers{display:flex;gap:4px;flex-wrap:wrap;margin-top:7px}
  #lp-sel .lp-tier{font:10.5px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:999px;padding:2px 9px;cursor:pointer}
  #lp-sel .lp-tier.on{background:var(--vscode-charts-red,#E8888A);color:#0B0A09;border-color:transparent;font-weight:700}
  #lp-sel .lp-tier:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  #lp-sel .lp-chip-note{font-size:10.5px;opacity:.78;margin-top:6px;line-height:1.45}
  #lp-framewrap{position:relative;flex:1 1 auto;min-height:0}
  #lp-frame{width:100%;height:100%;border:0;background:#fff;display:block}
  .lp-degrade{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:var(--vscode-descriptionForeground)}
  .lp-degrade-in{max-width:440px}
  .lp-degrade-ico{font-size:34px;margin-bottom:8px;opacity:.85}
  .lp-degrade-t{font-weight:700;color:var(--vscode-foreground);margin-bottom:6px}
  .lp-degrade-r{font-size:12.5px;margin-bottom:10px}
  .lp-degrade-h{font-size:11.5px;opacity:.85;line-height:1.5}
  .lp-degrade-h code{background:var(--vscode-textCodeBlock-background,var(--vscode-input-background));padding:1px 5px;border-radius:4px}
  .lps-dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block;background:var(--vscode-descriptionForeground)}
  .lps-on{background:var(--vscode-charts-green,#4CAF6A)}
  .lps-off{background:var(--vscode-descriptionForeground)}
  .lps-stale{background:var(--vscode-charts-yellow,#E5C07B)}
  .lps-wait{background:var(--vscode-charts-blue,#5A9BD4)}
  #lp-error{flex-basis:100%;order:9;color:var(--vscode-inputValidation-errorForeground,var(--vscode-errorForeground,#D9484B));font-size:11.5px;padding:1px 2px}
  /* MP4 — Honest Diagnostics strip. Sits BETWEEN the toolbar and the iframe; hidden when 0 errors. */
  #lp-diag{display:none;flex-direction:column;border-bottom:1px solid var(--vscode-widget-border);background:var(--vscode-editorWidget-background);font-size:12px;max-height:34%;overflow:auto}
  #lp-diag.lpd-show{display:flex}
  .lpd-head{display:flex;align-items:center;gap:8px;padding:4px 10px;border-bottom:1px solid var(--vscode-widget-border)}
  .lpd-sum{font-weight:700}
  .lpd-spacer{flex:1 1 auto}
  .lpd-x{font:11.5px var(--vscode-font-family);color:var(--vscode-foreground);background:transparent;border:1px solid var(--vscode-widget-border);border-radius:5px;padding:1px 8px;cursor:pointer}
  .lpd-x:hover{background:var(--vscode-list-hoverBackground)}
  .lpd-row{display:flex;align-items:center;gap:8px;padding:5px 10px;border-top:1px solid var(--vscode-widget-border);border-left:3px solid transparent}
  .lpd-row:first-child{border-top:0}
  .lpd-runtime,.lpd-promise{border-left-color:var(--vscode-inputValidation-errorBorder,#D9484B);background:var(--vscode-inputValidation-errorBackground,rgba(217,72,75,.10))}
  .lpd-build{border-left-color:var(--vscode-inputValidation-warningBorder,#E5C07B);background:var(--vscode-inputValidation-warningBackground,rgba(229,192,123,.12))}
  .lpd-warning{border-left-color:var(--vscode-charts-yellow,#E5C07B);background:var(--vscode-inputValidation-warningBackground,rgba(229,192,123,.10))}
  .lpd-console{border-left-color:var(--vscode-descriptionForeground);background:transparent}
  .lpd-badge{flex:none;font-weight:700;font-variant-numeric:tabular-nums}
  .lpd-msg{flex:1 1 auto;min-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .lpd-n{flex:none;opacity:.75;font-variant-numeric:tabular-nums}
  .lpd-loc{flex:none;font-family:var(--vscode-editor-font-family,monospace);opacity:.85;font-size:11px}
  .lpd-loc-nd{opacity:.5;font-style:italic}
  .lpd-acts{flex:none;display:flex;gap:5px}
  .lpd-btn{font:11.5px var(--vscode-font-family);color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:5px;padding:2px 8px;cursor:pointer}
  .lpd-btn:hover:not([disabled]){background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}
  .lpd-btn[disabled]{opacity:.45;cursor:not-allowed}
  .lpd-x:focus-visible,.lpd-btn:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  .lpbr,.lpdc{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:10px 12px;margin-bottom:10px}
  .lpbr-hd,.lpdc-hd{font-weight:700;margin-bottom:6px}
  .lpbr-row{margin:3px 0;font-size:12px}
  .lpbr-nd,.lpdc-nd{color:var(--vscode-descriptionForeground);font-style:italic}
  .lpbr-tier{font-size:10px;padding:1px 6px;border-radius:6px;background:var(--vscode-input-background)}
  .lpbr-mix{display:flex;height:7px;border-radius:4px;overflow:hidden;margin:6px 0;background:var(--vscode-input-background)}
  .lpbr-mix>span{display:block;min-width:2px}
  .lpdc-stream{max-height:52vh;overflow:auto;margin-top:6px}
  .lpdc-row{display:flex;gap:8px;align-items:baseline;padding:3px 0;border-top:1px solid var(--vscode-widget-border);font-size:12px}
  .lpdc-time{opacity:.6;font-variant-numeric:tabular-nums;flex:none}
  .lpdc-glyph{flex:none}
  .lpdc-body{flex:1;min-width:0;word-break:break-word}
  .lpdc-meta{opacity:.7;font-size:10.5px}
  @media (max-width:820px){
    #lp-root{flex-direction:column}
    #lp-stagewrap{flex:1 1 auto;border-right:0;border-bottom:1px solid var(--vscode-widget-border)}
    #lp-side{flex:0 0 auto;max-width:none;max-height:42vh}
  }
</style>
</head><body>
<div id="lp-root">
  <section id="lp-stagewrap">
    <div id="lp-toolbar">
      <div id="lp-status" class="lp-status"><span class="lps-dot lps-wait"></span><span class="lps-txt lps-nd">a detetar o dev server…</span></div>
      <div id="lp-controls">
        <button id="lp-back" title="Recuar no site" aria-label="Recuar">‹</button>
        <button id="lp-fwd" title="Avançar no site" aria-label="Avançar">›</button>
        <input id="lp-url" type="text" placeholder="/rota  ou  http://localhost:7819" aria-label="Rota ou URL do dev server (só localhost)" spellcheck="false" autocomplete="off" />
        <button id="lp-go" title="Ir para esta rota/URL no App Stage">Ir</button>
        <button id="lp-select-btn" title="Selecionar um elemento do preview para editar (Esc sai)" aria-label="Selecionar elemento para editar" aria-pressed="false">🎯</button>
        <select id="lp-routes" title="Rotas conhecidas do site" aria-label="Ir para uma rota do site"></select>
        <button id="lp-auto" title="Voltar à deteção automática do dev server">Auto</button>
        <button id="lp-redetect" title="Re-detetar o dev server" aria-label="Re-detetar">↻</button>
      </div>
      <div id="lp-error" role="alert" style="display:none"></div>
    </div>
    <div id="lp-diag" role="log" aria-label="Diagnóstico do preview (erros de runtime e build)"></div>
    <div id="lp-framewrap">
      <iframe id="lp-frame" title="Mooter App Stage — pré-visualização do dev server local" style="display:none"></iframe>
      <div id="lp-degrade" class="lp-degrade"></div>
    </div>
  </section>
  <aside id="lp-side">
    <div id="lp-sel" role="region" aria-label="Elemento selecionado" style="display:none"></div>
    <div id="lp-brain">a carregar…</div>
    <div id="lp-dc"></div>
  </aside>
</div>
<script nonce="${nonce}">
const vsapi=acquireVsCodeApi();
const HOST_TOKEN=${hostToken};
function esc(x){return String(x==null?'':x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
const renderDirectorsCut=${renderDirectorsCutSrc};
const renderBrain=${renderBrainSrc};
const renderStageStatus=${renderStageStatusSrc};
const renderErrorStrip=${renderErrorStripSrc};
const isLivePreviewSelfNoise=${isSelfNoiseSrc};
const isBenignCssWarning=${isBenignCssSrc};
function render(s){
  const brainEl=document.getElementById('lp-brain');
  const dcEl=document.getElementById('lp-dc');
  if(brainEl) brainEl.innerHTML = renderBrain(s && s.brain);
  if(dcEl) dcEl.innerHTML = renderDirectorsCut((s && s.events) || [], { sidKnown: !!(s && s.sidKnown) });
}
function applyError(err){
  const el=document.getElementById('lp-error');
  if(!el) return;
  if(err){ el.textContent=String(err); el.style.display='block'; }
  else { el.textContent=''; el.style.display='none'; }
}
let curSrc=null, curOrigin=null, lastDegradeHtml=null;
function applyStage(stage){
  const st=stage||null;
  const statusEl=document.getElementById('lp-status');
  if(statusEl) statusEl.innerHTML = renderStageStatus(st);
  const frame=document.getElementById('lp-frame');
  const degrade=document.getElementById('lp-degrade');
  const hasUrl=!!(st && st.url && !st.degraded);
  if(frame) frame.style.display = hasUrl ? 'block' : 'none';
  if(degrade){
    degrade.style.display = hasUrl ? 'none' : 'flex';
    if(!hasUrl){
      const reason = (st && st.reason) ? st.reason : 'nenhum dev server detetado';
      const html = '<div class="lp-degrade-in"><div class="lp-degrade-ico">🎬</div>'
        + '<div class="lp-degrade-t">App Stage à espera do dev server</div>'
        + '<div class="lp-degrade-r">' + esc(reason) + '</div>'
        + '<div class="lp-degrade-h">arranca o dev server (ex.: <code>cd landing &amp;&amp; npm run dev</code>) '
        + 'ou cola o URL na barra acima. Entretanto o Director’s Cut continua a fazer stream à direita.</div></div>';
      // Only rewrite when the copy changes — otherwise a poll wipes any text selection in the hint.
      if(html !== lastDegradeHtml){ lastDegradeHtml = html; degrade.innerHTML = html; }
    } else { lastDegradeHtml = null; }
  }
  // Only touch the iframe when the URL actually changes — preserves HMR/scroll across polls
  // (MP2 invariant, gate #5). A same-URL re-detect/poll never re-points the frame, so it never
  // reloads. When the URL DOES change we also recompute curOrigin — the exact origin the MP4
  // tap-message lock accepts — and drop stale errors that belonged to the previous origin.
  if(hasUrl && frame && curSrc !== st.url){
    curSrc = st.url;
    try { curOrigin = new URL(st.url).origin; } catch(e) { curOrigin = null; }
    lpClearErrors('all');
    lpState = null; lpPendingRestore = null; // a different URL is a different app — never restore the old route/scroll onto it
    frame.setAttribute('src', st.url);
  }
}
// ── MP3.3 multi-page navigation (webview side) ──────────────────────────────────────────────
// Navigate the frame WITHIN the current stage origin. curSrc stays = the stage root, so the App
// Stage poll (applyStage) never fights this move (its guard is curSrc !== st.url). The host already
// vetted the URL (resolveNavTarget origin lock) — we re-assert same-origin here as defence in depth.
function navFrameTo(url){
  const frame=document.getElementById('lp-frame');
  if(!frame||!curOrigin) return;
  let u; try{ u=new URL(url); }catch(e){ return; }
  if(u.origin!==curOrigin) return; // same-origin only — a re-point goes through the stage detector
  const p=u.pathname+u.search;
  lpState={ path:p, scrollY:0 }; lpPendingRestore=null; // the target IS the new route — no stale restore
  frame.setAttribute('src', url);
  reflectRoute(p);
}
// Reflect the framed site's current route in the address bar (when not being typed in) + the picker.
function reflectRoute(path){
  const p=path||'/';
  const inp=document.getElementById('lp-url');
  if(inp && document.activeElement!==inp) inp.value=p;
  const sel=document.getElementById('lp-routes');
  if(sel){ let has=false; for(let i=0;i<sel.options.length;i++){ if(sel.options[i].value===p){ has=true; break; } } sel.value=has?p:''; }
}
// Rebuild the routes picker ONLY when the set changes (never wipe a mid-poll selection). esc-safe.
let lpRoutesSig=null;
function populateRoutes(routes){
  const sel=document.getElementById('lp-routes');
  if(!sel) return;
  const list=Array.isArray(routes)?routes:[];
  const sig=list.join('|');
  if(sig===lpRoutesSig) return;
  lpRoutesSig=sig;
  const cur=sel.value;
  let html='<option value="">rotas…</option>';
  for(let i=0;i<list.length;i++){ const r=esc(list[i]); html+='<option value="'+r+'">'+r+'</option>'; }
  sel.innerHTML=html;
  if(cur){ for(let i=0;i<sel.options.length;i++){ if(sel.options[i].value===cur){ sel.value=cur; break; } } }
}
// Back/forward drive the framed site's own history via the tap (cross-origin: the parent cannot call
// frame.contentWindow.history directly). Origin-targeted postMessage, never '*'.
function frameHistory(dir){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin){ try{ w.postMessage({ type:'lp-history', dir }, curOrigin); }catch(e){} }
}
// ── MP4 Honest Diagnostics (webview side) ──────────────────────────────────────────────────
// The App Stage <iframe> is cross-origin, so the dev-only tap inside the landing relays its
// captured errors here via window.parent.postMessage. We accumulate + render the honest strip
// locally ($0, no host round-trip per console.error); only the two real actions (open a file,
// copy to the CC clipboard) and the state mirror go to the host.
let lpErrors=[]; let lpExpanded=false;
function lpErrKey(e){ return String(e.kind||'runtime')+'|'+String(e.message||'')+'|'+String(e.file||'')+'|'+String(e.line==null?'':e.line); }
function lpRenderStrip(){
  const el=document.getElementById('lp-diag');
  if(!el) return;
  const html=renderErrorStrip({ errors: lpErrors, expanded: lpExpanded });
  if(html){ el.innerHTML=html; el.classList.add('lpd-show'); }
  else { el.innerHTML=''; el.classList.remove('lpd-show'); lpExpanded=false; }
}
function lpIngest(raw){
  // Mirror lp-diagnostics.normalizeTapError's contract (clamped, fail-soft) then group ×N.
  const o=(raw && typeof raw==='object')?raw:{};
  const msg0=String(o.message==null?'':o.message);
  // MP4-polish: drop the Live Preview highlight's OWN shadow-DOM noise (:host all:initial) — it is
  // never the app's problem, so it must not light the strip (not even amber).
  if(isLivePreviewSelfNoise(msg0)) return;
  let kind=(o.kind==='build'||o.kind==='console'||o.kind==='promise'||o.kind==='warning')?o.kind:'runtime';
  const message=(msg0.slice(0,2000).trim())||'(erro sem mensagem)';
  // A benign CSS parse warning is a styling nit, not a runtime error → amber warning, never red.
  if((kind==='runtime'||kind==='console') && isBenignCssWarning(message)) kind='warning';
  const li=parseInt(o.line,10), co=parseInt(o.col,10);
  const e={
    kind, message,
    file:String(o.file==null?'':o.file).slice(0,1024).trim(),
    line:(Number.isInteger(li)&&li>0)?li:null, col:(Number.isInteger(co)&&co>0)?co:null,
    stack:String(o.stack==null?'':o.stack).slice(0,8000),
    ts:(typeof o.ts==='number'&&isFinite(o.ts))?o.ts:null, count:1,
  };
  const k=lpErrKey(e);
  const idx=lpErrors.findIndex((x)=>lpErrKey(x)===k);
  if(idx!==-1){ const prev=lpErrors[idx]; lpErrors.splice(idx,1); e.count=(prev.count||1)+1; e.stack=e.stack||prev.stack; e.ts=e.ts!=null?e.ts:prev.ts; }
  lpErrors.unshift(e);
  if(lpErrors.length>50) lpErrors=lpErrors.slice(0,50);
  lpRenderStrip();
}
function lpClearErrors(kind){
  if(!kind||kind==='all') lpErrors=[]; else lpErrors=lpErrors.filter((e)=>e && e.kind!==kind);
  lpRenderStrip();
}
// Delegated, CSP-safe click handler for the strip buttons — reads data-act/data-idx, looks the
// full error (incl. stack) up in lpErrors, and dispatches a REAL action to the host.
const diagEl=document.getElementById('lp-diag');
if(diagEl) diagEl.addEventListener('click',(ev)=>{
  const btn=ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
  if(!btn) return;
  const act=btn.getAttribute('data-act');
  if(act==='dismiss'){ lpClearErrors('all'); return; }
  if(act==='toggle'){ lpExpanded=!lpExpanded; lpRenderStrip(); return; }
  const idx=parseInt(btn.getAttribute('data-idx'),10);
  const e=(Number.isInteger(idx)&&idx>=0)?lpErrors[idx]:null;
  if(!e) return;
  if(act==='open') vsapi.postMessage({ type:'lp-open-file', file:e.file, line:e.line });
  else if(act==='copy') vsapi.postMessage({ type:'lp-copy-error', error:{ kind:e.kind, message:e.message, file:e.file, line:e.line, col:e.col, stack:e.stack } });
});
// State-preserving reload: keep the tap's last {path, scrollY}; after the iframe reloads (its
// load event, or a tap 'lp-ready' handshake — whichever wins the race) send it back so the route
// and scroll are restored. Origin-targeted postMessage (never '*').
let lpState=null, lpPendingRestore=null;
function lpSendRestore(){
  const f=document.getElementById('lp-frame');
  const w=f && f.contentWindow;
  const s=lpPendingRestore||lpState;
  if(!w || !s || !curOrigin) return;
  try{ w.postMessage({ type:'lp-restore', path:s.path, scrollY:s.scrollY }, curOrigin); }catch(e){}
}
(function(){ const f=document.getElementById('lp-frame'); if(f) f.addEventListener('load',()=>{
  // Snapshot the pre-reload state so the fresh page's first lp-state can't clobber the restore
  // target before the restore is delivered (honest-controls: the scroll must actually return).
  if(lpState){ lpPendingRestore=lpState; setTimeout(()=>{ lpPendingRestore=null; }, 1500); }
  lpSendRestore();
}); })();
// ── MP5.1 Select-to-edit (webview side). The 🎯 toolbar button toggles the dev tap's select mode
// (origin-targeted postMessage into the frame — the frame is cross-origin, so never '*'). When the
// tap posts back an lp-select we render the selection panel in the side rail with the source location
// + a click-to-code action; the deterministic edit + model chip (pieces 4–5) hang off this panel.
let lpSelection=null, lpSelectOn=false, lpTier='local';
// MP5.2a — the delete flow's target is CAPTURED at preview time (not read from the mutable
// lpSelection at apply time), so the node deleted is always the node whose diff was approved.
let lpDeleteTarget=null;
// LP-4 §0 — the edit flow gets the same capture: target+edit are frozen at preview time and the
// apply echoes the preview's source hash, so the write is always exactly the approved diff.
let lpEditTarget=null;
function sendSelectMode(on){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin){ try{ w.postMessage({ type:'lp-select-mode', on:!!on }, curOrigin); }catch(e){} }
}
function setSelectMode(on){
  lpSelectOn=!!on;
  const b=document.getElementById('lp-select-btn');
  if(b){ b.setAttribute('aria-pressed', lpSelectOn?'true':'false'); if(lpSelectOn) b.classList.add('lp-on'); else b.classList.remove('lp-on'); }
  sendSelectMode(lpSelectOn);
}
// MP5.2a — a breadcrumb chip asks the tap to re-select an ancestor node (re-pin + fresh lp-select).
// Origin-targeted postMessage into the frame, exactly like sendSelectMode (cross-origin, never '*').
function sendReselect(c){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin&&c){ try{ w.postMessage({ type:'lp-reselect', file:c.file, line:c.line, col:c.col, tag:c.tag }, curOrigin); }catch(e){} }
}
function baseName(f){ const parts=String(f==null?'':f).split(/[\\\\/]/); return parts[parts.length-1]||String(f==null?'':f); }
function renderSelection(sel){
  const el=document.getElementById('lp-sel');
  if(!el) return;
  if(!sel){ el.style.display='none'; el.innerHTML=''; return; }
  const loc=esc(sel.file||'?')+':'+esc(sel.line==null?'?':sel.line)+(sel.col!=null?(':'+esc(sel.col)):'');
  const tag=esc(sel.tag||'elemento');
  const curText=sel.text||''; const curClass=sel.className||'';
  // MP5.2a — breadcrumb chips (root→leaf). The leaf is the current selection; clicking any other
  // chip re-selects that ancestor in the tap (re-pin + fresh lp-select round-trip).
  const pth=Array.isArray(sel.path)?sel.path:[];
  let crumbs='';
  for(let i=0;i<pth.length;i++){
    const c=pth[i]||{}; const last=(i===pth.length-1);
    crumbs+=(i?'<span class="lp-crumb-sep">›</span>':'')
      +'<button type="button" class="lp-crumb'+(last?' on':'')+'" data-crumb="'+i+'"'
      +(last?' aria-current="true" disabled':'')
      +' title="'+esc((c.file||'')+':'+(c.line==null?'':c.line))+'">'+esc(c.label||c.tag||'nó')+'</button>';
  }
  // Honest shared-component warning. The signal is the crumb immediately ABOVE the leaf — the
  // USAGE site: when it lives in a different file than the node itself, the node's file is a
  // component DEFINITION used from elsewhere, so an edit lands on the definition and affects
  // every usage. (Comparing against the breadcrumb ROOT would misfire — in Next the chain crosses
  // layout.tsx above every page node, which would scream the warning on everything.)
  const parentCrumb=pth.length>1?pth[pth.length-2]:null;
  let warn=(parentCrumb&&parentCrumb.file&&sel.file&&parentCrumb.file!==sel.file)
    ?'<div class="lp-sel-warn">⚠ este nó vive em <b>'+esc(baseName(sel.file))+'</b> — a edição afeta todos os usos deste componente.</div>'
    :'';
  // Honest multi-instance warning: the tap counted the same stamp on N live DOM nodes — the
  // selection is pinned to the FIRST instance, but any edit/delete lands on the template.
  if(sel.repeated>1) warn+='<div class="lp-sel-warn">⚠ elemento repetido no ecrã (×'+esc(sel.repeated)+' — provavelmente .map()) — a edição afeta o template, ou seja TODOS os itens.</div>';
  el.innerHTML='<div class="lp-sel-hd">Seleção · &lt;'+tag+'&gt;</div>'
    +(crumbs?('<div class="lp-crumbs" role="navigation" aria-label="Árvore do elemento">'+crumbs+'</div>'):'')
    +'<div class="lp-sel-loc">'+loc+'</div>'
    +warn
    +'<div id="lp-chip" class="lp-chip"></div>'
    +'<div class="lp-ed-l">texto</div>'
    +'<div class="lp-ed-row"><input id="lp-ed-text" class="lp-ed-in" type="text" value="'+esc(curText)+'" placeholder="texto do elemento" /><button id="lp-ed-text-b" class="lp-sel-btn" title="Editar deterministicamente — $0, sem tokens">aplicar</button></div>'
    +'<div class="lp-ed-l">classe (Tailwind · cor · spacing)</div>'
    +'<div class="lp-ed-row"><input id="lp-ed-class" class="lp-ed-in" type="text" value="'+esc(curClass)+'" placeholder="ex: text-lg font-bold text-rose-500" spellcheck="false" /><button id="lp-ed-class-b" class="lp-sel-btn" title="Editar deterministicamente — $0, sem tokens">aplicar</button></div>'
    +'<div class="lp-sel-acts"><button id="lp-sel-open" class="lp-sel-btn">abrir no editor</button>'
    +'<button id="lp-sel-del" class="lp-sel-btn" title="apagar é determinístico — $0, sem tokens">🗑 apagar elemento</button></div>'
    +'<div id="lp-del"></div>'
    +'<div id="lp-edit-msg" class="lp-ed-msg" role="status"></div>';
  el.style.display='block';
  // LP-4 §0 — preview-first: "aplicar" asks for the mini-diff; the write only happens after the
  // user approves it (and the host re-checks the source hash at that moment — fence simétrica).
  const sendEdit=function(kind,value){ lpEditTarget={ file:sel.file, line:sel.line, col:sel.col, tag:sel.tag, edit:{ kind:kind, value:value } }; vsapi.postMessage({ type:'lp-edit', preview:true, file:sel.file, line:sel.line, col:sel.col, tag:sel.tag, edit:{ kind:kind, value:value } }); showEditResult(null,'pending'); };
  const ti=document.getElementById('lp-ed-text'), tb=document.getElementById('lp-ed-text-b');
  if(ti&&tb){ tb.addEventListener('click', function(){ sendEdit('text', ti.value); }); ti.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); sendEdit('text', ti.value); } }); }
  const ci=document.getElementById('lp-ed-class'), cb=document.getElementById('lp-ed-class-b');
  if(ci&&cb){ cb.addEventListener('click', function(){ sendEdit('class', ci.value); }); ci.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); sendEdit('class', ci.value); } }); }
  const ob=document.getElementById('lp-sel-open');
  if(ob) ob.addEventListener('click', function(){ vsapi.postMessage({ type:'lp-open-source', file:sel.file, line:sel.line, col:sel.col }); });
  const cbs=el.querySelectorAll('[data-crumb]');
  for(let i=0;i<cbs.length;i++){ cbs[i].addEventListener('click', function(){
    // Honest gate: re-select needs the 🎯 armed (the tap ignores lp-reselect when off) — say so
    // instead of a silent no-op.
    if(!lpSelectOn){ showEditResult(false,'select-off'); return; }
    const c=pth[parseInt(this.getAttribute('data-crumb'),10)];
    if(c && !this.disabled) sendReselect(c);
  }); }
  const db=document.getElementById('lp-sel-del');
  if(db) db.addEventListener('click', function(){
    lpDeleteTarget={ file:sel.file, line:sel.line, col:sel.col, tag:sel.tag };
    vsapi.postMessage({ type:'lp-delete', preview:true, file:sel.file, line:sel.line, col:sel.col, tag:sel.tag });
    showEditResult(null,'pending');
  });
  renderChip();
}
// MP5.2a — the delete mini-diff. Preview shows EXACTLY the lines the engine would remove (and any
// partial line it would keep) before anything touches disk; "aplicar" re-runs the engine from disk
// at click time and writes only then. Honest copy: delete is deterministic — $0, no tokens.
function renderDeleteDiff(m){
  const el=document.getElementById('lp-del'); if(!el) return;
  if(!m || !m.ok){ el.innerHTML=''; showEditResult(false, (m&&m.reason)||'error'); return; }
  const msg=document.getElementById('lp-edit-msg'); if(msg){ msg.textContent=''; msg.className='lp-ed-msg'; }
  const rem=Array.isArray(m.removed)?m.removed:[]; const add=Array.isArray(m.added)?m.added:[];
  let rows='';
  for(let i=0;i<rem.length&&i<40;i++) rows+='<div class="lp-diff-l lp-diff-rm">− '+esc(rem[i])+'</div>';
  if(rem.length>40) rows+='<div class="lp-diff-l lp-diff-rm">… +'+(rem.length-40)+' linhas removidas (o apagar leva TODAS)</div>';
  for(let i=0;i<add.length&&i<40;i++) rows+='<div class="lp-diff-l lp-diff-ad">+ '+esc(add[i])+'</div>';
  if(add.length>40) rows+='<div class="lp-diff-l lp-diff-ad">… +'+(add.length-40)+' linhas</div>';
  if(!rows) rows='<div class="lp-diff-l">(sem alterações)</div>';
  // Honest .map() warning (spec §5.2): the JSX inside an expression renders once per item —
  // deleting it deletes it from the template, i.e. from every item.
  const exprWarn=m.inExpr?'<div class="lp-sel-warn">⚠ este nó está dentro de uma expressão {…} (ex.: .map()) — apagá-lo remove-o do template, ou seja de TODOS os itens renderizados.</div>':'';
  // Stale re-preview: the apply was refused because the file moved since the approved diff —
  // this diff is the REGENERATED one; the user must re-approve it.
  const staleWarn=m.stale?'<div class="lp-sel-warn">⚠ o ficheiro mudou desde a pré-visualização — nada foi escrito. Revê o diff (regenerado) e aplica de novo.</div>':'';
  el.innerHTML='<div class="lp-diff" role="region" aria-label="Pré-visualização do apagar">'
    +'<div class="lp-diff-hd">apagar &lt;'+esc((lpDeleteTarget&&lpDeleteTarget.tag)||'elemento')+'&gt; · linha '+esc(m.start==null?'?':m.start)+' — apagar é determinístico: $0, sem tokens</div>'
    +staleWarn
    +exprWarn
    +rows
    +'<div class="lp-sel-acts"><button id="lp-del-apply" class="lp-sel-btn">aplicar — apagar</button><button id="lp-del-cancel" class="lp-sel-btn">cancelar</button></div>'
    +'</div>';
  const ap=document.getElementById('lp-del-apply');
  if(ap) ap.addEventListener('click', function(){
    if(!lpDeleteTarget) return;
    // The captured preview target + the source hash: apply is refused server-side if the file
    // changed since the diff was computed (the delete must be exactly the approved diff).
    vsapi.postMessage({ type:'lp-delete', preview:false, file:lpDeleteTarget.file, line:lpDeleteTarget.line, col:lpDeleteTarget.col, tag:lpDeleteTarget.tag, h:m.h });
    showEditResult(null,'pending');
  });
  const ca=document.getElementById('lp-del-cancel');
  if(ca) ca.addEventListener('click', function(){ el.innerHTML=''; const g=document.getElementById('lp-edit-msg'); if(g){ g.textContent=''; g.className='lp-ed-msg'; } });
}
// LP-4 §0 — the text/class edit mini-diff (fence simétrica). Preview shows EXACTLY the lines the
// byte-splice would change — with the ABSOLUTE PATH of the file that will be written (A7 mitigation:
// the user sees WHICH tree the write lands on) — before anything touches disk; "aplicar" echoes the
// preview's source hash and the host refuses the write if the file moved ('file-changed' → this
// same renderer shows the REGENERATED diff flagged stale for re-approval).
function renderEditDiff(m){
  const el=document.getElementById('lp-del'); if(!el) return;
  if(!m || !m.ok){ el.innerHTML=''; showEditResult(false, (m&&m.reason)||'error'); return; }
  const msg=document.getElementById('lp-edit-msg'); if(msg){ msg.textContent=''; msg.className='lp-ed-msg'; }
  const rem=Array.isArray(m.removed)?m.removed:[]; const add=Array.isArray(m.added)?m.added:[];
  let rows='';
  for(let i=0;i<rem.length&&i<40;i++) rows+='<div class="lp-diff-l lp-diff-rm">− '+esc(rem[i])+'</div>';
  if(rem.length>40) rows+='<div class="lp-diff-l lp-diff-rm">… +'+(rem.length-40)+' linhas</div>';
  for(let i=0;i<add.length&&i<40;i++) rows+='<div class="lp-diff-l lp-diff-ad">+ '+esc(add[i])+'</div>';
  if(add.length>40) rows+='<div class="lp-diff-l lp-diff-ad">… +'+(add.length-40)+' linhas</div>';
  if(!rows) rows='<div class="lp-diff-l">(sem alterações)</div>';
  const staleWarn=m.stale?'<div class="lp-sel-warn">⚠ o ficheiro mudou desde a pré-visualização — nada foi escrito. Revê o diff (regenerado) e aplica de novo.</div>':'';
  el.innerHTML='<div class="lp-diff" role="region" aria-label="Pré-visualização da edição">'
    +'<div class="lp-diff-hd">editar ('+esc(m.kind||'edit')+') · linha '+esc(m.start==null?'?':m.start)+' — determinístico: $0, sem tokens</div>'
    +(m.abs?('<div class="lp-diff-hd">✍ '+esc(m.abs)+'</div>'):'')
    +staleWarn
    +rows
    +'<div class="lp-sel-acts"><button id="lp-ed-apply" class="lp-sel-btn">aplicar — escrever</button><button id="lp-ed-cancel" class="lp-sel-btn">cancelar</button></div>'
    +'</div>';
  const ap=document.getElementById('lp-ed-apply');
  if(ap) ap.addEventListener('click', function(){
    if(!lpEditTarget) return;
    // The captured preview target + the source hash: the host refuses the write if the file
    // changed since the diff was computed (the edit must be exactly the approved diff).
    vsapi.postMessage({ type:'lp-edit', preview:false, file:lpEditTarget.file, line:lpEditTarget.line, col:lpEditTarget.col, tag:lpEditTarget.tag, edit:lpEditTarget.edit, h:m.h });
    showEditResult(null,'pending');
  });
  const ca=document.getElementById('lp-ed-cancel');
  if(ca) ca.addEventListener('click', function(){ el.innerHTML=''; const g=document.getElementById('lp-edit-msg'); if(g){ g.textContent=''; g.className='lp-ed-msg'; } });
}
// MP5.1 router-native model chip. The truth: a text/class edit is DETERMINISTIC — the router runs it
// local for $0 with no LLM, so classify.js is never consulted (and never touched/executed here). The
// override lets you pin the model for STRUCTURAL edits (a prompt → CC), which land in MP5.2; honest
// copy says so and never fabricates a token cost for the free path.
const LP_TIERS=[['local','🐮 local · $0'],['t1','Haiku'],['t2','Sonnet'],['t3','Opus'],['fable','@fable']];
function tierModel(t){ return t==='t1'?'Haiku':t==='t2'?'Sonnet':t==='t3'?'Opus':t==='fable'?'Fable':'local'; }
function renderChip(){
  const el=document.getElementById('lp-chip'); if(!el) return;
  let tiers='';
  for(let i=0;i<LP_TIERS.length;i++){ const id=LP_TIERS[i][0], lb=esc(LP_TIERS[i][1]); tiers+='<button type="button" class="lp-tier'+(lpTier===id?' on':'')+'" data-tier="'+id+'" aria-pressed="'+(lpTier===id?'true':'false')+'">'+lb+'</button>'; }
  const note = (lpTier==='local')
    ? 'edição de texto/classe é determinística — $0, sem tokens (o router não precisa da nuvem).'
    : 'texto/classe continuam $0; a subida para '+esc(tierModel(lpTier))+' aplica-se a edições ESTRUTURAIS (prompt → Claude Code) — chega no MP5.2.';
  el.innerHTML='<div class="lp-chip-hd">🐮 esta edição: <span class="lp-chip-0">local · $0 · sem tokens</span></div>'
    +'<div class="lp-tiers" role="group" aria-label="Modelo para esta edição">'+tiers+'</div>'
    +'<div class="lp-chip-note">'+note+'</div>';
  const btns=el.querySelectorAll('[data-tier]');
  for(let i=0;i<btns.length;i++){ btns[i].addEventListener('click', function(){ lpTier=this.getAttribute('data-tier'); renderChip(); }); }
}
// Honest edit feedback — every refusal shows its real reason (no silent no-op, no fabricated success).
function showEditResult(ok, reason){
  const el=document.getElementById('lp-edit-msg'); if(!el) return;
  if(ok===null){ el.textContent='a aplicar…'; el.className='lp-ed-msg lp-ed-pending'; return; }
  const map={ applied:'✓ aplicado — $0, sem tokens (o HMR atualiza o preview)', 'no-op':'sem alterações a aplicar',
    deleted:'✓ elemento apagado — $0, sem tokens (o HMR atualiza o preview)',
    'delete-breaks-parse':'apagar este nó partiria o ficheiro — recusado',
    'file-changed':'o ficheiro mudou desde a pré-visualização — pré-visualiza de novo',
    'select-off':'o modo 🎯 está desligado — liga-o para reseleccionar',
    'not-simple-text':'este elemento não é texto simples — edição estrutural chega no MP5.2',
    'dynamic-classname':'className é dinâmico ({…}) — não é editável deterministicamente',
    'unsafe-text':'o texto tem < > { } — precisa do modo estrutural', 'unsafe-class':'classe inválida (< > { } ou aspas)',
    'not-found':'não localizei o elemento no ficheiro — reselecciona', 'parse-error':'não consegui interpretar o ficheiro',
    'file-not-in-workspace':'o ficheiro está fora do workspace', 'engine-unavailable':'motor de edição indisponível',
    'parser-unavailable':'motor de edição indisponível — reinstala o plugin (dependência em falta)',
    'bad-request':'pedido inválido', 'bad-value':'valor inválido', refused:'edição recusada', error:'erro a aplicar a edição' };
  const txt=map[reason]||(ok?'✓ ok':'não aplicado ('+reason+')');
  el.textContent=txt; el.className='lp-ed-msg '+(ok?'lp-ed-ok':'lp-ed-no');
}
window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (!m || typeof m !== 'object') return;
  // ── UNTRUSTED iframe branch (MP4 tap). The framed dev server is a DIFFERENT origin; accept its
  //    messages ONLY when (1) they truly come from OUR iframe window (ev.source === its
  //    contentWindow — a sibling frame cannot spoof this) AND (2) ev.origin is EXACTLY the framed
  //    localhost origin (never '*', never a stale port). This branch feeds ONLY the local strip /
  //    state-restore — it can never reach the host-trusted actions below, so even a leaked token
  //    could not let framed content re-point the iframe.
  const _frame = document.getElementById('lp-frame');
  if (_frame && ev.source === _frame.contentWindow){
    if (!curOrigin || ev.origin !== curOrigin) return; // ORIGIN LOCK (event.origin validated)
    if (m.type === 'lp-error'){ lpIngest(m); }
    else if (m.type === 'lp-error-clear'){ lpClearErrors(m.kind); }
    else if (m.type === 'lp-nav'){ if (typeof m.path === 'string') reflectRoute(m.path.slice(0,2048)); } // MP3.3: current route from the tap (popstate + Link nav)
    else if (m.type === 'lp-state'){
      if (typeof m.path === 'string'){
        lpState = { path: m.path.slice(0,2048), scrollY: (typeof m.scrollY === 'number' && isFinite(m.scrollY)) ? m.scrollY : 0 };
        vsapi.postMessage({ type:'lp-state', path: lpState.path, scrollY: lpState.scrollY });
      }
    }
    else if (m.type === 'lp-ready'){ lpSendRestore(); }
    // MP5.1 — a click in select mode. The origin lock above already vetted the sender; render the
    // selection panel. lp-select-mode-off is the tap telling us the user pressed Esc inside the frame.
    else if (m.type === 'lp-select'){ lpSelection={ file:m.file, line:m.line, col:m.col, tag:m.tag, rect:m.rect, text:m.text, className:m.className, path:Array.isArray(m.path)?m.path.slice(0,12):[], repeated:(typeof m.repeated==='number'&&m.repeated>1)?m.repeated:0 }; renderSelection(lpSelection); }
    else if (m.type === 'lp-select-mode-off'){ setSelectMode(false); }
    return;
  }
  // ── TRUSTED HOST branch. Accept ONLY host messages bearing the shared secret (unchanged from
  //    MP2). The framed iframe cannot read HOST_TOKEN, so it cannot forge this.
  if (m.__t !== HOST_TOKEN) return;
  if (m.type === 'lp-snapshot'){ render(m.s); applyStage(m.s && m.s.stage); applyError(m.s && m.s.stageError); populateRoutes(m.s && m.s.routes); }
  else if (m.type === 'lp-goto'){ if (typeof m.url === 'string') navFrameTo(m.url); } // MP3.3: host-vetted same-origin navigation
  else if (m.type === 'lp-edit-result'){
    showEditResult(m.ok, m.reason); // MP5.1 honest deterministic-edit feedback
    // MP5.2a/LP-4 — once a write lands, the pending mini-diff is history: clear it.
    if (m.ok && (m.reason === 'deleted' || m.reason === 'applied')){ const d=document.getElementById('lp-del'); if(d) d.innerHTML=''; }
  }
  else if (m.type === 'lp-delete-diff'){ renderDeleteDiff(m); } // MP5.2a delete preview (mini-diff before any write)
  else if (m.type === 'lp-edit-diff'){ renderEditDiff(m); } // LP-4 §0 edit preview (fence simétrica: diff + hash antes de escrever)
});
const urlInput=document.getElementById('lp-url');
// The address bar now navigates AND re-points: the host's resolveNavTarget decides (a same-origin
// path moves the frame; a different localhost origin re-points the stage; anything else is refused).
function submitUrl(){ if(urlInput) vsapi.postMessage({ type:'lp-nav-input', input: urlInput.value }); }
const goBtn=document.getElementById('lp-go');
if(goBtn) goBtn.addEventListener('click', submitUrl);
if(urlInput) urlInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submitUrl(); });
const routesSel=document.getElementById('lp-routes');
if(routesSel) routesSel.addEventListener('change', ()=>{ const v=routesSel.value; if(v) vsapi.postMessage({ type:'lp-nav-input', input:v }); });
const backBtn=document.getElementById('lp-back');
if(backBtn) backBtn.addEventListener('click', ()=> frameHistory('back'));
const fwdBtn=document.getElementById('lp-fwd');
if(fwdBtn) fwdBtn.addEventListener('click', ()=> frameHistory('forward'));
const reBtn=document.getElementById('lp-redetect');
if(reBtn) reBtn.addEventListener('click', ()=> vsapi.postMessage({ type:'lp-redetect' }));
const autoBtn=document.getElementById('lp-auto');
if(autoBtn) autoBtn.addEventListener('click', ()=>{ if(urlInput) urlInput.value=''; vsapi.postMessage({ type:'lp-clear-url' }); });
const selBtn=document.getElementById('lp-select-btn');
if(selBtn) selBtn.addEventListener('click', ()=> setSelectMode(!lpSelectOn));
</script>
</body></html>`;
}

function activate(ctx) {
  const data = new DataService();
  ctx.subscriptions.push({ dispose: () => data.dispose() });
  makeStatusBar(ctx, data);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider('mooterCockpit', new CockpitProvider(ctx, data)));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.openCockpit', () => vscode.commands.executeCommand('mooterCockpit.focus')));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.newSession', newSession));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.openSessionTab', openSessionTab)); // Deck Floor (Fase 2): wave=sessão=aba deep-link
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.refresh', () => data.refresh(true)));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.setupWizard', () => vscode.commands.executeCommand('mooterCockpit.focus')));
  // Live Preview · MP1 — singleton WebviewPanel, ViewColumn.Beside (reveals if already open).
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.openLivePreview', () => LivePreviewPanel.createOrReveal()));
  data.start();
}
function deactivate() {}
module.exports = { activate, deactivate };

// ───────────────────────── webview ─────────────────────────
// ───────────────────────── webview v0.3 ─────────────────────────
function getHtml(guardianPct = null) {
  const nonce = String(Math.random()).slice(2);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  /* Deck design tokens (Phase 0) — theme-aware. Every colour defers to the VS Code
     theme (charts/editor vars) and falls back to the Mooter brand hex only when the
     theme omits it. This :root layer is the ONLY sanctioned home for a colour literal. */
  :root{
    /* structural — track the editor theme so light/dark/high-contrast all stay legible */
    --ink:var(--vscode-editor-background,#0B0A09);
    --surface:var(--vscode-editorWidget-background,#141311);
    --surface2:var(--vscode-input-background,#1C1A17);
    --btext:var(--vscode-foreground,#F2EDE6);
    --bmuted:var(--vscode-descriptionForeground,#8A8076);
    --ttybg:var(--vscode-terminal-background,var(--vscode-editor-background,#0d1117));
    --ttyhd:var(--vscode-sideBarSectionHeader-background,#161b22);
    --ttyfg:var(--vscode-terminal-foreground,var(--vscode-foreground,#DDDDDD));
    --on-bright:#0B0A09; /* fixed dark ink for text sitting on a saturated brand chip */
    /* semantic status — follow the theme chart palette; brand hex only as fallback */
    --ok:var(--vscode-charts-green,#4CAF6A);
    --danger:var(--vscode-charts-red,#E8888A);
    --danger-2:var(--vscode-charts-red,#F2A5A5);
    --danger-strong:var(--vscode-errorForeground,#D9484B);
    --warn:var(--vscode-charts-orange,#D19A66);
    --acc-warm:var(--vscode-charts-yellow,#E5C07B);
    --acc-orange:var(--vscode-charts-orange,#D19A66);
    --blue:var(--vscode-charts-blue,#5A9BD4);
    --blue-bright:var(--vscode-charts-blue,#61AFEF);
    --purple:var(--vscode-charts-purple,#A78BFA);
    --purple-bright:var(--vscode-charts-purple,#C4B5FD);
    --teal:var(--vscode-charts-blue,#56B6C2);
    /* back-compat aliases (used widely as --g/--r) */
    --g:var(--ok);--r:var(--danger);--r2:var(--danger-2);
    /* tier ladder */
    --t0:var(--ok);--t1:var(--blue);--t2:var(--purple);--t3:var(--vscode-charts-red,#D46A5A);--t5:var(--acc-warm);
    /* dim tints (translucent overlays — stay subtle in every theme) */
    --gdim:rgba(76,175,106,.14);--rdim:rgba(232,136,138,.12);
    --warmdim:rgba(229,192,123,.12);--bluedim:rgba(90,155,212,.12);--orangedim:rgba(209,154,102,.1);
    /* categorical worktree/model palette — theme chart series, brand fallback */
    --wt-1:var(--vscode-charts-blue,#5A9BD4);--wt-2:var(--vscode-charts-orange,#D4A05A);
    --wt-3:var(--vscode-charts-purple,#A05AD4);--wt-4:var(--vscode-charts-green,#5AD4A0);
    --wt-5:var(--vscode-charts-red,#D4605A);--wt-6:var(--vscode-charts-yellow,#D4C05A);
    --wt-7:var(--vscode-charts-green,#60A05A);
  }
  /* High-contrast: VS Code adds .vscode-high-contrast* to <body>. Drop the subtle
     tint overlays so text sits on the real HC background at maximum contrast. */
  body.vscode-high-contrast, body.vscode-high-contrast-light{
    --gdim:transparent;--rdim:transparent;--warmdim:transparent;--bluedim:transparent;--orangedim:transparent;
  }
  /* Reduced motion — global kill switch covering every animation/transition. */
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);padding:0 10px 12px;margin:0}
  .brand{display:flex;align-items:center;gap:7px;margin:8px -10px 0;padding:2px 12px 9px;border-bottom:1px solid var(--vscode-widget-border)}
  .brand b{color:var(--r);font-size:13.5px}.brand .proj{font-size:11px;color:var(--vscode-descriptionForeground);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .brand .right{margin-left:auto;display:flex;gap:5px;align-items:center}
  .badge{font-size:10px;padding:2px 8px;border-radius:8px}
  .b-mode{color:var(--r);background:var(--rdim)}.b-score{color:var(--on-bright);background:var(--g);font-weight:700;cursor:pointer}
  .tabs{display:flex;gap:0;margin:0 -10px 10px;padding:4px 8px 0;border-bottom:1px solid var(--vscode-widget-border);flex-wrap:wrap}
  .tab{padding:5px 8px;cursor:pointer;color:var(--vscode-descriptionForeground);border-bottom:2px solid transparent;font-size:11.5px}
  .tab.on{color:var(--vscode-foreground);border-bottom-color:var(--r)}
  /* B6 — header frozen: identity + tab switcher stay pinned; the body scrolls under them. */
  .chrome{position:sticky;top:0;z-index:30;background:var(--vscode-sideBar-background,var(--vscode-editor-background));margin:0 -10px;padding:0 10px}
  .chrome .brand{margin-left:0;margin-right:0}
  .chrome .tabs{margin-left:0;margin-right:0;margin-bottom:0}
  /* R1 · tabs priority-collapse — the delivery surfaces (Cockpit · Mission · Project · Arch) stay
     in the bar; config/diagnostic tabs (Setup · Agents · Decisions · Doctor) live under a ···
     overflow (details/summary → free keyboard + CSP-safe). GitLens pattern: nothing loses access. */
  .taboverflow{position:relative;display:inline-block;align-self:flex-end}
  .taboverflow>summary{list-style:none;cursor:pointer;font-size:12px;line-height:1;padding:5px 8px;color:var(--vscode-descriptionForeground);border-bottom:2px solid transparent;white-space:nowrap}
  .taboverflow>summary::-webkit-details-marker{display:none}
  .taboverflow>summary:hover{color:var(--vscode-foreground)}
  .taboverflow.activein>summary{color:var(--vscode-foreground);border-bottom-color:var(--r)}
  .taboverflow>summary:focus-visible{outline:2px solid var(--vscode-focusBorder,var(--acc-warm));outline-offset:1px;border-radius:4px}
  .taboverflow .menu{left:auto;right:0}
  .taboverflow .mi[aria-checked="true"]{color:var(--r);font-weight:700}
  /* ── Deck Phase 1 · header spine: project switcher · +New · inbox-by-exception ──
     Disclosure menus use <details>/<summary> for free keyboard + focus semantics.
     Every state carries a glyph + label (not colour alone) — WCAG 1.4.1. */
  .pswitch,.pnew{position:relative;display:inline-block}
  .pswitch>summary,.pnew>summary{list-style:none;cursor:pointer;font-size:11px;padding:2px 7px;border-radius:7px;
    border:1px solid var(--vscode-widget-border);color:var(--vscode-foreground);background:var(--vscode-input-background);
    display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
  .pswitch>summary::-webkit-details-marker,.pnew>summary::-webkit-details-marker{display:none}
  .pswitch>summary:hover,.pnew>summary:hover{border-color:var(--acc-warm)}
  .pswitch>summary:focus-visible,.pnew>summary:focus-visible,.mi:focus-visible{outline:2px solid var(--vscode-focusBorder,var(--acc-warm));outline-offset:1px}
  #proj{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
  .caret{font-size:9px;opacity:.7}
  .menu{position:absolute;top:calc(100% + 4px);left:0;z-index:60;min-width:164px;max-width:240px;
    background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:8px;
    padding:4px;box-shadow:0 6px 20px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:1px;max-height:60vh;overflow:auto}
  .pnew .menu{left:auto;right:0}
  .mi{all:unset;box-sizing:border-box;cursor:pointer;font-size:11.5px;padding:6px 9px;border-radius:6px;color:var(--vscode-foreground);display:flex;align-items:center;gap:7px;justify-content:space-between}
  .mi:hover:not([disabled]){background:var(--vscode-list-hoverBackground)}
  .mi[aria-checked="true"]{font-weight:700}
  .mi[aria-checked="true"] .tick{color:var(--acc-warm)}
  .mi[disabled]{opacity:.55;cursor:default}
  .mi .soon{font-size:9.5px;opacity:.85;color:var(--acc-warm)}
  .mi .mcount{font-size:10.5px;opacity:.7;font-variant-numeric:tabular-nums}
  /* Inbox — gestão por exceção. Calm by default; the your-turn line is the loudest signal. */
  .inbox{margin:0 -10px;padding:6px 12px 8px;border-bottom:1px solid var(--vscode-widget-border);display:flex;flex-direction:column;gap:5px}
  .inbox-turn{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:var(--acc-warm);cursor:pointer;background:none;border:none;text-align:left;padding:0;width:100%}
  .inbox-turn .dot{width:9px;height:9px;border-radius:50%;background:var(--acc-warm);flex:none;animation:inboxpulse 1.5s infinite}
  .inbox-turn:focus-visible{outline:2px solid var(--vscode-focusBorder,var(--acc-warm));outline-offset:2px;border-radius:5px}
  @keyframes inboxpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.82)}}
  .inbox-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
  .inbox-chip{font-size:11px;padding:2px 8px;border-radius:9px;display:inline-flex;align-items:center;gap:5px;cursor:pointer;
    border:1px solid var(--vscode-widget-border);color:var(--vscode-foreground);background:var(--vscode-input-background);font-variant-numeric:tabular-nums}
  .inbox-chip:focus-visible{outline:2px solid var(--vscode-focusBorder,var(--acc-warm));outline-offset:1px}
  .inbox-chip .n{font-weight:700}
  .inbox-chip.gate{border-color:var(--danger)}
  .inbox-chip.unsaved{border-color:var(--warn)}
  .inbox-chip.meta{border-color:var(--vscode-panel-border,rgba(128,128,128,.35));opacity:.82}
  .inbox-chip.budget{border-color:var(--acc-warm)}
  .inbox-chip.flow{border-color:var(--ok)}
  .inbox-calm{font-size:11.5px;color:var(--ok);display:flex;align-items:center;gap:7px;font-weight:600}
  .inbox-calm .ic{font-size:13px}
  /* R2 · NOW barra destacada — when a session is waiting on you, the inbox becomes a prominent
     warning-tinted bar (warm inset rail) so 🙋 your-turn is the single loudest signal. Calm state
     stays flat/green (no tint) — loud only when it must be. */
  .inbox.hasturn{background:var(--warmdim);box-shadow:inset 3px 0 0 var(--acc-warm);border-bottom-color:var(--acc-warm);padding-top:8px}
  .inbox.hasturn .inbox-turn{font-size:12.5px}
  /* B5 — router mix as one compact segmented bar (was 4 stacked rows); detail opens on expand. */
  .tiermix{display:flex;height:8px;border-radius:4px;overflow:hidden;margin:6px 0 4px;background:var(--vscode-input-background)}
  .tiermix>span{display:block;min-width:2px}
  .tiermixl{display:flex;gap:11px;font-size:9px;flex-wrap:wrap;font-variant-numeric:tabular-nums;opacity:.9}
  .view{display:none}.view.on{display:block}
  .card{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:12px;margin-bottom:8px}
  .hero{background:linear-gradient(160deg,var(--ink),var(--surface2));border:1px solid var(--g);color:var(--btext)}
  .card.graph{border-color:var(--g)} .card.graph .lbl{color:var(--g)}
  .livecow{font-size:22px;line-height:1}
  .herd{margin-top:7px;display:flex;flex-direction:column;gap:4px}
  .srow{display:flex;align-items:center;gap:9px;padding:5px 8px;border:1px solid var(--vscode-widget-border);border-left:3px solid transparent;border-radius:6px;cursor:pointer;background:var(--vscode-editorWidget-background)}
  .srow:hover{background:var(--vscode-list-hoverBackground)}
  .srow.on{border-left-color:var(--g);background:var(--gdim)}
  .srow .livecow{font-size:18px}
  .sbody{flex:1;min-width:0}
  .stop{display:flex;gap:8px;align-items:center;justify-content:space-between}
  .sname{font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sllm{font-size:10px;color:var(--vscode-descriptionForeground);flex:none}
  .ssub{font-size:9.5px;color:var(--vscode-descriptionForeground);margin-top:1px;display:flex;align-items:center;gap:5px}
  /* WCOCKPIT-9 (Bloco B): compact single-line card — name + state + id on one .sline */
  .sline{display:flex;align-items:baseline;gap:5px;min-width:0}
  .sline .sname{flex:0 1 auto;min-width:34px}
  .sline .sstate{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9.5px;color:var(--vscode-descriptionForeground);display:inline-flex;align-items:center;gap:4px}
  .sline .sid{flex:none;font-size:9px;color:var(--vscode-descriptionForeground);opacity:.6;white-space:nowrap;font-family:var(--vscode-editor-font-family,monospace)}
  .sline .sllm{margin-left:auto;flex:none}
  .sscm{font-size:9.5px;margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .scmbr{font-family:var(--vscode-editor-font-family,monospace);color:var(--vscode-foreground);background:var(--surface2);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:1px 6px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .scmpr{font-weight:600;font-size:9.5px}
  .alertdot{width:8px;height:8px;border-radius:50%;background:var(--acc-warm);flex:none;animation:alertpulse 1.6s infinite}
  @keyframes alertpulse{0%,100%{opacity:1}50%{opacity:.3}}
  .needsyou{color:var(--acc-warm);font-weight:700}
  .srow.needs:not(.on){background:rgba(229,192,123,.08)}
  .sopen{font-size:12px;color:var(--vscode-descriptionForeground);flex:none;opacity:.45}
  .srow:hover .sopen{opacity:1;color:var(--g)}
  /* Deck Floor (Fase 2): session type glyph + persistent pin. Pinned = filled 📌 + warm left rail
     (shape marker, not colour-only — WCAG 1.4.1). */
  .stype{font-size:11px;flex:none;margin-right:1px}
  .spin{all:unset;cursor:pointer;font-size:12px;flex:none;opacity:.28;padding:0 3px;line-height:1;filter:grayscale(1)}
  .spin:hover{opacity:.85;filter:none}
  .spin.on{opacity:1;filter:none}
  .spin:focus-visible{outline:2px solid var(--vscode-focusBorder,var(--acc-warm));outline-offset:1px;border-radius:4px}
  .srow.pinned{border-left-color:var(--acc-warm)}
  /* Deck Phase 3 · Lentes ligadas — collapsible diagnostic lenses; each reads a real source
     ("o que mudou · porquê · o que faço"). Every number is real or renders .nd (n/d). */
  .lens .lens-body{margin-top:6px;font-size:11px;display:flex;flex-direction:column;gap:5px}
  .lens .lrow{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}
  .lens .lk{color:var(--vscode-descriptionForeground);font-size:10.5px;min-width:70px;flex:none}
  .lens .lv{font-weight:600;font-variant-numeric:tabular-nums}
  .lens .nd{color:var(--vscode-descriptionForeground);opacity:.7;font-style:italic;font-weight:400}
  .lens .lbar{height:7px;border-radius:4px;overflow:hidden;display:flex;background:var(--vscode-input-background);margin:1px 0;min-width:120px;flex:1}
  .lens .lbar>span{display:block;min-width:1px}
  .lens .lchip{font-size:10px;padding:1px 7px;border-radius:8px;border:1px solid var(--vscode-widget-border);display:inline-flex;gap:4px;align-items:center}
  .lens .lsoon{font-size:9.5px;color:var(--acc-warm);opacity:.9}
  .lens .lwhy{font-size:9.5px;color:var(--vscode-descriptionForeground);opacity:.8}
  .lens .llink{font-size:10px;color:var(--vscode-descriptionForeground);cursor:pointer;opacity:.75}
  .lens .llink:hover{opacity:1;color:var(--acc-warm)}
  .lens .llink:focus-visible{outline:2px solid var(--vscode-focusBorder,var(--acc-warm));outline-offset:1px;border-radius:3px}
  /* Deck Phase 4 · Vida — hardware strip · pipeline · handoff flow. All motion is CSS-only, so the
     Phase-0 global prefers-reduced-motion kill switch disables every one of them. */
  .hwstrip{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 8px;padding:6px 8px;border:1px solid var(--vscode-widget-border);border-radius:8px;background:var(--vscode-editorWidget-background)}
  .hwc{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-variant-numeric:tabular-nums}
  .hwbar{display:inline-block;width:46px;height:7px;border-radius:4px;overflow:hidden;background:var(--vscode-input-background)}
  .hwbar>span{display:block;height:100%;transition:width .5s ease}
  .hwstrip .nd{font-style:italic;opacity:.7}
  .hwstrip .lwhy{font-size:9px}
  /* 🏁 Pipeline conveyor */
  .pipeline{margin:0 0 8px;padding:6px 8px;border:1px solid var(--vscode-widget-border);border-radius:8px;background:var(--vscode-editorWidget-background)}
  .prail{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
  .pstage{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;padding:2px 8px;border-radius:8px;border:1px solid var(--vscode-widget-border);background:var(--vscode-input-background)}
  .pstage.bott{border-color:var(--warn);color:var(--warn)}
  .parrow{opacity:.4;font-size:10px}
  .pipeline .lwhy{font-size:9px;margin-top:4px;display:block}
  /* ⇄ Handoff flow — animated particle down each pipe (reduced-motion disables it globally). */
  .hoflow{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:8px 0 4px;padding:7px 9px;border:1px solid var(--vscode-widget-border);border-radius:8px;background:var(--vscode-editorWidget-background)}
  .hnode{font-size:10.5px;font-weight:600;white-space:nowrap}
  .hpipe{position:relative;flex:1;min-width:16px;height:2px;background:var(--vscode-widget-border);border-radius:2px;overflow:hidden}
  .hpart{position:absolute;top:-2px;left:0;width:6px;height:6px;border-radius:50%;background:var(--acc-warm);animation:hoflowpart 2.2s linear infinite}
  @keyframes hoflowpart{0%{left:-8px;opacity:0}15%{opacity:1}85%{opacity:1}100%{left:100%;opacity:0}}
  .hoflow .lwhy{font-size:9px}
  /* Header cow animates by mode (moowalk/moolazy/moocrazy keyframes already defined). */
  #brandCow{display:inline-block;font-size:15px;line-height:1}
  .livedot{width:8px;height:8px;border-radius:50%;background:var(--lc,var(--g));flex:none;animation:livepulse 1.6s infinite}
  @keyframes livepulse{0%,100%{opacity:1}50%{opacity:.3}}
  .livecow.working{animation:moowalk 0.85s ease-in-out infinite}
  @keyframes moowalk{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-2px) rotate(-5deg)}75%{transform:translateY(-2px) rotate(5deg)}}
  .livecow.lazy{animation:moolazy 2.2s ease-in-out infinite}
  @keyframes moolazy{0%,100%{transform:rotate(0)}50%{transform:rotate(-6deg) translateY(1px)}}
  .livecow.crazy{animation:moocrazy 0.38s ease-in-out infinite}
  @keyframes moocrazy{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-3px) rotate(-9deg)}50%{transform:translateY(-1px) rotate(9deg)}75%{transform:translateY(-3px) rotate(-9deg)}}
  @media (prefers-reduced-motion:reduce){.livecow.working,.livecow.lazy,.livecow.crazy,.livedot,.alertdot,.sdot.now{animation:none}}
  ${COWORK.CSS}
  .smeta{display:flex;align-items:center;gap:5px;margin-top:3px;flex-wrap:wrap}
  .intchip{display:inline-flex;align-items:center;gap:3px;font-size:9.5px;color:var(--vscode-descriptionForeground);opacity:.8}
  .intchip:hover{opacity:1}
  .intlogo{display:inline-block;vertical-align:middle;flex:none}
  .intcta{color:var(--acc-warm);font-size:9px;font-weight:600}
  .wtchip{font-size:9px;background:rgba(90,155,212,.15);color:var(--blue);border:1px solid rgba(90,155,212,.3);border-radius:7px;padding:1px 5px;font-family:var(--vscode-editor-font-family,monospace)}
  button.intrefresh{padding:0 4px;font-size:10px;border-radius:3px;opacity:.45;min-width:0;line-height:1.4}
  button.intrefresh:hover{opacity:1}
  /* WCOCKPIT-3: per-session mode segmented + model select + auto toggle */
  .sseg{display:flex;gap:2px;margin-top:4px;background:var(--vscode-input-background);border-radius:5px;padding:2px}
  .sseg .smode{flex:1;padding:3px 2px;font-size:11px;border:1px solid transparent;border-radius:4px;opacity:.5;background:none;cursor:pointer;text-align:center}
  .sseg .smode.on{opacity:1;font-weight:700;background:var(--rdim);border-color:var(--r)}
  .sseg .smode:hover:not(.on){opacity:.85}
  .sctrl{display:flex;align-items:center;gap:5px;margin-top:3px;flex-wrap:wrap}
  .smodsel{font-size:9.5px;padding:2px 4px;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--vscode-widget-border);border-radius:4px;max-width:115px;min-width:68px}
  button.sauto{font-size:9px;padding:2px 7px;opacity:.5}
  button.sauto.on{opacity:1;color:var(--g);border-color:var(--g)}
  /* WCOCKPIT-9 (Bloco F): LoopMoo toggle — ON=azul activo, armado=âmbar tracejado (loop não activo) */
  button.sloop{font-size:9px;padding:2px 7px;opacity:.5;white-space:nowrap}
  button.sloop.on{opacity:1;color:var(--blue-bright);border-color:var(--blue-bright)}
  button.sloop.on.armed{color:var(--acc-warm);border-color:var(--acc-warm);border-style:dashed}
  button.sloop:focus-visible{outline:2px solid var(--r);outline-offset:1px;opacity:1}
  .livecow.loop{animation:mooloop 1.1s linear infinite}
  @keyframes mooloop{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.livecow.loop{animation:none}}
  /* WCOCKPIT-9 (Bloco E): per-session slash-command picker + armed "next" feedback chip */
  .sslashrow{margin-top:4px}
  .sslash{width:100%;font-size:9.5px;padding:2px 4px;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--vscode-widget-border);border-radius:4px}
  .snext{font-size:9px;margin-top:3px;color:var(--blue-bright);font-family:var(--vscode-editor-font-family,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  /* WCOCKPIT-9 (Bloco C): per-session Commit & Push button (drawer-only; shown only when work) */
  .sgitrow{margin-top:5px}
  .sgitbtn{width:100%;font-size:9.5px;padding:3px 7px;border-radius:5px;cursor:pointer;font-weight:600;background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));color:var(--vscode-foreground);border:1px solid var(--blue);opacity:.9;line-height:1.5}
  .sgitbtn:hover{opacity:1;border-color:var(--g);color:var(--g)}
  .sgitbtn:focus-visible{outline:2px solid var(--r);outline-offset:1px;opacity:1}
  /* ⇄ Handoff: distinct accent (purple ⇄), reuses .sgitbtn layout */
  .sgitbtn.handoff{border-color:var(--purple);color:var(--vscode-foreground)}
  .sgitbtn.handoff:hover{border-color:var(--purple-bright);color:var(--purple-bright)}
  /* ── GUARDIAN:F3 ── ⇄ Saltar para fresca: amber accent, only rendered at the delirium threshold */
  .sgitbtn.jump{border-color:var(--acc-warm);color:var(--vscode-foreground);font-weight:700}
  .sgitbtn.jump:hover{border-color:var(--acc-warm);color:var(--acc-warm)}
  /* ⇄ Handoff v2 — per-project button in the group header (own full-width line) */
  .ghd .projhandoff{flex:0 0 100%;margin-top:3px;font-size:9px;padding:2px 8px;opacity:.85}
  .ghd .projhandoff:hover{opacity:1}
  /* ⇄ Handoff v2 — inline live panel (per-session + per-project). Shows EXACTLY the clipboard
     text (same source: generateHandoff/generateProjectHandoff). Revealed by the host stream. */
  .hoffp{margin-top:6px;border:1px solid var(--purple);border-radius:6px;background:var(--vscode-editorWidget-background,var(--vscode-input-background));padding:7px 8px}
  .hoffp[hidden]{display:none}
  .hoffp-st{font-size:9px;font-weight:600;color:var(--purple);margin-bottom:5px;letter-spacing:.03em}
  .hoffp-pre{margin:0;max-height:260px;overflow:auto;font-family:var(--vscode-editor-font-family,monospace);font-size:10px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:var(--vscode-foreground)}
  .hoffp .hoffcopy{margin-top:7px;width:auto;padding:2px 10px}
  /* ⇄ F2 live streaming: pulsing "a gerar narrativa…" indicator next to the status line */
  .hoffp-st .gendot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--purple);margin-right:5px;vertical-align:middle;animation:hoffgen 1s ease-in-out infinite}
  @keyframes hoffgen{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1.1)}}
  @media (prefers-reduced-motion:reduce){.hoffp-st .gendot{animation:none}}
  /* WCOCKPIT-7: compact drawer — integrations inline & icon-only, per-session close, bulk clear */
  .sdrawer{margin-top:4px;padding-top:4px}
  .sseg{margin-top:0}
  .sseg .smode{padding:2px 2px;font-size:10px}
  .sctrl{margin-top:4px;gap:4px;align-items:center;flex-wrap:nowrap}
  .sint{display:inline-flex;align-items:center;gap:4px;margin-left:2px}
  .intchip{opacity:.6;padding:0;gap:0}
  .intchip.on{opacity:1}
  .intchip:hover{opacity:.85}
  button.sarch{margin-left:auto;flex:none;padding:2px 7px;font-size:10px;opacity:.5;border-radius:4px;line-height:1.4;border-color:transparent}
  button.sarch:hover{opacity:1;color:var(--t3);border-color:var(--t3)}
  /* WCOCKPIT-7 a11y: visible keyboard focus for the new icon buttons (WCAG 2.4.7) */
  button.sarch:focus-visible,button.intrefresh:focus-visible,.clrdone:focus-visible{outline:2px solid var(--r);outline-offset:1px;opacity:1}
  .clrdone{font-size:9px;padding:1px 8px;border-radius:9px;opacity:.85;cursor:pointer;background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);color:var(--vscode-foreground);line-height:1.5}
  .clrdone:hover{opacity:1;border-color:var(--r);color:var(--r)}
  /* WCOCKPIT-4: git stage chip + safety tip */
  .sgit{display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap}
  .gstage{display:inline-flex;align-items:center;gap:2px;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:600}
  .gstage.clean{color:var(--g);background:var(--gdim)}
  .gstage.dirty{color:var(--acc-warm);background:rgba(229,192,123,.12)}
  .gstage.staged{color:var(--blue);background:rgba(90,155,212,.12)}
  .gstage.ahead{color:var(--blue);background:rgba(90,155,212,.12)}
  .gtip{font-size:9px;color:var(--acc-warm);font-weight:600}
  /* WCOCKPIT-10: Project Stage Rail + safe-to-close chip + plain next-move */
  .srail{display:flex;justify-content:space-between;position:relative;margin:6px 3px 2px}
  .srail::before{content:"";position:absolute;left:11px;right:11px;top:11px;height:2px;background:var(--vscode-widget-border);z-index:0}
  .sdot{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;z-index:1;border:1px solid var(--vscode-widget-border);background:var(--vscode-editorWidget-background)}
  .sdot.done{color:var(--g);background:var(--gdim);border-color:var(--g)}
  .sdot.now{color:var(--r);background:var(--rdim);border-color:var(--r);animation:srnow 1.7s ease-in-out infinite}
  .sdot.todo{opacity:.45}
  @keyframes srnow{0%,100%{opacity:1}50%{opacity:.45}}
  .snow{font-size:11px;color:var(--vscode-foreground);margin:3px 2px 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .snowtxt{opacity:.9}
  .snowbtn{font-size:9.5px;padding:1px 8px;border-radius:9px;background:var(--rdim);color:var(--r);border:1px solid var(--r);cursor:pointer;line-height:1.6}
  .snowbtn:hover{opacity:.85}
  .snowhint{font-size:9.5px;color:var(--blue);opacity:.85}
  .sbehind{font-size:9.5px;color:var(--blue);margin:2px 2px 0;opacity:.85}
  .ssafe{font-size:9px;border-radius:10px;padding:1px 7px;margin-left:6px;font-weight:600}
  .ssafe.green{color:var(--g);background:var(--gdim)}
  .ssafe.amber{color:var(--acc-warm);background:rgba(229,192,123,.12)}
  .ssafe.blue{color:var(--blue);background:rgba(90,155,212,.12)}
  .ssafe.repo{color:var(--vscode-descriptionForeground);background:rgba(128,128,128,.12);font-weight:500}
  /* WCOCKPIT-9 (Bloco B): progressive disclosure — controls reveal ONLY on selection
     (.on / :focus-within), NOT on hover, so hovering keeps the card at its compact 1-line
     height. The ⋯ hint stays on hover ("click to expand") and clears once the drawer opens. */
  .sdrawer{display:none;margin-top:5px;padding-top:5px;border-top:1px dashed var(--vscode-widget-border)}
  .srow.on .sdrawer,.srow:focus-within .sdrawer{display:block}
  .srow{position:relative}
  .srow::after{content:"⋯";position:absolute;right:8px;bottom:3px;font-size:11px;opacity:.3;line-height:1}
  .srow:hover::after{opacity:.6}
  .srow.on::after,.srow:focus-within::after{content:""}
  /* WCOCKPIT-6: group header rollup (branch + git stage once per project) */
  .ghd{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:11px 2px 4px;font-size:9px;letter-spacing:.04em}
  .ghkey{text-transform:uppercase;opacity:.65;font-weight:600}
  .ghsrc{font-weight:600;text-transform:none;letter-spacing:0;font-size:8.5px;opacity:.85}
  .ghsrc.cw{color:var(--blue-bright)}
  .ghsrc.repo{color:var(--vscode-descriptionForeground)}
  .ghsrc.none{color:var(--acc-warm)}
  .ghrepo{font-family:var(--vscode-editor-font-family,monospace);background:var(--surface2);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:1px 6px;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:none;letter-spacing:0;opacity:.7}
  .ghcount{margin-left:auto;opacity:.55;text-transform:uppercase;white-space:nowrap}
  .ghmeta{display:inline-flex;align-items:center;gap:5px;flex-wrap:wrap}
  .ghbr{font-family:var(--vscode-editor-font-family,monospace);background:var(--surface2);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:1px 6px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ghg{display:inline-flex;align-items:center;gap:2px;padding:1px 6px;border-radius:8px;font-weight:600}
  .ghg.clean{color:var(--g);background:var(--gdim)}
  .ghg.dirty{color:var(--acc-warm);background:rgba(229,192,123,.12)}
  .ghg.staged,.ghg.ahead{color:var(--blue);background:rgba(90,155,212,.12)}
  .ghtip{color:var(--acc-warm);font-weight:600}
  .hero .lbl{color:var(--bmuted)}.hero .sub{color:var(--bmuted)}.hero .sub b{color:var(--btext)}
  .term{background:var(--ttybg)!important;border-top:14px solid var(--ttyhd)}
  .stars{display:inline-flex;gap:2px;margin-left:8px}.stars span{cursor:pointer;opacity:.4;font-size:12px}.stars span:hover,.stars span.on{opacity:1}
  .intentwrap{display:flex;gap:6px;margin:0 0 10px}
  .intentwrap input{flex:1;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--vscode-widget-border);border-radius:6px;padding:6px 10px;font:12px var(--vscode-font-family)}
  .intentres{font-size:11px;color:var(--vscode-descriptionForeground);margin:-4px 0 8px;display:none}
  .intentres b{color:var(--g)}
  .lbl{font-size:10px;letter-spacing:.7px;text-transform:uppercase;color:var(--vscode-descriptionForeground)}
  .collaphead{cursor:pointer;user-select:none;outline:none}
  .collaphead:hover{color:var(--vscode-foreground)}
  .collaphead:focus-visible{outline:1px solid var(--r);outline-offset:2px;border-radius:3px}
  .chev{display:inline-block;font-size:8px;opacity:.5;margin-right:6px;transition:transform .15s ease;vertical-align:middle}
  .card.collapsed .chev{transform:rotate(-90deg)}
  .card.collapsed>*:not(.collaphead){display:none!important}
  .grpsec.collapsed>*:not(.collaphead){display:none!important}
  .grpsec.collapsed .chev{transform:rotate(-90deg)}
  .grpsec>.ghd.collaphead{cursor:pointer}
  .card.collapsed{padding-bottom:12px}
  .arow{display:flex;align-items:center;gap:7px;font-size:11px;padding:5px 0;border-top:1px solid var(--vscode-widget-border)}
  .arow .amodel{font-weight:600;white-space:nowrap}
  .arow .arole{opacity:.7;white-space:nowrap;font-size:10px}
  .arow .atask{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.55}
  .adot{width:14px;text-align:center;font-size:10px;flex:none}.adot.done{color:var(--g)}.adot.q{opacity:.45}.adot.fail{color:var(--t3)}
  .aprog{font-variant-numeric:tabular-nums;font-size:10px;color:var(--g);min-width:30px;text-align:right}
  .apar{float:right;opacity:.75;font-size:9px;font-weight:600}
  .big{font-size:27px;font-weight:700;color:var(--g);font-variant-numeric:tabular-nums}
  .sub{font-size:12px;color:var(--vscode-descriptionForeground)}.sub b{color:var(--vscode-foreground)}
  .row{display:flex;gap:6px}.row .card{flex:1;padding:8px 10px}
  .v{font-size:15px;font-weight:600}.k{font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:var(--vscode-descriptionForeground)}
  .bar{display:flex;align-items:center;gap:7px;margin:5px 0;font-size:11px}
  .bar .t{width:58px;color:var(--vscode-descriptionForeground)}.bar .tr{flex:1;height:6px;background:var(--vscode-input-background);border-radius:3px;overflow:hidden}
  .bar .f{height:100%}.bar .p{width:56px;text-align:right;color:var(--vscode-descriptionForeground)}
  button{font-family:inherit;cursor:pointer;border-radius:5px;border:1px solid var(--vscode-widget-border);background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));color:var(--vscode-foreground);padding:5px 10px;font-size:11.5px}
  button.go{width:100%;background:var(--r);color:var(--on-bright);border:none;padding:9px;font-size:12.5px;font-weight:700}
  button.go:hover{filter:brightness(1.08)}button.sm{padding:3px 9px;font-size:10.5px}
  .hint{text-align:center;font-size:10.5px;color:var(--vscode-descriptionForeground);margin-top:6px}
  .dec{border:1px solid var(--vscode-widget-border);border-radius:5px;margin-bottom:6px;cursor:pointer;background:var(--vscode-editorWidget-background)}
  .dec:hover{background:var(--vscode-list-hoverBackground)}
  .dtop{display:flex;align-items:center;gap:7px;padding:7px 9px}
  .chip{font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;flex:none;border:1px solid}
  .T0{color:var(--t0);border-color:var(--t0)}.T1{color:var(--t1);border-color:var(--t1)}.T2{color:var(--t2);border-color:var(--t2)}.T3{color:var(--t3);border-color:var(--t3)}
  .prev{flex:1;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--vscode-editor-font-family)}
  .meta{font-size:10px;color:var(--vscode-descriptionForeground)}
  .ddet{display:none;border-top:1px solid var(--vscode-widget-border);padding:7px 9px;font-size:11px;color:var(--vscode-descriptionForeground)}
  .dec.open .ddet{display:block}.ddet b{color:var(--vscode-foreground)}
  .empty{text-align:center;padding:26px 8px;color:var(--vscode-descriptionForeground);font-size:12px}
  .dr{display:flex;gap:8px;padding:7px 4px;border-bottom:1px solid var(--vscode-widget-border);font-size:12px;align-items:center}
  .dr:last-child{border:none}.dr .w{flex:1}.dr small{display:block;color:var(--vscode-descriptionForeground);font-size:10.5px}
  .seg{display:flex;background:var(--vscode-input-background);border-radius:7px;padding:3px;gap:2px}
  .seg .mo{flex:1;min-width:0;padding:7px 3px;font-size:10.5px;border-radius:5px;cursor:pointer;color:var(--vscode-descriptionForeground);text-align:center;border:1px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .seg .mo.on{background:var(--rdim);color:var(--r);font-weight:700;border-color:var(--r)}
  .seg .mo small{display:block;font-size:9px;font-weight:400;margin-top:1px}
  .pincard{margin-bottom:8px;border:1px solid var(--r);border-left:3px solid var(--r);background:linear-gradient(180deg,var(--rdim),transparent 70%)}
  .pinhead{font-size:13px;font-weight:700;color:var(--r);display:flex;align-items:center;gap:6px}
  .pinsub{font-size:9.5px;color:var(--vscode-descriptionForeground);margin:3px 0 8px}
  .pinsel{width:100%;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--r);border-radius:6px;padding:7px 9px;font:12px var(--vscode-font-family);cursor:pointer}
  .pinsel:focus-visible{outline:2px solid var(--r);outline-offset:1px}
  .pinnow{font-size:10px;color:var(--r);margin-top:6px}
  .pill{display:inline-block;font-size:10.5px;border:1px solid var(--vscode-widget-border);border-radius:9px;padding:2px 9px;margin:2px 3px 2px 0}
  .pill.ok{border-color:var(--g);color:var(--g)}.pill.warn{border-color:var(--acc-warm);color:var(--acc-warm)}
  .term{background:var(--ink);border-radius:7px;padding:10px 12px;font:11.5px var(--vscode-editor-font-family);color:var(--ttyfg);overflow-x:auto;white-space:pre;line-height:1.7}
  .wstep{display:flex;gap:10px;align-items:flex-start;padding:9px 4px;border-bottom:1px solid var(--vscode-widget-border)}
  .wstep:last-child{border:none}.wstep .n{width:20px;height:20px;border-radius:50%;background:var(--gdim);color:var(--g);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
  .wstep.done .n{background:var(--g);color:var(--on-bright)}
  .wstep .w{flex:1;font-size:12px}.wstep small{display:block;color:var(--vscode-descriptionForeground);font-size:10.5px;margin-top:1px}
  .scorebar{height:8px;background:var(--vscode-input-background);border-radius:4px;overflow:hidden;margin:8px 0 4px}
  .scorebar .f{height:100%;background:linear-gradient(90deg,var(--r),var(--acc-warm) 50%,var(--g));border-radius:4px}
  input[type=number]{width:90px;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--vscode-widget-border);border-radius:5px;padding:5px 8px;font:12px var(--vscode-font-family)}
  .pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--g);animation:pu 1.6s infinite;margin-right:6px}@keyframes pu{0%,100%{opacity:1}50%{opacity:.3}}
  .mx{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:6px}.mx th,.mx td{padding:3px 5px;text-align:right;border-bottom:1px solid var(--vscode-widget-border)}.mx th:first-child,.mx td:first-child{text-align:left;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mx th{color:var(--vscode-descriptionForeground);font-weight:600}.mx td.sv{color:var(--g)}
  .kv{display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0}.kv span:first-child{color:var(--vscode-descriptionForeground)}
  /* B1 — optimistic perceived-speed: o controlo salta JÁ; "a aplicar…" pulsa no painel até o snapshot reconciliar */
  .applytag{font-size:9px;color:var(--acc-warm);margin-left:6px;opacity:.9;white-space:nowrap;animation:applypulse 1s ease-in-out infinite}
  @keyframes applypulse{0%,100%{opacity:.4}50%{opacity:1}}
  .applying{outline:1px solid rgba(229,192,123,.45);outline-offset:1px}
  @media (prefers-reduced-motion:reduce){.applytag{animation:none}}
  /* B4 — vista viva do moo local por sessão (estado do acumulador, read-only) */
  .smoo{margin-top:6px;padding:6px 7px;border:1px dashed var(--vscode-widget-border);border-radius:6px;background:var(--vscode-editorWidget-background)}
  .smoo-empty{opacity:.5;font-size:9px;border-style:dotted;padding:4px 7px}
  .smoohd{font-size:9.5px;color:var(--vscode-foreground)}
  .smoohd b{color:var(--g)}
  .smooupd{font-size:9px;color:var(--acc-warm);margin-left:4px;animation:applypulse 1s ease-in-out infinite}
  .smoosum{font-size:9.5px;color:var(--vscode-descriptionForeground);margin-top:3px;line-height:1.45;max-height:64px;overflow:auto;white-space:pre-wrap;word-break:break-word}
  .smootools{font-size:9px;color:var(--vscode-descriptionForeground);margin-top:3px;font-family:var(--vscode-editor-font-family,monospace);opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  @media (prefers-reduced-motion:reduce){.smooupd{animation:none}}
  /* B3 — declutter: barra de filtro/procura + modo compacto */
  .herdfilter{margin:2px 0 7px}
  .herdq{width:100%;box-sizing:border-box;font-size:11px;padding:5px 8px;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--vscode-widget-border);border-radius:6px}
  .herdq:focus-visible{outline:1px solid var(--r);outline-offset:1px}
  .herdchips{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}
  button.hf{font-size:9.5px;padding:2px 8px;border-radius:9px;opacity:.6;line-height:1.5;border:1px solid var(--vscode-widget-border);background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));color:var(--vscode-foreground)}
  button.hf:hover{opacity:.85}
  button.hf.on{opacity:1;border-color:var(--r);color:var(--r);background:var(--rdim)}
  button.hf b{font-variant-numeric:tabular-nums;margin-left:2px}
  button.hf.hfcompact.on{border-color:var(--g);color:var(--g);background:var(--gdim)}
  button.hf:focus-visible{outline:2px solid var(--r);outline-offset:1px;opacity:1}
  .herdempty{font-size:10px;color:var(--vscode-descriptionForeground);text-align:center;padding:12px 8px}
  .herdempty button{font-size:9.5px;padding:2px 9px;margin-left:6px}
  .srow[hidden],.grpsec[hidden]{display:none!important}
  /* compacto: esconde as sublines pesadas (mantém nome+estado+modelo na .sline e o drawer na selecção) */
  .herd.compact .sbody>.ssub,.herd.compact .srail,.herd.compact .snow,.herd.compact .sbehind,.herd.compact .sgit,.herd.compact .sscm{display:none}
  /* ── MISSION CONTROL TAB · Frente G ── */
  .mc-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:2px 0 10px}
  .mc-title{font-size:13px;font-weight:700;color:var(--r)}.mc-proj{font-size:11px;color:var(--vscode-descriptionForeground);font-weight:400}
  .mc-pilot{display:flex;flex-wrap:wrap;gap:5px;margin-left:auto}
  .mc-btn{font-size:11px;padding:3px 9px;border-radius:7px;border:1px solid var(--vscode-widget-border);background:var(--vscode-editorWidget-background);color:var(--vscode-foreground);cursor:pointer}
  .mc-btn:hover{border-color:var(--r)}.mc-btn.mc-ok{border-color:var(--g);color:var(--g)}.mc-btn.mc-warn{border-color:var(--t3);color:var(--t3)}
  .mc-btn.mc-mini{font-size:10px;padding:1px 7px}
  .mc-card{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:11px;margin-bottom:8px}
  .mc-lbl{font-size:11px;font-weight:700;color:var(--vscode-foreground);margin-bottom:7px}.mc-lbl2{margin-top:11px}
  .mc-cnt{float:right;opacity:.6;font-weight:400}.mc-sub2{font-weight:400;opacity:.6;font-size:9.5px}
  .mc-nd{color:var(--vscode-descriptionForeground);opacity:.7;font-style:italic;font-size:11px}
  .mc-sub{font-size:9.5px;color:var(--vscode-descriptionForeground);margin-top:5px}
  .mc-totals{display:flex;flex-wrap:wrap;gap:4px}.mc-tot{flex:1;min-width:64px;text-align:center;padding:5px 4px;border-radius:6px;background:var(--vscode-editor-background)}
  .mc-totv{font-size:14px;font-weight:700}.mc-totl{font-size:9px;color:var(--vscode-descriptionForeground);margin-top:1px}
  .mc-tot.mc-ok .mc-totv{color:var(--g)}.mc-tot.mc-warn .mc-totv{color:var(--t3)}.mc-tot.mc-need .mc-totv{color:var(--acc-warm)}
  .mc-chips{display:flex;flex-wrap:wrap;gap:5px}
  .mc-chip{font-size:10.5px;padding:2px 8px;border-radius:8px;border:1px solid var(--vscode-widget-border);display:inline-flex;align-items:center;gap:4px}
  .mc-chip.mc-q,.mc-eg .mc-chip{cursor:pointer;background:var(--vscode-editor-background)}.mc-chip.mc-q:hover{border-color:var(--g)}
  .mc-dot{display:inline-block;width:8px;height:8px;border-radius:50%;font-size:8px;line-height:8px}
  .mc-dot.mc-work{background:var(--g);box-shadow:0 0 0 0 rgba(76,175,106,.5);animation:mcpulse 1.6s infinite}
  @keyframes mcpulse{0%{box-shadow:0 0 0 0 rgba(76,175,106,.5)}70%{box-shadow:0 0 0 5px rgba(76,175,106,0)}100%{box-shadow:0 0 0 0 rgba(76,175,106,0)}}
  .mc-tier{font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px}
  .mc-T0{background:var(--gdim);color:var(--t0)}.mc-T1{color:var(--t1)}.mc-T2{color:var(--t2)}.mc-T3{background:var(--rdim);color:var(--t3)}.mc-T5{color:var(--acc-warm)}.mc-tnd{color:var(--vscode-descriptionForeground)}
  .mc-gpubar{height:10px;border-radius:5px;background:var(--vscode-editor-background);overflow:hidden;border:1px solid var(--vscode-widget-border)}
  .mc-gpufill{height:100%;background:linear-gradient(90deg,var(--g),var(--t3))}
  .mc-gpumeta{font-size:10.5px;margin-top:5px}.mc-gpuact{margin-top:7px}
  .mc-loops{display:flex;flex-direction:column;gap:4px}.mc-loop{font-size:10.5px;display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px;background:var(--vscode-editor-background)}.mc-loop.mc-on{border-left:3px solid var(--g)}
  .mc-tree{display:flex;flex-direction:column;gap:4px}
  .mc-treerow{width:100%;text-align:left;display:flex;flex-wrap:wrap;align-items:center;gap:7px;font-size:10.5px;padding:4px 7px;border:1px solid var(--vscode-widget-border);border-left:3px solid var(--g);border-radius:6px;background:var(--vscode-editorWidget-background);color:var(--vscode-foreground);cursor:pointer}
  .mc-treerow:hover{background:var(--vscode-list-hoverBackground)}.mc-treerow.mc-nolink{cursor:default;border-left-color:var(--vscode-widget-border);opacity:.8}
  .mc-twt{font-weight:600}.mc-tbr{color:var(--g)}.mc-tsha{font-family:monospace;opacity:.7}
  .mc-mark{font-size:9px;padding:0 4px;border-radius:4px;background:var(--vscode-editor-background)}.mc-mark.mc-warn{color:var(--t3)}
  .mc-sess{display:flex;flex-direction:column;gap:5px}
  .mc-srow{padding:5px 7px;border:1px solid var(--vscode-widget-border);border-radius:6px;background:var(--vscode-editorWidget-background)}
  .mc-sl{display:flex;align-items:center;gap:6px}.mc-cow{font-size:15px}.mc-sname{font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mc-sm{font-size:10px;color:var(--vscode-descriptionForeground);margin-top:3px;display:flex;flex-wrap:wrap;align-items:center;gap:4px}
  .mc-model{color:var(--vscode-foreground);opacity:.85}
  .mc-badge{font-size:10px}.mc-syn{font-size:9px;font-weight:700;padding:0 3px;border-radius:3px}.mc-syn.mc-ok{color:var(--g);background:var(--gdim)}.mc-syn.mc-off{color:var(--vscode-descriptionForeground);opacity:.5}
  .mc-dev{font-size:10px}.mc-dev.mc-local{opacity:.6}
  .mc-link{font-size:10px;border:none;background:none;color:var(--g);cursor:pointer;padding:0;text-decoration:underline}.mc-link.mc-nolink{color:var(--vscode-descriptionForeground);cursor:default;text-decoration:none}
  .mc-mooin{display:flex;gap:5px;margin:7px 0}.mc-mooin input{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,var(--vscode-widget-border));border-radius:6px;padding:5px 8px;font-size:11.5px}
  .mc-eg{margin-bottom:7px}.mc-mooout{font-size:11.5px}
  .mc-moobubble{padding:8px 10px;border-radius:8px;background:var(--vscode-editor-background);border:1px solid var(--g);white-space:pre-wrap;line-height:1.45}
  .mc-moomodel{font-size:9px;color:var(--vscode-descriptionForeground);margin-top:4px}.mc-cursor{animation:mcblink 1s step-end infinite}@keyframes mcblink{50%{opacity:0}}
  .mc-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:10px;color:var(--vscode-descriptionForeground);margin:4px 2px 12px}.mc-flinks{margin-left:auto;display:flex;gap:4px}
  /* ── MISSION CONTROL · FIDELITY (mc-fidelity) — mock-faithful rebuild, additive over the legacy .mc-* ── */
  .mcf-pills{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  .mcf-pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;padding:4px 10px;border-radius:14px;border:1px solid var(--vscode-widget-border);color:var(--vscode-descriptionForeground);background:var(--vscode-editor-background);cursor:pointer}
  .mcf-pill:hover{color:var(--vscode-foreground)}
  .mcf-pill.on{border-color:var(--t1);color:var(--vscode-foreground);background:var(--bluedim,rgba(97,175,239,.14));font-weight:600;box-shadow:0 0 0 1px rgba(97,175,239,.25)}
  .mcf-pill .mcf-pdot{width:7px;height:7px;border-radius:50%}
  .mcf-pill.on .mcf-pdot{background:var(--g);box-shadow:0 0 6px var(--g)}
  .mcf-pill.frozen{color:var(--vscode-descriptionForeground);opacity:.72}
  .mcf-pill .mcf-cnt{font-weight:700;color:var(--vscode-foreground)}
  .mcf-menu{margin-left:auto;border:1px solid var(--vscode-widget-border);background:var(--vscode-editor-background);border-radius:8px;width:30px;height:25px;display:flex;align-items:center;justify-content:center;color:var(--vscode-descriptionForeground)}
  .mcf-band{display:flex;align-items:center;gap:13px;flex-wrap:wrap;font-size:12px}
  .mcf-bseg{display:flex;align-items:center;gap:6px}
  .mcf-bk{color:var(--vscode-descriptionForeground)}
  .mcf-arch b{color:var(--vscode-foreground)}.mcf-arch{color:var(--vscode-descriptionForeground)}
  .mcf-hero{color:var(--g);font-weight:700;font-size:14px}
  .mcf-toks{font-weight:600}
  .mcf-vrule{width:1px;height:14px;background:var(--vscode-widget-border)}
  .mcf-mini{display:flex;gap:12px;color:var(--vscode-descriptionForeground);font-size:11px;margin-top:6px}
  .mcf-gpuhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;margin-bottom:9px}
  .mcf-star{color:var(--t3)}
  .mcf-spacer{margin-left:auto}
  .mcf-gauge{display:flex;gap:3px;align-items:stretch;height:16px}
  .mcf-gseg{flex:1;border-radius:3px;background:var(--vscode-editor-background)}
  .mcf-gused{background:var(--g)}
  .mcf-gusedhot{background:linear-gradient(90deg,var(--g),var(--t3))}
  .mcf-gfree{background:repeating-linear-gradient(45deg,rgba(84,181,106,.16),rgba(84,181,106,.16) 4px,transparent 4px,transparent 8px);border:1px dashed rgba(84,181,106,.45)}
  .mcf-glegend{display:flex;gap:14px;margin-top:7px;font-size:10px;color:var(--vscode-descriptionForeground);flex-wrap:wrap}
  .mcf-glegend span{display:inline-flex;align-items:center;gap:5px}
  .mcf-swatch{width:10px;height:10px;border-radius:2px;flex:none}
  .mcf-graph{padding-left:4px}
  .mcf-grow{display:flex;align-items:flex-start}
  .mcf-spine{position:relative;width:26px;flex:none;align-self:stretch;min-height:30px}
  .mcf-line{position:absolute;left:6px;top:0;bottom:0;width:2px;background:var(--vscode-widget-border)}
  .mcf-line.half{bottom:50%}
  .mcf-node{position:absolute;left:1px;top:12px;width:12px;height:12px;border-radius:50%;background:var(--vscode-editorWidget-background);border:2px solid var(--vscode-descriptionForeground);z-index:2}
  .mcf-conn{position:absolute;left:7px;top:18px;width:20px;height:2px}
  .mcf-branch{flex:1;min-width:0}
  .mcf-groot{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--vscode-descriptionForeground);padding:6px 0}
  .mcf-gsha{font-family:var(--vscode-editor-font-family,monospace);color:var(--vscode-descriptionForeground)}
  .mcf-gok{color:var(--g)}
  .mcf-brow{width:100%;text-align:left;display:flex;align-items:center;gap:8px;font-size:11.5px;padding:6px 9px;margin:3px 0;border:1px solid var(--vscode-widget-border);border-radius:8px;background:var(--vscode-editor-background);color:var(--vscode-foreground);cursor:pointer}
  .mcf-brow:hover{background:var(--vscode-list-hoverBackground);border-color:var(--vscode-descriptionForeground)}
  .mcf-brow.attn{border-color:var(--t1);background:rgba(97,175,239,.10)}
  .mcf-brow.nolink{cursor:default;opacity:.85}
  .mcf-bname{font-family:var(--vscode-editor-font-family,monospace);font-weight:600;color:var(--vscode-foreground)}
  .mcf-bchip{font-size:10px;padding:1px 6px;border-radius:5px;background:var(--vscode-editorWidget-background);color:var(--vscode-descriptionForeground);white-space:nowrap}
  .mcf-bchip.dirty{color:var(--t3)}.mcf-bchip.ahead{color:var(--t1)}.mcf-bchip.push{color:var(--t1);background:rgba(97,175,239,.14)}
  .mcf-slet{display:inline-flex;align-items:center;gap:4px;font-weight:700}
  .mcf-sdot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
  .mcf-sdot.work{background:var(--g)}.mcf-sdot.warn{background:var(--t3)}.mcf-sdot.push{background:var(--t1)}.mcf-sdot.idle{background:var(--vscode-descriptionForeground)}
  .mcf-warnx{color:var(--t3)}
  .mcf-stale{font-size:10.5px;color:var(--vscode-descriptionForeground);padding:6px 0 0 30px;cursor:default}
  .mcf-loops{display:flex;gap:7px;flex-wrap:wrap}
  .mcf-loop{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:5px 10px;border-radius:9px;border:1px solid var(--vscode-widget-border);background:var(--vscode-editor-background)}
  .mcf-loop.on{border-left:3px solid var(--g)}
  .mcf-lmeta{color:var(--vscode-descriptionForeground)}
  .mcf-free0{color:var(--g);font-weight:600}
  .mcf-grph{font-size:11.5px;font-weight:600;color:var(--vscode-descriptionForeground);margin:13px 0 7px;display:flex;align-items:center;gap:6px}
  .mcf-scards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:9px}
  .mcf-scard{border:1px solid var(--vscode-widget-border);border-left:3px solid var(--vscode-widget-border);border-radius:9px;background:var(--vscode-editorWidget-background);padding:10px 11px}
  .mcf-scard:hover{border-color:var(--vscode-descriptionForeground)}
  .mcf-scard.attn{border-left-color:var(--t1)}
  .mcf-scard.hot{border-left-color:var(--t3)}
  .mcf-scard.gui{border-left-color:var(--purple)}.mcf-scard.grouter{border-left-color:var(--t2)}.mcf-scard.ginfra{border-left-color:var(--t3)}
  .mcf-stop{display:flex;align-items:center;gap:7px}
  .mcf-sname{font-weight:600;font-size:12.5px;display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .mcf-sname .mcf-let{color:var(--vscode-descriptionForeground);font-weight:700}
  .mcf-smodel{font-size:10.5px;color:var(--vscode-descriptionForeground);margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .mcf-ctxbar{height:4px;border-radius:3px;background:var(--vscode-editor-background);overflow:hidden;flex:1;min-width:36px;max-width:74px}
  .mcf-ctxfill{height:100%;background:var(--g)}
  .mcf-ctxfill.hot{background:var(--r)}
  .mcf-sicons{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px}
  .mcf-cow{font-size:15px;display:inline-block}
  .mcf-cow.work{animation:mcfbob .85s ease-in-out infinite}
  .mcf-cow.loop{animation:mcfspin 1.1s linear infinite}
  @keyframes mcfbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
  @keyframes mcfspin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.mcf-cow.work,.mcf-cow.loop{animation:none}}
  .mcf-sfoot{display:flex;align-items:center;gap:9px;margin-top:8px;padding-top:8px;border-top:1px solid var(--vscode-widget-border);font-size:10.5px;color:var(--vscode-descriptionForeground)}
  .mcf-syn{display:inline-flex;align-items:center;gap:3px}
  .mcf-syn .mcf-d{width:7px;height:7px;border-radius:50%}
  .mcf-syn .mcf-on{background:var(--g)}.mcf-syn .mcf-off{background:var(--vscode-descriptionForeground);opacity:.5}
  .mcf-gitlink{margin-left:auto;color:var(--g);cursor:pointer;border:none;background:none;padding:0;font-size:10.5px}
  .mcf-pushbtn{font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--g);color:var(--g);background:var(--gdim);cursor:pointer;margin-left:auto}
  .mcf-cost{color:var(--g)}
  .mcf-ctxhot{color:var(--r);font-weight:700}
  /* ── GUARDIAN:F1 ── 🪶 compaction-pressure chip (rung colour set inline per session) ── */
  .g-chip{display:inline-flex;align-items:center;gap:3px;font-size:9px;line-height:1;padding:1px 5px;margin-left:5px;border:1px solid currentColor;border-radius:7px;white-space:nowrap;vertical-align:middle;opacity:.92}
  .g-chip.g-advise,.g-chip.g-emergency{font-weight:700}
  /* ── ARCH TREE TAB (Frente E · Arquitectura Viva) — concat-only render from the snapshot ── */
  .arch-wrap{margin-top:2px}
  .arch-seg{display:flex;gap:4px;margin-bottom:9px;flex-wrap:wrap}
  button.arch-mode{font-size:10.5px;padding:4px 10px;border-radius:9px;opacity:.62;line-height:1.5;border:1px solid var(--vscode-widget-border);background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));color:var(--vscode-foreground);cursor:pointer}
  button.arch-mode:hover{opacity:.9}
  button.arch-mode.on{opacity:1;border-color:var(--r);color:var(--r);background:var(--rdim);font-weight:700}
  button.arch-mode:focus-visible{outline:2px solid var(--r);outline-offset:1px;opacity:1}
  .arch-root{font-size:12px;font-weight:700;margin-bottom:6px}
  .arch-dev{font-size:9.5px;font-weight:400;color:var(--vscode-descriptionForeground)}
  .arch-branchrow{font-size:10px;margin:2px 0 7px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-family:var(--vscode-editor-font-family,monospace)}
  .arch-proj{display:inline-flex;align-items:center;gap:4px;background:var(--surface2);border:1px solid var(--vscode-widget-border);border-radius:8px;padding:1px 7px;font-family:var(--vscode-font-family)}
  .arch-dot{width:7px;height:7px;border-radius:50%;flex:none}
  .arch-leaf{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;border:1px solid transparent;cursor:pointer;font-size:11px}
  .arch-leaf[data-arch-sid]:hover{background:var(--vscode-list-hoverBackground);border-color:var(--vscode-widget-border)}
  .arch-leaf.needs{background:rgba(229,192,123,.08)}
  .arch-twig{color:var(--vscode-descriptionForeground);opacity:.5;font-family:var(--vscode-editor-font-family,monospace);flex:none}
  .arch-topic{flex:none}
  .arch-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:30px;flex:0 1 auto}
  .arch-badge{font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:8px;flex:none;display:inline-flex;align-items:center;gap:3px}
  .arch-badge.needs{color:var(--acc-warm);background:rgba(229,192,123,.12)}
  .arch-badge.work{color:var(--g);background:var(--gdim)}
  .arch-badge.idle{color:var(--vscode-descriptionForeground);background:var(--surface2)}
  .arch-model{font-size:9.5px;color:var(--vscode-descriptionForeground);flex:none;white-space:nowrap}
  .arch-tier{font-weight:700}
  .arch-tok{font-size:9px;color:var(--vscode-descriptionForeground);font-family:var(--vscode-editor-font-family,monospace);flex:none;white-space:nowrap}
  .arch-ctx{font-size:9px;color:var(--vscode-descriptionForeground);flex:none}
  .arch-ctx.hot{color:var(--danger);font-weight:700}
  .arch-int{display:inline-flex;align-items:center;gap:3px;margin-left:auto;flex:none}
  .arch-flow{font-size:10px}
  .arch-sync{font-size:10px;opacity:.85}
  .arch-sync.on{opacity:1;color:var(--g)}
  .arch-open{font-size:11px;color:var(--vscode-descriptionForeground);opacity:.45;flex:none}
  .arch-leaf:hover .arch-open{opacity:1;color:var(--g)}
  .arch-nd{font-size:9px;color:var(--vscode-descriptionForeground);opacity:.65;font-style:italic}
  /* CEO */
  .arch-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:4px 0 10px}
  .arch-kpi{background:var(--surface2);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:7px 8px;text-align:center}
  .arch-kpiv{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
  .arch-kpik{font-size:8.5px;color:var(--vscode-descriptionForeground);margin-top:2px;text-transform:uppercase;letter-spacing:.04em}
  .arch-attn{margin:4px 0 10px;padding:7px 8px;border:1px solid rgba(229,192,123,.3);border-radius:7px;background:rgba(229,192,123,.04)}
  .arch-attn .lbl{font-size:10.5px;font-weight:700;margin-bottom:4px}
  .arch-portfolio .lbl{font-size:10.5px;font-weight:700;margin-bottom:4px}
  .arch-pfrow{display:flex;align-items:center;gap:7px;padding:3px 4px;font-size:10.5px;border-top:1px solid var(--vscode-widget-border)}
  /* Working-tree */
  .arch-wtsec{margin-bottom:9px}
  .arch-wtsec .lbl{font-size:10px;font-weight:700;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
  .arch-conn{display:flex;align-items:center;gap:7px;padding:3px 2px;font-size:10.5px;flex-wrap:wrap}
  .arch-node{flex:none}
  .arch-node.to{font-weight:600}
  .arch-wire{display:inline-flex;align-items:center;color:var(--vscode-descriptionForeground)}
  .arch-dash{display:inline-block;width:34px;height:0;border-top:2px dashed var(--vscode-descriptionForeground);opacity:.45}
  .arch-dash.live{border-top-color:var(--g);opacity:1;background-image:none;animation:archflow 0.9s linear infinite}
  @keyframes archflow{0%{background-position:0 0}100%{background-position:14px 0}}
  .arch-dash.live{border-top-style:dashed;background:repeating-linear-gradient(90deg,var(--g) 0 6px,transparent 6px 12px) 0/14px 2px no-repeat;border-top:0;height:2px}
  .arch-pending{font-size:10px;color:var(--vscode-descriptionForeground);opacity:.8;padding:4px 6px;border:1px dashed var(--vscode-widget-border);border-radius:6px;background:var(--surface2)}
  @media (prefers-reduced-motion:reduce){.arch-dash.live{animation:none}}
  /* ── MC VISUAL POLISH (feat/mc-visual-polish) — render-only approximation to the Cowork mocks ── */
  /* Árvore: root Cowork·Opus → main → frentes + pulsing status dots + frozen portfolio chips */
  .arch-rootmodel{font-size:10px;font-weight:600;color:var(--acc-warm)}
  .arch-mainline{font-size:11px;margin:2px 0 6px;font-family:var(--vscode-editor-font-family,monospace)}
  .arch-mainproj{font-weight:600}
  .arch-frentes{display:flex;flex-direction:column;gap:2px}
  .arch-proj.frozen{opacity:.6;font-style:italic}
  .arch-sdot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
  .arch-sdot.work{background:var(--g);animation:archpulse 1.5s infinite}
  .arch-sdot.need{background:var(--acc-warm);animation:archpulse 1.1s infinite}
  .arch-sdot.done{background:var(--blue)}
  @keyframes archpulse{0%,100%{opacity:1}50%{opacity:.35}}
  @media (prefers-reduced-motion:reduce){.arch-sdot.work,.arch-sdot.need{animation:none}}
  /* CEO: attention-first sections */
  .arch-sec{margin:6px 0;padding:6px 8px;border:1px solid var(--vscode-widget-border);border-radius:7px;background:var(--vscode-editor-background)}
  .arch-sec.empty{opacity:.7}
  .arch-seclbl{font-size:10.5px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px}
  .arch-seccnt{font-size:9px;opacity:.7;font-weight:400}
  /* Working-tree: real git-graph (spine + coloured branch nodes) + right-side flow nodes */
  .arch-wtgrid{display:flex;gap:12px;flex-wrap:wrap}
  .arch-wtgrid>.arch-gitsec{flex:1 1 240px;min-width:200px}
  .arch-wtright{flex:1 1 240px;min-width:200px;display:flex;flex-direction:column}
  .arch-gitsec{margin-bottom:9px}
  .arch-gitsec>.lbl{font-size:10px;font-weight:700;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px}
  .arch-git{display:flex;flex-direction:column;gap:3px;margin-top:4px;border-left:2px solid var(--vscode-widget-border);padding-left:10px}
  .arch-gitmain{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700}
  .arch-gnode{width:9px;height:9px;border-radius:50%;flex:none;background:var(--vscode-descriptionForeground);margin-left:-15px;margin-right:2px;border:2px solid var(--vscode-editorWidget-background)}
  .arch-gnode.main{background:var(--vscode-foreground)}
  .arch-gitrow.st-work .arch-gnode{background:var(--g)}
  .arch-gitrow.st-need .arch-gnode{background:var(--acc-warm)}
  .arch-gitrow.st-ahead .arch-gnode{background:var(--blue)}
  .arch-gitrow.st-dirty .arch-gnode{background:var(--acc-orange)}
  .arch-gbr{font-family:var(--vscode-editor-font-family,monospace);font-weight:600;flex:none}
  .arch-mk{font-size:9px;padding:0 4px;border-radius:4px;background:var(--surface2);flex:none}
  .arch-mk.dirty{color:var(--acc-orange)}.arch-mk.ahead{color:var(--blue)}
  /* MC tab: frozen chips · overclock button · loop icon · git-graph · pillar groups · session state edge */
  .mc-chip.mc-frozen{opacity:.6;font-style:italic}
  .mc-btn.mc-overclock{border-color:var(--acc-orange);color:var(--acc-orange);font-weight:700}
  /* ── GUARDIAN:F3 ── ⇄ Saltar para fresca (MC): amber accent, only rendered at the delirium threshold */
  .mc-btn.mc-jump{border-color:var(--acc-warm);color:var(--acc-warm);font-weight:700}
  .mcf-jumprow{margin-top:5px}
  .mc-loopico{font-size:11px}
  .mc-git{display:flex;flex-direction:column;gap:3px;margin-top:4px;border-left:2px solid var(--vscode-widget-border);padding-left:10px}
  .mc-gmain{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;margin-bottom:2px}
  .mc-gnode{width:9px;height:9px;border-radius:50%;flex:none;background:var(--vscode-descriptionForeground);margin-left:-15px;margin-right:2px;border:2px solid var(--vscode-editorWidget-background)}
  .mc-gnode.mc-main{background:var(--vscode-foreground)}
  .mc-gitrow.mc-st-work .mc-gnode{background:var(--g)}
  .mc-gitrow.mc-st-need .mc-gnode{background:var(--acc-warm)}
  .mc-gitrow.mc-st-ahead .mc-gnode{background:var(--blue)}
  .mc-gitrow.mc-st-dirty .mc-gnode{background:var(--acc-orange)}
  .mc-treerow.mc-st-work{border-left-color:var(--g)}
  .mc-treerow.mc-st-need{border-left-color:var(--acc-warm)}
  .mc-treerow.mc-st-ahead{border-left-color:var(--blue)}
  .mc-treerow.mc-st-dirty{border-left-color:var(--acc-orange)}
  .mc-treerow.mc-st-idle{border-left-color:var(--vscode-widget-border)}
  .mc-gmodel{font-size:9px;color:var(--vscode-descriptionForeground)}
  .mc-gtok{font-size:9px;font-family:var(--vscode-editor-font-family,monospace);opacity:.8}
  .mc-pgrp{margin-top:8px}
  .mc-pgrp-h{font-size:10px;font-weight:700;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.03em;margin:4px 0;display:flex;align-items:center;gap:6px}
  .mc-stop{font-size:12px;flex:none}
  .mc-srow.mc-st-work{border-left:3px solid var(--g)}
  .mc-srow.mc-st-need{border-left:3px solid var(--acc-warm)}
  .mc-srow.mc-st-ahead{border-left:3px solid var(--blue)}
  .mc-srow.mc-st-dirty{border-left:3px solid var(--acc-orange)}
  /* ── DELIVERY COCKPIT · Frente B (🛩️ Project command) — restraint: cada elemento é uma feature ── */
  .pc-wrap{font-size:11.5px}
  .pc-head{display:flex;align-items:center;gap:8px;margin:2px 0 8px}
  .pc-brand{font-size:15px}
  .pc-title{font-weight:700;font-size:13px}
  .pc-headcount{font-size:10px;color:var(--bmuted);font-variant-numeric:tabular-nums}
  .pc-spacer{flex:1}
  .pc-banner{border-radius:7px;padding:8px 10px;margin-bottom:8px;font-size:11px;line-height:1.5;border:1px solid var(--vscode-widget-border)}
  .pc-banner.pc-warn{background:rgba(229,192,123,.06);border-color:rgba(229,192,123,.3)}
  .pc-banner.pc-stale{background:var(--rdim);border-color:var(--r);color:var(--r2)}
  .pc-cli{font-family:var(--vscode-editor-font-family,monospace);font-size:10.5px;background:var(--ttybg);color:var(--ok);border-radius:6px;padding:8px 10px;word-break:break-all}
  .pc-scope{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:10px;color:var(--bmuted);margin-bottom:6px}
  .pc-scope b{color:var(--vscode-foreground);font-weight:600}
  .pc-sk{font-variant-numeric:tabular-nums}
  .pc-vr{width:1px;height:11px;background:var(--vscode-widget-border)}
  .pc-legend{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:9.5px;color:var(--bmuted);margin-bottom:12px;padding-bottom:9px;border-bottom:1px solid var(--vscode-widget-border)}
  .pc-phase{margin-bottom:14px}
  .pc-phhd{font-size:11px;font-weight:600;margin-bottom:7px;display:flex;align-items:center;gap:6px}
  .pc-phk{font-size:8.5px;color:var(--bmuted);text-transform:uppercase;letter-spacing:.05em;font-weight:700}
  .pc-phcnt{font-size:9.5px;color:var(--bmuted);background:var(--surface2);border-radius:9px;padding:1px 7px;font-variant-numeric:tabular-nums}
  .pc-sub{font-size:9.5px;color:var(--bmuted);font-weight:400}
  .pc-nd{color:var(--vscode-descriptionForeground);opacity:.7;font-style:italic;font-size:10.5px}
  .pc-red{color:var(--r)!important}
  .pc-amber{color:var(--acc-orange)!important}
  /* wave card */
  .pc-wave{border:1px solid var(--vscode-widget-border);border-radius:8px;padding:10px 11px;margin-bottom:7px;background:var(--vscode-editorWidget-background)}
  .pc-wave.running{border-left:3px solid var(--g)}
  .pc-wave.locked{opacity:.82}
  .pc-wtop{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
  .pc-wid{font-weight:700;font-size:12px;font-variant-numeric:tabular-nums;color:var(--vscode-foreground)}
  .pc-wname{font-weight:600;font-size:11.5px}
  .pc-wbadge{font-size:9.5px;border:1px solid var(--vscode-widget-border);border-radius:6px;padding:1px 6px;color:var(--bmuted)}
  .pc-st{font-size:9.5px;border-radius:6px;padding:1px 7px;font-weight:600}
  .pc-st.pc-run{color:var(--g);background:var(--gdim)}
  .pc-st.pc-cone{color:var(--g);background:var(--gdim)}
  .pc-st.pc-cal{color:var(--acc-orange);background:rgba(209,154,102,.12)}
  .pc-st.pc-nob{color:var(--bmuted);background:var(--surface2)}
  .pc-wgoal{font-size:10.5px;color:var(--bmuted);margin:5px 0 6px;line-height:1.45}
  .pc-fc{font-size:10.5px;border-radius:6px;padding:6px 8px;margin-bottom:6px;line-height:1.5}
  .pc-fc-cone{background:var(--gdim)}
  .pc-fc-cal{background:rgba(209,154,102,.08);color:var(--vscode-foreground)}
  .pc-fc-nob{background:var(--surface2);color:var(--bmuted)}
  .pc-fk{font-size:9px;color:var(--bmuted);text-transform:uppercase;letter-spacing:.04em;margin-right:2px}
  .pc-await{font-size:9px;color:var(--bmuted);margin-top:3px;font-style:italic}
  .pc-rel{font-size:9.5px;color:var(--bmuted)}
  .pc-wmeta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
  .pc-deps{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
  .pc-depk{font-size:9px;color:var(--bmuted);text-transform:uppercase;letter-spacing:.04em;margin-right:2px}
  .pc-dep{font-size:9.5px;border-radius:6px;padding:1px 6px;font-variant-numeric:tabular-nums}
  .pc-dep.met{color:var(--g);background:var(--gdim)}
  .pc-dep.wait{color:var(--acc-orange);background:rgba(209,154,102,.1)}
  .pc-dep.none{color:var(--bmuted)}
  .pc-prog{display:flex;align-items:center;gap:8px;margin-bottom:7px}
  .pc-progk{font-size:9.5px;color:var(--bmuted);font-variant-numeric:tabular-nums;white-space:nowrap}
  .pc-progbar{flex:1;height:6px;background:var(--surface2);border-radius:4px;overflow:hidden;min-width:60px}
  .pc-progfill{display:block;height:100%;background:var(--g);border-radius:4px;transition:width .5s ease}
  .pc-progpct{font-size:9.5px;color:var(--g);font-variant-numeric:tabular-nums;font-weight:600}
  .pc-wacts{display:flex;align-items:center;gap:7px;margin-top:2px}
  .pc-btn{font-size:10px;border:1px solid var(--vscode-widget-border);border-radius:6px;padding:3px 9px;cursor:pointer;background:var(--vscode-button-secondaryBackground,var(--surface2));color:var(--vscode-foreground)}
  .pc-btn:hover{border-color:var(--g)}
  .pc-btn.pc-mini{padding:2px 7px}
  .pc-play{color:var(--g);border-color:rgba(76,175,106,.4);font-weight:600}
  .pc-lock{font-size:10px;color:var(--acc-orange);background:rgba(209,154,102,.1);border-radius:6px;padding:3px 9px}
  .pc-chev{font-size:10px;border:none;background:none;color:var(--bmuted);cursor:pointer;padding:3px 4px;font-variant-numeric:tabular-nums}
  .pc-chev:hover{color:var(--vscode-foreground)}
  .pc-chev.open{color:var(--vscode-foreground)}
  .pc-chevi{display:inline-block;width:9px}
  .pc-subs{margin-top:7px;border-top:1px solid var(--vscode-widget-border);padding-top:6px}
  .pc-subs.open{border-top:0;padding-top:0}
  .pc-srow{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:6px;font-size:10.5px}
  .pc-srow.link{cursor:pointer}
  .pc-srow.link:hover{background:var(--vscode-list-hoverBackground)}
  .pc-srow.dirty{border-left:2px solid var(--r)}
  .pc-sdot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--bmuted)}
  .pc-sdot.work{background:var(--g)}
  .pc-sdot.warn{background:var(--acc-warm)}
  .pc-sdot.idle{background:var(--bmuted);opacity:.5}
  .pc-stopic{flex:none}
  .pc-sname{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
  .pc-gitpin{font-family:var(--vscode-editor-font-family,monospace);font-size:9.5px;display:inline-flex;gap:1px;align-items:baseline}
  .pc-branch{color:var(--vscode-foreground)}
  .pc-sha{color:var(--bmuted)}
  .pc-chip{font-size:9.5px;font-variant-numeric:tabular-nums;color:var(--bmuted);border:1px solid var(--vscode-widget-border);border-radius:5px;padding:0 5px}
  .pc-chip.pc-red{border-color:rgba(232,136,138,.5)}
  .pc-open{font-size:11px;flex:none}
  .pc-foot{margin-top:14px;padding-top:10px;border-top:1px solid var(--vscode-widget-border)}
  .pc-gloss{font-size:9.5px;color:var(--bmuted);line-height:1.6;margin-bottom:8px}
  .pc-gloss b{color:var(--vscode-foreground);font-weight:600}
  .pc-acts{display:flex;gap:7px;flex-wrap:wrap}
  /* ── v2 · eixo Squad + Fluxo/WIP ── */
  .pc-dim{color:var(--bmuted);font-weight:400}
  .pc-axis{display:inline-flex;border:1px solid var(--vscode-widget-border);border-radius:7px;overflow:hidden;margin-right:6px}
  .pc-axbtn{font-size:10px;border:none;background:none;color:var(--bmuted);cursor:pointer;padding:3px 10px}
  .pc-axbtn.on{background:var(--gdim);color:var(--g);font-weight:600}
  .pc-axbtn:hover{color:var(--vscode-foreground)}
  .pc-frontier{font-size:10px;color:var(--bmuted);line-height:1.5;margin-bottom:8px;padding:6px 9px;border-left:2px solid var(--vscode-widget-border);background:var(--surface2);border-radius:0 6px 6px 0}
  .pc-frontier b{color:var(--vscode-foreground);font-weight:600}
  /* flow / WIP band */
  .pc-flow{border:1px solid var(--vscode-widget-border);border-radius:8px;padding:9px 10px;margin-bottom:10px;background:var(--vscode-editorWidget-background)}
  .pc-flowrow{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:10.5px}
  .pc-flowk{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums;color:var(--vscode-foreground)}
  .pc-flowk b{font-weight:700}
  .pc-need{color:var(--bmuted)}
  .pc-need.on{color:var(--acc-warm);font-weight:600}
  .pc-wip{padding:2px 8px;border-radius:6px;background:var(--surface2)}
  .pc-wip.alert{background:var(--rdim);color:var(--r2)}
  .pc-wipx{color:var(--r);font-weight:700}
  .pc-needstrip{margin-top:8px;border-top:1px solid var(--vscode-widget-border);padding-top:6px}
  .pc-wiphint{font-size:9.5px;color:var(--bmuted);margin-top:6px;font-style:italic}
  /* squad lanes */
  .pc-lane{border:1px solid var(--vscode-widget-border);border-radius:9px;padding:9px 10px;margin-bottom:9px;background:var(--vscode-editorWidget-background)}
  .pc-lane.pc-h-active{border-left:3px solid var(--g)}
  .pc-lane.pc-h-warm{border-left:3px solid var(--acc-warm)}
  .pc-lane.pc-h-dormant{border-left:3px solid var(--vscode-widget-border);opacity:.9}
  .pc-lanehd{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:2px}
  .pc-lanedot{font-size:12px}
  .pc-lanename{font-size:12px}
  .pc-lanetype{font-size:9px;color:var(--bmuted);border:1px solid var(--vscode-widget-border);border-radius:5px;padding:0 5px;text-transform:lowercase}
  .pc-laneev{font-size:9.5px;color:var(--vscode-foreground);font-variant-numeric:tabular-nums}
  .pc-lanefrente{font-size:9.5px;color:var(--bmuted);margin:2px 0 8px}
  /* wave chips: squad (phase axis) + phase (squad axis) + declared estado */
  .pc-sqchip{font-size:11px}
  .pc-phchip{font-size:8.5px;color:var(--bmuted);background:var(--surface2);border-radius:5px;padding:1px 6px;text-transform:uppercase;letter-spacing:.04em}
  .pc-estado{font-size:9.5px;color:var(--bmuted);margin:2px 0 5px}
  .pc-estado .pc-fk{color:var(--bmuted)}
</style></head><body>
<!-- B6 — frozen header: identity + tab switcher pinned via .chrome (position:sticky) so switching tabs is always reachable while the body scrolls. -->
<div class="chrome">
<div class="brand"><span id="brandCow" class="livecow" aria-hidden="true">🐮</span><b>mooter</b><details class="pswitch" id="pswitch"><summary aria-haspopup="true" aria-label="switch project (one company, one click)" title="one company, one click — switch the whole deck"><span class="proj" id="proj">—</span> <span class="caret" aria-hidden="true">▾</span></summary><div class="menu" id="pswitchMenu" role="radiogroup" aria-label="Project"></div></details><span id="pair" style="font-size:10.5px;color:var(--bmuted)">✱</span><details class="pnew" id="pnew"><summary aria-haspopup="menu" aria-label="new (CC session, loop, schedule)" title="new — CC session · loop · schedule">＋ New <span class="caret" aria-hidden="true">▾</span></summary><div class="menu" role="menu" aria-label="New"><button class="mi" role="menuitem" data-new="cc">💬 CC session</button><button class="mi" role="menuitem" data-new="loop" disabled aria-disabled="true" title="LoopMoo — chega na wave 5"><span>♾️ Loop</span><span class="soon">🌊 W5</span></button><button class="mi" role="menuitem" data-new="schedule" disabled aria-disabled="true" title="Schedule — chega na wave 5"><span>⏰ Schedule</span><span class="soon">🌊 W5</span></button></div></details>
  <span class="right"><span class="badge b-mode" id="modeBadge">Moo</span><span class="badge b-score" id="scoreBadge" title="Mooter Score — click for pending items">—%</span></span></div>
<div class="inbox" id="inbox" role="status" aria-live="polite" aria-label="Inbox — o que precisa de ti"><div class="inbox-calm"><span class="ic">🟢</span> a ligar ao mooter…</div></div>
<div class="tabs">
  <!-- R1 · priority-collapse: 4 delivery tabs stay in the bar; the rest fold into ··· (nothing loses access). -->
  <div class="tab on" data-v="cockpit">🐮 Cockpit</div><!-- MISSION CONTROL TAB · Frente G --><div class="tab" data-v="mc">🎛️ Mission Control</div><!-- DELIVERY COCKPIT TAB · Frente B --><div class="tab" data-v="pc">🛩️ Project command</div><div class="tab" data-v="arch">🌳 Arquitectura</div><details class="taboverflow" id="taboverflow"><summary aria-haspopup="menu" aria-label="mais separadores (Setup · Agents · Decisions · Doctor)" title="mais — Setup · Agents · Decisions · Doctor">··· <span class="caret" aria-hidden="true">▾</span></summary><div class="menu" role="menu" aria-label="Mais separadores"><button class="mi" role="menuitemradio" data-v="setup">⚙️ Setup</button><button class="mi" role="menuitemradio" data-v="herd">🤖 Agents</button><button class="mi" role="menuitemradio" data-v="decisions">🔬 Decisions</button><button class="mi" role="menuitemradio" data-v="doctor">🩺 Doctor</button></div></details>
</div>
</div>
<!-- B9 — command bar (not a chatbot): natural language OR a /command resolves to a real Mooter command via the classifier; a leading "/" runs straight through. -->
<div class="intentwrap"><input id="intentIn" placeholder="🐮 run a command, or describe it… (→ /mooter command)"><button class="sm" id="intentGo" title="resolve to a Mooter command and offer to run it">→</button></div><div class="intentres" id="intentRes"></div>
<div class="view on" id="view-cockpit"><div id="v-cockpit"><div class="empty">Connecting to mooter…</div></div></div>
<!-- ARCH TREE TAB (Frente E · Arquitectura Viva) — renders purely from s.mc (MissionControlSnapshot). Separate from the Frente G Mission Control region. -->
<div class="view" id="view-arch"><div id="v-arch"><div class="empty">🌳 Arquitectura viva — connecting…</div></div></div>
<div class="view" id="view-setup"><div id="v-setup"><div class="empty">…</div></div><div class="lbl" style="margin:14px 2px 6px">Install</div><div id="v-install"></div><div class="lbl" style="margin:14px 2px 6px">Models</div><div id="v-models"></div></div>
<div class="view" id="view-herd"><div id="v-herd"><div class="empty">…</div></div></div>
<div class="view" id="view-decisions"><div id="v-insights"></div><div id="v-decisions"><div class="empty">No decisions yet</div></div></div>
<div class="view" id="view-doctor"><div id="v-doctor"><div class="empty">…</div></div><div class="lbl" style="margin:14px 2px 6px">Terminal</div><div id="v-terminal"></div></div>
<!-- MISSION CONTROL TAB · Frente G — view container (renderMissionControl preenche #v-mc) --><div class="view" id="view-mc"><div id="v-mc"><div class="empty">Mission Control — à espera do primeiro snapshot…</div></div></div>
<!-- DELIVERY COCKPIT TAB · Frente B — view container (renderProjectCommand preenche #v-pc) --><div class="view" id="view-pc"><div id="v-pc"><div class="empty">🛩️ Project command — à espera do primeiro snapshot…</div></div></div>
<script nonce="${nonce}">
const vsapi=acquireVsCodeApi();const $=(q)=>document.querySelector(q);
function goTab(name){document.querySelectorAll('.tab').forEach(x=>{const on=x.dataset.v===name;x.classList.toggle('on',on);x.setAttribute('aria-selected',on?'true':'false');x.tabIndex=on?0:-1;});document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.id==='view-'+name));
  // R1 · reflect the active tab in the ··· overflow when a folded (config/diagnostic) tab is open.
  var _ov=document.getElementById('taboverflow');if(_ov){var inOv=false;_ov.querySelectorAll('.mi[data-v]').forEach(function(m){var mo=m.dataset.v===name;m.setAttribute('aria-checked',mo?'true':'false');if(mo)inOv=true;});_ov.classList.toggle('activein',inOv);}
  try{var _st=vsapi.getState()||{};_st.tab=name;vsapi.setState(_st);}catch(e){}}
(function(){const tl=document.querySelector('.tabs');if(tl)tl.setAttribute('role','tablist');
  const tabs=[...document.querySelectorAll('.tab')];
  document.querySelectorAll('.view').forEach(v=>v.setAttribute('role','tabpanel'));
  tabs.forEach((t,i)=>{const on=t.classList.contains('on');t.setAttribute('role','tab');t.setAttribute('aria-controls','view-'+t.dataset.v);t.setAttribute('aria-selected',on?'true':'false');t.tabIndex=on?0:-1;
    t.onclick=()=>goTab(t.dataset.v);
    t.addEventListener('keydown',e=>{let j=null;if(e.key==='ArrowRight')j=(i+1)%tabs.length;else if(e.key==='ArrowLeft')j=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=tabs.length-1;if(j!=null){e.preventDefault();goTab(tabs[j].dataset.v);tabs[j].focus();}});});})();
// R1 · ··· overflow menu — folded tabs (Setup/Agents/Decisions/Doctor) reachable via a CSP-safe
// details/summary. Single-open, Escape closes + refocuses summary, outside-click closes. goTab keeps
// the view + persistence identical to a bar tab, so nothing loses access.
(function(){var ov=document.getElementById('taboverflow');if(!ov)return;var sm=ov.querySelector('summary');
  ov.querySelectorAll('.mi[data-v]').forEach(function(m){var go=function(){goTab(m.dataset.v);ov.open=false;if(sm)sm.focus();};m.onclick=go;m.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  ov.addEventListener('keydown',function(e){if(e.key==='Escape'){ov.open=false;if(sm)sm.focus();}});
  document.addEventListener('click',function(e){if(ov.open&&!ov.contains(e.target))ov.open=false;});})();
try{var _rt=(vsapi.getState()||{}).tab;if(_rt&&_rt!=='cockpit')goTab(_rt);}catch(e){}$('#scoreBadge').onclick=()=>goTab('cockpit');
// ARCH TREE TAB (Frente E): persisted mode for the Arquitectura Viva view (🌳 tree · 📊 ceo · 🔌 wt).
let archModeCur='tree';try{var _am=(vsapi.getState()||{}).archMode;if(_am)archModeCur=_am;}catch(e){}
// DELIVERY COCKPIT · Frente B v2 — persisted grouping axis for the Project command tab (Fase↔Squad).
let pcAxis='phase';try{var _px=(vsapi.getState()||{}).pcAxis;if(_px==='squad')pcAxis='squad';}catch(e){}
let curMode='auto';const MORDER=['zen','auto','beast'];
// Each live-session cow walks via the CSS .working class set at render time (the
// session is "working" when its transcript was just written) — no JS tick needed.
$('#modeBadge').style.cursor='pointer';$('#modeBadge').title='click to switch mode (LazyMoo · Moo · CrazyMoo)';
$('#modeBadge').setAttribute('role','button');$('#modeBadge').tabIndex=0;
$('#modeBadge').onclick=()=>{const nx=MORDER[(MORDER.indexOf(curMode)+1)%3];curMode=nx;$('#modeBadge').textContent=MOO[nx]||('🐮 '+nx);flashApply($('#modeBadge'));send('mode',nx);};
$('#modeBadge').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#modeBadge').onclick();}});
const inI=$('#intentIn'),inG=$('#intentGo'),inR=$('#intentRes');
// B9 — command bar: a leading "/" is already a real command → run it straight; otherwise
// resolve the natural-language phrase to a Mooter command via the classifier (host 'intent').
function intentAsk(){const v=inI.value.trim();if(!v)return;inR.style.display='block';if(v.charAt(0)==='/'){inR.innerHTML='→ running <b>'+esc(v)+'</b> in the Terminal';send('term',v);return;}inR.textContent='🐮 resolving to a command…';send('intent',v);}
inG.onclick=intentAsk; inI.addEventListener('keydown',e=>{if(e.key==='Enter')intentAsk();});
function esc(x){return String(x==null?'':x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function tc(d){const c={T0:0,T1:0,T2:0,T3:0};for(const x of d)if(c[x.tier]!=null)c[x.tier]++;return c;}
function localSpark(ds){if(!ds||ds.length<4)return '';var a=ds.filter(function(d){return d&&d.tier;});if(a.length<4)return '';a=a.slice().sort(function(x,y){return (Date.parse(x.ts)||+x.ts||0)-(Date.parse(y.ts)||+y.ts||0);});var per=Math.max(1,Math.ceil(a.length/12)),lv=' \u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588',out='',fp=null,lp=null;for(var i=0;i<a.length;i+=per){var s=a.slice(i,i+per),loc=0;for(var j=0;j<s.length;j++)if(s[j].tier==='T0')loc++;var p=loc/s.length;if(fp===null)fp=p;lp=p;out+=lv.charAt(1+Math.min(7,Math.round(p*7)));}var dir=lp>fp+0.05?'\u2191 more local':(lp<fp-0.05?'\u2193 less local':'steady');return '<div class="sub" style="font-size:10px;margin-top:5px;font-family:var(--vscode-editor-font-family,monospace)" title="local (T0) share across your last '+a.length+' router decisions \u2014 left=older, right=newer">\uD83C\uDF31 local trend '+out+' <span style="opacity:.6">'+dir+'</span></div>';}
const TCOL={T0:'var(--t0)',T1:'var(--t1)',T2:'var(--t2)',T3:'var(--t3)'};
const MOO={auto:'🐮 Moo',zen:'🐄 LazyMoo',beast:'🐂 CrazyMoo'};
// ── GUARDIAN:F0 ── active CLAUDE_AUTOCOMPACT_PCT_OVERRIDE for this VS Code process (null = unset → CC default ~83%).
const GUARDIAN_AUTOCOMPACT_PCT=${JSON.stringify(guardianPct)};
const PIN_LOCAL={'qwen3:30b':'mooter-qwen3-30b','qwen2.5:3b':'mooter-qwen2-5-3b','qwen2.5-coder:7b':'mooter-qwen2-5-coder-7b','qwen2.5-coder:14b':'mooter-qwen2-5-coder-14b','gemma3:12b':'mooter-gemma3-12b','gemma4:e4b':'mooter-gemma4-e4b','deepseek-r1:7b':'mooter-deepseek-r1-7b'};
const PIN_CLOUD={Haiku:'mooter-haiku-4-5',Sonnet:'mooter-sonnet-4-6','Opus 4.7':'mooter-opus-4-7'};
const openDecs=new Set();// decision keys (ts) the user expanded — must survive the periodic re-render
let ledgerScope='session';let lastSnap=null;
// Collapsible cards: ids the user hid. Survives the periodic re-render (module Set) AND
// window reload (persisted via the webview state API). Lets the user hide sections they
// don't care about for a cleaner cockpit. Hero (savings) + mode switch are never collapsible.
// R6 · Mooter Score collapsed by DEFAULT (seeded on fresh state only) so its 6 items + fix buttons
// stop stealing the cockpit — a 🎯 Score X/Y ⌄ chip that expands on click. Once the user toggles any
// section, their persisted set wins (no re-surprise).
const collapsed=new Set((function(){try{return (vsapi.getState()||{}).collapsed||['score'];}catch{return ['score'];}})());
function saveCollapsed(){try{const st=vsapi.getState()||{};st.collapsed=[...collapsed];vsapi.setState(st);}catch{}}
// Sessions-always-visible (runtime-diagnosed via _handoff/herd-diag.json): a persisted 'grp:*'
// project-group collapse survives reload and is BORN collapsed (cc()→.grpsec.collapsed → the CSS
// rule .grpsec.collapsed>*:not(.collaphead){display:none} hides every .srow), so the herd shows 0
// sessions even with filter='all'. The diag proved it: with filter='all' hiddenByAttr=0 but
// collapsedAncestor=5 → effectivelyVisible=0. Fix: project groups are OPT-IN collapse, exactly
// like the B3 filter — purge stale 'grp:*' keys at startup so the DEFAULT is expanded. Manual
// collapse still works within the session (the Set survives the 7s re-render); a reload resets it.
// The 'herd' card collapse is a deliberate top-level declutter and is NOT purged here — the PASSO 2
// invariant (enforceHerdVisible) catches it if it would ever empty the herd.
function purgeStaleGroupCollapse(set){let purged=false;for(const id of [...set])if(id.indexOf('grp:')===0){set.delete(id);purged=true;}return purged;}
(function(){try{if(purgeStaleGroupCollapse(collapsed))saveCollapsed();}catch{}})();
// B3 — declutter: estado do filtro/procura/compacto da herd (persistido como o collapsed). O filtro é
// puramente client-side: esconde/mostra .srow por data-state + data-name; o pipeline de dados é intocado.
// B3 regression fix (herd-fix): o filtro é OPT-IN — cada arranque mostra SEMPRE todas as sessões.
// Default 'all' (era 'atencao', que escondia toda a sessão idle e esvaziava a herd no caso real).
const HF_VALID=['all','atencao','needs','active','idle'];
let herdFilter='all',herdQuery='',herdCompact=false;
(function(){try{const st=vsapi.getState()||{};
  // O filtro NÃO sobrevive a um reload: cada webview novo arranca em 'all' (opt-in, nunca opt-out).
  // Só restauramos o modo compacto (que nunca esconde sessões — apenas sublines). Assim um 'atencao'
  // preso de uma versão anterior nunca volta a esconder a herd, e a procura arranca sempre vazia.
  herdCompact=!!st.herdCompact;
}catch{}})();
function saveHerdPrefs(){try{const st=vsapi.getState()||{};st.herdFilter=herdFilter;st.herdQuery=herdQuery;st.herdCompact=herdCompact;vsapi.setState(st);}catch{}}
// Re-aplica o filtro após cada render (como hydrateHoff). Sem barra (poucas sessões) → tudo visível.
function applyHerdFilter(){
  const cont=document.querySelector('#v-cockpit .herd');if(!cont)return;
  const bar=document.querySelector('#v-cockpit .herdfilter');
  if(!bar){cont.classList.remove('compact');cont.querySelectorAll('.srow[data-state]').forEach(r=>{r.hidden=false;});document.querySelectorAll('#v-cockpit .grpsec').forEach(g=>{g.hidden=false;});return;}
  cont.classList.toggle('compact',!!herdCompact);
  const q=(herdQuery||'').toLowerCase().trim();
  let f=herdFilter||'all';if(HF_VALID.indexOf(f)<0)f='all'; // filtro inválido/legado → 'all' (nunca esconde por acidente)
  const rows=[...cont.querySelectorAll('.srow[data-state]')];const total=rows.length;let shown=0;
  rows.forEach(row=>{
    const st=row.getAttribute('data-state')||'idle';const nm=row.getAttribute('data-name')||'';
    const okState=f==='all'||(f==='atencao'&&st!=='idle')||(f==='needs'&&st==='needs')||(f==='idle'&&st==='idle')||(f==='active'&&(st==='active'||st==='cowork'));
    const okQ=!q||nm.indexOf(q)>=0;const vis=okState&&okQ;row.hidden=!vis;if(vis)shown++;
  });
  // PASSO 2 — defensivo, nunca esconder tudo: um filtro de ESTADO (não procura) que esconderia TODAS
  // as sessões reverte para mostrar todas. O cockpit nunca pode deixar a herd vazia sem o user escolher.
  // Procura sem match é o ÚNICO estado-vazio (mostra o "Ver todas"); um filtro de estado nunca lá chega.
  if(f!=='all'&&!q&&shown===0&&total>0){rows.forEach(r=>{r.hidden=false;});shown=total;f='all';herdFilter='all';}
  document.querySelectorAll('#v-cockpit .grpsec').forEach(g=>{const any=[...g.querySelectorAll('.srow[data-state]')].some(r=>!r.hidden);g.hidden=!any;});
  document.querySelectorAll('#v-cockpit .hf[data-hf]').forEach(b=>b.classList.toggle('on',b.dataset.hf===f));
  const cb=document.querySelector('#v-cockpit .hfcompact');if(cb)cb.classList.toggle('on',!!herdCompact);
  const emp=document.querySelector('#v-cockpit .herdempty');
  if(emp){
    // Só uma PROCURA sem match mostra o estado-vazio (com "Ver todas"). Um filtro de estado já reverteu
    // acima, por isso nunca encalha numa herd vazia.
    if(total>0&&shown===0&&q){emp.hidden=false;const et=emp.querySelector('.herdemptytxt');if(et)et.textContent='Nada corresponde a "'+q+'"';}
    else emp.hidden=true;}
}
// PASSO 0 — herd diagnostic (dev-only, default OFF). Flip HERD_DIAG to true to make the FIRST
// render with ≥1 session ship a one-shot ground-truth report to the host (m.cmd 'herdDiag'),
// which writes <workspace>/_handoff/herd-diag.json. Costs nothing when false. Mirrors exactly
// the numbers the offline runtime harness computes: why each .srow may be hidden.
const HERD_DIAG=false;let _herdDiagSent=false;
function herdAncestorCollapsed(row){let n=row.parentElement;while(n&&n.id!=='v-cockpit'){if(n.classList&&n.classList.contains('collapsed')&&(n.classList.contains('card')||n.classList.contains('grpsec')))return true;n=n.parentElement;}return false;}
function herdDiag(){
  if(!HERD_DIAG||_herdDiagSent)return;
  const cont=document.querySelector('#v-cockpit .herd');if(!cont)return;
  const rows=[...cont.querySelectorAll('.srow[data-state]')];if(!rows.length)return;
  _herdDiagSent=true;
  const dn=(r)=>{try{return getComputedStyle(r).display==='none';}catch{return r.hidden||herdAncestorCollapsed(r);}};
  try{send('herdDiag',{totalSrow:rows.length,hiddenByAttr:rows.filter(r=>r.hidden).length,collapsedAncestor:rows.filter(r=>herdAncestorCollapsed(r)).length,displayNone:rows.filter(dn).length,herdFilter:herdFilter,herdQuery:herdQuery,collapsedSet:[...collapsed]});}catch(e){}
}
// PASSO 2 — bulletproof invariant: the cockpit NEVER shows 0 sessions when sessions exist. Runs
// after the filter + collapse layers each render. If there are session rows but ZERO are
// EFFECTIVELY visible (not [hidden], not under a .card/.grpsec.collapsed ancestor) AND there is no
// active search (a search legitimately narrows to its own empty-state), force them visible: drop
// [hidden], expand every collapsed ancestor that holds session rows, and purge those collapse keys
// so the fix sticks across re-renders. Manual collapse stays allowed while ≥1 row is still visible.
let _herdGuardLogged=false;
function herdRowVisible(row){return !row.hidden && !herdAncestorCollapsed(row);}
function enforceHerdVisible(){
  const cont=document.querySelector('#v-cockpit .herd');if(!cont)return;
  const rows=[...cont.querySelectorAll('.srow[data-state]')];if(!rows.length)return; // no sessions → nothing to guard
  if((herdQuery||'').trim())return;        // an active search owns the empty-state; never override it
  if(rows.some(herdRowVisible))return;     // ≥1 already visible → invariant already holds
  let purged=false;
  rows.forEach(r=>{r.hidden=false;let n=r.parentElement;while(n&&n.id!=='v-cockpit'){if(n.classList&&n.classList.contains('collapsed')&&(n.classList.contains('card')||n.classList.contains('grpsec'))){n.classList.remove('collapsed');const id=n.dataset&&n.dataset.collap;if(id&&collapsed.has(id)){collapsed.delete(id);purged=true;}}n=n.parentElement;}});
  if(herdFilter!=='all')herdFilter='all';
  if(purged)saveCollapsed();
  if(!_herdGuardLogged){_herdGuardLogged=true;try{console.warn('[mooter] herd invariant fired: forced '+rows.length+' session(s) visible — a persisted collapse/filter would have emptied the herd');}catch(e){}}
}
function wireHerdFilter(){
  const qi=document.querySelector('#v-cockpit .herdq');
  if(qi)qi.oninput=()=>{herdQuery=qi.value;saveHerdPrefs();applyHerdFilter();};
  document.querySelectorAll('#v-cockpit .hf[data-hf]').forEach(b=>{b.onclick=(e)=>{e.stopPropagation();herdFilter=b.dataset.hf;saveHerdPrefs();applyHerdFilter();};});
  const cb=document.querySelector('#v-cockpit .hfcompact');if(cb)cb.onclick=(e)=>{e.stopPropagation();herdCompact=!herdCompact;saveHerdPrefs();applyHerdFilter();};
  const ev=document.querySelector('#v-cockpit .herdempty button[data-hf]');if(ev)ev.onclick=(e)=>{e.stopPropagation();herdFilter='all';herdQuery='';const qi2=document.querySelector('#v-cockpit .herdq');if(qi2)qi2.value='';saveHerdPrefs();applyHerdFilter();}; // "Ver todas" limpa filtro + procura → mostra mesmo tudo
}
function cc(id){return collapsed.has(id)?' collapsed':'';}
// Build a uniform collapsible header (chevron + title). Click/Enter toggles; clicks on
// interactive children (e.g. the ledger scope pills [data-ls]) are ignored so they don't collapse.
function chead(title,cls){return '<div class="'+(cls||'lbl')+' collaphead"><span class="chev">▾</span>'+title+'</div>';}
function wireCollapse(root){(root||document).querySelectorAll('[data-collap]').forEach(c=>{const h=c.querySelector('.collaphead');if(!h)return;const tog=(ev)=>{if(ev&&ev.target&&ev.target.closest('[data-ls]'))return;const on=c.classList.toggle('collapsed');const id=c.dataset.collap;if(on)collapsed.add(id);else collapsed.delete(id);saveCollapsed();};h.onclick=tog;h.setAttribute('role','button');h.setAttribute('tabindex','0');h.setAttribute('aria-label','toggle section');h.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!(e.target&&e.target.closest&&e.target.closest('[data-ls]'))){e.preventDefault();tog();}});});}
// ⇄ Handoff v2 — inline live panel state. The whole cockpit re-renders on every snapshot, so the
// panel CONTENT must live OUTSIDE the DOM (here) and be re-applied after each render (hydrateHoff).
// Keyed by data-hoff id (session id OR project key). status: 'ready' (skeleton copiado) | 'enriched'
// (narrativa LLM local · recopiado); 'generating'/'done' ainda aceites (compat). The host streams
// skeleton → enriched via postMessage({type:'handoff'}); we never fabricate text webview-side.
const hoffState={};
function hoffPanelFor(id){const all=document.querySelectorAll('.hoffp');for(let i=0;i<all.length;i++){if(all[i].getAttribute('data-hoff')===id)return all[i];}return null;}
// ⇄ F2 live streaming states: 'ready' (skeleton — factos prontos+copiados · narrativa a gerar) →
// 'streaming' (chunks a chegar — DOING/RECAP a aparecer sob o esqueleto) → 'done' (texto final fixo ·
// recopiado · factos autoritativos · narrativa local best-effort). 'enriched'/'generating' = legacy compat.
function hoffApply(id,st){const p=hoffPanelFor(id);if(!p||!st)return;const pre=p.querySelector('.hoffp-pre');const stx=p.querySelector('.hoffp-st');const s=st.status;const NL=String.fromCharCode(10);
  // While generating, the deterministic skeleton (authoritative facts) stays on top and the local
  // narrative concatenates LIVE underneath (marked best-effort). On 'done'/'enriched' the final text replaces it.
  // NL via fromCharCode — a backslash-n escape here would be consumed by the getHtml template literal.
  const live=(st.stream&&(s==='streaming'||s==='ready'))?(NL+NL+'⚡ narrativa (local best-effort):'+NL+st.stream):'';
  if(pre)pre.textContent=(s==='done'||s==='enriched')?(st.text||''):((st.text||'')+live);
  if(stx){
    if(s==='done')stx.textContent='✓ '+(st.model?'narrativa '+st.model+' · ':'')+'recopiado · factos autoritativos · narrativa local best-effort';
    else if(s==='enriched')stx.textContent='✓ enriquecido'+(st.model?' com '+st.model:'')+' · recopiado';
    else if(s==='streaming')stx.innerHTML='<span class="gendot"></span>⚡ a gerar narrativa… ('+esc(st.model||'qwen local')+' · $0)';
    else if(s==='ready')stx.innerHTML='<span class="gendot"></span>⚡ a gerar narrativa… (qwen local · $0) · factos prontos, copiados';
    else stx.textContent='🐮 a gerar… (esqueleto pronto · narrativa local a encher)';
  }
  p.hidden=false;if(pre)pre.scrollTop=pre.scrollHeight;}
function hydrateHoff(){for(const id in hoffState)hoffApply(id,hoffState[id]);}
// Clicks inside a panel must not bubble to the session row (openSession) or the group collapse toggle.
function wireHoff(root){(root||document).querySelectorAll('.hoffp').forEach(p=>{p.onclick=(e)=>{e.stopPropagation();};});(root||document).querySelectorAll('.projhandoff').forEach(b=>{const o=b.onclick;b.onclick=(e)=>{e.stopPropagation();if(o)o.call(b,e);};});
  // ⇄ Handoff v2 (#1) — 📋 Copiar: feedback táctil instantâneo. Troca o label para "✓ Copiado" ~1.5s
  // e repõe "📋 Copiar" (só setTimeout, sem libs). Um re-render periódico apenas o repõe mais cedo.
  (root||document).querySelectorAll('.hoffcopy').forEach(b=>{const o=b.onclick;b.onclick=(e)=>{e.stopPropagation();if(o)o.call(b,e);b.textContent='✓ Copiado';setTimeout(()=>{try{b.textContent='📋 Copiar';}catch(_){}},1500);};});}
const MLABEL={'claude-opus-4-8':'Opus 4.8','claude-opus-4-7':'Opus 4.7','claude-opus-4-6':'Opus 4.6','claude-sonnet-4-6':'Sonnet 4.6','claude-sonnet-4-5':'Sonnet 4.5','claude-haiku-4-5':'Haiku 4.5','claude-haiku-4-5-20251001':'Haiku 4.5','claude-fable-5':'Fable 5'};
function modelLabel(m){return MLABEL[String(m||'').toLowerCase()]||String(m||'').replace(/^claude-/,'').replace(/-/g,' ');}
// PR stage → colour (matches host-extra prStage strings). Honest: only stages we derive.
function stageColor(st){const x=String(st||'');if(x.indexOf('merged')===0)return 'var(--g)';if(x.indexOf('ready')===0)return 'var(--g)';if(x.indexOf('❌')>=0)return 'var(--t3)';if(x.indexOf('⏳')>=0)return 'var(--acc-warm)';if(x==='draft')return 'var(--vscode-descriptionForeground)';return 'var(--vscode-descriptionForeground)';}
function lFmt(n){n=+n||0;return n>=1e6?(n/1e6).toFixed(2)+'M':(n>=1e3?(n/1e3).toFixed(1)+'k':String(n));}
function famEmoji(model){const x=String(model||'').toLowerCase();if(x.includes('fable'))return '🌟';if(/claude|opus|sonnet|haiku/.test(x))return '✨';if(/qwen|llama|gemma|deepseek|mistral|phi|ollama/.test(x)||x.includes(':'))return '🦙';if(x.includes('gemini'))return '💎';if(/gpt|codex|openai/.test(x))return '🟢';return '🤖';}
function agoFmt(ms){const t=Math.round((+ms||0)/1000);if(t<60)return t+'s';const mi=Math.round(t/60);if(mi<60)return mi+'m';const h=Math.round(mi/60);return h<24?h+'h':Math.round(h/24)+'d';}
function ledgerHtml(s){
  // Feature 4: ONE table, SAME columns for cloud and local — model | in | out | cache |
  // cost | saved vs Opus. Cloud rows show real $ and "—" for saved (they ARE the spend);
  // the local row shows real in/out (token_tracker), $0 cost, and the honest counterfactual
  // saved = (in*5 + out*25)/1e6 vs Opus 4.8 [$5,$25]/1M. No more "calls" inconsistency.
  const scoped=!!(s.effectiveSession&&s.sessionLedger);
  // Always honour the session/all-time toggle. When scoped to a focused CC session, 'session'
  // shows THAT session; 'all' shows every session — so an empty/quiet session never hides the
  // per-model history (the user can always flip to All time). Fixes the "counter disappeared".
  const L=(ledgerScope==='all')?((s.ledger&&s.ledger.all)||{rows:[],turns:0}):(scoped?((s.sessionLedger&&s.sessionLedger.session)||{rows:[],turns:0}):((s.ledger&&s.ledger.session)||{rows:[],turns:0}));
  const scopeLbl=(ledgerScope==='all')?'all time':'this session';
  const total=L.rows.reduce((a,r)=>a+(r.cost||0),0);
  const sidChip=(scoped&&ledgerScope!=='all')?(' <span style="opacity:.55;font-size:9px">· '+esc((s.effectiveSession||'').slice(0,8))+'</span>'):'';
  const tog='<span style="float:right">'+['session','all'].map(sc=>'<span data-ls="'+sc+'" role="button" tabindex="0" style="cursor:pointer;font-size:10px;padding:2px 7px;border-radius:8px;margin-left:4px;border:1px solid var(--vscode-widget-border);'+(ledgerScope===sc?'background:var(--gdim);color:var(--g);border-color:var(--g)':'color:var(--vscode-descriptionForeground)')+'">'+(sc==='session'?'This session':'All time')+'</span>').join('')+'</span>';
  const head=chead('🧾 Tokens by model'+sidChip+' '+tog);
  // Cloud rows (real). saved = "—" (a billed row can't "save vs Opus" — it IS the spend).
  const cloudTr=L.rows.map(r=>'<tr><td title="'+esc(r.model)+'">'+esc(modelLabel(r.model))+'</td><td>'+lFmt(r.in)+'</td><td>'+lFmt(r.out)+'</td><td title="read '+lFmt(r.cr)+' / write '+lFmt(r.cw)+'">'+lFmt((r.cr||0)+(r.cw||0))+'</td><td>'+(r.cost==null?'—':'$'+r.cost.toFixed(2))+'</td><td class="sv">—</td></tr>').join('');
  // Local row (real in/out from token_tracker; T0 aggregate — per-model not metered). One
  // line, SAME columns: cache "—" (not metered locally), cost $0, saved vs Opus = real.
  const lt=s.localTok;
  let localTr='';
  if(lt){
    const savedLocal=(lt.in*5+lt.out*25)/1e6; // counterfactual vs Opus 4.8 — honest, not billed
    localTr='<tr><td title="all local models, T0 — measured by token_tracker">🦙 Local (Ollama · T0)</td><td>'+lFmt(lt.in)+'</td><td>'+lFmt(lt.out)+'</td><td title="local cache not metered">—</td><td><b>$0</b></td><td class="sv" title="what Opus 4.8 would have cost for these tokens">+$'+savedLocal.toFixed(savedLocal<0.01?4:2)+'</td></tr>';
  }
  const body=(cloudTr||localTr)
    ?('<table class="mx"><tr><th>model</th><th>in</th><th>out</th><th>cache</th><th>cost</th><th>saved vs Opus</th></tr>'+cloudTr+localTr+'</table>')
    :('<div class="sub" style="margin-top:6px">No usage logged '+scopeLbl+'</div>');
  const localNote=lt?'<div class="sub" style="font-size:9px;margin-top:4px">local per-model not metered → T0 aggregate</div>':'';
  return '<div class="card'+cc('ledger')+'" data-collap="ledger">'+head+body+localNote+'<div class="kv" style="margin-top:8px;border-top:1px solid var(--vscode-widget-border);padding-top:6px"><span>Total · '+scopeLbl+'</span><span><b>$'+total.toFixed(2)+'</b> · '+L.turns+' Claude turns</span></div><div class="sub" style="font-size:9px;margin-top:4px">Claude tokens from session logs · local from token_tracker · prices Jun 2026 · advisory · local = $0</div></div>';
}
function wireLedgerToggle(){const lg=$('#tokLedger');if(!lg)return;lg.querySelectorAll('[data-ls]').forEach(b=>{const go=()=>{ledgerScope=b.dataset.ls;if(lastSnap){lg.innerHTML=ledgerHtml(lastSnap);wireLedgerToggle();wireCollapse(lg);}};b.onclick=go;b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});}
function send(cmd,arg){vsapi.postMessage({cmd,arg});}
// B1 — optimistic perceived-speed: depois de aplicar o novo estado JÁ no DOM (.on salta no clique),
// mostra "⟳ a aplicar…" no PAINEL junto ao controlo até o próximo snapshot reconciliar (o re-render
// reconstrói #v-cockpit e limpa a tag). Safety timeout caso um refresh demore/falhe. Nunca lança.
function flashApply(el){try{if(!el)return;el.classList.add('applying');
  var host=(el.closest&&(el.closest('.sdrawer')||el.closest('.srow')||el.closest('.card')||el.closest('.brand')))||el.parentNode;
  if(host&&!host.querySelector('.applytag')){var t=document.createElement('span');t.className='applytag';t.textContent='⟳ a aplicar…';host.appendChild(t);
    setTimeout(function(){try{t.remove();}catch(_){}try{el.classList.remove('applying');}catch(_){}} ,2500);}
}catch(_){}}
function wireButtons(root){root.querySelectorAll('button[data-a]').forEach(b=>b.onclick=()=>{
  const a=b.dataset.a;
  if(a.startsWith('term:'))send('term',a.slice(5));
  else if(a.startsWith('openUrl:'))send('openUrl',a.slice(8));
  else if(a.startsWith('pull:'))send('pull',a.slice(5));
  else if(a.startsWith('tab:'))goTab(a.slice(4));
  else send(a,b.dataset.x);
});}
// WCOCKPIT-3: session card renderer (from row-renderer.js — safe when fn.toString() serialised)
// WCOCKPIT-10: Stage Rail data + pure deriver embedded as siblings of renderRow (no module
// scope in the webview, so renderRow's free refs to STAGE_META/deriveStages must be declared here).
const STAGE_META=${RR?JSON.stringify(RR.STAGE_META):'[]'};
const deriveStages=${RR?RR.deriveStages.toString():'function deriveStages(){return {stages:{},safe:{level:"green",label:"",action:null},behind:null};}'};
const renderRow=${RR?RR.renderRow.toString():'function renderRow(r){return "";}'};
const renderGroupHeader=${RR?RR.renderGroupHeader.toString():'function renderGroupHeader(k,g){return "";}'};
// HONEST-CONTROLS D2: inbox meta-classifier + per-repo collapse (siblings — renderInbox calls them)
const isMetaPath=${RR&&RR.isMetaPath?RR.isMetaPath.toString():'function isMetaPath(){return false;}'};
const inboxRepoSummary=${RR&&RR.inboxRepoSummary?RR.inboxRepoSummary.toString():'function inboxRepoSummary(){return [];}'};
// WS3: Local Moo Fleet renderer (sibling of renderRow — read-only, idle-safe, concat-only)
const renderLocalFleet=${RR&&RR.renderLocalFleet?RR.renderLocalFleet.toString():'function renderLocalFleet(){return "";}'};
// Deck Floor (Fase 2): Fleet Console — read-only aggregate of the pillar fleet (s.fleet from
// _handoff/fleet/*/STATE.json). Collapsible via the shared cc()/wireCollapse mechanism. Honest:
// no fleet dir → no card (never a fake "0 pilares"); "loop" only when a pillar ran within 6h.
function fleetAgo(ms){if(ms==null)return 'n/d';if(ms<3600000)return Math.max(1,Math.round(ms/60000))+'m';var h=ms/3600000;if(h<48)return Math.round(h)+'h';return Math.round(h/24)+'d';}
function renderFleetConsole(fleet){
  if(!fleet||!fleet.count)return '';
  var rows='';
  for(var i=0;i<fleet.pillars.length;i++){var p=fleet.pillars[i];
    rows+='<div class="fleetpil" style="display:flex;align-items:center;gap:7px;font-size:10.5px;padding:3px 0;border-top:1px solid var(--vscode-widget-border)">'
      +'<span style="width:7px;height:7px;border-radius:50%;background:'+(p.active?'var(--ok)':'var(--vscode-descriptionForeground)')+';flex:none"></span>'
      +'<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">'+esc(p.pillar)+'</span>'
      +'<span style="flex:none;opacity:.8">'+esc(p.status)+'</span>'
      +'<span style="flex:none;opacity:.6">'+(p.active?'🟢 loop':'💤 idle')+' · '+fleetAgo(p.ageMs)+'</span>'
      +(p.lastOk?'':'<span style="flex:none;color:var(--danger)" title="último run falhou">⚠</span>')
      +'</div>';
  }
  return '<div class="card'+cc('fleet')+'" data-collap="fleet" style="padding:8px 11px;margin-bottom:8px">'
    +'<div class="lbl collaphead"><span class="chev">▾</span>🚜 Fleet Console · <b>'+fleet.count+'</b> pilar'+(fleet.count===1?'':'es')+' · '+fleet.activeN+' loop · '+fleet.idleN+' idle</div>'
    +'<div class="sub" style="opacity:.7;margin:2px 0 4px">read-only · agrega _handoff/fleet/*/STATE.json · idle quando o último run &gt; 6h</div>'
    +rows+'</div>';
}
// ── Deck Phase 3 · Lentes ligadas ────────────────────────────────────────────
// Each lens is a compact diagnostic reading its REAL data-source; every number is real or
// renders n/d (lNd). Collapsible via the shared cc()/data-collap/wireCollapse mechanism.
function lNd(){return '<span class="nd">n/d</span>';}
function msHuman(ms){if(ms==null||!isFinite(ms))return null;var h=ms/3600000;if(h<1)return Math.max(1,Math.round(ms/60000))+'m';if(h<48)return (Math.round(h*10)/10)+'h';return (Math.round(h/2.4)/10)+'d';}
// 📊 Flow — pc-snapshot (WIP · frente · forecast). Honest: WIP null = git-unreadable (n/d) vs 0 =
// measured; forecast is per-wave P50/P90 wall (there is no "P85" in the engine — never fabricate one).
function renderFlowLens(s){
  var pc=s&&s.pc,body='';
  if(!pc){body='<div class="nd">sem snapshot de Project Command</div>';}
  else if(pc.forecast_missing){body='<div class="nd">forecast por gerar</div>'+(pc.cli_hint?'<div class="lwhy">'+esc(String(pc.cli_hint))+'</div>':'');}
  else{
    var w=(pc.flow&&pc.flow.wip)||{};
    var wipTxt=(w.active==null&&w.total==null)?lNd():('<b>'+(w.active==null?'—':w.active)+'</b> em curso · '+(w.total==null?'—':w.total)+' wt (lim '+(w.limit||3)+')'+(w.over?' <span style="color:var(--warn)">⚠ acima</span>':''));
    body+='<div class="lrow"><span class="lk">WIP</span><span class="lv">'+wipTxt+'</span></div>';
    var needN=(pc.flow&&pc.flow.need_you)?pc.flow.need_you.length:0;
    var dep=pc.flow&&pc.flow.deploy_freq_per_week,wd=pc.flow&&pc.flow.waves_done;
    body+='<div class="lrow"><span class="lk">Precisa de ti</span><span class="lv">'+(needN>0?('🙋 '+needN):'🟢 0')+'</span></div>';
    body+='<div class="lrow"><span class="lk">Fluxo</span><span class="lv">'+(dep==null?lNd():('~'+dep+' merges/sem'))+' · '+(wd==null?lNd():(wd+' waves ✅'))+'</span></div>';
    var nowWave=null,ph=pc.phases||[],i,j,k;
    for(i=0;i<ph.length&&!nowWave;i++){if(ph[i].key==='NOW'&&ph[i].waves&&ph[i].waves.length)nowWave=ph[i].waves[0];}
    if(!nowWave){for(j=0;j<ph.length&&!nowWave;j++){var ws=ph[j].waves||[];for(k=0;k<ws.length&&!nowWave;k++)if(ws[k].running)nowWave=ws[k];}}
    if(nowWave){
      body+='<div class="lrow"><span class="lk">Frente</span><span class="lv">'+esc(String(nowWave.wave_id||''))+' '+esc(String(nowWave.name||''))+(nowWave.squad?' · '+esc(String(nowWave.squad)):'')+(nowWave.estado?' · '+esc(String(nowWave.estado)):'')+(nowWave.locked?' 🔒':'')+'</span></div>';
      var fc=nowWave.forecast||{},fcTxt;
      if(fc.state==='cone')fcTxt='P50 '+(msHuman(fc.p50_wall)||'—')+' · P90 '+(msHuman(fc.p90_wall)||'—')+' <span class="lwhy">(wall)</span>';
      else if(fc.state==='calibrating')fcTxt='<span class="nd">a calibrar'+(fc.calibrating_progress?' '+esc(String(fc.calibrating_progress)):'')+'</span>';
      else fcTxt='<span class="nd">sem base</span>';
      body+='<div class="lrow"><span class="lk">Forecast</span><span class="lv">'+fcTxt+'</span></div>';
    }
  }
  body+='<div class="lrow" style="margin-top:2px"><span class="llink" data-goto="pc" role="button" tabindex="0">Project command ↗</span></div>';
  return '<div class="card lens'+cc('lens-flow')+'" data-collap="lens-flow" style="padding:9px 11px;margin-bottom:8px"><div class="lbl collaphead"><span class="chev">▾</span>📊 Flow</div><div class="lens-body">'+body+'</div></div>';
}
// 💰 Economics — savings (advisory) + real executed ($0 dispatches) + router mix (COUNTS, not $ —
// there is no per-tier $ source) + budget ceiling (spend = n/d until W6) + plan. Authored attribution.
function renderEconomicsLens(s){
  var m=(s&&s.metrics)||{},eff=s&&s.effectiveSession;var M=(eff&&s.sessionMetrics)?s.sessionMetrics:m;
  var decs=(s&&s.decisions)||[],decScoped=eff?decs.filter(function(d){return d&&d.sid===eff;}):decs;
  var body='';
  body+='<div class="lrow"><span class="lk">Poupança</span><span class="lv">$'+Number(M.saved||0).toFixed(2)+' <span class="lwhy">('+(M.saved_pct||0)+'% abaixo de all-Opus · advisory)</span></span></div>';
  // R5 · densidade — mini-barra do % poupado vs all-Opus. saved_pct é real/advisory; sem fonte → n/d (honesto).
  var svRaw=(M&&M.saved_pct!=null)?Number(M.saved_pct):null;
  if(svRaw==null){body+='<div class="lrow"><span class="lk"></span><span class="lv">'+lNd()+' <span class="lwhy">% vs all-Opus</span></span></div>';}
  else{var svPct=Math.max(0,Math.min(100,svRaw));body+='<div class="lrow"><span class="lk"></span><span class="lbar" title="'+svPct+'% abaixo de all-Opus (advisory)"><span style="width:'+svPct+'%;background:var(--ok)"></span></span><span class="lwhy">'+svPct+'% vs all-Opus</span></div>';}
  if(!(s&&s.trackerUp))body+='<div class="lwhy" style="color:var(--acc-warm)">⚠ tracker offline — último conhecido</div>';
  var gs=(typeof M.guaranteed_saved==='number')?M.guaranteed_saved:0,oa=M.option_a_hits||0;
  body+='<div class="lrow"><span class="lk">Real ✓</span><span class="lv" style="color:var(--ok)">$'+gs.toFixed(2)+' · '+oa+' dispatch'+(oa===1?'':'es')+' local'+(oa===1?'':'is')+' reais</span></div>';
  var c={T0:0,T1:0,T2:0,T3:0},i;for(i=0;i<decScoped.length;i++){var t=decScoped[i]&&decScoped[i].tier;if(c[t]!=null)c[t]++;}
  var tot=c.T0+c.T1+c.T2+c.T3;
  if(tot>0){var ord=[['T0','var(--t0)'],['T1','var(--t1)'],['T2','var(--t2)'],['T3','var(--t3)']],seg='',q;for(q=0;q<4;q++){var pct=Math.round(100*c[ord[q][0]]/tot);if(pct>0)seg+='<span style="width:'+pct+'%;background:'+ord[q][1]+'" title="'+ord[q][0]+' '+c[ord[q][0]]+'"></span>';}
    body+='<div class="lrow"><span class="lk">Router mix</span><span class="lbar">'+seg+'</span><span class="lwhy">'+tot+' decisões (contagens, não $)</span></div>';
  } else body+='<div class="lrow"><span class="lk">Router mix</span><span class="lv">'+lNd()+'</span></div>';
  var bud=(s&&s.budget&&s.budget.monthly_budget_usd)||0;
  body+='<div class="lrow"><span class="lk">Budget</span><span class="lv">'+(bud>0?('tecto $'+bud+'/mês'):lNd())+' · <span class="lwhy">gasto n/d</span> <span class="lsoon">🌊 W6</span></span></div>';
  var plan=(s&&s.sub&&s.sub.profile)?esc(String(s.sub.profile)):null;
  body+='<div class="lrow"><span class="lk">Plano</span><span class="lv">'+(plan||lNd())+' <span class="lwhy">· %/sem n/d</span></span></div>';
  body+='<div class="lwhy" style="margin-top:2px">a poupança vem do <b>routing</b> (a máquina responde; o tier é recomendação, não fatura) — não de trade-off de qualidade.</div>';
  body+='<div class="lrow" style="margin-top:2px"><span class="llink" data-goto="decisions" role="button" tabindex="0">Decisions ↗</span></div>';
  return '<div class="card lens'+cc('lens-econ')+'" data-collap="lens-econ" style="padding:9px 11px;margin-bottom:8px"><div class="lbl collaphead"><span class="chev">▾</span>💰 Economics</div><div class="lens-body">'+body+'</div></div>';
}
// 🏗️ Foundations — chips from real probes. Security shows summary presence only (there is NO
// differential-privacy datum in the engine — never invent a DP metric). Arch/Doctor from s.score.checks.
function renderFoundationsLens(s){
  var checks=(s&&s.score&&s.score.checks)||[],i,sha=null;
  for(i=0;i<checks.length;i++){if(checks[i].k==='classifysha'){sha=checks[i];break;}}
  var archChip=sha?(sha.ok===true?'<span class="lchip" style="border-color:var(--ok)" title="'+esc(String(sha.detail||''))+'">🏛️ classify frozen ✓</span>':(sha.ok===false?'<span class="lchip" style="border-color:var(--danger)">🏛️ classify ALTERADO ⚠</span>':'<span class="lchip">🏛️ classify '+lNd()+'</span>')):'<span class="lchip">🏛️ classify '+lNd()+'</span>';
  var pass=0,fail=0,warn=0,j;for(j=0;j<checks.length;j++){if(checks[j].ok===true)pass++;else if(checks[j].ok===false)fail++;else warn++;}
  var docColor=fail?'var(--danger)':(warn?'var(--warn)':'var(--ok)');
  var docChip='<span class="lchip" style="border-color:'+docColor+'" title="'+fail+' a falhar · '+warn+' avisos">🩺 Doctor '+pass+'/'+checks.length+(fail?' · '+fail+' ✗':' ✓')+'</span>';
  var secChip=(s&&s.security&&String(s.security).trim())?'<span class="lchip" title="resumo do CLI mooter security (sandbox 4-layer)">🛡️ Security · sandbox 4-layer</span>':'<span class="lchip">🛡️ Security · '+lNd()+'</span>';
  var gpu=(s&&s.hw&&s.hw.name)||(s&&s.device&&s.device.hardware&&s.device.hardware.gpu)||null;
  var setup=(gpu?esc(String(gpu)):lNd())+' · '+((s&&s.sub&&s.sub.profile)?esc(String(s.sub.profile)):lNd())+' · '+Object.keys((s&&s.packs)||{}).length+' packs';
  var body='<div class="lrow" style="flex-wrap:wrap;gap:6px">'+archChip+docChip+secChip+'<span class="lchip" title="hardware · subscription · packs">⚙️ '+setup+'</span></div>';
  body+='<div class="lrow" style="margin-top:3px"><span class="llink" data-goto="doctor" role="button" tabindex="0">Doctor ↗</span></div>';
  return '<div class="card lens'+cc('lens-found')+'" data-collap="lens-found" style="padding:9px 11px;margin-bottom:8px"><div class="lbl collaphead"><span class="chev">▾</span>🏗️ Foundations</div><div class="lens-body">'+body+'</div></div>';
}
// 🧠 Brain — Pastor (TF-IDF, real) · Guardian (deck signal = s.mc.totals.ctxFull) · Ledger. Handoff
// is honest by level: sessão ✓ · projeto ✓ (ação) · wave 🌊 (não existe artefacto ainda). Adapters(W7)
// /Insights-TTL(W9)/Graph(W10) have no data source → explicit 🌊 placeholders, never fabricated numbers.
function renderBrainLens(s){
  var ins=(s&&s.insights)||{},nDec=((s&&s.decisions)||[]).length,body='';
  // R5 · densidade — Pastor como chips (conf · cache · N) em vez de uma linha corrida; mesma honestidade.
  body+='<div class="lrow" style="flex-wrap:wrap;gap:6px"><span class="lk">🧠 Pastor</span><span class="lchip" title="confiança do Pastor (s.insights)">conf '+(ins.confNow!=null?esc(String(ins.confNow)):'—')+'</span><span class="lchip" title="taxa de cache do Pastor">cache '+(ins.cacheRate!=null?esc(String(ins.cacheRate)):'—')+'</span><span class="lchip" title="decisões observadas">N='+nDec+'</span><span class="lwhy">TF-IDF, não neural</span></div>';
  var gf=(s&&s.mc&&s.mc.totals&&s.mc.totals.ctxFull);
  var gTxt=(gf==null)?lNd():(gf>0?('⚠ '+gf+' sessõe'+(gf===1?'':'s')+' ≥80% ctx'):'🟢 contexto saudável');
  var ac=(typeof GUARDIAN_AUTOCOMPACT_PCT==='number')?(' · auto-compact @'+GUARDIAN_AUTOCOMPACT_PCT+'%'):'';
  body+='<div class="lrow"><span class="lk">🛡️ Guardian</span><span class="lv">'+gTxt+ac+'</span></div>';
  var led=s&&s.ledger,lsess=(led&&led.sessions!=null)?led.sessions:null,hm=(led&&led.session&&led.session.lastModel)||null;
  body+='<div class="lrow"><span class="lk">📒 Ledger</span><span class="lv">'+(lsess==null?lNd():(lsess+' sessões'))+(hm?(' · host '+esc(String(hm))):'')+'</span></div>';
  body+='<div class="lrow"><span class="lk">⇄ Handoff</span><span class="lv">sessão ✓ · projeto ✓ <span class="lwhy">(ação)</span> · wave <span class="lsoon">🌊</span></span></div>';
  body+='<div class="lrow" style="flex-wrap:wrap;gap:6px;margin-top:1px"><span class="lchip">🧬 Adapters <span class="lsoon">🌊 W7</span></span><span class="lchip">💡 Insights <span class="lsoon">🌊 W9 TTL</span></span><span class="lchip">🕸️ Graph <span class="lsoon">🌊 W10</span></span></div>';
  body+='<div class="lrow" style="margin-top:2px"><span class="llink" data-goto="decisions" role="button" tabindex="0">Insights ↗</span></div>';
  return '<div class="card lens'+cc('lens-brain')+'" data-collap="lens-brain" style="padding:9px 11px;margin-bottom:8px"><div class="lbl collaphead"><span class="chev">▾</span>🧠 Brain</div><div class="lens-body">'+body+'</div></div>';
}
// ── Deck Phase 4 · Vida ──────────────────────────────────────────────────────
// 🎮 Hardware strip — nvidia-smi via s.mc.gpu. GPU util/VRAM/cabem-N are REAL; temp/CPU/Max have no
// source in this snapshot (the nvidia-smi parser captures no temp; no CPU sampling; no weekly limit)
// so they render n/d, never fabricated. nvidia-smi absent ⇒ whole strip degrades to n/d (no crash).
function renderHwStrip(s){
  var gpu=(s&&s.mc&&s.mc.gpu)||null,chips='';
  if(gpu&&(gpu.totalMb!=null||gpu.gpus)){
    var g0=(Array.isArray(gpu.gpus)&&gpu.gpus[0])||{};
    var util=(g0.utilPct!=null)?g0.utilPct:null;
    var totMb=(gpu.totalMb!=null)?gpu.totalMb:null,freeMb=(gpu.freeMb!=null)?gpu.freeMb:null;
    var usedPct=(totMb&&freeMb!=null)?Math.max(0,Math.min(100,Math.round((totMb-freeMb)/totMb*100))):null;
    var fits=(gpu.fitsMoos!=null)?gpu.fitsMoos:null,name=g0.name||'GPU';
    var barPct=(util!=null)?util:(usedPct!=null?usedPct:0);
    var barColor=barPct>=85?'var(--danger)':(barPct>=60?'var(--warn)':'var(--ok)');
    chips+='<span class="hwc" title="'+esc(String(name))+' · utilização de compute (nvidia-smi)">🎮 '+(util!=null?('<b>'+util+'%</b>'):lNd())+' <span class="hwbar"><span style="width:'+barPct+'%;background:'+barColor+'"></span></span></span>';
    chips+='<span class="hwc" title="VRAM em uso">🧠 '+((usedPct!=null)?('<b>'+usedPct+'%</b> VRAM'):lNd())+'</span>';
    chips+='<span class="hwc" title="quantos moos locais cabem na VRAM livre (overclock)">🟢 cabem <b>'+(fits!=null?('+'+fits):'n/d')+'</b> moos</span>';
  } else {
    chips+='<span class="hwc" title="nvidia-smi não escreveu cache — sem GPU NVIDIA ou monitor parado">🎮 GPU '+lNd()+' <span class="lwhy">nvidia-smi ausente</span></span>';
  }
  var tps=(s&&s.localSpeed&&s.localSpeed.latest&&s.localSpeed.latest.tps!=null)?s.localSpeed.latest.tps:null;
  if(tps!=null)chips+='<span class="hwc" title="tok/s local medido (WS1)">⚡ <b>'+tps+'</b> tok/s</span>';
  chips+='<span class="hwc" title="a nvidia-smi neste cache não reporta temperatura">🌡️ '+lNd()+'</span>';
  chips+='<span class="hwc" title="sem amostragem de CPU no snapshot">CPU '+lNd()+'</span>';
  var plan=(s&&s.sub&&s.sub.profile)?esc(String(s.sub.profile)):null;
  chips+='<span class="hwc" title="plano de subscrição · limite semanal não exposto">💳 '+(plan||lNd())+' <span class="lwhy">%/sem n/d</span></span>';
  return '<div class="hwstrip" role="group" aria-label="hardware">'+chips+'</div>';
}
// 🏁 Pipeline — spec→plan→exec→review→ship. Load is derived from each session's REAL git/state signal
// (needsYou→review · commits-ahead→ship · dirty/working→exec); sessions with no stage signal are not
// placed (honest count in the footnote). Bottleneck = the fullest stage. spec/plan stay 0 until a
// per-session stage signal exists — never faked.
function renderPipeline(s){
  var rows=(s&&s.recent)||[],stages=[['spec','📋'],['plan','🗺️'],['exec','⚙️'],['review','🔍'],['ship','🚀']];
  var load={spec:0,plan:0,exec:0,review:0,ship:0},placed=0,i;
  for(i=0;i<rows.length;i++){var r=rows[i];if(!r)continue;var st=null;
    var dirty=r.gitStage&&Number(r.gitStage.dirty)>0;
    var ahead=r.sessionGit&&!r.sessionGit.uncertain&&Number(r.sessionGit.aheadOfMain)>0;
    if(r.needsYou)st='review';else if(ahead)st='ship';else if(dirty||r.working)st='exec';
    if(st){load[st]++;placed++;}
  }
  var max=0,bott=null,k;for(k in load){if(load[k]>max){max=load[k];bott=k;}}
  var segs='',q;for(q=0;q<stages.length;q++){var key=stages[q][0],n=load[key],isB=(bott===key&&max>0);
    segs+='<span class="pstage'+(isB?' bott':'')+'" title="'+key+' · '+n+' sessõe'+(n===1?'':'s')+(isB?' · gargalo':'')+'">'+stages[q][1]+' '+key+' <b>'+n+'</b>'+(isB?' ⛔':'')+'</span>';
    if(q<stages.length-1)segs+='<span class="parrow">→</span>';
  }
  var foot=placed?(placed+'/'+rows.length+' sessões colocadas · derivado de git/estado'):(rows.length?'sem sinal de etapa por sessão — n/d':'sem sessão ativa · as 5 etapas iluminam-se quando abres uma');
  return '<div class="pipeline" role="group" aria-label="pipeline spec plan exec review ship"><div class="prail">'+segs+'</div><span class="lwhy">🏁 '+foot+'</span></div>';
}
// ⇄ Handoff flow — the context river (Cowork→CC→moos→Ledger) with a particle down each pipe. Purely
// decorative + honest legend; the animation is CSS-only so reduced-motion switches it off globally.
function renderHandoffFlow(){
  var pipe='<span class="hpipe"><span class="hpart"></span></span>';
  return '<div class="hoflow" role="img" aria-label="fluxo de handoff: Cowork → CC → moos → Ledger">'
    +'<span class="hnode">🧠 Cowork</span>'+pipe+'<span class="hnode">💬 CC</span>'+pipe+'<span class="hnode">🐮 moos</span>'+pipe+'<span class="hnode">📒 Ledger</span>'
    +'<span class="lwhy" style="width:100%;margin-top:3px">nunca seca · nunca mente (work-aware)</span></div>';
}
// ── GUARDIAN:F1 ── pressure ladder + 🪶 chip embedded as webview siblings. In dev the
// real advisor fn is injected (single source of truth); the inline mirror is the fallback
// when guardian-chip.js / the advisor are absent. Shared by renderRow (herd) + sessionCard (MC).
const pressureLadder=${GCHIP?GCHIP.pressureLadder.toString():'function pressureLadder(t){var p=Number(t);if(!Number.isFinite(p))return "monitor";if(p>=99)return "emergency";if(p>=90)return "advise";if(p>=85)return "prune";if(p>=80)return "mask";return "monitor";}'};
const guardianChip=${GCHIP?GCHIP.guardianChip.toString():'function guardianChip(){return "";}'};
// ARCH TREE TAB (Frente E): renderArchTree(snapshot, mode) — concat-only, embedded sibling.
const renderArchTree=${ARCH&&ARCH.renderArchTree?ARCH.renderArchTree.toString():'function renderArchTree(){return "";}'};
// ── MISSION CONTROL TAB · Frente G — Mission Control renderer (concat-only/CSP-safe; renders
// PURELY from snapshot.mc). Self-contained (its own esc), so safe under .toString() injection.
const renderMissionControl=${MCV?MCV.renderMissionControl.toString():'function renderMissionControl(){return "<div class=\\"mc-nd\\">Mission Control indisponível</div>";}'};
// ── DELIVERY COCKPIT TAB · Frente B — Project command renderer (concat-only/CSP-safe; renders
// PURELY from snapshot.pc). Self-contained (own esc), so safe under .toString() injection.
const renderProjectCommand=${PCV&&PCV.renderProjectCommand?PCV.renderProjectCommand.toString():'function renderProjectCommand(){return "<div class=\\"pc-nd\\">Project command indisponível</div>";}'};
// wirePc: chevron toggles the wave's sub-sessions client-side; clickable session rows +
// data-a buttons go through wireButtons → the host (playWave/openSession/designWave/reprioritise).
function wirePc(root){if(!root)return;wireButtons(root);
  root.querySelectorAll('.pc-chev[data-wave]').forEach(function(c){c.onclick=function(){var id=c.getAttribute('data-wave');var box=root.querySelector('.pc-subs[data-wave-subs="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');if(!box){root.querySelectorAll('.pc-subs[data-wave-subs]').forEach(function(b){if(b.getAttribute('data-wave-subs')===id)box=b;});}if(!box)return;var open=box.hasAttribute('hidden');if(open){box.removeAttribute('hidden');c.classList.add('open');c.setAttribute('aria-expanded','true');var ci=c.querySelector('.pc-chevi');if(ci)ci.textContent='▾';}else{box.setAttribute('hidden','');c.classList.remove('open');c.setAttribute('aria-expanded','false');var ci2=c.querySelector('.pc-chevi');if(ci2)ci2.textContent='▸';}};});
  // clickable session rows (whole row → openSession); keyboard-accessible.
  root.querySelectorAll('.pc-srow.link[data-a="openSession"]').forEach(function(r){var go=function(){send('openSession',r.getAttribute('data-x'));};r.onclick=go;r.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  // v2 · axis toggle Fase↔Squad — client-side re-render + persist (like archMode). No host round-trip.
  root.querySelectorAll('.pc-axbtn[data-axis]').forEach(function(b){b.onclick=function(){pcAxis=(b.getAttribute('data-axis')==='squad')?'squad':'phase';try{var _st=vsapi.getState()||{};_st.pcAxis=pcAxis;vsapi.setState(_st);}catch(e){}renderPcView(lastSnap);};});
}
// DELIVERY COCKPIT TAB · Frente B — render the Project command view PURELY from s.pc at the
// persisted axis, then wire it. Guarded so a bad render never blanks the tab (mirrors renderArchView).
function renderPcView(s){
  const host=$('#v-pc');if(!host)return;
  if(!s||!s.pc){host.innerHTML='<div class="empty">🛩️ Project command — sem snapshot ainda (espera o próximo refresh)…</div>';return;}
  let html;try{html=renderProjectCommand(s.pc,{axis:pcAxis});}catch(er){html='<div class="pc-nd">Project command — erro de render · '+esc(String(er&&er.message||er))+'</div>';}
  host.innerHTML=html;try{wirePc(host);}catch(e){}
}
// ── MISSION CONTROL TAB · Frente G — Moo assistant state + wiring (survives the 7s re-render).
// Stream comes back as moo/moo-stream/moo-done (Frente 0 host handlers); mcApply re-paints.
let mcMoo={q:'',out:'',status:'idle',model:null,focused:false};
function mcApply(){var o=document.getElementById('mcMooOut');if(o){if(mcMoo.out){o.innerHTML='<div class="mc-moobubble">'+esc(mcMoo.out)+(mcMoo.status==='thinking'?' <span class="mc-cursor">▍</span>':'')+'</div>'+(mcMoo.model?'<div class="mc-moomodel">🐮 '+esc(mcMoo.model)+' · local · $0</div>':'');}else if(mcMoo.status==='thinking'){o.innerHTML='<div class="mc-moobubble">🐮 a pensar… <span class="mc-cursor">▍</span></div>';}else{o.innerHTML='';}}var i=document.getElementById('mcMooIn');if(i&&mcMoo.focused){try{i.focus();}catch(e){}}}
function mcAsk(q){var i=document.getElementById('mcMooIn');var v=(q!=null?q:(i?i.value:'')).trim();if(!v)return;mcMoo.q=v;mcMoo.out='';mcMoo.model=null;mcMoo.status='thinking';mcApply();send('askMoo',v);}
function wireMc(root){if(!root)return;wireButtons(root);
  // Deck Phase 5 (Sem-erro): the Audit filter chips filter rows CLIENT-SIDE (read-only) — override the
  // generic wireButtons send() (which hit a no-op host: a dead control) so the chip does what it says.
  var afil=root.querySelectorAll('.mcv2-afilter[data-a="auditFilter"]');
  if(afil.length){var arows=root.querySelectorAll('.mcv2-audrow');
    afil.forEach(function(b){b.onclick=function(){var x=b.dataset.x||'all';
      afil.forEach(function(o){o.classList.toggle('on',o===b);});
      arows.forEach(function(r){r.hidden=!(x==='all'||r.getAttribute('data-af')===x);});
    };});
  }
  var i=root.querySelector('#mcMooIn');var g=root.querySelector('#mcMooGo');
  if(i){i.value=mcMoo.q||'';i.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();mcAsk();}};i.onfocus=function(){mcMoo.focused=true;};i.onblur=function(){mcMoo.focused=false;};}
  if(g)g.onclick=function(){mcAsk();};
  root.querySelectorAll('.mc-chip.mc-q[data-q]').forEach(function(c){c.onclick=function(){mcAsk(c.getAttribute('data-q'));};});
  mcApply();}
// WCOCKPIT-3: wire per-session mode/model/auto controls (stop-propagation inside srow)
function wireSessControls(root){
  // B1 — feedback óptimista: o estado visual salta JÁ no clique; flashApply pulsa "a aplicar…" no
  // painel; o próximo snapshot reconcilia (re-render usa o valor real do registry). Nada parece morto.
  root.querySelectorAll('.smode[data-msess]').forEach(function(b){b.onclick=function(e){e.stopPropagation();var seg=b.parentNode;if(seg)seg.querySelectorAll('.smode').forEach(function(x){x.classList.remove('on');});b.classList.add('on');flashApply(b);send('setMode',{sid:b.dataset.msess,mode:b.dataset.mmode});};});
  root.querySelectorAll('.smodsel[data-msess]').forEach(function(s){s.onchange=function(e){e.stopPropagation();flashApply(s);send('setModel',{sid:s.dataset.msess,model:s.value});};s.onclick=function(e){e.stopPropagation();};});
  root.querySelectorAll('button.sauto[data-msess]').forEach(function(b){b.onclick=function(e){e.stopPropagation();var next=b.dataset.mauto!=='true';b.classList.toggle('on',next);b.dataset.mauto=String(next);b.textContent=next?'⚡ auto':'auto';flashApply(b);send('setAuto',{sid:b.dataset.msess,auto:next});};});
  root.querySelectorAll('button.sloop[data-msess]').forEach(function(b){b.onclick=function(e){e.stopPropagation();var next=b.dataset.mloop!=='true';b.classList.toggle('on',next);b.dataset.mloop=String(next);flashApply(b);send('setLoop',{sid:b.dataset.msess,loop:next});};});
  root.querySelectorAll('.sslash[data-msess]').forEach(function(s){s.onchange=function(e){e.stopPropagation();send('pickSlash',{sid:s.dataset.msess,cmd:s.value});};s.onclick=function(e){e.stopPropagation();};});
  root.querySelectorAll('.srow button.intrefresh').forEach(function(b){var o=b.onclick;b.onclick=function(e){e.stopPropagation();if(o)o.call(b,e);};});
  // B2 — chips de integração accionáveis: clicáveis SÓ quando o renderer pôs um data-a (alvo real).
  // openUrl: → página Notion · openFile: → ficheiro Obsidian. stopPropagation para não abrir a sessão.
  root.querySelectorAll('.srow .intchip[data-a]').forEach(function(c){var act=function(e){if(e&&e.stopPropagation)e.stopPropagation();var a=c.getAttribute('data-a')||'';if(a.indexOf('openUrl:')===0)send('openUrl',a.slice(8));else if(a.indexOf('openFile:')===0)send('openFile',a.slice(9));};c.onclick=act;c.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();act(e);}});});
  root.querySelectorAll('.srow button.sarch').forEach(function(b){var o=b.onclick;b.onclick=function(e){e.stopPropagation();if(o)o.call(b,e);};});
  root.querySelectorAll('.srow button.sgitbtn').forEach(function(b){var o=b.onclick;b.onclick=function(e){e.stopPropagation();if(o)o.call(b,e);};}); // WCOCKPIT-9 (Bloco C)
}
// ARCH TREE TAB (Frente E): render the Arquitectura Viva view PURELY from s.mc (MissionControlSnapshot),
// then wire the 3-mode switcher (client re-render + persist + {cmd:'archMode'}) and clickable leaves→openSession.
// Guarded so a bad render never blanks the tab. Separate from the Frente G Mission Control region.
function renderArchView(s){
  const host=$('#v-arch');if(!host)return;
  const snap=(s&&s.mc)||null;
  let html;try{html=renderArchTree(snap,archModeCur);}catch(er){html='<div class="empty">⚠ arch render error · '+esc(String(er&&er.message||er))+'</div>';}
  host.innerHTML=html;
  host.querySelectorAll('.arch-mode[data-arch-mode]').forEach(function(b){b.onclick=function(){const m=b.dataset.archMode;archModeCur=m;try{var _st=vsapi.getState()||{};_st.archMode=m;vsapi.setState(_st);}catch(e){}send('archMode',m);renderArchView(lastSnap);};});
  host.querySelectorAll('.arch-leaf[data-arch-sid]').forEach(function(el){const go=function(){send('openSession',el.dataset.archSid);};el.onclick=go;el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
}
// ── Deck Phase 1 · header spine (project switcher + inbox-by-exception) ──
// deckProject scopes the inbox to one Cowork project (null = all). Persisted like archMode/pcAxis.
let deckProject=null;try{var _dp=(vsapi.getState()||{}).deckProject;if(_dp)deckProject=_dp;}catch(e){}
function projOf(r){return (r&&(r.project||r.coworkProject))||null;}
function deckRows(s){var rs=(s&&s.recent)||[];return deckProject?rs.filter(function(r){return projOf(r)===deckProject;}):rs;}
function setDeckProject(p){deckProject=p||null;try{var st=vsapi.getState()||{};st.deckProject=deckProject;vsapi.setState(st);}catch(e){}if(lastSnap){renderSwitcher(lastSnap);renderInbox(lastSnap);}}
// Project switcher — options are the real Cowork projects seen across sessions (mode-registry projeto-por-sessão).
function renderSwitcher(s){
  var rs=(s&&s.recent)||[];var seen={};var projs=[];
  for(var i=0;i<rs.length;i++){var p=projOf(rs[i]);if(p&&p!=='Unassigned'&&!seen[p]){seen[p]=1;projs.push(p);}}
  projs.sort(function(a,b){return a.toLowerCase()<b.toLowerCase()?-1:1;});
  if(deckProject&&!seen[deckProject])deckProject=null; // persisted scope vanished → fall back to all
  var pj=$('#proj');if(pj)pj.textContent=deckProject||(s&&s.projectName)||'All projects';
  var menu=$('#pswitchMenu');if(!menu)return;
  function opt(label,val,isAll){var on=isAll?!deckProject:(deckProject===val);
    var cnt=isAll?rs.length:rs.filter(function(r){return projOf(r)===val;}).length;
    return '<button class="mi" role="radio" aria-checked="'+(on?'true':'false')+'" data-proj="'+esc(val||'')+'"><span><span class="tick">'+(on?'✓ ':'')+'</span>'+esc(label)+'</span><span class="mcount">'+cnt+'</span></button>';}
  var html=opt('All projects','',true);
  for(var k=0;k<projs.length;k++)html+=opt(projs[k],projs[k],false);
  menu.innerHTML=html;
  menu.querySelectorAll('.mi[data-proj]').forEach(function(b){b.onclick=function(){setDeckProject(b.dataset.proj);var d=$('#pswitch');if(d)d.open=false;};});
}
// Inbox — gestão por exceção. Every number is real (session flags + git); nothing fabricated.
// budget% is intentionally absent until W6 (no spend source exists yet — honest, not a placeholder number).
function renderInbox(s){
  var box=$('#inbox');if(!box)return;var rows=deckRows(s);
  var yourTurn=rows.filter(function(r){return r&&r.needsYou;});
  var mergeGate=rows.filter(function(r){return r&&r.sessionGit&&!r.sessionGit.uncertain&&Number(r.sessionGit.aheadOfMain)>0;}).length;
  // HONEST-CONTROLS D2: "unsaved" is a REPO fact — one dirty working tree, not N sessions. Collapse
  // by cwd (r.gitStage.dirty grouped once per repo) so 1 dirty repo = 1 chip. A repo whose whole
  // dirt is meta (SYNC.md/_handoff/docs/*.md/manifests) reads calm 📝, never a scary ⚠️.
  var dirtyRepos=inboxRepoSummary(rows);
  var flowing=rows.filter(function(r){return r&&(r.working||r.waitingForCowork);}).length;
  var yt=yourTurn.length,out='';
  if(yt>0){var who=esc(String(yourTurn[0].coworkTitle||yourTurn[0].brainTitle||yourTurn[0].name||yourTurn[0].id||'')).slice(0,40);
    out+='<button class="inbox-turn" data-inbox="turn" title="Claude terminou e espera a tua resposta"><span class="dot"></span>🙋 '+yt+' '+(yt===1?'sessão à tua espera':'sessões à tua espera')+' <span style="font-weight:600;opacity:.8">(your turn'+(yt===1&&who?' · '+who:'')+')</span></button>';}
  var chips='';
  if(mergeGate>0)chips+='<button class="inbox-chip gate" data-inbox="cockpit" title="ramos com commits à frente de main — decisão de merge à espera">🔴 <span class="n">'+mergeGate+'</span> merge gate</button>';
  for(var ri=0;ri<dirtyRepos.length;ri++){var rm=dirtyRepos[ri];
    var tip=esc(rm.repo+' · '+rm.dirty+' por commitar'+(rm.sample.length?(' — '+rm.sample.join(', ')):''));
    if(rm.meta)chips+='<button class="inbox-chip meta" data-inbox="cockpit" title="'+tip+'">📝 <span class="n">'+rm.dirty+'</span> '+esc(rm.repo)+' meta</button>';
    else chips+='<button class="inbox-chip unsaved" data-inbox="cockpit" title="'+tip+'">⚠️ <span class="n">'+rm.dirty+'</span> '+esc(rm.repo)+'</button>';}
  if(flowing>0)chips+='<button class="inbox-chip flow" data-inbox="cockpit" title="sessões a fluir (a trabalhar / com o Cowork)">🟢 <span class="n">'+flowing+'</span> flui</button>';
  if(chips)out+='<div class="inbox-chips">'+chips+'</div>';
  if(!out){box.className='inbox calm';box.innerHTML='<div class="inbox-calm"><span class="ic">🟢</span> Tela calma — a frota flui'+(rows.length?(' ('+rows.length+' '+(rows.length===1?'sessão':'sessões')+')'):'')+'</div>';}
  else{box.className='inbox'+(yt>0?' hasturn':'');box.innerHTML=out;}
  box.querySelectorAll('[data-inbox]').forEach(function(b){b.onclick=function(){goTab('cockpit');var h=document.querySelector('#v-cockpit .herd');if(h&&h.scrollIntoView)h.scrollIntoView({block:'nearest'});};});
}
// Header disclosure menus: single-open, Escape closes, outside-click closes, +New actions.
(function(){
  var sw=$('#pswitch'),nw=$('#pnew');var dets=[sw,nw].filter(Boolean);
  dets.forEach(function(d){d.addEventListener('toggle',function(){if(d.open)dets.forEach(function(o){if(o!==d)o.open=false;});});
    d.addEventListener('keydown',function(e){if(e.key==='Escape'){d.open=false;var sm=d.querySelector('summary');if(sm)sm.focus();}});});
  document.addEventListener('click',function(e){dets.forEach(function(d){if(d.open&&!d.contains(e.target))d.open=false;});});
  if(nw)nw.querySelectorAll('.mi[data-new]').forEach(function(b){b.onclick=function(){if(b.disabled)return;if(b.dataset.new==='cc')send('launch');nw.open=false;};});
})();
window.addEventListener('message',(e)=>{
  // ⇄ Handoff v2.1 — live panel stream: skeleton 'ready' (copiado já) → 'enriched' (narrativa LLM
  // local · recopiado). 'generating'/'done' continuam suportados (compat). Store + apply.
  if(e.data.type==='handoff'){const id=e.data.sid;if(id!=null){hoffState[id]={status:e.data.status,text:e.data.text||'',stream:'',model:e.data.model||null};hoffApply(id,hoffState[id]);}return;}
  // ⇄ F2 live streaming: each token of the local narrative arrives as a 'handoff-stream' chunk and is
  // concatenated under the skeleton; 'handoff-done' fixes the final text (facts + narrative) and re-enables Copiar.
  if(e.data.type==='handoff-stream'){const id=e.data.sid;if(id!=null){const st=hoffState[id]||(hoffState[id]={status:'streaming',text:'',stream:'',model:null});st.status='streaming';st.stream=(st.stream||'')+(e.data.chunk||'');if(e.data.model)st.model=e.data.model;hoffApply(id,st);}return;}
  if(e.data.type==='handoff-done'){const id=e.data.sid;if(id!=null){const st=hoffState[id]||(hoffState[id]={status:'done',text:'',stream:'',model:null});st.status='done';st.text=e.data.text||st.text||'';st.stream='';if(e.data.model)st.model=e.data.model;hoffApply(id,st);}return;}
  // ── MISSION CONTROL TAB · Frente G — Moo assistant stream (reuses the handoff-stream pattern).
  if(e.data.type==='moo'){if(e.data.status==='thinking'){mcMoo.status='thinking';mcMoo.out='';mcApply();}return;}
  if(e.data.type==='moo-stream'){mcMoo.status='thinking';mcMoo.out=(mcMoo.out||'')+(e.data.chunk||'');mcApply();return;}
  if(e.data.type==='moo-done'){mcMoo.status='idle';mcMoo.out=e.data.text||mcMoo.out||'';if(e.data.model)mcMoo.model=e.data.model;mcApply();return;}
  if(e.data.type==='intent'){const r=e.data.res;
    if(r&&r.cmd){inR.innerHTML='→ <b>'+esc(r.cmd)+'</b>'+(r.conf!=null?' <span style="opacity:.7">(conf '+r.conf+(r.rule?' · '+esc(r.rule):'')+')</span>':'')+' <button class="sm" id="intentRun">run</button>';
      document.getElementById('intentRun').onclick=()=>send('term',r.cmd);}
    else {inR.innerHTML='🐮 not a known command — <button class="sm" id="intentTerm">open Terminal</button> to run it manually';var _it=document.getElementById('intentTerm');if(_it)_it.onclick=function(){goTab('doctor');};}
    return;}
  if(e.data.type!=='snapshot')return;const s=e.data.s;lastSnap=s;
  // B2 — stable scroll: the periodic snapshot re-renders every view's innerHTML, which
  // resets the document scroll and makes the panel jump/flicker. Capture the active scroll
  // now and restore it after all views are rebuilt (only the visible view has height, so a
  // single document-level capture/restore covers the cockpit AND the other tabs).
  const _preScroll=(function(){try{return window.scrollY||document.documentElement.scrollTop||0;}catch(_){return 0;}})();
  // ARCH TREE TAB (Frente E): render the Arquitectura Viva view every snapshot (before any early
  // return below), guarded so it can never blank the cockpit. Renders purely from s.mc.
  try{renderArchView(s);}catch(e){}
  const m=s.metrics||{};const me=s.me||{};const decs=s.decisions||[];const score=s.score||{pct:0,checks:[]};
  renderSwitcher(s);renderInbox(s);
  const pr=s.paired||{};
  $('#pair').innerHTML=pr.ok?'<span title="paired with Claude Code '+esc(pr.version)+'" style="color:var(--g)">✕ ✱ Claude Code ✓</span>':'<span title="Claude Code extension not found" style="color:var(--t3)">✕ ✱ not paired</span>';
  curMode=s.mode||'auto';$('#modeBadge').textContent=MOO[s.mode]||('🐮 '+s.mode);
  // Deck Phase 4 · vaca por modo — the header cow animates by mode (crazy=frantic · lazy=relaxed ·
  // moo/auto=gentle walk). CSS-only, so reduced-motion stills it globally.
  (function(){var cw=$('#brandCow');if(cw)cw.className='livecow '+(s.mode==='crazy'?'crazy':(s.mode==='lazy'?'lazy':'working'));})();
  $('#scoreBadge').textContent=score.pct+'%';

  // WIZARD quando engine falta
  if(!s.runtimeInstalled){
    $('#v-cockpit').innerHTML='<div class="card hero"><div class="lbl">Setup wizard</div><div class="sub" style="margin-top:6px">Same flow as mooter.ai/onboarding.</div></div><div class="card">'+
      [{ok:s.claudeCli,t:'Claude Code CLI',d:s.claudeCli?'detected':'install Claude Code first'},
       {ok:false,t:'mooter engine',d:'one command — local routing + savings',b:['Install engine','install']},
       {ok:(s.ollama||[]).length>0,t:'Ollama (free T0)',d:'optional',b:['ollama.com →','openUrl:https://ollama.com/download']},
       {ok:false,t:'First routed prompt',d:'launch a session'}]
      .map((st,i)=>'<div class="wstep'+(st.ok?' done':'')+'"><div class="n">'+(st.ok?'✓':i+1)+'</div><div class="w">'+esc(st.t)+'<small>'+esc(st.d)+'</small></div>'+(st.b?'<button data-a="'+st.b[1]+'">'+esc(st.b[0])+'</button>':'')+'</div>').join('')+'</div>';
    wireButtons($('#v-cockpit'));return;
  }

  // ── COCKPIT: hero + score + next actions (req 7,12)
  const pend=(score.checks||[]).filter(c=>!c.ok);
  // ── Session scope: the cockpit numbers reflect ONE session (auto-follow the active
  // one, or a pinned pick from the selector), or all sessions when 'all'.
  const selSess=s.selectedSession||'auto';const effSess=s.effectiveSession||null;
  const M=(effSess&&s.sessionMetrics)?s.sessionMetrics:m; // scoped metrics (savings/prompts)
  const realLocalN=(M.option_a_hits||0); // REAL local executions (Option-A deflections), scoped
  const decScoped=effSess?decs.filter(d=>d.sid===effSess):decs; // scoped tier-mix
  // ── Live herd: every open session as its own walking cow (working · LLM · tab name).
  // Click a cow to focus the numbers below on it. This is the multi-session view.
  const rsess=s.recent||[];
  // Feature 1+2: each session carries its own repo-scoped PR (r.pr, resolved host-side by
  // gh run in the session's cwd). "Linked" = ≥2 sessions on the SAME repo AND branch (same
  // work) — keyed by cwd+branch so a same-named branch in a different repo is never crossed.
  const bkey=(r)=>JSON.stringify([String(r.cwd||''),String(r.branch||'')]); // repo+branch composite key (clean, collision-free)
  const branchCount={};for(const r of rsess){if(r.branch)branchCount[bkey(r)]=(branchCount[bkey(r)]||0)+1;}
  // WCOCKPIT-3: rowFor delegates to renderRow (defined above from row-renderer.js)
  // WCOCKPIT-5: try/catch guard — a single bad row must NOT blank the whole cockpit panel
  // WCOCKPIT-9 (Bloco D): passa os modelos locais REAIS (snapshot.ollama) ao dropdown por sessão.
  // (Bloco F): loopActive = liveness honesta do loop-runner. (Bloco E): slashCommands = picker real.
  const localModels=s.ollama||[];const loopActive=!!s.loopActive;const slashCommands=s.slashList||[];
  const rowFor=(r,gctx)=>{try{return renderRow(r,{selSess,effSess,branchCount,nowMs:Date.now(),groupBranch:gctx&&gctx.branch,groupGitKey:gctx&&gctx.gitKey,localModels,loopActive,slashCommands});}catch(er){return '<div class="srow" style="opacity:.5;font-size:9px;padding:5px 8px">⚠ render error · '+esc(String(er&&er.message||er))+'</div>';}}
  // WCOCKPIT-2: sort needs-you first, then most recent (host already sorts, but snapshot may arrive pre-sorted)
  const sorted=[...rsess].sort((a,b)=>{if(!!a.pinned!==!!b.pinned)return a.pinned?-1:1;if(a.needsYou!==b.needsYou)return a.needsYou?-1:1;return(b.lastActiveTs||0)-(a.lastActiveTs||0);});
  // WCOCKPIT-9 (Bloco A): agrupa por PROJETO COWORK real (espelho). O repoFolder deixa de
  // mascarar-se de projeto: é fallback ROTULADO ('repo (sem Cowork)') só quando há repo git
  // real (branch/gitStage); um cwd qualquer (ex.: System32) cai em 'Unassigned · sem Cowork'.
  const isRealRepo=(r)=>!!(r.repoFolder&&(r.branch||r.gitStage));
  const projOf=(r)=>r.coworkProject?r.coworkProject:(isRealRepo(r)?r.repoFolder:'Unassigned');
  const originOf=(r)=>r.coworkProject?'cowork':(isRealRepo(r)?'repo':'unassigned');
  const _grp={};const _ord=[];const _origin={};for(const r of sorted){const k=projOf(r);if(!(k in _grp)){_grp[k]=[];_ord.push(k);_origin[k]=originOf(r);}_grp[k].push(r);}
  const grpHd=(k,gr)=>renderGroupHeader(k,gr,{origin:_origin[k]});
  // WCOCKPIT-6: roll up branch + git stage to the group header; pass as context so cards dedup.
  const gitKeyOf=(r)=>r.gitStage?(r.gitStage.state+':'+(r.gitStage.dirty||0)+':'+(r.gitStage.ahead||0)):'';
  const groupCtx=(gr)=>{let branch=null,gitKey=null;for(const r of gr){if(!branch&&r.branch)branch=r.branch;if(!gitKey&&r.gitStage)gitKey=gitKeyOf(r);}return{branch,gitKey};};
  const herdRows=sorted.length?_ord.map(k=>{const gr=_grp[k];const gc=groupCtx(gr);return '<div class="grpsec'+cc('grp:'+k)+'" data-collap="grp:'+esc(k)+'">'+grpHd(k,gr)+gr.map(r=>rowFor(r,gc)).join('')+'</div>';}).join(''):'<div role="status" style="text-align:center;padding:16px 10px"><div style="font-size:28px;line-height:1">🐮</div><div style="font-weight:600;margin-top:6px">Nenhuma sessão ativa</div><div class="sub" style="margin:4px 0 10px">Abre um separador Claude Code e envia um prompt — o Mooter roteia-o e a herd acende-se.</div><button class="go" data-a="launch">★&nbsp; New CC — começar</button></div>';
  // Honest link note: branches shared by ≥2 sessions (same work), if any.
  const sharedKeys=Object.keys(branchCount).filter(k=>branchCount[k]>1);
  const linkNote=sharedKeys.length?'<div class="sub" style="font-size:9px;margin-top:4px">🔗 '+sharedKeys.map(k=>esc((JSON.parse(k)[1]||k))+' ('+branchCount[k]+')').join(' · ')+' — sessions on the same repo+branch are the same work</div>':'';
  const allRow='<div class="srow'+(selSess==='all'?' on':'')+'" data-sess="all" role="button" tabindex="0"><span class="livecow">🌐</span><div class="sbody"><div class="stop"><span class="sname">All sessions</span><span class="sllm">global</span></div><div class="ssub">every session combined</div></div></div>';
  const needN=rsess.filter(r=>r.needsYou).length;
  const clearableN=rsess.filter(r=>!r.working&&!r.needsYou&&!r.waitingForCowork&&(r.ageMs||0)>1800000).length; // WCOCKPIT-7: old & safe-to-close
  // B3 — declutter: contadores por estado + barra de filtro/procura (só quando há sessões suficientes
  // para densidade importar; <5 sessões não esconde idle por defeito, para não surpreender).
  const activeN=rsess.filter(r=>r.working||r.waitingForCowork).length;
  const idleN=rsess.filter(r=>!r.working&&!r.needsYou&&!r.waitingForCowork).length;
  const showFilter=rsess.length>=5;
  const hfBar=showFilter?('<div class="herdfilter"><input class="herdq" placeholder="🔎 filtrar sessões…" aria-label="filtrar sessões por nome" value="'+esc(herdQuery)+'"><div class="herdchips" role="toolbar" aria-label="filtrar a herd por estado">'
    +'<button class="hf" data-hf="atencao" title="precisam de ti + activas (esconde idle/done)">🎯 Atenção</button>'
    +'<button class="hf" data-hf="needs" title="só as que esperam pela tua resposta">🟡 Precisam <b>'+needN+'</b></button>'
    +'<button class="hf" data-hf="active" title="a gerar agora ou à espera do Cowork">🟢 Activas <b>'+activeN+'</b></button>'
    +'<button class="hf" data-hf="idle" title="já fizeram o trabalho (idle)">✅ Idle <b>'+idleN+'</b></button>'
    +'<button class="hf" data-hf="all" title="mostrar todas">Todas <b>'+rsess.length+'</b></button>'
    +'<button class="hf hfcompact" data-hfc="1" title="modo compacto — esconde sublines para densidade">▾ compacto</button>'
    +'</div></div>'):'';
  const hfEmpty=showFilter?'<div class="herdempty" hidden role="status"><span class="herdemptytxt"></span><button class="sm" data-hf="all">Ver todas</button></div>':'';
  const herdCard='<div class="card'+cc('herd')+'" style="padding:9px 11px;margin-bottom:8px" data-collap="herd"><div class="lbl collaphead"><span class="chev">▾</span>🐄 Live sessions <span style="float:right;display:inline-flex;gap:7px;align-items:center;opacity:.6;font-size:9px">'+(clearableN?'<button class="clrdone" title="close '+clearableN+' old session'+(clearableN===1?'':'s')+' that already did their job — archive, reversible">🧹 clear '+clearableN+'</button>':'')+'<span>'+rsess.length+' recent'+(needN?' · '+needN+' need you':'')+'</span></span></div>'+hfBar+'<div class="herd">'+herdRows+allRow+'</div>'+hfEmpty+linkNote+'<div class="sub" style="font-size:9px;margin-top:6px">● working (generating) · <span class="needsyou">⬤ your turn</span> (Claude finished, waiting for your reply) · <b>click a cow to open that session in Claude Code</b>. Reads ~/.claude logs · branch/PR via git+gh.</div></div>';
  // WS3: Local Moo Fleet — local moos working on handoffs in PARALLEL with the cloud CC ($0).
  // Read-only render from the snapshot (recent rows carry .localMoo; s.localSpeed = measured tok/s).
  // Guarded so a render error never blanks the cockpit; idle-safe inside the renderer.
  const fleetCard=(function(){try{return renderLocalFleet(rsess,{localSpeed:s.localSpeed,nowMs:Date.now(),readyN:(s.ollama||[]).length,dispatchN:(M.option_a_hits||0)});}catch(er){return '';}})();
  const fleetConsoleCard=(function(){try{return renderFleetConsole(s.fleet);}catch(er){return '';}})();
  // Deck Phase 3 · Lentes ligadas — each guarded so a bad source can never blank the cockpit.
  const flowLens=(function(){try{return renderFlowLens(s);}catch(er){return '';}})();
  const economicsLens=(function(){try{return renderEconomicsLens(s);}catch(er){return '';}})();
  const brainLens=(function(){try{return renderBrainLens(s);}catch(er){return '';}})();
  const foundationsLens=(function(){try{return renderFoundationsLens(s);}catch(er){return '';}})();
  // Deck Phase 4 · Vida — guarded so a bad hardware/pc source can never blank the cockpit.
  const hwStripCard=(function(){try{return renderHwStrip(s);}catch(er){return '';}})();
  const pipelineCard=(function(){try{return renderPipeline(s);}catch(er){return '';}})();
  const handoffFlowCard=(function(){try{return renderHandoffFlow();}catch(er){return '';}})();
  const cnt=tc(decScoped);const tot=Math.max(1,cnt.T0+cnt.T1+cnt.T2+cnt.T3);
  // B5 — compact tier mix: one slim segmented bar + tiny labels (was 4 full-width stacked bars).
  let mixSeg='',mixLab='';for(const t of['T0','T1','T2','T3']){const p=Math.round(100*cnt[t]/tot);if(cnt[t]>0)mixSeg+='<span title="'+t+(t==='T0'?' local':'')+' · '+p+'%" style="flex:'+cnt[t]+';background:'+TCOL[t]+'"></span>';mixLab+='<span style="color:'+TCOL[t]+'">'+t+(t==='T0'?' local':'')+' '+p+'%</span>';}
  const mixBar='<div class="tiermix" role="img" aria-label="router tier mix, last '+decScoped.length+' decisions">'+mixSeg+'</div>';
  const mixLabels='<div class="tiermixl">'+mixLab+'</div>';
  const installed=(s.ollama||[]).map(x=>x.name);
  const curPin=(s.pinNext&&s.pinNext.model)||'';
  const selAttr=(v)=>v===curPin?' selected':'';
  let pinOpts='<option value=""'+selAttr('')+'>🐮 Auto — let Moo decide</option>';
  const locals=installed.filter(n=>PIN_LOCAL[n]);
  // Honest speed hint from REAL model size (ollama /api/tags). Heavy local models
  // (>=8GB) cold-load slowly and often spill to CPU on laptops (e.g. gemma4:e4b ~9.6GB
  // => first reply ~1-2min); small ones (<=4GB, e.g. qwen2.5:3b) answer in seconds.
  // null size => make no claim. Annotates the label only; the <option> value stays the bare model id.
  const ollSize={};(s.ollama||[]).forEach(x=>{if(x&&x.name)ollSize[x.name]=x.sizeGb;});
  const localTag=(n)=>{const g=ollSize[n];if(g==null)return '';if(g>=8)return ' \u00b7 '+g+'GB \u26a0 lento';if(g<=4)return ' \u00b7 '+g+'GB \u26a1';return ' \u00b7 '+g+'GB';};
  const isHeavyLocal=(n)=>{const g=ollSize[n];return g!=null&&g>=8;};
  if(locals.length)pinOpts+='<optgroup label="Local (Ollama)">'+locals.map(n=>'<option value="'+esc(n)+'"'+selAttr(n)+'>'+esc(n)+esc(localTag(n))+'</option>').join('')+'</optgroup>';
  pinOpts+='<optgroup label="Claude">'+Object.keys(PIN_CLOUD).map(k=>{const id='claude-'+PIN_CLOUD[k].replace(/^mooter-/,'');return '<option value="'+esc(id)+'"'+selAttr(id)+'>'+esc(k)+'</option>';}).join('')+'</optgroup>';
  const lv=s.live; // executor of the focused session (used by the "Actually ran" line below)
  // B3 — preserva o foco/cursor do campo de procura através do re-render periódico (7s) para a escrita não saltar.
  const _qa=document.activeElement;const _qFocused=!!(_qa&&_qa.classList&&_qa.classList.contains('herdq'));const _qCaret=_qFocused?_qa.selectionStart:null;
  $('#v-cockpit').innerHTML=
    // B1 — primary action at the TOP (was buried at the bottom), full-width CTA weight.
    // B8 — caption: what it does + what happens next (Mooter routes every prompt).
    '<button class="go" data-a="launch" style="margin-bottom:4px">✱&nbsp; New Claude Code session</button>'+
    '<div class="hint" style="margin:0 0 10px">opens a fresh Claude Code tab — Mooter routes every prompt to the cheapest tier that fits · '+esc(MOO[s.mode]||s.mode)+' active</div>'+
    hwStripCard+
    pipelineCard+
    (function(){
      // Honesty: the headline is ADVISORY — "what you'd save IF each prompt ran on its
      // recommended tier". The host model actually answers in a CC session, so the only
      // GUARANTEED savings are real local dispatches (guaranteed_saved/executions). We
      // keep the $ (per your choice) but label it advisory and show the real number too.
      // Coherence: pair the $ with the count from the SAME source. Both guaranteed_saved
      // and option_a_hits come out of computeMetrics(ForSession), so they scope together —
      // under a session they're THAT session's, globally they're all-time. (M.executions is
      // a process-global aggregate that never scopes by session — using it under a
      // "this session" label would mix scopes, which is exactly what we must not do.)
      const execN=M.option_a_hits||0;
      const realSaved=(typeof M.guaranteed_saved==='number')?M.guaranteed_saved:0;
      const scopeChip=effSess?'<span style="float:right;opacity:.6;font-size:9px">ⓘ advisory · this session</span>':'<span style="float:right;opacity:.6;font-size:9px">ⓘ advisory · estimativa</span>';
      return '<div class="card hero" title="'+esc((s.trail&&s.trail.saved&&s.trail.saved.formula)||'savings-tracker /metrics — token-estimated, advisory: the host model answers; the tier is a recommendation, not a billed execution')+'"><div class="lbl">Saved vs all-Opus '+scopeChip+'</div><div class="big" role="status" aria-live="polite" aria-label="savings versus all-Opus this session">$'+(M.saved||0).toFixed(2)+'</div><div class="sub"><b>'+(M.saved_pct||0)+'%</b> below all-Opus · <span title="what you would save IF every prompt ran on its recommended tier — token-estimated, not billed">advisory</span></div><div class="sub" style="margin-top:3px"><span style="color:var(--g)">✓ real executed:</span> <b>$'+realSaved.toFixed(2)+'</b> · '+execN+' local dispatch'+(execN===1?'':'es')+(execN?'':' yet')+'</div>'+(s.trackerUp?'':'<div class="sub" style="color:var(--acc-warm)">⚠ tracker offline, last known</div>')+'</div>';
    })()+
    (function(){
      const gTok = M.graph_saved_tokens_est || 0;
      const gRes = M.graph_resolved_count || 0;
      if (gRes <= 0 && gTok <= 0) return '';
      return '<div class="card graph" title="Graphify A/B benchmark — advisory, token-estimated. ~34x fewer input tokens than reading the hit-files; ≈par vs raw grep, but returns the call graph. repo ~1781 files, n=8, real tokenizer. Not published.">'
        + '<div class="lbl">🕸 Context savings · Graphify <span style="float:right;opacity:.6;font-size:9px">ⓘ advisory · benchmark</span></div>'
        + '<div class="big">~34×</div>'
        + '<div class="sub"><b>fewer input tokens vs reading the files</b> · ≈par vs grep · repo ~1781 · n=8</div>'
        + '<div class="sub" style="margin-top:3px"><span style="color:var(--g)">✓ this machine:</span> ~<b>' + gTok.toLocaleString() + '</b> ctx-tokens saved · ' + gRes + ' graph-resolved</div>'
        + '</div>';
    })()+
    '<div class="seg" style="margin-bottom:2px">'+['zen','auto','beast'].map(mo=>'<div class="mo'+(s.mode===mo?' on':'')+'" data-m="'+mo+'" role="button" tabindex="0">'+MOO[mo]+'</div>').join('')+'</div>'+
    '<div class="hint" style="margin:0 0 8px;text-align:left;font-size:9px">🐄 LazyMoo saves most · 🐮 Moo balances · 🐂 CrazyMoo always strongest — sets the default tier for new prompts</div>'+
    '<div class="card pincard'+cc('pin')+'" data-collap="pin"><div class="pinhead collaphead"><span class="chev">▾</span>🎯 Next prompt model</div><div class="pinsub">picks the model for your very next prompt — auto-routed, no paste</div><select id="pinSel" title="picks the model for your very next prompt — auto-routed, no paste" class="pinsel">'+pinOpts+'</select>'+(curPin?'<div class="pinnow">→ pinned: <b>'+esc(curPin)+'</b>'+(isHeavyLocal(curPin)?' <span style="opacity:.65;font-size:9px">\u00b7 modelo pesado: 1\u00aa resposta pode levar ~1-2min (cold-load + CPU)</span>':'')+'</div>':'')+'</div>'+
    fleetCard+
    fleetConsoleCard+
    herdCard+
    flowLens+
    economicsLens+
    brainLens+
    foundationsLens+
    handoffFlowCard+
    '<div class="card'+cc('score')+'" data-collap="score"><div class="lbl collaphead"><span class="chev">▾</span>🎯 Mooter Score · '+score.done+'/'+score.total+'</div><div class="scorebar"><div class="f" style="width:'+score.pct+'%"></div></div>'+
    (pend.length?pend.map(c=>'<div class="dr"><span>◻︎</span><div class="w">'+esc(c.t)+'</div><button class="sm" data-a="'+esc(c.fix)+'">fix</button></div>').join(''):'<div class="sub">🏆 perfect setup — nothing pending</div>')+'</div>'+
    '<div class="row"><div class="card"><div class="v">'+(M.prompts||0)+'</div><div class="k">Prompts</div></div><div class="card"><div class="v">'+(me.prompts_today!=null?me.prompts_today:'—')+'</div><div class="k">Today</div></div><div class="card"><div class="v">$'+(M.avg_saved_per_prompt||0).toFixed(3)+'</div><div class="k">Avg saved</div></div></div>'+
    '<div class="card'+cc('recs')+'" data-collap="recs"><div class="lbl collaphead"><span class="chev">▾</span>Router mix · last '+decScoped.length+' <span style="float:right;opacity:.6;font-size:9px">advisory</span>'+mixBar+'</div>'+mixLabels+localSpark(decScoped)+'<div class="sub" style="font-size:9px;margin-top:5px">T0 = local · the host model answers, so the tier is a suggestion not a bill. <b>Ran last:</b> '+(lv&&lv.real?esc(lv.emoji)+' '+esc(modelLabel(lv.model)):'host model')+' · '+realLocalN+' real local</div></div>'+
    '<div id="tokLedger">'+ledgerHtml(s)+'</div>';
  wireButtons($('#v-cockpit'));
  wireSessControls($('#v-cockpit')); // WCOCKPIT-3: per-session mode/model/auto controls
  wireHoff($('#v-cockpit'));hydrateHoff(); // ⇄ Handoff v2: stop-propagation on panels/projBtn + re-apply live text after the re-render
  document.querySelectorAll('#v-cockpit .seg .mo').forEach(el=>{const go=()=>{const seg=el.parentNode;if(seg)seg.querySelectorAll('.mo').forEach(x=>x.classList.remove('on'));el.classList.add('on');flashApply(el);send('mode',el.dataset.m);};el.onclick=go;el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  (function(){const ps=$('#pinSel');if(ps)ps.onchange=()=>{flashApply(ps);send('pinNext',ps.value);};})();
  document.querySelectorAll('#v-cockpit .srow').forEach(el=>{const go=()=>{const v=el.dataset.sess;send(v==='all'?'selectSession':'openSessionTab',v);};el.onclick=go;el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  // Deck Floor (Fase 2): persistent pin toggle — stops row-open propagation; persists via host→mode-registry.
  document.querySelectorAll('#v-cockpit .spin[data-psess]').forEach(b=>{b.onclick=(e)=>{e.stopPropagation();const next=b.dataset.pinned!=='true';b.classList.toggle('on',next);b.dataset.pinned=String(next);b.setAttribute('aria-pressed',String(next));flashApply(b);send('pinSession',{sid:b.dataset.psess,pinned:next});};b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation();});});
  document.querySelectorAll('#v-cockpit .clrdone').forEach(b=>{b.onclick=(e)=>{e.stopPropagation();const rs=(lastSnap&&lastSnap.recent)||[];const ids=rs.filter(r=>!r.working&&!r.needsYou&&!r.waitingForCowork&&(r.ageMs||0)>1800000).map(r=>r.fullId);send('clearDoneSessions',ids);};});
  // Deck Phase 3 · lens quick-nav links → jump to the matching tab (Flow→pc, Economics/Brain→decisions, Foundations→doctor).
  document.querySelectorAll('#v-cockpit .lens .llink[data-goto]').forEach(el=>{const go=()=>goTab(el.dataset.goto);el.onclick=go;el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  wireLedgerToggle();
  wireCollapse($('#v-cockpit'));
  wireHerdFilter();applyHerdFilter();herdDiag();enforceHerdVisible(); // B3 filter · PASSO0 dev diag (capture) · PASSO2 invariant (force-visible if collapse/filter emptied the herd)
  if(_qFocused){const _q2=document.querySelector('#v-cockpit .herdq');if(_q2){try{_q2.focus();const _n=_qCaret==null?_q2.value.length:_qCaret;_q2.setSelectionRange(_n,_n);}catch(_){}}}

  // ── SETUP: HW/SW/Subs + budget editor (req 3,8)
  const dev=s.device||{};const hwd=dev.hardware||{};const sw=dev.software||{};const subs=dev.subscriptions||{};const hw=s.hw||{};
  const bud=(s.budget&&s.budget.monthly_budget_usd)||0;
  const kv=(k,v)=>'<div class="kv"><span>'+esc(k)+'</span><span>'+(v==null||v===''?'<i style="color:var(--r)">missing</i>':esc(v))+'</span></div>';
  $('#v-setup').innerHTML=
    '<div class="card"><div class="lbl">🎮 Hardware</div>'+kv('GPU',hw.name||hwd.gpu||null)+kv('VRAM',hw.vram_mb?(hw.vram_mb/1024).toFixed(0)+' GB':null)+kv('Tier',hw.hw_tier||hwd.hw_tier)+kv('RAM',hwd.ram_gb?hwd.ram_gb+' GB':null)+kv('CPU cores',hwd.cpu_cores)+kv('Platform',(hwd.platform||'')+(hwd.arch?'/'+hwd.arch:''))+
      (!s.device?'<div class="sub" style="margin-top:6px">profile not captured yet</div><button class="sm" data-a="term:node ~/.claude/tools/router/setup-profile.js --non-interactive" style="margin-top:4px">Detect now</button>':'')+'</div>'+
    '<div class="card"><div class="lbl">💾 Software</div>'+kv('Node',sw.node_version)+kv('Claude Code',sw.claude_code_version)+kv('VS Code',sw.vscode_installed?'yes':'detected (you are here 🐮)')+kv('Ollama',(s.ollama||[]).length?'running · '+(s.ollama.length)+' models':(sw.ollama_installed?'installed (stopped)':'offline'))+'</div>'+
    '<div class="card"><div class="lbl">🔑 Subscriptions</div>'+kv('Anthropic',subs.anthropic||(s.sub&&s.sub.profile))+kv('OpenAI',subs.openai)+kv('Gemini',subs.gemini)+kv('Ollama',subs.ollama)+'<div class="sub" style="margin-top:5px">keys & tiers drive T1-T3 budgets</div></div>'+
    '<div class="card"><div class="lbl">💰 Monthly budget — the Moo calibrates around this</div><div style="display:flex;gap:8px;align-items:center;margin-top:8px">$ <input type="number" id="budIn" value="'+bud+'" min="0" step="10"><button class="sm" id="budSet">Set</button><span class="sub">'+(bud?'cap active in applyBudgetCap()':'not set — routing uncapped')+'</span></div></div>'+
    // ── GUARDIAN:F0 ── context guardrail card — write CLAUDE_AUTOCOMPACT_PCT_OVERRIDE so CC auto-compacts BEFORE the ~83% delirium line.
    '<div class="card"><div class="lbl">🛡️ Context guardrail — auto-compact antecipado</div>'+
      '<div class="sub" style="margin-top:6px">Estado actual: <b>'+(GUARDIAN_AUTOCOMPACT_PCT!=null?('auto-compact aos '+GUARDIAN_AUTOCOMPACT_PCT+'%'):'default do Claude Code (~83%)')+'</b></div>'+
      '<div style="display:flex;gap:6px;margin-top:8px">'+[70,75,80].map(p=>'<button class="sm'+(GUARDIAN_AUTOCOMPACT_PCT===p?'" style="border-color:var(--g);color:var(--g)':'')+'" data-a="setAutoCompact" data-x="'+p+'">'+p+'%</button>').join('')+'</div>'+
      '<div class="sub" style="margin-top:7px">Baixa o limiar do auto-compact do Claude Code para a sessão compactar <b>antes</b> da zona de delírio. Só baixa (nunca sobe). Aplica-se a <b>sessões NOVAS</b> — reabre o VS Code.</div></div>';
    // ── /GUARDIAN:F0 ──
  const bi=$('#budIn');const bs=$('#budSet');if(bs)bs.onclick=()=>send('budget',bi.value);
  wireButtons($('#v-setup'));

  // ── INSTALL: recomendados p/ hardware + packs (req 4)
  const have=new Set((s.ollama||[]).map(x=>x.name.split(':')[0]+':'+(x.name.split(':')[1]||'')));
  const avail=(hw.t0_models_available||[]).slice(0,8);
  const reco=hw.recommended_t0;
  $('#v-install').innerHTML='<div class="card"><div class="lbl">Local models — matched to your '+esc(hw.name||'hardware')+'</div>'+
    (avail.length?avail.map(x=>{const inst=(s.ollama||[]).some(o=>o.name.startsWith(x.model.split(':')[0]));
      return '<div class="dr"><span>'+(x.can_run?'✅':'⛔')+'</span><div class="w">'+esc(x.model)+(x.model===reco?' <span class="pill ok">recommended</span>':'')+'<small>'+(x.can_run?'fits your VRAM':'too big for this GPU')+'</small></div>'+(inst?'<span class="pill ok">installed</span>':(x.can_run?'<button class="sm" data-a="pull:'+esc(x.model)+'">pull</button>':''))+'</div>';}).join(''):
      '<div class="sub">no hardware probe yet — run Detect in Setup</div>')+'</div>'+
    '<div class="card"><div class="lbl">Moo Packs</div><div class="sub" style="margin:6px 0">'+(s.packs?Object.keys(s.packs).map(p=>'<span class="pill ok">'+esc(p)+'</span>').join(''):'none installed')+'</div><button class="sm" data-a="term:mooter pack list">Browse packs →</button></div>';
  wireButtons($('#v-install'));

  // ── MODELS: Moo trio + quant/LoRA (req 5,6)
  const q=(s.quant&&s.quant.models&&s.quant.models[0])||null;
  const adapter=(s.prefs&&s.prefs.adapter)||'baseline';
  $('#v-models').innerHTML='<div class="card"><div class="lbl">Who routes your prompts</div>'+
    '<div class="sub" style="margin-top:7px">Mode: <b>'+esc(MOO[s.mode]||s.mode)+'</b> — switch from the header badge or the 🐮 Cockpit tab.</div>'+
    '<div class="sub" style="margin-top:5px">🐄 LazyMoo = local-first · 🐮 Moo = balanced · 🐂 CrazyMoo = strongest rung (<b>Fable 5</b> when T5 @fable opt-in is active, otherwise Opus).</div></div>'+
    '<div class="card"><div class="lbl">Effort — how hard the Moo tries to save</div><div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">'+
    ['low','default','high','ultramoo'].map(l=>'<button class="sm'+((s.effort||'default')===l?'" style="border-color:var(--g);color:var(--g)':'')+'" data-eff="'+l+'">'+(l==='ultramoo'?'🐮 ultramoo':l)+'</button>').join('')+
    '</div><div class="sub" style="margin-top:6px">ultramoo = max thrift (compression + caveman prose)</div></div>'+
    (s.whynot?'<div class="card"><div class="lbl">Why not Fable 5? — per-decision honesty</div><div class="term" style="margin-top:8px;font-size:10.5px;white-space:pre-wrap">'+esc(s.whynot)+'</div></div>':'')+
    '<div class="card"><div class="lbl">🧬 Engine intelligence</div>'+
    '<div class="kv"><span>Quantization</span><span>'+(q?esc(q.name+' · '+q.quant+(q.sizeGb?' · '+q.sizeGb+'GB':'')):'no snapshot — run mooter quant status')+'</span></div>'+
    '<div class="kv"><span>Adapter</span><span>'+esc(adapter==='baseline'?'baseline (none installed)':adapter)+'</span></div>'+
    '<div class="kv"><span>Routing learned</span><span>'+esc((m.prompts||0))+' decisions · TF-IDF</span></div>'+
    '<div class="sub" style="font-size:9px;margin-top:4px">No neural LoRA/DoRA is trained here — adapter training is a manual GPU job. The router learns by TF-IDF + EWMA over real decisions, not by updating model weights.</div>'+
    '<button class="sm" data-a="term:mooter quant status" style="margin-top:6px">Refresh quant</button> <button class="sm" data-a="term:mooter forge install">Forge adapter →</button></div>'+
    '<div class="card"><div class="lbl">Local models (T0 · free)</div><div style="margin-top:6px">'+((s.ollama||[]).map(x=>'<span class="pill">'+esc(x.name)+(x.sizeGb?' · '+x.sizeGb+'GB':'')+'</span>').join('')||'<span class="sub">Ollama offline</span>')+'</div></div>'+
    '<div class="card"><div class="lbl">Subscription</div><div class="sub" style="margin-top:5px">'+(s.sub?'<span class="pill ok">'+esc(s.sub.profile)+'</span>':'not configured')+'</div></div>';
  document.querySelectorAll('#v-models button[data-eff]').forEach(el=>el.onclick=()=>{document.querySelectorAll('#v-models button[data-eff]').forEach(x=>{x.style.borderColor='';x.style.color='';});el.style.borderColor='var(--g)';el.style.color='var(--g)';flashApply(el);send('effort',el.dataset.eff);});
  wireButtons($('#v-models'));

  // ── 🤖 AGENTS tab (POLISH_F3 · D1): the live-session list used to live here AND in the
  // Cockpit (both render s.recent) — pure duplication. The Cockpit herd is the superior
  // component (attention-first, filter, clear, click→open), so it is now the SINGLE home
  // of live sessions. This tab keeps only the block with a distinct role: 🤖 Agents
  // (parallel run / live fan-out). The duplicate "recent sessions" list and the unreadable
  // tokens×LLM×agent matrix (D2) are removed; the $ breakdown moves to Decisions.
  const h=s.herd||{};const mx=h.matrix||{llms:[],rows:[]};
  const fmtk=(n)=>n>=1000?(n/1000).toFixed(1)+'k':String(n);
  // 🤖 Agents — live parallel agents (local Moos + subscription) for THIS herd. Honest:
  // built only from real sources (active-run.json run progress, spawns/*/state.json,
  // last-subagent in-flight, decisions_v2 matrix). Per-agent shows real status (working
  // pulse / done / queued); a numeric % only if the engine emits spawn.progress (future-
  // ready). Run-level % = agents_done/agents_total (real). Empty state is honest: it says
  // parallel fan-out is an engine capability in progress and lights up when data arrives.
  const agentsCard=(function(){
    const run=h.run||null, spawns=Array.isArray(h.spawns)?h.spawns:[], cur=h.current||null;
    const curFresh=cur&&cur.ts&&(Date.now()-cur.ts)<120000;
    const isLoc=(m)=>/qwen|llama|gemma|deepseek|mistral|phi|ollama|:/i.test(String(m||''));
    // local vs subscription: the real signal is the spawn mode (local or cloud); fall back to
    // the model-name heuristic only when mode is absent (e.g. the in-flight last-subagent record).
    const locOf=(a)=>a.mode?(a.mode==='local'):isLoc(a.model);
    const stOf=(x)=>{x=String(x||'').toLowerCase();return /fail|error|crash|127/.test(x)?'fail':(/run|active|progress|working|flight/.test(x)?'run':(/done|complete|finish|success|ok/.test(x)?'done':'queue'));};
    let agents=spawns.map(sp=>({model:sp.model,mode:sp.mode,tier:sp.tier,role:sp.id,task:sp.task,status:stOf(sp.status),progress:(typeof sp.progress==='number'?sp.progress:null)}));
    if(curFresh && !agents.some(a=>a.model===cur.model&&a.role===cur.subagent)) agents.unshift({model:cur.model,mode:null,tier:cur.tier,role:cur.subagent,task:'in flight',status:'run',progress:null});
    const running=agents.filter(a=>a.status==='run');
    const nLoc=running.filter(a=>locOf(a)).length, nCloud=running.length-nLoc;
    const par=running.length?('<span class="apar">🦙 '+nLoc+' local · ✨ '+nCloud+' subscription working</span>'):'<span class="apar">idle</span>';
    let runBar='';
    if(run && (run.agents_total!=null||run.agents_done!=null)){
      const done=Math.max(0,+run.agents_done||0), total=Math.max(done,+run.agents_total||0), pct=total?Math.round(done/total*100):0;
      runBar='<div class="sub" style="margin:5px 0 2px">Run · '+done+'/'+total+' agents done'+(run.tokens?' · '+fmtk(run.tokens)+' tok':'')+'</div><div class="scorebar"><div class="f" style="width:'+pct+'%"></div></div>';
    }
    let rows='';
    if(agents.length){
      rows=agents.map(a=>{
        const dot=a.status==='run'?'<span class="pulse" title="working"></span>':(a.status==='done'?'<span class="adot done" title="done">✓</span>':(a.status==='fail'?'<span class="adot fail" title="failed">✗</span>':'<span class="adot q" title="queued">◌</span>'));
        const prog=(a.progress!=null)?'<span class="aprog" title="'+Math.round(a.progress)+'% complete">'+Math.round(a.progress)+'%</span>':'';
        return '<div class="arow">'+dot+'<span class="amodel">'+(locOf(a)?'🦙':'✨')+' '+esc(a.model?modelLabel(a.model):(a.tier||'agent'))+'</span><span class="arole">'+esc((a.role||'agent').slice(0,16))+'</span><span class="atask">'+esc(a.task||'')+'</span>'+prog+'</div>';
      }).join('');
    }
    let empty='';
    if(!agents.length){
      const seen=(mx.rows||[]).slice(0,6).map(r=>{let llm=null;(r.cells||[]).forEach((c,i)=>{if(c&&!llm)llm=mx.llms[i];});return '<span class="pill">'+(isLoc(llm)?'🦙':'✨')+' '+esc(r.via)+(llm?' · '+esc(llm):'')+'</span>';}).join('');
      empty='<div class="sub" style="margin-top:4px">No parallel run active — Mooter routes one agent per prompt right now.</div>'+(seen?'<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">'+seen+'</div>':'')+'<div class="sub" style="font-size:9px;margin-top:7px;opacity:.7">ⓘ Parallel local + subscription fan-out (with per-agent progress) is an engine capability in progress — this panel lights up live when the engine emits it.</div>';
    }
    return '<div class="card'+cc('agents')+'" data-collap="agents"><div class="lbl collaphead"><span class="chev">▾</span>🤖 Agents — live '+par+'</div>'+runBar+rows+empty+'</div>';
  })();
  $('#v-herd').innerHTML=
    '<div class="sub" style="margin:2px 2px 9px;opacity:.75">Parallel agents Mooter fans out for you — local 🦙 ($0) + subscription ✨. <b>Live sessions live in the 🐮 Cockpit.</b></div>'+
    agentsCard;
  wireButtons($('#v-herd'));
  wireCollapse($('#v-herd'));

  // ── INSIGHTS (telemetria total — req: quant, LoRA, per-prompt)
  const ins=s.insights||{};const qa=ins.quantAll||[];
  const confDelta=(ins.confNow!=null&&ins.confPrev!=null)?(ins.confNow-ins.confPrev):null;
  $('#v-insights').innerHTML=
    (function(){
      // D2 (POLISH_F3) — "Onde foi o teu $": replaces the unreadable tokens×LLM×agent matrix
      // with a decision-useful view — how much of your token volume stayed local (free) vs
      // cloud (paid), the $ saved vs all-Opus, and whether you're trending more local.
      // Built from the same s.herd.matrix the table used + m.saved + the existing localSpark.
      const isLoc=(mm)=>/qwen|llama|gemma|deepseek|mistral|phi|ollama|:/i.test(String(mm||''));
      let locTok=0,cloudTok=0;
      (mx.rows||[]).forEach(r=>(r.cells||[]).forEach((c,i)=>{if(!c)return;const llm=(mx.llms||[])[i];if(isLoc(llm))locTok+=(c.tok||0);else cloudTok+=(c.tok||0);}));
      const totTok=locTok+cloudTok;
      if(totTok<=0)return '<div class="card"><div class="lbl">💸 Onde foi o teu $ <span style="float:right;opacity:.6;font-size:9px">advisory</span></div><div class="sub" style="margin-top:5px;opacity:.7">sem decisões com tokens registados ainda — corre alguns prompts e isto enche-se.</div></div>';
      const pLoc=Math.round(100*locTok/totTok),pCloud=100-pLoc;
      const saved=(typeof m.saved==='number')?m.saved:0;
      const bar='<div style="display:flex;height:9px;border-radius:5px;overflow:hidden;background:var(--vscode-input-background);margin:8px 0 5px">'
        +(locTok>0?'<span style="flex:'+locTok+';background:var(--t0)" title="local 🦙 '+pLoc+'% · $0"></span>':'')
        +(cloudTok>0?'<span style="flex:'+cloudTok+';background:var(--t2)" title="cloud ✨ '+pCloud+'%"></span>':'')
        +'</div>';
      return '<div class="card"><div class="lbl">💸 Onde foi o teu $ · last '+(h.v2count||0)+' decisions <span style="float:right;opacity:.6;font-size:9px">advisory · by tokens</span></div>'
        +bar
        +'<div class="sub" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:2px"><span style="color:var(--t0)">🦙 local '+pLoc+'% · $0</span><span style="color:var(--t2)">✨ cloud '+pCloud+'%</span></div>'
        +'<div class="sub" style="margin-top:5px">🦙 local é grátis · ✨ cloud é onde gastas. Poupaste <b style="color:var(--g)">$'+saved.toFixed(2)+'</b> vs all-Opus.</div>'
        +localSpark(decs)
        +'</div>';
    })()+
    '<div class="card hero"><div class="lbl">Routing intelligence</div><div class="big">'+(ins.cacheRate!=null?ins.cacheRate+'%':'—')+'</div><div class="sub">classifier cache-hit rate · confidence <b>'+(ins.confNow!=null?ins.confNow:'—')+'</b>'+(confDelta!=null?' <span style="color:'+(confDelta>=0?'var(--g)':'var(--t3)')+'">'+(confDelta>=0?'▲':'▼')+Math.abs(confDelta).toFixed(2)+'</span> vs previous window':'')+'</div></div>'+
    '<div class="card"><div class="lbl">📦 Quantization (all local models)</div>'+(qa.length?qa.map(q=>'<div class="kv"><span>'+esc(q.name)+'</span><span>'+esc(q.quant||'?')+(q.sizeGb?' · '+q.sizeGb+'GB':'')+'</span></div>').join(''):'<div class="sub" style="margin-top:5px">no snapshot — <button class="sm" data-a="term:mooter quant status">run quant status</button></div>')+'</div>'+
    '<div class="card"><div class="lbl">🧠 Pastor learning · TF-IDF (not neural LoRA)</div>'+
    '<div class="kv"><span>Adapter</span><span>'+esc(((s.prefs&&s.prefs.adapter)||'baseline')==='baseline'?'baseline (none installed)':(s.prefs.adapter))+'</span></div>'+
    '<div class="kv"><span>Mechanism</span><span>TF-IDF + EWMA over real decisions</span></div>'+
    '<div class="kv"><span>Fable observations</span><span>'+(ins.fableObs!=null?ins.fableObs:'off — opt-in')+'</span></div>'+
    '<div class="kv"><span>Training corpus</span><span>'+(ins.trainingLines!=null?ins.trainingLines+' examples':'— (none yet)')+'</span></div>'+
    '<div class="kv"><span>Hub sync</span><span>'+(ins.lastHubPush?esc(ins.lastHubPush.slice(0,16).replace('T',' ')):'never')+'</span></div>'+
    '<div class="sub" style="font-size:9px;margin-top:4px">Neural LoRA/DoRA training is a manual GPU job — not running here. "Learning" = TF-IDF routing + confidence calibration over your real decisions.</div>'+
    '<button class="sm" data-a="term:mooter fable-observe stats" style="margin-top:6px">fable stats</button> <button class="sm" data-a="term:mooter forge install">forge adapter →</button></div>'+
    '<div class="card"><div class="lbl">Per-prompt evolution (newest first)</div>'+decs.slice(0,8).map(d=>'<div class="kv"><span style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc((d.preview||'').slice(0,42))+'</span><span><span class="chip '+esc(d.tier)+'">'+esc(d.tier)+'</span> conf '+esc(d.conf)+'</span></div>').join('')+'</div>';
  wireButtons($('#v-insights'));

  // ── DECISIONS
  const spans=s.spans||[];
  function spanFor(d){const p=(d.preview||'').slice(0,28);if(!p)return null;const hit=spans.find(x=>x.line.includes(p.slice(0,20)));return hit?hit.id:null;}
  if(decs.length){$('#v-decisions').innerHTML=decs.map((d,i)=>{const sid=spanFor(d);const key=d.ts||('i'+i);
    return '<div class="dec'+(openDecs.has(key)?' open':'')+'" data-key="'+esc(key)+'" role="button" tabindex="0" aria-label="toggle decision detail"><div class="dtop"><span class="chip '+esc(d.tier)+'">'+esc(d.tier)+'</span><span class="prev">'+esc(d.preview)+'</span><span class="meta">'+esc((d.ts||'').slice(11,16))+'</span></div>'+
    '<div class="ddet">model <b>'+esc(d.model)+'</b> · '+esc(d.cat)+' · conf <b>'+esc(d.conf)+'</b>'+(d.rule&&d.rule!=='none'?' · rule <b>'+esc(d.rule)+'</b>':'')+
    (sid?'<span class="stars" data-sid="'+esc(sid)+'">'+[1,2,3,4,5].map(n=>'<span data-n="'+n+'">★</span>').join('')+'</span>':'')+'</div></div>';}).join('');
    document.querySelectorAll('.dec').forEach(el=>{const tog=()=>{const open=el.classList.toggle('open');const k=el.dataset.key;if(open)openDecs.add(k);else openDecs.delete(k);};el.onclick=(ev)=>{if(ev.target.closest('.stars'))return;tog();};el.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!e.target.closest('.stars')){e.preventDefault();tog();}});});
    document.querySelectorAll('.stars span').forEach(st=>st.onclick=()=>{const w=st.parentElement;const n=+st.dataset.n;
      w.querySelectorAll('span').forEach(x=>x.classList.toggle('on',+x.dataset.n<=n));send('rate',{id:w.dataset.sid,n});});}

  // ── TERMINAL (req 2)
  $('#v-terminal').innerHTML='<div class="card"><div class="lbl">Live statusline (same renderer as your terminal)</div><div class="term" style="margin-top:8px">'+(s.statuslineHtml||'<span style="opacity:.6">renderer warming up…</span>')+'</div></div>'+
    '<div class="card"><div class="lbl">mooter commands → integrated terminal</div><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">'+
    ['mooter doctor','mooter savings','mooter sessions list','mooter why-not-fable','mooter quant status','mooter sync'].map(c=>'<button data-a="term:'+esc(c)+'">'+esc(c.replace('mooter ',''))+'</button>').join('')+
    '</div><div class="hint">identical on macOS and Windows — the CLI is the contract</div></div>';
  wireButtons($('#v-terminal'));

  // ── DOCTOR + 10 slash (req 10)
  const ok=(b)=>b?'✅':(b===null?'🟡':'❌');const sl=s.slash||{};
  $('#v-doctor').innerHTML='<div class="card">'+(function(){var ck=score.checks||[];var pass=ck.filter(function(c){return c.ok===true;}).length;var bad=ck.some(function(c){return c.ok===false;});var warn=ck.some(function(c){return c.ok===null;});var col=bad?'var(--danger)':(warn?'var(--acc-warm)':'var(--g)');var lbl=bad?'needs attention':(warn?'check warnings':'all checks passing');return '<div class="drsum" role="status" aria-live="polite" style="display:flex;align-items:center;gap:8px;font-weight:700;margin:2px 0 9px;color:'+col+'"><span style="font-size:14px">'+(bad?'❌':(warn?'🟡':'✅'))+'</span><span>'+pass+'/'+ck.length+' — '+lbl+'</span></div>';})()+
    (score.checks||[]).map(c=>'<div class="dr"><span>'+ok(c.ok)+'</span><div class="w">'+esc(c.t)+(c.detail?'<small>'+esc(c.detail)+'</small>':'')+'</div>'+(c.ok||!c.fix?'':'<button class="sm" data-a="'+esc(c.fix)+'">fix</button>')+'</div>').join('')+'</div>'+
    '<div class="card"><div class="lbl">Slash commands · '+(sl.installed?'installed ✓':'NOT installed')+'</div>'+
    '<div class="sub" style="margin:7px 0 3px">Modes</div><div>'+['zen','auto','beast'].map(mo=>'<span class="pill ok">'+MOO[mo]+'</span>').join('')+'</div>'+
    '<div class="sub" style="margin:8px 0 3px">/mooter sub-commands</div><div>'+(s.slashCmds||[]).map(c=>'<span class="pill'+(sl.installed?' ok':'')+'">/'+esc(c)+'</span>').join('')+'</div>'+
    '<div class="sub" style="margin:8px 0 3px">Claude pins</div><div>'+Object.keys(PIN_CLOUD).map(k=>'<span class="pill">/'+esc(PIN_CLOUD[k])+'</span>').join('')+'</div>'+
    '<div class="sub" style="margin:8px 0 3px">Local pins (Ollama)</div><div>'+Object.keys(PIN_LOCAL).map(n=>{const have=(s.ollama||[]).some(o=>o.name===n);return '<span class="pill'+(have?' ok':' warn')+'" title="'+(have?'model installed':'run: ollama pull '+esc(n))+'">/'+esc(PIN_LOCAL[n])+(have?'':' ⚠')+'</span>';}).join('')+'</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px"><button class="sm" data-a="slashInstall">'+(sl.installed?'Update /mooter skill':'Install /mooter skill')+'</button><button class="sm" data-a="term:mooter init">🔑 Connect account &amp; keys</button></div>'+
    '<div class="sub" style="margin-top:6px;font-size:10px">⚠ = pin whose Ollama model is not pulled yet</div></div>'+
    (s.security?'<div class="card"><div class="lbl">🛡️ Sandbox security (4-layer)</div><div class="term" style="margin-top:8px;font-size:10.5px;white-space:pre-wrap">'+esc(s.security)+'</div></div>':'')+
    '<div style="display:flex;gap:6px"><button data-a="term:mooter doctor" style="flex:1">Full doctor →</button><button data-a="refresh" style="flex:1">Refresh</button></div>';
  wireButtons($('#v-doctor'));

  // ── MISSION CONTROL TAB · Frente G — render the Mission Control tab PURELY from s.mc.
  // Honest: no snapshot.mc yet → "sem snapshot". Never throws (guarded); wires Moo + pilot bus.
  try{
    const vmc=$('#v-mc');
    if(vmc){ vmc.innerHTML=s.mc?renderMissionControl(s.mc):'<div class="empty">Mission Control — sem snapshot ainda (espera o próximo refresh)…</div>'; wireMc(vmc); }
  }catch(_mc){ try{const vmc2=$('#v-mc');if(vmc2)vmc2.innerHTML='<div class="mc-nd">Mission Control — erro de render</div>';}catch(__mc){} }
  // ── DELIVERY COCKPIT TAB · Frente B — render the Project command tab PURELY from s.pc.
  // Honest: no snapshot.pc yet → "sem snapshot". Never throws (guarded); wires chevron + rows.
  try{ renderPcView(s); }catch(_pc){ try{const vpc2=$('#v-pc');if(vpc2)vpc2.innerHTML='<div class="pc-nd">Project command — erro de render</div>';}catch(__pc){} }
  // B2 — restore the scroll captured before this snapshot rebuilt the views (no jump/flicker).
  try{if(_preScroll)window.scrollTo(0,_preScroll);}catch(_s){}
});
send('refresh');
</script></body></html>`;
}
