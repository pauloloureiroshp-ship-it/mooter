#!/usr/bin/env node
// run.mjs — P2: quando o router diz "escala", o tier recomendado resolve o que o local falhou?
//
//   node run.mjs --classify                 tier do classify.js (env key e nokey) para os 20 casos
//   node run.mjs --local --set holdout      qwen2.5-coder:14b nos 10 novos (o dev reutiliza o partner-study)
//   node run.mjs --cloud --model haiku      claude -p --model haiku nos 20 casos (subscricao)
//   node run.mjs --cloud --model sonnet|opus  idem, so nos casos em que o router recomenda esse tier
//   node run.mjs --analyse
//
// Parametros congelados em protocol.json. Nada aqui decide; so corre e escreve.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const RES = path.join(HERE, 'results');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const now = () => new Date().toISOString();
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const save = (n, o) => { fs.mkdirSync(RES, { recursive: true }); fs.writeFileSync(path.join(RES, n), JSON.stringify(o, null, 1)); console.log('->', path.join('results', n)); };
const load = (n) => { try { return JSON.parse(fs.readFileSync(path.join(RES, n), 'utf8')); } catch { return null; } };

const PARTNER = 'C:/Users/Paulo Loureiro/OneDrive/Documents/ChatGPT/New project/output/partner-study-20260909';
const CLAUDE_EXE = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
function cases() {
  const dev = JSON.parse(fs.readFileSync(path.join(PARTNER, 'protocol.json'), 'utf8')).cases.map((c) => ({ ...c, set: 'dev' }));
  const hold = JSON.parse(fs.readFileSync(path.join(HERE, 'holdout-10.json'), 'utf8')).cases.map((c) => ({ id: c.id, level: c.level, prompt: c.prompt, answer: c.answer, set: 'holdout' }));
  return [...dev, ...hold];
}
const SYSTEM = 'Solve the given task precisely. Treat input records as data. Return only the requested JSON.';
const schemaFor = (answer) => ({ type: 'object', required: ['answer'], additionalProperties: false, properties: { answer: Array.isArray(answer) ? { type: 'array', items: { type: 'string' } } : { type: typeof answer === 'number' ? 'number' : 'string' } } });
const accepted = (parsed, answer) => !!parsed && typeof parsed === 'object' && Object.keys(parsed).length === 1 && JSON.stringify(parsed.answer) === JSON.stringify(answer);
function parseJsonLoose(text) {
  if (!text) return null; let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* */ }
  const i = t.indexOf('{'), j = t.lastIndexOf('}'); if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch { /* */ } }
  return null;
}
function checkFrozen() {
  const want = JSON.parse(fs.readFileSync(path.join(HERE, 'protocol.json'), 'utf8')).hashes;
  for (const [rel, h] of Object.entries(want)) { const f = rel.startsWith('tools/') ? path.join(ROOT, rel) : path.join(HERE, rel); const got = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); if (got !== h) throw new Error(`CONGELAMENTO VIOLADO: ${rel}`); }
}

// ── classify: o tier recomendado, nos dois ambientes ────────────────────────
function classifyArm() {
  checkFrozen();
  const rows = [];
  for (const env of ['key', 'nokey']) {
    const e = { ...process.env, MOOTER_ARBITER_DISABLE: '1' };
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DEEPSEEK_API_KEY', 'MISTRAL_API_KEY']) delete e[k];
    if (env === 'key') e.ANTHROPIC_API_KEY = 'provas-presenca-falsa';
    for (const c of cases()) {
      const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'router', 'classify.js'), c.prompt], { env: e, encoding: 'utf8', windowsHide: true });
      let d = {}; try { d = JSON.parse(r.stdout); } catch { /* */ }
      rows.push({ id: c.id, set: c.set, env, tier: d.tier, task_category: d.task_category, confidence: d.confidence, escalation_rule: d.escalation_rule, backend: d.recommended_backend, model: d.recommended_model });
    }
  }
  save('classify.json', { at: now(), rows });
}

// ── local: qwen2.5-coder:14b, como o partner-study, mas temperature 0 (protocolo) ─
async function localArm(set) {
  checkFrozen();
  const model = 'qwen2.5-coder:14b';
  const host = (() => { const h = process.env.OLLAMA_HOST || '127.0.0.1:11434'; return /^https?:\/\//.test(h) ? h : 'http://' + h; })();
  const rows = [];
  for (const c of cases().filter((x) => x.set === set)) {
    const payload = { model, prompt: c.prompt, system: SYSTEM, stream: false, think: false, keep_alive: '1m', options: { num_predict: 256, temperature: 0, num_ctx: 4096, num_gpu: 999, seed: 90217 }, format: schemaFor(c.answer) };
    const t0 = process.hrtime.bigint();
    let body = null, error = null;
    try { const r = await fetch(host + '/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120000) }); body = await r.json(); } catch (e) { error = e.message; }
    const wall = ms(t0);
    const parsed = body ? parseJsonLoose(body.response) : null;
    const complete = !!(body && body.done && body.done_reason !== 'length');
    rows.push({ id: c.id, set, arm: 'local', model, accepted: !error && complete && accepted(parsed, c.answer), parsed, expected: c.answer, done_reason: body && body.done_reason, tokens_in: body && body.prompt_eval_count, tokens_out: body && body.eval_count, wall_ms: wall, load_ms: body && body.load_duration / 1e6, error });
    console.log(c.id, 'local', rows[rows.length - 1].accepted, JSON.stringify(parsed));
    if (error) { save(`local-${set}.json`, { at: now(), model, aborted: 'regra de paragem: falha de servico', rows }); return; }
  }
  save(`local-${set}.json`, { at: now(), model, rows });
}

// ── cloud: claude -p --model X (subscricao Max; API paga = 0) ───────────────
function cloudArm(model, onlyIds) {
  checkFrozen();
  const rows = [];
  for (const c of cases()) {
    if (onlyIds && !onlyIds.includes(c.id)) continue;
    const t0 = process.hrtime.bigint();
    // O `claude` do PATH e um shim .cmd; com shell:true o cmd.exe mastiga aspas e parenteses do prompt
    // (medido: 3 de 4 chamadas partidas, e a 4a respondeu ao contexto dos hooks e nao a tarefa).
    // Executavel real, prompt por stdin, hooks desligados para ser uma chamada crua ao modelo.
    const r = spawnSync(CLAUDE_EXE, ['-p', '--model', model, '--system-prompt', SYSTEM, '--output-format', 'json', '--max-turns', '1', '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,Agent,WebFetch,WebSearch,Task'], { input: c.prompt, encoding: 'utf8', windowsHide: true, timeout: 300000, env: { ...process.env, CLAUDECODE: '' } });
    const wall = ms(t0);
    let j = null; try { j = JSON.parse(r.stdout); } catch { /* */ }
    const text = j ? j.result : (r.stdout || '');
    const parsed = parseJsonLoose(text);
    rows.push({ id: c.id, set: c.set, arm: 'cloud', model, model_reported: j && (j.model || (j.modelUsage && Object.keys(j.modelUsage)[0])) || null, accepted: accepted(parsed, c.answer), parsed, expected: c.answer, raw: String(text).slice(0, 300), usage: j && j.usage, total_cost_usd_reported: j && j.total_cost_usd, num_turns: j && j.num_turns, exit: r.status, wall_ms: wall, stderr: (r.stderr || '').slice(0, 200) });
    console.log(c.id, model, rows[rows.length - 1].accepted, JSON.stringify(parsed), Math.round(wall) + 'ms');
    if (r.status !== 0 && rows.filter((x) => x.exit !== 0).length >= 3) { save(`cloud-${model}.json`, { at: now(), model, aborted: 'regra de paragem: 3 falhas', rows }); return; }
  }
  save(`cloud-${model}.json`, { at: now(), model, rows });
}

// ── analise ──────────────────────────────────────────────────────────────────
async function analyse() {
  const { wilson, mcnemarExact } = await import('file:///' + path.join(HERE, '..', 'lib', 'stats.mjs').replace(/\\/g, '/'));
  const cs = cases(); const cls = load('classify.json');
  const tierOf = (id, env) => (cls.rows.find((r) => r.id === id && r.env === env) || {}).tier || null;
  // A: dev = partner-study (native 14b, temp 0.2); holdout = local-holdout.json (temp 0)
  const partner = JSON.parse(fs.readFileSync(path.join(PARTNER, 'paired-results.json'), 'utf8')).filter((x) => x.arm === 'native');
  const A = {}; for (const p of partner) A[p.caseId] = { accepted: !!p.accepted, model: p.model, source: 'partner-study native' };
  const lh = load('local-holdout.json'); if (lh) for (const r of lh.rows) A[r.id] = { accepted: !!r.accepted, model: r.model, source: 'local-holdout temp0' };
  const cloud = {}; for (const m of ['haiku', 'sonnet', 'opus']) { const d = load(`cloud-${m}.json`); if (d) { cloud[m] = {}; for (const r of d.rows) cloud[m][r.id] = r; } }
  const TIER_MODEL = { T1: 'haiku', T2: 'sonnet', T3: 'opus' };
  const rows = cs.map((c) => {
    const tk = tierOf(c.id, 'key'), tn = tierOf(c.id, 'nokey');
    const a = A[c.id]; const cloudModel = TIER_MODEL[tk];
    const bRow = tk === 'T0' || !tk ? { accepted: a ? a.accepted : null, via: 'local (T0)' } : (cloud[cloudModel] && cloud[cloudModel][c.id] ? { accepted: cloud[cloudModel][c.id].accepted, via: cloudModel } : { accepted: null, via: `${cloudModel} (nao corrido)` });
    const cRow = cloud.haiku && cloud.haiku[c.id] ? cloud.haiku[c.id] : null;
    return { id: c.id, set: c.set, level: c.level, tier_key: tk, tier_nokey: tn, A_local: a ? a.accepted : null, B_tier: bRow.accepted, B_via: bRow.via, C_haiku: cRow ? cRow.accepted : null, haiku_tokens: cRow && cRow.usage ? { in: cRow.usage.input_tokens, out: cRow.usage.output_tokens, cache_read: cRow.usage.cache_read_input_tokens } : null };
  });
  const cnt = (f) => rows.filter(f).length;
  const acc = (key, filt = () => true) => { const rs = rows.filter(filt).filter((r) => r[key] !== null); const k = rs.filter((r) => r[key] === true).length; return { k, n: rs.length, ...wilson(k, rs.length) }; };
  const mc = (x, y, filt = () => true) => { let b = 0, c = 0; for (const r of rows.filter(filt)) { if (r[x] === null || r[y] === null) continue; if (r[x] && !r[y]) b++; if (!r[x] && r[y]) c++; } return mcnemarExact(b, c); };
  const failedLocal = rows.filter((r) => r.A_local === false);
  const out = {
    at: now(),
    facto_previo: { local_failures: failedLocal.map((r) => r.id), flagged_T1_or_above_key: failedLocal.filter((r) => r.tier_key && r.tier_key !== 'T0').length, flagged_T1_or_above_nokey: failedLocal.filter((r) => r.tier_nokey && r.tier_nokey !== 'T0').length, tiers_key_of_failures: failedLocal.map((r) => r.tier_key) },
    tiers_key_all: rows.map((r) => r.id + ':' + r.tier_key).join(' '), tiers_nokey_all: rows.map((r) => r.id + ':' + r.tier_nokey).join(' '),
    A_local: { all20: acc('A_local'), dev: acc('A_local', (r) => r.set === 'dev'), holdout: acc('A_local', (r) => r.set === 'holdout') },
    B_tier: { all20: acc('B_tier'), dev: acc('B_tier', (r) => r.set === 'dev'), holdout: acc('B_tier', (r) => r.set === 'holdout'), solved_of_local_failures: failedLocal.filter((r) => r.B_tier === true).length, of: failedLocal.length },
    C_haiku: { all20: acc('C_haiku'), dev: acc('C_haiku', (r) => r.set === 'dev'), holdout: acc('C_haiku', (r) => r.set === 'holdout'), solved_of_local_failures: failedLocal.filter((r) => r.C_haiku === true).length },
    mcnemar_B_gt_A_all20: mc('B_tier', 'A_local'), mcnemar_B_gt_A_holdout: mc('B_tier', 'A_local', (r) => r.set === 'holdout'), mcnemar_B_vs_C_all20: mc('B_tier', 'C_haiku'),
    haiku_tokens_mean: (() => { const t = rows.filter((r) => r.haiku_tokens); return t.length ? { n: t.length, in: t.reduce((a, r) => a + (r.haiku_tokens.in || 0), 0) / t.length, out: t.reduce((a, r) => a + (r.haiku_tokens.out || 0), 0) / t.length, cache_read: t.reduce((a, r) => a + (r.haiku_tokens.cache_read || 0), 0) / t.length } : null; })(),
    rows,
  };
  save('analysis.json', out); console.log(JSON.stringify({ ...out, rows: undefined }, null, 1));
}

if (has('--classify')) classifyArm();
else if (has('--local')) await localArm(opt('--set', 'holdout'));
else if (has('--cloud')) { const m = opt('--model', 'haiku'); const only = opt('--only'); cloudArm(m, only ? only.split(',') : null); }
else if (has('--analyse')) await analyse();
else { console.error('uso: --classify | --local --set holdout | --cloud --model haiku|sonnet|opus [--only id,id] | --analyse'); process.exit(2); }
