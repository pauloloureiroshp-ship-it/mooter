// mooter-cockpit — extension host (v0.1, Wave F/F1 MVP)
// Doctrine: read-only over the mooter runtime; ZERO routing logic here.
// Data sources validated in F0 (docs/F0-VALIDATION-REPORT.md):
//   ~/.claude/tools/router/decisions.log   (v1 rich lines, event:"classified")
//   http://127.0.0.1:<port>/metrics|/last|/health  (tracker 0.7.0 JSON)
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const DECISIONS_LOG = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log');
const RUNTIME_HOOK = path.join(os.homedir(), '.claude', 'tools', 'router', 'inject_context.js');

// ── tiny utils ──────────────────────────────────────────────────────────
function trackerPort() {
  return vscode.workspace.getConfiguration('mooter').get('trackerPort', 7821);
}
function httpJson(pathname, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: trackerPort(), path: pathname, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// Tail the last N parsed "classified" entries without reading the whole file.
function readDecisions(maxN = 80) {
  try {
    const stat = fs.statSync(DECISIONS_LOG);
    const start = Math.max(0, stat.size - 256 * 1024); // last 256KB is plenty
    const fd = fs.openSync(DECISIONS_LOG, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const out = [];
    for (const line of buf.toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.event === 'classified') out.push(j);
      } catch { /* tolerate partial first line / garbage */ }
    }
    return out.slice(-maxN).reverse(); // newest first
  } catch { return []; }
}

// ── DataService: one snapshot object, pushed to whoever listens ─────────
class DataService {
  constructor() { this.listeners = new Set(); this.snapshot = {}; this.timer = null; this.watcher = null; }
  onUpdate(fn) { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; }
  async refresh() {
    const [metrics, last, health] = await Promise.all([
      httpJson('/metrics'), httpJson('/last'), httpJson('/health'),
    ]);
    this.snapshot = {
      at: Date.now(),
      runtimeInstalled: fs.existsSync(RUNTIME_HOOK),
      trackerUp: !!(health && health.ok),
      metrics, last,
      decisions: readDecisions(),
    };
    for (const fn of this.listeners) { try { fn(this.snapshot); } catch { /* listener bugs never kill the service */ } }
  }
  start() {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 7000);
    try {
      this.watcher = fs.watch(path.dirname(DECISIONS_LOG), { persistent: false }, (_e, f) => {
        if (f === 'decisions.log') this.refresh();
      });
    } catch { /* dir may not exist yet — poll covers it */ }
  }
  dispose() { if (this.timer) clearInterval(this.timer); if (this.watcher) this.watcher.close(); this.listeners.clear(); }
}

// ── Status bar: 🐮 T2 · $4.31↓ ──────────────────────────────────────────
function makeStatusBar(ctx, data) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  item.command = 'mooter.openCockpit';
  ctx.subscriptions.push(item);
  ctx.subscriptions.push(data.onUpdate((s) => {
    if (!vscode.workspace.getConfiguration('mooter').get('statusBar.enabled', true)) { item.hide(); return; }
    if (!s.runtimeInstalled) { item.text = '🐮 mooter: setup'; item.tooltip = 'mooter engine not installed — click to open the cockpit'; item.show(); return; }
    const tier = (s.last && s.last.tier) || (s.decisions[0] && s.decisions[0].tier) || '—';
    const saved = s.metrics ? `$${(s.metrics.saved || 0).toFixed(2)}↓` : '';
    item.text = `🐮 ${tier}${saved ? ' · ' + saved : ''}`;
    const lastModel = (s.last && s.last.model_full) || (s.decisions[0] && s.decisions[0].recommended_model) || 'n/a';
    const conf = (s.last && s.last.confidence) || (s.decisions[0] && s.decisions[0].confidence) || '';
    item.tooltip = new vscode.MarkdownString(
      `**mooter** — last decision\n\n` +
      `tier **${tier}** · ${lastModel}${conf ? ` · conf ${conf}` : ''}\n\n` +
      (s.metrics ? `saved **$${(s.metrics.saved || 0).toFixed(2)}** (${s.metrics.saved_pct || 0}% vs all-Opus) across ${s.metrics.prompts || 0} prompts\n\n` : '') +
      `_Click to open the Mooter Cockpit_`
    );
    item.show();
  }));
}

// ── Webview: the cockpit ────────────────────────────────────────────────
class CockpitProvider {
  constructor(ctx, data) { this.ctx = ctx; this.data = data; this.view = null; }
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')] };
    view.webview.html = getCockpitHtml(view.webview);
    const sub = this.data.onUpdate((s) => { try { view.webview.postMessage({ type: 'snapshot', s: publicSnapshot(s) }); } catch {} });
    view.onDidDispose(() => sub.dispose());
    view.webview.onDidReceiveMessage(async (m) => {
      if (m && m.cmd === 'launch') vscode.commands.executeCommand('mooter.newSession');
      if (m && m.cmd === 'refresh') this.data.refresh();
      if (m && m.cmd === 'install') {
        const t = vscode.window.createTerminal('mooter setup');
        t.show(); t.sendText('npx @mooter/cli');
      }
    });
    this.data.refresh();
  }
}
function publicSnapshot(s) {
  return {
    runtimeInstalled: s.runtimeInstalled, trackerUp: s.trackerUp,
    metrics: s.metrics, last: s.last,
    decisions: (s.decisions || []).slice(0, 40).map((d) => ({
      ts: d.ts, tier: d.tier, cat: d.task_category, model: d.recommended_model,
      conf: d.confidence, preview: (d.prompt_preview || '').slice(0, 90),
      rule: d.escalation_rule,
    })),
  };
}

// ── Launcher (P0-validated path: official URI handler) ─────────────────
async function newSession() {
  const ext = vscode.extensions.getExtension('anthropic.claude-code');
  if (ext) {
    await vscode.env.openExternal(vscode.Uri.parse('vscode://anthropic.claude-code/open'));
  } else {
    const pick = await vscode.window.showInformationMessage(
      'Claude Code extension not found. mooter routes inside Claude Code.', 'Install Claude Code', 'Use terminal');
    if (pick === 'Install Claude Code') vscode.commands.executeCommand('workbench.extensions.search', 'anthropic.claude-code');
    if (pick === 'Use terminal') { const t = vscode.window.createTerminal('claude'); t.show(); t.sendText('claude'); }
  }
}

function activate(ctx) {
  const data = new DataService();
  ctx.subscriptions.push({ dispose: () => data.dispose() });
  makeStatusBar(ctx, data);
  const provider = new CockpitProvider(ctx, data);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider('mooterCockpit', provider));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.openCockpit', () => vscode.commands.executeCommand('mooterCockpit.focus')));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.newSession', newSession));
  ctx.subscriptions.push(vscode.commands.registerCommand('mooter.refresh', () => data.refresh()));
  data.start();
}
function deactivate() {}
module.exports = { activate, deactivate };

// ── Cockpit HTML (UX-SPEC: only --vscode-* vars + one brand green) ─────
function getCockpitHtml(webview) {
  const nonce = String(Math.random()).slice(2);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  :root{ --moo-green: var(--vscode-charts-green, #4ec97a); }
  body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);padding:0 10px 12px;margin:0}
  .tabs{display:flex;gap:2px;border-bottom:1px solid var(--vscode-widget-border);margin:0 -10px 10px;padding:6px 10px 0}
  .tab{padding:5px 11px;cursor:pointer;color:var(--vscode-descriptionForeground);border-bottom:2px solid transparent;font-size:12px}
  .tab.on{color:var(--vscode-foreground);border-bottom-color:var(--moo-green)}
  .view{display:none}.view.on{display:block}
  .card{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:6px;padding:12px;margin-bottom:8px}
  .lbl{font-size:10px;letter-spacing:.7px;text-transform:uppercase;color:var(--vscode-descriptionForeground)}
  .big{font-size:26px;font-weight:700;color:var(--moo-green);font-variant-numeric:tabular-nums}
  .sub{font-size:12px;color:var(--vscode-descriptionForeground)} .sub b{color:var(--vscode-foreground)}
  .row{display:flex;gap:6px}.row .card{flex:1;padding:8px 10px;margin-bottom:8px}
  .v{font-size:15px;font-weight:600}.k{font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:var(--vscode-descriptionForeground)}
  .bar{display:flex;align-items:center;gap:7px;margin:5px 0;font-size:11px}
  .bar .t{width:58px;color:var(--vscode-descriptionForeground)}.bar .tr{flex:1;height:6px;background:var(--vscode-input-background);border-radius:3px;overflow:hidden}
  .bar .f{height:100%;border-radius:3px}.bar .p{width:30px;text-align:right;color:var(--vscode-descriptionForeground)}
  button.launch{width:100%;background:var(--moo-green);color:#0d2417;border:none;border-radius:5px;padding:9px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit}
  button.launch:hover{filter:brightness(1.08)}
  .hint{text-align:center;font-size:10.5px;color:var(--vscode-descriptionForeground);margin-top:6px}
  .dec{border:1px solid var(--vscode-widget-border);border-radius:5px;margin-bottom:6px;cursor:pointer;background:var(--vscode-editorWidget-background)}
  .dec:hover{background:var(--vscode-list-hoverBackground)}
  .dtop{display:flex;align-items:center;gap:7px;padding:7px 9px}
  .chip{font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;flex:none;border:1px solid transparent}
  .T0{color:var(--moo-green);border-color:var(--moo-green)}.T1{color:var(--vscode-charts-blue);border-color:var(--vscode-charts-blue)}
  .T2{color:var(--vscode-charts-yellow);border-color:var(--vscode-charts-yellow)}.T3{color:var(--vscode-charts-red);border-color:var(--vscode-charts-red)}
  .prev{flex:1;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--vscode-editor-font-family)}
  .meta{font-size:10px;color:var(--vscode-descriptionForeground);flex:none}
  .ddet{display:none;border-top:1px solid var(--vscode-widget-border);padding:7px 9px;font-size:11px;color:var(--vscode-descriptionForeground)}
  .dec.open .ddet{display:block}.ddet b{color:var(--vscode-foreground)}
  .empty{text-align:center;padding:28px 8px;color:var(--vscode-descriptionForeground);font-size:12px}
  .dr{display:flex;gap:8px;padding:7px 4px;border-bottom:1px solid var(--vscode-widget-border);font-size:12px;align-items:center}
  .dr:last-child{border:none}.dr .w{flex:1}.dr small{display:block;color:var(--vscode-descriptionForeground);font-size:10.5px}
</style></head><body>
<div class="tabs">
  <div class="tab on" data-v="cockpit">Cockpit</div>
  <div class="tab" data-v="decisions">Decisions</div>
  <div class="tab" data-v="doctor">Doctor</div>
</div>
<div class="view on" id="v-cockpit"><div class="empty">Connecting to mooter…</div></div>
<div class="view" id="v-decisions"><div class="empty">No decisions yet</div></div>
<div class="view" id="v-doctor"><div class="empty">…</div></div>
<script nonce="${nonce}">
const vsapi = acquireVsCodeApi();
const $=(s)=>document.querySelector(s);
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('on'));
  t.classList.add('on'); $('#v-'+t.dataset.v).classList.add('on');
});
function esc(x){return String(x==null?'':x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function tierCounts(decs){const c={T0:0,T1:0,T2:0,T3:0};for(const d of decs){if(c[d.tier]!=null)c[d.tier]++;}return c;}
const TIER_COLORS={T0:'var(--moo-green)',T1:'var(--vscode-charts-blue)',T2:'var(--vscode-charts-yellow)',T3:'var(--vscode-charts-red)'};
window.addEventListener('message',(e)=>{
  if(e.data.type!=='snapshot')return; const s=e.data.s;
  // COCKPIT
  if(!s.runtimeInstalled){
    $('#v-cockpit').innerHTML='<div class="card"><div class="lbl">Setup</div><div class="sub" style="margin:8px 0 10px">mooter engine is not installed yet. One command sets up local routing + savings tracking.</div><button class="launch" id="inst">Install mooter engine</button><div class="hint">runs npx @mooter/cli in the integrated terminal</div></div>';
    document.getElementById('inst').onclick=()=>vsapi.postMessage({cmd:'install'});
  } else {
    const m=s.metrics||{}; const decs=s.decisions||[]; const tc=tierCounts(decs); const tot=Math.max(1,tc.T0+tc.T1+tc.T2+tc.T3);
    let bars='';
    for(const t of ['T0','T1','T2','T3']){const pct=Math.round(100*tc[t]/tot);
      bars+='<div class="bar"><span class="t">'+t+(t==='T0'?' local':'')+'</span><div class="tr"><div class="f" style="width:'+pct+'%;background:'+TIER_COLORS[t]+'"></div></div><span class="p">'+pct+'%</span></div>';}
    $('#v-cockpit').innerHTML=
      '<div class="card"><div class="lbl">Saved vs all-Opus</div><div class="big">$'+((m.saved||0).toFixed(2))+'</div>'+
      '<div class="sub"><b>'+(m.saved_pct||0)+'%</b> below · real $'+(m.real_cost||0).toFixed(2)+' vs naive $'+(m.naive_cost||0).toFixed(2)+(s.trackerUp?'':' · <i>tracker offline — cached</i>')+'</div></div>'+
      '<div class="row"><div class="card"><div class="v">'+(m.prompts||0)+'</div><div class="k">Prompts</div></div>'+
      '<div class="card"><div class="v">$'+((m.last_turn_cost_usd||0).toFixed(2))+'</div><div class="k">Last turn</div></div>'+
      '<div class="card"><div class="v">$'+((m.avg_saved_per_prompt||0).toFixed(3))+'</div><div class="k">Avg saved</div></div></div>'+
      '<div class="card"><div class="lbl">Tier distribution · last '+decs.length+' decisions</div>'+bars+'</div>'+
      '<button class="launch" id="go">✱&nbsp; New Claude Code session</button>'+
      '<div class="hint">opens the Claude Code extension · mooter hints active</div>';
    document.getElementById('go').onclick=()=>vsapi.postMessage({cmd:'launch'});
  }
  // DECISIONS
  const decs=s.decisions||[];
  if(decs.length){
    $('#v-decisions').innerHTML=decs.map(d=>
      '<div class="dec"><div class="dtop"><span class="chip '+esc(d.tier)+'">'+esc(d.tier)+'</span>'+
      '<span class="prev">'+esc(d.preview)+'</span><span class="meta">'+esc((d.ts||'').slice(11,16))+'</span></div>'+
      '<div class="ddet">model <b>'+esc(d.model)+'</b> · category <b>'+esc(d.cat)+'</b> · confidence <b>'+esc(d.conf)+'</b>'+
      (d.rule&&d.rule!=='none'?' · rule <b>'+esc(d.rule)+'</b>':'')+'</div></div>').join('');
    document.querySelectorAll('.dec').forEach(el=>el.onclick=()=>el.classList.toggle('open'));
  }
  // DOCTOR
  const ok=(b)=>b?'✅':'❌';
  $('#v-doctor').innerHTML='<div class="card">'+
    '<div class="dr"><span>'+ok(s.runtimeInstalled)+'</span><div class="w">Routing engine<small>~/.claude/tools/router</small></div></div>'+
    '<div class="dr"><span>'+ok(s.trackerUp)+'</span><div class="w">Savings tracker<small>127.0.0.1 · /health</small></div></div>'+
    '<div class="dr"><span>'+ok(decs.length>0)+'</span><div class="w">Decisions flowing<small>'+decs.length+' recent</small></div></div>'+
    '</div><div class="hint">full diagnostics: run <b>mooter doctor</b> in the terminal</div>';
});
vsapi.postMessage({cmd:'refresh'});
</script></body></html>`;
}
