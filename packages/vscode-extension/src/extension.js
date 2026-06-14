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
  constructor() { this.listeners = new Set(); this.snapshot = {}; this.timer = null; this.watcher = null; this.tick = 0; this.busy = false; this.visible = true; }
  onUpdate(fn) { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; }
  async refresh(deep) {
    // Overlap guard: deep refreshes fan out up to 8 CLI execs (≤9s each). Without
    // this, a slow batch + the interval would stack process batches. Drop, don't queue.
    if (this.busy) return;
    this.busy = true;
    try {
    this.tick++;
    const p = trackerPort();
    const jobs = [data_.httpJson(p, '/metrics'), data_.httpJson(p, '/last'), data_.httpJson(p, '/health'), data_.httpJson(p, '/me')];
    // Deep (CLI-spawning) work only when the panel is visible — never churn processes for a hidden view.
    const doDeep = (deep || this.tick % 3 === 1) && this.visible;
    if (doDeep) jobs.push(extra.ollamaModels(), extra.statuslineHtml(), extra.slashStatus(), extra.effortGet(), extra.whyNotFable(), extra.trailJson(), extra.securitySummary(), extra.feedbackSpans());
    const [metrics, last, health, me, ollama, sline, slash, effort, whynot, trail, security, spans] = await Promise.all(jobs);
    const prev = this.snapshot;
    this.snapshot = {
      at: Date.now(),
      runtimeInstalled: data_.runtimeInstalled(),
      trackerUp: !!(health && health.ok),
      metrics, last, me,
      mode: extra.readMode(),
      sub: extra.readSubProfile(),
      device: extra.deviceProfile(),
      hw: extra.hwCapability(),
      quant: extra.quantSnapshot(),
      prefs: extra.preferences(),
      budget: extra.readBudget(),
      packs: extra.installedPacks(),
      ollama: doDeep ? ollama : prev.ollama,
      statuslineHtml: doDeep ? sline : prev.statuslineHtml,
      slash: doDeep ? slash : prev.slash,
      effort: doDeep ? effort : prev.effort,
      whynot: doDeep ? whynot : prev.whynot,
      trail: doDeep ? trail : prev.trail,
      security: doDeep ? security : prev.security,
      spans: doDeep ? spans : prev.spans,
      herd: doDeep ? extra.herd() : prev.herd,
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
  return Object.assign(base, {
    mode: s.mode, me: s.me, ollama: s.ollama, slash: s.slash,
    statuslineHtml: s.statuslineHtml, claudeCli: s.claudeCli,
    sub, device: s.device, hw: s.hw, quant: s.quant, prefs: s.prefs,
    budget: s.budget, packs: s.packs,
    effort: s.effort, whynot: s.whynot, trail: s.trail, security: s.security, spans: s.spans,
    insights: extra.insights(s.decisions),
    herd: s.herd,
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
  .b-mode{color:var(--g);background:var(--gdim)}.b-score{color:var(--ink);background:var(--g);font-weight:700;cursor:pointer}
  .tabs{display:flex;gap:0;margin:0 -10px 10px;padding:4px 8px 0;border-bottom:1px solid var(--vscode-widget-border);flex-wrap:wrap}
  .tab{padding:5px 8px;cursor:pointer;color:var(--vscode-descriptionForeground);border-bottom:2px solid transparent;font-size:11.5px}
  .tab.on{color:var(--vscode-foreground);border-bottom-color:var(--g)}
  .view{display:none}.view.on{display:block}
  .card{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:12px;margin-bottom:8px}
  .hero{background:linear-gradient(160deg,var(--ink),var(--surface2));border:1px solid var(--g);color:var(--btext)}
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
  button.go{width:100%;background:var(--g);color:var(--ink);border:none;padding:9px;font-size:12.5px;font-weight:700}
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
  .seg .mo.on{background:var(--gdim);color:var(--g);font-weight:700;border-color:var(--g)}
  .seg .mo small{display:block;font-size:9px;font-weight:400;margin-top:1px}
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
  .mx{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:6px}.mx th,.mx td{padding:3px 5px;text-align:right;border-bottom:1px solid var(--vscode-widget-border)}.mx th:first-child,.mx td:first-child{text-align:left;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mx th{color:var(--vscode-descriptionForeground);font-weight:600}
  .kv{display:flex;justify-content:space-between;font-size:11.5px;padding:3px 0}.kv span:first-child{color:var(--vscode-descriptionForeground)}
</style></head><body>
<div class="brand"><span>🐮</span><b>mooter</b><span id="pair" style="font-size:10.5px;color:var(--bmuted)">✱</span><span class="proj" id="proj">—</span>
  <span class="right"><span class="badge b-mode" id="modeBadge">Moo</span><span class="badge b-score" id="scoreBadge" title="Mooter Score — click for pending items">—%</span></span></div>
<div class="tabs">
  <div class="tab on" data-v="cockpit">Cockpit</div><div class="tab" data-v="setup">Setup</div><div class="tab" data-v="herd">🐄 Herd</div><div class="tab" data-v="decisions">Decisions</div><div class="tab" data-v="doctor">Doctor</div>
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
function send(cmd,arg){vsapi.postMessage({cmd,arg});}
function wireButtons(root){root.querySelectorAll('button[data-a]').forEach(b=>b.onclick=()=>{
  const a=b.dataset.a;
  if(a.startsWith('term:'))send('term',a.slice(5));
  else if(a.startsWith('openUrl:'))send('openUrl',a.slice(8));
  else if(a.startsWith('pull:'))send('pull',a.slice(5));
  else if(a.startsWith('tab:'))goTab(a.slice(4));
  else if(a==='spawnDemo')send('term','mooter spawn "audit this repo" --local');
  else send(a,b.dataset.x);
});}
window.addEventListener('message',(e)=>{
  if(e.data.type==='intent'){const r=e.data.res;
    if(r&&r.cmd){inR.innerHTML='→ <b>'+esc(r.cmd)+'</b>'+(r.conf!=null?' <span style="opacity:.7">(conf '+r.conf+(r.rule?' · '+esc(r.rule):'')+')</span>':'')+' <button class="sm" id="intentRun">run</button>';
      document.getElementById('intentRun').onclick=()=>send('term',r.cmd);}
    else inR.textContent='🐮 could not resolve — try the Terminal tab';
    return;}
  if(e.data.type!=='snapshot')return;const s=e.data.s;
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
  const cnt=tc(decs);const tot=Math.max(1,cnt.T0+cnt.T1+cnt.T2+cnt.T3);
  let bars='';for(const t of['T0','T1','T2','T3']){const p=Math.round(100*cnt[t]/tot);bars+='<div class="bar"><span class="t">'+t+(t==='T0'?' local':'')+'</span><div class="tr"><div class="f" style="width:'+p+'%;background:'+TCOL[t]+'"></div></div><span class="p">'+p+'%</span></div>';}
  const installed=(s.ollama||[]).map(x=>x.name);
  let pinOpts='<option value="">🐮 Auto — let Moo decide</option>';
  const locals=installed.filter(n=>PIN_LOCAL[n]);
  if(locals.length)pinOpts+='<optgroup label="Local (Ollama)">'+locals.map(n=>'<option value="/'+PIN_LOCAL[n]+'">'+esc(n)+'</option>').join('')+'</optgroup>';
  pinOpts+='<optgroup label="Claude">'+Object.keys(PIN_CLOUD).map(k=>'<option value="/'+PIN_CLOUD[k]+'">'+esc(k)+'</option>').join('')+'</optgroup>';
  $('#v-cockpit').innerHTML=
    '<div class="seg" style="margin-bottom:8px">'+['zen','auto','beast'].map(mo=>'<div class="mo'+(s.mode===mo?' on':'')+'" data-m="'+mo+'" role="button" tabindex="0">'+MOO[mo]+'</div>').join('')+'</div>'+
    '<div class="card" style="padding:9px 11px;margin-bottom:8px;display:flex;align-items:center;gap:8px"><span class="lbl" style="flex:none">Next prompt →</span><select id="pinSel" title="copies a /pin command to paste in Claude Code" style="flex:1;min-width:0;background:var(--vscode-input-background);color:var(--vscode-foreground);border:1px solid var(--vscode-widget-border);border-radius:5px;padding:4px 6px;font:11px var(--vscode-font-family)">'+pinOpts+'</select></div>'+
    '<div class="card hero" title="'+esc((s.trail&&s.trail.saved&&s.trail.saved.formula)||'source: savings-tracker /metrics')+'"><div class="lbl">Saved vs all-Opus <span style="float:right;opacity:.6;font-size:9px">ⓘ token-estimated · advisory</span></div><div class="big">$'+(m.saved||0).toFixed(2)+'</div><div class="sub"><b>'+(m.saved_pct||0)+'%</b> below · real $'+(m.real_cost||0).toFixed(2)+' vs naive $'+(m.naive_cost||0).toFixed(2)+(s.trackerUp?'':' <span style="color:#e5c07b">· ⚠ tracker offline, last known</span>')+'</div></div>'+
    '<div class="card"><div class="lbl">Mooter Score · '+score.done+'/'+score.total+'</div><div class="scorebar"><div class="f" style="width:'+score.pct+'%"></div></div>'+
    (pend.length?pend.map(c=>'<div class="dr"><span>◻︎</span><div class="w">'+esc(c.t)+'</div><button class="sm" data-a="'+esc(c.fix)+'">fix</button></div>').join(''):'<div class="sub">🏆 perfect setup — nothing pending</div>')+'</div>'+
    '<div class="row"><div class="card"><div class="v">'+(m.prompts||0)+'</div><div class="k">Prompts</div></div><div class="card"><div class="v">'+(me.prompts_today!=null?me.prompts_today:'—')+'</div><div class="k">Today</div></div><div class="card"><div class="v">$'+(m.avg_saved_per_prompt||0).toFixed(3)+'</div><div class="k">Avg saved</div></div></div>'+
    '<div class="card"><div class="lbl">Tier mix · last '+decs.length+'</div>'+bars+'</div>'+
    '<button class="go" data-a="launch">✱&nbsp; New Claude Code session</button><div class="hint">'+esc(MOO[s.mode]||s.mode)+' active</div>';
  wireButtons($('#v-cockpit'));
  document.querySelectorAll('#v-cockpit .seg .mo').forEach(el=>{el.onclick=()=>send('mode',el.dataset.m);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();send('mode',el.dataset.m);}});});
  (function(){const ps=$('#pinSel');if(ps)ps.onchange=()=>{if(ps.value)send('pin',ps.value);ps.selectedIndex=0;};})();

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
  $('#v-models').innerHTML='<div class="card"><div class="lbl">Who routes your prompts</div><div class="seg" style="margin-top:8px">'+
    '<div class="mo'+(s.mode==='zen'?' on':'')+'" data-m="zen">🐄 LazyMoo<small>local-first · conserve</small></div>'+
    '<div class="mo'+(s.mode==='auto'?' on':'')+'" data-m="auto">🐮 Moo<small>automatic · balanced</small></div>'+
    '<div class="mo'+(s.mode==='beast'?' on':'')+'" data-m="beast">🐂 CrazyMoo<small>best model · Fable 5*</small></div></div>'+
    '<div class="sub" style="margin-top:7px">*CrazyMoo uses the strongest available rung — <b>Fable 5</b> when T5 @fable opt-in is active, otherwise Opus.</div></div>'+
    '<div class="card"><div class="lbl">Effort — how hard the Moo tries to save</div><div style="margin-top:7px;display:flex;gap:5px;flex-wrap:wrap">'+
    ['low','default','high','ultramoo'].map(l=>'<button class="sm'+((s.effort||'default')===l?'" style="border-color:var(--g);color:var(--g)':'')+'" data-eff="'+l+'">'+(l==='ultramoo'?'🐮 ultramoo':l)+'</button>').join('')+
    '</div><div class="sub" style="margin-top:6px">ultramoo = max thrift (compression + caveman prose)</div></div>'+
    (s.whynot?'<div class="card"><div class="lbl">Why not Fable 5? — per-decision honesty</div><div class="term" style="margin-top:8px;font-size:10.5px;white-space:pre-wrap">'+esc(s.whynot)+'</div></div>':'')+
    '<div class="card"><div class="lbl">🧬 Engine intelligence</div>'+
    '<div class="kv"><span>Quantization</span><span>'+(q?esc(q.name+' · '+q.quant+(q.sizeGb?' · '+q.sizeGb+'GB':'')):'no snapshot — run mooter quant status')+'</span></div>'+
    '<div class="kv"><span>LoRA adapter</span><span>'+esc(adapter)+'</span></div>'+
    '<div class="kv"><span>Evolution</span><span>trained on '+esc((m.prompts||0))+' routed decisions</span></div>'+
    '<button class="sm" data-a="term:mooter quant status" style="margin-top:6px">Refresh quant</button> <button class="sm" data-a="term:mooter forge install">Forge adapter →</button></div>'+
    '<div class="card"><div class="lbl">Local models (T0 · free)</div><div style="margin-top:6px">'+((s.ollama||[]).map(x=>'<span class="pill">'+esc(x.name)+(x.sizeGb?' · '+x.sizeGb+'GB':'')+'</span>').join('')||'<span class="sub">Ollama offline</span>')+'</div></div>'+
    '<div class="card"><div class="lbl">Subscription</div><div class="sub" style="margin-top:5px">'+(s.sub?'<span class="pill ok">'+esc(s.sub.profile)+'</span>':'not configured')+'</div></div>';
  document.querySelectorAll('#v-models .mo').forEach(el=>el.onclick=()=>send('mode',el.dataset.m));
  document.querySelectorAll('#v-models button[data-eff]').forEach(el=>el.onclick=()=>send('effort',el.dataset.eff));
  wireButtons($('#v-models'));

  // ── 🐄 HERD: dynamic workflow live (run · swimlanes · tokens via×llm · sessions)
  const h=s.herd||{};const run=h.run||null;const mx=h.matrix||{llms:[],rows:[]};
  const fmtk=(n)=>n>=1000?(n/1000).toFixed(1)+'k':String(n);
  const runHtml=run&&run.status?'<div class="card hero"><div class="lbl">Live run · '+esc(run.status)+'</div><div class="big" style="font-size:20px">🤖 '+esc(run.agents_done!=null?run.agents_done:'?')+'/'+esc(run.agents_total!=null?run.agents_total:'?')+(run.tokens?' · ↓'+fmtk(run.tokens)+' tok':'')+'</div>'+(h.current&&h.current.agent_name?'<div class="sub">current: <b>'+esc(h.current.agent_name)+'</b></div>':'')+'</div>'
    :'<div class="card"><div class="lbl">Live run</div><div class="sub" style="margin-top:6px">🤖 no run active — spawn one:</div><button class="sm" data-a="spawnDemo" style="margin-top:6px">mooter spawn →</button></div>';
  const spawnIcon=(st)=>/run|active|progress/i.test(st)?'<span class="pulse"></span>':(/done|ok|success|complete/i.test(st)?'✓ ':(/fail|error/i.test(st)?'<span style="color:var(--t3)">✗ </span>':'⏸ '));
  const spawnsHtml=(h.spawns&&h.spawns.length)?h.spawns.map(sp=>'<div class="dr"><div class="w">'+spawnIcon(sp.status)+esc(sp.task)+'<small>'+esc(sp.status)+(sp.model?' · '+esc(sp.model):'')+(sp.started?' · '+esc(String(sp.started).slice(11,16)):'')+'</small></div></div>').join('')
    :'<div class="sub" style="margin-top:5px">'+(h.spawns===null?'no spawns yet — agents appear here when the herd works':'—')+'</div>';
  let mxHtml='';
  if(mx.rows.length){mxHtml='<table class="mx"><tr><th>agent</th>'+mx.llms.map(l=>'<th>'+esc(l)+'</th>').join('')+'</tr>'+
    mx.rows.map(r=>'<tr><td title="'+esc(r.via)+'">'+esc(r.via)+'</td>'+r.cells.map(c=>'<td'+(c?' title="'+c.n+' decisions"':'')+'>'+(c?fmtk(c.tok):'—')+'</td>').join('')+'</tr>').join('')+'</table>';}
  else mxHtml='<div class="sub" style="margin-top:5px">no v2 decisions yet</div>';
  const sessHtml=(h.sessions&&h.sessions.length)?h.sessions.map(x=>'<div class="dr"><div class="w">'+(x.live?'<span class="pulse"></span>':'⚪ ')+esc(x.name||'?')+'<small>'+esc(x.branch||'')+(x.intent?' · "'+esc(x.intent)+'"':'')+'</small></div></div>').join('')
    :'<div class="sub" style="margin-top:5px">no live sessions (heartbeats)</div>';
  $('#v-herd').innerHTML=runHtml+
    '<div class="card"><div class="lbl">Moo agents (spawns)</div>'+spawnsHtml+'</div>'+
    '<div class="card"><div class="lbl">Tokens × LLM × agent · last '+(h.v2count||0)+' decisions</div>'+mxHtml+'</div>'+
    '<div class="card"><div class="lbl">Sessions (live terminals)</div>'+sessHtml+'</div>';
  wireButtons($('#v-herd'));

  // ── INSIGHTS (telemetria total — req: quant, LoRA, per-prompt)
  const ins=s.insights||{};const qa=ins.quantAll||[];
  const confDelta=(ins.confNow!=null&&ins.confPrev!=null)?(ins.confNow-ins.confPrev):null;
  $('#v-insights').innerHTML=
    '<div class="card hero"><div class="lbl">Routing intelligence</div><div class="big">'+(ins.cacheRate!=null?ins.cacheRate+'%':'—')+'</div><div class="sub">classifier cache-hit rate · confidence <b>'+(ins.confNow!=null?ins.confNow:'—')+'</b>'+(confDelta!=null?' <span style="color:'+(confDelta>=0?'var(--g)':'var(--t3)')+'">'+(confDelta>=0?'▲':'▼')+Math.abs(confDelta).toFixed(2)+'</span> vs previous window':'')+'</div></div>'+
    '<div class="card"><div class="lbl">📦 Quantization (all local models)</div>'+(qa.length?qa.map(q=>'<div class="kv"><span>'+esc(q.name)+'</span><span>'+esc(q.quant||'?')+(q.sizeGb?' · '+q.sizeGb+'GB':'')+'</span></div>').join(''):'<div class="sub" style="margin-top:5px">no snapshot — <button class="sm" data-a="term:mooter quant status">run quant status</button></div>')+'</div>'+
    '<div class="card"><div class="lbl">🧬 LoRA / Pastor evolution</div>'+
    '<div class="kv"><span>Adapter</span><span>'+esc((s.prefs&&s.prefs.adapter)||'baseline')+'</span></div>'+
    '<div class="kv"><span>Fable observations</span><span>'+(ins.fableObs!=null?ins.fableObs:'off — opt-in')+'</span></div>'+
    '<div class="kv"><span>Training corpus</span><span>'+(ins.trainingLines!=null?ins.trainingLines+' examples':'—')+'</span></div>'+
    '<div class="kv"><span>Hub sync</span><span>'+(ins.lastHubPush?esc(ins.lastHubPush.slice(0,16).replace('T',' ')):'never')+'</span></div>'+
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
