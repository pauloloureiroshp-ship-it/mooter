// mooter-cockpit v0.2.0 — extension host
// 7 requisitos (2026-06-12): brand colors · terminal parity · setup wizard ·
// slash commands mgmt · model/subscription picker · rich metrics · marketplace-ready.
// Doctrine: read-only over the runtime; zero routing logic here.
'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const data_ = require('./data.js');
const extra = require('./host-extra.js');

function trackerPort() { return vscode.workspace.getConfiguration('mooter').get('trackerPort', 7821); }

class DataService {
  constructor() { this.listeners = new Set(); this.snapshot = {}; this.timer = null; this.watcher = null; this.tick = 0; }
  onUpdate(fn) { this.listeners.add(fn); return { dispose: () => this.listeners.delete(fn) }; }
  async refresh(deep) {
    this.tick++;
    const p = trackerPort();
    const jobs = [data_.httpJson(p, '/metrics'), data_.httpJson(p, '/last'), data_.httpJson(p, '/health'), data_.httpJson(p, '/me')];
    const doDeep = deep || this.tick % 3 === 1;
    if (doDeep) jobs.push(extra.ollamaModels(), extra.statuslineHtml(), extra.slashStatus());
    const [metrics, last, health, me, ollama, sline, slash] = await Promise.all(jobs);
    const prev = this.snapshot;
    this.snapshot = {
      at: Date.now(),
      runtimeInstalled: data_.runtimeInstalled(),
      trackerUp: !!(health && health.ok),
      metrics, last, me,
      mode: extra.readMode(),
      sub: extra.readSubProfile(),
      ollama: doDeep ? ollama : prev.ollama,
      statuslineHtml: doDeep ? sline : prev.statuslineHtml,
      slash: doDeep ? slash : prev.slash,
      claudeCli: fs.existsSync(path.join(require('os').homedir(), '.local', 'bin', 'claude')),
      decisions: data_.readDecisions(),
    };
    for (const fn of this.listeners) { try { fn(this.snapshot); } catch { /* never */ } }
  }
  start() {
    this.refresh(true);
    this.timer = setInterval(() => this.refresh(false), 7000);
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
  item.command = 'mooter.openCockpit';
  ctx.subscriptions.push(item);
  ctx.subscriptions.push(data.onUpdate((s) => {
    if (!vscode.workspace.getConfiguration('mooter').get('statusBar.enabled', true)) return item.hide();
    item.text = data_.statusBarText(s);
    const lastModel = (s.last && s.last.model_full) || '—';
    item.tooltip = new vscode.MarkdownString(
      `**mooter** · mode **${s.mode}**\n\nlast: ${lastModel}` +
      (s.metrics ? `\n\nsaved **$${(s.metrics.saved || 0).toFixed(2)}** · ${s.metrics.saved_pct || 0}% vs all-Opus` : '') +
      `\n\n_Click → Mooter Cockpit_`);
    item.show();
  }));
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
    view.onDidDispose(() => sub.dispose());
    view.webview.onDidReceiveMessage(async (m) => {
      if (!m) return;
      if (m.cmd === 'launch') vscode.commands.executeCommand('mooter.newSession');
      if (m.cmd === 'refresh') this.data.refresh(true);
      if (m.cmd === 'term') runInTerminal(m.arg || 'mooter doctor');
      if (m.cmd === 'mode') { await extra.setMode(m.arg); this.data.refresh(true); }
      if (m.cmd === 'slashInstall') { runInTerminal('mooter slash-commands install'); setTimeout(() => this.data.refresh(true), 4000); }
      if (m.cmd === 'install') runInTerminal('npx @mooter/cli', 'mooter setup');
    });
    this.data.refresh(true);
  }
}

function project(s) {
  const base = data_.publicSnapshot(s);
  return Object.assign(base, {
    mode: s.mode, me: s.me, ollama: s.ollama, slash: s.slash,
    statuslineHtml: s.statuslineHtml, claudeCli: s.claudeCli,
    sub: s.sub ? { profile: s.sub.sub_profile || s.sub.profile || 'unknown' } : null,
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
function getHtml() {
  const nonce = String(Math.random()).slice(2);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  :root{--g:#4EC97A;--r:#C25F65;--ink:#0B0A09;--gdim:rgba(78,201,122,.14)}
  body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);padding:0 10px 12px;margin:0}
  .brand{display:flex;align-items:center;gap:7px;margin:8px -10px 0;padding:2px 12px 8px;border-bottom:1px solid var(--vscode-widget-border)}
  .brand .moo{font-size:15px}.brand b{color:var(--r);font-size:13.5px;letter-spacing:.3px}
  .brand .mode{margin-left:auto;font-size:10px;color:var(--g);background:var(--gdim);padding:2px 8px;border-radius:8px}
  .tabs{display:flex;gap:0;margin:0 -10px 10px;padding:4px 8px 0;border-bottom:1px solid var(--vscode-widget-border);flex-wrap:wrap}
  .tab{padding:5px 9px;cursor:pointer;color:var(--vscode-descriptionForeground);border-bottom:2px solid transparent;font-size:11.5px}
  .tab.on{color:var(--vscode-foreground);border-bottom-color:var(--g)}
  .view{display:none}.view.on{display:block}
  .card{background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-widget-border);border-radius:7px;padding:12px;margin-bottom:8px}
  .hero{background:linear-gradient(160deg,var(--ink),#142019);border:1px solid var(--g);color:#fff}
  .hero .lbl{color:#9fb8a8}.hero .sub{color:#c9d6cd}.hero .sub b{color:#fff}
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
  button.go:hover{filter:brightness(1.08)}
  .hint{text-align:center;font-size:10.5px;color:var(--vscode-descriptionForeground);margin-top:6px}
  .dec{border:1px solid var(--vscode-widget-border);border-radius:5px;margin-bottom:6px;cursor:pointer;background:var(--vscode-editorWidget-background)}
  .dec:hover{background:var(--vscode-list-hoverBackground)}
  .dtop{display:flex;align-items:center;gap:7px;padding:7px 9px}
  .chip{font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;flex:none;border:1px solid}
  .T0{color:var(--g);border-color:var(--g)}.T1{color:#61afef;border-color:#61afef}.T2{color:#e5c07b;border-color:#e5c07b}.T3{color:var(--r);border-color:var(--r)}
  .prev{flex:1;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:var(--vscode-editor-font-family)}
  .meta{font-size:10px;color:var(--vscode-descriptionForeground)}
  .ddet{display:none;border-top:1px solid var(--vscode-widget-border);padding:7px 9px;font-size:11px;color:var(--vscode-descriptionForeground)}
  .dec.open .ddet{display:block}.ddet b{color:var(--vscode-foreground)}
  .empty{text-align:center;padding:26px 8px;color:var(--vscode-descriptionForeground);font-size:12px}
  .dr{display:flex;gap:8px;padding:7px 4px;border-bottom:1px solid var(--vscode-widget-border);font-size:12px;align-items:center}
  .dr:last-child{border:none}.dr .w{flex:1}.dr small{display:block;color:var(--vscode-descriptionForeground);font-size:10.5px}
  .seg{display:inline-flex;background:var(--vscode-input-background);border-radius:6px;padding:2px;gap:1px}
  .seg span{padding:4px 11px;font-size:11px;border-radius:5px;cursor:pointer;color:var(--vscode-descriptionForeground)}
  .seg span.on{background:var(--gdim);color:var(--g);font-weight:600}
  .pill{display:inline-block;font-size:10.5px;border:1px solid var(--vscode-widget-border);border-radius:9px;padding:2px 9px;margin:2px 3px 2px 0}
  .term{background:var(--ink);border-radius:7px;padding:10px 12px;font:11.5px var(--vscode-editor-font-family);color:#ddd;overflow-x:auto;white-space:pre;line-height:1.7}
  .wstep{display:flex;gap:10px;align-items:flex-start;padding:9px 4px;border-bottom:1px solid var(--vscode-widget-border)}
  .wstep:last-child{border:none}.wstep .n{width:20px;height:20px;border-radius:50%;background:var(--gdim);color:var(--g);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
  .wstep.done .n{background:var(--g);color:var(--ink)}
  .wstep .w{flex:1;font-size:12px}.wstep small{display:block;color:var(--vscode-descriptionForeground);font-size:10.5px;margin-top:1px}
</style></head><body>
<div class="brand"><span class="moo">🐮</span><b>mooter</b><span style="font-size:10.5px;color:var(--vscode-descriptionForeground)">cockpit</span><span class="mode" id="modeBadge">auto</span></div>
<div class="tabs">
  <div class="tab on" data-v="cockpit">Cockpit</div><div class="tab" data-v="metrics">Metrics</div>
  <div class="tab" data-v="decisions">Decisions</div><div class="tab" data-v="models">Models</div>
  <div class="tab" data-v="terminal">Terminal</div><div class="tab" data-v="doctor">Doctor</div>
</div>
<div class="view on" id="v-cockpit"><div class="empty">Connecting to mooter…</div></div>
<div class="view" id="v-metrics"><div class="empty">…</div></div>
<div class="view" id="v-decisions"><div class="empty">No decisions yet</div></div>
<div class="view" id="v-models"><div class="empty">…</div></div>
<div class="view" id="v-terminal"><div class="empty">…</div></div>
<div class="view" id="v-doctor"><div class="empty">…</div></div>
<script nonce="${nonce}">
const vsapi=acquireVsCodeApi();const $=(s)=>document.querySelector(s);
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('on'));t.classList.add('on');$('#v-'+t.dataset.v).classList.add('on');});
function esc(x){return String(x==null?'':x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function tc(d){const c={T0:0,T1:0,T2:0,T3:0};for(const x of d)if(c[x.tier]!=null)c[x.tier]++;return c;}
const TCOL={T0:'var(--g)',T1:'#61afef',T2:'#e5c07b',T3:'var(--r)'};
function send(cmd,arg){vsapi.postMessage({cmd,arg});}
window.addEventListener('message',(e)=>{
  if(e.data.type!=='snapshot')return;const s=e.data.s;
  $('#modeBadge').textContent=s.mode||'auto';
  const m=s.metrics||{};const me=s.me||{};const decs=s.decisions||[];

  // ── WIZARD (substitui o Cockpit quando o engine falta) — req 3
  if(!s.runtimeInstalled){
    const steps=[
      {ok:s.claudeCli,t:'Claude Code CLI',d:s.claudeCli?'detected':'install Claude Code first',btn:null},
      {ok:false,t:'mooter engine',d:'one command — local routing + savings tracker',btn:['Install engine','install']},
      {ok:s.ollama&&s.ollama.length>0,t:'Ollama (free local tier)',d:s.ollama?((s.ollama||[]).length+' models ready'):'optional — enables T0 free routing',btn:['ollama.com →','term','open https://ollama.com/download']},
      {ok:false,t:'First routed prompt',d:'launch a session — savings start counting',btn:null}];
    $('#v-cockpit').innerHTML='<div class="card hero"><div class="lbl">Setup wizard</div><div class="sub" style="margin-top:6px">Same flow as mooter.ai/onboarding — 4 steps, ~90 seconds.</div></div><div class="card">'+
      steps.map((st,i)=>'<div class="wstep'+(st.ok?' done':'')+'"><div class="n">'+(st.ok?'✓':i+1)+'</div><div class="w">'+esc(st.t)+'<small>'+esc(st.d)+'</small></div>'+(st.btn?'<button data-a="'+st.btn[1]+'" data-x="'+esc(st.btn[2]||'')+'">'+esc(st.btn[0])+'</button>':'')+'</div>').join('')+'</div>';
    document.querySelectorAll('#v-cockpit button').forEach(b=>b.onclick=()=>send(b.dataset.a,b.dataset.x||undefined));
  } else {
    // ── COCKPIT — req 1 (brand) + req 6 light
    const cnt=tc(decs);const tot=Math.max(1,cnt.T0+cnt.T1+cnt.T2+cnt.T3);
    let bars='';for(const t of['T0','T1','T2','T3']){const p=Math.round(100*cnt[t]/tot);bars+='<div class="bar"><span class="t">'+t+(t==='T0'?' local':'')+'</span><div class="tr"><div class="f" style="width:'+p+'%;background:'+TCOL[t]+'"></div></div><span class="p">'+p+'%</span></div>';}
    $('#v-cockpit').innerHTML='<div class="card hero"><div class="lbl">Saved vs all-Opus</div><div class="big">$'+(m.saved||0).toFixed(2)+'</div><div class="sub"><b>'+(m.saved_pct||0)+'%</b> below · real $'+(m.real_cost||0).toFixed(2)+' vs naive $'+(m.naive_cost||0).toFixed(2)+(s.trackerUp?'':' · <i>tracker offline</i>')+'</div></div>'+
      '<div class="row"><div class="card"><div class="v">'+(m.prompts||0)+'</div><div class="k">Prompts</div></div><div class="card"><div class="v">'+(me.prompts_today!=null?me.prompts_today:'—')+'</div><div class="k">Today</div></div><div class="card"><div class="v">$'+(m.avg_saved_per_prompt||0).toFixed(3)+'</div><div class="k">Avg saved</div></div></div>'+
      '<div class="card"><div class="lbl">Tier mix · last '+decs.length+'</div>'+bars+'</div>'+
      '<button class="go" id="go">✱&nbsp; New Claude Code session</button><div class="hint">mooter hints active · mode '+esc(s.mode)+'</div>';
    document.getElementById('go').onclick=()=>send('launch');
  }

  // ── METRICS — req 6
  const cbt=m.cost_by_tier||{};const pbt=m.pct_by_tier||{};const bym=m.by_model||{};
  let mb='';for(const t of['T0','T1','T2','T3'])mb+='<div class="bar"><span class="t">'+t+'</span><div class="tr"><div class="f" style="width:'+(pbt[t]||0)+'%;background:'+TCOL[t]+'"></div></div><span class="p">$'+((cbt[t]||0).toFixed(2))+'</span></div>';
  let models='';for(const k in bym)if(bym[k])models+='<span class="pill">'+esc(k)+' · '+bym[k]+'</span>';
  const cats=(me.top_categories||[]).slice(0,4).map(c=>'<span class="pill">'+esc(c.category)+' · '+c.count+'</span>').join('');
  $('#v-metrics').innerHTML='<div class="card hero"><div class="lbl">Why mooter is worth it</div><div class="big">'+(m.saved_pct||0)+'%</div><div class="sub">of an all-Opus bill, gone. <b>$'+(m.saved||0).toFixed(2)+'</b> kept across <b>'+(m.prompts||0)+'</b> prompts — '+(pbt.T0||0)+'% ran <b>free</b> on local hardware.</div></div>'+
    '<div class="card"><div class="lbl">Cost by tier (real $)</div>'+mb+'</div>'+
    '<div class="card"><div class="lbl">Model usage</div>'+(models||'<span class="sub">—</span>')+'</div>'+
    '<div class="card"><div class="lbl">Top categories · 30d</div>'+(cats||'<span class="sub">—</span>')+'</div>'+
    '<div class="card"><div class="lbl">30-day pulse</div><div class="sub">prompts 30d <b>'+(me.prompts_30d!=null?me.prompts_30d:'—')+'</b> · peak hours UTC <b>'+esc((me.peak_hours_utc||[]).join(', ')||'—')+'</b></div></div>';

  // ── DECISIONS
  if(decs.length){$('#v-decisions').innerHTML=decs.map(d=>'<div class="dec"><div class="dtop"><span class="chip '+esc(d.tier)+'">'+esc(d.tier)+'</span><span class="prev">'+esc(d.preview)+'</span><span class="meta">'+esc((d.ts||'').slice(11,16))+'</span></div><div class="ddet">model <b>'+esc(d.model)+'</b> · '+esc(d.cat)+' · conf <b>'+esc(d.conf)+'</b>'+(d.rule&&d.rule!=='none'?' · rule <b>'+esc(d.rule)+'</b>':'')+'</div></div>').join('');
    document.querySelectorAll('.dec').forEach(el=>el.onclick=()=>el.classList.toggle('open'));}

  // ── MODELS — req 5
  const oll=s.ollama;const sub=s.sub;
  $('#v-models').innerHTML='<div class="card"><div class="lbl">Routing mode</div><div style="margin:8px 0 4px"><span class="seg" id="modeSeg"><span data-m="beast"'+(s.mode==='beast'?' class="on"':'')+'>🐂 beast</span><span data-m="auto"'+(s.mode==='auto'?' class="on"':'')+'>⚖️ auto</span><span data-m="zen"'+(s.mode==='zen'?' class="on"':'')+'>🐄 zen</span></span></div><div class="sub">beast = all-power (cloud máx) · auto = mooter decides · zen = conserve (local first)</div></div>'+
    '<div class="card"><div class="lbl">Subscription (cloud tiers)</div><div class="sub" style="margin-top:6px">'+(sub?'<span class="pill" style="border-color:var(--g);color:var(--g)">'+esc(sub.profile)+'</span> drives T1-T3 budgets':'not configured — run setup-profile')+'</div></div>'+
    '<div class="card"><div class="lbl">Local models (T0 · free)</div><div style="margin-top:6px">'+(oll===null?'<span class="sub">Ollama offline — <i>free tier disabled</i></span>':((oll||[]).map(x=>'<span class="pill">'+esc(x.name)+(x.sizeGb?' · '+x.sizeGb+'GB':'')+'</span>').join('')||'<span class="sub">no models — ollama pull qwen2.5:3b</span>'))+'</div></div>';
  const seg=document.getElementById('modeSeg');if(seg)seg.querySelectorAll('span[data-m]').forEach(el=>el.onclick=()=>send('mode',el.dataset.m));

  // ── TERMINAL — req 2 (paridade Win/Mac)
  $('#v-terminal').innerHTML='<div class="card"><div class="lbl">Live statusline (same renderer as your terminal)</div><div class="term" style="margin-top:8px">'+(s.statuslineHtml||'<span style="opacity:.6">renderer warming up…</span>')+'</div></div>'+
    '<div class="card"><div class="lbl">mooter commands → integrated terminal</div><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">'+
    ['mooter doctor','mooter savings','mooter sessions list','mooter why-not-fable','mooter statusline mode didactic','mooter sync'].map(c=>'<button data-c="'+esc(c)+'">'+esc(c.replace('mooter ',''))+'</button>').join('')+
    '</div><div class="hint">identical on macOS and Windows — the CLI is the contract</div></div>';
  document.querySelectorAll('#v-terminal button').forEach(b=>b.onclick=()=>send('term',b.dataset.c));

  // ── DOCTOR + SLASH — req 4
  const ok=(b)=>b?'✅':(b===null?'🟡':'❌');
  const sl=s.slash||{};
  $('#v-doctor').innerHTML='<div class="card">'+
    '<div class="dr"><span>'+ok(s.runtimeInstalled)+'</span><div class="w">Routing engine<small>~/.claude/tools/router</small></div></div>'+
    '<div class="dr"><span>'+ok(s.trackerUp)+'</span><div class="w">Savings tracker<small>/health</small></div></div>'+
    '<div class="dr"><span>'+ok(s.ollama===null?false:(s.ollama||[]).length>0)+'</span><div class="w">Ollama / T0<small>'+(s.ollama?(s.ollama.length+' models'):'offline')+'</small></div></div>'+
    '<div class="dr"><span>'+ok(decs.length>0)+'</span><div class="w">Decisions flowing<small>'+decs.length+' recent</small></div></div></div>'+
    '<div class="card"><div class="lbl">Slash commands (/mooter in Claude Code)</div><div class="dr" style="border:none"><span>'+ok(sl.installed)+'</span><div class="w">'+(sl.installed?'/mooter skill installed':'not installed')+'<small>route · savings · explain · tier · bench</small></div><button id="slashBtn">'+(sl.installed?'Update':'Install')+'</button></div></div>'+
    '<div style="display:flex;gap:6px"><button data-c="mooter doctor" style="flex:1">Full doctor →</button><button id="rfsh" style="flex:1">Refresh</button></div>';
  const sb=document.getElementById('slashBtn');if(sb)sb.onclick=()=>send('slashInstall');
  const rf=document.getElementById('rfsh');if(rf)rf.onclick=()=>send('refresh');
  document.querySelectorAll('#v-doctor button[data-c]').forEach(b=>b.onclick=()=>send('term',b.dataset.c));
});
send('refresh');
</script></body></html>`;
}
