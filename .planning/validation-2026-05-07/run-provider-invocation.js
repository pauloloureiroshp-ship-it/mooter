#!/usr/bin/env node
// @ts-check
/**
 * run-provider-invocation.js — Task #4 of MOOTER_VALIDATION_MASTER.md
 *
 * For each of 30 stratified prompts: invoke `suggested_providers[0]`,
 * capture {response, latency_ms, tokens_in, tokens_out, cost_usd, error}.
 * Then: 5 prompts × 3 models horizontal matrix for direct quality vs cost
 * comparison.
 *
 * Hard budget caps:
 *   - Codex messages: 50 (then skip remaining Codex)
 *   - OpenAI USD: 0.50
 *   - Anthropic USD: 0.50
 *   - Wall clock: 10 minutes (then bail)
 *
 * Output: executions.jsonl (one line per invocation)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

require('../../tools/router/providers/_load-env').loadEnv();

const { callOpenAI } = require('../../tools/router/providers/openai-api');
const { callCodex }  = require('../../tools/router/providers/codex-cli');
const pricing        = require('../../tools/router/pricing');

const ACCURACY_REPORT = path.join(__dirname, 'accuracy-report.json');
const CORPUS = path.join(__dirname, 'validation-corpus.jsonl');
const OUTPUT = path.join(__dirname, 'executions.jsonl');

const ANTHROPIC_MODEL_BY_TIER = {
  haiku:  'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-6',
};

const BUDGET = {
  codex_messages_max: 50,
  openai_usd_max: 0.50,
  anthropic_usd_max: 0.50,
  wall_clock_ms_max: 10 * 60 * 1000,
};

const t0Wall = Date.now();
const used = {
  codex_messages: 0,
  openai_usd: 0,
  anthropic_usd: 0,
  by_provider: {},
};

function timeLeft() { return BUDGET.wall_clock_ms_max - (Date.now() - t0Wall); }

// ── Provider invokers ──────────────────────────────────────────────────

// NOTE — wrappers below use direct fetch (not shell wrappers) because:
//   - tools/router/ollama_call.sh has a bug: $MODEL is shell-local, never
//     exported to the inline `node -e` that builds the payload, so the
//     payload always carries model:"". Filed as DEV-005 in inventory.
//   - tools/router/anthropic_call.sh requires ANTHROPIC_API_KEY in its
//     immediate env; spawnSync inherits, but direct fetch is simpler and
//     gives us proper error bodies (the shell wrapper drops 4xx details).
//   - OpenAI key in tools/router/.env is malformed (`sk-sk-proj-...` —
//     duplicated `sk-` prefix). Surfaced via direct API ping. We skip
//     OpenAI calls entirely and record SKIP[openai_key_malformed].

async function invokeOllama(prompt, model) {
  const t0 = Date.now();
  const m = model || 'qwen3:30b';
  try {
    const r = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: m, prompt, stream: false, options: { temperature: 0, num_predict: 512 } }),
      signal: AbortSignal.timeout(60_000),
    });
    const durationMs = Date.now() - t0;
    const j = await r.json();
    if (j.error) return { ok: false, error: `ollama: ${j.error}`, duration_ms: durationMs };
    return {
      ok: true,
      text: (j.response || '').trim(),
      model: m,
      tokens_in: j.prompt_eval_count || 0,
      tokens_out: j.eval_count || 0,
      cost_usd: 0,
      duration_ms: durationMs,
    };
  } catch (e) {
    return { ok: false, error: `ollama: ${String(e && e.message || e)}`, duration_ms: Date.now() - t0 };
  }
}

async function invokeAnthropic(prompt, model) {
  const t0 = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'anthropic: no key', duration_ms: 0 };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const durationMs = Date.now() - t0;
    const j = await r.json();
    if (!r.ok || j.error) return { ok: false, error: `anthropic ${r.status}: ${JSON.stringify(j.error || j).slice(0, 200)}`, duration_ms: durationMs };
    const text = (j.content || []).map((c) => c.text || '').join('').trim();
    const tokensIn  = (j.usage && j.usage.input_tokens)  || 0;
    const tokensOut = (j.usage && j.usage.output_tokens) || 0;
    const p = pricing.PRICES[model] || {};
    const cost = (p.input ? p.input * tokensIn / 1e6 : 0) + (p.output ? p.output * tokensOut / 1e6 : 0);
    used.anthropic_usd += cost;
    return { ok: true, text, model, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: +cost.toFixed(6), duration_ms: durationMs };
  } catch (e) {
    return { ok: false, error: `anthropic: ${String(e && e.message || e)}`, duration_ms: Date.now() - t0 };
  }
}

async function invokeOpenAI(prompt, _model) {
  return { ok: false, skipped: true, reason: 'openai_key_malformed' };
}

async function invokeCodex(prompt, model) {
  if (used.codex_messages >= BUDGET.codex_messages_max) {
    return { ok: false, skipped: true, reason: 'codex_budget_exhausted' };
  }
  used.codex_messages++;
  const r = callCodex(prompt, { timeoutMs: 90_000, model });
  if (!r) return { ok: false, error: 'codex: returned null', duration_ms: 0 };
  return { ok: true, text: r.text, model: r.model || (model || 'codex-default'), tokens_in: 0, tokens_out: 0, cost_usd: 0, duration_ms: r.durationMs, billing: 'subscription' };
}

async function invoke(prompt, providerName, modelOverride) {
  used.by_provider[providerName] = (used.by_provider[providerName] || 0) + 1;
  // Budget guards
  if (providerName === 'codex_cli' && used.codex_messages >= BUDGET.codex_messages_max) {
    return { ok: false, skipped: true, reason: 'codex_budget_exhausted' };
  }
  if (providerName === 'openai_api' && used.openai_usd >= BUDGET.openai_usd_max) {
    return { ok: false, skipped: true, reason: 'openai_budget_exhausted' };
  }
  if (['haiku','sonnet','opus'].includes(providerName) && used.anthropic_usd >= BUDGET.anthropic_usd_max) {
    return { ok: false, skipped: true, reason: 'anthropic_budget_exhausted' };
  }
  if (timeLeft() <= 0) return { ok: false, skipped: true, reason: 'wall_clock_exhausted' };

  try {
    if (providerName === 'ollama')     return await invokeOllama(prompt, modelOverride);
    if (providerName === 'codex_cli')  return await invokeCodex(prompt, modelOverride);
    if (providerName === 'openai_api') return await invokeOpenAI(prompt, modelOverride || 'gpt-4o');
    if (providerName === 'haiku')      return await invokeAnthropic(prompt, ANTHROPIC_MODEL_BY_TIER.haiku);
    if (providerName === 'sonnet')     return await invokeAnthropic(prompt, ANTHROPIC_MODEL_BY_TIER.sonnet);
    if (providerName === 'opus')       return await invokeAnthropic(prompt, ANTHROPIC_MODEL_BY_TIER.opus);
    return { ok: false, skipped: true, reason: `no_mapping_for_${providerName}` };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// ── Pick stratified prompts ────────────────────────────────────────────

function pickPrompts(report, corpus) {
  // Build prompt-id → text map from corpus.
  const idToPrompt = new Map();
  for (const e of corpus) idToPrompt.set(e.id, e.prompt);

  // Stratify by suggested_providers[0]; aim for 30 total.
  const target = { ollama: 6, opus: 6, sonnet: 4, haiku: 4, codex_cli: 4, openai_api: 0, none: 0 };
  // OpenAI not suggested by classifier in our corpus → reserve for matrix
  const byProvider = {};
  for (const r of report.raw_results) {
    const p = (r.suggested_providers || ['none'])[0];
    (byProvider[p] = byProvider[p] || []).push({ ...r, prompt_text: idToPrompt.get(r.id) });
  }
  const picked = [];
  for (const [prov, n] of Object.entries(target)) {
    const pool = byProvider[prov] || [];
    picked.push(...pool.slice(0, n));
  }
  return picked.slice(0, 30);
}

// 5 horizontal-matrix prompts: 1 per expected_tier (T0..T3) + 1 code-gen-ish
function pickHorizontal(corpus) {
  const wantTiers = ['T0', 'T1', 'T2', 'T3'];
  const picks = [];
  for (const t of wantTiers) {
    const candidate = corpus.find((e) => e.expected_tier === t && e.use_for_accuracy && e.source.startsWith('handcrafted'));
    if (candidate) picks.push(candidate);
  }
  // 5th: a code-gen-style handcrafted (regex)
  const codeGen = corpus.find((e) => e.class === 'transform' && e.expected_tier === 'T1' && e.source === 'handcrafted');
  if (codeGen && !picks.find((p) => p.id === codeGen.id)) picks.push(codeGen);
  return picks.slice(0, 5);
}

// ── Main ───────────────────────────────────────────────────────────────

(async () => {
  const report = JSON.parse(fs.readFileSync(ACCURACY_REPORT, 'utf8'));
  const corpus = fs.readFileSync(CORPUS, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

  const out = fs.createWriteStream(OUTPUT, { flags: 'w' });
  let invocationIdx = 0;

  // ── Layer 1: 30 prompts via suggested_providers[0] ─────────────────
  const picks = pickPrompts(report, corpus);
  console.error(`Selected ${picks.length} prompts for primary invocation pass.`);
  console.error('Distribution by provider:');
  const dist = {};
  for (const p of picks) {
    const prov = (p.suggested_providers || ['none'])[0];
    dist[prov] = (dist[prov] || 0) + 1;
  }
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${v.toString().padStart(2)}  ${k}`);
  }

  for (const p of picks) {
    invocationIdx++;
    const provider = (p.suggested_providers || ['none'])[0];
    const r = await invoke(p.prompt_text, provider, null);
    const rec = {
      idx: invocationIdx,
      layer: 'primary',
      prompt_id: p.id,
      prompt_preview: p.prompt_text.slice(0, 80),
      provider,
      result: r,
      budget_after: { ...used },
      ts: new Date().toISOString(),
    };
    out.write(JSON.stringify(rec) + '\n');
    const status = r.ok ? 'OK' : (r.skipped ? `SKIP[${r.reason}]` : `FAIL[${(r.error || '').slice(0, 50)}]`);
    process.stderr.write(`[${invocationIdx}/${picks.length}] ${p.id} ${provider.padEnd(12)} ${status} `);
    if (r.ok) process.stderr.write(`${r.duration_ms}ms tok=${r.tokens_in}/${r.tokens_out} $${(r.cost_usd || 0).toFixed(4)}`);
    process.stderr.write('\n');
    if (timeLeft() <= 0) { console.error('Wall clock exhausted, stopping primary pass.'); break; }
  }

  // ── Layer 2: horizontal matrix (5 prompts × 3 models) ─────────────
  const horizPicks = pickHorizontal(corpus);
  console.error(`\nHorizontal matrix: ${horizPicks.length} prompts × multiple models.`);
  const matrixModels = [
    { provider: 'ollama',  model: 'qwen2.5:3b',                   label: 'ollama:qwen2.5:3b' },
    { provider: 'ollama',  model: 'qwen3:30b',                    label: 'ollama:qwen3:30b' },
    { provider: 'haiku',   model: null,                           label: 'anthropic:haiku-4.5' },
    { provider: 'sonnet',  model: null,                           label: 'anthropic:sonnet-4.6' },
    { provider: 'opus',    model: null,                           label: 'anthropic:opus-4.6' },
    { provider: 'openai_api', model: 'gpt-4o',                    label: 'openai:gpt-4o' },
  ];
  for (const p of horizPicks) {
    for (const m of matrixModels) {
      invocationIdx++;
      const r = await invoke(p.prompt, m.provider, m.model);
      const rec = {
        idx: invocationIdx,
        layer: 'horizontal',
        prompt_id: p.id,
        prompt_preview: p.prompt.slice(0, 80),
        provider: m.provider,
        model_label: m.label,
        result: r,
        budget_after: { ...used },
        ts: new Date().toISOString(),
      };
      out.write(JSON.stringify(rec) + '\n');
      const status = r.ok ? 'OK' : (r.skipped ? `SKIP[${r.reason}]` : `FAIL[${(r.error || '').slice(0, 50)}]`);
      process.stderr.write(`  [${p.id} × ${m.label.padEnd(22)}] ${status} `);
      if (r.ok) process.stderr.write(`${r.duration_ms}ms $${(r.cost_usd || 0).toFixed(4)}`);
      process.stderr.write('\n');
      if (timeLeft() <= 0) break;
    }
    if (timeLeft() <= 0) { console.error('Wall clock exhausted during horizontal pass.'); break; }
  }

  out.end();
  await new Promise((r) => out.on('finish', r));

  // Final budget summary
  const summary = {
    invocations_total: invocationIdx,
    elapsed_ms: Date.now() - t0Wall,
    budget_used: used,
    budget_caps: BUDGET,
    pct_consumed: {
      codex_messages: +(used.codex_messages / BUDGET.codex_messages_max * 100).toFixed(1),
      openai_usd:     +(used.openai_usd / BUDGET.openai_usd_max * 100).toFixed(1),
      anthropic_usd:  +(used.anthropic_usd / BUDGET.anthropic_usd_max * 100).toFixed(1),
      wall_clock:     +((Date.now() - t0Wall) / BUDGET.wall_clock_ms_max * 100).toFixed(1),
    },
  };
  fs.writeFileSync(path.join(__dirname, 'budget-summary.json'), JSON.stringify(summary, null, 2));
  console.error('\n=== BUDGET SUMMARY ===');
  console.error(JSON.stringify(summary, null, 2));
})();
