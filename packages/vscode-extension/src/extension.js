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
const data_ = require('./data.js');
const extra = require('./host-extra.js');

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
      decisions: data_.readDecisions(),
    };
    for (const fn of this.listeners) { try { fn(this.snapshot); } catch { /* never */ } }
    } finally { this.busy = false; }
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

class CockpitProvider {
  constructor(ctx, data) { this.ctx = ctx; this.data = data; }
  resolveWebviewView(view) {
    view.webview.options = { enableScripts: true };
    view.webview.html = getHtml();
    const sub = this.data.onUpdate((s) => { try { view.webview.postMessage({ type: 'snapshot', s: project(s) }); } catch {} });
    // Throttle polling to the panel's visibility (fewer background CLI spawns when hidden).
    this.data.setVisible(view.visible);
    const vis = view.onDidChangeVisibility(() => this.data.setVisible(view.visible));
    view.onDidDispose(() => { sub.dispose(); vis.dispose(); });
    view.webview.onDidReceiveMessage(async (m) => {
      if (!m) return;
      if (m.cmd === 'launch') vscode.commands.executeCommand('mooter.newSession');
      if (m.cmd === 'refresh') this.data.refresh(true);
      if (m.cmd === 'term') runInTerminal(mooterCmd(m.arg || 'mooter doctor'));
      if (m.cmd === 'openUrl') { const u = String(m.arg || ''); if (/^https?:\/\//i.test(u)) vscode.env.openExternal(vscode.Uri.parse(u)); }
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
      if (m.cmd === 'mode') { await extra.setMode(m.arg); this.data.refresh(true); }
      if (m.cmd === 'slashInstall') { runInTerminal(mooterCmd('mooter slash-commands install')); setTimeout(() => this.data.refresh(true), 4000); }
      if (m.cmd === 'install') runInTerminal('npx @mooter/cli', 'mooter setup');
      if (m.cmd === 'budget') {
        const r = extra.writeBudget(m.arg);
        if (r.ok) vscode.window.setStatusBarMessage('🐮 budget set: $' + r.value + '/month', 4000);
        this.data.refresh(true);
      }
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
    });
    this.data.refresh(true);
  }
}

function project(s) {
  const base = data_.publicSnapshot(s);
  const sub = s.sub ? { profile: s.sub.sub_profile || s.sub.profile || 'unknown', raw: s.sub } : null;
  const ctx = { runtimeInstalled: s.runtimeInstalled, trackerUp: s.trackerUp, ollama: s.ollama, hw: s.hw, sub, budget: s.budget, slash: s.slash };
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
    // Each session in `recent` already carries its repo-scoped { pr: {number,stage,…} }
    // (resolved host-side in recentSessions; stage from the pure prStage). No global PR
    // list and no cross-repo branch-name matching in the webview.
    herd: s.herd, recent: s.recent || [],
    localTok: s.localTok || null,
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

function activate(ctx) {
  const data = new DataService();
  ctx.subscriptions.push({ dispose: () => data.dispose() });
  makeStatusBar(ctx, data);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider('mooterCockpit', new CockpitProvider(ctx, data)));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.openCockpit', () => vscode.commands.executeCommand('mooterCockpit.focus')));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.newSession', newSession));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.refresh', () => data.refresh(true)));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.setupWizard', () => vscode.commands.executeCommand('mooterCockpit.focus')));
  data.start();
}
function deactivate() {}
module.exports = { activate, deactivate };

// ───────────────────────── webview ─────────────────────────
// ───────────────────────── webview v0.3 ─────────────────────────
function getHtml() {
  const nonce = String(Math.random()).slice(2);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  /* Official mooter design system — landing/app/globals.css verbatim (v0.4) */
  :root{--g:#4CAF6A;--r:#E8888A;--r2:#F2A5A5;--ink:#0B0A09;--surface:#141311;--surface2:#1C1A17;
    --btext:#F2EDE6;--bmuted:#8A8076;--gdim:rgba(76,175,106,.14);--rdim:rgba(232,136,138,.12);
    --t0:#4CAF6A;--t1:#5A9BD4;--t2:#A88BD4;--t3:#D46A5A;--ttybg:#0d1117;--ttyhd:#161b22}
  body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);padding:0 10px 12px;margin:0}
  .brand{display:flex;align-items:center;gap:7px;margin:8px -10px 0;padding:2px 12px 9px;border-bottom:1px solid var(--vscode-widget-border)}
  .brand b{color:var(--r);font-size:13.5px}.brand .proj{font-size:11px;color:var(--vscode-descriptionForeground);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .brand .right{margin-left:auto;display:flex;gap:5px;align-items:center}
  .badge{font-size:10px;padding:2px 8px;border-radius:8px}
  .b-mode{color:var(--r);background:var(--rdim)}.b-score{color:var(--ink);background:var(--g);font-weight:700;cursor:pointer}
  .tabs{display:flex;gap:0;margin:0 -10px 10px;padding:4px 8px 0;border-bottom:1px solid var(--vscode-widget-border);flex-wrap:wrap}
  .tab{padding:5px 8px;cursor:pointer;color:var(--vscode-descriptionForeground);border-bottom:2px solid transparent;font-size:11.5px}
  .tab.on{color:var(--vscode-foreground);border-bottom-color:var(--r)}
  .view{display:none}.view.on{display:block}
  .card{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:12px;margin-bottom:8px}
  .hero{background:linear-gradient(160deg,var(--ink),var(--surface2));border:1px solid var(--g);color:var(--btext)}
  .livecow{font-size:22px;line-height:1}
  .herd{margin-top:7px;display:flex;flex-direction:column;gap:4px}
  .srow{display:flex;align-items:center;gap:9px;padding:6px 8px;border:1px solid var(--vscode-widget-border);border-left:3px solid transparent;border-radius:6px;cursor:pointer;background:var(--vscode-editorWidget-background)}
  .srow:hover{background:var(--vscode-list-hoverBackground)}
  .srow.on{border-left-color:var(--g);background:var(--gdim)}
  .srow .livecow{font-size:18px}
  .sbody{flex:1;min-width:0}
  .stop{display:flex;gap:8px;align-items:center;justify-content:space-between}
  .sname{font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sllm{font-size:10px;color:var(--vscode-descriptionForeground);flex:none}
  .ssub{font-size:9.5px;color:var(--vscode-descriptionForeground);margin-top:1px;display:flex;align-items:center;gap:5px}
  .sscm{font-size:9.5px;margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .scmbr{font-family:var(--vscode-editor-font-family,monospace);color:var(--vscode-foreground);background:var(--surface2);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:1px 6px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .scmpr{font-weight:600;font-size:9.5px}
  .alertdot{width:8px;height:8px;border-radius:50%;background:#E5C07B;flex:none;animation:alertpulse 1.5s infinite}
  @keyframes alertpulse{0%,100%{opacity:1}50%{opacity:.25}}
  .needsyou{color:#E5C07B;font-weight:700}
  .srow.needs:not(.on){background:rgba(229,192,123,.08)}
  .sopen{font-size:12px;color:var(--vscode-descriptionForeground);flex:none;opacity:.45}
  .srow:hover .sopen{opacity:1;color:var(--g)}
  .livedot{width:8px;height:8px;border-radius:50%;background:var(--lc,var(--g));flex:none;animation:livepulse 1.6s infinite}
  @keyframes livepulse{0%,100%{opacity:1}50%{opacity:.3}}
  .livecow.working{animation:moowalk 0.85s ease-in-out infinite}
  @keyframes moowalk{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-2px) rotate(-5deg)}75%{transform:translateY(-2px) rotate(5deg)}}
  @media (prefers-reduced-motion:reduce){.livecow.working,.livedot{animation:none}}
  .hero .lbl{color:var(--bmuted)}.hero .sub{color:var(--bmuted)}.hero .sub b{color:var(--btext)}
  .term{background:var(--ttybg)!important;border-top:14px solid var(--ttyhd)}
  .stars{display:inline-flex;gap:2px;margin-left:8px}.stars span{cursor:pointer;opacity:.4;font-size:12px}.stars span:hover,.stars span.on{opacity:1}
  .intentwrap{display:flex;gap:6px;margin:0 0 10px}
  .intentwrap input{flex:1;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--vscode-widget-border);border-radius:6px;padding:6px 10px;font:12px var(--vscode-font-family)}
  .intentres{font-size:11px;color:var(--vscode-descriptionForeground);margin:-4px 0 8px;display:none}
  .intentres b{color:var(--g)}
  .lbl{font-size:10px;letter-spacing:.7px;text-transform:uppercase;color:var(--vscode-descriptionForeground)}
  .big{font-size:27px;font-weight:700;color:var(--g);font-variant-numeric:tabular-nums}
  .sub{font-size:12px;color:var(--vscode-descriptionForeground)}.sub b{color:var(--vscode-foreground)}
  .row{display:flex;gap:6px}.row .card{flex:1;padding:8px 10px}
  .v{font-size:15px;font-weight:600}.k{font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:var(--vscode-descriptionForeground)}
  .bar{display:flex;align-items:center;gap:7px;margin:5px 0;font-size:11px}
  .bar .t{width:58px;color:var(--vscode-descriptionForeground)}.bar .tr{flex:1;height:6px;background:var(--vscode-input-background);border-radius:3px;overflow:hidden}
  .bar .f{height:100%}.bar .p{width:56px;text-align:right;color:var(--vscode-descriptionForeground)}
  button{font-family:inherit;cursor:pointer;border-radius:5px;border:1px solid var(--vscode-widget-border);background:var(--vscode-button-secondaryBackground,var(--vscode-input-background));color:var(--vscode-foreground);padding:5px 10px;font-size:11.5px}
  button.go{width:100%;background:var(--r);color:var(--ink);border:none;padding:9px;font-size:12.5px;font-weight:700}
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
  .seg .mo{flex:1;padding:7px 4px;font-size:11px;border-radius:5px;cursor:pointer;color:var(--vscode-descriptionForeground);text-align:center;border:1px solid transparent}
  .seg .mo.on{background:var(--rdim);color:var(--r);font-weight:700;border-color:var(--r)}
  .seg .mo small{display:block;font-size:9px;font-weight:400;margin-top:1px}
  .pincard{margin-bottom:8px;border:1px solid var(--r);border-left:3px solid var(--r);background:linear-gradient(180deg,var(--rdim),transparent 70%)}
  .pinhead{font-size:13px;font-weight:700;color:var(--r);display:flex;align-items:center;gap:6px}
  .pinsub{font-size:9.5px;color:var(--vscode-descriptionForeground);margin:3px 0 8px}
  .pinsel{width:100%;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--r);border-radius:6px;padding:7px 9px;font:12px var(--vscode-font-family);cursor:pointer}
  .pinsel:focus-visible{outline:2px solid var(--r);outline-offset:1px}
  .pinnow{font-size:10px;color:var(--r);margin-top:6px}
  .pill{display:inline-block;font-size:10.5px;border:1px solid var(--vscode-widget-border);border-radius:9px;padding:2px 9px;margin:2px 3px 2px 0}
  .pill.ok{border-color:var(--g);color:var(--g)}.pill.warn{border-color:#e5c07b;color:#e5c07b}
  .term{background:var(--ink);border-radius:7px;padding:10px 12px;font:11.5px var(--vscode-editor-font-family);color:#ddd;overflow-x:auto;white-space:pre;line-height:1.7}
  .wstep{display:flex;gap:10px;align-items:flex-start;padding:9px 4px;border-bottom:1px solid var(--vscode-widget-border)}
  .wstep:last-child{border:none}.wstep .n{width:20px;height:20px;border-radius:50%;background:var(--gdim);color:var(--g);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
  .wstep.done .n{background:var(--g);color:var(--ink)}
  .wstep .w{flex:1;font-size:12px}.wstep small{display:block;color:var(--vscode-descriptionForeground);font-size:10.5px;margin-top:1px}
  .scorebar{height:8px;background:var(--vscode-input-background);border-radius:4px;overflow:hidden;margin:8px 0 4px}
  .scorebar .f{height:100%;background:linear-gradient(90deg,var(--r),#e5c07b 50%,var(--g));border-radius:4px}
  input[type=number]{width:90px;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--vscode-widget-border);border-radius:5px;padding:5px 8px;font:12px var(--vscode-font-family)}
  .pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--g);animation:pu 1.6s infinite;margin-right:6px}@keyframes pu{0%,100%{opacity:1}50%{opacity:.3}}
  .mx{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:6px}.mx th,.mx td{padding:3px 5px;text-align:right;border-bottom:1px solid var(--vscode-widget-border)}.mx th:first-child,.mx td:first-child{text-align:left;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mx th{color:var(--vscode-descriptionForeground);font-weight:600}.mx td.sv{color:var(--g)}
  .kv{display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0}.kv span:first-child{color:var(--vscode-descriptionForeground)}
</style></head><body>
<div class="brand"><span>🐮</span><b>mooter</b><span id="pair" style="font-size:10.5px;color:var(--bmuted)">✱</span><span class="proj" id="proj">—</span>
  <span class="right"><span class="badge b-mode" id="modeBadge">Moo</span><span class="badge b-score" id="scoreBadge" title="Mooter Score — click for pending items">—%</span></span></div>
<div class="tabs">
  <div class="tab on" data-v="cockpit">🐮 Cockpit</div><div class="tab" data-v="setup">⚙️ Setup</div><div class="tab" data-v="herd">🧵 Sessions</div><div class="tab" data-v="decisions">🔬 Decisions</div><div class="tab" data-v="doctor">🩺 Doctor</div>
</div>
<div class="intentwrap"><input id="intentIn" placeholder="🐮 ask mooter anything… (natural language → command)"><button class="sm" id="intentGo">→</button></div><div class="intentres" id="intentRes"></div>
<div class="view on" id="view-cockpit"><div id="v-cockpit"><div class="empty">Connecting to mooter…</div></div></div>
<div class="view" id="view-setup"><div id="v-setup"><div class="empty">…</div></div><div class="lbl" style="margin:14px 2px 6px">Install</div><div id="v-install"></div><div class="lbl" style="margin:14px 2px 6px">Models</div><div id="v-models"></div></div>
<div class="view" id="view-herd"><div id="v-herd"><div class="empty">…</div></div></div>
<div class="view" id="view-decisions"><div id="v-insights"></div><div id="v-decisions"><div class="empty">No decisions yet</div></div></div>
<div class="view" id="view-doctor"><div id="v-doctor"><div class="empty">…</div></div><div class="lbl" style="margin:14px 2px 6px">Terminal</div><div id="v-terminal"></div></div>
<script nonce="${nonce}">
const vsapi=acquireVsCodeApi();const $=(q)=>document.querySelector(q);
function goTab(name){document.querySelectorAll('.tab').forEach(x=>{const on=x.dataset.v===name;x.classList.toggle('on',on);x.setAttribute('aria-selected',on?'true':'false');x.tabIndex=on?0:-1;});document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.id==='view-'+name));}
(function(){const tl=document.querySelector('.tabs');if(tl)tl.setAttribute('role','tablist');
  const tabs=[...document.querySelectorAll('.tab')];
  document.querySelectorAll('.view').forEach(v=>v.setAttribute('role','tabpanel'));
  tabs.forEach((t,i)=>{const on=t.classList.contains('on');t.setAttribute('role','tab');t.setAttribute('aria-controls','view-'+t.dataset.v);t.setAttribute('aria-selected',on?'true':'false');t.tabIndex=on?0:-1;
    t.onclick=()=>goTab(t.dataset.v);
    t.addEventListener('keydown',e=>{let j=null;if(e.key==='ArrowRight')j=(i+1)%tabs.length;else if(e.key==='ArrowLeft')j=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')j=0;else if(e.key==='End')j=tabs.length-1;if(j!=null){e.preventDefault();goTab(tabs[j].dataset.v);tabs[j].focus();}});});})();
$('#scoreBadge').onclick=()=>goTab('cockpit');
let curMode='auto';const MORDER=['zen','auto','beast'];
// Each live-session cow walks via the CSS .working class set at render time (the
// session is "working" when its transcript was just written) — no JS tick needed.
$('#modeBadge').style.cursor='pointer';$('#modeBadge').title='click to switch mode (LazyMoo · Moo · CrazyMoo)';
$('#modeBadge').setAttribute('role','button');$('#modeBadge').tabIndex=0;
$('#modeBadge').onclick=()=>send('mode',MORDER[(MORDER.indexOf(curMode)+1)%3]);
$('#modeBadge').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#modeBadge').onclick();}});
const inI=$('#intentIn'),inG=$('#intentGo'),inR=$('#intentRes');
function intentAsk(){const v=inI.value.trim();if(!v)return;inR.style.display='block';inR.textContent='🐮 thinking…';send('intent',v);}
inG.onclick=intentAsk; inI.addEventListener('keydown',e=>{if(e.key==='Enter')intentAsk();});
function esc(x){return String(x==null?'':x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function tc(d){const c={T0:0,T1:0,T2:0,T3:0};for(const x of d)if(c[x.tier]!=null)c[x.tier]++;return c;}
const TCOL={T0:'var(--t0)',T1:'var(--t1)',T2:'var(--t2)',T3:'var(--t3)'};
const MOO={auto:'🐮 Moo',zen:'🐄 LazyMoo',beast:'🐂 CrazyMoo'};
const PIN_LOCAL={'qwen3:30b':'mooter-qwen3-30b','qwen2.5:3b':'mooter-qwen2-5-3b','qwen2.5-coder:7b':'mooter-qwen2-5-coder-7b','qwen2.5-coder:14b':'mooter-qwen2-5-coder-14b','gemma3:12b':'mooter-gemma3-12b','gemma4:e4b':'mooter-gemma4-e4b','deepseek-r1:7b':'mooter-deepseek-r1-7b'};
const PIN_CLOUD={Haiku:'mooter-haiku-4-5',Sonnet:'mooter-sonnet-4-6','Opus 4.7':'mooter-opus-4-7'};
const openDecs=new Set();// decision keys (ts) the user expanded — must survive the periodic re-render
let ledgerScope='session';let lastSnap=null;
const MLABEL={'claude-opus-4-8':'Opus 4.8','claude-opus-4-7':'Opus 4.7','claude-opus-4-6':'Opus 4.6','claude-sonnet-4-6':'Sonnet 4.6','claude-sonnet-4-5':'Sonnet 4.5','claude-haiku-4-5':'Haiku 4.5','claude-haiku-4-5-20251001':'Haiku 4.5','claude-fable-5':'Fable 5'};
function modelLabel(m){return MLABEL[String(m||'').toLowerCase()]||String(m||'').replace(/^claude-/,'').replace(/-/g,' ');}
// PR stage → colour (matches host-extra prStage strings). Honest: only stages we derive.
function stageColor(st){const x=String(st||'');if(x.indexOf('merged')===0)return 'var(--g)';if(x.indexOf('ready')===0)return 'var(--g)';if(x.indexOf('❌')>=0)return 'var(--t3)';if(x.indexOf('⏳')>=0)return '#e5c07b';if(x==='draft')return 'var(--vscode-descriptionForeground)';return 'var(--vscode-descriptionForeground)';}
function lFmt(n){n=+n||0;return n>=1e6?(n/1e6).toFixed(2)+'M':(n>=1e3?(n/1e3).toFixed(1)+'k':String(n));}
function famEmoji(model){const x=String(model||'').toLowerCase();if(x.includes('fable'))return '🌟';if(/claude|opus|sonnet|haiku/.test(x))return '✨';if(/qwen|llama|gemma|deepseek|mistral|phi|ollama/.test(x)||x.includes(':'))return '🦙';if(x.includes('gemini'))return '💎';if(/gpt|codex|openai/.test(x))return '🟢';return '🤖';}
function agoFmt(ms){const t=Math.round((+ms||0)/1000);if(t<60)return t+'s';const mi=Math.round(t/60);if(mi<60)return mi+'m';const h=Math.round(mi/60);return h<24?h+'h':Math.round(h/24)+'d';}
function ledgerHtml(s){
  // Feature 4: ONE table, SAME columns for cloud and local — model | in | out | cache |
  // cost | saved vs Opus. Cloud rows show real $ and "—" for saved (they ARE the spend);
  // the local row shows real in/out (token_tracker), $0 cost, and the honest counterfactual
  // saved = (in*5 + out*25)/1e6 vs Opus 4.8 [$5,$25]/1M. No more "calls" inconsistency.
  const scoped=!!(s.effectiveSession&&s.sessionLedger);
  const L=scoped?(s.sessionLedger.session||{rows:[],turns:0}):((s.ledger&&s.ledger[ledgerScope])||{rows:[],turns:0});
  const scopeLbl=scoped?'this session':(ledgerScope==='session'?'this session':'all time');
  const total=L.rows.reduce((a,r)=>a+(r.cost||0),0);
  const tog=scoped?('<span style="float:right;opacity:.6;font-size:9px">'+esc((s.effectiveSession||'').slice(0,8))+'</span>'):('<span style="float:right">'+['session','all'].map(sc=>'<span data-ls="'+sc+'" role="button" tabindex="0" style="cursor:pointer;font-size:10px;padding:2px 7px;border-radius:8px;margin-left:4px;border:1px solid var(--vscode-widget-border);'+(ledgerScope===sc?'background:var(--gdim);color:var(--g);border-color:var(--g)':'color:var(--vscode-descriptionForeground)')+'">'+(sc==='session'?'This session':'All time')+'</span>').join('')+'</span>');
  const head='<div class="lbl">🧾 Tokens by model '+tog+'</div>';
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
  return '<div class="card">'+head+body+localNote+'<div class="kv" style="margin-top:8px;border-top:1px solid var(--vscode-widget-border);padding-top:6px"><span>Total · '+scopeLbl+'</span><span><b>$'+total.toFixed(2)+'</b> · '+L.turns+' Claude turns</span></div><div class="sub" style="font-size:9px;margin-top:4px">Claude tokens from session logs · local from token_tracker · prices Jun 2026 · advisory · local = $0</div></div>';
}
function wireLedgerToggle(){const lg=$('#tokLedger');if(!lg)return;lg.querySelectorAll('[data-ls]').forEach(b=>{const go=()=>{ledgerScope=b.dataset.ls;if(lastSnap){lg.innerHTML=ledgerHtml(lastSnap);wireLedgerToggle();}};b.onclick=go;b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});}
function send(cmd,arg){vsapi.postMessage({cmd,arg});}
function wireButtons(root){root.querySelectorAll('button[data-a]').forEach(b=>b.onclick=()=>{
  const a=b.dataset.a;
  if(a.startsWith('term:'))send('term',a.slice(5));
  else if(a.startsWith('openUrl:'))send('openUrl',a.slice(8));
  else if(a.startsWith('pull:'))send('pull',a.slice(5));
  else if(a.startsWith('tab:'))goTab(a.slice(4));
  else send(a,b.dataset.x);
});}
window.addEventListener('message',(e)=>{
  if(e.data.type==='intent'){const r=e.data.res;
    if(r&&r.cmd){inR.innerHTML='→ <b>'+esc(r.cmd)+'</b>'+(r.conf!=null?' <span style="opacity:.7">(conf '+r.conf+(r.rule?' · '+esc(r.rule):'')+')</span>':'')+' <button class="sm" id="intentRun">run</button>';
      document.getElementById('intentRun').onclick=()=>send('term',r.cmd);}
    else inR.textContent='🐮 could not resolve — try the Terminal tab';
    return;}
  if(e.data.type!=='snapshot')return;const s=e.data.s;lastSnap=s;
  const m=s.metrics||{};const me=s.me||{};const decs=s.decisions||[];const score=s.score||{pct:0,checks:[]};
  $('#proj').textContent='· '+(s.projectName||'—');
  const pr=s.paired||{};
  $('#pair').innerHTML=pr.ok?'<span title="paired with Claude Code '+esc(pr.version)+'" style="color:var(--g)">✕ ✱ Claude Code ✓</span>':'<span title="Claude Code extension not found" style="color:var(--t3)">✕ ✱ not paired</span>';
  curMode=s.mode||'auto';$('#modeBadge').textContent=MOO[s.mode]||('🐮 '+s.mode);
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
  const rowFor=(r)=>{const sel=(selSess==='auto'&&effSess===r.fullId)||selSess===r.fullId;const nm=r.name||('session '+r.id);
    const badge=r.working?'<span class="livedot"></span>working':(r.needsYou?'<span class="alertdot"></span><span class="needsyou">your turn</span>':esc(agoFmt(r.ageMs))+' ago');
    // Branch / PR / stage line — only when the session's cwd is a git repo (r.branch set).
    // A linked icon when ≥2 sessions share this branch (same work — honest, never crossed).
    let scm='';
    if(r.branch){
      const linked=branchCount[bkey(r)]>1;
      const pr=r.pr;
      const branchChip='<span class="scmbr" title="git branch">'+(linked?'🔗 ':'⎇ ')+esc(r.branch)+'</span>';
      let prChip;
      if(pr&&pr.stage)prChip='<span class="scmpr" title="'+esc(pr.title||'')+'" style="color:'+stageColor(pr.stage)+'">#'+esc(pr.number!=null?String(pr.number):'?')+' · '+esc(pr.stage)+'</span>';
      else prChip='<span class="scmpr" style="opacity:.55">no PR</span>';
      scm='<div class="sscm">'+branchChip+' '+prChip+'</div>';
    }
    return '<div class="srow'+(sel?' on':'')+(r.needsYou?' needs':'')+'" data-sess="'+esc(r.fullId)+'" role="button" tabindex="0" title="open this session in Claude Code"><span class="livecow'+(r.working?' working':'')+'">🐮</span><div class="sbody"><div class="stop"><span class="sname">'+esc(nm)+'</span><span class="sllm">'+famEmoji(r.model)+' '+esc(r.model?modelLabel(r.model):'—')+'</span></div><div class="ssub">'+badge+' · '+esc(r.id)+(sel?(selSess==='auto'?' · auto':' · pinned'):'')+'</div>'+scm+'</div><span class="sopen" title="open in Claude Code">↗</span></div>';};
  const herdRows=rsess.length?rsess.map(rowFor).join(''):'<div class="sub" style="margin-top:5px">no sessions yet — open a Claude Code tab and send a prompt</div>';
  // Honest link note: branches shared by ≥2 sessions (same work), if any.
  const sharedKeys=Object.keys(branchCount).filter(k=>branchCount[k]>1);
  const linkNote=sharedKeys.length?'<div class="sub" style="font-size:9px;margin-top:4px">🔗 '+sharedKeys.map(k=>esc((JSON.parse(k)[1]||k))+' ('+branchCount[k]+')').join(' · ')+' — sessions on the same repo+branch are the same work</div>':'';
  const allRow='<div class="srow'+(selSess==='all'?' on':'')+'" data-sess="all" role="button" tabindex="0"><span class="livecow">🌐</span><div class="sbody"><div class="stop"><span class="sname">All sessions</span><span class="sllm">global</span></div><div class="ssub">every session combined</div></div></div>';
  const needN=rsess.filter(r=>r.needsYou).length;
  const herdCard='<div class="card" style="padding:9px 11px;margin-bottom:8px"><div class="lbl">🐄 Live sessions <span style="float:right;opacity:.6;font-size:9px">'+rsess.length+' recent'+(needN?' · '+needN+' need you':'')+'</span></div><div class="herd">'+herdRows+allRow+'</div>'+linkNote+'<div class="sub" style="font-size:9px;margin-top:6px">● working (generating) · <span class="needsyou">⬤ your turn</span> (Claude finished, waiting for your reply) · <b>click a cow to open that session in Claude Code</b>. Reads ~/.claude logs · branch/PR via git+gh.</div></div>';
  const cnt=tc(decScoped);const tot=Math.max(1,cnt.T0+cnt.T1+cnt.T2+cnt.T3);
  let bars='';for(const t of['T0','T1','T2','T3']){const p=Math.round(100*cnt[t]/tot);bars+='<div class="bar"><span class="t">'+t+(t==='T0'?' local':'')+'</span><div class="tr"><div class="f" style="width:'+p+'%;background:'+TCOL[t]+'"></div></div><span class="p">'+p+'%</span></div>';}
  const installed=(s.ollama||[]).map(x=>x.name);
  const curPin=(s.pinNext&&s.pinNext.model)||'';
  const selAttr=(v)=>v===curPin?' selected':'';
  let pinOpts='<option value=""'+selAttr('')+'>🐮 Auto — let Moo decide</option>';
  const locals=installed.filter(n=>PIN_LOCAL[n]);
  if(locals.length)pinOpts+='<optgroup label="Local (Ollama)">'+locals.map(n=>'<option value="'+esc(n)+'"'+selAttr(n)+'>'+esc(n)+'</option>').join('')+'</optgroup>';
  pinOpts+='<optgroup label="Claude">'+Object.keys(PIN_CLOUD).map(k=>{const id='claude-'+PIN_CLOUD[k].replace(/^mooter-/,'');return '<option value="'+esc(id)+'"'+selAttr(id)+'>'+esc(k)+'</option>';}).join('')+'</optgroup>';
  const lv=s.live; // executor of the focused session (used by the "Actually ran" line below)
  $('#v-cockpit').innerHTML=
    herdCard+
    '<div class="seg" style="margin-bottom:8px">'+['zen','auto','beast'].map(mo=>'<div class="mo'+(s.mode===mo?' on':'')+'" data-m="'+mo+'" role="button" tabindex="0">'+MOO[mo]+'</div>').join('')+'</div>'+
    '<div class="card pincard"><div class="pinhead">🎯 Next prompt model</div><div class="pinsub">picks the model for your very next prompt — auto-routed, no paste</div><select id="pinSel" title="picks the model for your very next prompt — auto-routed, no paste" class="pinsel">'+pinOpts+'</select>'+(curPin?'<div class="pinnow">→ pinned: <b>'+esc(curPin)+'</b></div>':'')+'</div>'+
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
      return '<div class="card hero" title="'+esc((s.trail&&s.trail.saved&&s.trail.saved.formula)||'savings-tracker /metrics — token-estimated, advisory: the host model answers; the tier is a recommendation, not a billed execution')+'"><div class="lbl">Saved vs all-Opus '+scopeChip+'</div><div class="big">$'+(M.saved||0).toFixed(2)+'</div><div class="sub"><b>'+(M.saved_pct||0)+'%</b> below all-Opus · <span title="what you would save IF every prompt ran on its recommended tier — token-estimated, not billed">advisory</span></div><div class="sub" style="margin-top:3px"><span style="color:var(--g)">✓ real executed:</span> <b>$'+realSaved.toFixed(2)+'</b> · '+execN+' local dispatch'+(execN===1?'':'es')+(execN?'':' yet')+'</div>'+(s.trackerUp?'':'<div class="sub" style="color:#e5c07b">⚠ tracker offline, last known</div>')+'</div>';
    })()+
    '<div class="card"><div class="lbl">Mooter Score · '+score.done+'/'+score.total+'</div><div class="scorebar"><div class="f" style="width:'+score.pct+'%"></div></div>'+
    (pend.length?pend.map(c=>'<div class="dr"><span>◻︎</span><div class="w">'+esc(c.t)+'</div><button class="sm" data-a="'+esc(c.fix)+'">fix</button></div>').join(''):'<div class="sub">🏆 perfect setup — nothing pending</div>')+'</div>'+
    '<div class="row"><div class="card"><div class="v">'+(M.prompts||0)+'</div><div class="k">Prompts</div></div><div class="card"><div class="v">'+(me.prompts_today!=null?me.prompts_today:'—')+'</div><div class="k">Today</div></div><div class="card"><div class="v">$'+(M.avg_saved_per_prompt||0).toFixed(3)+'</div><div class="k">Avg saved</div></div></div>'+
    '<div class="card"><div class="lbl">Router recommendations · last '+decScoped.length+' <span style="float:right;opacity:.6;font-size:9px">advisory</span></div>'+bars+'<div class="sub" style="font-size:9.5px;margin-top:5px">↑ what the router <b>suggested</b> (T0 = local) — not what ran. <b>Actually ran:</b> '+(lv&&lv.real?esc(lv.emoji)+' '+esc(modelLabel(lv.model))+' (host)':'host model')+' · '+realLocalN+' real local dispatch'+(realLocalN===1?'':'es')+'</div></div>'+
    '<div id="tokLedger">'+ledgerHtml(s)+'</div>'+
    '<button class="go" data-a="launch">✱&nbsp; New Claude Code session</button><div class="hint">'+esc(MOO[s.mode]||s.mode)+' active</div>';
  wireButtons($('#v-cockpit'));
  document.querySelectorAll('#v-cockpit .seg .mo').forEach(el=>{el.onclick=()=>send('mode',el.dataset.m);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();send('mode',el.dataset.m);}});});
  (function(){const ps=$('#pinSel');if(ps)ps.onchange=()=>send('pinNext',ps.value);})();
  document.querySelectorAll('#v-cockpit .srow').forEach(el=>{const go=()=>{const v=el.dataset.sess;send(v==='all'?'selectSession':'openSession',v);};el.onclick=go;el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  wireLedgerToggle();

  // ── SETUP: HW/SW/Subs + budget editor (req 3,8)
  const dev=s.device||{};const hwd=dev.hardware||{};const sw=dev.software||{};const subs=dev.subscriptions||{};const hw=s.hw||{};
  const bud=(s.budget&&s.budget.monthly_budget_usd)||0;
  const kv=(k,v)=>'<div class="kv"><span>'+esc(k)+'</span><span>'+(v==null||v===''?'<i style="color:var(--r)">missing</i>':esc(v))+'</span></div>';
  $('#v-setup').innerHTML=
    '<div class="card"><div class="lbl">🎮 Hardware</div>'+kv('GPU',hw.name||hwd.gpu||null)+kv('VRAM',hw.vram_mb?(hw.vram_mb/1024).toFixed(0)+' GB':null)+kv('Tier',hw.hw_tier||hwd.hw_tier)+kv('RAM',hwd.ram_gb?hwd.ram_gb+' GB':null)+kv('CPU cores',hwd.cpu_cores)+kv('Platform',(hwd.platform||'')+(hwd.arch?'/'+hwd.arch:''))+
      (!s.device?'<div class="sub" style="margin-top:6px">profile not captured yet</div><button class="sm" data-a="term:node ~/.claude/tools/router/setup-profile.js --non-interactive" style="margin-top:4px">Detect now</button>':'')+'</div>'+
    '<div class="card"><div class="lbl">💾 Software</div>'+kv('Node',sw.node_version)+kv('Claude Code',sw.claude_code_version)+kv('VS Code',sw.vscode_installed?'yes':'detected (you are here 🐮)')+kv('Ollama',sw.ollama_installed!=null?(sw.ollama_installed?'yes':'no'):((s.ollama||[]).length?'running':'offline'))+'</div>'+
    '<div class="card"><div class="lbl">🔑 Subscriptions</div>'+kv('Anthropic',subs.anthropic||(s.sub&&s.sub.profile))+kv('OpenAI',subs.openai)+kv('Gemini',subs.gemini)+kv('Ollama',subs.ollama)+'<div class="sub" style="margin-top:5px">keys & tiers drive T1-T3 budgets</div></div>'+
    '<div class="card"><div class="lbl">💰 Monthly budget — the Moo calibrates around this</div><div style="display:flex;gap:8px;align-items:center;margin-top:8px">$ <input type="number" id="budIn" value="'+bud+'" min="0" step="10"><button class="sm" id="budSet">Set</button><span class="sub">'+(bud?'cap active in applyBudgetCap()':'not set — routing uncapped')+'</span></div></div>';
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
  document.querySelectorAll('#v-models button[data-eff]').forEach(el=>el.onclick=()=>send('effort',el.dataset.eff));
  wireButtons($('#v-models'));

  // ── 🧵 SESSIONS: recent Claude Code sessions by activity (honest replacement for the
  // old Herd facade — spawns/heartbeats/worktrees don't exist on disk, so we don't
  // pretend they do). We CANNOT detect the focused VS Code tab (no extension API), so
  // this is "recent by activity", never "active". Token matrix shows only when real.
  const h=s.herd||{};const mx=h.matrix||{llms:[],rows:[]};
  const fmtk=(n)=>n>=1000?(n/1000).toFixed(1)+'k':String(n);
  const rs=s.recent||[];
  const fmtAge=(ms)=>{const t=Math.round(ms/1000);if(t<60)return t+'s ago';const mi=Math.round(t/60);if(mi<60)return mi+'m ago';const hr=Math.round(mi/60);if(hr<24)return hr+'h ago';return Math.round(hr/24)+'d ago';};
  const sessHtml=rs.length?rs.map(x=>'<div class="dr"><div class="w">'+(x.working?'<span class="pulse" title="active in the last 90s"></span>':'⚪ ')+esc(x.project||'?')+' <span class="meta">'+esc(x.id)+'</span><small>'+(x.model?esc(modelLabel(x.model)):'no model yet')+' · '+x.turns+' turns · '+fmtAge(x.ageMs)+'</small></div></div>').join('')
    :'<div class="sub" style="margin-top:5px">no recent sessions found in ~/.claude/projects</div>';
  let mxHtml='';
  if(mx.rows.length){mxHtml='<table class="mx"><tr><th>agent</th>'+mx.llms.map(l=>'<th>'+esc(l)+'</th>').join('')+'</tr>'+
    mx.rows.map(r=>'<tr><td title="'+esc(r.via)+'">'+esc(r.via)+'</td>'+r.cells.map(c=>'<td'+(c?' title="'+c.n+' decisions"':'')+'>'+(c?fmtk(c.tok):'—')+'</td>').join('')+'</tr>').join('')+'</table>';}
  $('#v-herd').innerHTML=
    '<div class="card"><div class="lbl">🧵 Recent sessions <span style="float:right;opacity:.6;font-size:9px">by activity</span></div>'+sessHtml+
    '<div class="sub" style="font-size:9px;margin-top:7px">● = active in the last 90s · ⚪ = last activity (heuristic from file mtime). The cockpit reads transcripts in ~/.claude/projects — it <b>cannot tell which Claude Code tab is focused</b> (the extension exposes no such API), and cross-session messaging is not tracked, so neither is shown.</div></div>'+
    (mx.rows.length?'<div class="card"><div class="lbl">Tokens × LLM × agent · last '+(h.v2count||0)+' decisions</div>'+mxHtml+'</div>':'');
  wireButtons($('#v-herd'));

  // ── INSIGHTS (telemetria total — req: quant, LoRA, per-prompt)
  const ins=s.insights||{};const qa=ins.quantAll||[];
  const confDelta=(ins.confNow!=null&&ins.confPrev!=null)?(ins.confNow-ins.confPrev):null;
  $('#v-insights').innerHTML=
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
  $('#v-doctor').innerHTML='<div class="card">'+
    (score.checks||[]).map(c=>'<div class="dr"><span>'+ok(c.ok)+'</span><div class="w">'+esc(c.t)+'</div>'+(c.ok?'':'<button class="sm" data-a="'+esc(c.fix)+'">fix</button>')+'</div>').join('')+'</div>'+
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
});
send('refresh');
</script></body></html>`;
}
