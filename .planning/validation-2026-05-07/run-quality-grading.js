#!/usr/bin/env node
// @ts-check
/**
 * run-quality-grading.js — Task #5 of MOOTER_VALIDATION_MASTER.md
 *
 * Reads executions.jsonl, grades each successful response with Haiku
 * acting as judge (0-100), and produces aggregated quality-grades.json.
 *
 * Judge prompt is deliberately minimal to avoid leaking validation
 * heuristics back into the grade. Score axes:
 *   - did the response actually answer the prompt?
 *   - is it accurate where it can be checked?
 *   - is the level of detail proportional?
 *
 * Output:
 *   - quality-grades.jsonl (per-judgment record, 1 line each)
 *   - quality-grades.json  (aggregated by tier × provider × model)
 */

'use strict';

const fs = require('fs');
const path = require('path');

require('../../tools/router/providers/_load-env').loadEnv();

const EXECUTIONS = path.join(__dirname, 'executions.jsonl');
const OUT_JSONL = path.join(__dirname, 'quality-grades.jsonl');
const OUT_JSON  = path.join(__dirname, 'quality-grades.json');

const JUDGE_MODEL = 'claude-haiku-4-5-20251001';
const JUDGE_BUDGET_USD_MAX = 0.20;

let judgeCostUsd = 0;
const HAIKU_PRICE = require('../../tools/router/pricing').PRICES['claude-haiku-4-5'] || { input: 1, output: 5 };

const SYSTEM_PROMPT = `You are a strict response-quality grader. Read the user's PROMPT and the model's RESPONSE.
Output ONLY a single line of JSON: {"score": <0-100>, "verdict": "<one short sentence>"}.
Score scale:
  90-100: fully answers the prompt, accurate, well-calibrated detail.
  70-89:  largely correct, minor gaps or verbosity, still useful.
  50-69:  partially answers, has factual errors or missing essentials, still has some value.
  30-49:  off-topic, significant errors, or refuses to engage with the actual ask.
  0-29:   nonsense, refusal, empty, or worse-than-no-answer.
Be tough but fair. Same standard for trivial prompts (a 5-word reply IS the right shape if asked for one).`;

async function judge(prompt, response) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const truncatedPrompt = prompt.slice(0, 1500);
  const truncatedResponse = (response || '').slice(0, 3000);
  const userMsg = `PROMPT:\n${truncatedPrompt}\n\nRESPONSE:\n${truncatedResponse}\n\nReturn ONLY the JSON line.`;
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 120,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = await r.json();
    const durationMs = Date.now() - t0;
    if (!r.ok || j.error) return { ok: false, error: `judge ${r.status}: ${JSON.stringify(j.error || j).slice(0, 200)}`, durationMs };
    const text = (j.content || []).map((c) => c.text || '').join('').trim();
    const tIn  = (j.usage && j.usage.input_tokens)  || 0;
    const tOut = (j.usage && j.usage.output_tokens) || 0;
    const cost = HAIKU_PRICE.input * tIn / 1e6 + HAIKU_PRICE.output * tOut / 1e6;
    judgeCostUsd += cost;
    // Try parse JSON. Be tolerant of preamble.
    let parsed = null;
    const m = text.match(/\{[\s\S]*?\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* swallow */ }
    }
    return {
      ok: true,
      score: parsed && typeof parsed.score === 'number' ? parsed.score : null,
      verdict: parsed && typeof parsed.verdict === 'string' ? parsed.verdict : (text.slice(0, 200)),
      raw: text.slice(0, 300),
      tokens_in: tIn,
      tokens_out: tOut,
      cost_usd: +cost.toFixed(6),
      duration_ms: durationMs,
    };
  } catch (e) {
    return { ok: false, error: `judge: ${String(e && e.message || e)}`, durationMs: Date.now() - t0 };
  }
}

(async () => {
  const records = fs.readFileSync(EXECUTIONS, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const judgeable = records.filter((r) => r.result && r.result.ok && r.result.text);
  console.error(`Total executions: ${records.length}`);
  console.error(`Judgeable (ok + text): ${judgeable.length}`);
  console.error(`Skipped (failed/empty): ${records.length - judgeable.length}`);

  const out = fs.createWriteStream(OUT_JSONL, { flags: 'w' });
  const grades = [];

  for (let i = 0; i < judgeable.length; i++) {
    const rec = judgeable[i];
    if (judgeCostUsd >= JUDGE_BUDGET_USD_MAX) {
      console.error(`[${i + 1}/${judgeable.length}] BUDGET CAP HIT — skipping rest`);
      out.write(JSON.stringify({ ...rec, judge: { ok: false, skipped: true, reason: 'judge_budget_cap' } }) + '\n');
      continue;
    }
    // We need the original prompt text. The record carries prompt_preview (≤80
    // chars) but we want the full prompt — re-load the corpus.
    const promptText = await getFullPrompt(rec.prompt_id);
    const judgment = await judge(promptText, rec.result.text);
    out.write(JSON.stringify({ ...rec, judge: judgment }) + '\n');
    grades.push({
      idx: rec.idx,
      layer: rec.layer,
      prompt_id: rec.prompt_id,
      provider: rec.provider,
      model_label: rec.model_label || rec.result.model,
      result_text_len: rec.result.text.length,
      cost_usd: rec.result.cost_usd || 0,
      duration_ms: rec.result.duration_ms || 0,
      score: judgment.ok ? judgment.score : null,
      verdict: judgment.ok ? judgment.verdict : null,
    });
    process.stderr.write(`[${i + 1}/${judgeable.length}] ${rec.prompt_id} ${(rec.model_label || rec.provider).padEnd(22)} `);
    if (judgment.ok && judgment.score !== null) process.stderr.write(`score=${judgment.score} (${judgment.duration_ms}ms)`);
    else process.stderr.write(`JUDGE_FAIL[${(judgment.error || '').slice(0, 50)}]`);
    process.stderr.write('\n');
  }
  out.end();
  await new Promise((r) => out.on('finish', r));

  // Aggregations
  const byProvider = {};
  const byModel = {};
  const byPromptHorizontal = {}; // for horizontal matrix ranking
  const byTier = {}; // need tier from corpus
  const corpusEntries = fs.readFileSync(path.join(__dirname, 'validation-corpus.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const idToTier = new Map(corpusEntries.map((e) => [e.id, e.expected_tier || (e.previous_prediction && e.previous_prediction.tier) || null]));

  for (const g of grades) {
    if (g.score === null) continue;
    (byProvider[g.provider] = byProvider[g.provider] || []).push(g.score);
    const ml = g.model_label || g.provider;
    (byModel[ml] = byModel[ml] || []).push(g.score);
    const tier = idToTier.get(g.prompt_id);
    if (tier) (byTier[tier] = byTier[tier] || []).push(g.score);
    if (g.layer === 'horizontal') {
      (byPromptHorizontal[g.prompt_id] = byPromptHorizontal[g.prompt_id] || []).push({ model: ml, score: g.score, cost: g.cost_usd, latency: g.duration_ms });
    }
  }
  const mean = (arr) => arr.length ? +(arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1) : null;

  const summary = {
    _meta: {
      generated_at: new Date().toISOString(),
      executions_total: records.length,
      judged: grades.filter((g) => g.score !== null).length,
      judge_cost_usd: +judgeCostUsd.toFixed(4),
      judge_budget_cap: JUDGE_BUDGET_USD_MAX,
    },
    mean_score_by_provider: Object.fromEntries(Object.entries(byProvider).map(([k, v]) => [k, { n: v.length, mean: mean(v) }])),
    mean_score_by_model:    Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, { n: v.length, mean: mean(v) }])),
    mean_score_by_tier:     Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, { n: v.length, mean: mean(v) }])),
    horizontal_matrix_ranking: Object.fromEntries(
      Object.entries(byPromptHorizontal).map(([promptId, rows]) => [
        promptId,
        rows.sort((a, b) => b.score - a.score).map((r, i) => ({ rank: i + 1, ...r })),
      ])
    ),
    raw_grades: grades,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));

  console.error('\n=== QUALITY GRADES SUMMARY ===');
  console.error('By provider (mean score):');
  for (const [k, v] of Object.entries(summary.mean_score_by_provider).sort((a, b) => (b[1].mean || 0) - (a[1].mean || 0))) {
    console.error(`  ${k.padEnd(14)} n=${v.n.toString().padStart(2)} mean=${v.mean}`);
  }
  console.error('\nBy model (horizontal + primary):');
  for (const [k, v] of Object.entries(summary.mean_score_by_model).sort((a, b) => (b[1].mean || 0) - (a[1].mean || 0))) {
    console.error(`  ${k.padEnd(24)} n=${v.n.toString().padStart(2)} mean=${v.mean}`);
  }
  console.error('\nBy tier (recommended by classifier):');
  for (const [k, v] of Object.entries(summary.mean_score_by_tier)) {
    console.error(`  ${k}  n=${v.n.toString().padStart(2)} mean=${v.mean}`);
  }
  console.error('\nHorizontal matrix winners (by prompt):');
  for (const [pid, ranking] of Object.entries(summary.horizontal_matrix_ranking)) {
    console.error(`  ${pid}:  ${ranking.map((r) => `${r.model}=${r.score}`).join('  ')}`);
  }
  console.error(`\nJudge cost: $${judgeCostUsd.toFixed(4)} of $${JUDGE_BUDGET_USD_MAX} cap`);
})();

// ── helpers ──

var _corpusCache = null;
async function getFullPrompt(promptId) {
  if (!_corpusCache) {
    const lines = fs.readFileSync(path.join(__dirname, 'validation-corpus.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean);
    _corpusCache = new Map(lines.map((l) => { const e = JSON.parse(l); return [e.id, e.prompt]; }));
  }
  return _corpusCache.get(promptId) || '';
}
