#!/usr/bin/env node
// run.mjs — P5: o que sai da maquina para DECIDIR. Ver protocol.json (congelado).
//
//   node run.mjs --arm A        hook real desta maquina, HOME real, sob net-tap + counting-proxy (observacao)
//   node run.mjs --arm A-block  idem com NET_TAP_BLOCK=1 (rede externa recusada): o tier tem de ser o mesmo
//   node run.mjs --arm B        arbitro instrumentado em processo (nada sai; grava o corpo que SAIRIA)
//   node run.mjs --arm D        LiteLLM proxy (cost-based) a encaminhar para 2 mocks em loopback
//   node run.mjs --arm E        claude.exe -p pelo counting-proxy (referencia: 100 % sai)
//   node run.mjs --arm pii      contagem de PII nos logs locais do router
//   node run.mjs --analyse
//
// O braco C (claude-code-router) NAO tem script: a configuracao headless nao se conseguiu
// em 60 min (R8) -> n/d, ver ccr.md. O comando_reproduzir do protocol.json (congelado) lista
// --arm C; este run.mjs nao o implementa e responde com a linha de uso (AMENDMENT-2).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const LIB = path.join(HERE, '..', 'lib');
const RES = path.join(HERE, 'results');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const now = () => new Date().toISOString();
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const save = (n, o) => { fs.mkdirSync(RES, { recursive: true }); fs.writeFileSync(path.join(RES, n), JSON.stringify(o, null, 1)); console.log('->', path.join('results', n)); };
const load = (n) => { try { return JSON.parse(fs.readFileSync(path.join(RES, n), 'utf8')); } catch { return null; } };
const fwd = (p) => p.split('\\').join('/');
const TAP = fwd(path.join(LIB, 'net-tap.cjs'));
const HOOK_LIVE = path.join(os.homedir(), '.claude', 'tools', 'router', 'inject_context.js');
const CLAUDE_EXE = process.env.PROVAS_CLAUDE_EXE || path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'); // PROVAS_CLAUDE_EXE: sem isto o caminho e do Windows desta maquina e nao ha como reapontar (achado R12 do exame de 2026-09-09)

function prompts20() { return JSON.parse(fs.readFileSync(path.join(HERE, '..', 'P1-decidir-custa-zero', 'corpus-40.json'), 'utf8')).items.slice(0, 20); }
function readTap(file) { try { return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }
function summarizeTap(recs) { const PR = { close: 3, exit: 2, blocked: 2, open: 1 }; const byId = {}; for (const r of recs.filter((x) => !x.event)) { const k = r.conn_id || `${r.pid}-${r.at}`; if (!byId[k] || (PR[r.phase] || 0) >= (PR[byId[k].phase] || 0)) byId[k] = r; } const conns = Object.values(byId); const by = {}; for (const c of conns) { const k = `${c.host}:${c.port}${c.ipc ? '(ipc)' : ''}`; by[k] = by[k] || { n: 0, bytes_out: 0, bytes_in: 0, blocked: 0 }; by[k].n++; by[k].bytes_out += c.bytes_out; by[k].bytes_in += c.bytes_in; if (c.blocked) by[k].blocked++; } return { processes_tapped: recs.filter((r) => r.event === 'tap-loaded').length, connections: conns.length, by_host: by, external: Object.keys(by).filter((k) => !/^(127\.|localhost|::1|ipc)/.test(k)) }; }
function checkFrozen() { const want = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')); if (want.estado !== 'CONGELADO') throw new Error('protocolo nao congelado'); }

// ── A / A-block: o hook REAL, HOME real, log redirigido ─────────────────────
async function armA(block) {
  checkFrozen();
  const { startCountingProxy } = await import('file:///' + fwd(path.join(LIB, 'counting-proxy.mjs')));
  const proxy = await startCountingProxy({ block: !!block });
  const tapOut = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'provas-p5-')), 'tap.jsonl');
  const logOut = tapOut.replace('tap.jsonl', 'decisions.log');
  const env = { ...process.env, NODE_OPTIONS: `--require "${TAP}"`, NET_TAP_OUT: tapOut, NET_TAP_BLOCK: block ? '1' : '0', MOOTER_DECISIONS_LOG: logOut, HTTP_PROXY: proxy.url, HTTPS_PROXY: proxy.url, http_proxy: proxy.url, https_proxy: proxy.url, NO_PROXY: '', no_proxy: '' };
  const rows = [];
  for (const p of prompts20()) {
    const t0 = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [HOOK_LIVE], { env, encoding: 'utf8', input: JSON.stringify({ prompt: p.prompt, session_id: 'provas-p5' }), windowsHide: true, timeout: 60000 });
    const out = (r.stdout || '') + '\n' + (r.stderr || '');
    rows.push({ id: p.id, exit: r.status, ms: ms(t0), tier: (out.match(/^tier:\s*(T[0-3])/m) || [])[1] || null, max_tier: (out.match(/max_tier:\s*(T[0-3])/) || [])[1] || null, escalation: (out.match(/escalation:\s*([^\n]+)/) || [])[1] || null, arbiter: /ARBITER: honored/.test(out) });
  }
  await new Promise((r) => setTimeout(r, 1500)); // deixa os filhos assincronos fechar sockets
  const tap = summarizeTap(readTap(tapOut));
  const px = proxy.report(); await proxy.close();
  let events = {}; try { for (const ln of fs.readFileSync(logOut, 'utf8').split('\n')) { if (!ln.startsWith('{')) continue; const j = JSON.parse(ln); events[j.event] = (events[j.event] || 0) + 1; } } catch { /* */ }
  save(block ? 'A-block.json' : 'A.json', { arm: block ? 'A-block' : 'A', at: now(), hook: HOOK_LIVE, keys_present: { ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY, MOOTER_ARBITER_DISABLE: process.env.MOOTER_ARBITER_DISABLE || null }, tap_file: tapOut, tap, proxy: { by_host: px.by_host, total: px.total_connections }, hook_log_events: events, rows });
}

// ── B: o arbitro, instrumentado em processo ─────────────────────────────────
// O arbiter.js NAO usa https.request: lanca um processo filho `node -e <fetch> <body> <apiKey>`
// (arbiter.js:212). Por isso captura-se o spawnSync ANTES de o modulo o destruturar,
// e le-se o corpo que SAIRIA em argv. Em paralelo, uma segunda corrida deixa o
// filho verdadeiro nascer sob net-tap com NET_TAP_BLOCK=1: o tap regista o destino
// (api.anthropic.com:443) e recusa a ligacao — nada sai.
async function armB() {
  checkFrozen();
  const cp = require('child_process');
  const captured = [];
  const realSpawnSync = cp.spawnSync;
  cp.spawnSync = function fakeSpawnSync(cmd, argv, o) {
    if (Array.isArray(argv) && argv[0] === '-e' && /api\.anthropic\.com|anthropic/.test(String(argv[1]))) {
      const body = String(argv[2] || ''); const key = String(argv[3] || '');
      captured.push({ body, key_len: key.length, script_mentions_host: (String(argv[1]).match(/api\.anthropic\.com/) || []).length });
      return { status: 0, stdout: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ tier: 'T2', subagent: 'model-reasoner', reasoning: 'mock' }) }], usage: { input_tokens: 1, output_tokens: 1 } }), stderr: '' };
    }
    return realSpawnSync.apply(this, arguments);
  };
  process.env.ANTHROPIC_API_KEY = 'provas-presenca-falsa'; delete process.env.MOOTER_ARBITER_DISABLE;
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'provas-p5-arb-')); fs.mkdirSync(path.join(tmpHome, '.claude', 'tools', 'router'), { recursive: true });
  process.env.USERPROFILE = tmpHome; process.env.HOME = tmpHome;
  const arb = require(path.join(ROOT, 'tools', 'router', 'arbiter.js'));
  const rows = [];
  for (const p of prompts20()) {
    const before = captured.length; let out = null, err = null;
    try { out = await arb.arbitrate(p.prompt, { _skipCache: true }); } catch (e) { err = e.message; }
    const calls = captured.slice(before);
    rows.push({ id: p.id, prompt_chars: p.prompt.length, arbiter_called: calls.length, body_bytes: calls.reduce((a, c) => a + Buffer.byteLength(c.body), 0), raw_prompt_in_body: calls.some((c) => c.body.includes(p.prompt) || c.body.includes(JSON.stringify(p.prompt).slice(1, -1))), /* o corpo e JSON: o prompt vai escapado */ body_model: calls.map((c) => { try { return JSON.parse(c.body).model; } catch { return null; } }), would_send_to: calls.map((c) => (c.script_mentions_host > 0 ? 'api.anthropic.com' : 'n/d')), prompt_field_equals_prompt: calls.some((c) => { try { const m = JSON.parse(c.body).messages; const last = m[m.length - 1]; const t = typeof last.content === 'string' ? last.content : (Array.isArray(last.content) ? last.content.map((x) => x.text || '').join('') : ''); return t === p.prompt; } catch { return false; } }), /* P5-05: igualdade do campo, nao substring */ result: out && out.tier, error: err });
  }
  cp.spawnSync = realSpawnSync;
  // segunda corrida: o filho real, sob tap bloqueante (destino observado, nada sai)
  const tapOut = path.join(tmpHome, 'tap.jsonl');
  const r = realSpawnSync(process.execPath, ['-e', `process.env.ANTHROPIC_API_KEY='provas-presenca-falsa';const a=require(${JSON.stringify(path.join(ROOT, 'tools', 'router', 'arbiter.js'))});const out=a.arbitrate(${JSON.stringify(prompts20()[0].prompt)},{_skipCache:true});console.log(JSON.stringify(out));`], { encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, NODE_OPTIONS: `--require "${TAP}"`, NET_TAP_OUT: tapOut, NET_TAP_BLOCK: '1', USERPROFILE: tmpHome, HOME: tmpHome } });
  const tap = summarizeTap(readTap(tapOut));
  save('B-arbiter-instrumented.json', { arm: 'B', at: now(), instrumented: true, note: 'spawnSync captado antes do require: o corpo em argv[2] e o que SAIRIA; a corrida sob net-tap BLOCK mostra o destino real do filho e recusa-o', arbiter_source: 'tools/router/arbiter.js:212', rows, tap_blocked_run: { tap, stdout: (r.stdout || '').slice(0, 200), stderr: (r.stderr || '').slice(0, 200) } });
}

// ── D: LiteLLM proxy com routing por custo, 2 mocks ─────────────────────────
async function armD() {
  checkFrozen();
  const { startMockLlm } = await import('file:///' + fwd(path.join(LIB, 'mock-llm.mjs')));
  const inv = has('--invert'); // AMENDMENT-2 (P5-06): inverte os precos mantendo identidades/portas — se a escolha nao mudar, nao e o preco que manda
  const tiny = has('--tiny'); // controlo: barato a 1e-9 em vez de 0 — se 0 for lido como «sem preco», o 0 nunca e escolhido
  const P_LOW = tiny ? { i: '0.000000001', o: '0.000000003' } : { i: '0.0', o: '0.0' }, P_HIGH = { i: '0.00001', o: '0.00003' }; const pc = inv ? P_HIGH : P_LOW, pd = inv ? P_LOW : P_HIGH;
  const cheap = await startMockLlm({ name: 'ollama-local-mock' });
  const dear = await startMockLlm({ name: 'cloud-mock' });
  // v2 (2026-09-09): a v1 punha os precos so em litellm_params e o cost-based-routing mandou 20/20 para o caro
  // (guardado em D-litellm-v1-costs-in-litellm_params.json). A documentacao do LiteLLM tambem aceita
  // input_cost_per_token/output_cost_per_token em model_info — poe-se nos dois sitios.
  const cfg = `model_list:\n  - model_name: router\n    litellm_params:\n      model: ollama/qwen2.5:3b\n      api_base: ${cheap.url}\n      input_cost_per_token: ${pc.i}\n      output_cost_per_token: ${pc.o}\n    model_info:\n      input_cost_per_token: ${pc.i}\n      output_cost_per_token: ${pc.o}\n  - model_name: router\n    litellm_params:\n      model: openai/mock-cloud\n      api_base: ${dear.url}/v1\n      api_key: provas-fake\n      input_cost_per_token: ${pd.i}\n      output_cost_per_token: ${pd.o}\n    model_info:\n      input_cost_per_token: ${pd.i}\n      output_cost_per_token: ${pd.o}\nrouter_settings:\n  routing_strategy: cost-based-routing\nlitellm_settings:\n  drop_params: true\n  telemetry: false\n`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provas-p5-litellm-')); const cfgPath = path.join(dir, 'config.yaml'); fs.writeFileSync(cfgPath, cfg);
  const site = process.env.P5_LITELLM_SITE || 'C:/Users/Paulo Loureiro/AppData/Local/Temp/provas-litellm'; // pip --target do LiteLLM (SETUP.md); P5_LITELLM_SITE sobrepoe o caminho desta maquina
  const port = 4000 + Math.floor(Math.random() * 500);
  const proc = spawn(path.join(site, 'bin', 'litellm.exe'), ['--config', cfgPath, '--port', String(port), '--host', '127.0.0.1'], { env: { ...process.env, PYTHONPATH: site, LITELLM_TELEMETRY: 'False', DO_NOT_TRACK: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }, windowsHide: true });
  let log = ''; proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
  const t0 = Date.now(); let up = false;
  while (Date.now() - t0 < 90000) { try { const r = await fetch(`http://127.0.0.1:${port}/health/liveliness`, { signal: AbortSignal.timeout(2000) }); if (r.ok) { up = true; break; } } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }
  const rows = []; let netSample = [];
  if (up) {
    for (const p of prompts20()) {
      const t1 = process.hrtime.bigint(); let status = null, err = null;
      try { const r = await fetch(`http://127.0.0.1:${port}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer anything' }, body: JSON.stringify({ model: 'router', messages: [{ role: 'user', content: p.prompt }], max_tokens: 8 }), signal: AbortSignal.timeout(30000) }); status = r.status; await r.text(); } catch (e) { err = e.message; }
      rows.push({ id: p.id, status, ms: ms(t1), error: err });
    }
    try { netSample = spawnSync('powershell', ['-NoProfile', '-Command', `Get-NetTCPConnection -OwningProcess ${proc.pid} -ErrorAction SilentlyContinue | Select-Object RemoteAddress,RemotePort,State | ConvertTo-Json -Compress`], { encoding: 'utf8', windowsHide: true }).stdout; } catch { /* */ }
  }
  await new Promise((r) => setTimeout(r, 800));
  const cheapR = cheap.report(), dearR = dear.report();
  proc.kill(); await cheap.close(); await dear.close();
  save(inv ? 'D-litellm-invert.json' : (tiny ? 'D-litellm-tiny.json' : 'D-litellm.json'), { arm: 'D', variant: inv ? 'precos INVERTIDOS (cheap=alto, dear=0), mesmas portas/identidades' : (tiny ? 'barato a 1e-9/3e-9 (nao zero), caro a 1e-5/3e-5' : 'precos normais (barato = 0)'), at: now(), litellm_up: up, port, config: cfg, requests_to_cheap: cheapR.length, requests_to_dear: dearR.length, cheap_body_bytes: cheapR.map((r) => r.body_bytes), dear_body_bytes: dearR.map((r) => r.body_bytes), raw_prompt_forwarded: [...cheapR, ...dearR].filter((r) => r.last_user_text && prompts20().some((p) => r.last_user_text.includes(p.prompt))).length, tcp_sample_of_proxy_process: netSample, rows, log_tail: log.slice(-3000) });
}

// ── E: Claude Code nativo pelo counting-proxy ───────────────────────────────
async function armE() {
  // AMENDMENT-2 (P5-10): a v3 vai PELO counting-proxy (spawn assincrono, um proxy por prompt), em arm-e.mjs.
  // A AMENDMENT-1 dizia que o claude.exe nao honra HTTPS_PROXY — era o meu spawnSync a bloquear o proxy (D8, retirado).
  const { armE: run } = await import('file:///' + fwd(path.join(HERE, 'arm-e.mjs')));
  await run({ checkFrozen, prompts20, CLAUDE_EXE, save, now, ms });
}

// ── PII nos logs locais ─────────────────────────────────────────────────────
function armPii() {
  const files = [path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions.log'), path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions_v2.jsonl'), path.join(os.homedir(), '.claude', 'tools', 'router', 'latencia-local.jsonl'), path.join(os.homedir(), '.mooter', 'ledger.jsonl')];
  const pats = { owner_name: /Paulo Loureiro/g, email: /[\w.+-]+@[\w-]+\.[\w.]+/g, home_path: /[A-Za-z]:[\\/]+Users[\\/]+Paulo Loureiro/g };
  const out = [];
  for (const f of files) { let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch { out.push({ file: f, exists: false }); continue; } const counts = {}; for (const [k, re] of Object.entries(pats)) counts[k] = (t.match(re) || []).length; const lines = t.split('\n').length; const promptPreviewLines = (t.match(/"prompt_preview":"/g) || []).length; out.push({ file: f, exists: true, lines, bytes: t.length, counts, prompt_preview_lines: promptPreviewLines }); }
  save('pii-logs.json', { arm: 'pii', at: now(), note: 'contagens por regex; caminhos do home contam como PII porque contem o nome do dono; prompt_preview e texto cru de prompt (80 chars) no log local', files: out });
}

// ── analise ──────────────────────────────────────────────────────────────────
function analyse() {
  const A = load('A.json'), AB = load('A-block.json'), B = load('B-arbiter-instrumented.json'), C = load('C-ccr.json'), D = load('D-litellm.json'), E = load('E-native.json'), P = load('pii-logs.json');
  const out = { at: now() };
  if (A) out.A = { prompts: A.rows.length, tap: { processes: A.tap.processes_tapped, connections: A.tap.connections, external_hosts: A.tap.external, by_host: A.tap.by_host, bytes: 'n/d — so ha registos de fase open (o filho ollama_call_node.js e morto pelo tecto de 1 s do hook antes do close; o exit do hook nao chegou a registar); o destino e conhecido no open, os bytes nao (P5-02)' }, proxy_counter_note: 'o hook e Node e o Node nao honra HTTPS_PROXY por omissao: 0 CONNECT e esperado e nao prova nada (P5-01)', proxy_by_host: A.proxy.by_host, hook_events: A.hook_log_events, tiers: A.rows.map((r) => r.tier).join(' '), arbiter_honored: A.rows.filter((r) => r.arbiter).length };
  if (AB && A) out.A_block = { external_blocked: Object.values(AB.tap.by_host).reduce((a, h) => a + h.blocked, 0), tiers_identical_to_A: A.rows.every((r, i) => r.tier === AB.rows[i].tier), tiers: AB.rows.map((r) => r.tier).join(' ') };
  if (B) out.B_arbiter = { prompts: B.rows.length, calls: B.rows.reduce((a, r) => a + r.arbiter_called, 0), raw_prompt_in_body: B.rows.filter((r) => r.raw_prompt_in_body).length, prompt_field_equals_prompt: B.rows.filter((r) => r.prompt_field_equals_prompt).length, body_bytes_mean: B.rows.reduce((a, r) => a + r.body_bytes, 0) / B.rows.length, destinations: [...new Set(B.rows.flatMap((r) => r.would_send_to))], instrumented_not_network: true };
  if (C) out.C_ccr = C.summary || C;
  const DI = load('D-litellm-invert.json'); if (DI) out.D_litellm_invert = { variant: DI.variant, up: DI.litellm_up, to_cheap_port: DI.requests_to_cheap, to_dear_port: DI.requests_to_dear, statuses: DI.rows.map((r) => r.status).join(' '), reading: DI.requests_to_dear === 20 ? 'mesma porta com precos invertidos: a seleccao NAO e guiada pelo preco nesta configuracao (defeito de configuracao nosso ou do LiteLLM — n/d)' : (DI.requests_to_cheap === 20 ? 'com os precos invertidos foi 20/20 para a OUTRA porta — a que passou a ter o preco ALTO. Nas duas configuracoes o LiteLLM escolheu o deployment de preco mais alto: a seleccao segue o preco, ao contrario do esperado, ou trata 0 como sem preco (ver D_litellm_tiny)' : 'misto') };
  const DT = load('D-litellm-tiny.json'); if (DT) out.D_litellm_tiny = { variant: DT.variant, up: DT.litellm_up, to_cheap_port: DT.requests_to_cheap, to_dear_port: DT.requests_to_dear, statuses: DT.rows.map((r) => r.status).join(' '), reading: DT.requests_to_cheap === 20 ? 'com o barato a 1e-9 (nao zero) foi 20/20 ao barato. Nas duas configuracoes com um deployment a preco 0, esse deployment foi escolhido 0/40 vezes. HIPOTESE (nao confirmada no codigo do LiteLLM): 0 e tratado como preco ausente. Nao se extrapola para Ollama real sem o medir' : (DT.requests_to_dear === 20 ? 'mesmo com 1e-9 foi ao caro: a seleccao prefere o preco mais alto nesta versao/configuracao — n/d a causa' : 'misto') };
  if (D) out.D_litellm = { up: D.litellm_up, to_cheap: D.requests_to_cheap, to_dear: D.requests_to_dear, raw_prompt_forwarded: D.raw_prompt_forwarded, body_bytes_cheap_mean: D.cheap_body_bytes.length ? D.cheap_body_bytes.reduce((a, b) => a + b, 0) / D.cheap_body_bytes.length : null, statuses: D.rows.map((r) => r.status).join(' ') };
  if (E) { const R = E.rows; const med = (a) => { const b = [...a].sort((x, y) => x - y); const n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; }; /* mediana convencional (P5-20): media dos dois centrais com n par */ const st = (a) => ({ median: med(a), min: Math.min(...a), max: Math.max(...a) }); const hb = (h, k) => R.map((r) => ((r.by_host || {})[h] || {})[k] || 0); out.E_native = E.version === 3 ? { version: 3, prompts: R.length, method: E.method, note: E.note, probe: E.probe, exits: R.map((r) => r.exit).join(' '), is_error_count: R.filter((r) => r.is_error).length, hosts_per_prompt: st(R.map((r) => r.external_hosts.length)), external_hosts: [...new Set(R.flatMap((r) => r.external_hosts))], connect_per_prompt: st(R.map((r) => r.connections)), bytes_out_per_prompt: st(R.map((r) => r.bytes_out_total)), bytes_in_per_prompt: st(R.map((r) => r.bytes_in_total)), bytes_out_api_anthropic: st(hb('api.anthropic.com:443', 'bytes_out')), connect_api_anthropic: st(hb('api.anthropic.com:443', 'n')), bytes_out_datadog: st(hb('http-intake.logs.us5.datadoghq.com:443', 'bytes_out')), prompts_with_datadog: hb('http-intake.logs.us5.datadoghq.com:443', 'bytes_out').filter((x) => x > 0).length, connect_mcp_proxy: st(hb('mcp-proxy.anthropic.com:443', 'n')), bytes_out_registry_npmjs: st(hb('registry.npmjs.org:443', 'bytes_out')), prompt_chars: st(R.map((r) => r.prompt_chars)), ms: st(R.map((r) => Math.round(r.ms))), by_outcome: { exit0: { n: R.filter((r) => !r.is_error).length, bytes_out: st(R.filter((r) => !r.is_error).map((r) => r.bytes_out_total)), connect: st(R.filter((r) => !r.is_error).map((r) => r.connections)), api_connect: st(R.filter((r) => !r.is_error).map((r) => r.connections_api_anthropic)) }, is_error: { n: R.filter((r) => r.is_error).length, bytes_out: st(R.filter((r) => r.is_error).map((r) => r.bytes_out_total)), connect: st(R.filter((r) => r.is_error).map((r) => r.connections)), api_connect: st(R.filter((r) => r.is_error).map((r) => r.connections_api_anthropic)) } }, median_convention: 'mediana convencional: com n par, media dos dois valores centrais', usage_input_tokens: st(R.map((r) => (r.usage || {}).in || 0)), per_prompt: R.map((r) => `${r.id}:exit${r.exit}:conn${r.connections}:out${r.bytes_out_total}:api${r.bytes_out_api_anthropic}`) } : { prompts: R.length, method: E.method, legacy: true }; }
  if (!C) out.C_ccr = { status: 'n/d', blocker: 'configuracao headless nao conseguida em 60 min: o gateway so responde com provider + API key criados pela UI/SQLite ou pelo RPC /api/ccr/rpc, que exige token web e cujo catalogo de metodos nao esta documentado — ver ccr.md', version: '3.0.22' };
  if (P) out.pii = P.files;
  save('analysis.json', out); console.log(JSON.stringify(out, null, 1));
}

const arm = opt('--arm');
if (has('--analyse')) analyse();
else if (arm === 'A') await armA(false);
else if (arm === 'A-block') await armA(true);
else if (arm === 'B') await armB();
else if (arm === 'D') await armD();
else if (arm === 'E') await armE();
else if (arm === 'pii') armPii();
else { console.error('uso: --arm A|A-block|B|D|E|pii | --analyse'); process.exit(2); }
