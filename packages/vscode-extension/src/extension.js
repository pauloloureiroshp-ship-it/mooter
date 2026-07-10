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
// Product name: MEO — Moo Executive Officer (formerly "Director's Cut"). Code identifiers
// below intentionally keep the original name — renaming them is churn with no user value.
// (serialised into its OWN webview panel via fn.toString(), same trick as row-renderer.js)
// + the file-bus producer's eventsPath() helper (MP0 foundation). Both fail-soft: absent →
// the command still registers but the panel shows nothing to render (no crash).
let LPV = null;
try { LPV = require('./live-preview-view.js'); } catch { LPV = null; }
let HC = null;
try { HC = require('./hook-collector.js'); } catch { HC = null; }
// ── DIRECTOR'S CUT v2 · F1 (additive, read-only, DATA ONLY — no UI yet) — the host-side
// aggregator crossing decisions.log × execution.log × pricing.js (~est) × _handoff/fleet
// into the nullable byDay/byModel/fleet snapshot fields the v2 lenses will render in a
// later wave. Fail-soft: absent → the three fields stay null and nothing else changes.
let LPA = null;
try { LPA = require('./lp-aggregates.js'); } catch { LPA = null; }
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
// ── LIVE EDIT · LP-4 — the anchored-prompt runners. §1 local $0 moo (Ollama via native fetch)
// and §2 subscription escalation (headless Agent SDK bridge — no API key in the extension).
// BOTH replies are forced through the same fence (spliceNodeRange + sha256 hash-guard) in
// _promptEdit/_promptApply below. Fail-soft: absent → lp-prompt reports 'engine-unavailable'.
let LEM = null;
try { LEM = require('./live-edit-model.js'); } catch { LEM = null; }
let LEC = null;
try { LEC = require('./live-edit-cloud.js'); } catch { LEC = null; }
// ── LIVE EDIT · LP-4.7 — the Moo Quality Engine (best-of-N + retry against the fence, evidence
// for the escalation OFFER — never an automatic climb) and the asset fence (vendored lucide
// whitelist + official brand SVGs + import-verifier). Fail-soft: LEQ absent → the local path
// falls back to the single-call LP-4 behaviour; LEAS absent → declared imports are REFUSED
// (fail-closed: an unverifiable import never reaches the file).
let LEQ = null;
try { LEQ = require('./live-edit-quality.js'); } catch { LEQ = null; }
let LEAS = null;
try { LEAS = require('./live-edit-assets.js'); } catch { LEAS = null; }
// §4 — $0 undo by inverse byte-splice (pure; the per-panel stack + fs live below). Fail-soft:
// absent → 'desfazer' reports engine-unavailable honestly; the edit paths still work.
let LEU = null;
try { LEU = require('./live-edit-undo.js'); } catch { LEU = null; }
// ── LIVE EDIT · LP-4.5 — the ANCHORED TASK bridge (the one-box default): a headless Agent SDK
// session with cwd = the workspace, hard-gated on Workspace Trust, allowlist-fenced runner-side
// (Read/Grep/Glob/LS/Edit/MultiEdit inside the workspace; Bash/network NEVER). Fail-soft: absent
// → lp-task reports 'engine-unavailable' and the AUTO chip disables honestly.
let LET = null;
try { LET = require('./live-edit-task.js'); } catch { LET = null; }
// LP-4.5 — pure one-box view helpers (suggestLocalChip heuristic), serialised into the webview.
let LTV = null;
try { LTV = require('./lp-task-view.js'); } catch { LTV = null; }
// LP-4.8 §2 — deterministic style presets (colour/size/spacing). Pure string logic, serialised
// into the webview and applied through the existing class-edit fence — $0, no LLM.
let LPP = null;
try { LPP = require('./lp-presets.js'); } catch { LPP = null; }
// LP-4.8 §3 — element-scoped /skills. Vendored defaults (assets/skills/*.md), workspace override
// under .mooter/skills/. Skills seed the one-box + pin the tier; execution rides the existing fence.
let LSK = null;
try { LSK = require('./lp-skills.js'); } catch { LSK = null; }
// LP-5 §0 — Review Security: 4 PURE scanner modules (secret-scan, npm-audit summarizer,
// xss-scan, csp-check) + the view renderer, serialised into the webview via fn.toString() (same
// trick as lp-presets.js). None of the 4 scanners does fs/net/vscode — _securityScan() below
// reads workspace files + runs `npm audit --json` and hands the data in. Fail-soft: an absent
// module degrades that slice of the review honestly (never a crash, never a fabricated "clean").
let LPSS = null, LPAS = null, LPXS = null, LPCC = null, LPSECV = null;
try { LPSS = require('./lp-secret-scan.js'); } catch { LPSS = null; }
try { LPAS = require('./lp-audit-summary.js'); } catch { LPAS = null; }
try { LPXS = require('./lp-xss-scan.js'); } catch { LPXS = null; }
try { LPCC = require('./lp-csp-check.js'); } catch { LPCC = null; }
try { LPSECV = require('./lp-security-view.js'); } catch { LPSECV = null; }
// LP-6 §0 — 🚀 Publish: PURE popover renderer (commit/push preview + Vercel deploy gate), same
// fn.toString() serialisation trick. This module renders only; the host below is the sole gate.
let LPPV = null;
try { LPPV = require('./lp-publish-view.js'); } catch { LPPV = null; }
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
    this._view = view; // F1 · so "Mooter: Show advanced views" can postMessage to the live cockpit.
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
    view.onDidDispose(() => { sub.dispose(); vis.dispose(); if (this._view === view) this._view = null; });
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
    // ── Director's Cut v2 · F1 (additive): byDay/byModel/fleet aggregates. Read-only over
    // the same sources the panel already trusts (bus events + decisions.log) plus the exec
    // log / pricing.js (~est) / fleet JSONs read inside lp-aggregates (all tail-reads /
    // tiny files — cheap at the 7s poll cadence). Nullable by contract: any failure (or
    // LPA absent) leaves the three fields null and every existing consumer untouched.
    let agg = null;
    try { if (LPA) agg = LPA.collectAggregates({ wsRoot, events, decisions }); } catch { agg = null; }
    const a = agg || {};
    let journal = null;
    try { if (LPA && sid) journal = LPA.readJournal(sid); } catch { journal = null; }
    return {
      events: scoped, sid, sidKnown: !!sid, brain,
      byDay: a.byDay || null, byModel: a.byModel || null, fleet: a.fleet || null,
      journal: journal,
    };
  } catch {
    return { events: [], sid: null, sidKnown: false, brain: null, byDay: null, byModel: null, fleet: null, journal: null };
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
  constructor(panel, context) {
    this.panel = panel;
    // F0.2 — workspaceState memento for the per-node history feed (display-only; never undo bytes).
    // null in a bare unit harness (no ctor) → the feed stays in-memory, contract unchanged.
    this._store = (context && context.workspaceState && typeof context.workspaceState.get === 'function') ? context.workspaceState : null;
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
    this.token = 'lp' + crypto.randomBytes(24).toString('hex'); // P1-3: CSPRNG, not guessable Math.random — this is the host→webview auth secret (m.__t === HOST_TOKEN)
    // LP-6 §B — the LAST 🛡 Review Security verdict (set at the end of _securityScan below). Read
    // by _publishStatus to decide hasOpenCritical — never re-scans on its own, never fabricated.
    this._lastSecurity = null;
    // LP-6 §D — the last REAL deploy URL this session produced (set only on a successful
    // _publishDeploy). null until a real deploy happens; never inferred.
    this._lastDeployUrl = null;
    // FIX-MP-1 (audit P0-1) — served-tree identity. The realpath'd root the dev server ACTUALLY
    // serves, learned from the dev-only tap via lp-tree (NEXT_PUBLIC_LP_ROOT). null = UNPROVEN →
    // every $0 write/preview fail-closes (see _treeConfirmed / _treeGateBlocked). Set to null here so
    // the gate is active from birth: only a positively-confirmed lineage with _wsRoot() unlocks a
    // write. (A bare unit-harness instance built via Object.create skips this ctor → _servedRoot is
    // undefined → NOT gated, so the pre-existing edit/delete host contracts run unchanged.)
    this._servedRoot = null;
    // F3 (W1) — the host-side record of the pinned selection, fed by the origin-locked lp-pin relay
    // (a sibling of lp-tree, posted on every lp-select). Read by (1) the fail-closed gate below, so
    // NO prompt path talks to the LLM before ANY element is pinned this session, and (2) _taskRun,
    // which forwards its rendered .selText into the agent's anchor block so a dynamic-<p> ask sees the
    // text the user sees. HONEST SCOPE: the chip and the generate paths still carry the anchor on
    // their own messages (the store is not yet their sole reader) — full unification is a later step.
    // null from birth → _selectionMissing() default-denies until a pin arrives; a bare Object.create
    // harness leaves it undefined → NOT gated (pre-existing host contracts run unchanged).
    this._selection = null;
    this._wire();
  }
  static createOrReveal(context) {
    if (LivePreviewPanel.current) {
      LivePreviewPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return LivePreviewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'mooterLivePreview', 'Mooter — Live Preview 🎬', vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true });
    LivePreviewPanel.current = new LivePreviewPanel(panel, context); // F0.2 — pass context for the persisted feed
    return LivePreviewPanel.current;
  }
  _wsRoot() {
    return (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0] && vscode.workspace.workspaceFolders[0].uri.fsPath) || process.cwd();
  }
  // FIX-MP-1 (audit P0-1) — record the root the dev server actually SERVES, relayed by the dev-only
  // tap (NEXT_PUBLIC_LP_ROOT). Fail-soft: a non-empty string is realpath-normalised when it exists on
  // this disk (worktree-aware — resolves symlinks so two worktrees never alias), else path-normalised;
  // anything else clears identity to null (unproven → the gate fail-closes). Never throws. Reposts so
  // G1 can surface (or clear) the honest mismatch banner immediately.
  _setServedRoot(raw) {
    let next = null;
    try {
      if (typeof raw === 'string' && raw.trim()) {
        const p = raw.trim();
        try { next = fs.realpathSync(p); } catch { next = path.normalize(p); }
      }
    } catch { next = null; }
    this._servedRoot = next;
    this._post();
  }
  // The served tree is CONFIRMED only when its root shares LINEAGE with the VS Code workspace:
  // identical, or one is a descendant of the other (the landing/ subdir of the real workspace IS a
  // descendant → confirmed). Twin worktrees are SIBLINGS — neither contains the other → NOT confirmed,
  // so the $0 write fail-closes (the 06:49 incident). Compares ABSOLUTE realpath'd roots only — never
  // relative paths (worktrees of the same repo have gemellar relative layouts).
  // FIX cross-device (2026-07-08). The gate proved lineage with path.relative, which is CASE-INSENSITIVE
  // on win32 and CASE-SENSITIVE on posix → a case-only difference between the workspace path and the served
  // root silently passed on Windows but FAIL-CLOSED on macOS ("só funcionou no Windows"). The correct answer
  // is NOT to guess case-sensitivity from process.platform — a case-SENSITIVE volume mounted on macOS/Windows
  // (case-sensitive APFS, NTFS per-dir/WSL) would then fold two genuinely-distinct sibling trees together and
  // reopen the 06:49 P0. So the gate uses FILESYSTEM IDENTITY (dev+ino) as the authority, and only falls back
  // to an EMPIRICALLY-probed case-fold (fail-safe → case-SENSITIVE) when a root cannot be stat'd.

  // stat identity "dev:ino" of a path, or null if it cannot be stat'd. This is the OS's own notion of "same
  // directory" — correct on case-sensitive AND case-insensitive volumes, and immune to Unicode fold quirks.
  // ino === 0 means the filesystem does not expose a reliable inode (some FAT/network volumes on Windows).
  // Treat it as unstat-able (null) so the caller falls back to the string path instead of false-confirming
  // every tree as identical ('0:0' === '0:0').
  static _statId(p) { try { const s = fs.statSync(p); if (!s || Number(s.ino) === 0) return null; return String(s.dev) + ':' + String(s.ino); } catch { return null; } }

  // Lineage by filesystem identity: identical inode, OR one is an ANCESTOR of the other (walk up, compare
  // inodes). Returns true/false when both roots are stat-able; null when either cannot be stat'd (→ caller
  // falls back to string compare). SIBLINGS have distinct inodes and never appear in each other's ancestry
  // → false (kills the P0), regardless of case-sensitivity or Unicode.
  static _sharesLineageByInode(a, b) {
    const idA = LivePreviewPanel._statId(a), idB = LivePreviewPanel._statId(b);
    if (idA === null || idB === null) return null;
    if (idA === idB) return true;
    const climbsTo = (start, targetId) => {
      let cur = path.resolve(start);
      for (let i = 0; i < 64; i++) {
        const parent = path.dirname(cur);
        if (parent === cur) break; // reached the volume root
        cur = parent;
        if (LivePreviewPanel._statId(cur) === targetId) return true;
      }
      return false;
    };
    return climbsTo(a, idB) || climbsTo(b, idA);
  }

  // EMPIRICAL case-sensitivity probe — never guesses from process.platform. A case-flipped form of an
  // existing path resolves to the SAME inode ⇒ the filesystem at `anchor` is case-INSENSITIVE. Fail-safe:
  // any doubt (no cased letters, unreadable, flipped form absent/other inode) → false = treat as
  // case-SENSITIVE → the gate stays STRICTER and never over-confirms a sibling.
  static _caseInsensitiveFS(anchor) {
    try {
      if (typeof anchor !== 'string' || !anchor) return false;
      const lower = anchor.toLowerCase(), upper = anchor.toUpperCase();
      const flipped = anchor === lower ? upper : lower;
      if (flipped === anchor) return false; // no cased letters to flip → cannot prove → assume sensitive
      const id = LivePreviewPanel._statId(anchor);
      return id !== null && LivePreviewPanel._statId(flipped) === id;
    } catch { return false; }
  }

  // PURE string fallback (used only when a root is not stat-able). `ci` = is this filesystem case-insensitive
  // (from the empirical probe). Folds case iff ci; the '..'/isAbsolute checks stay case-independent so a
  // sibling or a traversal still fails closed. `P` is the path flavour (defaults to host `path`; injected in tests).
  static _canonCase(s, ci) { return ci ? String(s).toLowerCase() : String(s); }
  static _within(parent, child, ci, P) {
    P = P || path;
    const r = P.relative(LivePreviewPanel._canonCase(parent, ci), LivePreviewPanel._canonCase(child, ci));
    return !!r && !r.startsWith('..') && !P.isAbsolute(r);
  }
  static _sharesLineage(a, b, ci, P) {
    if (!a || !b) return false;
    if (LivePreviewPanel._canonCase(a, ci) === LivePreviewPanel._canonCase(b, ci)) return true;
    return LivePreviewPanel._within(a, b, ci, P) || LivePreviewPanel._within(b, a, ci, P);
  }
  _treeConfirmed() {
    const wsReal = (() => { try { return fs.realpathSync(this._wsRoot()); } catch { return this._wsRoot(); } })();
    const sr = this._servedRoot;
    if (!sr || !wsReal) return false;
    // Authority: filesystem identity — correct on every volume, no platform/Unicode guessing.
    const byInode = LivePreviewPanel._sharesLineageByInode(sr, wsReal);
    if (byInode !== null) return byInode;
    // Fallback only when a root is not stat-able (e.g. a normalize()'d non-existent served marker):
    // empirically-probed case-fold, fail-safe to case-SENSITIVE.
    const ci = LivePreviewPanel._caseInsensitiveFS(wsReal);
    return LivePreviewPanel._sharesLineage(sr, wsReal, ci, path);
  }
  // FIX-MP-1 G2 — the write-time FAIL-CLOSED tree gate. In production the ctor sets _servedRoot=null,
  // so this is ALWAYS active: no positively-confirmed served-tree lineage → BLOCKED (refuse before any
  // preview diff or write). A bare unit-harness instance that never opted into the protocol
  // (_servedRoot === undefined, built via Object.create) is NOT gated — it exercises the pre-existing
  // edit/delete/open contracts unchanged. Production never reaches undefined (ctor + every lp-tree set it).
  _treeGateBlocked() {
    return this._servedRoot !== undefined && !this._treeConfirmed();
  }
  // F3 (W1) — record the pinned selection relayed from the webview (lp-pin). Bounded + sanitised;
  // a missing/empty file clears it. Never throws. This is the ONLY writer of this._selection.
  // Read today: .file (by the fail-closed gate _selectionMissing) and .selText (by _taskRun → the
  // agent's anchor block, so a dynamic-<p> ask sees the rendered text). .line/.col/.tag are recorded
  // as the pin's identity but not yet read here — the paths still take the anchor from the message.
  _setSelection(m) {
    try {
      const file = (m && typeof m.file === 'string') ? m.file.trim() : '';
      if (!file) { this._selection = null; return; }
      this._selection = {
        file: file.slice(0, 1024),
        line: Number.isInteger(m && m.line) ? m.line : null,
        col: Number.isInteger(m && m.col) ? m.col : null,
        tag: (m && typeof m.tag === 'string') ? m.tag.slice(0, 60) : '',
        selText: (m && typeof m.selText === 'string') ? m.selText.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
      };
    } catch { this._selection = null; }
  }
  // F3 (W1) — the fail-closed selection gate, shaped EXACTLY like _treeGateBlocked: default-DENY in
  // production (the ctor sets _selection=null → BLOCKED until a pin arrives, so no prompt path talks
  // to the LLM without a pinned selection — the agent asks instead of guessing). A bare Object.create
  // unit harness never runs the ctor (_selection === undefined) → NOT gated, so the pre-existing
  // lp-edit/lp-task/lp-prompt host contracts (which pass the anchor on the message) run unchanged.
  _selectionMissing() {
    return this._selection !== undefined && !(this._selection && this._selection.file);
  }
  // FIX-MP-1 G1 — the honest banner text when the preview is live but comes from an UNCONFIRMED tree.
  // null when identity is unproven-because-absent (servedRoot null → the write gate already refuses
  // with its own message) or when confirmed; a factual note naming the served root's basename only when
  // a served root IS known but its lineage does not match this workspace. Fail-soft, never throws.
  _treeBanner() {
    try {
      if (typeof this._servedRoot === 'string' && this._servedRoot && !this._treeConfirmed()) {
        // Show the last TWO segments (…/parent/base) so a genuine cross-tree mismatch is legible — a
        // bare basename reads as absurd when two trees share it (…/frugal/landing vs …/lp49/landing).
        // (A case-only difference now CONFIRMS via _sharesLineage, so this banner fires only for real mismatches.)
        const parts = this._servedRoot.split(/[\\/]+/).filter(Boolean);
        const label = parts.length >= 2 ? ('…/' + parts.slice(-2).join('/')) : (parts[0] || this._servedRoot);
        return 'o preview vem de outra árvore (' + label + ') — reinicia o dev server neste workspace para poder editar';
      }
    } catch { /* fail-soft */ }
    return null;
  }
  _post() {
    try {
      const s = livePreviewSnapshot();
      s.stage = this.stage;              // MP2: App Stage state alongside the bus/Brain snapshot
      // urlError (transient user paste) wins; otherwise FIX-MP-1 G1 surfaces an honest tree-mismatch
      // banner (the preview is live but comes from a DIFFERENT tree than the one we would write to).
      s.stageError = this.urlError || this._treeBanner() || null; // both ride the ONE stageError channel
      s.routes = this.routes || this._discoverRoutes(); // MP3.3: routes for the "known routes" picker
      s.leBridge = this._leBridgeStatus(); // LP-4 §6: SDK-bridge fact → chip enables/disables cloud honestly
      s.readiness = this._readiness();      // F0.5.3: the 4-light readiness semaphore (honest facts)
      s.feed = this._feedView(); // LP-4.5 §4: the unified session feed rides the snapshot (rev-guarded render)
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
    if (m.type === 'lp-tree') { this._setServedRoot(m.servedRoot); return; } // FIX-MP-1 G1: served-tree identity from the dev tap
    if (m.type === 'lp-open-folder') { try { vscode.commands.executeCommand('workbench.action.openRecent'); } catch { /* best-effort */ } return; } // F0.5.1 — empty window → open the project folder (recents) in THIS window, never a dead state
    if (m.type === 'lp-trust') { try { vscode.commands.executeCommand('workbench.trust.manage'); } catch { /* best-effort */ } return; } // F0.5.3 — trust light fix (Manage Workspace Trust)
    if (m.type === 'lp-restart-dev') { this._restartDevServer(); return; } // F0.5.3 — sticky-port / stale-tree recovery (gated)
    if (m.type === 'lp-pin') { this._setSelection(m); return; } // F3 (W1): the single host-side SelectionStore ingress (origin-locked relay, mirrors the webview pin)
    if (m.type === 'lp-open-file') { this._openErrorFile(m); return; }
    if (m.type === 'lp-open-source') { this._openSourceFile(m); return; } // MP5.1 click-to-code
    if (m.type === 'lp-edit') { this._applyEdit(m); return; } // MP5.1 deterministic $0 edit
    if (m.type === 'lp-delete') { this._deleteNode(m); return; } // MP5.2a deterministic $0 delete (preview → diff, apply → write)
    if (m.type === 'lp-prompt') { this._promptEdit(m); return; } // LP-4 §3 anchored prompt → model → fenced preview
    if (m.type === 'lp-prompt-apply') { this._promptApply(m); return; } // LP-4 §3 approved replacement → hash-guarded write
    if (m.type === 'lp-task') { this._taskRun(m); return; } // LP-4.5 anchored PROJECT task → trusted agent (one-box default)
    if (m.type === 'lp-task-cancel') { try { if (this._activeTaskAbort) this._activeTaskAbort.abort(); } catch { /* best-effort */ } return; } // LP-4.9 §8 cancel the running agent task
    if (m.type === 'lp-task-revert') { this._taskRevert(m); return; } // LP-4.5 sha-guarded revert (per file or all — OUR record only)
    if (m.type === 'lp-task-keep') { this._taskKeep(m); return; } // LP-4.5 accept agent edits (drops snapshots)
    if (m.type === 'lp-undo') { this._undoLast(); return; } // LP-4 §4 $0 undo (inverse byte-splice, sha-guarded)
    if (m.type === 'lp-feed-revert') { this._feedRevert(m); return; } // LP-4.5 §4 per-item revert from the unified feed
    if (m.type === 'lp-copy-error') { this._copyErrorToClipboard(m); return; }
    if (m.type === 'lp-security-scan') { this._securityScan(); return; } // LP-5 §B global 🛡 review — secrets/xss/csp/npm-audit, local $0
    // LP-6 §B/C/D — 🚀 Publish: status (read-only) → selective commit+push → hard-gated deploy.
    if (m.type === 'lp-publish-status') { this._publishStatus(); return; }
    if (m.type === 'lp-publish-commit') { this._publishCommit(m); return; }
    if (m.type === 'lp-publish-deploy') { this._publishDeploy(m); return; }
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
      const contained = (root, abs) => LivePreviewPanel._within(root, abs, LivePreviewPanel._caseInsensitiveFS(root), path); // FIX cross-device: case-robust via EMPIRICAL case-sensitivity probe (fail-safe → sensitive) — same '..'/absolute fail-closed guard
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
      // FIX-MP-1 G2 — FAIL-CLOSED: without a proven served-tree lineage, don't open a file that may
      // belong to the WRONG tree (the click-to-code twin of the write incident).
      if (this._treeGateBlocked()) { vscode.window.showWarningMessage('Live Preview: o preview não vem desta árvore (ou o marcador dev não está presente) — reinicia o dev server neste workspace.'); return; }
      const raw = (m && typeof m.file === 'string') ? m.file.trim() : '';
      if (!raw) return;
      const line = (m && Number.isInteger(m.line) && m.line > 0) ? m.line : null;
      const col = (m && Number.isInteger(m.col) && m.col > 0) ? m.col : null;
      const contained = (root, abs) => LivePreviewPanel._within(root, abs, LivePreviewPanel._caseInsensitiveFS(root), path); // FIX cross-device: case-robust via EMPIRICAL case-sensitivity probe (fail-safe → sensitive) — same '..'/absolute fail-closed guard
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
    // FIX-MP-1 G2 — FAIL-CLOSED tree gate, EARLIEST possible: without a proven served-tree lineage we
    // neither generate a preview diff nor write. Guards both phases (preview + apply).
    if (this._treeGateBlocked()) { fail('preview-tree-mismatch'); return; }
    try {
      const raw = (m && typeof m.file === 'string') ? m.file.trim() : '';
      const edit = (m && m.edit && typeof m.edit === 'object') ? m.edit : null;
      if (!raw || !edit) { fail('bad-request'); return; }
      if (!LEA) { fail('engine-unavailable'); return; }
      const contained = (root, abs) => LivePreviewPanel._within(root, abs, LivePreviewPanel._caseInsensitiveFS(root), path); // FIX cross-device: case-robust via EMPIRICAL case-sensitivity probe (fail-safe → sensitive) — same '..'/absolute fail-closed guard
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
        // review P1-B (parity): the TARGET + the exact EDIT ride the diff payload so apply binds to
        // THIS preview — a second 'aplicar' typed before this one returns can no longer make the
        // approved diff write a different value (same-node, but the label would otherwise lie).
        this._postEditDiff({ ok: true, stale, kind: res.kind, start: d.start, removed: d.removed, added: d.added, h, abs: real, file: raw, line: m.line, col: m.col, tag: m.tag, edit });
        return;
      }
      // review P3-c: write FIRST, then record the undo entry — a failed write must not leave a
      // phantom undo entry that lights the button and later refuses as 'undo-stale'.
      fs.writeFileSync(real, res.code, 'utf8');
      this._pushUndo(real, source, res.code, (edit.kind === 'class' ? 'classe · $0' : 'texto · $0'), raw, { line: m.line, col: m.col, tag: m.tag }); // §4 feed item + F0.2 nodeKey
      this._postEditResult(true, 'applied');
      // §5 — the splice preserved the node's start, so the same stamp still identifies it: ask
      // the tap to watch through the HMR swap and re-emit a FRESH lp-select (re-prompt no re-pick).
      this._postRepin({ file: raw, line: m.line, col: m.col, tag: m.tag });
    } catch { fail('error'); }
  }
  _postEditResult(ok, reason, tier) {
    // §4 — every result carries the live revertable depth so the panel state reflects facts.
    // LP-4.9 §3 — the tier rides along so the completion toast tells the TRUTH about cost: a fenced
    // rewrite escalated to Sonnet/Opus is subscription, not $0 (deterministic edits stay $0).
    const undo = this._undoDepth();
    const msg = { type: 'lp-edit-result', __t: this.token, ok: !!ok, reason: String(reason || ''), undo };
    if (tier && tier !== 'local') msg.tier = String(tier);
    try { this.panel.webview.postMessage(msg); } catch { /* best-effort */ }
  }
  // ── LP-4.5 §4 — the UNIFIED session feed. ONE list holds every Live Edit write: splice-kind
  // items (deterministic text/class, delete, fenced rewrite — each carries its LEU inverse-splice
  // entry) and agent-kind items (an anchored task's edits, referenced by taskId in _taskReg).
  // The feed replaces the single "desfazer último" button: every item reverts individually,
  // always sha-guarded fail-closed. Lazy init: unit harnesses skip the constructor.
  _feedPush(item) {
    try {
      this._feedEnsureLoaded();
      if (!this._feed) { this._feed = []; this._feedSeq = 0; this._feedRev = 0; }
      item.ts = Date.now();
      item.id = 'f' + item.ts + '_' + (++this._feedSeq); // F0.2: cross-session-unique (ts differs per session → no collision with persisted history ids)
      this._feed.push(item);
      if (this._feed.length > 50) this._feed.shift();
      this._feedBump();
      return item;
    } catch { return null; }
  }
  _feedBump() {
    this._feedRev = (this._feedRev || 0) + 1;
    this._feedPersist();
    this._post(); // the feed rides the snapshot; bumping reposts it immediately
  }
  // F0.2 — display shape a node uses to show ITS history. nodeKey travels so the webview can filter
  // "histórico deste nó"; `persisted` marks prior-SESSION items (restored from workspaceState) that
  // carry NO revert entry — shown read-only as "histórico" (a stale-byte revert across a reopen is
  // exactly the write we refuse). Live items keep their revert. Never leaks host paths / splice bytes.
  _feedDisplay(e) { return { id: e.id, ts: e.ts, via: e.via || null, files: Array.isArray(e.files) ? e.files : [], status: e.status || 'live', reason: e.reason || null, nodeKey: e.nodeKey || null, persisted: !!e.persisted }; }
  _feedView() {
    this._feedEnsureLoaded();
    const hist = (this._feedHistory || []).map((e) => this._feedDisplay(e));
    const live = (this._feed || []).map((e) => this._feedDisplay(e));
    return { rev: this._feedRev || 0, items: hist.concat(live) };
  }
  // F0.2 persistence — workspaceState, DISPLAY-ONLY (never the undo bytes). Loaded once per panel so a
  // reopen restores the per-node record; guarded so a bare Object.create harness (no _store) stays in-memory.
  _feedEnsureLoaded() {
    if (this._feedLoaded) return;
    this._feedLoaded = true;
    this._feedHistory = [];
    try {
      if (this._store && typeof this._store.get === 'function') {
        const saved = this._store.get('lpFeedHistoryV1', []);
        if (Array.isArray(saved)) {
          this._feedHistory = saved.filter((x) => x && typeof x === 'object' && x.id).slice(-100).map((x) => ({
            id: String(x.id), ts: Number(x.ts) || 0, via: (typeof x.via === 'string') ? x.via : null,
            files: Array.isArray(x.files) ? x.files.filter((f) => typeof f === 'string') : [],
            status: (typeof x.status === 'string') ? x.status : 'live', reason: null,
            nodeKey: (x.nodeKey && typeof x.nodeKey === 'object') ? x.nodeKey : null, persisted: true,
          }));
        }
      }
    } catch { this._feedHistory = []; }
  }
  _feedPersist() {
    try {
      if (!this._store || typeof this._store.update !== 'function') return;
      const toStore = (e) => ({ id: e.id, ts: e.ts, via: e.via || null, files: Array.isArray(e.files) ? e.files : [], status: e.status || 'live', nodeKey: e.nodeKey || null });
      const seen = new Set(); const all = [];
      for (const e of (this._feedHistory || []).concat(this._feed || [])) {
        if (!e || !e.id || seen.has(e.id)) continue; seen.add(e.id); all.push(toStore(e));
      }
      this._store.update('lpFeedHistoryV1', all.slice(-100)); // display-only; NO undo bytes ever leave RAM
    } catch { /* best-effort — persistence never blocks a write */ }
  }
  _undoDepth() {
    let n = 0;
    for (const e of (this._feed || [])) { if (e.kind === 'splice' && e.status === 'live') n++; }
    return n;
  }
  // Newest LIVE agent feed item for a taskId (end-scan: a stale settled item never shadows).
  _feedFindAgent(taskId) {
    const feed = this._feed || [];
    for (let i = feed.length - 1; i >= 0; i--) {
      const e = feed[i];
      if (e.kind === 'agent' && e.taskId === taskId && e.status === 'live') return e;
    }
    return null;
  }
  // §4 — remember the write we just made as a feed item carrying its inverse-splice entry.
  _pushUndo(real, before, after, via, relFile, anchor) {
    try {
      if (!LEU) return;
      const e = LEU.makeEntry(real, before, after);
      if (!e) return;
      const a = anchor || {};
      // F0.2 — the node identity this write belongs to, so the feed can be queried per node (and survive a reopen).
      const nodeKey = { servedRoot: (typeof this._servedRoot === 'string') ? this._servedRoot : null, file: relFile || real, line: Number.isInteger(a.line) ? a.line : null, col: Number.isInteger(a.col) ? a.col : null, tag: (typeof a.tag === 'string') ? a.tag.slice(0, 60) : null };
      this._feedPush({ kind: 'splice', via: via || 'edição', files: [relFile || real], entry: e, status: 'live', reason: null, nodeKey });
    } catch { /* feed is best-effort bookkeeping — never blocks the write */ }
  }
  // Inverse byte-splice of ONE feed item. FAIL-CLOSED: the file's CURRENT sha must still match
  // the sha stamped at write time; if anything else wrote it since (HMR, an agent, the editor),
  // we refuse honestly ('undo-stale') and keep the item live with its visible reason — a blind
  // revert over someone else's bytes is exactly the lie this product exists to avoid.
  _revertSpliceItem(item) {
    if (!LEU) return { ok: false, reason: 'engine-unavailable' };
    // N1 (FIX-MP-1 parity) — an undo/revert is a WRITE. If the served tree is no longer the confirmed
    // one (dev server restarted onto a sibling worktree since the edit), writing even an inverse splice
    // would land on a tree the user is not previewing → the same "preview that lies". Fail-closed, like
    // every forward write path. (A bare Object.create harness has _servedRoot===undefined → not gated.)
    if (this._treeGateBlocked()) return { ok: false, reason: 'preview-tree-mismatch' };
    let cur;
    try { cur = fs.readFileSync(item.entry.file, 'utf8'); }
    catch { return { ok: false, reason: 'undo-stale' }; }
    const r = LEU.applyUndo(item.entry, cur);
    if (!r.ok) return r;
    try { fs.writeFileSync(item.entry.file, r.code, 'utf8'); }
    catch { return { ok: false, reason: 'error' }; }
    return { ok: true };
  }
  // "desfazer último" (kept as host machinery): revert the NEWEST live splice item — identical
  // to clicking that item's revert in the feed.
  async _undoLast() {
    try {
      if (!LEU) { this._postEditResult(false, 'engine-unavailable'); return; }
      const feed = this._feed || [];
      let item = null;
      for (let i = feed.length - 1; i >= 0; i--) { if (feed[i].kind === 'splice' && feed[i].status === 'live') { item = feed[i]; break; } }
      if (!item) { this._postEditResult(false, 'nothing-to-undo'); return; }
      const r = this._revertSpliceItem(item);
      if (!r.ok) { item.reason = r.reason; this._feedBump(); this._postEditResult(false, r.reason); return; }
      item.status = 'reverted'; item.reason = null;
      this._feedBump();
      this._postEditResult(true, 'undone');
    } catch { this._postEditResult(false, 'error'); }
  }
  // Per-item revert from the feed. Splice items invert their own span; agent items delegate to
  // the task registry (sha-guarded per file). Unknown/settled items answer honestly.
  async _feedRevert(m) {
    try {
      const id = (m && typeof m.id === 'string') ? m.id : '';
      const item = (this._feed || []).find((e) => e.id === id) || null;
      if (!item || item.status !== 'live') { this._postEditResult(false, 'nothing-to-undo'); return; }
      if (item.kind === 'splice') {
        const r = this._revertSpliceItem(item);
        if (!r.ok) { item.reason = r.reason; this._feedBump(); this._postEditResult(false, r.reason); return; }
        item.status = 'reverted'; item.reason = null;
        this._feedBump();
        this._postEditResult(true, 'undone');
        return;
      }
      if (item.kind === 'agent') { this._taskRevert({ taskId: item.taskId, all: true }); return; }
      this._postEditResult(false, 'error');
    } catch { this._postEditResult(false, 'error'); }
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
    // FIX-MP-1 G2 — FAIL-CLOSED tree gate, EARLIEST possible (both phases): no proven served tree →
    // never preview or delete. Without it a delete could land in a twin worktree (incident 06:49).
    if (this._treeGateBlocked()) { fail('preview-tree-mismatch'); return; }
    try {
      const raw = (m && typeof m.file === 'string') ? m.file.trim() : '';
      if (!raw) { fail('bad-request'); return; }
      if (!LEA || typeof LEA.deleteNode !== 'function') { fail('engine-unavailable'); return; }
      const contained = (root, abs) => LivePreviewPanel._within(root, abs, LivePreviewPanel._caseInsensitiveFS(root), path); // FIX cross-device: case-robust via EMPIRICAL case-sensitivity probe (fail-safe → sensitive) — same '..'/absolute fail-closed guard
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
        // review P1-B (parity): bind the delete TARGET to this diff too (delete is already safe via
        // the synchronous panel re-render, but this removes the mutable-global write-target pattern).
        this._postDeleteDiff({ ok: true, stale, start: d.start, removed: d.removed, added: d.added, h, inExpr, abs: real, file: raw, line: m.line, col: m.col, tag: m.tag });
        return;
      }
      // review P3-c: write FIRST, then record the undo entry (a failed write leaves no phantom entry).
      fs.writeFileSync(real, res.code, 'utf8');
      this._pushUndo(real, source, res.code, 'apagar · $0', raw, { line: m.line, col: m.col, tag: m.tag }); // §4 feed item + F0.2 nodeKey
      this._postEditResult(true, 'deleted');
    } catch { fail('error'); }
  }
  _postDeleteDiff(payload) {
    try { this.panel.webview.postMessage(Object.assign({ type: 'lp-delete-diff', __t: this.token }, payload)); } catch { /* best-effort */ }
  }
  // Shared workspace-containment resolver (same guard as _openSourceFile/_applyEdit/_deleteNode):
  // path.relative (no sibling-dir trap) + realpath re-check (no symlink escape). null = refuse.
  _resolveContainedFile(raw) {
    try {
      const contained = (root, abs) => LivePreviewPanel._within(root, abs, LivePreviewPanel._caseInsensitiveFS(root), path); // FIX cross-device: case-robust via EMPIRICAL case-sensitivity probe (fail-safe → sensitive) — same '..'/absolute fail-closed guard
      const root = this._wsRoot();
      const abs = path.isAbsolute(raw) ? path.normalize(raw) : path.join(root, raw);
      if (contained(root, abs) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        const r = fs.realpathSync(abs);
        if (contained(fs.realpathSync(root), r)) return r;
      }
    } catch { /* refuse below */ }
    return null;
  }
  // ── LP-5 §B — Review Security: a bounded, read-only walk of the workspace (never outside it —
  // same containment discipline as _resolveContainedFile), feeding the 4 PURE scanners. Only
  // workspace-RELATIVE paths ever reach the webview — no absolute host path leaves this method.
  // Local, $0: the only process spawned is `npm audit --json` (fail-soft — missing npm, a
  // timeout, or any spawn error all degrade to an honest ok:false, never a throw); the only
  // network traffic is npm's OWN registry advisory check inside that command — we send it no
  // code. Wrapped end-to-end in try/catch: any unexpected failure posts {error:'scan-failed'}.
  _securityScan() {
    const post = (payload) => { try { this.panel.webview.postMessage(Object.assign({ type: 'lp-security-result', __t: this.token }, payload)); } catch { /* best-effort */ } };
    try {
      const root = this._wsRoot();
      // D6 — read the exact set of shipped-code files this review audits, then bind the scan to their
      // CONTENT (fingerprint below). The publish gate re-reads the SAME set and refuses if a single byte
      // changed since — closing the untracked / staged / gitignored TOCTOU a git-diff fingerprint missed
      // (P0 adversarial review): a secret pasted into an untracked file AFTER a clean scan is now caught.
      const walked = this._walkScanFiles(root);
      const files = walked.files;
      const nextConfigAbs = walked.nextConfigAbs;
      const fingerprint = this._fingerprintOf(files);

      const secrets = LPSS ? LPSS.scanSecrets(files) : [];
      const xss = LPXS ? LPXS.scanXss(files) : [];
      let csp = { hasCsp: false, findings: [] };
      if (LPCC) {
        let cfgText = '';
        if (nextConfigAbs) { try { cfgText = fs.readFileSync(nextConfigAbs, 'utf8'); } catch { cfgText = ''; } }
        csp = LPCC.checkCsp(cfgText);
      }

      // npm audit — FAIL-SOFT. npm exits non-zero when it FINDS vulnerabilities (not a failure
      // here); missing npm / a timeout / any spawn error all degrade to {ok:false} honestly.
      let audit = { ok: false };
      try {
        const isWin = process.platform === 'win32';
        const cp = require('child_process').spawnSync(
          isWin ? 'npm.cmd' : 'npm',
          ['audit', '--json'],
          { cwd: root, timeout: 30000, windowsHide: true, maxBuffer: 20 * 1024 * 1024, encoding: 'utf8', shell: isWin }
        );
        const out = (cp && typeof cp.stdout === 'string') ? cp.stdout : '';
        audit = (LPAS && out) ? LPAS.summarizeNpmAudit(out) : { ok: false };
      } catch { audit = { ok: false }; }

      // LP-6 §B — stash the verdict for _publishStatus's hasOpenCritical check. Overwritten by
      // EVERY scan (including a failed one, below) so a stale "no critical" can never survive a
      // scan the user just ran and saw fail.
      this._lastSecurity = { secrets, xss, csp, audit, scannedFiles: files.length, fingerprint };
      post({ secrets, xss, csp, audit, scannedFiles: files.length });
    } catch { this._lastSecurity = { error: 'scan-failed' }; post({ error: 'scan-failed' }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LP-6 — 🚀 Publish: status (read-only) → selective commit+push (host-extra, NEVER git add -A)
  // → hard two-factor-gated Vercel deploy. DRAFT — see _handoff brief for full guard rationale.
  // The single invariant that matters most: _publishDeploy is UNREACHABLE unless the typed
  // project name matches EXACTLY what the host itself re-reads from .vercel/project.json, right
  // there in that method — never trusting anything the webview echoes back as truth.
  // ════════════════════════════════════════════════════════════════════════════

  // The shipped-code file set a 🛡 review audits: source/env/public/next.config under the workspace,
  // skipping vendored/build/test/fixture dirs and *.test.* files. Read by BOTH _securityScan (to scan)
  // and _fingerprintOf (to bind the scan to those exact bytes). Never throws; unreadable files are skipped.
  _walkScanFiles(root) {
    const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '__tests__', '__mocks__', 'fixtures', '__fixtures__', 'golden', 'test', 'tests']);
    const SRC_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
    const TEST_RE = /\.(test|spec|stories)\.[cm]?[jt]sx?$/i;
    const ENV_RE = /^\.env(\..*)?$/i;
    const MAX_FILES = 2000;
    const MAX_BYTES = 512 * 1024;
    const files = [];
    let nextConfigAbs = null;
    const walk = (dir, depth) => {
      if (depth > 12 || files.length >= MAX_FILES) return;
      let ents;
      try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const ent of ents) {
        if (files.length >= MAX_FILES) return;
        const name = ent.name;
        const abs = path.join(dir, name);
        if (ent.isDirectory()) {
          if (name.charAt(0) === '.' || SKIP_DIRS.has(name)) continue;
          walk(abs, depth + 1);
          continue;
        }
        if (!ent.isFile()) continue;
        const rel = path.relative(root, abs).split(path.sep).join('/');
        const isEnv = ENV_RE.test(name);
        if (name.charAt(0) === '.' && !isEnv) continue;
        if (TEST_RE.test(name)) continue;
        const isPublic = /(^|\/)public\//i.test(rel);
        const isNextConfig = /^next\.config\.(js|ts|mjs|cjs)$/i.test(name);
        const isSrc = SRC_RE.test(name);
        if (!isEnv && !isPublic && !isNextConfig && !isSrc) continue;
        if (isNextConfig && !nextConfigAbs) nextConfigAbs = abs;
        try {
          const st = fs.statSync(abs);
          if (!st.isFile() || st.size > MAX_BYTES) continue;
          const content = fs.readFileSync(abs, 'utf8');
          files.push({ path: rel, content });
        } catch { /* unreadable → skipped */ }
      }
    };
    try { walk(root, 0); } catch { /* fail-soft */ }
    return { files, nextConfigAbs };
  }
  // CONTENT fingerprint of a walked file set: sha256 over sorted `path\0sha256(content)`. Binds a scan
  // to the exact bytes it read — so an edit to ANY of them (tracked, staged, untracked, or gitignored)
  // since the scan flips the fingerprint. This is what makes the gate a real freshness signal (the earlier
  // git-diff version was blind to untracked/staged/ignored content — the P0 review's confirmed TOCTOU).
  _fingerprintOf(files) {
    try {
      const lines = (Array.isArray(files) ? files : []).map((f) => String(f.path) + '\0' + crypto.createHash('sha256').update(String(f.content), 'utf8').digest('hex')).sort();
      return crypto.createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
    } catch { return null; }
  }
  _scanFingerprint() { try { return this._fingerprintOf(this._walkScanFiles(this._wsRoot()).files); } catch { return null; } }
  // D6 (P0) — the FAIL-CLOSED publish security gate. Publish (commit + deploy) is BLOCKED unless the
  // LAST 🛡 scan this session is (1) present, (2) not errored, (3) FRESH — bound to the CONTENT of the
  // exact files it scanned, so ANY byte change since (incl. an untracked/staged/gitignored file edited
  // after the scan) makes it stale and forces a re-scan — and (4) clear of open Criticals: a secret baked
  // into the change, OR an npm-audit critical/high that is NOT provably all-dev-only (fail-closed: a
  // critical whose entries can't be classified blocks). Default = BLOCKED. There is NO webview override:
  // the earlier `overrideCritical` message let a forged lp-publish-* wave a Critical through; it is GONE.
  _securityGate() {
    const r = this._lastSecurity;
    if (!r || typeof r !== 'object') return { cleared: false, reason: 'security-scan-required' };
    if (r.error) return { cleared: false, reason: 'security-scan-failed' };
    const now = this._scanFingerprint();
    if (!r.fingerprint || !now || r.fingerprint !== now) return { cleared: false, reason: 'security-scan-stale' };
    const secrets = Array.isArray(r.secrets) ? r.secrets : [];
    if (secrets.some((s) => s && String(s.severity || '').toLowerCase() === 'critical')) return { cleared: false, reason: 'critical-open' };
    const a = r.audit;
    if (a && a.ok && a.counts) {
      const c = a.counts;
      const risk = (Number(c.critical) || 0) + (Number(c.high) || 0);
      const total = risk + (Number(c.moderate) || 0) + (Number(c.low) || 0) + (Number(c.info) || 0);
      // Block a critical/high UNLESS every advisory is PROVABLY dev-only (devOnlyCount === total). A
      // metadata-vs-entries divergence (counts say critical but the entry map is empty/unclassifiable)
      // → devOnlyCount !== total → BLOCK. Dev deps never ship, so a fully-dev-only set does not block.
      const allDevOnly = total > 0 && (Number(a.devOnlyCount) || 0) === total;
      if (risk > 0 && !allDevOnly) return { cleared: false, reason: 'critical-open' };
    }
    return { cleared: true, reason: null };
  }

  // _vercelProject(root) — the SINGLE resolver for "is this workspace linked, and to what
  // project". Read by BOTH _publishStatus (advisory, for the UI hint) AND _publishDeploy (the
  // actual gate) — one function, so the two can never silently diverge. Checks
  // <root>/landing/.vercel/project.json first (this repo's real layout), then <root>/.vercel/
  // project.json. projectName = the linked project's OWN .projectName field, or (fallback) the
  // basename of the directory that holds .vercel/ — e.g. "landing". Never throws; not linked →
  // { linked:false, projectName:null, projectDir:null }.
  _vercelProject(root) {
    const candidates = [
      path.join(root || '', 'landing', '.vercel', 'project.json'),
      path.join(root || '', '.vercel', 'project.json'),
    ];
    for (const p of candidates) {
      try {
        if (!fs.existsSync(p)) continue;
        let j = null;
        try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { j = null; }
        const vercelDir = path.dirname(p);      // …/.vercel
        const projectDir = path.dirname(vercelDir); // …/landing (or the wsRoot itself)
        const name = (j && typeof j.projectName === 'string' && j.projectName.trim())
          ? j.projectName.trim()
          : path.basename(projectDir);
        return { linked: true, projectName: name, projectDir };
      } catch { /* try next candidate */ }
    }
    return { linked: false, projectName: null, projectDir: null };
  }

  // _publishStatus() — READ-ONLY. Answers "what would Publish do right now": the changed files
  // (from gitCommitPreview — the SAME preview the selective commit re-validates against, never a
  // separate/looser read), the default commit message, whether Vercel is linked (+ its expected
  // project name, shown only as a hint — the deploy gate re-derives it independently), the open-
  // Critical flag, and the last known REAL deploy URL this session produced (or null — never
  // guessed).
  async _publishStatus() {
    const post = (payload) => { try { this.panel.webview.postMessage(Object.assign({ type: 'lp-publish-status-result', __t: this.token }, payload)); } catch { /* best-effort */ } };
    try {
      const root = this._wsRoot();
      const prev = await extra.gitCommitPreview(root);
      const touchedFiles = (prev && Array.isArray(prev.files)) ? prev.files : [];
      const vercel = this._vercelProject(root);
      const secGate = this._securityGate(); // once — it walks the scanned-file set
      post({
        branch: prev ? prev.branch : null,
        touchedFiles,
        defaultMessage: prev ? prev.message : '',
        vercelLinked: vercel.linked,
        projectName: vercel.linked ? vercel.projectName : null,
        hasOpenCritical: !secGate.cleared, // D6: "blocked by security" — required/failed/stale/critical
        securityReason: secGate.reason,    // the honest WHY, so the popover doesn't just say "critical"
        websiteUrl: this._lastDeployUrl || null,
      });
    } catch { post({ error: 'status-failed' }); }
  }

  // _publishCommit(m) — payload {files, message}. SELECTIVE commit + push, NEVER `git add -A`.
  // The webview's file list is a SUGGESTION, not authority: we recompute the changed set fresh
  // (a new gitCommitPreview, not the one the webview saw — the disk may have moved since) and
  // silently drop anything the user did not actually see change — a file the caller asks for that
  // is NOT in that fresh set is simply never staged. host-extra.gitCommit does the real
  // `git add -- <files>` + `git commit`; host-extra.gitPush does the real `git push` (never
  // --force). Reports the EXACT command string either way (transparency), never a presumed
  // success.
  async _publishCommit(m) {
    const post = (payload) => { try { this.panel.webview.postMessage(Object.assign({ type: 'lp-publish-result', __t: this.token, action: 'commit' }, payload)); } catch { /* best-effort */ } };
    try {
      const root = this._wsRoot();
      const reqFiles = Array.isArray(m && m.files) ? m.files.filter((f) => typeof f === 'string' && f) : [];
      const message = (m && typeof m.message === 'string') ? m.message.trim().slice(0, 500) : '';
      if (!reqFiles.length || !message) { post({ ok: false, reason: 'bad-request', cmd: '' }); return; }
      // D6 (P0) — fail-closed, BEFORE any staging: the selective commit+push is gated on a valid, FRESH,
      // Critical-free security scan (no scan / errored / stale / open Critical all block). No override —
      // a forged lp-publish-commit can no longer wave a scanned secret to the remote.
      { const gate = this._securityGate(); if (!gate.cleared) { post({ ok: false, reason: gate.reason, cmd: '' }); return; } }
      const prev = await extra.gitCommitPreview(root);
      const allowed = new Set((prev && Array.isArray(prev.files) ? prev.files : []).map((f) => f.path));
      const files = reqFiles.filter((f) => allowed.has(f)); // NEVER commit a file the user didn't see
      if (!files.length) { post({ ok: false, reason: 'no-matching-files', cmd: '' }); return; }
      const cres = await extra.gitCommit(root, files, message); // `git add -- <files>` then `git commit` — never -A
      if (!cres.ok) { post({ ok: false, reason: 'commit-failed', out: String(cres.out || '').slice(0, 400), cmd: cres.cmd }); return; }
      const pres = await extra.gitPush(root); // never --force
      post({
        ok: pres.ok,
        reason: pres.ok ? undefined : 'push-failed',
        out: String(pres.out || '').slice(0, 400),
        cmd: cres.cmd + ' && ' + pres.cmd,
        filesCommitted: files.length,
      });
    } catch { post({ ok: false, reason: 'error', cmd: '' }); }
  }

  // _publishDeploy(m) — payload {projectName}. THE IRREVERSIBLE STEP. HARD TWO-FACTOR GATE:
  // this method independently re-reads .vercel/project.json (via _vercelProject — the SAME
  // resolver _publishStatus used to show the hint, called again here fresh) and compares it
  // BYTE-FOR-BYTE against m.projectName. Anything other than an exact match REFUSES and deploys
  // NOTHING — the webview is assumed untrusted/possibly wrong; this check is the only thing that
  // matters. Only on an exact match does `vercel --prod --yes` ever spawn. A missing CLI (ENOENT,
  // or a shell reporting "not recognized"/"command not found") returns an honest onboarding
  // reason, never an invented URL. Any other failure (non-zero exit, timeout) is reported as-is —
  // never presented as success.
  _publishDeploy(m) {
    const post = (payload) => { try { this.panel.webview.postMessage(Object.assign({ type: 'lp-publish-result', __t: this.token, action: 'deploy' }, payload)); } catch { /* best-effort */ } };
    try {
      const root = this._wsRoot();
      const info = this._vercelProject(root);
      if (!info.linked) { post({ ok: false, reason: 'not-linked' }); return; }
      const typed = (m && typeof m.projectName === 'string') ? m.projectName.trim() : '';
      // ── THE GATE ── deploy is unreachable without this exact match. Nothing above this line
      // spawns a process; nothing below runs unless it passes.
      if (!typed || typed !== info.projectName) { post({ ok: false, reason: 'name-mismatch' }); return; }
      // D6 (P0) — fail-closed secondary gate on the IRREVERSIBLE step: a valid, FRESH, Critical-free scan
      // is REQUIRED before `vercel --prod` can spawn (no scan / errored / stale / open Critical all block).
      // The two-factor name gate above stays the primary gate; this one is no longer overridable from the webview.
      { const gate = this._securityGate(); if (!gate.cleared) { post({ ok: false, reason: gate.reason }); return; } }
      let cp;
      try {
        cp = require('child_process').spawnSync('vercel', ['--prod', '--yes'],
          { cwd: info.projectDir, timeout: 180000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', windowsHide: true, shell: process.platform === 'win32' });
      } catch (e) {
        post({ ok: false, reason: (e && e.code === 'ENOENT') ? 'vercel-cli-missing' : 'spawn-error' });
        return;
      }
      const out = ((cp && typeof cp.stdout === 'string') ? cp.stdout : '') + ((cp && typeof cp.stderr === 'string') ? cp.stderr : '');
      const notFound = (cp && cp.error && cp.error.code === 'ENOENT')
        || (cp && cp.status !== 0 && /is not recognized|command not found/i.test(out));
      if (notFound) { post({ ok: false, reason: 'vercel-cli-missing' }); return; }
      if (!cp || cp.status !== 0) { post({ ok: false, reason: 'deploy-failed', out: out.slice(0, 800) }); return; }
      const urlMatch = out.match(/https:\/\/\S+\.vercel\.app\S*/);
      const url = urlMatch ? urlMatch[0] : null;
      if (url) this._lastDeployUrl = url; // honest state for the next lp-publish-status — never inferred
      post({ ok: true, url, out: out.slice(0, 800) });
    } catch { post({ ok: false, reason: 'error' }); }
  }

  // ── LP-4 §3 — anchored prompt: the model path, FENCED. The model (local $0 moo OR the
  // subscription bridge) sees ONLY the selected node's subtree + the instruction — never the
  // file. Whatever it answers is forced through spliceNodeRange (parse + single root + no
  // comments + byte-bounded to the verified node span) and the sha256 hash-guard from §0:
  // preview stamps the CURRENT disk hash; apply re-checks it and refuses 'file-changed' with a
  // regenerated stale preview. A model can hallucinate content; it cannot escape the span, and
  // a rejected replacement shows its exact reason and writes NOTHING.
  async _promptEdit(m) {
    const fail = (reason, detail) => this._postPromptDiff({ ok: false, reason: String(reason || 'refused'), detail: detail ? String(detail).slice(0, 200) : undefined });
    try {
      // FIX-MP-1 G2 — FAIL-CLOSED before we read the workspace node and ship its bytes to the model:
      // an unconfirmed served tree would build a diff of a file the user never saw in the preview.
      if (this._treeGateBlocked()) { fail('preview-tree-mismatch'); return; }
      // F3 (W1) — no pinned selection in the store → refuse, never rewrite a node the user did not pin.
      if (this._selectionMissing()) { fail('no-selection'); return; }
      const raw = (m && typeof m.file === 'string') ? m.file.trim() : '';
      const prompt = (m && typeof m.prompt === 'string') ? m.prompt.trim() : '';
      const tier = (m && typeof m.tier === 'string' && m.tier) ? m.tier : 'local';
      if (!raw || !prompt) { fail('bad-request'); return; }
      if (!LEA || typeof LEA.locateRange !== 'function' || typeof LEA.spliceNodeRange !== 'function') { fail('engine-unavailable'); return; }
      if (tier !== 'local' && !(LEC && LEC.TIER_MODEL && LEC.TIER_MODEL[tier])) { fail('bad-request', 'unknown tier ' + tier); return; }
      const real = this._resolveContainedFile(raw);
      if (!real) { fail('file-not-in-workspace'); return; }
      // review P1-A: refuse cloud tiers in an untrusted workspace BEFORE anything spawns the
      // workspace SDK — the chip already disables them, this is the host-side backstop.
      if (tier !== 'local' && !this._workspaceTrusted()) { fail('workspace-untrusted'); return; }
      const s0 = fs.readFileSync(real, 'utf8');
      const target = { line: m.line, col: m.col, tag: m.tag };
      const r0 = LEA.locateRange(s0, target);
      if (!r0.ok) { fail(leaFailReason(r0)); return; }
      // READ fence: the model gets the node's exact byte span — never one byte more.
      const nodeSource = s0.slice(r0.start, r0.end);
      // LP-4.5 §5 — dynamic-content signal, computed BEFORE any rewrite: a Component tag
      // (uppercase) renders from INSIDE itself, and rendered text that is not literal in the
      // node span comes from props/data — rewriting this node may change nothing on screen.
      // The flag rides the diff so the panel warns before aplicar and never claims a plain
      // "✓ escrito" for a write that may not affect the render.
      const selText = (m && typeof m.selText === 'string') ? m.selText.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
      const isComponent = /^[A-Z]/.test(String(m.tag || ''));
      const dynamic = isComponent || (!!selText && nodeSource.replace(/\s+/g, ' ').indexOf(selText) === -1);
      // review P3-a: the model gets a WORKSPACE-RELATIVE file:line label as context — never the
      // absolute host path (which would leak the OS username + repo tree to the cloud).
      let relFile = real;
      try { const rel = path.relative(this._wsRoot(), real); if (rel && !rel.startsWith('..')) relFile = rel.split(path.sep).join('/'); } catch { /* keep real */ }
      this._postPromptStatus({ phase: 'thinking', tier });
      let reply;
      let newImports = [];
      let quality = null;
      if (tier === 'local') {
        if (!LEM) { fail('engine-unavailable'); return; }
        if (LEQ && typeof LEQ.runQualityLoop === 'function') {
          // LP-4.7 — the Moo Quality Engine: best-of-N + retry against the SAME fence the write
          // will re-run. Exhaustion returns EVIDENCE the panel turns into an escalation OFFER
          // ("o moo falhou 2× (motivo) — subir para Sonnet?") — the climb is the user's click,
          // NEVER taken here. Any infra failure surfaces as-is, same UX as the single call.
          const q = await LEQ.runQualityLoop(
            { nodeSource, prompt, file: relFile, line: m.line },
            {
              source: s0, range: { start: r0.start, end: r0.end }, wsRoot: this._wsRoot(), absFile: real,
              rewrite: (inp, ro) => LEM.rewriteElement(inp, ro), // the host's LEM, injectable in tests
              onStatus: (st) => this._postPromptStatus({ phase: 'thinking', tier, round: st.round, rounds: st.rounds, sample: st.sample, of: st.of }),
            },
          );
          if (!q.ok) {
            if (q.reason === 'local-quality-exhausted') {
              // The offer payload carries the original ask so the button can re-fire on t2 —
              // bound to THIS target (review P1-B discipline), with the evidence verbatim.
              this._postPromptDiff({ ok: false, reason: 'local-quality-exhausted', evidence: q.evidence, file: raw, line: m.line, col: m.col, tag: m.tag, prompt, selText: (m && typeof m.selText === 'string') ? m.selText.slice(0, 200) : '' });
              return;
            }
            fail(q.reason, q.detail);
            return;
          }
          // Already verified against s0 AND cleaned inside the engine — what was verified is
          // exactly what goes to the write fence below (no second cleaning that could diverge).
          reply = { ok: true, text: q.replacement, model: q.model, precleaned: true };
          newImports = Array.isArray(q.imports) ? q.imports : [];
          quality = q.passed ? { round: q.passed.round, sample: q.passed.sample, samplesTried: q.samplesTried } : null;
        } else {
          reply = await LEM.rewriteElement({ nodeSource, prompt, file: relFile, line: m.line });
        }
      } else {
        if (!LEC) { fail('sdk-bridge-missing'); return; }
        reply = await LEC.rewriteElementCloud({ nodeSource, prompt, file: relFile, line: m.line, tier }, { wsRoot: this._wsRoot(), trusted: this._workspaceTrusted() });
      }
      if (!reply || !reply.ok) { fail((reply && reply.reason) || 'error', reply && reply.detail); return; }
      const replacement = reply.precleaned
        ? String(reply.text || '')
        : ((LEM && typeof LEM.cleanModelReply === 'function') ? LEM.cleanModelReply(reply.text) : String(reply.text || '').trim());
      // WRITE fence + hash-guard: the model call took seconds — re-read the disk NOW, re-locate
      // the node, and let spliceNodeRange verify the span + the replacement. Nothing is written
      // in this phase; the panel shows the diff with the CURRENT hash stamped.
      const s1 = fs.readFileSync(real, 'utf8');
      const h1 = crypto.createHash('sha256').update(s1, 'utf8').digest('hex');
      const r1 = LEA.locateRange(s1, target);
      if (!r1.ok) { fail(leaFailReason(r1)); return; }
      const res = LEA.spliceNodeRange(s1, { start: r1.start, end: r1.end }, replacement);
      if (!res.ok) { fail(leaFailReason(res), res.detail); return; }
      // LP-4.7 — imports the model DECLARED and the asset fence verified: re-verify against the
      // CURRENT disk (fail-closed without the verifier) and dry-run the insertion. The node diff
      // stays the node's (a single splice); the import lines ride separately as importsAdded.
      let importsAdded = [];
      if (newImports.length > 0) {
        if (!LEAS || typeof LEAS.verifyImports !== 'function' || typeof LEA.insertImports !== 'function') { fail('import-verifier-unavailable'); return; }
        const vi = LEAS.verifyImports(newImports, { wsRoot: this._wsRoot(), file: real });
        if (!vi.ok) { fail(vi.reason, vi.detail); return; }
        const ins = LEA.insertImports(res.code, newImports);
        if (!ins.ok) { fail(leaFailReason(ins), ins.detail); return; }
        importsAdded = ins.inserted;
      }
      const d = LEA.diffRemovedLines(s1, res.code);
      // review P1-B: the write TARGET rides the diff payload so apply is bound to THIS preview —
      // never reconstructed from a mutable global that a concurrent second preview could have moved.
      this._postPromptDiff({ ok: true, stale: false, file: raw, line: m.line, col: m.col, tag: m.tag, start: d.start, removed: d.removed, added: d.added, h: h1, replacement, newImports, importsAdded, abs: real, tier, dynamic, quality, model: reply.model || (LEC && LEC.TIER_MODEL && LEC.TIER_MODEL[tier]) || 'local' });
    } catch { fail('error'); }
  }
  // Apply the APPROVED replacement — the same two-phase fence as delete/edit: the echo hash must
  // still match the disk (else: regenerated stale preview, nothing written), the target must
  // still be a real node span, and the splice must pass every fence check again at write time.
  async _promptApply(m) {
    const fail = (reason) => this._postEditResult(false, reason);
    try {
      // FIX-MP-1 G2 — FAIL-CLOSED, EARLIEST: the one-box default path (tier:'local') writes the
      // approved model reply. Without a proven served-tree lineage the reply must never land on disk.
      if (this._treeGateBlocked()) { fail('preview-tree-mismatch'); return; }
      const raw = (m && typeof m.file === 'string') ? m.file.trim() : '';
      const replacement = (m && typeof m.replacement === 'string') ? m.replacement : '';
      if (!raw || !replacement.trim()) { fail('bad-request'); return; }
      if (typeof m.h !== 'string' || !m.h) { fail('bad-request'); return; }
      if (!LEA || typeof LEA.locateRange !== 'function' || typeof LEA.spliceNodeRange !== 'function') { fail('engine-unavailable'); return; }
      const real = this._resolveContainedFile(raw);
      if (!real) { fail('file-not-in-workspace'); return; }
      const s2 = fs.readFileSync(real, 'utf8');
      const h2 = crypto.createHash('sha256').update(s2, 'utf8').digest('hex');
      const stale = m.h !== h2; // apply against a moved file → NEVER write; re-preview
      const target = { line: m.line, col: m.col, tag: m.tag };
      const r2 = LEA.locateRange(s2, target);
      if (!r2.ok) { fail(leaFailReason(r2)); return; }
      let res = LEA.spliceNodeRange(s2, { start: r2.start, end: r2.end }, replacement);
      if (!res.ok) { fail(leaFailReason(res)); return; }
      // LP-4.7 — the approved imports re-run the FULL fence at write time (webview payloads are
      // sanitised and re-verified, never trusted): verifier fail-closed, insertion re-parsed.
      const newImports = Array.isArray(m.newImports)
        ? m.newImports.filter((s) => typeof s === 'string' && s.trim()).slice(0, (LEAS && LEAS.MAX_NEW_IMPORTS) || 5)
        : [];
      let importsAdded = [];
      if (newImports.length > 0) {
        if (!LEAS || typeof LEAS.verifyImports !== 'function' || typeof LEA.insertImports !== 'function') { fail('import-verifier-unavailable'); return; }
        const vi = LEAS.verifyImports(newImports, { wsRoot: this._wsRoot(), file: real });
        if (!vi.ok) { fail(vi.reason); return; }
        const ins = LEA.insertImports(res.code, newImports);
        if (!ins.ok) { fail(leaFailReason(ins)); return; }
        importsAdded = ins.inserted;
        res = { ok: true, code: ins.code, changed: res.changed || ins.changed, kind: res.kind };
      }
      if (stale) {
        const d = LEA.diffRemovedLines(s2, LEA.spliceNodeRange(s2, { start: r2.start, end: r2.end }, replacement).code);
        // review P1-B: carry the target on the regenerated stale preview too (+ §5 dynamic flag).
        this._postPromptDiff({ ok: true, stale: true, file: raw, line: m.line, col: m.col, tag: m.tag, start: d.start, removed: d.removed, added: d.added, h: h2, replacement, newImports, importsAdded, abs: real, tier: m.tier || 'local', dynamic: !!m.dynamic });
        return;
      }
      // review P3-b: a model reply that equals the node byte-for-byte is a genuine no-op — say so
      // honestly and push NO undo entry (else 'desfazer' would revert an EARLIER edit).
      if (!res.changed) { this._postEditResult(true, 'no-op'); return; }
      // review P3-c: write FIRST, then record the undo entry — a failed write must not leave a
      // phantom entry that lights the undo button and later refuses as 'undo-stale'.
      fs.writeFileSync(real, res.code, 'utf8');
      const vlabel = (m.tier && m.tier !== 'local')
        ? ('cercada · ' + (m.tier === 't1' ? 'Haiku' : m.tier === 't2' ? 'Sonnet' : m.tier === 't3' ? 'Opus' : m.tier === 'fable' ? 'Fable' : m.tier) + ' · subscrição')
        : 'cercada · local $0';
      this._pushUndo(real, s2, res.code, vlabel, raw, { line: m.line, col: m.col, tag: m.tag }); // §4 feed item + F0.2 nodeKey
      // §5 — a write on a dynamic-content node must NEVER read as a plain "✓ escrito": the file
      // changed, the render may not have. The flag was computed host-side at preview time and
      // rode the approved diff; the copy tells the user to verify and offers the agent.
      this._postEditResult(true, m.dynamic ? 'model-applied-dynamic' : 'model-applied', m.tier);
      // §5 — the node's start survived the splice, but a model rewrite may have CHANGED the tag:
      // read the fresh tag from the spliced output so the re-pin stamp matches post-HMR reality.
      let repinTag = (typeof m.tag === 'string') ? m.tag : '';
      try {
        const r3 = LEA.locateRange(res.code, { line: m.line, col: m.col });
        if (r3.ok && r3.el && typeof LEA.tagNameOf === 'function') {
          const t = LEA.tagNameOf(r3.el.openingElement);
          if (t) repinTag = t;
        }
      } catch { /* keep the old tag — the tap matches tag only when it can */ }
      this._postRepin({ file: raw, line: m.line, col: m.col, tag: repinTag });
    } catch { fail('error'); }
  }
  _postPromptDiff(payload) {
    try { this.panel.webview.postMessage(Object.assign({ type: 'lp-prompt-diff', __t: this.token }, payload)); } catch { /* best-effort */ }
  }
  // ── LP-4.5 — anchored PROJECT task: the one-box default. The pin is an ANCHOR (file:line +
  // nodeSource + breadcrumb), not a fence: the agent runs headless WITH the workspace as cwd,
  // reads the repo and edits the RIGHT place — which may not be the pinned node. Hard trust gate
  // here AND in runAnchoredTask (defense in depth); permissions are enforced runner-side via the
  // canUseTool allowlist (Bash/network NEVER). A question writes NOTHING; an edit comes back as a
  // per-file git diff the user keeps or reverts (sha-guarded) — never a silent "✓ escrito".
  async _taskRun(m) {
    const fail = (reason, detail) => this._postTaskResult({ ok: false, reason: String(reason || 'error'), detail: detail ? String(detail).slice(0, 200) : undefined });
    try {
      const instruction = (m && typeof m.instruction === 'string') ? m.instruction.trim() : '';
      const mode = (m && typeof m.mode === 'string' && m.mode) ? m.mode : 'auto';
      if (!instruction) { fail('prompt-empty'); return; }
      if (!LET) { fail('engine-unavailable'); return; }
      if (this._workspaceTrusted() !== true) { fail('workspace-untrusted'); return; }
      // FIX-MP-1 G2 — FAIL-CLOSED alongside the trust gate: the anchored agent must not run off a
      // preview anchor from a sibling served tree (it would edit the wrong tree the user never saw).
      if (this._treeGateBlocked()) { fail('preview-tree-mismatch'); return; }
      // F3 (W1) — no pinned selection in the store → refuse before the agent runs anchorless
      // (defense-in-depth; the honest webview already hides the one-box until an element is pinned).
      if (this._selectionMissing()) { fail('no-selection'); return; }
      // N2 — enforce the "one active task at a time" invariant the cancel machinery ASSUMES: a second
      // lp-task while one is running would overwrite _activeTaskAbort (orphaning the first — cancel would
      // only reach the second) and run two agents at once. Refuse honestly; the running one is untouched.
      if (this._activeTaskAbort) { fail('task-busy'); return; }
      // Anchor context (best-effort, never blocks the task): the node's exact source if we can
      // still locate it, plus the workspace-relative file:line label — same P3-a discipline as
      // _promptEdit (the absolute host path never travels to the model).
      let nodeSource = '';
      let relFile = '';
      const raw = (m && typeof m.file === 'string') ? m.file.trim() : '';
      if (raw) {
        const real = this._resolveContainedFile(raw);
        if (real) {
          try { const rel = path.relative(this._wsRoot(), real); if (rel && !rel.startsWith('..')) relFile = rel.split(path.sep).join('/'); } catch { /* keep '' */ }
          try {
            if (LEA && typeof LEA.locateRange === 'function') {
              const s = fs.readFileSync(real, 'utf8');
              const r = LEA.locateRange(s, { line: m.line, col: m.col, tag: m.tag });
              if (r.ok) nodeSource = s.slice(r.start, r.end);
            }
          } catch { /* anchor degrades to file:line only */ }
        }
      }
      // LP-4.8 §4 — attach-as-reference: extra nodes Cmd/Ctrl-clicked as CONTEXT for this prompt.
      // Each ref runs the SAME containment resolution as the primary anchor (a path that escapes
      // the workspace is dropped), is bounded (8 max), and travels workspace-RELATIVE only — the
      // absolute host path never reaches the model. Refs are read-only pointers; the agent's write
      // path stays gated by the runner's in-workspace + sensitive-file guards (never a write target).
      let refs;
      if (Array.isArray(m.refs) && m.refs.length) {
        refs = [];
        for (let i = 0; i < m.refs.length && refs.length < 8; i++) {
          const r = m.refs[i] || {};
          const rraw = (typeof r.file === 'string') ? r.file.trim() : '';
          if (!rraw) continue;
          const rreal = this._resolveContainedFile(rraw);
          if (!rreal) continue; // escaped the workspace → dropped, never sent to the model
          let rrel = rraw;
          try { const rel = path.relative(this._wsRoot(), rreal); if (rel && !rel.startsWith('..')) rrel = rel.split(path.sep).join('/'); } catch { /* keep raw */ }
          refs.push({ file: rrel, line: Number.isInteger(r.line) ? r.line : undefined, col: Number.isInteger(r.col) ? r.col : undefined, tag: (typeof r.tag === 'string') ? r.tag.slice(0, 40) : undefined });
        }
        if (!refs.length) refs = undefined;
      }
      // LP-4.9 §1 — explicit intent from the Edit/Ask toggle. 'ask' forces an answer-only run
      // (zero writes even if the ask looks like an edit); anything else edits. Default 'edit'.
      const intent = (m && m.intent === 'ask') ? 'ask' : 'edit';
      // F3 (W1) — the rendered text of the pinned node comes from the host SelectionStore (the record
      // fed by lp-pin), NOT the message, so an ask/edit agent sees what the user sees even when the
      // JSX is dynamic. Guarded: a bare Object.create harness has no store → '' (contract unchanged).
      const selText = (this._selection && typeof this._selection.selText === 'string') ? this._selection.selText : '';
      this._postTaskStatus({ phase: 'thinking', mode, intent });
      // LP-4.9 §8 — the cancel button (lp-task-cancel) aborts THIS run. One active task at a time.
      const ac = (typeof AbortController === 'function') ? new AbortController() : null;
      this._activeTaskAbort = ac;
      let res;
      try {
        res = await LET.runAnchoredTask({
          instruction,
          file: relFile || raw, line: m.line, col: m.col, tag: m.tag,
          nodeSource,
          selText,
          breadcrumb: (typeof m.breadcrumb === 'string') ? m.breadcrumb.slice(0, 400) : '',
          refs,
          intent,
          mode,
        }, {
          wsRoot: this._wsRoot(),
          trusted: this._workspaceTrusted() === true,
          signal: ac ? ac.signal : undefined,
          onProgress: (ev) => this._postTaskStatus({ phase: ev.ev, tool: ev.tool || null, path: ev.path || null, why: ev.why || null, mode }),
        });
      } finally { if (this._activeTaskAbort === ac) this._activeTaskAbort = null; }
      if (!res || !res.ok) { fail((res && res.reason) || 'error', res && res.detail); return; }
      // Register the edits HOST-side keyed by taskId: revert must act on OUR record (snapshot +
      // shaAfter), never on paths a webview message hands back (P1-B discipline, agent flavour).
      if (!this._taskReg) { this._taskReg = new Map(); this._taskSeq = 0; }
      const taskId = 'task-' + (++this._taskSeq);
      const edits = Array.isArray(res.edits) ? res.edits : [];
      this._taskReg.set(taskId, edits);
      if (this._taskReg.size > 20) { const k = this._taskReg.keys().next().value; this._taskReg.delete(k); }
      // §4 — an agent task that edited files is ONE feed item (per-file revert lives in the
      // result panel; the feed item reverts the whole task, sha-guarded per file).
      if (edits.length) {
        const modeLabel = mode === 'auto' ? 'AUTO' : (mode === 't1' ? 'Haiku' : mode === 't2' ? 'Sonnet' : mode === 't3' ? 'Opus' : mode === 'fable' ? 'Fable' : mode);
        const nodeKey = { servedRoot: (typeof this._servedRoot === 'string') ? this._servedRoot : null, file: relFile || raw, line: Number.isInteger(m.line) ? m.line : null, col: Number.isInteger(m.col) ? m.col : null, tag: (typeof m.tag === 'string') ? m.tag.slice(0, 60) : null };
        this._feedPush({ kind: 'agent', via: 'agente · ' + modeLabel + ' · subscrição', files: edits.map((e) => e.file), taskId, status: 'live', reason: null, nodeKey });
      }
      // Per-file diff for the panel: real git diff, scoped to EXACTLY this task (snapshot vs the
      // file now) — the user's own pre-existing uncommitted changes never pollute it.
      const view = edits.map((e) => {
        const d = LET.gitDiffFile(e.snapshot, e.abs);
        return { file: e.file, diff: (d && d.ok) ? d.lines.slice(0, 400) : null, diffReason: (d && d.ok) ? null : ((d && d.reason) || 'git-unavailable') };
      });
      this._postTaskResult({
        ok: true, taskId, kind: res.kind, text: String(res.text || ''),
        filesRead: Array.isArray(res.filesRead) ? res.filesRead.slice(0, 100) : [],
        edits: view,
        denied: Array.isArray(res.denied) ? res.denied.slice(0, 40) : [],
        model: res.model || null, mode,
      });
    } catch { fail('error'); }
  }
  _postTaskStatus(payload) {
    try { this.panel.webview.postMessage(Object.assign({ type: 'lp-task-status', __t: this.token }, payload)); } catch { /* best-effort */ }
  }
  _postTaskResult(payload) {
    try { this.panel.webview.postMessage(Object.assign({ type: 'lp-task-result', __t: this.token }, payload)); } catch { /* best-effort */ }
  }
  // LP-4.5 — revert agent edits: per file (m.file) or all (m.all). The webview only names WHICH
  // registered edit; the write itself uses OUR record (snapshot path + shaAfter) — a forged
  // message cannot point the revert at an arbitrary file. Sha-guarded fail-closed in revertEdit:
  // the file must still match the post-agent hash or nothing is written ('revert-stale').
  _taskRevert(m) {
    const post = (payload) => { try { this.panel.webview.postMessage(Object.assign({ type: 'lp-task-revert-result', __t: this.token }, payload)); } catch { /* best-effort */ } };
    try {
      const taskId = (m && typeof m.taskId === 'string') ? m.taskId : '';
      const reg = (this._taskReg && this._taskReg.get(taskId)) || null;
      if (!LET || !reg || !reg.length) { post({ taskId, results: [], done: false }); return; }
      const targets = m && m.all ? reg.slice() : reg.filter((e) => e && e.file === m.file);
      const results = [];
      for (const e of targets) {
        const r = LET.revertEdit(e);
        results.push({ file: e.file, ok: !!(r && r.ok), reason: (r && r.reason) || null });
        if (r && r.ok) {
          const i = reg.indexOf(e);
          if (i !== -1) reg.splice(i, 1);
          try { fs.unlinkSync(e.snapshot); } catch { /* best-effort tmp cleanup */ }
        }
      }
      if (!reg.length) this._taskReg.delete(taskId);
      // §4 — reflect the outcome on the task's feed item: emptied → reverted; a refusal keeps it
      // live with the honest reason visible. Scan from the end, live-only (newest task wins).
      const item = this._feedFindAgent(taskId);
      if (item) {
        if (!reg.length) { item.status = 'reverted'; item.reason = null; }
        else {
          const bad = results.find((r) => !r.ok);
          if (bad) item.reason = bad.reason || 'error';
        }
        this._feedBump();
      }
      post({ taskId, results, done: !reg.length });
    } catch { post({ taskId: (m && m.taskId) || '', results: [], done: false }); }
  }
  // LP-4.5 — keep agent edits: the files already hold them (HMR showed them); keeping just drops
  // our snapshots/record. Honest ok:false when there is nothing registered to keep.
  _taskKeep(m) {
    const post = (payload) => { try { this.panel.webview.postMessage(Object.assign({ type: 'lp-task-keep-result', __t: this.token }, payload)); } catch { /* best-effort */ } };
    try {
      const taskId = (m && typeof m.taskId === 'string') ? m.taskId : '';
      const reg = (this._taskReg && this._taskReg.get(taskId)) || null;
      if (!reg || !reg.length) { post({ taskId, ok: false }); return; }
      for (const e of reg) { try { fs.unlinkSync(e.snapshot); } catch { /* best-effort tmp cleanup */ } }
      this._taskReg.delete(taskId);
      // §4 — the feed item settles as kept (facts, not claims).
      const item = this._feedFindAgent(taskId);
      if (item) { item.status = 'kept'; item.reason = null; this._feedBump(); }
      post({ taskId, ok: true });
    } catch { post({ taskId: (m && m.taskId) || '', ok: false }); }
  }
  _postPromptStatus(payload) {
    try { this.panel.webview.postMessage(Object.assign({ type: 'lp-prompt-status', __t: this.token }, payload)); } catch { /* best-effort */ }
  }
  _postRepin(payload) {
    try { this.panel.webview.postMessage(Object.assign({ type: 'lp-repin', __t: this.token }, payload)); } catch { /* best-effort */ }
  }
  // LP-4 §6 — is the subscription bridge usable from this workspace? A cheap fs fact, cached 30s
  // (it rides every snapshot poll). Fail-soft: absent module → honest 'sdk-bridge-missing'.
  // F0.5.2 — an EMPTY window (no folder open) is NOT "SDK missing": it needs a FOLDER first. Kept
  // out of the 30s cache so opening a folder lights up the readiness immediately.
  _hasWorkspace() {
    try { const wfs = vscode.workspace && vscode.workspace.workspaceFolders; return !!(wfs && wfs.length); }
    catch { return false; }
  }
  _leBridgeStatus() {
    // F0.5.2 — tri-state: no-workspace ≠ sdk-missing ≠ untrusted. The honest reason drives the right
    // 1-click action in the UI (open a folder / install the SDK / trust the workspace) — never a lie.
    if (!this._hasWorkspace()) return { available: false, reason: 'no-workspace' };
    const now = Date.now();
    if (this._leBridge && this._leBridgeTs && (now - this._leBridgeTs) < 30000) return this._leBridge;
    // review P1-A: the cloud bridge runs the workspace's SDK, so it is gated on Workspace Trust.
    // An untrusted workspace → 'workspace-untrusted', the chip disables cloud with that honest reason.
    const trusted = this._workspaceTrusted();
    this._leBridge = (LEC && typeof LEC.bridgeStatus === 'function')
      ? LEC.bridgeStatus(this._wsRoot(), { trusted })
      : { available: false, reason: 'sdk-bridge-missing' };
    this._leBridgeTs = now;
    return this._leBridge;
  }
  // F0.5.3 — the 4-light readiness the semaphore renders: workspace · dev server (+port/source) ·
  // served tree (marker matches this workspace?) · agent (SDK+trust, from the tri-state reason).
  // Pure FACT — never fabricates "ready". The sticky-port case (Docker 200 on :3000) surfaces as
  // devServer:true with tree:'mismatch' + the port/source, so the user SEES the wrong one.
  _readiness() {
    const br = this._leBridgeStatus();
    const st = this.stage || {};
    const hasWs = this._hasWorkspace();
    const devUp = !!(st.url && !st.degraded);
    let tree; // 'ok' (marker matches) | 'mismatch' (sticky-port / old branch) | 'unknown' (no server)
    if (!devUp || this._servedRoot === undefined || this._servedRoot === null) tree = 'unknown';
    else tree = this._treeConfirmed() ? 'ok' : 'mismatch';
    return {
      workspace: hasWs,
      devServer: devUp,
      port: (st.port != null) ? String(st.port) : null,
      source: (typeof st.source === 'string') ? st.source : null,
      tree: tree,
      sdk: !!br.available,                                  // available ⇒ SDK found AND trusted
      trust: hasWs && (br.reason !== 'workspace-untrusted'),
      reason: br.reason || null,
    };
  }
  // F0.5.3 — recover from a sticky-port / stale-tree preview WITHOUT touching the terminal yourself.
  // GATED (modal confirm — the agent never runs a command blindly): open a terminal in the served
  // tree (or the workspace root) and run the dev command, then re-probe so the readiness lights update.
  async _restartDevServer() {
    try {
      if (!this._hasWorkspace()) { vscode.window.showWarningMessage('Live Preview: abre a pasta do projeto primeiro (janela sem pasta).'); return; }
      const pick = await vscode.window.showWarningMessage('Reiniciar o dev server? Abro um terminal na pasta servida e corro "npm run dev".', { modal: true }, 'Reiniciar');
      if (pick !== 'Reiniciar') return;
      const cwd = (typeof this._servedRoot === 'string' && this._servedRoot) ? this._servedRoot : this._wsRoot();
      const term = vscode.window.createTerminal({ name: 'Mooter — dev server', cwd });
      term.show(); term.sendText('npm run dev');
      // re-probe shortly after so the semaphore reflects the fresh server (not the sticky one).
      setTimeout(() => { try { this.routes = null; this._detectStage(); } catch { /* best-effort */ } }, 3500);
    } catch { /* best-effort — never throw into the host */ }
  }
  // vscode.workspace.isTrusted is a boolean in real VS Code; default to trusted only when the API
  // does not expose the flag at all (never downgrade a genuine `false`).
  _workspaceTrusted() {
    try {
      const t = vscode.workspace && vscode.workspace.isTrusted;
      return (typeof t === 'boolean') ? t : true;
    } catch { return true; }
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
    this.panel.webview.html = getLivePreviewHtml(this.token, this._wsRoot());
    this._post();
    this._detectStage();
    // Visibility-aware polling (mirrors data.js's pollIntervalMs idea) — only tick while shown.
    this.timer = setInterval(() => { if (this.panel.visible) this._post(); }, data_.pollIntervalMs(true));
    // App Stage re-probe on a slower cadence (a TCP sweep, never on the render path).
    this.stageTimer = setInterval(() => { if (this.panel.visible) this._detectStage(); }, 4000);
    this._busPost = (extra && extra.mkDebounce) ? extra.mkDebounce(() => { if (this.panel.visible) this._post(); }, 1500) : null;
    this.panel.onDidChangeViewState(() => { if (this.panel.visible) { this._post(); this._detectStage(); if (this._busPost) this._busPost.cancel(); } });
    this.panel.webview.onDidReceiveMessage((m) => this._onMessage(m));
    // Best-effort fs.watch on the bus directory for near-live updates between polls — a missed
    // event (dir not created yet, watcher error) is still covered by the poll above, so this
    // never blocks or throws. Read-only: never creates the directory itself.
    try {
      const busFile = HC ? HC.eventsPath(this._wsRoot()) : path.join(this._wsRoot(), '_handoff', 'live-preview', 'events.jsonl');
      this.watcher = fs.watch(path.dirname(busFile), { persistent: false }, (_e, f) => {
        if (f === 'events.jsonl') { if (this._busPost) this._busPost(); else if (this.panel.visible) this._post(); }
      });
    } catch { this.watcher = null; }
    this.panel.onDidDispose(() => {
      if (this.timer) clearInterval(this.timer);
      if (this.stageTimer) clearInterval(this.stageTimer);
      try { if (this.watcher) this.watcher.close(); } catch { /* best-effort */ }
      try { if (this._busPost) this._busPost.cancel(); } catch { /* best-effort */ }
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
function getLivePreviewHtml(token, wsRoot) {
  const nonce = crypto.randomBytes(16).toString('hex'); // P1-3: CSPRNG CSP nonce
  const hostToken = JSON.stringify(String(token == null ? '' : token));
  const renderDirectorsCutSrc = LPV ? LPV.renderDirectorsCut.toString() : 'function renderDirectorsCut(){return "";}';
  const renderBrainSrc = LPV ? LPV.renderBrain.toString() : 'function renderBrain(){return "";}';
  const renderStageStatusSrc = LPS ? LPS.renderStageStatus.toString() : 'function renderStageStatus(){return "";}';
  const renderErrorStripSrc = LPD ? LPD.renderErrorStrip.toString() : 'function renderErrorStrip(){return "";}';
  // MP4-polish — the honest-severity predicates, serialised so the webview's lpIngest classifies
  // with the SAME source of truth as the pure decision layer (no JS drift between them).
  const isSelfNoiseSrc = LPD ? LPD.isLivePreviewSelfNoise.toString() : 'function isLivePreviewSelfNoise(){return false;}';
  const isBenignCssSrc = LPD ? LPD.isBenignCssWarning.toString() : 'function isBenignCssWarning(){return false;}';
  const renderDayBreakdownSrc = LPV ? LPV.renderDayBreakdown.toString() : 'function renderDayBreakdown(){return "";}';
  const renderModelBreakdownSrc = LPV ? LPV.renderModelBreakdown.toString() : 'function renderModelBreakdown(){return "";}';
  const renderFleetLanesSrc = LPV ? LPV.renderFleetLanes.toString() : 'function renderFleetLanes(){return "";}';
  const renderWorkPillSrc = LPV ? LPV.renderWorkPill.toString() : 'function renderWorkPill(){return "";}';
  const renderJournalCardSrc = LPV ? LPV.renderJournalCard.toString() : 'function renderJournalCard(){return "";}';
  // LP-4.5 — the one-box heuristic (SUGGESTS the local chip, never decides) + the safe markdown
  // renderer for agent answers, same fn.toString() contract as the renderers above (concat-only,
  // backtick-free source).
  const suggestLocalChipSrc = LTV ? LTV.suggestLocalChip.toString() : 'function suggestLocalChip(){return false;}';
  const renderMarkdownSafeSrc = LTV ? LTV.renderMarkdownSafe.toString() : 'function renderMarkdownSafe(t){return esc(t);}';
  const renderEditsFeedSrc = LTV ? LTV.renderEditsFeed.toString() : 'function renderEditsFeed(){return "";}';
  // LP-4.8 §2 — the deterministic preset engine, serialised in (self-contained: each fn carries its
  // own catalog/regexes so toString survives the module-scope loss).
  const mergeClassSrc = LPP ? LPP.mergeClass.toString() : 'function mergeClass(c,cls){return ((c||"")+" "+cls).trim();}';
  const renderPresetsBarHTMLSrc = LPP ? LPP.renderPresetsBarHTML.toString() : 'function renderPresetsBarHTML(){return "";}';
  // LP-5 §C — the Review Security renderer, serialised in (self-contained, same fn.toString()
  // contract as renderPresetsBarHTML above).
  const renderSecurityFindingsSrc = LPSECV ? LPSECV.renderSecurityFindings.toString() : 'function renderSecurityFindings(){return "";}';
  const renderPublishPopoverSrc = LPPV ? LPPV.renderPublishPopover.toString() : 'function renderPublishPopover(){return "";}';
  // LP-4.8 §3 — the /skills registry (data, loaded from assets/skills or the workspace override)
  // embedded as JSON, plus the pure menu renderer serialised in. No regexes → JSON is enough.
  const skillsRegistry = LSK ? LSK.loadSkills({ wsRoot: wsRoot }) : [];
  // LP-4.8 §3 hardening — loadSkills reads workspace .mooter/skills/*.md (not trust-gated), so a
  // cloned repo controls label/hint/template. Escape `<` before it lands in the nonce'd inline
  // <script> below: without this a field of `</script>…` breaks out of the tag. CSP blocks
  // execution, so the risk is panel-JS breakage + inert HTML, not RCE — but the fence is cheap.
  const skillsJson = JSON.stringify(Array.isArray(skillsRegistry) ? skillsRegistry : []).replace(/</g, '\\u003c');
  const renderSkillsMenuHTMLSrc = LSK ? LSK.renderSkillsMenuHTML.toString() : 'function renderSkillsMenuHTML(){return "";}';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; frame-src http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:*;">
<style>
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  html,body{height:100%}
  body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:0}
  #lp-root{display:flex;flex-direction:row;height:100vh;min-height:0}
  #lp-stagewrap{flex:1 1 62%;display:flex;flex-direction:column;min-width:0;min-height:0;border-right:1px solid var(--vscode-widget-border)}
  #lp-side{flex:0 0 340px;max-width:46%;overflow:auto;padding:12px 14px;min-width:0}
  /* LP-5 §C — 🛡 Review Security results panel (global action, local $0). */
  #lp-security{margin-bottom:12px;padding:8px 10px;border:1px solid var(--vscode-widget-border);border-radius:7px;font-size:11.5px;line-height:1.55}
  #lp-security .lp-sec-hdr{font-weight:600;margin-bottom:6px;opacity:.9}
  #lp-security .lp-sec-meta{opacity:.75;margin-bottom:6px}
  #lp-security .lp-sec-err{color:var(--vscode-errorForeground,#D9484B)}
  #lp-security .lp-sec-group{margin-bottom:8px}
  #lp-security .lp-sec-glabel{font-weight:600;margin-bottom:3px}
  #lp-security .lp-sec-critical .lp-sec-glabel{color:var(--vscode-charts-red,#E8888A)}
  #lp-security .lp-sec-warning .lp-sec-glabel{color:var(--vscode-charts-yellow,#E5C07B)}
  #lp-security .lp-sec-info .lp-sec-glabel{opacity:.8}
  #lp-security .lp-sec-item{margin:2px 0;word-break:break-word}
  #lp-security .lp-sec-label{font-weight:600;margin-right:6px}
  #lp-security .lp-sec-detail{opacity:.85}
  /* LP-6 §E — 🚀 Publish popover (commit/push preview + gated Vercel deploy). */
  #lp-publish{margin-bottom:12px;padding:8px 10px;border:1px solid var(--vscode-widget-border);border-radius:7px;font-size:11.5px;line-height:1.55}
  #lp-publish .lp-pub-hdr{font-weight:600;margin-bottom:6px;opacity:.9}
  #lp-publish .lp-pub-meta{opacity:.75;margin-bottom:6px}
  #lp-publish .lp-pub-err{color:var(--vscode-errorForeground,#D9484B)}
  #lp-publish .lp-pub-url{margin-bottom:6px;word-break:break-all}
  #lp-publish .lp-pub-cost{opacity:.65;margin-bottom:8px;font-style:italic}
  #lp-publish .lp-pub-warn{color:var(--vscode-charts-yellow,#E5C07B);margin-bottom:6px}
  #lp-publish .lp-pub-ok{color:var(--vscode-charts-green,#4EC97A);word-break:break-all}
  #lp-publish .lp-pub-sec{margin-top:8px;padding-top:8px;border-top:1px solid var(--vscode-widget-border)}
  #lp-publish .lp-pub-files-hdr{font-weight:600;margin-bottom:4px}
  #lp-publish .lp-pub-files{max-height:120px;overflow:auto;margin-bottom:6px}
  #lp-publish .lp-pub-file{opacity:.85;word-break:break-all;margin:1px 0}
  #lp-publish .lp-pub-msg{width:100%;box-sizing:border-box;margin-bottom:6px;font-family:inherit;font-size:11.5px;resize:vertical}
  #lp-publish .lp-pub-danger{color:var(--vscode-errorForeground,#D9484B);border-color:var(--vscode-errorForeground,#D9484B)}
  #lp-publish .lp-pub-gate{margin-top:8px;padding:8px;border:1px dashed var(--vscode-errorForeground,#D9484B);border-radius:6px}
  #lp-publish .lp-pub-gate-input{width:100%;box-sizing:border-box;margin:6px 0;font-family:inherit;font-size:11.5px}
  #lp-toolbar{display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid var(--vscode-widget-border);background:var(--vscode-editorWidget-background);flex-wrap:wrap}
  .lp-status{flex:1 1 auto;min-width:120px;display:flex;align-items:center;gap:7px;font-size:12px;overflow:hidden}
  .lp-status .lps-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  /* F0.5.3 — readiness semaphore: a compact row of honest lights + 1-click fixes. */
  .lp-ready{display:none;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:11px;padding:4px 2px 2px;color:var(--vscode-descriptionForeground)}
  .lp-ready .lp-rl{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
  .lp-ready .lp-rfix{font:10.5px var(--vscode-font-family);color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;border-radius:5px;padding:1px 7px;cursor:pointer}
  .lp-ready .lp-rfix:hover{background:var(--vscode-button-hoverBackground)}
  /* F3 (W1) — the anchor chip: the pinned element, always visible next to the select button
     (persistent) and at the top of the one-box (per-pin). Honest 'sem seleção' state when unpinned.
     Badge bg/fg only → guaranteed contrast in light AND dark; opacity/weight signal the pinned state. */
  .lp-anchor{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:1.4;padding:2px 9px;border-radius:999px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);white-space:nowrap;max-width:230px;overflow:hidden;text-overflow:ellipsis;opacity:.65}
  .lp-anchor.on{opacity:1;font-weight:600}
  .lp-anchor-in{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;margin:0 0 6px;border-radius:999px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  /* D1 — the controls must WRAP, not overflow. #lp-controls was flex:none (one indivisible row that
     burst its container at 1024/821px, worsened by the 🛡 Review / 🚀 Publish labels). Now it wraps and
     shrinks; #lp-url flexes to fill its row. */
  #lp-controls{display:flex;flex-wrap:wrap;gap:5px;align-items:center;flex:1 1 auto;min-width:0}
  #lp-url{flex:1 1 160px;min-width:120px;max-width:100%;font:12px var(--vscode-font-family);color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-widget-border));border-radius:5px;padding:3px 7px}
  #lp-controls button{font:12px var(--vscode-font-family);color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:5px;padding:3px 9px;cursor:pointer}
  #lp-controls button:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}
  /* F0.3/F0.4 — the primary actions carry a VISIBLE text label (not just a tooltip): a touch of weight, never wrap. */
  #lp-controls .lp-labeled{white-space:nowrap;font-weight:600}
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
  /* F0.2 — per-node history block inside the selection panel */
  #lp-sel .lp-nh{margin-top:8px;font-size:11px;border:1px solid var(--vscode-widget-border);border-radius:6px;padding:6px 8px}
  #lp-sel .lp-nh-hd{font-weight:600;opacity:.85;margin-bottom:4px}
  #lp-sel .lp-nh-row{display:flex;gap:8px;align-items:center;padding:2px 0;opacity:.9}
  #lp-sel .lp-nh-t{opacity:.7;font-variant-numeric:tabular-nums}
  #lp-sel .lp-nh-v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #lp-sel .lp-nh-b{font-size:10px;padding:1px 5px;border-radius:4px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
  #lp-sel .lp-nh-b.lp-nh-hist{background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-widget-border)}
  .lpfd-row-hist{opacity:.72}
  .lpfd-st.lpfd-hist{color:var(--vscode-descriptionForeground)}
  .lpfd-node{font-family:var(--vscode-editor-font-family,monospace);opacity:.75;font-size:10.5px}
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
  #lp-sel .lp-diff-hk{opacity:.6}
  /* LP-4.5 — one-box hint (the heuristic SUGGESTS the local chip) + agent result blocks. */
  #lp-sel .lp-hint{font-size:10.5px;margin-top:4px;color:var(--vscode-charts-green,#4CAF6A);line-height:1.4}
  #lp-sel .lp-task-txt{font-size:12px;line-height:1.55;word-break:break-word;margin:4px 0 6px}
  #lp-sel .lp-task-txt code{background:var(--vscode-textCodeBlock-background,var(--vscode-input-background));padding:1px 5px;border-radius:4px;font-family:var(--vscode-editor-font-family,monospace);font-size:10.5px}
  #lp-sel .lp-md-ul{margin:3px 0 3px 16px;padding:0}
  #lp-sel .lp-md-h{font-weight:700;margin:6px 0 2px}
  #lp-sel .lp-md-sp{height:5px}
  #lp-sel .lp-task-st{font-size:10.5px;opacity:.9;margin-left:6px}
  #lp-sel .lp-task-reads{font-size:10.5px;opacity:.8;margin:4px 0;line-height:1.6}
  #lp-sel .lp-task-reads code{background:var(--vscode-textCodeBlock-background,var(--vscode-input-background));padding:1px 5px;border-radius:4px;font-family:var(--vscode-editor-font-family,monospace);font-size:10px}
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
  /* LP-4.8 §1 — in-canvas toolbar, floating over the frame anchored to the pin. The overlay
     spans the frame but is click-through (pointer-events:none); only .lp-ctb catches events. */
  .lp-ctb-ov{position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden}
  .lp-ctb{position:absolute;left:8px;top:8px;pointer-events:auto;box-sizing:border-box;width:max-content;min-width:min(248px,calc(100% - 16px));max-width:min(360px,calc(100% - 16px));max-height:calc(100% - 16px);overflow:auto;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,.34);padding:0 11px 9px}
  /* LP-4.9 §7 — toolbar header: grip (drag) + minimize + close. Sticky so it stays while scrolling. */
  .lp-ctb-hd{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:6px;margin:0 -11px 6px;padding:5px 9px;background:var(--vscode-editorWidget-background);border-bottom:1px solid var(--vscode-widget-border);border-radius:9px 9px 0 0}
  .lp-ctb-grip{flex:1 1 auto;font-size:10.5px;opacity:.6;cursor:grab;user-select:none;letter-spacing:.04em;touch-action:none}
  .lp-ctb-grip:active{cursor:grabbing}
  .lp-ctb-btn{flex:none;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;font:13px var(--vscode-font-family);color:var(--vscode-foreground);background:transparent;border:1px solid transparent;border-radius:6px;cursor:pointer;line-height:1}
  .lp-ctb-btn:hover{background:var(--vscode-list-hoverBackground);border-color:var(--vscode-widget-border)}
  .lp-ctb-btn:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  .lp-ctb-chip{position:absolute;left:8px;top:8px;pointer-events:auto;width:34px;height:34px;display:none;align-items:center;justify-content:center;font-size:17px;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:50%;box-shadow:0 6px 20px rgba(0,0,0,.32);cursor:pointer}
  .lp-ctb-chip:hover{border-color:var(--vscode-focusBorder)}
  .lp-ctb-chip:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}
  /* §4 — a run stays visible even when minimized: the chip pulses while a task is active. */
  .lp-ctb-chip.lp-chip-working{animation:lpChipPulse 1s ease-in-out infinite;border-color:var(--vscode-charts-blue,#5A9BD4)}
  @keyframes lpChipPulse{0%,100%{box-shadow:0 6px 20px rgba(0,0,0,.32)}50%{box-shadow:0 0 0 4px rgba(90,155,212,.5),0 6px 20px rgba(0,0,0,.32)}}
  @media (prefers-reduced-motion:reduce){.lp-ctb-chip.lp-chip-working{animation:none;border-color:var(--vscode-charts-blue,#5A9BD4)}}
  /* LP-4.9 §3 — real-time feedback toast (anchored to the node, auto-dismissed). */
  .lp-ctb-toast{position:absolute;left:8px;top:8px;pointer-events:none;max-width:min(320px,calc(100% - 16px));font:11.5px var(--vscode-font-family);font-weight:600;padding:6px 11px;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.34);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .lp-toast-ok{background:var(--vscode-charts-green,#4CAF6A);color:#08130C}
  .lp-toast-ask{background:var(--vscode-charts-blue,#5A9BD4);color:#071018}
  .lp-toast-warn{background:var(--vscode-inputValidation-warningBackground,#E5C07B);color:#1A1305;border:1px solid var(--vscode-inputValidation-warningBorder,rgba(229,192,123,.6))}
  .lp-toast-in{animation:lpToastIn .18s ease}
  @keyframes lpToastIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  /* LP-4.9 §8 — live progress: the 🐮 spins while the moo/agent works, with an honest tier + cancel. */
  .lp-progress{position:sticky;bottom:0;display:flex;align-items:center;gap:8px;margin:8px -11px 0;padding:7px 11px;background:var(--vscode-editorWidget-background);border-top:1px solid var(--vscode-widget-border);font-size:11.5px}
  .lp-spin{display:inline-block;animation:lpSpin 1.1s linear infinite;font-size:14px}
  @keyframes lpSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.lp-spin{animation:none}}
  .lp-progress-txt{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.9}
  .lp-progress-x{flex:none;min-height:24px}
  /* LP-4.9 §4 — first-run coach marks (dismissible, never repeats). */
  .lp-coach{position:absolute;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.28);pointer-events:auto}
  .lp-coach-card{max-width:min(340px,calc(100% - 32px));background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:11px;box-shadow:0 12px 36px rgba(0,0,0,.42);padding:16px 18px}
  .lp-coach-t{font-weight:700;font-size:13px;margin-bottom:6px}
  .lp-coach-d{font-size:12px;line-height:1.5;opacity:.9}
  .lp-coach-nav{display:flex;align-items:center;gap:10px;margin-top:14px}
  .lp-coach-dots{flex:1 1 auto;display:flex;gap:5px;justify-content:center}
  .lp-coach-dot{width:6px;height:6px;border-radius:50%;background:var(--vscode-widget-border)}
  .lp-coach-dot.on{background:var(--vscode-charts-red,#E8888A)}
  .lp-coach-btn{flex:none;min-height:28px;font:12px var(--vscode-font-family);font-weight:700;color:#0B0A09;background:var(--vscode-charts-red,#E8888A);border:0;border-radius:7px;padding:5px 14px;cursor:pointer}
  .lp-coach-btn2{flex:none;min-height:28px;font:11.5px var(--vscode-font-family);color:var(--vscode-descriptionForeground);background:transparent;border:1px solid var(--vscode-widget-border);border-radius:7px;padding:4px 10px;cursor:pointer}
  .lp-coach-btn:focus-visible,.lp-coach-btn2:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:2px}
  /* LP-4.9 §6 — WCAG 2.2 AA sweep. Target size ≥24px (§2.5.8) on every in-canvas control, and
     focus never obscured (§2.4.11): scroll-padding keeps a focused control clear of the sticky
     header/progress bars when the toolbar scrolls. Focus rings come from each control's rule. */
  .lp-ctb{scroll-padding-top:40px;scroll-padding-bottom:44px}
  .lp-ctb .lp-sel-btn{min-height:24px}
  .lp-ctb .lp-tier{min-height:24px;display:inline-flex;align-items:center}
  .lp-ctb .lp-ref-x{min-width:24px;min-height:24px;display:inline-flex;align-items:center;justify-content:center;padding:0}
  .lp-ctb .lp-ref-clr{min-height:24px}
  .lp-ctb .lp-sk-item{min-height:24px}
  .lp-ctb .lp-ed-in{min-height:24px}
  #lp-sel .lp-crumb{min-height:24px;display:inline-flex;align-items:center}
  .lp-ctb .lp-ed-l{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;opacity:.7;margin:9px 0 3px}
  .lp-ctb .lp-ed-row{display:flex;gap:6px;align-items:center}
  .lp-ctb .lp-ed-in{flex:1 1 auto;min-width:60px;font:12px var(--vscode-font-family);color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-widget-border));border-radius:5px;padding:3px 7px}
  .lp-ctb .lp-sel-btn{font:11.5px var(--vscode-font-family);color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:5px;padding:3px 9px;cursor:pointer}
  .lp-ctb .lp-sel-btn:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}
  .lp-ctb .lp-sel-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;align-items:center}
  .lp-ctb .lp-hint{font-size:10.5px;margin-top:4px;color:var(--vscode-charts-green,#4CAF6A);line-height:1.4}
  .lp-ctb .lp-chip{margin:2px 0;padding:7px 9px;border:1px solid var(--vscode-widget-border);border-radius:7px;background:var(--vscode-input-background)}
  .lp-ctb .lp-chip-hd{font-size:11.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .lp-ctb .lp-chip-0{color:var(--vscode-charts-green,#4CAF6A);font-weight:700}
  .lp-ctb .lp-tiers{display:flex;gap:4px;flex-wrap:wrap;margin-top:7px}
  .lp-ctb .lp-tier{font:10.5px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:999px;padding:2px 9px;cursor:pointer}
  .lp-ctb .lp-tier.on{background:var(--vscode-charts-red,#E8888A);color:#0B0A09;border-color:transparent;font-weight:700}
  .lp-ctb .lp-chip-note{font-size:10.5px;opacity:.78;margin-top:6px;line-height:1.45}
  .lp-ctb .lp-ed-in:focus-visible,.lp-ctb .lp-sel-btn:focus-visible,.lp-ctb .lp-tier:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  /* LP-4.8 §2 — deterministic preset bar: colour swatches + size/spacing chips, 1-click, $0. */
  .lp-ctb .lp-pz{margin:6px 0 2px}
  .lp-pz-l{font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.62;margin:7px 0 3px}
  .lp-pz-row{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
  .lp-sw{width:24px;height:24px;padding:0;border:1px solid var(--vscode-widget-border);border-radius:50%;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
  .lp-sw:hover{border-color:var(--vscode-focusBorder);transform:scale(1.12)}
  .lp-sw-dot{width:17px;height:17px;border-radius:50%;display:block}
  .lp-pz-chip{font:10.5px var(--vscode-editor-font-family,monospace);color:var(--vscode-foreground);background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:5px;padding:4px 9px;min-height:24px;cursor:pointer}
  /* LP-4.9 §5 — presets as the star: the top of the simple view, breathing room, "$0" cue. */
  .lp-ctb .lp-pz-star{margin:2px 0 8px;padding:2px 0 8px;border-bottom:1px solid var(--vscode-widget-border)}
  .lp-pz-star .lp-pz-l:first-child{margin-top:0}
  .lp-pz-chip:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}
  .lp-sw:focus-visible,.lp-pz-chip:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  /* LP-4.8 §3 — /skills dropdown: each item surfaces its tier (honest routing). */
  .lp-ctb .lp-sk{position:relative;margin-top:8px}
  .lp-ctb .lp-sk-active{font-size:10px;opacity:.8;margin-top:4px;min-height:12px;color:var(--vscode-charts-green,#4CAF6A)}
  .lp-sk-menu{position:absolute;left:0;top:calc(100% + 4px);z-index:8;min-width:230px;max-width:320px;max-height:230px;overflow:auto;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.34);padding:4px}
  .lp-sk-item{display:grid;grid-template-columns:auto 1fr auto;gap:6px 8px;align-items:center;width:100%;text-align:left;background:transparent;border:0;border-radius:6px;padding:6px 8px;cursor:pointer;color:var(--vscode-foreground)}
  .lp-sk-item:hover,.lp-sk-item:focus-visible{background:var(--vscode-list-hoverBackground);outline:none}
  .lp-sk-item:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:-1px}
  .lp-sk-g{font-size:14px;grid-row:1}
  .lp-sk-lb{font-weight:700;font-size:12px;grid-row:1}
  .lp-sk-tier{grid-row:1;font-size:9.5px;padding:1px 7px;border-radius:999px;white-space:nowrap;border:1px solid var(--vscode-widget-border)}
  .lp-sk-tier-local{color:var(--vscode-charts-green,#4CAF6A)}
  .lp-sk-tier-auto{color:var(--vscode-charts-blue,#5A9BD4)}
  .lp-sk-hint{grid-column:1 / -1;grid-row:2;font-size:10px;opacity:.72;line-height:1.35}
  /* LP-4.8 §4 — attached-reference chips (Cmd/Ctrl-click) — context for the agent prompt. */
  .lp-ctb .lp-refs{margin:7px 0 2px}
  .lp-refs-hd{font-size:10px;opacity:.72;display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px}
  .lp-ref-clr{font:9.5px var(--vscode-font-family);color:var(--vscode-foreground);background:transparent;border:1px solid var(--vscode-widget-border);border-radius:5px;padding:0 6px;cursor:pointer}
  .lp-ref-clr:hover{background:var(--vscode-list-hoverBackground)}
  .lp-refs-list{display:flex;gap:4px;flex-wrap:wrap}
  .lp-ref{display:inline-flex;align-items:center;gap:4px;font:10px var(--vscode-editor-font-family,monospace);color:var(--vscode-foreground);background:rgba(127,184,138,0.12);border:1px solid rgba(127,184,138,0.5);border-radius:999px;padding:1px 4px 1px 8px}
  .lp-ref-x{font-size:9px;line-height:1;color:var(--vscode-foreground);background:transparent;border:0;border-radius:50%;padding:2px 4px;cursor:pointer;opacity:.7}
  .lp-ref-x:hover{opacity:1;background:var(--vscode-list-hoverBackground)}
  .lp-refs-note{font-size:9.5px;opacity:.7;margin-top:4px;line-height:1.35}
  .lp-ref-clr:focus-visible,.lp-ref-x:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  /* LP-4.9 §1 — the explicit Edit/Ask intent toggle (segmented control). */
  .lp-ctb .lp-mode-tg{display:inline-flex;margin:8px 0 3px;border:1px solid var(--vscode-widget-border);border-radius:7px;overflow:hidden}
  .lp-mtg{font:11.5px var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-input-background);border:0;padding:5px 12px;min-height:26px;cursor:pointer}
  .lp-mtg+.lp-mtg{border-left:1px solid var(--vscode-widget-border)}
  .lp-mtg.on{background:var(--vscode-charts-red,#E8888A);color:#0B0A09;font-weight:700}
  .lp-mtg:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:-2px}
  .lp-ctb .lp-mode-hint{font-size:10px;opacity:.72;margin:1px 0 5px;line-height:1.4}
  /* LP-4.9 loop-fix §C — the project-context/route line (always visible in the simple view). */
  .lp-ctx{font-size:10.5px;line-height:1.4;margin:4px 0 2px;padding:5px 8px;border-radius:6px}
  /* W2 — honest context-source chip (repo ✓ · Notion n/d). Badge bg/fg → contrast in both themes. */
  .lp-ctx-src{align-items:center;gap:4px;font-size:10px;margin:0 0 4px;padding:2px 8px;border-radius:999px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);white-space:nowrap}
  .lp-ctx-ok{color:var(--vscode-charts-green,#4CAF6A);background:rgba(76,175,106,.10);border:1px solid rgba(76,175,106,.35)}
  .lp-ctx-warn{color:var(--vscode-inputValidation-warningForeground,var(--vscode-charts-yellow,#E5C07B));background:var(--vscode-inputValidation-warningBackground,rgba(229,192,123,.12));border:1px solid var(--vscode-inputValidation-warningBorder,rgba(229,192,123,.4))}
  /* LP-4.9 §2 — progressive disclosure: the "▾ mais" chevron + the advanced drawer. */
  .lp-more{display:block;width:100%;margin:8px 0 2px;font:11px var(--vscode-font-family);color:var(--vscode-descriptionForeground);background:transparent;border:1px dashed var(--vscode-widget-border);border-radius:6px;padding:5px 8px;min-height:26px;cursor:pointer;text-align:center}
  .lp-more:hover{background:var(--vscode-list-hoverBackground);color:var(--vscode-foreground)}
  .lp-more:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
  .lp-adv{margin-top:6px;padding-top:8px;border-top:1px solid var(--vscode-widget-border)}
  /* LP-4.5 §6 — device toggle: ONLY the iframe width changes (dev preview, zero deps). */
  #lp-framewrap.lp-dev-narrow{background:var(--vscode-editorWidget-background)}
  #lp-framewrap.lp-dev-narrow #lp-frame{margin:0 auto;border-left:1px solid var(--vscode-widget-border);border-right:1px solid var(--vscode-widget-border)}
  .lp-dev-btn[aria-pressed="true"]{background:var(--vscode-charts-blue,#5A9BD4)!important;color:#0B0A09!important;border-color:transparent!important;font-weight:700}
  .lp-dev-note{font-size:11px;color:var(--vscode-inputValidation-warningForeground,var(--vscode-charts-yellow,#E5C07B));white-space:normal}
  .lp-degrade{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:var(--vscode-descriptionForeground)}
  .lp-degrade-in{max-width:440px}
  .lp-degrade-ico{font-size:34px;margin-bottom:8px;opacity:.85}
  .lp-degrade-t{font-weight:700;color:var(--vscode-foreground);margin-bottom:6px}
  .lp-degrade-r{font-size:12.5px;margin-bottom:10px}
  .lp-degrade-h{font-size:11.5px;opacity:.85;line-height:1.5}
  .lp-degrade-h code{background:var(--vscode-textCodeBlock-background,var(--vscode-input-background));padding:1px 5px;border-radius:4px}
  /* F0.5.1 — the honest empty-window action: ONE prominent primary button. */
  .lp-open-folder{font:13px var(--vscode-font-family);font-weight:600;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;border-radius:6px;padding:8px 16px;cursor:pointer;margin-top:4px}
  .lp-open-folder:hover{background:var(--vscode-button-hoverBackground)}
  .lps-dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block;background:var(--vscode-descriptionForeground)}
  .lps-on{background:var(--vscode-charts-green,#4CAF6A)}
  .lps-off{background:var(--vscode-descriptionForeground)}
  .lps-stale{background:var(--vscode-charts-yellow,#E5C07B)}
  .lps-wait{background:var(--vscode-charts-blue,#5A9BD4)}
  #lp-error{flex-basis:100%;order:9;color:var(--vscode-inputValidation-errorForeground,var(--vscode-errorForeground,#D9484B));font-size:11.5px;padding:1px 2px}
  #lp-hmr{flex-basis:100%;order:10;font-size:11.5px;padding:2px 7px;margin-top:2px;border-radius:5px;color:var(--vscode-inputValidation-warningForeground,var(--vscode-charts-yellow,#E5C07B));background:var(--vscode-inputValidation-warningBackground,rgba(229,192,123,.12));border:1px solid var(--vscode-inputValidation-warningBorder,rgba(229,192,123,.4))}
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
  #lp-brain,#lp-dc{--t0:var(--vscode-charts-green,#4CAF6A);--t1:var(--vscode-charts-blue,#5A9BD4);--t2:var(--vscode-charts-purple,#A78BFA);--t3:var(--vscode-charts-red,#D46A5A);--t5:var(--vscode-charts-yellow,#C9A227)}
  .lp-meo-hd{margin:2px 0 6px}
  .lp-meo-t{font-weight:700;font-size:12px;color:var(--vscode-foreground,#e6e6e6)}
  .lp-meo-sub{font-size:11px;color:var(--vscode-descriptionForeground,#9a9a9a)}
  .lp-lens-hd{font-size:11px;font-weight:700;color:var(--vscode-descriptionForeground,#9a9a9a);margin:0 0 4px}
  /* LP-4.5 §4 — the unified session feed (one row per Live Edit write, per-item revert). */
  .lpfd{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:10px 12px;margin-bottom:10px}
  .lpfd-hd{font-weight:700;margin-bottom:4px}
  .lpfd-nd{color:var(--vscode-descriptionForeground);font-style:italic;font-size:11.5px}
  .lpfd-list{max-height:26vh;overflow:auto}
  .lpfd-row{display:flex;gap:7px;align-items:baseline;padding:3px 0;border-top:1px solid var(--vscode-widget-border);font-size:11.5px;flex-wrap:wrap}
  .lpfd-time{opacity:.6;font-variant-numeric:tabular-nums;flex:none}
  .lpfd-via{flex:none;font-size:10px;padding:1px 7px;border-radius:999px;background:var(--vscode-input-background);border:1px solid var(--vscode-widget-border)}
  .lpfd-files{flex:1 1 auto;min-width:80px;font-family:var(--vscode-editor-font-family,monospace);font-size:10.5px;word-break:break-all;opacity:.9}
  .lpfd-st{flex:none;font-size:10.5px;opacity:.9}
  .lpfd-why{flex-basis:100%;font-size:10.5px;color:var(--vscode-inputValidation-warningForeground,var(--vscode-charts-yellow,#E5C07B))}
  .lpfd-rv{flex:none;font:10.5px var(--vscode-font-family);color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));border:1px solid var(--vscode-widget-border);border-radius:5px;padding:1px 8px;cursor:pointer}
  .lpfd-rv:hover{background:var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground))}
  .lpfd-rv:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:1px}
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
  .lp-tabs{display:flex;gap:4px;margin:6px 0 4px;flex-wrap:wrap}
  .lp-tab{font:inherit;font-size:11px;padding:3px 10px;min-height:24px;border:1px solid var(--vscode-panel-border,#3a3a3a);border-radius:11px;background:transparent;color:var(--vscode-descriptionForeground,#9a9a9a);cursor:pointer}
  .lp-tab.on{background:var(--vscode-button-secondaryBackground,#33373d);color:var(--vscode-foreground,#e6e6e6);border-color:var(--vscode-focusBorder,#4a7fb5)}
  .lp-tab:focus-visible{outline:2px solid var(--vscode-focusBorder,#4a7fb5);outline-offset:1px}
  .lpx{font-size:11px}
  .lpx-hero{display:flex;align-items:baseline;gap:6px;margin:6px 0}
  .lpx-hero-n{font-size:20px;font-weight:600;color:var(--vscode-foreground,#e6e6e6)}
  .lpx-hero-l{font-size:11px;color:var(--vscode-descriptionForeground,#9a9a9a)}
  .lpx-tbl{display:flex;flex-direction:column;gap:2px;margin-top:4px}
  .lpx-tr{display:flex;gap:8px;align-items:center;padding:2px 0;border-bottom:1px solid var(--vscode-panel-border,#2a2a2a)}
  .lpx-tr:first-child{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--vscode-descriptionForeground,#8a8a8a)}
  .lpx-cell{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:4px}
  .lpx-cell .lpbr-mix{min-width:40px;flex:1}
  .lpx-chip{display:inline-block;font-size:10px;padding:0 6px;border-radius:8px;background:var(--vscode-badge-background,#4d4d4d);color:var(--vscode-badge-foreground,#fff);line-height:16px}
  .lpx-foot{margin-top:6px;font-size:10px;color:var(--vscode-descriptionForeground,#8a8a8a)}
  .lpx-lane{padding:4px 0;border-bottom:1px solid var(--vscode-panel-border,#2a2a2a)}
  .lpx-lane-hd{font-weight:600;color:var(--vscode-foreground,#e6e6e6)}
  .lpx-lane-meta{font-size:10px;color:var(--vscode-descriptionForeground,#9a9a9a)}
  @keyframes lpworkpulse{0%,100%{opacity:1}50%{opacity:.4}}
  .lp-work{display:flex;align-items:center;gap:6px;margin:2px 0 6px;font-size:11px;color:var(--vscode-descriptionForeground,#9a9a9a)}
  .lp-work .lpw-cow{font-size:13px;line-height:1}
  .lp-work.working{color:var(--vscode-foreground,#e6e6e6)}
  .lp-work.working .lpw-cow{animation:lpworkpulse 1.6s ease-in-out infinite}
  .lp-work.done{color:var(--vscode-testing-iconPassed,#4CAF6A)}
  .lp-work.stale{color:var(--vscode-editorWarning-foreground,#cca700)}
    .lp-jrnl{margin:0 0 6px;padding:6px 8px;border-radius:6px;background:var(--vscode-textBlockQuote-background,#26292e);border-left:2px solid var(--vscode-charts-green,#4CAF6A)}
    .lp-jrnl-nd{color:var(--vscode-descriptionForeground,#8a8a8a);font-size:11px;border-left-color:var(--vscode-panel-border,#3a3a3a);background:transparent}
    .lp-jrnl-hd{font-size:10px;color:var(--vscode-descriptionForeground,#9a9a9a);margin-bottom:3px}
    .lp-jrnl-tx{font-size:11px;color:var(--vscode-foreground,#e0e0e0);white-space:pre-wrap;max-height:96px;overflow:auto}
  @media (max-width:820px){
    #lp-root{flex-direction:column}
    #lp-stagewrap{flex:1 1 auto;border-right:0;border-bottom:1px solid var(--vscode-widget-border)}
    #lp-side{flex:0 0 auto;max-width:none;max-height:42vh}
  }
  /* D1 — at narrow widths the URL takes its own full row and the controls stay wrapped (no overflow). */
  @media (max-width:560px){
    #lp-controls{width:100%}
    #lp-url{flex-basis:100%}
    #lp-status{width:100%}
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
        <span id="lp-anchor" class="lp-anchor" role="status" aria-live="polite" title="O elemento fixado — o alvo do prompt. Sem âncora, nenhum prompt é enviado.">📍 sem seleção</span>
        <button id="lp-dev-390" class="lp-dev-btn" title="Preview a 390px (telemóvel) — só muda a largura do iframe" aria-label="Preview mobile 390px" aria-pressed="false">📱390</button>
        <button id="lp-dev-768" class="lp-dev-btn" title="Preview a 768px (tablet) — só muda a largura do iframe" aria-label="Preview tablet 768px" aria-pressed="false">📱768</button>
        <button id="lp-dev-full" class="lp-dev-btn" title="Largura total" aria-label="Preview em largura total" aria-pressed="true">💻</button>
        <!-- D1 — honest effective-width note: a preset caps at 100% of the panel, so 768px can deliver less. -->
        <span id="lp-dev-note" class="lp-dev-note" role="status" aria-live="polite" style="display:none"></span>
        <select id="lp-routes" title="Rotas conhecidas do site" aria-label="Ir para uma rota do site"></select>
        <button id="lp-auto" title="Voltar à deteção automática do dev server">Auto</button>
        <button id="lp-redetect" title="Re-detetar o dev server" aria-label="Re-detetar">↻</button>
        <!-- LP-5 §C — global action (not per-pin): local $0 static review (secret-scan, npm audit, CSP, XSS heuristic). -->
        <button id="lp-security-btn" class="lp-labeled" title="Review de segurança local — secret-scan, npm audit, CSP e XSS estático ($0, nunca sai da máquina; não substitui auditoria humana)" aria-label="Review de segurança">🛡 Review</button>
        <!-- LP-6 §E — Publish: commit+push seletivo, depois deploy Vercel gated por 2º fator (host-side). -->
        <button id="lp-publish-btn" class="lp-labeled" title="Publicar — commit + push seletivo, depois deploy Vercel (irreversível, exige confirmar o nome do projeto)" aria-label="Publicar">🚀 Publish</button>
      </div>
      <div id="lp-error" role="alert" style="display:none"></div>
      <!-- F2 (P1-7) — honest hot-reload-down banner: when the tap's HMR socket drops, the preview may be STALE. -->
      <div id="lp-hmr" role="status" aria-live="polite" style="display:none"></div>
      <!-- F0.5.3 — readiness semaphore: 4 honest lights (pasta · dev server · árvore · agente) + 1-click fixes. -->
      <div id="lp-ready" class="lp-ready" role="status" aria-label="Prontidão do Live Preview" style="display:none"></div>
    </div>
    <div id="lp-diag" role="log" aria-label="Diagnóstico do preview (erros de runtime e build)"></div>
    <div id="lp-framewrap">
      <iframe id="lp-frame" title="Mooter App Stage — pré-visualização do dev server local" style="display:none"></iframe>
      <div id="lp-degrade" class="lp-degrade"></div>
      <!-- LP-4.8 §1 — the in-canvas toolbar. It lives in the TRUSTED webview (never in the
           cross-origin site), floating over the frame anchored to the pin: the site's CSS/JS
           cannot reach it (adversarial L1). The overlay is pointer-events:none so clicks pass
           through to the iframe for continued hover/select; ONLY the toolbar itself is clickable. -->
      <div id="lp-ctb-ov" class="lp-ctb-ov">
        <div id="lp-ctb" class="lp-ctb" role="toolbar" aria-label="Editar o elemento selecionado" aria-hidden="true" style="display:none">
          <!-- LP-4.9 §7 — header: drag handle (grip) + minimize + close (X). The grip is the drag
               affordance; the automatic flip-positioning is the no-drag alternative (WCAG 2.5.7). -->
          <div id="lp-ctb-hd" class="lp-ctb-hd">
            <span id="lp-ctb-grip" class="lp-ctb-grip" title="Arrastar (ou deixa o posicionamento automático)">⠿ mover</span>
            <button type="button" id="lp-ctb-help" class="lp-ctb-btn" title="Como funciona (ajuda)" aria-label="Abrir a ajuda">?</button>
            <button type="button" id="lp-ctb-min" class="lp-ctb-btn" title="Minimizar" aria-label="Minimizar a toolbar">—</button>
            <button type="button" id="lp-ctb-x" class="lp-ctb-btn" title="Fechar (Esc)" aria-label="Fechar a toolbar">✕</button>
          </div>
          <div id="lp-ctb-body"></div>
          <!-- LP-4.9 §8 — live progress: 🐮 spinner + honest tier text + cancel (agent runs). -->
          <div id="lp-progress" class="lp-progress" role="status" aria-live="polite" style="display:none">
            <span class="lp-spin" aria-hidden="true">🐮</span>
            <span id="lp-progress-txt" class="lp-progress-txt">a pensar…</span>
            <button type="button" id="lp-progress-cancel" class="lp-sel-btn lp-progress-x" title="Cancelar a tarefa" style="display:none">cancelar</button>
          </div>
        </div>
        <!-- Minimized state: a single 🐮 chip that re-expands on click. -->
        <button type="button" id="lp-ctb-chip" class="lp-ctb-chip" style="display:none" title="Reabrir a toolbar" aria-label="Reabrir a toolbar de edição">🐮</button>
        <!-- LP-4.9 §3 — real-time feedback toast, anchored to the node. Announced politely to a11y. -->
        <div id="lp-ctb-toast" class="lp-ctb-toast" role="status" aria-live="polite" style="display:none"></div>
      </div>
      <!-- LP-4.9 §4 — first-run coach marks (3 steps, dismissible, never repeats). Also re-openable
           from the "?" in the toolbar header (WCAG 2.2 §3.2.6 consistent help). -->
      <div id="lp-coach" class="lp-coach" role="dialog" aria-modal="true" aria-label="Como usar o Live Edit" aria-describedby="lp-coach-body" style="display:none">
        <div class="lp-coach-card">
          <div id="lp-coach-body" class="lp-coach-body"></div>
          <div class="lp-coach-nav">
            <button type="button" id="lp-coach-skip" class="lp-coach-btn2">não mostrar</button>
            <span id="lp-coach-dots" class="lp-coach-dots" aria-hidden="true"></span>
            <button type="button" id="lp-coach-next" class="lp-coach-btn">seguinte</button>
          </div>
        </div>
      </div>
    </div>
  </section>
  <aside id="lp-side">
    <!-- LP-5 §C — 🛡 Review Security mounts here; hidden until the first scan. -->
    <div id="lp-security" role="region" aria-label="Review de segurança" style="display:none"></div>
    <!-- LP-6 §E — 🚀 Publish popover mounts here; hidden until the button is clicked. -->
    <div id="lp-publish" role="region" aria-label="Publicar" style="display:none"></div>
    <div id="lp-sel" role="region" aria-label="Elemento selecionado" style="display:none"></div>
    <div id="lp-feed" role="region" aria-label="Mudanças desta sessão de preview"></div>
    <div id="lp-brain">a carregar…</div>
    <div id="lp-dc">
      <div id="lp-meo-hd" class="lp-meo-hd"><div class="lp-meo-t">🐮 MEO — Moo Executive Officer</div><div class="lp-meo-sub">o teu cockpit executivo · dados reais, custos ~est.</div></div>
      <div id="lp-work-mount"></div>
      <div id="lp-tabs" role="tablist" aria-label="Lentes do MEO">
        <button type="button" class="lp-tab on" role="tab" id="lp-tab-stream" aria-selected="true" aria-controls="lp-pane-stream" data-tab="stream" tabindex="0">Stream</button>
        <button type="button" class="lp-tab" role="tab" id="lp-tab-day" aria-selected="false" aria-controls="lp-pane-day" data-tab="day" tabindex="-1">Dia</button>
        <button type="button" class="lp-tab" role="tab" id="lp-tab-model" aria-selected="false" aria-controls="lp-pane-model" data-tab="model" tabindex="-1">LLM</button>
        <button type="button" class="lp-tab" role="tab" id="lp-tab-fleet" aria-selected="false" aria-controls="lp-pane-fleet" data-tab="fleet" tabindex="-1">Fleet</button>
      </div>
      <div id="lp-pane-stream" role="tabpanel" aria-labelledby="lp-tab-stream"></div>
      <div id="lp-pane-day" role="tabpanel" aria-labelledby="lp-tab-day" hidden></div>
      <div id="lp-pane-model" role="tabpanel" aria-labelledby="lp-tab-model" hidden></div>
      <div id="lp-pane-fleet" role="tabpanel" aria-labelledby="lp-tab-fleet" hidden></div>
    </div>
  </aside>
</div>
<script nonce="${nonce}">
const vsapi=acquireVsCodeApi();
let lpPublishState=null; // LP-6 §E — last lp-publish-status-result / lp-publish-result payload
const HOST_TOKEN=${hostToken};
function esc(x){return String(x==null?'':x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
const renderDirectorsCut=${renderDirectorsCutSrc};
const renderBrain=${renderBrainSrc};
const renderStageStatus=${renderStageStatusSrc};
const renderErrorStrip=${renderErrorStripSrc};
const isLivePreviewSelfNoise=${isSelfNoiseSrc};
const isBenignCssWarning=${isBenignCssSrc};
const renderDayBreakdown=${renderDayBreakdownSrc};
const renderModelBreakdown=${renderModelBreakdownSrc};
const renderFleetLanes=${renderFleetLanesSrc};
const renderWorkPill=${renderWorkPillSrc};
const renderJournalCard=${renderJournalCardSrc};
const suggestLocalChip=${suggestLocalChipSrc};
const renderMarkdownSafe=${renderMarkdownSafeSrc};
const renderEditsFeed=${renderEditsFeedSrc};
const mergeClass=${mergeClassSrc};
const renderPresetsBarHTML=${renderPresetsBarHTMLSrc};
const renderSecurityFindings=${renderSecurityFindingsSrc};
const renderPublishPopover=${renderPublishPopoverSrc};
const LP_SKILLS=${skillsJson};
const renderSkillsMenuHTML=${renderSkillsMenuHTMLSrc};
function render(s){
  const brainEl=document.getElementById('lp-brain');
  if(brainEl) brainEl.innerHTML = renderBrain(s && s.brain);
  lpLastSnap = s;
  renderReadiness(s && s.readiness); // F0.5.3 — the 4-light readiness semaphore
  renderWork(s);
  renderLens(lpDcTab);
}
// F0.5.3 — the readiness semaphore: 4 honest lights (pasta · dev server+porta/fonte · árvore · agente)
// with a 1-click fix per unlit light. Sticky-port shows the wrong :porta (fonte) so the user SEES it.
let lpReadySig='';
function renderReadiness(r){
  const el=document.getElementById('lp-ready'); if(!el) return;
  if(!r){ if(lpReadySig!==''){ lpReadySig=''; el.innerHTML=''; el.style.display='none'; } return; }
  const lit=function(state,label,fix,fixlabel){
    const dot=state==='ok'?'🟢':(state==='warn'?'🟡':'🔴');
    return '<span class="lp-rl">'+dot+' '+esc(label)+(fix?(' <button type="button" class="lp-rfix" data-fix="'+esc(fix)+'">'+esc(fixlabel)+'</button>'):'')+'</span>';
  };
  const parts=[];
  if(!r.workspace){ parts.push(lit('bad','sem pasta','folder','Abrir pasta')); }
  else {
    parts.push(lit('ok','pasta',null,null));
    if(r.devServer) parts.push(lit('ok',':'+(r.port||'?')+(r.source?(' '+r.source):''),'reprobe','re-probar'));
    else parts.push(lit('bad','sem dev server','reprobe','re-probar'));
    if(r.tree==='ok') parts.push(lit('ok','árvore',null,null));
    else if(r.tree==='mismatch') parts.push(lit('warn','outra árvore','restart','reiniciar dev server'));
    if(r.sdk) parts.push(lit('ok','agente',null,null));
    else if(!r.trust) parts.push(lit('bad','sem confiança','trust','confiar'));
    else parts.push(lit('bad','sem SDK','folder','instalar'));
  }
  const html=parts.join('');
  if(html===lpReadySig) return; lpReadySig=html;
  el.innerHTML=html; el.style.display=parts.length?'flex':'none';
  const btns=el.querySelectorAll('[data-fix]');
  for(let i=0;i<btns.length;i++){ btns[i].addEventListener('click', function(){ readinessFix(this.getAttribute('data-fix')); }); }
}
function readinessFix(f){
  if(f==='reprobe') vsapi.postMessage({ type:'lp-redetect' });
  else if(f==='folder') vsapi.postMessage({ type:'lp-open-folder' });
  else if(f==='trust') vsapi.postMessage({ type:'lp-trust' });
  else if(f==='restart') vsapi.postMessage({ type:'lp-restart-dev' });
}
function renderWork(s){
  const el=document.getElementById('lp-work-mount'); if(!el) return;
  const html=renderWorkPill((s&&s.events)||[]);
  if(html===lpWorkSig) return; lpWorkSig=html;
  el.innerHTML=html;
}
function lpPane(tab){ return document.getElementById(tab==='stream'?'lp-pane-stream':tab==='day'?'lp-pane-day':tab==='model'?'lp-pane-model':'lp-pane-fleet'); }
function lpLensHd(tab){var r=tab==='stream'?'Chief of Staff — o diário da sessão':tab==='day'?'COO — operações por dia':tab==='model'?'CFO — custos e modelos (~est.)':tab==='fleet'?'COO — frota em paralelo':'';return r?('<div class="lp-lens-hd">'+r+'</div>'):'';}
function lpSig(tab,s){ try{ if(tab==='stream') return JSON.stringify([(s&&s.events)||[], !!(s&&s.sidKnown), (s&&s.journal)||null]); if(tab==='day') return JSON.stringify((s&&s.byDay)||null); if(tab==='model') return JSON.stringify((s&&s.byModel)||null); if(tab==='fleet') return JSON.stringify((s&&s.fleet)||null); }catch(_e){ return null; } return null; }
function renderLens(tab){
  const s=lpLastSnap; const el=lpPane(tab); if(!el) return;
  const sig=lpSig(tab,s); if(sig===lpLensSig[tab]) return; lpLensSig[tab]=sig;
  let sc=0; const oldS=el.querySelector('.lpdc-stream'); if(oldS) sc=oldS.scrollTop;
  if(tab==='stream') el.innerHTML=lpLensHd('stream')+renderJournalCard(s&&s.journal)+renderDirectorsCut((s&&s.events)||[], { sidKnown: !!(s&&s.sidKnown) });
  else if(tab==='day') el.innerHTML=lpLensHd('day')+renderDayBreakdown(s&&s.byDay);
  else if(tab==='model') el.innerHTML=lpLensHd('model')+renderModelBreakdown(s&&s.byModel);
  else if(tab==='fleet') el.innerHTML=lpLensHd('fleet')+renderFleetLanes(s&&s.fleet);
  const nS=el.querySelector('.lpdc-stream'); if(nS&&sc) nS.scrollTop=sc;
}
function setTab(tab){
  const order=['stream','day','model','fleet']; if(order.indexOf(tab)<0) return;
  lpDcTab=tab;
  for(let i=0;i<order.length;i++){ const t=order[i]; const on=(t===tab);
    const btn=document.getElementById('lp-tab-'+t); const pane=lpPane(t);
    if(btn){ if(on) btn.classList.add('on'); else btn.classList.remove('on'); btn.setAttribute('aria-selected',on?'true':'false'); btn.tabIndex=on?0:-1; }
    if(pane){ if(on) pane.removeAttribute('hidden'); else pane.setAttribute('hidden','hidden'); }
  }
  renderLens(tab);
}
(function(){ const strip=document.getElementById('lp-tabs'); if(!strip) return; const order=['stream','day','model','fleet'];
  strip.addEventListener('click', function(e){ const b=(e.target&&e.target.closest)?e.target.closest('.lp-tab'):null; if(b&&b.getAttribute('data-tab')){ setTab(b.getAttribute('data-tab')); b.focus(); } });
  strip.addEventListener('keydown', function(e){ const cur=order.indexOf(lpDcTab); let ni=-1;
    if(e.key==='ArrowRight'||e.key==='ArrowDown') ni=(cur+1)%order.length;
    else if(e.key==='ArrowLeft'||e.key==='ArrowUp') ni=(cur-1+order.length)%order.length;
    else if(e.key==='Home') ni=0; else if(e.key==='End') ni=order.length-1;
    if(ni>=0){ e.preventDefault(); setTab(order[ni]); const nb=document.getElementById('lp-tab-'+order[ni]); if(nb) nb.focus(); } });
})();
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
      let html;
      if(lpNoWorkspace){
        // F0.5.1 — honest empty-window screen: never a dead state, never the "start the dev server"
        // lie (you cannot, without a folder). ONE button opens the project folder in THIS window.
        html = '<div class="lp-degrade-in"><div class="lp-degrade-ico">📂</div>'
          + '<div class="lp-degrade-t">Nenhuma pasta aberta nesta janela</div>'
          + '<div class="lp-degrade-r">O Live Preview precisa da pasta do teu projeto para servir o site e editar.</div>'
          + '<div class="lp-degrade-h"><button type="button" id="lp-open-folder" class="lp-open-folder">📂 Abrir a pasta do projeto nesta janela</button></div></div>';
      } else {
        const reason = (st && st.reason) ? st.reason : 'nenhum dev server detetado';
        html = '<div class="lp-degrade-in"><div class="lp-degrade-ico">🎬</div>'
          + '<div class="lp-degrade-t">App Stage à espera do dev server</div>'
          + '<div class="lp-degrade-r">' + esc(reason) + '</div>'
          + '<div class="lp-degrade-h">arranca o dev server (ex.: <code>cd landing &amp;&amp; npm run dev</code>) '
          + 'ou cola o URL na barra acima. Entretanto o MEO continua a fazer stream à direita.</div></div>';
      }
      // Only rewrite when the copy changes — otherwise a poll wipes any text selection in the hint.
      if(html !== lastDegradeHtml){ lastDegradeHtml = html; degrade.innerHTML = html;
        // F0.5.1 — re-wire the open-folder button after each rewrite (host opens the folder picker).
        var ofb=document.getElementById('lp-open-folder'); if(ofb) ofb.addEventListener('click', function(){ vsapi.postMessage({ type:'lp-open-folder' }); });
      }
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
let lpDcTab='stream';
let lpLastSnap=null;
let lpLensSig={stream:null,day:null,model:null,fleet:null};
let lpWorkSig=null;
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
// F2 (P1-7) — honest hot-reload-down banner. The tap owns the truth (its HMR socket dropped); we only
// reflect it. textContent (never innerHTML) — the copy is static, so there is nothing to inject.
function setHmrStale(down){
  var el=document.getElementById('lp-hmr');
  if(!el) return;
  if(down){ el.textContent='⚠ hot-reload desligado — o preview pode estar desatualizado. A tentar reconectar…'; el.style.display='block'; }
  else { el.style.display='none'; el.textContent=''; }
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
// LP-4.5 one-box mode: 'auto' (anchored-task agent — the default) · 'local' (LP-4 fenced node
// rewrite, $0) · 't1'/'t2'/'t3'/'fable' (the agent pinned to that subscription model; @fable is
// manual-only, never auto-routed).
let lpSelection=null, lpSelectOn=false, lpMode='auto';
// LP-4.8 §4 — multi-select attach-as-reference: extra nodes Cmd/Ctrl-clicked as CONTEXT for one
// prompt (Lovable's model, NOT batch-edit). They ride the agent (lp-task) path only; a local $0
// fenced edit still targets the single pinned node. Each entry: { file, line, col, tag, label }.
let lpRefs=[];
// LP-4.9 §1 — the one-box now carries an EXPLICIT intent so the user knows BEFORE sending whether
// it will EDIT (write → diff → apply → preview changes) or ASK (read the repo → answer in the
// panel, zero writes). 'edit' (default) respects the model chip; 'ask' always uses the agent (only
// it can answer), never the local $0 moo. Kills Paulo's #1 pain: the "I asked, expected an edit".
let lpIntent='edit';
// LP-4 §6 / review P1-B — honest session state driving the panel: the SDK-bridge status (from
// the snapshot) and the unified feed's render revision (LP-4.5 §4 — re-render only on change so
// a poll never steals focus from a feed button). The WRITE TARGET is NOT a global: every apply
// (edit/delete/prompt) reads file/line/col/tag from THE DIFF the user approved (m).
let lpFeedRev=-1, lpFeedItems=[], lpBridge=null, lpNoWorkspace=false;
function sendSelectMode(on){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin){ try{ w.postMessage({ type:'lp-select-mode', on:!!on }, curOrigin); }catch(e){} }
}
function setSelectMode(on){
  lpSelectOn=!!on;
  const b=document.getElementById('lp-select-btn');
  if(b){ b.setAttribute('aria-pressed', lpSelectOn?'true':'false'); if(lpSelectOn) b.classList.add('lp-on'); else b.classList.remove('lp-on'); }
  sendSelectMode(lpSelectOn);
  if(lpSelectOn){ try{ maybeCoachOnArm(); }catch(e){} } // LP-4.9 §4 — first-run onboarding
}
// MP5.2a — a breadcrumb chip asks the tap to re-select an ancestor node (re-pin + fresh lp-select).
// Origin-targeted postMessage into the frame, exactly like sendSelectMode (cross-origin, never '*').
function sendReselect(c){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin&&c){ try{ w.postMessage({ type:'lp-reselect', file:c.file, line:c.line, col:c.col, tag:c.tag }, curOrigin); }catch(e){} }
}
// LP-4.8 §4 — tell the tap to drop a reference box (✕) or all of them (limpar). Origin-targeted
// into the frame like every other host→tap message (cross-origin, never '*').
function sendDetach(c){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin&&c){ try{ w.postMessage({ type:'lp-detach', file:c.file, line:c.line, col:c.col, tag:c.tag }, curOrigin); }catch(e){} }
}
function sendDetachAll(){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin){ try{ w.postMessage({ type:'lp-detach-all' }, curOrigin); }catch(e){} }
}
// LP-4.9 §5 — hover-preview: ask the tap to VISUALLY apply a className to the pinned element (live
// DOM only, no file write) so a preset shows its effect before you commit — the Lovable gesture.
// Origin-targeted into the frame; the tap saves the original and restores it on clear.
function sendPreviewClass(cn){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin){ try{ w.postMessage({ type:'lp-preview-class', className:String(cn==null?'':cn) }, curOrigin); }catch(e){} }
}
function sendClearPreview(){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin){ try{ w.postMessage({ type:'lp-preview-clear' }, curOrigin); }catch(e){} }
}
// Render the attached-reference chips (each with a ✕) + a "limpar" clear-all. Rebuilt whenever a
// ref is attached/removed and after each renderSelection (which recreates the toolbar markup).
function renderRefs(){
  const el=document.getElementById('lp-refs'); if(!el) return;
  if(!lpRefs.length){ el.style.display='none'; el.innerHTML=''; return; }
  let chips='';
  for(let i=0;i<lpRefs.length;i++){
    const r=lpRefs[i]||{}; const base=baseName(r.file||'?');
    const lbl=esc('<'+(r.tag||'nó')+'> '+base+(r.line!=null?(':'+r.line):''));
    // Hover shows file:line plus the node's own text (the attach label) so a ref is recognisable.
    const titleTxt=(r.file||'')+(r.line!=null?(':'+r.line):'')+(r.label?(' — '+r.label):'');
    chips+='<span class="lp-ref" title="'+esc(titleTxt)+'">'+lbl
      +'<button type="button" class="lp-ref-x" data-ref="'+i+'" aria-label="remover referência '+lbl+'">✕</button></span>';
  }
  el.innerHTML='<div class="lp-refs-hd">referências anexadas ('+lpRefs.length+') — contexto para o agente <button type="button" id="lp-refs-clr" class="lp-ref-clr">limpar</button></div>'
    +'<div class="lp-refs-list">'+chips+'</div>'
    +(lpMode==='local'?'<div class="lp-refs-note">o chip local $0 edita só o nó pinado — as referências entram quando subes para o agente</div>':'');
  el.style.display='block';
  const xs=el.querySelectorAll('[data-ref]');
  for(let i=0;i<xs.length;i++){ xs[i].addEventListener('click', function(){
    const idx=parseInt(this.getAttribute('data-ref'),10);
    const r=(Number.isInteger(idx)&&idx>=0&&idx<lpRefs.length)?lpRefs[idx]:null;
    if(r){ sendDetach(r); lpRefs.splice(idx,1); renderRefs(); }
  }); }
  const clr=document.getElementById('lp-refs-clr');
  if(clr) clr.addEventListener('click', function(){ sendDetachAll(); lpRefs=[]; renderRefs(); });
}
// LP-4 §5 — after a write, the host asks the tap to watch through the HMR swap and re-emit a
// FRESH lp-select for the same node (re-prompt without re-selecting). Origin-targeted, never '*'.
function sendRepin(c){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin&&c){ try{ w.postMessage({ type:'lp-repin', file:c.file, line:c.line, col:c.col, tag:c.tag }, curOrigin); }catch(e){} }
}
function baseName(f){ const parts=String(f==null?'':f).split(/[\\\\/]/); return parts[parts.length-1]||String(f==null?'':f); }
// LP-4.5 §5 — the escape hatch from every dynamic-content warning: point the one box at the
// agent. Honest when it cannot: bridge missing/untrusted → the exact reason, no silent no-op.
function switchToAgent(){
  const br=lpBridge||{ available:false, reason:'sdk-bridge-missing' };
  if(!br.available){ showEditResult(false,(br.reason==='workspace-untrusted')?'workspace-untrusted':'sdk-bridge-missing'); return; }
  lpMode='auto';
  renderModeChips();
  const bi=document.getElementById('lp-box-in');
  if(bi) bi.focus();
}
// LP-4.8 §3 — /skills menu wiring. The registry (LP_SKILLS) + the pure renderer are serialised in;
// this hooks up open/close, keyboard, click-away, and the per-item SEED. A skill only seeds the
// one-box + pins the tier — the actual write still travels the existing fenced one-box path.
let lpSkillsAway=false;
function skillTierMode(tier){ return tier==='auto' ? 'auto' : 'local'; }
function closeSkillsMenu(){
  const menu=document.getElementById('lp-sk-menu'), btn=document.getElementById('lp-sk-btn');
  if(menu) menu.style.display='none';
  if(btn) btn.setAttribute('aria-expanded','false');
}
function wireSkillsMenu(){
  const btn=document.getElementById('lp-sk-btn'), menu=document.getElementById('lp-sk-menu'), act=document.getElementById('lp-sk-active');
  if(!btn||!menu) return;
  menu.innerHTML=renderSkillsMenuHTML(Array.isArray(LP_SKILLS)?LP_SKILLS:[], esc);
  btn.addEventListener('click', function(e){
    e.stopPropagation();
    if(menu.style.display!=='none'){ closeSkillsMenu(); return; }
    menu.style.display='block'; btn.setAttribute('aria-expanded','true');
    const f=menu.querySelector('.lp-sk-item'); if(f) f.focus();
  });
  menu.addEventListener('keydown', function(e){ if(e.key==='Escape'){ e.stopPropagation(); closeSkillsMenu(); btn.focus(); } });
  const items=menu.querySelectorAll('[data-skill]');
  for(let i=0;i<items.length;i++){ items[i].addEventListener('click', function(){
    const id=this.getAttribute('data-skill'), tier=this.getAttribute('data-tier'), tpl=this.getAttribute('data-template')||'';
    const bi=document.getElementById('lp-box-in');
    if(bi){ bi.value=tpl; bi.focus(); try{ bi.setSelectionRange(tpl.length, tpl.length); }catch(e){} }
    lpMode=skillTierMode(tier);              // pin the chip to the skill's tier floor (honest routing)
    renderModeChips();
    if(act) act.textContent='skill activa: /'+id+' · '+(lpMode==='auto'?'agente · subscrição':'local · $0');
    closeSkillsMenu();
    btn.focus();
  }); }
  // Click-away closes the menu — wired ONCE on the document (renderSelection re-runs per selection).
  if(!lpSkillsAway){ lpSkillsAway=true; document.addEventListener('click', function(ev){
    const mnu=document.getElementById('lp-sk-menu'), bt=document.getElementById('lp-sk-btn');
    if(mnu && mnu.style.display!=='none' && !mnu.contains(ev.target) && ev.target!==bt) closeSkillsMenu();
  }); }
}
// LP-4.8 §1 — anchor the floating toolbar to the pin. rect = the node's bounding box in the
// iframe's OWN viewport coords (the tap sends it on select + on every scroll/resize reflow). We
// map it into #lp-framewrap coordinates via the iframe's offset (0,0 full-width; centred in device
// mode) and clamp so the toolbar never spills outside the frame. Prefer ABOVE the pin, fall back
// below when there is no room — the toolbar must never cover the very element being edited.
let lpPinRect=null, lpToolbarManualPos=null, lpToolbarMin=false;
function lpRectsOverlap(a,b){ return !(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y); }
function positionCanvasToolbar(rect){
  const tb=document.getElementById('lp-ctb'), chip=document.getElementById('lp-ctb-chip'), f=document.getElementById('lp-frame'), wrap=document.getElementById('lp-framewrap');
  if(!tb||!f||!wrap) return;
  if(rect && typeof rect.x==='number') lpPinRect=rect; else rect=lpPinRect;
  if(!rect) return;
  const fx=f.offsetLeft||0, fy=f.offsetTop||0;
  const wrapW=wrap.clientWidth||0, wrapH=wrap.clientHeight||0;
  const px=fx+(rect.x||0), py=fy+(rect.y||0), pw=rect.w||0, ph=rect.h||0; // pin box in wrap coords
  const clampX=function(x,w){ return Math.max(6, Math.min(x, wrapW-w-6)); };
  const clampY=function(y,h){ return Math.max(6, Math.min(y, wrapH-h-6)); };
  // §7 minimized — place the 🐮 chip at the pin corner (above if it fits, else below); toolbar hidden.
  if(lpToolbarMin){
    if(chip){ const cw=chip.offsetWidth||34, chh=chip.offsetHeight||34; chip.style.left=clampX(px, cw)+'px'; chip.style.top=clampY((py-chh-6>6)?(py-chh-6):(py+ph+6), chh)+'px'; }
    return;
  }
  const tw=tb.offsetWidth||260, th=tb.offsetHeight||160;
  // §7 dragged — honour the manual position (clamped into the frame; the auto-anchor is the
  // no-drag alternative required by WCAG 2.5.7, so dragging is a convenience, never the only way).
  if(lpToolbarManualPos){ tb.style.left=clampX(lpToolbarManualPos.x, tw)+'px'; tb.style.top=clampY(lpToolbarManualPos.y, th)+'px'; return; }
  // §7 auto-anchor — try above → below → right → left; take the first that fits AND does not cover
  // the pin (the toolbar must never hide the very element being edited — Paulo's live pain).
  const pin={x:px,y:py,w:pw,h:ph};
  const cands=[
    {x:clampX(px,tw), y:py-th-8},        // above
    {x:clampX(px,tw), y:py+ph+8},        // below
    {x:px+pw+8,       y:clampY(py,th)},  // right
    {x:px-tw-8,       y:clampY(py,th)},  // left
  ];
  let chosen=null;
  for(let i=0;i<cands.length;i++){
    const c=cands[i];
    if(c.x<6||c.y<6||c.x+tw>wrapW-6||c.y+th>wrapH-6) continue;   // off-frame
    if(lpRectsOverlap({x:c.x,y:c.y,w:tw,h:th}, pin)) continue;   // covers the pin
    chosen=c; break;
  }
  if(!chosen) chosen={x:clampX(px,tw), y:clampY(py+ph+8, th)};   // last resort: clamped below
  tb.style.left=chosen.x+'px';
  tb.style.top=chosen.y+'px';
}
function hideCanvasToolbar(){
  const tb=document.getElementById('lp-ctb'), tbb=document.getElementById('lp-ctb-body'), chip=document.getElementById('lp-ctb-chip');
  lpPinRect=null; lpToolbarManualPos=null; lpToolbarMin=false;
  if(tb){ tb.style.display='none'; tb.setAttribute('aria-hidden','true'); }
  if(chip) chip.style.display='none';
  if(tbb) tbb.innerHTML='';
}
// LP-4.9 §3 — real-time feedback. A toast anchored to the node says EXACTLY what happened: an edit
// landed ("✓ aplicado no preview · $0"), a question was answered ("💬 resposta no painel →"), or a
// write was refused ("⚠️ …"). Politely announced (aria-live) and auto-dismissed. kind ∈ ok|ask|warn.
let lpToastTimer=null;
function showToast(kind, text){
  const t=document.getElementById('lp-ctb-toast'); if(!t) return;
  t.className='lp-ctb-toast lp-toast-'+(kind||'ok')+' lp-toast-in';
  t.textContent=text;
  t.style.display='block';
  const f=document.getElementById('lp-frame'), wrap=document.getElementById('lp-framewrap');
  if(f&&wrap&&lpPinRect){
    const fx=f.offsetLeft||0, fy=f.offsetTop||0, wrapW=wrap.clientWidth||0;
    const tw=t.offsetWidth||160, th=t.offsetHeight||28;
    let left=fx+(lpPinRect.x||0)+((lpPinRect.w||0)/2)-tw/2;
    left=Math.max(6, Math.min(left, wrapW-tw-6));
    let top=fy+(lpPinRect.y||0)-th-10; if(top<6) top=fy+(lpPinRect.y||0)+(lpPinRect.h||0)+10;
    t.style.left=left+'px'; t.style.top=top+'px';
  }
  if(lpToastTimer){ try{ clearTimeout(lpToastTimer); }catch(e){} }
  lpToastTimer=setTimeout(function(){ const el=document.getElementById('lp-ctb-toast'); if(el){ el.style.display='none'; el.classList.remove('lp-toast-in'); } }, 2600);
}
// Ask the tap to flash the pin box (a short pulse) so the eye lands on the element that changed.
function sendFlash(){
  const f=document.getElementById('lp-frame'); const w=f&&f.contentWindow;
  if(w&&curOrigin){ try{ w.postMessage({ type:'lp-flash' }, curOrigin); }catch(e){} }
}
// LP-4.9 §8 — live progress in the toolbar: the 🐮 spins while the moo/agent works, with the
// HONEST tier ("moo local · $0" vs "Sonnet · subscrição") and a cancel button for agent runs. Never
// mute: it starts on the first thinking status and ends when a result (any outcome) arrives.
function lpStartProgress(text, cancellable){
  const p=document.getElementById('lp-progress'), t=document.getElementById('lp-progress-txt'), c=document.getElementById('lp-progress-cancel');
  // §4 — the minimized 🐮 chip also shows "working" so a run is never mute when the toolbar is
  // collapsed (the user may minimize to watch the preview while the agent works).
  const chip=document.getElementById('lp-ctb-chip'); if(chip){ chip.classList.add('lp-chip-working'); chip.setAttribute('title','A trabalhar… (clica para reabrir)'); }
  if(!p) return;
  if(t) t.textContent=text||'a pensar…';
  if(c) c.style.display=cancellable?'inline-flex':'none';
  p.style.display='flex';
}
function lpUpdateProgress(text){ const t=document.getElementById('lp-progress-txt'); if(t&&text) t.textContent=text; }
function lpFinishProgress(){
  const p=document.getElementById('lp-progress'); if(p) p.style.display='none';
  const chip=document.getElementById('lp-ctb-chip'); if(chip){ chip.classList.remove('lp-chip-working'); chip.setAttribute('title','Reabrir a toolbar'); }
}
// LP-4.9 loop-fix §C — the always-visible context/route line. Tells the user, BEFORE sending, what
// THIS action does with the project: agent = reads the whole repo + edits in the right place; local
// $0 = only this node, no project context; and how to turn the agent on when it is off. Driven by
// the SDK-bridge status (lpBridge) + the chosen intent/tier. Answers "não sei se apanha o contexto".
function renderCtxLine(){
  const el=document.getElementById('lp-ctx'); if(!el) return;
  const br=lpBridge||{ available:false, reason:'sdk-bridge-missing' };
  // W2 — honest context-source chip. The agent reads the repo via the Context Engine (repo-map +
  // import-slice + data-hop, pré-computado $0, NÃO grep às cegas) when the bridge is ON and this is
  // an ask OR a non-local edit. Camada C (Notion/3rd brain) não está ligada → 'Notion n/d', nunca fingir.
  const readsProject=!!br.available&&(lpIntent==='ask'||lpMode!=='local');
  const csrc=document.getElementById('lp-ctx-src');
  if(csrc){
    if(readsProject){ csrc.textContent='📚 repo ✓ · Notion n/d'; csrc.title='Contexto do agente: repo via Context Engine (repo-map · import-slice · data-hop, pré-computado $0). Notion/3rd brain ainda não ligados (Camada C).'; csrc.style.display='inline-flex'; }
    else { csrc.style.display='none'; csrc.textContent=''; }
  }
  if(lpIntent==='ask'){
    el.className='lp-ctx '+(br.available?'lp-ctx-ok':'lp-ctx-warn');
    el.textContent=br.available
      ? '🤖 Perguntar lê o projeto todo e responde no painel — não escreve nada'
      : '⚠️ Perguntar precisa do agente — ativa a ponte SDK + confia no workspace (senão não há resposta)';
    return;
  }
  const localOnly=(lpMode==='local')||!br.available;
  if(localOnly){
    el.className='lp-ctx lp-ctx-warn';
    el.textContent=!br.available
      ? '⚠️ agente OFF → edita SÓ este elemento, sem contexto do projeto. Liga: instala @anthropic-ai/claude-agent-sdk no workspace + confia no workspace'
      : '🐮 local $0 → edita SÓ este elemento (sem contexto do projeto). Muda o tier em "▾ mais" para o agente ler o projeto';
  } else {
    el.className='lp-ctx lp-ctx-ok';
    el.textContent='🤖 o agente lê o projeto TODO e edita no sítio certo (pode não ser este nó) · diff antes de manter';
  }
}
// LP-4.9 §4 — first-run coach marks: 3 short steps shown the first time the 🎯 arms, dismissible,
// never repeats (localStorage). Re-openable any time from the "?" (consistent help, WCAG 3.2.6).
const LP_COACH=[
  { t:'1 · Clica num elemento', d:'Liga o 🎯 e clica em qualquer coisa no preview para a fixar. A toolbar abre ancorada a esse elemento.' },
  { t:'2 · Editar ou Perguntar', d:'✏️ Editar muda o site (diff → aplica). 💬 Perguntar só responde no painel. Escolhes ANTES de enviar.' },
  { t:'3 · Cor e tamanho são $0', d:'As amostras de cor, tamanho e espaçamento aplicam-se num clique — instantâneas, sem tokens, sem custo.' },
];
let lpCoachStep=0;
function renderCoachStep(){
  const body=document.getElementById('lp-coach-body'), dots=document.getElementById('lp-coach-dots'), next=document.getElementById('lp-coach-next');
  const s=LP_COACH[lpCoachStep]||LP_COACH[0];
  if(body) body.innerHTML='<div class="lp-coach-t">'+esc(s.t)+'</div><div class="lp-coach-d">'+esc(s.d)+'</div>';
  if(dots){ let d=''; for(let i=0;i<LP_COACH.length;i++) d+='<span class="lp-coach-dot'+(i===lpCoachStep?' on':'')+'"></span>'; dots.innerHTML=d; }
  if(next) next.textContent=(lpCoachStep>=LP_COACH.length-1)?'começar':'seguinte';
}
// §2 (a11y) — a REAL modal: aria-modal + the background made inert so keyboard focus can't escape
// behind it (belt-and-suspenders with the Tab trap on #lp-coach). Restore inert on dismiss.
function setCoachBackgroundInert(on){
  const ids=['lp-ctb-ov','lp-frame'];
  for(let i=0;i<ids.length;i++){ const el=document.getElementById(ids[i]); if(!el) continue; try{ el.inert=!!on; }catch(e){} el.setAttribute('aria-hidden', on?'true':'false'); }
}
function showCoachMarks(){ lpCoachStep=0; const c=document.getElementById('lp-coach'); if(c){ c.style.display='flex'; setCoachBackgroundInert(true); renderCoachStep(); const n=document.getElementById('lp-coach-next'); if(n) n.focus(); } }
function dismissCoachMarks(){ const c=document.getElementById('lp-coach'); if(c) c.style.display='none'; setCoachBackgroundInert(false); try{ localStorage.setItem('lp-coach-done','1'); }catch(e){} }
function maybeCoachOnArm(){ let done=false; try{ done=localStorage.getItem('lp-coach-done')==='1'; }catch(e){} if(!done) showCoachMarks(); }
// Short, human reason for the warn toast (the panel still shows the full honest state).
function toastReason(reason){
  const m={ 'workspace-untrusted':'workspace não confiável', 'sdk-bridge-missing':'ponte SDK ausente', 'no-workspace':'sem pasta aberta',
    'no-selection':'sem elemento fixado — escolhe um no preview',
    'prompt-empty':'escreve primeiro o que queres', 'file-changed':'o ficheiro mudou — pré-visualiza de novo',
    'local-model-offline':'moo local offline', 'local-model-timeout':'o moo local demorou demasiado',
    'task-timeout':'o agente demorou demasiado', 'task-cancelled':'cancelado',
    'replacement-parse-error':'recusado pela cerca (JSX inválido)', 'not-single-root':'recusado pela cerca' };
  return m[reason]||(reason?String(reason):'rejeitado');
}
// F3 (W1) — the persistent anchor chip in the toolbar: '📍 file:line · <tag>' when a node is
// pinned, an honest '📍 sem seleção' when not. Concat-only + esc(); &lt;&gt; for the literal tag.
// Driven from the webview sel object (the same pin the host store mirrors); after an apply-time
// lp-repin it may briefly show the pre-repin file:line until the tap re-emits lp-select.
function updateAnchorChip(sel){
  const a=document.getElementById('lp-anchor');
  if(!a) return;
  if(sel&&sel.file){
    const tg=esc(sel.tag||'elemento');
    a.innerHTML='📍 '+esc(baseName(sel.file))+':'+esc(sel.line==null?'?':sel.line)+' · &lt;'+tg+'&gt;';
    a.className='lp-anchor on';
    a.title='Elemento fixado: '+(sel.file||'')+':'+(sel.line==null?'?':sel.line)+' — o alvo do prompt';
  } else {
    a.innerHTML='📍 sem seleção';
    a.className='lp-anchor';
    a.title='Sem elemento fixado — clica 🎯 e escolhe um elemento no preview. Sem âncora, nenhum prompt é enviado.';
  }
}
// F0.2 — the history of THIS node (clicking a node shows its edits, incl. prior sessions restored from
// workspaceState). Matches feed items by nodeKey (file+tag+line); a persisted item is read-only history.
function lpNodeHistoryHTML(sel){
  try{
    if(!sel||!sel.file) return '';
    var all=Array.isArray(lpFeedItems)?lpFeedItems:[];
    var items=all.filter(function(e){ var nk=e&&e.nodeKey; if(!nk||nk.file!==sel.file) return false; if(sel.tag!=null&&nk.tag!=null&&nk.tag!==sel.tag) return false; if(sel.line!=null&&nk.line!=null&&nk.line!==sel.line) return false; return true; });
    if(!items.length) return '';
    function clk(ts){ if(ts==null) return 'n/d'; var d=new Date(ts); return isNaN(d.getTime())?'n/d':d.toLocaleTimeString(undefined,{hour12:false}); }
    var rows='';
    for(var i=items.length-1;i>=0;i--){ var e=items[i]||{};
      var badge=e.persisted?'<span class="lp-nh-b lp-nh-hist">histórico</span>':('<span class="lp-nh-b">'+esc(e.status||'live')+'</span>');
      rows+='<div class="lp-nh-row"><span class="lp-nh-t">'+esc(clk(e.ts))+'</span><span class="lp-nh-v">'+esc(e.via||'edição')+'</span>'+badge+'</div>';
    }
    return '<div class="lp-nh"><div class="lp-nh-hd">🕘 histórico deste nó · '+items.length+'</div>'+rows+'</div>';
  }catch(_){ return ''; }
}
function renderSelection(sel){
  updateAnchorChip(sel); // F3 — keep the persistent anchor chip honest on every (de)selection
  const el=document.getElementById('lp-sel');
  if(!el) return;
  if(!sel){ el.style.display='none'; el.innerHTML=''; hideCanvasToolbar(); return; }
  const ctb=document.getElementById('lp-ctb'), ctbBody=document.getElementById('lp-ctb-body');
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
  if(sel.repeated>1) warn+='<div class="lp-sel-warn">⚠ elemento repetido no ecrã (×'+esc(sel.repeated)+' — provavelmente .map()) — a moldura está presa à 1ª instância, mas a edição afeta o template, ou seja TODOS os itens.</div>'; // P1-6: surface the frame-pinned-to-first-instance limitation that used to live only in a comment
  // LP-4.5 §5 — dynamic-component honesty, BEFORE any fenced rewrite: an uppercase tag is a
  // COMPONENT whose rendered content comes from inside it — rewriting the usage node may change
  // nothing on screen (the CommunityPulse case). Offer the agent, never a lying "✓ escrito".
  if(/^[A-Z]/.test(sel.tag||'')) warn+='<div class="lp-sel-warn">⚠ &lt;'+tag+'&gt; é um componente — o conteúdo vem de DENTRO dele: reescrever este nó não o muda. <button type="button" id="lp-sel-agent" class="lp-sel-btn">resolver com o agente</button></div>';
  // LP-4.8 §1 — the right panel now shows ONLY context + outputs (breadcrumbs, honest warnings,
  // the diff mount, the status line). The interactive controls moved to the in-canvas toolbar
  // below; the diff/feed/resposta live here (the brief: "o painel direito passa a mostrar SÓ
  // diff/feed/resposta"). getElementById resolves across the whole document, so splitting the
  // markup across two containers changes nothing for the shared handlers wired further down.
  el.innerHTML='<div class="lp-sel-hd">Seleção · &lt;'+tag+'&gt;</div>'
    +(crumbs?('<div class="lp-crumbs" role="navigation" aria-label="Árvore do elemento">'+crumbs+'</div>'):'')
    +'<div class="lp-sel-loc">'+loc+'</div>'
    +warn
    +lpNodeHistoryHTML(sel)
    +'<div id="lp-del"></div>'
    +'<div id="lp-edit-msg" class="lp-ed-msg" role="status"></div>';
  el.style.display='block';
  // LP-4.8 §1 — the in-canvas toolbar (inputs), anchored to the pin. Same ids/wiring as before,
  // just hosted here instead of the side rail. Falls back to the side panel only if the toolbar
  // host is absent (defensive — the static markup always ships it).
  // LP-4.9 §2 — progressive disclosure. The toolbar opens MINIMAL: intent toggle + one-box + send
  // (+ refs, invisible until used). Everything an engineer occasionally needs — model chips, raw
  // text/class edits, presets, /skills, open/delete — lives behind "▾ mais". Simple by default,
  // the power one click away. The expanded/collapsed choice is remembered per session (localStorage).
  const inputsHTML=
    // ── SIMPLE (always visible) — F0.1: PROMPT-FIRST. anchor · Editar/Perguntar · prompt(autofocus) · tier · context. ──
    // F3 (W1) — the anchor chip AT the input: shows the pinned element (📍 file:line · <tag>). loc/tag already esc'd above.
    '<div class="lp-anchor-in" title="Este prompt está ancorado a este elemento (ficheiro:linha) — o alvo da edição">📍 '+esc(baseName(sel.file||'?'))+':'+esc(sel.line==null?'?':sel.line)+' · &lt;'+tag+'&gt;</div>'
    +'<div class="lp-mode-tg" role="radiogroup" aria-label="O que fazer com este prompt">'   // §1 intent
    +'<button type="button" id="lp-mode-edit" class="lp-mtg" role="radio" aria-checked="true" data-intent="edit" title="Escreve → diff → aplica → muda o preview">✏️ Editar</button>'
    +'<button type="button" id="lp-mode-ask" class="lp-mtg" role="radio" aria-checked="false" data-intent="ask" title="Lê o repo → responde no painel, zero escrita">💬 Perguntar</button>'
    +'</div>'
    +'<div id="lp-box-l" class="lp-mode-hint">Editar muda o site · Perguntar só responde</div>'
    // F0.1 — the prompt box is the star (autofocus on a fresh pin, wired below); the tier picker sits under it.
    +'<div class="lp-ed-row"><input id="lp-box-in" class="lp-ed-in" type="text" placeholder="ex: encurta este texto · os números batem com o projecto?" aria-label="prompt ancorado neste elemento" /><button id="lp-box-b" class="lp-sel-btn lp-box-send" title="Envia o prompt no modo escolhido — diff antes de manter">✏️ Editar</button></div>'
    +'<div id="lp-box-hint" class="lp-hint" style="display:none"></div>'
    // F0.1 — the model/tier picker (local $0 · Haiku · Sonnet · Opus · @fable) is now ALWAYS visible, under the box.
    +'<div id="lp-chip" class="lp-chip"></div>'
    // LP-4.9 loop-fix §C + W2 — ALWAYS-visible context/route line + honest context-source chip.
    +'<div id="lp-ctx" class="lp-ctx" role="status"></div>'
    +'<span id="lp-ctx-src" class="lp-ctx-src" role="status" title="Fontes de contexto do agente" style="display:none"></span>'
    +'<div id="lp-refs" class="lp-refs" role="group" aria-label="Elementos anexados como referência" style="display:none"></div>'
    // ── ▾ AJUSTES RÁPIDOS (collapsed) — F0.1: the instant $0 style presets + raw text/class edits, /skills, open/delete. ──
    +'<button type="button" id="lp-more" class="lp-more" aria-expanded="false" aria-controls="lp-adv" title="Ajustes rápidos de estilo + controlos avançados">▾ ajustes rápidos</button>'
    +'<div id="lp-adv" class="lp-adv" style="display:none">'
    // §5 — the instant $0 style gesture (colour/size/spacing), moved off the top into the quick-adjust drawer.
    +'<div id="lp-presets" class="lp-pz lp-pz-star" role="group" aria-label="Estilo rápido — cor, tamanho, espaçamento ($0, sem tokens, pré-visualiza ao passar o rato)"></div>'
    +'<div class="lp-ed-l" id="lp-ed-text-l">texto</div>'
    +'<div class="lp-ed-row"><input id="lp-ed-text" class="lp-ed-in" type="text" value="'+esc(curText)+'" placeholder="texto do elemento" aria-label="texto do elemento selecionado" /><button id="lp-ed-text-b" class="lp-sel-btn" title="Editar deterministicamente — $0, sem tokens">aplicar</button></div>'
    +'<div class="lp-ed-l" id="lp-ed-class-l">classe (Tailwind · cor · spacing)</div>'
    +'<div class="lp-ed-row"><input id="lp-ed-class" class="lp-ed-in" type="text" value="'+esc(curClass)+'" placeholder="ex: text-lg font-bold text-rose-500" spellcheck="false" aria-label="classe Tailwind do elemento selecionado" /><button id="lp-ed-class-b" class="lp-sel-btn" title="Editar deterministicamente — $0, sem tokens">aplicar</button></div>'
    +'<div class="lp-sk"><button id="lp-sk-btn" class="lp-sel-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="lp-sk-menu" title="Skills ancoradas a este elemento — cada uma mostra o seu tier">/skills ▾</button>'
    +'<div id="lp-sk-active" class="lp-sk-active" role="status"></div>'
    +'<div id="lp-sk-menu" class="lp-sk-menu" role="menu" aria-label="Skills" style="display:none"></div></div>'
    +'<div class="lp-sel-acts"><button id="lp-sel-open" class="lp-sel-btn">abrir no editor</button>'
    +'<button id="lp-sel-del" class="lp-sel-btn" title="apagar é determinístico — $0, sem tokens">🗑 apagar elemento</button></div>'
    +'</div>';
  if(ctbBody){
    // §5/§7 — rebuilding the toolbar destroys a swatch that may be mid-hover (no mouseleave fires),
    // which would strand a hover-preview on the node. Clear it before we replace the markup.
    sendClearPreview();
    ctbBody.innerHTML=inputsHTML;
    lpToolbarManualPos=null; // §7 — a fresh selection re-anchors (drag is per-selection)
    const chip=document.getElementById('lp-ctb-chip');
    // §7 — preserve a minimized toolbar across re-pins (show the 🐮 chip, keep the panel hidden).
    if(lpToolbarMin){ if(ctb){ ctb.style.display='none'; ctb.setAttribute('aria-hidden','true'); } if(chip) chip.style.display='inline-flex'; }
    else { if(ctb){ ctb.style.display='block'; ctb.setAttribute('aria-hidden','false'); } if(chip) chip.style.display='none';
      // F0.1 — pin ready to type: focus the prompt box on a fresh selection (only when the toolbar is shown).
      const bx=document.getElementById('lp-box-in'); if(bx){ try{ bx.focus(); }catch(e){} } }
  }
  else { el.insertAdjacentHTML('beforeend', inputsHTML); } // fallback: keep controls in the rail
  // LP-4 §0 — preview-first: "aplicar" asks for the mini-diff; the write only happens after the
  // user approves it (and the host re-checks the source hash at that moment — fence simétrica).
  const sendEdit=function(kind,value){ vsapi.postMessage({ type:'lp-edit', preview:true, file:sel.file, line:sel.line, col:sel.col, tag:sel.tag, edit:{ kind:kind, value:value } }); showEditResult(null,'pending'); };
  const ti=document.getElementById('lp-ed-text'), tb=document.getElementById('lp-ed-text-b');
  if(ti&&tb){ tb.addEventListener('click', function(){ sendEdit('text', ti.value); }); ti.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); sendEdit('text', ti.value); } }); }
  const ci=document.getElementById('lp-ed-class'), cb=document.getElementById('lp-ed-class-b');
  if(ci&&cb){ cb.addEventListener('click', function(){ sendEdit('class', ci.value); }); ci.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); sendEdit('class', ci.value); } }); }
  // LP-4.8 §2 — deterministic presets. A swatch/chip merges its class into the CURRENT className
  // (mergeClass drops the same-group token so red→blue swaps, never stacks) and feeds the SAME
  // preview-first class-edit fence — $0, no LLM. The class box mirrors the change so presets and
  // manual edits compose. Refusals (dynamic className, unsafe chars) surface via showEditResult.
  const pz=document.getElementById('lp-presets');
  if(pz){
    pz.innerHTML=renderPresetsBarHTML(esc);
    // LP-4.9 §5 — hover/focus PREVIEWS the preset on the live element (no write); click applies via
    // the fence. mouseleave/blur restores. The next className is computed from the class box (the
    // live source of truth), so previews and manual edits compose.
    const previewOf=function(btn){ const cur=ci?ci.value:(sel.className||''); return mergeClass(cur, btn.getAttribute('data-cls'), btn.getAttribute('data-group')); };
    const sw=pz.querySelectorAll('[data-cls]');
    for(let i=0;i<sw.length;i++){
      sw[i].addEventListener('mouseenter', function(){ sendPreviewClass(previewOf(this)); });
      sw[i].addEventListener('mouseleave', function(){ sendClearPreview(); });
      sw[i].addEventListener('focus', function(){ sendPreviewClass(previewOf(this)); });
      sw[i].addEventListener('blur', function(){ sendClearPreview(); });
      sw[i].addEventListener('click', function(){
        const next=previewOf(this);
        sendClearPreview();          // drop the visual preview; the real write takes over via HMR
        if(ci) ci.value=next;
        sendEdit('class', next);
      });
    }
  }
  const ob=document.getElementById('lp-sel-open');
  if(ob) ob.addEventListener('click', function(){ vsapi.postMessage({ type:'lp-open-source', file:sel.file, line:sel.line, col:sel.col }); });
  // LP-4.5 — the ONE BOX: any prompt lands here. Default AUTO = the anchored-task agent (reads
  // the repo, answers or edits in the RIGHT place, diff before keeping). The 'local $0 · só este
  // nó' chip keeps the LP-4 fenced node rewrite intact. The heuristic below only SUGGESTS the
  // local chip when the ask smells node-local — it never decides.
  const bi=document.getElementById('lp-box-in'), bb=document.getElementById('lp-box-b');
  const sendBox=function(){
    const v=bi?bi.value.trim():'';
    if(!v){ showEditResult(false,'prompt-empty'); return; }
    const bc=pth.map(function(c){ return (c&&(c.label||c.tag))||''; }).filter(function(x){ return !!x; }).join(' › ');
    const refs=lpRefs.map(function(r){ return { file:r.file, line:r.line, col:r.col, tag:r.tag }; });
    // LP-4.9 §1 — Perguntar ALWAYS routes to the agent: answering needs to read the repo, which the
    // local $0 moo cannot do. Honest refusal when the SDK bridge is off (no dead "answer" button).
    if(lpIntent==='ask'){
      const br=lpBridge||{ available:false, reason:'sdk-bridge-missing' };
      if(!br.available){ showEditResult(false,(br.reason==='workspace-untrusted')?'workspace-untrusted':'sdk-bridge-missing'); showToast('warn','⚠️ '+toastReason((br.reason==='workspace-untrusted')?'workspace-untrusted':'sdk-bridge-missing')); return; }
      const askMode=(lpMode==='local')?'auto':lpMode; // local can't answer → use the agent tier
      lpStartProgress('🐮 a enviar a pergunta…', true); // instant IN-CANVAS feedback (never mute)
      vsapi.postMessage({ type:'lp-task', instruction:v, mode:askMode, intent:'ask', file:sel.file, line:sel.line, col:sel.col, tag:sel.tag, breadcrumb:bc, refs:refs });
      showEditResult(null,'pending'); return;
    }
    // Editar — the write path. Local $0 fenced rewrite, or the anchored agent (intent:edit).
    // LP-4.9 loop-fix — start the toolbar progress the INSTANT we send, so the in-canvas surface is
    // never mute while the host works (the panel's "a aplicar…" is easy to miss when you watch the site).
    if(lpMode==='local'){
      lpStartProgress('🐮 a reescrever este elemento… (moo local · $0)', false);
      // §5 — the rendered text travels so the host can flag dynamic content on the diff.
      vsapi.postMessage({ type:'lp-prompt', file:sel.file, line:sel.line, col:sel.col, tag:sel.tag, prompt:v, tier:'local', selText:String(sel.text||'').slice(0,200) });
    } else {
      lpStartProgress('🐮 a enviar ao agente…', true);
      vsapi.postMessage({ type:'lp-task', instruction:v, mode:lpMode, intent:'edit', file:sel.file, line:sel.line, col:sel.col, tag:sel.tag, breadcrumb:bc, refs:refs });
    }
    showEditResult(null,'pending');
  };
  // LP-4.9 §1 — the intent toggle. The send button label MIRRORS the intent so the action is never
  // ambiguous, and the local-chip hint only makes sense while EDITING (asking always uses the agent).
  const renderIntentToggle=function(){
    const eb=document.getElementById('lp-mode-edit'), ab=document.getElementById('lp-mode-ask');
    // §3 (a11y) — a radiogroup is a SINGLE tab stop with arrow-key selection: the checked radio is
    // tabbable (tabindex 0), the other is not (tabindex -1). aria-checked + .on reflect the state.
    if(eb){ const on=lpIntent==='edit'; eb.setAttribute('aria-checked', on?'true':'false'); eb.tabIndex=on?0:-1; if(on) eb.classList.add('on'); else eb.classList.remove('on'); }
    if(ab){ const on=lpIntent==='ask'; ab.setAttribute('aria-checked', on?'true':'false'); ab.tabIndex=on?0:-1; if(on) ab.classList.add('on'); else ab.classList.remove('on'); }
    const sb=document.getElementById('lp-box-b'); if(sb) sb.textContent=(lpIntent==='ask')?'💬 Perguntar':'✏️ Editar';
    const bi2=document.getElementById('lp-box-in'); if(bi2) bi2.setAttribute('aria-label', (lpIntent==='ask')?'pergunta ancorada neste elemento':'edição ancorada neste elemento');
    // §5 (honesty) — Perguntar ALWAYS runs on the agent; if the local $0 chip is picked, say so here
    // (no silent "$0" while the run costs subscription). The chip itself stays behind "▾ mais".
    const hint=document.getElementById('lp-box-l');
    if(hint) hint.textContent=(lpIntent==='ask'&&lpMode==='local')
      ? 'Perguntar corre no agente (subscrição), não local · só responde'
      : 'Editar muda o site · Perguntar só responde';
    renderCtxLine(); // §C — keep the project-context line in sync with the intent/tier
  };
  const ebtn=document.getElementById('lp-mode-edit'), abtn=document.getElementById('lp-mode-ask');
  const setIntent=function(v,focus){ lpIntent=v; renderIntentToggle(); const h=document.getElementById('lp-box-hint'); if(h) h.style.display='none'; if(focus){ const t=document.getElementById(v==='ask'?'lp-mode-ask':'lp-mode-edit'); if(t) t.focus(); } };
  if(ebtn) ebtn.addEventListener('click', function(){ setIntent('edit', false); });
  if(abtn) abtn.addEventListener('click', function(){ setIntent('ask', false); });
  // §3 (a11y) — arrow keys move within the radiogroup (2 options → any arrow toggles), APG-style.
  const onToggleKey=function(e){ if(e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='ArrowRight'||e.key==='ArrowDown'){ e.preventDefault(); setIntent(lpIntent==='ask'?'edit':'ask', true); } };
  if(ebtn) ebtn.addEventListener('keydown', onToggleKey);
  if(abtn) abtn.addEventListener('keydown', onToggleKey);
  if(bi&&bb){
    bb.addEventListener('click', sendBox);
    bi.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); sendBox(); } });
    bi.addEventListener('input', function(){
      const h=document.getElementById('lp-box-hint'); if(!h) return;
      // The local-chip suggestion only applies to EDITS (asking always uses the agent).
      if(lpIntent==='edit'&&lpMode!=='local'&&suggestLocalChip(bi.value)){ h.textContent='💡 parece uma mudança só deste nó — o chip "local $0 · só este nó" resolve sem custo'; h.style.display='block'; }
      else h.style.display='none';
    });
  }
  renderIntentToggle();
  // LP-4.9 §2 — progressive disclosure: restore the remembered expanded state and wire "▾ mais".
  const moreBtn=document.getElementById('lp-more'), advEl=document.getElementById('lp-adv');
  const setAdv=function(open){
    if(advEl) advEl.style.display=open?'block':'none';
    if(moreBtn){ moreBtn.setAttribute('aria-expanded', open?'true':'false'); moreBtn.textContent=open?'▴ menos':'▾ ajustes rápidos'; }
    try{ localStorage.setItem('lp-adv-open', open?'1':'0'); }catch(e){}
  };
  let advOpen=false; try{ advOpen=localStorage.getItem('lp-adv-open')==='1'; }catch(e){}
  setAdv(advOpen);
  if(moreBtn) moreBtn.addEventListener('click', function(){ setAdv(advEl?advEl.style.display==='none':true); positionCanvasToolbar(); });
  // LP-4.8 §3 — /skills. Picking a skill SEEDS this one-box with the skill's template and pins the
  // chip to the skill's tier floor (routing surfaced, never hidden). Execution then rides the exact
  // same fenced one-box path (local $0 lp-prompt / anchored lp-task) — /skills adds no write surface.
  wireSkillsMenu();
  // §5 — "resolver com o agente": switch the box to AUTO (honest refusal when the bridge is off).
  const ag=document.getElementById('lp-sel-agent');
  if(ag) ag.addEventListener('click', switchToAgent);
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
    vsapi.postMessage({ type:'lp-delete', preview:true, file:sel.file, line:sel.line, col:sel.col, tag:sel.tag });
    showEditResult(null,'pending');
  });
  renderModeChips();
  renderRefs(); // LP-4.8 §4 — repaint the attached-reference chips (toolbar markup was rebuilt)
  // Anchor the toolbar to the pin now that it is laid out (offsetWidth/Height are measurable).
  if(ctbBody) positionCanvasToolbar(sel.rect);
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
    +'<div class="lp-diff-hd">apagar &lt;'+esc((m&&m.tag)||'elemento')+'&gt; · linha '+esc(m.start==null?'?':m.start)+' — apagar é determinístico: $0, sem tokens</div>'
    +(m.abs?('<div class="lp-diff-hd">✍ '+esc(m.abs)+'</div>'):'')
    +staleWarn
    +exprWarn
    +rows
    +'<div class="lp-sel-acts"><button id="lp-del-apply" class="lp-sel-btn">aplicar — apagar</button><button id="lp-del-cancel" class="lp-sel-btn">cancelar</button></div>'
    +'</div>';
  const ap=document.getElementById('lp-del-apply');
  if(ap) ap.addEventListener('click', function(){
    // review P1-B (parity): target comes from THIS diff (m), not the mutable capture. The source
    // hash still gates the write server-side (the delete must be exactly the approved diff).
    if(m.file==null||m.line==null){ showEditResult(false,'bad-request'); return; }
    vsapi.postMessage({ type:'lp-delete', preview:false, file:m.file, line:m.line, col:m.col, tag:m.tag, h:m.h });
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
    // review P1-B (parity): target + edit come from THIS diff (m), not the mutable capture — a
    // second 'aplicar' typed during the preview can no longer change what this button writes.
    if(m.file==null||m.line==null||!m.edit){ showEditResult(false,'bad-request'); return; }
    vsapi.postMessage({ type:'lp-edit', preview:false, file:m.file, line:m.line, col:m.col, tag:m.tag, edit:m.edit, h:m.h });
    showEditResult(null,'pending');
  });
  const ca=document.getElementById('lp-ed-cancel');
  if(ca) ca.addEventListener('click', function(){ el.innerHTML=''; const g=document.getElementById('lp-edit-msg'); if(g){ g.textContent=''; g.className='lp-ed-msg'; } });
}
// LP-4 §3/§6 — the anchored-prompt diff. The moo (local $0 or the subscription bridge) rewrote
// ONLY this node; the header says WHO answered and shows the ABSOLUTE path of the file that will
// be written (A7 mitigation). "aplicar" echoes the hash — the host re-fences + re-checks at write
// time and a stale apply comes back here regenerated, flagged, with nothing written.
function renderPromptDiff(m){
  const el=document.getElementById('lp-del'); if(!el) return;
  // LP-4.7 — quality exhausted is NOT a dead end: it is the evidence-based escalation OFFER.
  if(m && !m.ok && m.reason==='local-quality-exhausted'){ renderEscalationOffer(m, el); return; }
  if(!m || !m.ok){ el.innerHTML=''; showEditResult(false, (m&&m.reason)||'error'); return; }
  const msg=document.getElementById('lp-edit-msg'); if(msg){ msg.textContent=''; msg.className='lp-ed-msg'; }
  const rem=Array.isArray(m.removed)?m.removed:[]; const add=Array.isArray(m.added)?m.added:[];
  let rows='';
  // LP-4.7 — verified NEW imports land at the top of the file: show them first, honestly apart
  // from the node's own diff (they are a second, deterministic insertion — not part of the node).
  const imps=Array.isArray(m.importsAdded)?m.importsAdded:[];
  for(let i=0;i<imps.length&&i<5;i++) rows+='<div class="lp-diff-l lp-diff-ad">+ '+esc(imps[i])+' <span class="lp-diff-hk">(import verificado — topo do ficheiro)</span></div>';
  for(let i=0;i<rem.length&&i<40;i++) rows+='<div class="lp-diff-l lp-diff-rm">− '+esc(rem[i])+'</div>';
  if(rem.length>40) rows+='<div class="lp-diff-l lp-diff-rm">… +'+(rem.length-40)+' linhas</div>';
  for(let i=0;i<add.length&&i<40;i++) rows+='<div class="lp-diff-l lp-diff-ad">+ '+esc(add[i])+'</div>';
  if(add.length>40) rows+='<div class="lp-diff-l lp-diff-ad">… +'+(add.length-40)+' linhas</div>';
  if(!rows) rows='<div class="lp-diff-l">(sem alterações)</div>';
  // §1 honesty: when best-of-N worked for it, the header says so — the engine is visible, not magic.
  const q=(m.quality&&typeof m.quality==='object')?m.quality:null;
  const qNote=(q&&q.samplesTried>1)?(' · válida à '+q.samplesTried+'ª amostra (ronda '+(q.round||1)+')'):'';
  const who=((!m.tier||m.tier==='local')?'moo local · $0':esc(m.model||tierModel(m.tier))+' · subscrição')+qNote;
  const staleWarn=m.stale?'<div class="lp-sel-warn">⚠ o ficheiro mudou desde a pré-visualização — nada foi escrito. Revê o diff (regenerado) e aplica de novo.</div>':'';
  // §5 — dynamic-content honesty BEFORE aplicar: this write may not change what is rendered.
  const dynWarn=m.dynamic?'<div class="lp-sel-warn">⚠ o conteúdo vem de dentro do componente — reescrever este nó não o muda. <button type="button" id="lp-pr-agent" class="lp-sel-btn">resolver com o agente</button></div>':'';
  el.innerHTML='<div class="lp-diff" role="region" aria-label="Pré-visualização da reescrita">'
    +'<div class="lp-diff-hd">reescrita por prompt · linha '+esc(m.start==null?'?':m.start)+' — '+who+' · cercada: só este nó</div>'
    +(m.abs?('<div class="lp-diff-hd">✍ '+esc(m.abs)+'</div>'):'')
    +staleWarn
    +dynWarn
    +rows
    +'<div class="lp-sel-acts"><button id="lp-pr-apply" class="lp-sel-btn">aplicar — escrever</button><button id="lp-pr-cancel" class="lp-sel-btn">cancelar</button></div>'
    +'</div>';
  const ap=document.getElementById('lp-pr-apply');
  if(ap) ap.addEventListener('click', function(){
    // review P1-B: the write target comes from THIS diff (m), not the mutable global — a second
    // concurrent preview can no longer make the approved diff land on a different node.
    if(m.file==null||m.line==null){ showEditResult(false,'bad-request'); return; }
    vsapi.postMessage({ type:'lp-prompt-apply', file:m.file, line:m.line, col:m.col, tag:m.tag, replacement:m.replacement, newImports:Array.isArray(m.newImports)?m.newImports:[], h:m.h, tier:m.tier, dynamic:!!m.dynamic });
    showEditResult(null,'pending');
  });
  const ga=document.getElementById('lp-pr-agent');
  if(ga) ga.addEventListener('click', switchToAgent);
  const ca=document.getElementById('lp-pr-cancel');
  if(ca) ca.addEventListener('click', function(){ el.innerHTML=''; const g=document.getElementById('lp-edit-msg'); if(g){ g.textContent=''; g.className='lp-ed-msg'; } });
}
// LP-4.7 §2 — the escalation OFFER. The moo local exhausted best-of-N + the exact-error retry;
// the panel shows the EVIDENCE (how many samples, which fence reason) and offers Sonnet — a
// click, never automatic. Bridge absent/untrusted → the button disables with the honest reason
// and the evidence still renders (the user learns WHY it failed either way).
function renderEscalationOffer(m, el){
  const msg=document.getElementById('lp-edit-msg'); if(msg){ msg.textContent=''; msg.className='lp-ed-msg'; }
  const ev=(m&&m.evidence&&typeof m.evidence==='object')?m.evidence:{};
  const why=esc(ev.lastReason||'recusado')+(ev.lastDetail?(' — '+esc(String(ev.lastDetail).slice(0,160))):'');
  const br=lpBridge||{ available:false, reason:'sdk-bridge-missing' };
  const disReason=(br.reason==='no-workspace')
    ? 'sem pasta aberta — abre a pasta do projeto nesta janela primeiro (o agente lê o repo)'
    : (br.reason==='workspace-untrusted')
    ? 'workspace não confiável — confia no workspace (Manage Workspace Trust) para subir para cloud'
    : 'ponte SDK ausente — instala @anthropic-ai/claude-agent-sdk no workspace para subir para cloud';
  el.innerHTML='<div class="lp-diff" role="region" aria-label="Escalação com evidência">'
    +'<div class="lp-diff-hd">moo local ('+esc(ev.model||'?')+') falhou '+esc(ev.rounds==null?'2':ev.rounds)+'× — '+esc(ev.samplesTried==null?'?':ev.samplesTried)+' amostras recusadas pela cerca</div>'
    +'<div class="lp-diff-l lp-diff-rm">último motivo: '+why+'</div>'
    +'<div class="lp-diff-l">nada foi escrito. Subir para Sonnet (subscrição) com o mesmo pedido?</div>'
    +'<div class="lp-sel-acts">'
    +'<button id="lp-esc-t2" class="lp-sel-btn"'+(br.available?'':(' disabled title="'+esc(disReason)+'"'))+'>subir para Sonnet · subscrição</button>'
    +'<button id="lp-esc-cancel" class="lp-sel-btn">cancelar</button>'
    +'</div></div>';
  const up=document.getElementById('lp-esc-t2');
  if(up) up.addEventListener('click', function(){
    if(this.disabled) return;
    if(m.file==null||m.line==null||!m.prompt){ showEditResult(false,'bad-request'); return; }
    vsapi.postMessage({ type:'lp-prompt', file:m.file, line:m.line, col:m.col, tag:m.tag, prompt:m.prompt, tier:'t2', selText:m.selText||'' });
    showEditResult(null,'pending');
  });
  const ca=document.getElementById('lp-esc-cancel');
  if(ca) ca.addEventListener('click', function(){ el.innerHTML=''; const g=document.getElementById('lp-edit-msg'); if(g){ g.textContent=''; g.className='lp-ed-msg'; } });
}
// LP-4.5 — the agent verdict. A QUESTION renders as SAFE markdown (esc-first) + the files it
// read (zero writes — provably: no edits arrive). An EDIT renders every touched file with its
// git diff (scoped to the task) + 'manter tudo' / 'reverter tudo' / per-file revert. Reverts are
// sha-guarded HOST-side against OUR snapshot record — never against paths this webview sends.
function renderTaskResult(m){
  const el=document.getElementById('lp-del'); if(!el) return;
  if(!m || !m.ok){ el.innerHTML=''; showEditResult(false, (m&&m.reason)||'error'); return; }
  const msg=document.getElementById('lp-edit-msg'); if(msg){ msg.textContent=''; msg.className='lp-ed-msg'; }
  const who=(m.mode==='auto'?'AUTO':tierModel(m.mode))+' · agente · subscrição'+(m.model?(' ('+esc(m.model)+')'):'');
  let html='<div class="lp-diff" role="region" aria-label="Resultado do agente">'
    +'<div class="lp-diff-hd">'+(m.kind==='answer'?'resposta do agente':'edições do agente')+' — '+who+'</div>';
  if(m.text) html+='<div class="lp-task-txt">'+renderMarkdownSafe(m.text)+'</div>';
  const reads=Array.isArray(m.filesRead)?m.filesRead:[];
  if(reads.length){
    html+='<div class="lp-task-reads">ficheiros lidos:';
    for(let i=0;i<reads.length&&i<20;i++) html+=' <code>'+esc(reads[i])+'</code>';
    if(reads.length>20) html+=' … +'+(reads.length-20);
    html+='</div>';
  }
  const edits=Array.isArray(m.edits)?m.edits:[];
  for(let i=0;i<edits.length;i++){
    const e=edits[i]||{};
    html+='<div class="lp-diff-hd" style="margin-top:8px">✍ '+esc(e.file||'?')
      +' <button type="button" class="lp-sel-btn lp-task-rv" data-tfile="'+esc(e.file||'')+'" title="repor os bytes anteriores DESTE ficheiro (sha-guarded)">reverter</button>'
      +' <span class="lp-task-st" data-tst="'+esc(e.file||'')+'"></span></div>';
    const lines=Array.isArray(e.diff)?e.diff:null;
    if(!lines){ html+='<div class="lp-diff-l">(diff indisponível — '+esc(e.diffReason||'git-unavailable')+')</div>'; continue; }
    for(let j=0;j<lines.length&&j<80;j++){
      const l=lines[j];
      const cls=l.charAt(0)==='-'?' lp-diff-rm':(l.charAt(0)==='+'?' lp-diff-ad':(l.indexOf('@@')===0?' lp-diff-hk':''));
      html+='<div class="lp-diff-l'+cls+'">'+esc(l)+'</div>';
    }
    if(lines.length>80) html+='<div class="lp-diff-l">… +'+(lines.length-80)+' linhas</div>';
  }
  if(edits.length){
    html+='<div class="lp-sel-acts">'
      +'<button id="lp-task-keep" class="lp-sel-btn" title="aceitar — as edições ficam nos ficheiros (o HMR já as mostra)">manter tudo</button>'
      +'<button id="lp-task-revert-all" class="lp-sel-btn" title="repor os bytes anteriores de TODOS os ficheiros listados (sha-guarded) — nunca fora desta lista">reverter tudo</button>'
      +'</div>';
  }
  html+='</div>';
  el.innerHTML=html;
  const tid=m.taskId;
  const kb=document.getElementById('lp-task-keep');
  if(kb) kb.addEventListener('click', function(){ vsapi.postMessage({ type:'lp-task-keep', taskId:tid }); showEditResult(null,'pending'); });
  const rb=document.getElementById('lp-task-revert-all');
  if(rb) rb.addEventListener('click', function(){ vsapi.postMessage({ type:'lp-task-revert', taskId:tid, all:true }); showEditResult(null,'pending'); });
  const rvs=el.querySelectorAll('[data-tfile]');
  for(let i=0;i<rvs.length;i++){ rvs[i].addEventListener('click', function(){
    vsapi.postMessage({ type:'lp-task-revert', taskId:tid, file:this.getAttribute('data-tfile') });
    showEditResult(null,'pending');
  }); }
}
// Per-file revert/keep outcomes — update the row states in place, honestly (a stale revert says
// so and keeps the button; a reverted file disables its button; keep marks everything kept).
function applyTaskRevertResult(m){
  const msg=document.getElementById('lp-edit-msg'); if(msg){ msg.textContent=''; msg.className='lp-ed-msg'; }
  const results=Array.isArray(m.results)?m.results:[];
  for(let i=0;i<results.length;i++){
    const r=results[i]||{};
    const st=document.querySelector('[data-tst="'+(window.CSS&&CSS.escape?CSS.escape(r.file||''):String(r.file||'').replace(/"/g,''))+'"]');
    const bt=document.querySelector('[data-tfile="'+(window.CSS&&CSS.escape?CSS.escape(r.file||''):String(r.file||'').replace(/"/g,''))+'"]');
    if(st){ st.textContent=r.ok?'↩ revertido':('não revertido: '+(r.reason==='revert-stale'?'o ficheiro mudou entretanto':(r.reason||'erro'))); }
    if(bt&&r.ok) bt.disabled=true;
  }
  if(m.done){
    const kb=document.getElementById('lp-task-keep'); if(kb) kb.disabled=true;
    const rb=document.getElementById('lp-task-revert-all'); if(rb) rb.disabled=true;
  }
}
function applyTaskKeepResult(m){
  const msg=document.getElementById('lp-edit-msg'); if(msg){ msg.textContent=m.ok?'✓ mantido — as edições ficam nos ficheiros':'nada para manter'; msg.className='lp-ed-msg '+(m.ok?'lp-ed-ok':'lp-ed-no'); }
  const sts=document.querySelectorAll('[data-tst]');
  for(let i=0;i<sts.length;i++) sts[i].textContent=m.ok?'✓ mantido':'';
  const bts=document.querySelectorAll('[data-tfile]');
  for(let i=0;i<bts.length;i++) bts[i].disabled=true;
  const kb=document.getElementById('lp-task-keep'); if(kb) kb.disabled=true;
  const rb=document.getElementById('lp-task-revert-all'); if(rb) rb.disabled=true;
}
function tierModel(t){ return t==='t1'?'Haiku':t==='t2'?'Sonnet':t==='t3'?'Opus':t==='fable'?'Fable':'local'; }
// LP-4.5 — the one-box MODE chips. The truth: text/class/delete stay deterministic ($0, no LLM).
// The BOX defaults to AUTO = the anchored-task agent (subscription via the SDK bridge — honest
// chip 'agente · subscrição'): it reads the repo and answers or edits in the RIGHT place, every
// edit behind a diff + revert. 'local $0 · só este nó' is the LP-4 fenced node rewrite, intact.
// Haiku/Sonnet/Opus pin the AGENT's model; @fable is manual only (never auto-routed). Bridge
// absent/untrusted → every agent mode disables with the honest reason and local becomes the
// selection — never a dead button that fails later.
const LP_MODES=[['auto','🤖 AUTO · agente · subscrição'],['local','🐮 local $0 · só este nó'],['t1','Haiku'],['t2','Sonnet'],['t3','Opus'],['fable','@fable']];
function renderModeChips(){
  const el=document.getElementById('lp-chip'); if(!el) return;
  const br=lpBridge||{ available:false, reason:'sdk-bridge-missing' };
  // review P1-A: the disabled-reason is HONEST about which gate failed — trust vs missing SDK.
  const disReason=(br.reason==='no-workspace')
    ? 'sem pasta aberta — abre a pasta do projeto nesta janela primeiro (o agente lê o repo)'
    : (br.reason==='workspace-untrusted')
    ? 'workspace não confiável — o agente corre o Agent SDK do workspace; confia no workspace (Manage Workspace Trust) para ativar'
    : 'ponte SDK ausente — instala @anthropic-ai/claude-agent-sdk no workspace para ativar o agente';
  if(lpMode!=='local'&&!br.available) lpMode='local'; // honest fallback, visible in the chips
  let chips='';
  for(let i=0;i<LP_MODES.length;i++){
    const id=LP_MODES[i][0], lb=esc(LP_MODES[i][1]);
    const dis=(id!=='local')&&!br.available;
    chips+='<button type="button" class="lp-tier'+(lpMode===id?' on':'')+'" data-mode="'+id+'" aria-pressed="'+(lpMode===id?'true':'false')+'"'
      +(dis?(' disabled title="'+esc(disReason)+'"'):'')
      +'>'+lb+'</button>';
  }
  const note = (lpMode==='local')
    ? 'reescrita cercada SÓ deste nó — moo local, $0, nada sai da máquina. texto/classe/apagar continuam determinísticos.'
    : (lpMode==='auto'
      ? 'o agente lê o repo (Read/Grep/Glob) e responde no painel ou edita no sítio CERTO (pode não ser este nó). Bash e rede NUNCA; toda a edição mostra diff + reverter. Corre na subscrição via ponte SDK.'
      : 'o agente corre em '+esc(tierModel(lpMode))+' (subscrição via ponte SDK). Mesmas regras: só Read/Grep/Glob/Edit no workspace, diff + reverter.'
        +(lpMode==='fable'?' @fable é SEMPRE manual — nunca auto-routed.':''));
  el.innerHTML='<div class="lp-chip-hd">🐮 esta caixa: <span class="lp-chip-0">'+(lpMode==='local'?'local · $0 · só este nó':(lpMode==='auto'?'agente · subscrição':esc(tierModel(lpMode))+' · agente · subscrição'))+'</span></div>'
    +'<div class="lp-tiers" role="group" aria-label="Como resolver este prompt">'+chips+'</div>'
    +'<div class="lp-chip-note">'+note+'</div>';
  const btns=el.querySelectorAll('[data-mode]');
  for(let i=0;i<btns.length;i++){ btns[i].addEventListener('click', function(){
    if(this.disabled) return;
    lpMode=this.getAttribute('data-mode');
    renderModeChips();
    // Refresh ONLY the box hint in place — NEVER re-render the panel here (it would wipe a
    // prompt the user already typed).
    const bi2=document.getElementById('lp-box-in'), h=document.getElementById('lp-box-hint');
    if(h){ if(bi2&&lpMode!=='local'&&suggestLocalChip(bi2.value)){ h.textContent='💡 parece uma mudança só deste nó — o chip "local $0 · só este nó" resolve sem custo'; h.style.display='block'; } else h.style.display='none'; }
  }); }
  // W2 — the ctx line AND the honest context chip must track EVERY tier change (incl. the →local
  // fallback above): renderCtxLine reflects the current lpMode, so a switch to 'local $0' drops the
  // '📚 repo ✓' chip instead of leaving it lying. Cheap (two elements); safe if the toolbar is absent.
  renderCtxLine();
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
    'preview-tree-mismatch':'o preview não vem desta árvore (ou o marcador dev não está presente) — reinicia o dev server neste workspace',
    'no-selection':'sem elemento fixado — clica 🎯 e escolhe um elemento no preview primeiro (sem âncora, o agente pergunta em vez de adivinhar)',
    'parser-unavailable':'motor de edição indisponível — reinstala o plugin (dependência em falta)',
    'bad-request':'pedido inválido', 'bad-value':'valor inválido', refused:'edição recusada', error:'erro a aplicar a edição',
    // LP-4 §6 — honest states for the prompt/undo flows: the model path, the fence, and the moo.
    'model-applied':'✓ escrito — o moo reescreveu SÓ este elemento (o HMR atualiza o preview)',
    'model-applied-dynamic':'✓ escrito no ficheiro — mas o conteúdo rendido vem de dentro do componente: se o preview não mudou, resolve com o agente',
    undone:'↩ desfeito — os bytes anteriores foram repostos ($0, splice inverso)',
    'undo-stale':'o ficheiro mudou desde a última escrita do Live Edit — desfazer recusado (nada foi escrito)',
    'nothing-to-undo':'nada para desfazer nesta sessão',
    'task-busy':'já há uma tarefa do agente a correr — espera que termine (ou cancela-a) antes de lançar outra',
    'prompt-empty':'escreve primeiro o que queres mudar',
    'node-too-large':'este elemento é grande demais para reescrita por prompt — edita no editor',
    'local-model-offline':'moo local offline — arranca o Ollama (ollama serve) ou sobe para cloud',
    'local-model-timeout':'o moo local demorou demasiado (30s) — tenta de novo ou sobe para cloud',
    'local-model-empty':'o moo local devolveu vazio — reformula o prompt',
    'local-model-error':'o moo local falhou — vê o Ollama',
    'sdk-bridge-missing':'ponte SDK ausente — instala @anthropic-ai/claude-agent-sdk no workspace para subir para cloud',
    'no-workspace':'sem pasta aberta — abre a pasta do projeto nesta janela (o agente lê o repo)',
    'workspace-untrusted':'workspace não confiável — a subida para cloud corre o Agent SDK do workspace; confia no workspace para ativar',
    'cloud-bridge-error':'a ponte cloud falhou — vê a sessão do Claude Code',
    'cloud-model-timeout':'o modelo cloud demorou demasiado — tenta de novo',
    'cloud-model-empty':'o modelo cloud devolveu vazio — reformula o prompt',
    'replacement-has-comments':'o modelo devolveu comentários — recusado pela cerca, nada foi escrito',
    'replacement-parse-error':'o modelo devolveu JSX inválido — recusado pela cerca, nada foi escrito',
    'not-single-root':'o modelo devolveu mais do que um elemento — recusado pela cerca, nada foi escrito',
    'replacement-trailing-junk':'o modelo devolveu lixo fora do elemento — recusado pela cerca, nada foi escrito',
    'empty-replacement':'o modelo devolveu vazio — recusado pela cerca',
    'range-not-a-node':'o alvo já não é um nó válido — reselecciona',
    'splice-breaks-parse':'a reescrita partiria o ficheiro — recusado pela cerca, nada foi escrito',
    // LP-4.7 — the asset/import fence + the quality engine, each refusal with its real cause.
    'local-quality-exhausted':'o moo local esgotou as tentativas — vê a oferta de escalação',
    'import-unresolved':'o modelo inventou um package que o projecto não tem — recusado, nada foi escrito',
    'lucide-name-unknown':'ícone lucide inexistente (a v1.0 removeu os brand icons) — recusado, nada foi escrito',
    'import-not-an-import':'new_imports trazia algo que não é um import — recusado pela cerca',
    'import-has-comments':'o import trazia comentários — recusado pela cerca, nada foi escrito',
    'import-trailing-junk':'o import trazia lixo extra — recusado pela cerca, nada foi escrito',
    'import-conflicts':'o import colide com um já existente no ficheiro — recusado, nada foi escrito',
    'import-file-missing':'o import aponta para um ficheiro que não existe — recusado',
    'import-outside-workspace':'o import sai do workspace — recusado',
    'too-many-imports':'imports novos a mais — recusado pela cerca',
    'import-verifier-unavailable':'verificador de imports indisponível — reinstala o plugin (nada foi escrito)',
    'imports-break-parse':'inserir os imports partiria o ficheiro — recusado pela cerca',
    'import-parse-error':'import ilegível — recusado pela cerca',
    // LP-4.5 — honest states for the anchored-task agent.
    'task-timeout':'o agente demorou demasiado (180s) — tenta um pedido mais pequeno',
    'task-bridge-error':'a ponte do agente falhou — vê a sessão do Claude Code',
    'task-empty':'o agente devolveu vazio — reformula o pedido',
    'revert-stale':'o ficheiro mudou desde a edição do agente — reverter recusado (nada foi escrito)',
    'revert-unavailable':'não consigo garantir o reverter deste ficheiro (sem marca da edição) — recusado para não sobrepor bytes de outrem' };
  const txt=map[reason]||(ok?'✓ ok':'não aplicado ('+reason+')');
  el.textContent=txt; el.className='lp-ed-msg '+(ok?'lp-ed-ok':'lp-ed-no');
}
// LP-4.8 §1 — the webview itself resizing (panel drag, window resize) moves the iframe's offset
// within the frame wrap, so re-anchor the toolbar from the last known pin rect (iframe coords).
window.addEventListener('resize', function(){ positionCanvasToolbar(); });
// LP-4.8 §5 — keyboard/a11y. Esc DISMISSES the in-canvas toolbar, but only when focus is inside it
// (so it never steals VS Code's global Esc), and never preventDefaults globally. If the /skills menu
// is open, its own handler closes the menu first (it stopPropagations, so we don't also hide). After
// hiding, focus returns to the 🎯 toggle so keyboard users are never stranded on a removed node. Tab
// navigates the controls natively — they are real buttons/inputs in a sensible DOM order.
(function(){
  const ctb=document.getElementById('lp-ctb'); if(!ctb) return;
  ctb.addEventListener('keydown', function(e){
    if(e.key!=='Escape') return;
    const menu=document.getElementById('lp-sk-menu');
    if(menu && menu.style.display!=='none') return; // the menu's Esc handler owns this
    e.stopPropagation();
    hideCanvasToolbar();
    const sb=document.getElementById('lp-select-btn'); if(sb) sb.focus();
  });
})();
// LP-4.9 §7 — toolbar chrome (wired once on the static header): close (X), minimize (🐮 chip),
// re-expand, and drag. The X is the obvious close affordance alongside Esc; minimize collapses to a
// single chip; drag repositions (with the auto-anchor as the WCAG 2.5.7 no-drag alternative).
(function(){
  const ctb=document.getElementById('lp-ctb'), chip=document.getElementById('lp-ctb-chip'),
        xb=document.getElementById('lp-ctb-x'), mn=document.getElementById('lp-ctb-min'),
        grip=document.getElementById('lp-ctb-grip'), wrap=document.getElementById('lp-framewrap');
  if(!ctb) return;
  if(xb) xb.addEventListener('click', function(){ hideCanvasToolbar(); const sb=document.getElementById('lp-select-btn'); if(sb) sb.focus(); });
  // LP-4.9 §8 — cancel the running agent task (host aborts it; result comes back 'task-cancelled').
  const cancelBtn=document.getElementById('lp-progress-cancel');
  if(cancelBtn) cancelBtn.addEventListener('click', function(){ vsapi.postMessage({ type:'lp-task-cancel' }); lpUpdateProgress('a cancelar…'); });
  // LP-4.9 §4 — coach marks: "?" re-opens help; next steps through / dismisses; skip + Esc dismiss.
  const helpBtn=document.getElementById('lp-ctb-help');
  if(helpBtn) helpBtn.addEventListener('click', function(){ showCoachMarks(); });
  const coachNext=document.getElementById('lp-coach-next'), coachSkip=document.getElementById('lp-coach-skip'), coach=document.getElementById('lp-coach');
  if(coachNext) coachNext.addEventListener('click', function(){ if(lpCoachStep>=LP_COACH.length-1){ dismissCoachMarks(); const sb=document.getElementById('lp-select-btn'); if(sb) sb.focus(); } else { lpCoachStep++; renderCoachStep(); } });
  if(coachSkip) coachSkip.addEventListener('click', function(){ dismissCoachMarks(); });
  if(coach) coach.addEventListener('keydown', function(e){
    if(e.key==='Escape'){ e.stopPropagation(); dismissCoachMarks(); return; }
    // §2 — trap Tab within the dialog's buttons so focus never lands on the inert background.
    if(e.key==='Tab'){
      const f=coach.querySelectorAll('button'); if(!f.length) return;
      const first=f[0], last=f[f.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  });
  const minimize=function(){ lpToolbarMin=true; ctb.style.display='none'; ctb.setAttribute('aria-hidden','true'); if(chip){ chip.style.display='inline-flex'; } positionCanvasToolbar(); if(chip) chip.focus(); };
  const expand=function(){ lpToolbarMin=false; if(chip) chip.style.display='none'; ctb.style.display='block'; ctb.setAttribute('aria-hidden','false'); positionCanvasToolbar(); ctb.focus(); };
  if(mn) mn.addEventListener('click', minimize);
  if(chip) chip.addEventListener('click', expand);
  // Drag via the grip. Pointer events; updates lpToolbarManualPos (clamped by positionCanvasToolbar).
  if(grip){
    let dragging=false, ox=0, oy=0;
    grip.addEventListener('pointerdown', function(e){
      dragging=true; const r=ctb.getBoundingClientRect(), wr=wrap?wrap.getBoundingClientRect():{left:0,top:0};
      ox=e.clientX-(r.left-wr.left); oy=e.clientY-(r.top-wr.top);
      try{ grip.setPointerCapture(e.pointerId); }catch(err){}
      e.preventDefault();
    });
    grip.addEventListener('pointermove', function(e){
      if(!dragging||!wrap) return;
      const wr=wrap.getBoundingClientRect();
      lpToolbarManualPos={ x:e.clientX-wr.left-ox, y:e.clientY-wr.top-oy };
      positionCanvasToolbar();
    });
    const stop=function(e){ if(dragging){ dragging=false; try{ grip.releasePointerCapture(e.pointerId); }catch(err){} } };
    grip.addEventListener('pointerup', stop);
    grip.addEventListener('pointercancel', stop);
  }
})();
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
    else if (m.type === 'lp-hmr-down'){ setHmrStale(true); } // F2 (P1-7) — hot-reload channel dropped: the preview may be stale (origin-locked)
    else if (m.type === 'lp-hmr-up'){ setHmrStale(false); } // F2 — reconnected: clear the honest stale banner
    else if (m.type === 'lp-nav'){ if (typeof m.path === 'string') reflectRoute(m.path.slice(0,2048)); } // MP3.3: current route from the tap (popstate + Link nav)
    else if (m.type === 'lp-state'){
      if (typeof m.path === 'string'){
        lpState = { path: m.path.slice(0,2048), scrollY: (typeof m.scrollY === 'number' && isFinite(m.scrollY)) ? m.scrollY : 0 };
        vsapi.postMessage({ type:'lp-state', path: lpState.path, scrollY: lpState.scrollY });
      }
    }
    else if (m.type === 'lp-ready'){ vsapi.postMessage({ type:'lp-tree', servedRoot: (typeof m.servedRoot==='string') ? m.servedRoot : null }); lpSendRestore(); } // FIX-MP-1 — relay served-tree identity early (origin-locked, same as every tap message)
    // MP5.1 — a click in select mode. The origin lock above already vetted the sender; render the
    // selection panel. lp-select-mode-off is the tap telling us the user pressed Esc inside the frame.
    else if (m.type === 'lp-select'){ vsapi.postMessage({ type:'lp-tree', servedRoot: (typeof m.servedRoot==='string') ? m.servedRoot : null }); lpSelection={ file:m.file, line:m.line, col:m.col, tag:m.tag, rect:m.rect, text:m.text, className:m.className, path:Array.isArray(m.path)?m.path.slice(0,12):[], repeated:(typeof m.repeated==='number'&&m.repeated>1)?m.repeated:0 }; vsapi.postMessage({ type:'lp-pin', file:m.file, line:m.line, col:m.col, tag:m.tag, selText:(typeof m.text==='string')?m.text.slice(0,200):'' }); renderSelection(lpSelection); } // FIX-MP-1 relay served-tree identity + F3 (W1) relay the pin to the host SelectionStore (both origin-locked)
    // LP-4.8 §1 — the tap re-emits the pin's box on every scroll/resize reflow so the in-canvas
    // toolbar follows the element. Benign: a read-only rect on the SAME origin-locked channel as
    // lp-select; it only nudges the toolbar's position, never touches the write path.
    else if (m.type === 'lp-pin-rect'){ if(m.rect && typeof m.rect.x==='number') positionCanvasToolbar(m.rect); }
    // LP-4.8 §4 — a Cmd/Ctrl-click attached a node as a reference. Dedup by stamp, cap at 8, then
    // repaint the ref chips. Read-only context (origin-locked branch, same as lp-select).
    else if (m.type === 'lp-attach'){
      if(m.file && lpRefs.length<8){
        const dup=lpRefs.some(function(r){ return r.file===m.file && r.line===m.line && r.col===m.col && r.tag===m.tag; });
        if(!dup){ lpRefs.push({ file:m.file, line:m.line, col:m.col, tag:m.tag, label:(typeof m.label==='string')?m.label.slice(0,40):'' }); renderRefs(); }
      }
    }
    else if (m.type === 'lp-select-mode-off'){ setSelectMode(false); lpRefs=[]; renderRefs(); }
    return;
  }
  // ── TRUSTED HOST branch. Accept ONLY host messages bearing the shared secret (unchanged from
  //    MP2). The framed iframe cannot read HOST_TOKEN, so it cannot forge this.
  if (m.__t !== HOST_TOKEN) return;
  if (m.type === 'lp-snapshot'){
    lpNoWorkspace = !!(m.s && m.s.leBridge && m.s.leBridge.reason === 'no-workspace'); // F0.5.1 — empty-window signal for applyStage
    render(m.s); applyStage(m.s && m.s.stage); applyError(m.s && m.s.stageError); populateRoutes(m.s && m.s.routes);
    // LP-4 §6 — the SDK-bridge status rides the snapshot; refresh the chip when it changes so the
    // cloud tiers enable/disable from FACTS (never a dead button).
    const br=m.s && m.s.leBridge;
    if(br && (!lpBridge || lpBridge.available!==br.available)){ lpBridge=br; if(document.getElementById('lp-chip')) renderModeChips(); renderCtxLine(); }
    else if(br) lpBridge=br;
    // LP-4.5 §4 — the unified feed rides the snapshot; re-render ONLY when its revision moves so
    // a poll never steals focus from a feed button mid-click.
    const fd=m.s && m.s.feed;
    if(fd && typeof fd.rev==='number' && fd.rev!==lpFeedRev){
      lpFeedRev=fd.rev;
      lpFeedItems=Array.isArray(fd.items)?fd.items:[]; // F0.2 — keep the items so renderSelection can show THIS node's history
      const fe=document.getElementById('lp-feed');
      if(fe){
        fe.innerHTML=renderEditsFeed(fd.items);
        const bs=fe.querySelectorAll('[data-feed-rv]');
        for(let i=0;i<bs.length;i++){ bs[i].addEventListener('click', function(){ vsapi.postMessage({ type:'lp-feed-revert', id:this.getAttribute('data-feed-rv') }); }); }
      }
    }
  }
  else if (m.type === 'lp-goto'){ if (typeof m.url === 'string') navFrameTo(m.url); } // MP3.3: host-vetted same-origin navigation
  else if (m.type === 'lp-edit-result'){
    showEditResult(m.ok, m.reason); // MP5.1 honest deterministic-edit feedback
    // MP5.2a/LP-4 — once a write lands, the pending mini-diff is history: clear it.
    if (m.ok && (m.reason === 'deleted' || m.reason === 'applied' || m.reason === 'model-applied' || m.reason === 'model-applied-dynamic')){
      const d=document.getElementById('lp-del'); if(d) d.innerHTML='';
      // LP-4.9 §3 — HONEST cost in the toast: "$0" appears ONLY for deterministic/local writes. A
      // fenced rewrite escalated to a cloud tier (m.tier t1/t2/t3/fable) says the tier + subscrição,
      // never a false $0 (verified by the honesty adversarial pass).
      let okToast;
      if(m.reason==='model-applied-dynamic') okToast='✓ escrito · se o preview não mudou, o conteúdo vem de dentro do componente';
      else if(m.reason==='model-applied' && m.tier && m.tier!=='local') okToast='✓ escrito · '+tierModel(m.tier)+' · subscrição';
      else okToast='✓ aplicado no preview · $0';
      showToast('ok', okToast);
      lpFinishProgress(); sendFlash();
    } else if (!m.ok) { showToast('warn', '⚠️ '+toastReason(m.reason)); lpFinishProgress(); }
  }
  else if (m.type === 'lp-delete-diff'){ renderDeleteDiff(m); } // MP5.2a delete preview (mini-diff before any write)
  else if (m.type === 'lp-edit-diff'){ renderEditDiff(m); } // LP-4 §0 edit preview (fence simétrica: diff + hash antes de escrever)
  else if (m.type === 'lp-prompt-diff'){
    renderPromptDiff(m); // LP-4 §3 fenced model rewrite preview
    // LP-4.9 loop-fix — the local rewrite is preview-first (diff lands in the panel to approve). Say
    // so IN-CANVAS so the user knows to look right; and surface failures as a toast, never silent.
    lpFinishProgress();
    if(!m.ok){
      if(m.reason==='local-quality-exhausted') showToast('warn','⚠️ o moo local não ficou confiante — vê a opção de subir de tier no painel →');
      else showToast('warn','⚠️ '+toastReason(m.reason));
    } else {
      showToast('ask','📝 proposta pronta — revê e aplica no painel →');
    }
  }
  else if (m.type === 'lp-prompt-status'){
    // §6 — honest thinking state: WHO is thinking and what it costs, while it thinks.
    // LP-4.7 — the quality engine narrates round/sample so a best-of-N burst never looks hung.
    if(m.phase==='thinking'){
      const prog=(m.round&&m.sample)?(' · ronda '+m.round+'/'+(m.rounds||2)+' · amostra '+m.sample+'/'+(m.of||5)):'';
      const txt=(!m.tier||m.tier==='local')?('🐮 a pensar… (moo local · $0'+prog+')'):('🐮 a pensar… ('+tierModel(m.tier)+' · subscrição)');
      const el=document.getElementById('lp-edit-msg');
      if(el){ el.textContent=txt.replace(/^🐮 /,''); el.className='lp-ed-msg lp-ed-pending'; }
      // LP-4.9 §8 — the local fenced rewrite is fast (≤30s) and not externally cancellable in v1.
      lpStartProgress(txt, false);
    }
  }
  else if (m.type === 'lp-task-status'){
    // LP-4.5 — live agent progress: what it is doing RIGHT NOW (a ler X / a editar Y), plus every
    // denial (honesty: the fence is visible, not implied).
    const el=document.getElementById('lp-edit-msg');
    let txt='';
    if(m.phase==='thinking') txt='🐮 a pensar… ('+(m.mode==='auto'?'AUTO':tierModel(m.mode))+' · subscrição)';
    else if(m.phase==='tool') txt=((m.tool==='Edit'||m.tool==='MultiEdit')?'✎ a editar ':'👁 a ler ')+(m.path||'…');
    else if(m.phase==='deny') txt='🛡 ferramenta negada: '+(m.tool||'?')+(m.why?(' ('+m.why+')'):'');
    if(el&&txt){ el.textContent=txt.replace(/^🐮 /,''); el.className='lp-ed-msg lp-ed-pending'; }
    // LP-4.9 §8 — the toolbar spinner mirrors it, with cancel (the agent run can be aborted).
    if(m.phase==='thinking') lpStartProgress(txt, true); else if(txt) lpUpdateProgress(txt);
  }
  else if (m.type === 'lp-task-result'){
    renderTaskResult(m); // LP-4.5 agent verdict (answer or per-file diffs)
    lpFinishProgress(); // LP-4.9 §8 — the run ended; stop the spinner (the toast says the outcome)
    // LP-4.9 §3 — honest completion toast: answered (panel), edited (preview + flash), or refused.
    if(!m.ok){ showToast('warn', '⚠️ '+toastReason(m.reason)); }
    else if(m.kind==='answer' || !(Array.isArray(m.edits)&&m.edits.length)){ showToast('ask', '💬 resposta no painel →'); }
    else { showToast('ok', '✓ aplicado no preview'); sendFlash(); }
  }
  else if (m.type === 'lp-task-revert-result'){ applyTaskRevertResult(m); } // LP-4.5 per-file revert outcomes
  else if (m.type === 'lp-task-keep-result'){ applyTaskKeepResult(m); } // LP-4.5 keep-all outcome
  else if (m.type === 'lp-repin'){ sendRepin(m); } // LP-4 §5 host-vetted re-pin forwarded into the frame
  else if (m.type === 'lp-security-result'){
    // LP-5 §C — 🛡 review verdict: render into #lp-security via the serialised PURE renderer
    // (same fn.toString() trick as the presets bar). m carries {secrets,xss,csp,audit,scannedFiles}
    // or {error:'scan-failed'} — renderSecurityFindings is fail-soft either way.
    const secBtn2=document.getElementById('lp-security-btn'); if(secBtn2) secBtn2.disabled=false;
    const secEl2=document.getElementById('lp-security');
    if(secEl2){ secEl2.style.display='block'; secEl2.innerHTML=renderSecurityFindings(m, esc); }
  }
  else if (m.type === 'lp-publish-status-result'){
    // LP-6 §B — status snapshot (branch, touched files, Vercel link + expected project name,
    // open-Critical flag, last known deploy URL). Rendered via the serialised PURE renderer, same
    // fn.toString() contract as the security findings above.
    lpPublishState = m;
    const el=document.getElementById('lp-publish');
    if(el){ el.style.display='block'; el.innerHTML=renderPublishPopover(lpPublishState, esc); }
  }
  else if (m.type === 'lp-publish-result'){
    // LP-6 §C/D — outcome of a commit+push or a deploy attempt. Merged into the last known state
    // and re-rendered; NEVER assumed ok — the host's payload is the only source of truth.
    lpPublishState = Object.assign({}, lpPublishState, { lastResult: m });
    const el=document.getElementById('lp-publish');
    if(el){ el.innerHTML=renderPublishPopover(lpPublishState, esc); }
    if(m.action==='deploy' && m.ok){ vsapi.postMessage({ type:'lp-publish-status' }); } // refresh → shows the new site URL
    if(m.action==='commit'){ vsapi.postMessage({ type:'lp-publish-status' }); } // refresh → touched files should now be empty
  }
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
// LP-5 §C — 🛡 Review Security: a GLOBAL action (not per-pin). Click → the host bounded-walks the
// workspace + runs the 4 pure scanners + npm audit, all local, $0; the result renders into
// #lp-security via the serialised renderSecurityFindings (same fn.toString() trick as presets).
const secBtn=document.getElementById('lp-security-btn');
if(secBtn) secBtn.addEventListener('click', function(){
  const secEl=document.getElementById('lp-security');
  if(secEl){ secEl.style.display='block'; secEl.innerHTML='<div class="lp-sec-hdr">🛡 a analisar… ($0 local)</div>'; }
  secBtn.disabled=true;
  vsapi.postMessage({ type:'lp-security-scan' });
});
// LP-6 §E — 🚀 Publish: opens/closes the popover (fetches fresh status on every open — the
// touched files / Critical flag / Vercel link can all have changed since the last look), then
// delegates every click INSIDE #lp-publish (the popover's own content is replaced by innerHTML on
// every re-render, so listeners are attached ONCE here on the stable container, never re-bound).
const pubBtn=document.getElementById('lp-publish-btn');
if(pubBtn) pubBtn.addEventListener('click', function(){
  const el=document.getElementById('lp-publish');
  if(el && el.style.display==='block'){ el.style.display='none'; return; } // toggle closed, no re-fetch
  if(el){ el.style.display='block'; el.innerHTML='<div class="lp-pub-hdr">🚀 a preparar…</div>'; }
  vsapi.postMessage({ type:'lp-publish-status' });
});
const pubEl=document.getElementById('lp-publish');
if(pubEl) pubEl.addEventListener('click', function(e){
  const t=e.target; if(!t || !t.id) return;
  if(t.id==='lp-pub-review-btn'){ const b=document.getElementById('lp-security-btn'); if(b) b.click(); return; }
  if(t.id==='lp-pub-commit-btn'){
    if(!lpPublishState || !Array.isArray(lpPublishState.touchedFiles) || !lpPublishState.touchedFiles.length) return;
    const msgEl=document.getElementById('lp-pub-msg');
    const message=(msgEl && msgEl.value ? msgEl.value : (lpPublishState.defaultMessage||'')).trim();
    if(!message) return;
    t.disabled=true;
    vsapi.postMessage({ type:'lp-publish-commit', files: lpPublishState.touchedFiles.map(function(f){ return (f&&f.path)||f; }), message: message });
    return;
  }
  if(t.id==='lp-pub-deploy-open'){ const gate=document.getElementById('lp-pub-gate'); if(gate) gate.style.display='block'; return; }
  if(t.id==='lp-pub-deploy-cancel'){ const gate=document.getElementById('lp-pub-gate'); if(gate) gate.style.display='none'; return; }
  if(t.id==='lp-pub-deploy-confirm'){
    // Client-side check is a UX courtesy ONLY — the host re-reads .vercel/project.json itself and
    // is the ONLY thing that can actually authorise the deploy (see extension.js _publishDeploy).
    const input=document.getElementById('lp-pub-gate-input');
    const typed=input ? input.value.trim() : '';
    const expected=lpPublishState && lpPublishState.projectName;
    if(!typed || !expected || typed!==expected) return;
    t.disabled=true;
    vsapi.postMessage({ type:'lp-publish-deploy', projectName: typed });
    return;
  }
});
// LP-4.5 §6 — device toggle: 📱390 · 📱768 · 💻 full. Honest and cheap: ONLY the iframe width
// changes (real responsive breakpoints in the user's own dev server) — no UA spoofing claimed.
function setDevice(px){
  const f=document.getElementById('lp-frame'), w=document.getElementById('lp-framewrap');
  if(!f||!w) return;
  if(px){ f.style.width=px+'px'; f.style.maxWidth='100%'; w.classList.add('lp-dev-narrow'); }
  else { f.style.width='100%'; f.style.maxWidth=''; w.classList.remove('lp-dev-narrow'); }
  const map=[['lp-dev-390',390],['lp-dev-768',768],['lp-dev-full',null]];
  for(let i=0;i<map.length;i++){ const b=document.getElementById(map[i][0]); if(b) b.setAttribute('aria-pressed', map[i][1]===px?'true':'false'); }
  // D1 — HONEST effective width: the preset caps at 100% of the panel (maxWidth:100%), so a 768px request
  // can render narrower. Read the real width and, when it falls short, say so instead of promising a lie.
  const note=document.getElementById('lp-dev-note');
  if(note){
    try{
      if(!px){ note.style.display='none'; note.textContent=''; }
      else {
        let eff=0; try{ eff=Math.round(f.getBoundingClientRect().width)||f.clientWidth||0; }catch(_){ eff=0; }
        if(eff && eff < px-1){ note.textContent='⚠ '+px+'px pedido · '+eff+'px efetivo — o painel limita (alarga a janela ou recolhe o lado)'; note.style.display='inline'; }
        else { note.style.display='none'; note.textContent=''; }
      }
    }catch(_){ /* note is best-effort */ }
  }
}
(function(){
  const d3=document.getElementById('lp-dev-390');
  if(d3) d3.addEventListener('click', ()=> setDevice(390));
  const d7=document.getElementById('lp-dev-768');
  if(d7) d7.addEventListener('click', ()=> setDevice(768));
  const df=document.getElementById('lp-dev-full');
  if(df) df.addEventListener('click', ()=> setDevice(null));
})();
</script>
</body></html>`;
}

function activate(ctx) {
  const data = new DataService();
  ctx.subscriptions.push({ dispose: () => data.dispose() });
  makeStatusBar(ctx, data);
  const cockpitProvider = new CockpitProvider(ctx, data);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider('mooterCockpit', cockpitProvider));
  // F1 · progressive disclosure — reveal/fold the advanced tabs (Setup·Agents·Decisions·Doctor).
  // Focuses the cockpit first, then toggles; one retry covers a just-created (not-yet-ready) webview.
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.showAdvancedViews', async () => {
    try { await vscode.commands.executeCommand('mooterCockpit.focus'); } catch { /* best-effort */ }
    const post = () => { const v = cockpitProvider._view; if (v && v.webview) { try { v.webview.postMessage({ type: 'mooter-adv', action: 'toggle' }); } catch { /* best-effort */ } return true; } return false; };
    if (!post()) setTimeout(post, 350);
  }));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.openCockpit', () => vscode.commands.executeCommand('mooterCockpit.focus')));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.newSession', newSession));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.openSessionTab', openSessionTab)); // Deck Floor (Fase 2): wave=sessão=aba deep-link
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.refresh', () => data.refresh(true)));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.setupWizard', () => vscode.commands.executeCommand('mooterCockpit.focus')));
  // Live Preview · MP1 — singleton WebviewPanel, ViewColumn.Beside (reveals if already open).
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.openLivePreview', () => LivePreviewPanel.createOrReveal(ctx)));
  data.start();
}
function deactivate() {}
module.exports = { activate, deactivate };

// ───────────────────────── webview ─────────────────────────
// ───────────────────────── webview v0.3 ─────────────────────────
function getHtml(guardianPct = null) {
  const nonce = crypto.randomBytes(16).toString('hex'); // P1-3: CSPRNG CSP nonce
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
  /* F1 · progressive disclosure — the advanced tabs (Setup·Agents·Decisions·Doctor) fold away by
     default so the deck reads calm; "Mooter: Show advanced views" flips body.mooter-adv-hidden.
     Nothing loses access — the overflow returns intact when revealed. */
  body.mooter-adv-hidden .taboverflow{display:none}
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
  .hwc-nd{opacity:.8}/* F2 · grouped honest absence chip — muted so absences don't compete with live signals */
  /* 🏁 Pipeline conveyor */
  .pipeline{margin:0 0 8px;padding:6px 8px;border:1px solid var(--vscode-widget-border);border-radius:8px;background:var(--vscode-editorWidget-background)}
  .prail{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
  .pstage{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;padding:2px 8px;border-radius:8px;border:1px solid var(--vscode-widget-border);background:var(--vscode-input-background)}
  .pstage.bott{border-color:var(--warn);color:var(--warn)}
  .pstage-nd{opacity:.5}/* F2 · un-sourced stage (spec/plan have no per-session signal yet) — muted, not measured-empty */
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
  /* ─────────────────────────────────────────────────────────────────────────
     Calm Layout v1 (cockpit layout UX) — ADDITIVE refinements only. Layered at
     the end so it overrides earlier rules by order; !important only where inline
     styles on lens/herd/fleet cards would otherwise win. No markup changed.
     Goal: one clear hierarchy — hero anchors, sections breathe, telemetry recedes.
     ───────────────────────────────────────────────────────────────────────── */
  /* rhythm — let vertical space carry the structure instead of stacked borders */
  #v-cockpit>.card,#v-cockpit>.lens,#v-cockpit>.pincard{margin-bottom:12px!important}
  #v-cockpit>.card{border-radius:10px;border-color:color-mix(in srgb,var(--vscode-widget-border) 65%,transparent)}
  #v-cockpit>.card:not(.hero):not(.collapsed){padding:14px 14px}
  /* hero — the ONE number that matters gets weight, air, and a softer frame */
  #v-cockpit>.card.hero{padding:17px 16px 15px;border-radius:13px;border-color:color-mix(in srgb,var(--g) 55%,transparent)}
  .hero .big{font-size:35px;line-height:1.05;letter-spacing:-.6px;margin:1px 0 3px}
  .hero .lbl{font-size:10.5px;margin-bottom:3px}
  /* section headers — consistent, quiet, a touch more air so each card reads as one block */
  #v-cockpit .card>.collaphead,#v-cockpit .lens>.collaphead,#v-cockpit .pincard>.collaphead{
    font-size:10.5px;letter-spacing:.6px;opacity:.9}
  #v-cockpit .card>.collaphead:hover,#v-cockpit .lens>.collaphead:hover{opacity:1}
  /* collapsed telemetry — a quiet, tappable row (▸ label), not a wall of data */
  #v-cockpit .card.collapsed,#v-cockpit .lens.collapsed{padding:9px 14px!important;opacity:.72;
    transition:opacity .12s ease;background:color-mix(in srgb,var(--vscode-editorWidget-background) 60%,transparent)}
  #v-cockpit .card.collapsed:hover,#v-cockpit .lens.collapsed:hover{opacity:1}
  #v-cockpit .card.collapsed .chev,#v-cockpit .lens.collapsed .chev{opacity:.6}
  /* command bar — settle it into the chrome instead of competing as a loud pill */
  .intentwrap{margin:9px 0 12px}
  /* de-escalate the secondary red: keep the inbox turn loud, calm the rest */
  #v-cockpit .pincard{border-color:color-mix(in srgb,var(--acc-warm) 45%,transparent)}
  @media (prefers-reduced-motion:reduce){#v-cockpit .card.collapsed,#v-cockpit .lens.collapsed{transition:none}}
</style></head><body class="mooter-adv-hidden">
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
<div class="view" id="view-arch"><div id="v-arch"><div class="empty">🔌 Arquitectura · system map — a ligar…</div></div></div>
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
// F1 · advanced views (Setup·Agents·Decisions·Doctor) are hidden by default. The command
// "Mooter: Show advanced views" posts {type:'mooter-adv'} to flip this; the choice persists per webview.
var ADV_TABS={setup:1,herd:1,decisions:1,doctor:1};
function applyAdv(on){var b=document.body;if(!b)return;if(on)b.classList.remove('mooter-adv-hidden');else b.classList.add('mooter-adv-hidden');
  var ov=document.getElementById('taboverflow');if(ov&&on){try{ov.open=true;var sm=ov.querySelector('summary');if(sm)sm.focus();}catch(e){}}
  try{var st=vsapi.getState()||{};st.advViews=!!on;vsapi.setState(st);}catch(e){}}
(function(){var on=false;try{on=(vsapi.getState()||{}).advViews===true;}catch(e){}if(on)applyAdv(true);})();
window.addEventListener('message',function(ev){var m=ev&&ev.data;if(!m||m.type!=='mooter-adv')return;var cur=!document.body.classList.contains('mooter-adv-hidden');applyAdv(m.action==='show'?true:(m.action==='hide'?false:!cur));});
// Restore the last tab — but never land on a hidden advanced tab while advanced views are folded away.
try{var _rt=(vsapi.getState()||{}).tab;var _advOn=!document.body.classList.contains('mooter-adv-hidden');if(_rt&&_rt!=='cockpit'&&(_advOn||!ADV_TABS[_rt]))goTab(_rt);}catch(e){}$('#scoreBadge').onclick=()=>goTab('cockpit');
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
// Calm-by-default (cockpit layout UX): fresh installs open with the value surface visible —
// hero savings · live sessions · next-prompt model · router mix · tokens — and the insider
// telemetry lenses (Flow/Economics/Foundations/Brain) + the local fleet + score BORN collapsed
// (one click to expand, choice persists). Existing users keep their saved layout (persisted set wins).
const _CALM_COLLAPSED=['score','lens-flow','lens-econ','lens-found','lens-brain','fleet'];
const collapsed=new Set((function(){try{
  const st=vsapi.getState()||{};
  // One-time layout migration: existing users adopt the calm default ONCE (the insider lenses
  // fold in on top of whatever they had), then the flag stops it re-applying so every later
  // toggle persists normally. Fresh installs (no saved state) just start calm.
  if(!st.layoutCalmV1){st.layoutCalmV1=1;st.collapsed=[...new Set([...(st.collapsed||[]),..._CALM_COLLAPSED])];try{vsapi.setState(st);}catch{}}
  return st.collapsed||_CALM_COLLAPSED;
}catch{return _CALM_COLLAPSED;}})());
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
    var wipTxt=(w.active==null&&w.total==null)?lNd():('<b>'+(w.active==null?lNd():w.active)+'</b> em curso · '+(w.total==null?lNd():w.total)+' wt (lim '+(w.limit||3)+')'+(w.over?' <span style="color:var(--warn)">⚠ acima</span>':''));
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
  // F2 · honesto — a null saved_pct shows n/d, not a fabricated "0%" (the $ stays advisory).
  body+='<div class="lrow"><span class="lk">Poupança</span><span class="lv">$'+Number(M.saved||0).toFixed(2)+' <span class="lwhy">('+(M.saved_pct!=null?(M.saved_pct+'% abaixo de all-Opus · advisory'):(lNd()+' · advisory'))+')</span></span></div>';
  // R5 · densidade — mini-barra do % poupado vs all-Opus. saved_pct é real/advisory; sem fonte → n/d (honesto).
  var svRaw=(M&&M.saved_pct!=null)?Number(M.saved_pct):null;
  // F2 · n/d agrupado — a bare "n/d % vs all-Opus" bar under the Poupança row is pure noise; render the
  // mini-bar only when there is a real percentage (the Poupança row above already states the advisory %).
  if(svRaw!=null){var svPct=Math.max(0,Math.min(100,svRaw));body+='<div class="lrow"><span class="lk"></span><span class="lbar" title="'+svPct+'% abaixo de all-Opus (advisory)"><span style="width:'+svPct+'%;background:var(--ok)"></span></span><span class="lwhy">'+svPct+'% vs all-Opus</span></div>';}
  if(!(s&&s.trackerUp))body+='<div class="lwhy" style="color:var(--acc-warm)">⚠ tracker offline — último conhecido</div>';
  var gs=(typeof M.guaranteed_saved==='number')?M.guaranteed_saved:0,oa=M.option_a_hits||0;
  body+='<div class="lrow"><span class="lk">Real ✓</span><span class="lv" style="color:var(--ok)">$'+gs.toFixed(2)+' · '+oa+' dispatch'+(oa===1?'':'es')+' local'+(oa===1?'':'is')+' reais</span></div>';
  var c={T0:0,T1:0,T2:0,T3:0},i;for(i=0;i<decScoped.length;i++){var t=decScoped[i]&&decScoped[i].tier;if(c[t]!=null)c[t]++;}
  var tot=c.T0+c.T1+c.T2+c.T3;
  if(tot>0){var ord=[['T0','var(--t0)'],['T1','var(--t1)'],['T2','var(--t2)'],['T3','var(--t3)']],seg='',q;for(q=0;q<4;q++){var pct=Math.round(100*c[ord[q][0]]/tot);if(pct>0)seg+='<span style="width:'+pct+'%;background:'+ord[q][1]+'" title="'+ord[q][0]+' '+c[ord[q][0]]+'"></span>';}
    body+='<div class="lrow"><span class="lk">Router mix</span><span class="lbar">'+seg+'</span><span class="lwhy">'+tot+' decisões (contagens, não $)</span></div>';
  } else body+='<div class="lrow"><span class="lk">Router mix</span><span class="lv">'+lNd()+'</span></div>';
  var bud=(s&&s.budget&&s.budget.monthly_budget_usd)||0;
  // F2 · n/d agrupado — when there is no budget source, state the cost absence ONCE (was "n/d · gasto n/d").
  if(bud>0)body+='<div class="lrow"><span class="lk">Budget</span><span class="lv">tecto $'+bud+'/mês <span class="lwhy">· gasto n/d</span></span></div>';
  else body+='<div class="lrow"><span class="lk">Custo</span><span class="lv">'+lNd()+' <span class="lwhy">sem fonte de gasto (budget · gasto n/d)</span></span></div>';
  // Economics owns the plan/subscription line (single home — dropped from the hardware strip + Foundations chip).
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
  // F2 · sem duplicação — the subscription profile moves to Economics (single home). The GPU NAME here reads
  // the STATIC hw-capability profile (s.hw / s.device) — a DISTINCT datum from the strip's LIVE nvidia-smi
  // utilisation, so it stays: the strip may read n/d live while the machine's GPU model is still known here.
  var gpuName=(s&&s.hw&&s.hw.name)||(s&&s.device&&s.device.hardware&&s.device.hardware.gpu)||null;
  var setup=(gpuName?esc(String(gpuName)):lNd())+' · '+Object.keys((s&&s.packs)||{}).length+' packs';
  var body='<div class="lrow" style="flex-wrap:wrap;gap:6px">'+archChip+docChip+secChip+'<span class="lchip" title="GPU (perfil estático) · packs instalados">⚙️ '+setup+'</span></div>';
  body+='<div class="lrow" style="margin-top:3px"><span class="llink" data-goto="doctor" role="button" tabindex="0">Doctor ↗</span></div>';
  return '<div class="card lens'+cc('lens-found')+'" data-collap="lens-found" style="padding:9px 11px;margin-bottom:8px"><div class="lbl collaphead"><span class="chev">▾</span>🏗️ Foundations</div><div class="lens-body">'+body+'</div></div>';
}
// 🧠 Brain — Pastor (TF-IDF, real) · Guardian (deck signal = s.mc.totals.ctxFull) · Ledger. Handoff
// is honest by level: sessão ✓ · projeto ✓ (ação). F1 · progressive disclosure: the aspirational
// wave placeholders (wave-level handoff, Adapters W7 / Insights-TTL W9 / Graph W10) are no longer
// rendered on the default surface — no half-built advertisement; they return once a data source ships.
function renderBrainLens(s){
  var ins=(s&&s.insights)||{},nDec=((s&&s.decisions)||[]).length,body='';
  // R5 · densidade — Pastor como chips (conf · cache · N) em vez de uma linha corrida; mesma honestidade.
  body+='<div class="lrow" style="flex-wrap:wrap;gap:6px"><span class="lk">🧠 Pastor</span><span class="lchip" title="confiança do Pastor (s.insights)">conf '+(ins.confNow!=null?esc(String(ins.confNow)):lNd())+'</span><span class="lchip" title="taxa de cache do Pastor">cache '+(ins.cacheRate!=null?esc(String(ins.cacheRate)):lNd())+'</span><span class="lchip" title="decisões observadas">N='+nDec+'</span><span class="lwhy">TF-IDF, não neural</span></div>';
  var gf=(s&&s.mc&&s.mc.totals&&s.mc.totals.ctxFull);
  var gTxt=(gf==null)?lNd():(gf>0?('⚠ '+gf+' sessõe'+(gf===1?'':'s')+' ≥80% ctx'):'🟢 contexto saudável');
  var ac=(typeof GUARDIAN_AUTOCOMPACT_PCT==='number')?(' · auto-compact @'+GUARDIAN_AUTOCOMPACT_PCT+'%'):'';
  body+='<div class="lrow"><span class="lk">🛡️ Guardian</span><span class="lv">'+gTxt+ac+'</span></div>';
  var led=s&&s.ledger,lsess=(led&&led.sessions!=null)?led.sessions:null,hm=(led&&led.session&&led.session.lastModel)||null;
  body+='<div class="lrow"><span class="lk">📒 Ledger</span><span class="lv">'+(lsess==null?lNd():(lsess+' sessões'))+(hm?(' · host '+esc(String(hm))):'')+'</span></div>';
  // F2 · honesto — this is a fixed capability (copy session/project handoff), not a live green health
  // signal; render it as a capability so the constant ✓✓ stops reading as live status among the live rows.
  body+='<div class="lrow"><span class="lk">⇄ Handoff</span><span class="lv"><span class="lwhy">copia</span> sessão · projeto <span class="lwhy">(ação)</span></span></div>';
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
    // F2 · n/d agrupado — temp + CPU never carry a source in this snapshot; group the two absences
    // into ONE muted chip instead of scattering two separate n/d cells along the live strip.
    chips+='<span class="hwc hwc-nd" title="este snapshot não amostra temperatura nem CPU">🌡️ sensores '+lNd()+' <span class="lwhy">temp · CPU</span></span>';
  } else {
    // F2 · n/d agrupado — no hardware source at all: ONE honest chip, not four scattered n/d cells.
    chips+='<span class="hwc hwc-nd" title="nvidia-smi não escreveu cache — sem GPU NVIDIA ou monitor parado">🎮 hardware '+lNd()+' <span class="lwhy">nvidia-smi ausente</span></span>';
  }
  var tps=(s&&s.localSpeed&&s.localSpeed.latest&&s.localSpeed.latest.tps!=null)?s.localSpeed.latest.tps:null;
  if(tps!=null)chips+='<span class="hwc" title="tok/s local medido (WS1)">⚡ <b>'+tps+'</b> tok/s</span>';
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
    // F2 · honesto — spec/plan have no per-session stage signal yet, so they are always 0. Mute them so
    // the hard "0" reads as "un-sourced" rather than measured-empty (the count stays truthful).
    var unsourced=(key==='spec'||key==='plan');
    segs+='<span class="pstage'+(isB?' bott':'')+(unsourced?' pstage-nd':'')+'" title="'+key+' · '+(unsourced?'sem sinal por sessão · ':'')+n+' sessõe'+(n===1?'':'s')+(isB?' · gargalo':'')+'">'+stages[q][1]+' '+key+' <b>'+n+'</b>'+(isB?' ⛔':'')+'</span>';
    if(q<stages.length-1)segs+='<span class="parrow">→</span>';
  }
  var foot=placed?(placed+'/'+rows.length+' sessões colocadas · derivado de git/estado'):(rows.length?'sem sinal de etapa por sessão — n/d':'sem sessão ativa · as 5 etapas iluminam-se quando abres uma');
  return '<div class="pipeline" role="group" aria-label="pipeline spec plan exec review ship"><div class="prail">'+segs+'</div><span class="lwhy">🏁 '+foot+'</span></div>';
}
// ⇄ Handoff flow — a diagram/legend of the context path (Cowork→CC→moos→Ledger). The particle is CSS-only
// decoration (reduced-motion stills it). F2 · honesto: it is a static map, NOT a live work-aware feed —
// the legend says so, so the animation stops reading as data flowing when nothing is being measured.
function renderHandoffFlow(){
  var pipe='<span class="hpipe"><span class="hpart"></span></span>';
  return '<div class="hoflow" role="img" aria-label="mapa do caminho do contexto: Cowork → CC → moos → Ledger">'
    +'<span class="hnode">🧠 Cowork</span>'+pipe+'<span class="hnode">💬 CC</span>'+pipe+'<span class="hnode">🐮 moos</span>'+pipe+'<span class="hnode">📒 Ledger</span>'
    +'<span class="lwhy" style="width:100%;margin-top:3px">mapa do caminho do contexto — Cowork → CC → moos → Ledger</span></div>';
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
  if(!s||!s.pc){host.innerHTML='<div class="empty">🛩️ Project command — à espera do primeiro snapshot…</div>';return;}
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
    if(vmc){ vmc.innerHTML=s.mc?renderMissionControl(s.mc):'<div class="empty">Mission Control — à espera do primeiro snapshot…</div>'; wireMc(vmc); }
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
