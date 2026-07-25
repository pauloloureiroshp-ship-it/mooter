#!/usr/bin/env node
'use strict';
/**
 * server-apps.js — mooter-bridge v1.1 entrypoint: seamless quartet + the native
 * fleet panel (MCP Apps), hardened for a stdio host that will not tolerate a
 * single stray byte on stdout.
 *
 * v0.5 boot hardening (why each line exists):
 *   1. console.* is redirected to stderr BEFORE anything else is required.
 *      In stdio MCP, stdout carries ONLY JSON-RPC. Any dependency that calls
 *      console.log corrupts the stream and the host reports "could not attach"
 *      while the process happily stays alive. host-extra.js is 163 KB of VS Code
 *      extension code — exactly the kind of module that logs.
 *   2. host-extra is loaded LAZILY, on first use, never at boot. Requiring a
 *      huge module during startup risks blowing the host's attach timeout.
 *   3. protocolVersion is answered from a version we actually support instead of
 *      echoing whatever the client sent.
 *   4. uncaughtException / unhandledRejection are logged to stderr, never fatal.
 *
 * Purely ADDITIVE: server.js, seamless.js, server-seamless.js are untouched.
 */

// ── 1. stdout is sacred. Do this FIRST, before any require. ────────────────
const _realStdoutWrite = process.stdout.write.bind(process.stdout);
// Um write SÍNCRONO em stderr bloqueia o event loop se o host nao drenar o pipe.
// No Windows isso congela o servidor inteiro: stdin fica ligado, nada e' respondido,
// o host desiste e mata. Foi o que o diario apanhou. Por omissao nao tocamos em stderr.
const STDERR_OK = process.env.MOOTER_STDERR === '1';
function elog(...a) {
  const line = a.map(String).join(' ');
  if (STDERR_OK) { try { process.stderr.write('[mooter-bridge] ' + line + '\n'); } catch { /* */ } }
  jlogSafe('LOG', line);
}
function jlogSafe(ev, d) { try { jlog(ev, d); } catch { /* */ } }
// Nada de dependencias a escrever em stdout (parte o JSON-RPC) NEM em stderr
// (pode bloquear). Tudo o que qualquer modulo imprima vai para o diario.
for (const m of ['log', 'info', 'warn', 'debug', 'trace', 'dir', 'error']) {
  console[m] = (...a) => { try { jlogSafe('CONSOLE.' + m, a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); } catch { /* */ } };
}

// ── 1b. Self-instrumentation ──────────────────────────────────────────────
// The host reports "could not attach" without telling anyone WHY, and the app's
// own MCP log lives under %APPDATA%, outside every mount. So the server keeps its
// own boot/RPC journal inside the repo, where it can actually be read.
const _fsx = require('fs');
const _pathx = require('path');
const _osx = require('os');
let LOGFILE = null;
(function pickLogFile() {
  const envDir = process.env.MOOTER_LOG_DIR;
  const cands = [];
  if (envDir && envDir.indexOf('${') < 0) cands.push(envDir);
  cands.push(_pathx.join(_osx.homedir(), 'frugal', '_handoff'));
  cands.push(_pathx.join(_osx.homedir(), 'Documents', 'frugal', '_handoff'));
  cands.push(_pathx.join(_osx.homedir(), '.mooter'));
  cands.push(_osx.tmpdir());
  for (const d of cands) {
    try {
      if (!_fsx.existsSync(d)) { if (d.endsWith('.mooter')) { try { _fsx.mkdirSync(d, { recursive: true }); } catch { continue; } } else continue; }
      const f = _pathx.join(d, 'mooter-mcp-boot.log');
      _fsx.appendFileSync(f, '');
      LOGFILE = f;
      return;
    } catch { /* next candidate */ }
  }
})();
function jlog(event, detail) {
  if (!LOGFILE) return;
  try {
    const st = _fsx.statSync(LOGFILE);
    if (st.size > 262144) _fsx.writeFileSync(LOGFILE, '');   // keep it bounded
  } catch { /* */ }
  try {
    _fsx.appendFileSync(LOGFILE,
      new Date().toISOString() + '  ' + event + (detail == null ? '' : '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))) + '\n');
  } catch { /* never let logging kill the server */ }
}

process.on('uncaughtException', (e) => { elog('uncaught:', (e && e.stack) || e); jlog('UNCAUGHT', (e && e.stack) || String(e)); });
process.on('unhandledRejection', (e) => { elog('unhandled:', (e && e.stack) || e); jlog('UNHANDLED', (e && e.stack) || String(e)); });
process.on('exit', (c) => jlog('EXIT', { code: c }));

// ── 1c. MOOTER_REPO: a raiz do repo, resolvida ANTES de seamless.js carregar ──
// seamless.js faz `const REPO = process.env.MOOTER_REPO || path.resolve(__dirname,'..','..')`
// no topo do modulo. Dentro do .mcpb esse fallback aponta para a pasta das
// extensoes do Claude -> o guard recusava todo o dispatch ("worktree fora da raiz
// permitida") e o route nao encontrava tools/router/classify.js. Apanhado no
// dry-run de cc+codex. A deteccao e' barata: procurar o classify.js congelado.
(function pickRepo() {
  const cur = process.env.MOOTER_REPO;
  if (cur && cur.indexOf('${') < 0 && cur.trim()) {
    if (_fsx.existsSync(_pathx.join(cur, 'tools', 'router', 'classify.js'))) { jlogSafe('REPO', { from: 'env', root: cur }); return; }
    jlogSafe('REPO_ENV_INVALIDO', cur);
  }
  const hint = process.env.MOOTER_HOME;
  const cands = [];
  if (hint && hint.indexOf('${') < 0 && hint.trim()) cands.push(hint);
  cands.push(_pathx.join(_osx.homedir(), 'frugal'));
  cands.push(_pathx.join(_osx.homedir(), 'Documents', 'frugal'));
  let d = __dirname;
  for (let i = 0; i < 6; i++) { cands.push(d); d = _pathx.dirname(d); }
  for (const c of cands) {
    try {
      if (_fsx.existsSync(_pathx.join(c, 'tools', 'router', 'classify.js'))) {
        process.env.MOOTER_REPO = c;
        jlogSafe('REPO', { from: 'auto', root: c });
        return;
      }
    } catch { /* proximo candidato */ }
  }
  jlogSafe('REPO_NAO_ENCONTRADO', 'route/dispatch vao recusar; define MOOTER_REPO');
})();

const path = require('path');
const base = require('./server.js');
const seam = require('./seamless.js');
const fleet = require('./fleet.js');

jlog('BOOT', { pid: process.pid, node: process.version, platform: process.platform,
               dirname: __dirname, cwd: process.cwd(), repo: process.env.MOOTER_REPO || null,
               seamlessRepo: (seam._paths && seam._paths.REPO) || null, logfile: LOGFILE });

// protocol versions this server actually implements
const SUPPORTED_PV = ['2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_PV = '2025-06-18';

function send(msg) {
  let line;
  try { line = JSON.stringify(msg) + '\n'; }
  catch (e) { jlog('TX_SERIALIZE_FAIL', (e && e.message) || String(e)); return; }
  try { _realStdoutWrite(line); jlog('TX', { id: msg.id, bytes: line.length, error: msg.error ? msg.error.message : undefined }); }
  catch (e) { elog('send fail', (e && e.message) || ''); jlog('TX_FAIL', (e && e.message) || String(e)); }
}

// ── 2. host-extra: lazy, guarded, never at boot ───────────────────────────
// It only enriches the panel with the concrete model name. Nice to have; never
// worth risking the handshake for.
let hostExtraTried = false;
function ensureHostExtra() {
  if (hostExtraTried) return;
  hostExtraTried = true;
  try {
    const os = require('os');
    const fs = require('fs');
    const rel = path.join('packages', 'vscode-extension', 'src', 'host-extra.js');
    const cands = [];
    const env = fleet.envOrNull('MOOTER_HOME');
    if (env) cands.push(env);
    cands.push(path.join(os.homedir(), 'frugal'), path.join(os.homedir(), 'Documents', 'frugal'));
    for (const c of cands) {
      const p = path.join(c, rel);
      try {
        if (!fs.existsSync(p)) continue;
        base.setHostExtra(require(p));
        elog('host-extra wired from ' + c);
        return;
      } catch (e) { elog('host-extra at ' + c + ' failed: ' + ((e && e.message) || e)); }
    }
    elog('host-extra not found — model names stay null (honest)');
  } catch (e) { elog('host-extra probe failed: ' + ((e && e.message) || e)); }
}

async function sessionsListLazy(args) {
  ensureHostExtra();
  return base.toolSessionsList(args);
}

// ── registry ──────────────────────────────────────────────────────────────
for (const t of seam.TOOLS) {
  if (!base.TOOLS.find((x) => x.name === t.name)) base.TOOLS.push(t);
}
for (const t of fleet.TOOLS) {
  if (base.TOOLS.find((x) => x.name === t.name)) continue;
  base.TOOLS.push(Object.assign({}, t, {
    handler: t.handler || ((args) => fleet.toolFleet(args, { sessionsList: sessionsListLazy })),
  }));
}

/**
 * ⚠️ A versão é LIDA do manifest, nunca escrita à mão.
 *
 * A v1.4.2 saiu a dizer ao host que era a 1.4.1 porque a string estava colada
 * no código e o bump só tocou no manifest. Um conector que mente sobre a
 * própria versão torna impossível responder à única pergunta que interessa
 * quando algo falha: "é esta a build que eu instalei?".
 */
const VERSION = (() => {
  for (const p of [_pathx.join(__dirname, '..', 'manifest.json'), _pathx.join(__dirname, 'manifest.json')]) {
    try { const v = JSON.parse(_fsx.readFileSync(p, 'utf8')).version; if (v) return String(v); } catch { /* próximo */ }
  }
  return 'n/d';   // nunca inventar um número de versão
})();

// ── Onda B (v1.4.1) · a superfície passa a SEIS ───────────────────────────
// As seis substituem as antigas em `tools/list`. Os nomes antigos continuam a
// funcionar em `tools/call` como aliases NÃO documentados durante uma versão —
// a mitigação que o relatório pediu, porque este conector tem um utilizador e
// partir-lhe as automações por estética seria vaidade, não engenharia.
const tools6 = require('./tools6.js');
const SEIS = tools6.build(seam, fleet, base);
const ANTIGAS = base.TOOLS.slice();                 // continuam chamáveis
for (const t of SEIS) {
  const i = base.TOOLS.findIndex((x) => x.name === t.name);
  if (i >= 0) base.TOOLS[i] = t; else base.TOOLS.push(t);
}

jlog('REGISTRY_OK', { tools: base.TOOLS.length, publicas: tools6.PUBLICAS.length });
const RESOURCES = [fleet.UI_RESOURCE];

/**
 * ⚠️ v1.3.2 — ONE PANEL PER WAVE, NOT ONE PER CALL.
 *
 * v1.3.1 attached the UI resource to seven tools so the panel would refresh
 * during a dispatch → status → collect loop. In this host every `tools/call`
 * carrying a resourceUri renders a NEW widget in the conversation — it does not
 * repaint the previous one. One real session produced **22 stacked panels** and
 * the user's verdict was "fiquei perdido".
 *
 * The repaint was never needed: fleet-ui.html already polls itself every 2-4 s
 * while a job is alive. The v1.2 critique said it in writing — "the polling IS
 * the correct architecture for this host, don't touch it" — and then v1.3.1
 * touched it. This reverts that, deliberately.
 *
 * The panel is a PLACE, not a message. Only tools that legitimately open the
 * place carry it; the working loop stays silent and lets the panel breathe.
 */
const ANCHOR_TOOLS = new Set(['mooter_fleet', 'mooter_work']);
const LOOP_EXTRA = ['mooter_check', 'mooter_setup'];
const LOOP_TOOLS = new Set(['mooter_dispatch', 'mooter_status', 'mooter_collect', 'mooter_cancel', 'mooter_plan', 'mooter_journal', 'mooter_await', 'mooter_check', 'mooter_setup', 'mooter_worktrees']);
for (const t of base.TOOLS) {
  if (!ANCHOR_TOOLS.has(t.name)) continue;
  t._meta = Object.assign({}, t._meta, { ui: { resourceUri: fleet.UI_URI, visibility: ['model', 'app'] } });
}

/** One sentence a person can read, before the JSON. */
function humanLine(name, d) {
  if (!d || typeof d !== 'object') return null;
  if (d.error) return '⚠ ' + d.error;
  switch (name) {
    case 'mooter_work':
      return '🐮 ' + (d.agent === 'moo' ? 'GPU local' : (d.model || d.agent)) + ' a trabalhar em "' + String(d.goal || '').slice(0, 60) + '" · ' + d.mode + ' · job ' + d.job_id;
    case 'mooter_dispatch':
      return '🐮 despachado ' + d.job_id + ' → ' + (d.model || d.agent) + (d.tier ? ' (' + d.tier + ', ' + d.routed + ')' : '');
    case 'mooter_status': {
      const j = (d.jobs || [])[0];
      if (!j) return null;
      const n = j.now || {};
      return '🐮 ' + j.job_id + ': ' + (j.stale ? 'ÓRFÃO (ledger diz ' + j.last + ', processo não existe)' : j.last)
        + (n.model ? ' · ' + n.model : '') + (n.activity ? ' · ' + n.activity : '')
        + (n.tokens_out != null ? ' · ' + n.tokens_out + ' tok out' : '') + (n.tok_s ? ' · ' + n.tok_s + ' tok/s' : '');
    }
    case 'mooter_collect':
      return '🐮 ' + d.job_id + ' ' + d.state + (d.model_used ? ' · ' + d.model_used : '')
        + (d.cost_usd != null ? ' · $' + Number(d.cost_usd).toFixed(4) : '')
        + (d.tokens_out != null ? ' · ' + d.tokens_out + ' tok out' : '');
    case 'mooter_await':
      if (d.timed_out) return '🐮 ainda a correr ao fim de ' + d.waited_s + 's — ' + (d.jobs || []).length + ' job(s)';
      return '🐮 wave fechada em ' + d.waited_s + 's · ' + d.done + '/' + d.total + ' ok'
        + (d.failed ? ' · ' + d.failed + ' falhou' : '') + (d.cost_usd ? ' · $' + Number(d.cost_usd).toFixed(4) : '');
    case 'mooter_cancel':
      return '🐮 ' + (d.count != null ? (d.count + ' órfão(s) encerrado(s)') : (d.job_id + ' encerrado' + (d.killed ? ' (processo morto)' : '')));
    case 'mooter_plan':
      return '🐮 plano ' + d.wave + ': ' + d.done + '/' + d.total + ' feitas' + (d.high_risk_open ? ' · ⚠ ' + d.high_risk_open + ' de risco alto por fazer' : '') + (d.current ? ' · agora: ' + d.current.title : '');
    case 'mooter_journal':
      return d.ok ? ('🐮 nota escrita no vault: ' + d.file) : (d.available === false || d.root === null ? '🐮 vault n/d — nada escrito' : null);
    default: return null;
  }
}

// ── v1.2 · close the ghosts left by the previous process ──────────────────
// A connector restart used to leave jobs `started` forever, and the WIP guard
// then refused every dispatch on that worktree with no way out. Sweeping at
// boot is the only moment we can be certain those children are not ours.
try {
  const swept = seam.sweepOrphans();
  if (swept.length) jlog('SWEPT_ORPHANS', swept);
} catch (e) { jlog('SWEEP_FAIL', (e && e.message) || String(e)); }

async function handle(msg) {
  if (!msg || msg.jsonrpc !== '2.0') return null;
  const { id, method, params } = msg;

  // Own initialize outright: never echo a protocol version we do not implement.
  if (method === 'initialize') {
    const want = params && params.protocolVersion;
    const pv = (typeof want === 'string' && SUPPORTED_PV.indexOf(want) >= 0) ? want : DEFAULT_PV;
    elog('initialize: client asked ' + want + ' -> answering ' + pv);
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: pv,
        capabilities: { tools: {}, resources: { listChanged: false } },
        // `title` is what a human should see; `name` stays the machine id.
        // v1.1 shipped name:"mooter-bridge" while the manifest said "Mooter" —
        // two labels for one thing, and the panel had no way to show either.
        serverInfo: { name: 'mooter-bridge', title: 'Mooter', version: VERSION },
      },
    };
  }

  if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: RESOURCES } };
  if (method === 'resources/templates/list') return { jsonrpc: '2.0', id, result: { resourceTemplates: [] } };
  if (method === 'resources/read') {
    const uri = params && params.uri;
    if (uri !== fleet.UI_URI) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'unknown resource: ' + uri } };
    return { jsonrpc: '2.0', id, result: { contents: [{ uri: fleet.UI_URI, mimeType: fleet.UI_MIME, text: fleet.readUiHtml() }] } };
  }

  // ── v1.2 · the panel repaints at every step of the loop ───────────────────
  // In v1.1 only mooter_fleet carried the UI resource, so during a dispatch →
  // status → collect loop the panel simply never refreshed: the user watched a
  // static card while an agent worked for three minutes. Attaching the same
  // resourceUri to every tool in the loop makes the host re-render the View on
  // each call — no notifications needed (the host does not send progressTokens
  // anyway: anthropics/claude-code#58687).
  if (method === 'tools/call' && params && LOOP_TOOLS.has(params.name)) {
    const res2 = await base.handle(msg);
    if (res2 && res2.result && !res2.error) {
      // ❌ no `_meta.ui` here on purpose — see ANCHOR_TOOLS above.
      // ⚠️ v1.3.2 — the chat gets PROSE, the model gets the data.
      // v1.3.1 prefixed the human line to the JSON, so the user read one nice
      // sentence followed by 4 KB of structure. structuredContent already
      // carries everything the model and the panel need; the text channel is
      // for the person, and a person does not read a ledger row.
      try {
        const sc = res2.result.structuredContent
          || (res2.result.content && res2.result.content[0] && JSON.parse(res2.result.content[0].text));
        const line = humanLine(params.name, sc);
        if (line && res2.result.content && res2.result.content[0]) {
          if (!res2.result.structuredContent) res2.result.structuredContent = sc;
          res2.result.content[0].text = line;
        }
      } catch { /* prose is a bonus, never a failure mode */ }
    }
    return res2;
  }

  // mooter_fleet: own the result so the no-UI fallback reads like prose, not JSON
  if (method === 'tools/call' && params && params.name === 'mooter_fleet') {
    try {
      // v1.4.1 — usar o handler REGISTADO (o da Onda B, que percebe `view`),
      // e não `fleet.toolFleet` directamente: esta intercepção existia para dar
      // texto humano ao fallback sem painel, e estava a passar à frente da tool.
      const reg = base.TOOLS.find((t) => t.name === 'mooter_fleet');
      const out = reg && reg.handler
        ? await reg.handler(params.arguments || {})
        : await fleet.toolFleet(params.arguments || {}, { sessionsList: sessionsListLazy });
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: (out && out.resumo) ? out.resumo : fleet.formatFleetText(out) }],
          structuredContent: out,
          isError: !!(out && out.error),
          _meta: { ui: { resourceUri: fleet.UI_URI } },
        },
      };
    } catch (e) {
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'mooter_fleet falhou: ' + ((e && e.message) || e) }], isError: true } };
    }
  }

  const res = await base.handle(msg);
  if (method === 'tools/list' && res && res.result && Array.isArray(res.result.tools)) {
    for (const shaped of res.result.tools) {
      const src = base.TOOLS.find((t) => t.name === shaped.name);
      if (src && src._meta) shaped._meta = src._meta;
    }
    // só as seis são anunciadas; as antigas ficam chamáveis mas invisíveis
    const antes = res.result.tools.length;
    res.result.tools = res.result.tools.filter((t) => tools6.PUBLICAS.includes(t.name));
    res.result.tools.sort((a, b) => tools6.PUBLICAS.indexOf(a.name) - tools6.PUBLICAS.indexOf(b.name));
    jlog('TOOLS_LIST', { anunciadas: res.result.tools.length, escondidas: antes - res.result.tools.length });
  }
  return res;
}

function main() {
  jlog('MAIN_ENTER');
  let buf = '';
  let pending = 0;
  let stdinEnded = false;
  const maybeExit = () => { if (stdinEnded && pending === 0 && seam.REGISTRY.size === 0) process.exit(0); };
  jlog('STDIN_WIRING');
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { elog('bad json line'); jlog('RX_BAD_JSON', line.slice(0, 200)); continue; }
      jlog('RX', { id: m.id, method: m.method });
      pending++;
      Promise.resolve(handle(m))
        .then((res) => { if (res) send(res); })
        .catch((e) => { elog('handle err', (e && e.stack) || e); jlog('HANDLE_ERR', (e && e.stack) || String(e)); })
        .finally(() => { pending--; maybeExit(); });
    }
  });
  jlog('STDIN_WIRED');
  process.stdin.on('end', () => {
    stdinEnded = true; maybeExit();
    if (seam.REGISTRY.size > 0) {
      const iv = setInterval(() => { if (seam.REGISTRY.size === 0 && pending === 0) { clearInterval(iv); maybeExit(); } }, 1000);
      try { iv.unref(); } catch { /* ambiente sem unref */ }
      iv.unref && iv.unref();
    }
  });
  jlog('READY', { tools: base.TOOLS.map((t) => t.name), resources: RESOURCES.map((r) => r.uri) });
}

// O host do Claude Desktop carrega o entry_point da extensao SEM que ele seja o
// modulo principal do Node — `require.main === module` da FALSE. Com o gate antigo,
// main() nunca corria: o servidor carregava as 9 tools, nao ligava o stdin, nao
// respondia a nada, e o host matava-o por timeout. Foi isto, confirmado pelo diario:
//   PRE_MAIN {"isMain":false}  ->  zero MAIN_ENTER, zero READY, zero RX.
// Arrancar e' o comportamento correto por omissao; quem quiser so' importar o modulo
// (testes) define MOOTER_LIB=1.
jlog('PRE_MAIN', { isMain: require.main === module, lib: !!process.env.MOOTER_LIB });
let _started = false;
function bootOnce() { if (_started) return; _started = true; main(); }
if (!process.env.MOOTER_LIB) bootOnce();
else jlog('MAIN_SKIPPED', 'MOOTER_LIB=1');
module.exports = { handle, main, bootOnce, RESOURCES };
