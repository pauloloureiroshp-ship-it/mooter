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
// O braco C (claude-code-router) tem o seu proprio ficheiro, ccr.mjs, porque
// a configuracao headless e o problema — nao a medicao.

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
const CLAUDE_EXE = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');

function prompts20() { return JSON.parse(fs.readFileSync(path.join(HERE, '..', 'P1-decidir-custa-zero', 'corpus-40.json'), 'utf8')).items.slice(0, 20); }
function readTap(file) { try { return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }
function summarizeTap(recs) { const conns = recs.filter((r) => !r.event); const by = {}; for (const c of conns) { const k = `${c.host}:${c.port}${c.ipc ? '(ipc)' : ''}`; by[k] = by[k] || { n: 0, bytes_out: 0, bytes_in: 0, blocked: 0 }; by[k].n++; by[k].bytes_out += c.bytes_out; by[k].bytes_in += c.bytes_in; if (c.blocked) by[k].blocked++; } return { processes_tapped: recs.filter((r) => r.event === 'tap-loaded').length, connections: conns.length, by_host: by, external: Object.keys(by).filter((k) => !/^(127\.|localhost|::1|ipc)/.test(k)) }; }
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
async function armB() {
  checkFrozen();
  const https = require('https');
  const captured = [];
  process.env.ANTHROPIC_API_KEY = 'provas-presenca-falsa'; delete process.env.MOOTER_ARBITER_DISABLE;
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'provas-p5-arb-')); fs.mkdirSync(path.join(tmpHome, '.claude', 'tools', 'router'), { recursive: true });
  process.env.USERPROFILE = tmpHome; process.env.HOME = tmpHome; // cache do arbitro isolada
  https.request = function fakeRequest(opts, cb) {
    const rec = { host: opts.hostname || opts.host, path: opts.path, method: opts.method, headers: Object.keys(opts.headers || {}), body: '' };
    captured.push(rec);
    const { EventEmitter } = require('events');
    const req = new EventEmitter();
    req.write = (c) => { rec.body += String(c); }; req.setTimeout = () => req; req.destroy = () => {};
    req.end = (c) => { if (c) rec.body += String(c); setImmediate(() => { const res = new EventEmitter(); res.statusCode = 200; res.headers = {}; cb(res); res.emit('data', Buffer.from(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ tier: 'T2', subagent: 'model-reasoner', reasoning: 'mock' }) }], usage: { input_tokens: 1, output_tokens: 1 } }))); res.emit('end'); }); return req; };
    return req;
  };
  const arb = require(path.join(ROOT, 'tools', 'router', 'arbiter.js'));
  const rows = [];
  for (const p of prompts20()) {
    const before = captured.length;
    let out = null, err = null;
    try { out = await arb.arbitrate(p.prompt); } catch (e) { err = e.message; }
    const calls = captured.slice(before);
    rows.push({ id: p.id, prompt_chars: p.prompt.length, arbiter_called: calls.length, would_send_to: calls.map((c) => c.host + c.path), body_bytes: calls.reduce((a, c) => a + Buffer.byteLength(c.body), 0), raw_prompt_in_body: calls.some((c) => c.body.includes(p.prompt)), result: out && out.tier, error: err });
  }
  save('B-arbiter-instrumented.json', { arm: 'B', at: now(), instrumented: true, network_observed: false, note: 'https.request substituido; nada saiu da maquina; o corpo captado e o que SAIRIA para api.anthropic.com', arbiter_source: 'tools/router/arbiter.js', rows });
}

// ── D: LiteLLM proxy com routing por custo, 2 mocks ─────────────────────────
async function armD() {
  checkFrozen();
  const { startMockLlm } = await import('file:///' + fwd(path.join(LIB, 'mock-llm.mjs')));
  const cheap = await startMockLlm({ name: 'ollama-local-mock' });
  const dear = await startMockLlm({ name: 'cloud-mock' });
  const cfg = `model_list:\n  - model_name: router\n    litellm_params:\n      model: ollama/qwen2.5:3b\n      api_base: ${cheap.url}\n      input_cost_per_token: 0.0\n      output_cost_per_token: 0.0\n  - model_name: router\n    litellm_params:\n      model: openai/mock-cloud\n      api_base: ${dear.url}/v1\n      api_key: provas-fake\n      input_cost_per_token: 0.00001\n      output_cost_per_token: 0.00003\nrouter_settings:\n  routing_strategy: cost-based-routing\nlitellm_settings:\n  drop_params: true\n  telemetry: false\n`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'provas-p5-litellm-')); const cfgPath = path.join(dir, 'config.yaml'); fs.writeFileSync(cfgPath, cfg);
  const site = 'C:/Users/Paulo Loureiro/AppData/Local/Temp/provas-litellm';
  const port = 4000 + Math.floor(Math.random() * 500);
  const proc = spawn('python', ['-m', 'litellm', '--config', cfgPath, '--port', String(port), '--host', '127.0.0.1'], { env: { ...process.env, PYTHONPATH: site, LITELLM_TELEMETRY: 'False', DO_NOT_TRACK: '1' }, windowsHide: true });
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
  save('D-litellm.json', { arm: 'D', at: now(), litellm_up: up, port, config: cfg, requests_to_cheap: cheapR.length, requests_to_dear: dearR.length, cheap_body_bytes: cheapR.map((r) => r.body_bytes), dear_body_bytes: dearR.map((r) => r.body_bytes), raw_prompt_forwarded: [...cheapR, ...dearR].filter((r) => r.last_user_text && prompts20().some((p) => r.last_user_text.includes(p.prompt))).length, tcp_sample_of_proxy_process: netSample, rows, log_tail: log.slice(-3000) });
}

// ── E: Claude Code nativo pelo counting-proxy ───────────────────────────────
async function armE() {
  checkFrozen();
  const { startCountingProxy } = await import('file:///' + fwd(path.join(LIB, 'counting-proxy.mjs')));
  const proxy = await startCountingProxy({ block: false });
  const rows = [];
  for (const p of prompts20()) {
    const before = proxy.report().total_connections;
    const t0 = process.hrtime.bigint();
    const r = spawnSync(CLAUDE_EXE, ['-p', '--model', 'haiku', '--output-format', 'json', '--max-turns', '1', '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,Agent,WebFetch,WebSearch,Task'], { input: p.prompt, encoding: 'utf8', windowsHide: true, timeout: 180000, env: { ...process.env, CLAUDECODE: '', HTTPS_PROXY: proxy.url, HTTP_PROXY: proxy.url } });
    const rep = proxy.report(); const mine = rep.connections.slice(before);
    let j = null; try { j = JSON.parse(r.stdout); } catch { /* */ }
    rows.push({ id: p.id, prompt_chars: p.prompt.length, exit: r.status, ms: ms(t0), connections: mine.map((c) => ({ host: c.host, port: c.port, bytes_out: c.bytes_out, bytes_in: c.bytes_in })), bytes_out_total: mine.reduce((a, c) => a + c.bytes_out, 0), usage: j && j.usage ? { in: j.usage.input_tokens, out: j.usage.output_tokens, cache_read: j.usage.cache_read_input_tokens, cache_create: j.usage.cache_creation_input_tokens } : null, stderr: (r.stderr || '').slice(0, 160) });
    console.log(p.id, 'exit', r.status, 'conns', mine.length, 'bytes_out', rows[rows.length - 1].bytes_out_total);
  }
  const rep = proxy.report(); await proxy.close();
  save('E-native.json', { arm: 'E', at: now(), by_host: rep.by_host, rows });
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
  if (A) out.A = { prompts: A.rows.length, tap: { processes: A.tap.processes_tapped, connections: A.tap.connections, external_hosts: A.tap.external, by_host: A.tap.by_host }, proxy_by_host: A.proxy.by_host, hook_events: A.hook_log_events, tiers: A.rows.map((r) => r.tier).join(' '), arbiter_honored: A.rows.filter((r) => r.arbiter).length };
  if (AB && A) out.A_block = { external_blocked: Object.values(AB.tap.by_host).reduce((a, h) => a + h.blocked, 0), tiers_identical_to_A: A.rows.every((r, i) => r.tier === AB.rows[i].tier), tiers: AB.rows.map((r) => r.tier).join(' ') };
  if (B) out.B_arbiter = { prompts: B.rows.length, calls: B.rows.reduce((a, r) => a + r.arbiter_called, 0), raw_prompt_in_body: B.rows.filter((r) => r.raw_prompt_in_body).length, body_bytes_mean: B.rows.reduce((a, r) => a + r.body_bytes, 0) / B.rows.length, destinations: [...new Set(B.rows.flatMap((r) => r.would_send_to))], instrumented_not_network: true };
  if (C) out.C_ccr = C.summary || C;
  if (D) out.D_litellm = { up: D.litellm_up, to_cheap: D.requests_to_cheap, to_dear: D.requests_to_dear, raw_prompt_forwarded: D.raw_prompt_forwarded, body_bytes_cheap_mean: D.cheap_body_bytes.length ? D.cheap_body_bytes.reduce((a, b) => a + b, 0) / D.cheap_body_bytes.length : null, statuses: D.rows.map((r) => r.status).join(' ') };
  if (E) out.E_native = { prompts: E.rows.length, by_host: E.by_host, bytes_out_per_prompt: E.rows.map((r) => r.bytes_out_total), prompt_chars: E.rows.map((r) => r.prompt_chars), exits: E.rows.map((r) => r.exit).join(' ') };
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
