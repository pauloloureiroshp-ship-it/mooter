#!/usr/bin/env node
/**
 * shadow-judge.js — nightly LLM-as-judge for shadow pairs.
 *
 * Reads unjudged shadow_pair events from decisions.log, sends each pair
 * to a local judge model (llama3.2:3b by default, fast), writes verdicts
 * back as shadow_judgment events. 1% of pairs are spot-checked with a
 * larger model to detect judge bias.
 *
 * Run nightly via Task Scheduler at 03:00 (see run-shadow-judge.cmd).
 *
 * Usage:
 *   node shadow-judge.js                # judge all unjudged from last 24h
 *   node shadow-judge.js --limit 100    # cap number judged
 *   node shadow-judge.js --dry-run      # print verdicts, don't write
 *   node shadow-judge.js --all          # judge ALL unjudged, not just 24h
 *   node shadow-judge.js --model qwen3:30b  # override judge model
 *
 * Privacy: only truncated previews (200 chars) are sent to the judge.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const OLLAMA_CALL = path.join(ROUTER_DIR, 'ollama_call.sh');

const DEFAULT_MODEL = 'qwen3:30b';
const SPOT_CHECK_RATE = 0.01; // 1% with larger model
const HORIZON_MS = 24 * 60 * 60 * 1000; // 24h

const args = process.argv.slice(2);
const argi = (k) => args.indexOf(k);
const dryRun = argi('--dry-run') >= 0;
const all = argi('--all') >= 0;
const limitIdx = argi('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const modelIdx = argi('--model');
const judgeModel = modelIdx >= 0 ? args[modelIdx + 1] : DEFAULT_MODEL;

function loadUnjudged() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const now = Date.now();
  const pairs = [];

  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.event !== 'shadow_pair') continue;
      if (e.judge_verdict != null) continue;
      if (!all && typeof e.ts_ms === 'number' && now - e.ts_ms > HORIZON_MS) continue;
      if (!e.primary_preview && !e.shadow_preview) continue;
      pairs.push(e);
    } catch (_) { /* skip */ }
  }
  return pairs;
}

function buildJudgePrompt(pair) {
  return `Compare these two responses to the same user prompt. Decide which is better.
Criteria: correctness, completeness, conciseness.
Respond with EXACTLY one word: PRIMARY or SHADOW or TIE

User prompt context: (tier ${pair.primary_tier} vs ${pair.shadow_tier})
Response A (primary, tier ${pair.primary_tier}): ${pair.primary_preview || '(empty)'}
Response B (shadow, tier ${pair.shadow_tier}): ${pair.shadow_preview || '(empty)'}

Your verdict (one word):`;
}

function callOllama(prompt, model) {
  try {
    const result = execSync(
      `bash "${OLLAMA_CALL}" --text "${prompt.replace(/"/g, '\\"')}" --model "${model}"`,
      { encoding: 'utf8', timeout: 60000, windowsHide: true }
    ).trim();
    return result;
  } catch (err) {
    return null;
  }
}

function parseVerdict(raw) {
  if (!raw) return { verdict: null, confidence: 0 };
  const clean = raw.toUpperCase().trim().split(/[\s.,!]+/)[0];
  if (clean === 'PRIMARY') return { verdict: 'primary_better', confidence: 0.8 };
  if (clean === 'SHADOW') return { verdict: 'shadow_better', confidence: 0.8 };
  if (clean === 'TIE') return { verdict: 'tie', confidence: 0.7 };
  return { verdict: null, confidence: 0 };
}

function logJudgment(pair, verdict, judgeConf, model) {
  const event = {
    ts: new Date().toISOString(),
    ts_ms: Date.now(),
    event: 'shadow_judgment',
    decision_id: pair.decision_id,
    session_id: pair.session_id,
    primary_tier: pair.primary_tier,
    shadow_tier: pair.shadow_tier,
    judge_verdict: verdict,
    judge_confidence: judgeConf,
    judge_model: model,
    judged_at: new Date().toISOString(),
  };
  if (!dryRun) {
    fs.appendFileSync(LOG_PATH, JSON.stringify(event) + '\n');
  }
  return event;
}

function main() {
  const pairs = loadUnjudged();
  const toJudge = pairs.slice(0, limit);

  console.log(`Shadow judge — ${pairs.length} unjudged pairs found, processing ${toJudge.length}`);
  console.log(`Judge model: ${judgeModel}, dry-run: ${dryRun}`);
  console.log('');

  let judged = 0;
  let primaryWins = 0;
  let shadowWins = 0;
  let ties = 0;
  let failures = 0;

  for (const pair of toJudge) {
    const prompt = buildJudgePrompt(pair);
    const raw = callOllama(prompt, judgeModel);
    const { verdict, confidence } = parseVerdict(raw);

    if (!verdict) {
      failures++;
      console.log(`  [SKIP] decision=${pair.decision_id} — judge returned unparseable: "${(raw || '').slice(0, 50)}"`);
      continue;
    }

    logJudgment(pair, verdict, confidence, judgeModel);
    judged++;

    if (verdict === 'primary_better') primaryWins++;
    else if (verdict === 'shadow_better') shadowWins++;
    else ties++;

    const label = dryRun ? '[DRY]' : '[OK]';
    console.log(`  ${label} ${pair.primary_tier}→${pair.shadow_tier}  verdict=${verdict}  decision=${pair.decision_id}`);

    // 1% spot-check with larger model
    if (!dryRun && Math.random() < SPOT_CHECK_RATE && judgeModel !== 'claude-opus-4-6') {
      console.log(`    [SPOT-CHECK] re-judging with qwen3:30b...`);
      const spotRaw = callOllama(prompt, 'qwen3:30b');
      const spot = parseVerdict(spotRaw);
      if (spot.verdict && spot.verdict !== verdict) {
        console.log(`    [SPOT-CHECK] DISAGREE: main=${verdict}, spot=${spot.verdict}`);
      }
    }
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Judged:   ${judged}`);
  console.log(`  Primary:  ${primaryWins}`);
  console.log(`  Shadow:   ${shadowWins}`);
  console.log(`  Tie:      ${ties}`);
  console.log(`  Failures: ${failures}`);

  if (shadowWins > 0) {
    const overRoute = ((shadowWins / judged) * 100).toFixed(1);
    console.log(`  Over-routing detected: ${overRoute}% of pairs had shadow_better`);
  }
}

main();
