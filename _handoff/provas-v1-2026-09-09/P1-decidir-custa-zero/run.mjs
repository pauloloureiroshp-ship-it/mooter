#!/usr/bin/env node
// run.mjs — P1: quanto custa DECIDIR. Ver protocol.json (congelado) antes de ler isto.
//
//   node run.mjs --arm A --env key|nokey [--runs 6]     regra em processo
//   node run.mjs --arm A-spawn --env key|nokey [--runs 6]  node classify.js <prompt> por prompt
//   node run.mjs --arm A-hook [--runs 3]                   inject_context.js por stdin, HOME isolado
//   node run.mjs --arm B [--runs 3]                        juiz LLM local (qwen2.5-coder:14b)
//   node run.mjs --arm B-rater2                            2o rotulador local (qwen3.6:27b), so kappa
//   node run.mjs --all                                     tudo, por ordem, Ollama sempre sequencial
//   node run.mjs --analyse                                 estatistica -> results.json
//
// Tudo o que este ficheiro mede vai para results/<arm>[-env].json em bruto.
// Nada e agregado sem o bruto ao lado.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const RES = path.join(HERE, 'results');
const CLASSIFY = path.join(ROOT, 'tools', 'router', 'classify.js');
const HOOK = path.join(ROOT, 'tools', 'router', 'inject_context.js');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const now = () => new Date().toISOString();
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;

function corpus() { return JSON.parse(fs.readFileSync(path.join(HERE, 'corpus-63.json'), 'utf8')).items; }
function labels() { const m = {}; for (const l of JSON.parse(fs.readFileSync(path.join(HERE, 'labels-63.json'), 'utf8')).labels) m[l.id] = l.tier; return m; }
function train35() {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'router', 'validation-set.json'), 'utf8'));
  const out = [];
  for (const sec of ['canonical', 'adversarial']) for (const [i, a] of (v[sec] || []).entries()) {
    if (/^mooter_review/.test(a.confidence_source || '')) continue;
    out.push({ id: `${sec}-${String(i + 1).padStart(2, '0')}`, prompt: a.prompt, expected_tier: a.expected_tier });
  }
  return out;
}
function checkFrozen() {
  const want = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).hashes;
  for (const [rel, h] of Object.entries(want)) {
    const f = rel.startsWith('tools/') ? path.join(ROOT, rel) : path.join(HERE, rel);
    const got = sha(f);
    if (got !== h) throw new Error(`CONGELAMENTO VIOLADO: ${rel} sha ${got} != ${h}`);
  }
}
function save(name, obj) { fs.mkdirSync(RES, { recursive: true }); fs.writeFileSync(path.join(RES, name), JSON.stringify(obj, null, 1)); console.log('->', path.join('results', name)); }

// ── contadores de rede: 0 tem de ser MEDIDO ─────────────────────────────────
function netCounters() {
  const calls = [];
  const wrap = (mod, name) => { const orig = mod[name]; mod[name] = function (...a) { const u = a[0]; calls.push({ via: `${mod === https ? 'https' : 'http'}.${name}`, target: typeof u === 'string' ? u : (u && (u.hostname || u.host)) || '?' }); return orig.apply(this, a); }; };
  wrap(http, 'request'); wrap(http, 'get'); wrap(https, 'request'); wrap(https, 'get');
  const of = globalThis.fetch; globalThis.fetch = (u, ...r) => { calls.push({ via: 'fetch', target: String(u) }); return of(u, ...r); };
  return calls;
}
async function ollamaStub() {
  let hits = 0; const srv = http.createServer((req, res) => { hits++; res.statusCode = 503; res.end('stub'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { port: srv.address().port, hits: () => hits, close: () => srv.close() };
}

// ── braco A: regra em processo ──────────────────────────────────────────────
async function armA(env, runs) {
  checkFrozen();
  const stub = await ollamaStub();
  process.env.OLLAMA_HOST = `127.0.0.1:${stub.port}`;
  process.env.MOOTER_ARBITER_DISABLE = '1';
  if (env === 'key') process.env.ANTHROPIC_API_KEY = 'provas-presenca-falsa'; else delete process.env.ANTHROPIC_API_KEY;
  for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY']) delete process.env[k];
  const net = netCounters();
  const { classify } = require(CLASSIFY);
  const items = [...corpus(), ...train35().map((t) => ({ id: 'train:' + t.id, prompt: t.prompt, source: 'validation-set' }))];
  for (let i = 0; i < 5; i++) classify('aquecimento do processo');
  const rows = [];
  for (let run = 1; run <= runs; run++) for (const it of items) {
    const t0 = process.hrtime.bigint(); const d = classify(it.prompt); const dt = ms(t0);
    rows.push({ id: it.id, run, tier: d.tier, task_category: d.task_category, risk_level: d.risk_level, confidence: d.confidence, escalation_rule: d.escalation_rule, backend: d.recommended_backend, model: d.recommended_model, subagent: d.suggested_subagent, ms: dt });
  }
  stub.close();
  const determinism = checkDeterminism(rows, ['tier', 'task_category', 'confidence', 'escalation_rule']);
  save(`A-${env}.json`, { arm: 'A', env, runs, at: now(), node: process.version, ollama_stub_hits: stub.hits(), net_calls: net, determinism, n_items: items.length, rows });
}
function checkDeterminism(rows, fields) {
  const byId = {}; for (const r of rows) (byId[r.id] ||= []).push(r);
  let differing = [];
  for (const [id, rs] of Object.entries(byId)) { const k = rs.map((r) => fields.map((f) => r[f]).join('|')); if (new Set(k).size > 1) differing.push(id); }
  return { identical_across_runs: differing.length === 0, differing };
}

// ── braco A-spawn: um processo por prompt (o hook num cache miss) ───────────
function armASpawn(env, runs) {
  checkFrozen();
  const base = { ...process.env, MOOTER_ARBITER_DISABLE: '1' };
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY']) delete base[k];
  if (env === 'key') base.ANTHROPIC_API_KEY = 'provas-presenca-falsa';
  const items = corpus(); const rows = [];
  for (let run = 1; run <= runs; run++) for (const it of items) {
    const t0 = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [CLASSIFY, it.prompt], { env: base, encoding: 'utf8', windowsHide: true });
    const dt = ms(t0);
    let tier = null, cat = null; try { const j = JSON.parse(r.stdout); tier = j.tier; cat = j.task_category; } catch { /* sem json */ }
    rows.push({ id: it.id, run, tier, task_category: cat, exit: r.status, ms: dt });
  }
  save(`A-spawn-${env}.json`, { arm: 'A-spawn', env, runs, at: now(), node: process.version, determinism: checkDeterminism(rows, ['tier', 'task_category']), rows });
}

// ── braco A-hook: o hook inteiro, HOME isolado ──────────────────────────────
function armAHook(runs) {
  checkFrozen();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'provas-p1-hook-home-'));
  fs.mkdirSync(path.join(home, '.claude', 'tools', 'router'), { recursive: true });
  const env = { ...process.env, USERPROFILE: home, HOME: home, MOOTER_ARBITER_DISABLE: '1', MOOTER_DECISIONS_LOG: path.join(home, 'decisions.log') };
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY']) delete env[k];
  env.ANTHROPIC_API_KEY = 'provas-presenca-falsa';
  const items = corpus(); const rows = [];
  for (let run = 1; run <= runs; run++) for (const it of items) {
    const t0 = process.hrtime.bigint();
    const r = spawnSync(process.execPath, [HOOK], { env, encoding: 'utf8', input: JSON.stringify({ prompt: it.prompt, session_id: 'provas-p1' }), windowsHide: true });
    const dt = ms(t0);
    const out = (r.stdout || '') + '\n' + (r.stderr || '');
    const tier = (out.match(/^tier:\s*(T[0-3])/m) || [])[1] || null;
    const maxTier = (out.match(/max_tier:\s*(T[0-3])/) || [])[1] || null;
    const esc = (out.match(/escalation:\s*([^\n]+)/) || [])[1] || null;
    rows.push({ id: it.id, run, tier, max_tier: maxTier, escalation: esc, exit: r.status, ms: dt, stdout_bytes: (r.stdout || '').length });
  }
  // o proprio log do hook diz se foi cache ou spawn
  let paths = {};
  try { for (const ln of fs.readFileSync(env.MOOTER_DECISIONS_LOG, 'utf8').split('\n')) { try { const j = JSON.parse(ln); if (j.event === 'classified') { paths[j.classify_path] = (paths[j.classify_path] || 0) + 1; } } catch { /* */ } } } catch { /* */ }
  save('A-hook.json', { arm: 'A-hook', runs, at: now(), node: process.version, home_isolado: home, classify_path_counts: paths, rows });
}

// ── braco B: juiz LLM local ─────────────────────────────────────────────────
export const PROMPT_JUIZ = (p) => `Classifica esta tarefa de programação num de quatro níveis e responde SÓ com o rótulo.

T0 = trivial, mecânico, um ficheiro, sem risco (renomear, formatar, mover)
T1 = pequeno, texto ou explicação curta (mensagem de commit, docstring, regex)
T2 = raciocínio (investigar bug, comparar abordagens, plano técnico)
T3 = arquitectura, multi-ficheiro, produção, segredos, CI, migrações

CONVENÇÕES deste repositório, que os rótulos usam (não as adivinhes — estão aqui):
- risco alto força T3: deploy, push, merge, release, migrações, segredos, .env, CI
- pedido explícito de mais cuidado ("pensa bem", "é crítico", "think hard",
  "preciso do teu melhor") sobe um nível
- nomear um modelo (@opus, @haiku, "usa o sonnet") fixa o nível desse modelo
- mexer em mais de 3 ficheiros, ou decidir arquitectura, é T3

Tarefa: ${p}

Responde só: T0, T1, T2 ou T3.`;
const RE_TIER = /\bT[0-3]\b/;
const OLLAMA = () => { const h = process.env.OLLAMA_HOST || '127.0.0.1:11434'; return /^https?:\/\//.test(h) ? h : 'http://' + h; };

async function ollamaChat(model, system, user, { temperature = 0, num_predict = 8, timeoutMs = 120000 } = {}) {
  const body = JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false, keep_alive: -1, options: { temperature, num_predict }, think: false });
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const t0 = process.hrtime.bigint();
  try {
    const r = await fetch(OLLAMA() + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: ctl.signal });
    const j = await r.json(); const wall = ms(t0);
    return { ok: r.ok, wall_ms: wall, text: j.message && j.message.content, prompt_eval_count: j.prompt_eval_count, eval_count: j.eval_count, total_duration_ms: j.total_duration / 1e6, load_duration_ms: j.load_duration / 1e6, prompt_eval_duration_ms: j.prompt_eval_duration / 1e6, eval_duration_ms: j.eval_duration / 1e6, model: j.model, done_reason: j.done_reason };
  } catch (e) { return { ok: false, wall_ms: ms(t0), error: e.message }; } finally { clearTimeout(timer); }
}
function ollamaPs() { try { return spawnSync('ollama', ['ps'], { encoding: 'utf8', windowsHide: true }).stdout; } catch { return 'n/d'; } }

async function armB(runs) {
  checkFrozen();
  const model = 'qwen2.5-coder:14b';
  const items = [...corpus(), ...train35().map((t) => ({ id: 'train:' + t.id, prompt: t.prompt }))];
  const rows = []; const psBefore = ollamaPs();
  for (let run = 1; run <= runs; run++) for (const it of items) {
    const r = await ollamaChat(model, 'Responde só com T0, T1, T2 ou T3.', PROMPT_JUIZ(it.prompt));
    if (!r.ok) { rows.push({ id: it.id, run, tier: null, error: r.error || 'nao ok', wall_ms: r.wall_ms }); console.error('B falhou', it.id, r.error); if (rows.filter((x) => x.error).length >= 3) { save('B.json', { arm: 'B', model, runs, at: now(), aborted: 'regra de paragem: 3 falhas de servico', rows }); return; } continue; }
    const m = RE_TIER.exec(String(r.text || ''));
    rows.push({ id: it.id, run, tier: m ? m[0] : null, raw: String(r.text || '').slice(0, 40), tokens_in: r.prompt_eval_count, tokens_out: r.eval_count, wall_ms: r.wall_ms, total_ms: r.total_duration_ms, load_ms: r.load_duration_ms, prompt_eval_ms: r.prompt_eval_duration_ms, eval_ms: r.eval_duration_ms, done_reason: r.done_reason });
    process.stdout.write(`${run}:${it.id}=${m ? m[0] : '?'}(${r.prompt_eval_count}+${r.eval_count}) `);
  }
  console.log();
  save('B.json', { arm: 'B', model, runs, at: now(), ollama_ps_before: psBefore, ollama_ps_after: ollamaPs(), prompt_juiz_sha256: crypto.createHash('sha256').update(PROMPT_JUIZ('X')).digest('hex'), rows });
}

// ── 2o rotulador local, so para kappa ───────────────────────────────────────
async function armRater2() {
  const model = 'qwen3.6:27b';
  const rubric = fs.readFileSync(path.join(HERE, 'label-rubric.txt'), 'utf8').replace(/Return ONLY JSON[\s\S]*$/, 'Answer with ONLY the tier label: T0, T1, T2 or T3.');
  const rows = [];
  for (const it of corpus()) {
    const r = await ollamaChat(model, rubric, `PROMPT:\n${it.prompt}\n\nTier:`, { num_predict: 8, timeoutMs: 180000 });
    const m = RE_TIER.exec(String(r.text || ''));
    rows.push({ id: it.id, tier: m ? m[0] : null, raw: String(r.text || '').slice(0, 40), tokens_in: r.prompt_eval_count, tokens_out: r.eval_count, wall_ms: r.wall_ms, error: r.error || null });
    process.stdout.write(`${it.id}=${m ? m[0] : '?'} `);
  }
  console.log();
  save('rater2-local.json', { arm: 'rater2', model, at: now(), rows });
}

// ── analise ──────────────────────────────────────────────────────────────────
async function analyse() {
  const { wilson, mcnemarExact, cohenKappa, summary } = await import(path.join(HERE, '..', 'lib', 'stats.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  const L = labels(); const ids63 = corpus().map((c) => c.id); const ids40 = ids63.filter((i) => i.startsWith('n')); const ids23 = ids63.filter((i) => i.startsWith('r'));
  const train = train35(); const trainL = {}; for (const t of train) trainL['train:' + t.id] = t.expected_tier;
  const load = (n) => { try { return JSON.parse(fs.readFileSync(path.join(RES, n), 'utf8')); } catch { return null; } };
  const firstRun = (data) => { const m = {}; for (const r of data.rows) if (r.run === 1 || r.run === undefined) m[r.id] = r; return m; };
  const acc = (m, ids, lab) => { let k = 0, n = 0; const conf = {}; for (const id of ids) { const r = m[id]; if (!r) continue; n++; const e = lab[id], g = r.tier; conf[`${e}->${g}`] = (conf[`${e}->${g}`] || 0) + 1; if (g === e) k++; } return { k, n, ...wilson(k, n), confusion: conf }; };
  const out = { at: now(), arms: {} };
  for (const name of ['A-key', 'A-nokey']) {
    const d = load(`${name}.json`); if (!d) continue; const m = firstRun(d);
    out.arms[name] = { runs: d.runs, determinism: d.determinism, ollama_stub_hits: d.ollama_stub_hits, net_calls: d.net_calls.length, net_targets: [...new Set(d.net_calls.map((c) => c.target))], latency_ms_inproc: summary(d.rows.map((r) => r.ms)), acc63: acc(m, ids63, L), acc40: acc(m, ids40, L), acc23: acc(m, ids23, L), acc_train35: acc(m, Object.keys(trainL), trainL), escalations: count(Object.values(m).filter((r) => ids63.includes(r.id)).map((r) => r.escalation_rule)) };
  }
  for (const name of ['A-spawn-key', 'A-spawn-nokey']) { const d = load(`${name}.json`); if (!d) continue; out.arms[name] = { runs: d.runs, determinism: d.determinism, latency_ms_process: summary(d.rows.map((r) => r.ms)), exits: count(d.rows.map((r) => r.exit)) }; }
  { const d = load('A-hook.json'); if (d) { const r1 = d.rows.filter((r) => r.run === 1), rN = d.rows.filter((r) => r.run > 1); out.arms['A-hook'] = { runs: d.runs, classify_path_counts: d.classify_path_counts, latency_ms_run1_miss: summary(r1.map((r) => r.ms)), latency_ms_runs2plus_hit: summary(rN.map((r) => r.ms)), max_tier_counts: count(d.rows.map((r) => r.max_tier)), escalations: count(r1.map((r) => r.escalation)) }; } }
  { const d = load('B.json'); if (d) { const m = firstRun(d); const byId = {}; for (const r of d.rows) (byId[r.id] ||= []).push(r.tier); let agree = 0, tot = 0; for (const v of Object.values(byId)) { if (v.length > 1) { tot++; if (new Set(v).size === 1) agree++; } }
    const r63 = d.rows.filter((r) => r.run === 1 && ids63.includes(r.id));
    out.arms.B = { model: d.model, runs: d.runs, aborted: d.aborted || null, run_agreement: { identical: agree, of: tot }, tokens_per_prompt_63: { in: summary(r63.map((r) => r.tokens_in)), out: summary(r63.map((r) => r.tokens_out)), total_mean: mean(r63.map((r) => (r.tokens_in || 0) + (r.tokens_out || 0))) }, latency_ms_wall: summary(r63.map((r) => r.wall_ms)), null_labels: r63.filter((r) => !r.tier).length, acc63: acc(m, ids63, L), acc40: acc(m, ids40, L), acc23: acc(m, ids23, L), acc_train35: acc(m, Object.keys(trainL), trainL) };
    const A = load('A-key.json'); if (A) { const ma = firstRun(A); let b = 0, c = 0; for (const id of ids63) { const a = ma[id] && ma[id].tier === L[id], bb = m[id] && m[id].tier === L[id]; if (a && !bb) b++; if (!a && bb) c++; } out.mcnemar_Akey_vs_B_63 = mcnemarExact(b, c); let b2 = 0, c2 = 0; for (const id of ids40) { const a = ma[id] && ma[id].tier === L[id], bb = m[id] && m[id].tier === L[id]; if (a && !bb) b2++; if (!a && bb) c2++; } out.mcnemar_Akey_vs_B_40 = mcnemarExact(b2, c2); } } }
  { const d = load('D-tzachbon.json'); if (d) { const ex = {}, bin = {}; for (const r of d.rows) { ex[r.id] = { tier: r.tier_mapped }; bin[r.id] = r.binary; }
    const binL = {}; for (const id of ids63) binL[id] = ['T0', 'T1'].includes(L[id]) ? 'barato' : 'caro';
    const binM = {}; for (const id of ids63) binM[id] = { tier: bin[id] };
    const decided = ids63.filter((id) => ex[id] && ex[id].tier);
    out.arms.D = { heuristic: { decided: decided.length, abstain: ids63.length - decided.length, acc63_exact_on_decided: acc(ex, decided, L), acc63_binary_on_decided: acc(binM, decided, binL), classes: count(d.rows.map((r) => r.klass)) }, cli_fallback: d.cli_fallback || null, note: d.note }; } }
  { const d = load('rater2-local.json'); if (d) { const m = {}; for (const r of d.rows) m[r.id] = r.tier; const a = [], b = []; for (const id of ids63) if (m[id]) { a.push(L[id]); b.push(m[id]); } out.rater2 = { model: d.model, n: a.length, kappa_vs_codex: cohenKappa(a, b, ['T0', 'T1', 'T2', 'T3']), raw_agreement: a.filter((x, i) => x === b[i]).length / a.length }; } }
  save('analysis.json', out); console.log(JSON.stringify(out, null, 1));
}
function count(arr) { const m = {}; for (const x of arr) m[x] = (m[x] || 0) + 1; return m; }
function mean(a) { const v = a.filter(Number.isFinite); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; }

// ── main ────────────────────────────────────────────────────────────────────
const arm = opt('--arm'); const runs = Number(opt('--runs', arm === 'B' || arm === 'A-hook' ? 3 : 6));
if (has('--analyse')) await analyse();
else if (has('--all')) {
  const me = fileURLToPath(import.meta.url);
  const run = (...a) => { const r = spawnSync(process.execPath, [me, ...a], { stdio: 'inherit' }); if (r.status !== 0) throw new Error('falhou: ' + a.join(' ')); };
  run('--arm', 'A', '--env', 'key'); run('--arm', 'A', '--env', 'nokey');
  run('--arm', 'A-spawn', '--env', 'key'); run('--arm', 'A-spawn', '--env', 'nokey');
  run('--arm', 'A-hook'); run('--arm', 'B'); run('--arm', 'B-rater2');
} else if (arm === 'A') await armA(opt('--env', 'key'), runs);
else if (arm === 'A-spawn') armASpawn(opt('--env', 'key'), runs);
else if (arm === 'A-hook') armAHook(runs);
else if (arm === 'B') await armB(runs);
else if (arm === 'B-rater2') await armRater2();
else { console.error('uso: --arm A|A-spawn|A-hook|B|B-rater2 [--env key|nokey] [--runs N] | --all | --analyse'); process.exit(2); }
