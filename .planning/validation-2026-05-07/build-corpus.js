#!/usr/bin/env node
// @ts-check
/**
 * build-corpus.js — Task #2 of MOOTER_VALIDATION_MASTER.md
 *
 * Produces validation-corpus.jsonl (60 prompts) from three sources:
 *   - 30 from tools/router/validation-set.json (canonical+adversarial+historical)
 *   - 20 sampled from ~/.claude/tools/router/decisions.log (sanitized, deduped)
 *   - 10 handcrafted multilingual (5 PT + 5 EN, balanced T0/T1/T2/T3)
 *
 * Output schema per JSONL line:
 *   { id, prompt, expected_tier, expected_category, language, class, source,
 *     trust, use_for_accuracy }
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sanitizeText } = require('../../tools/router/sanitize');

const DECISIONS_LOG = path.join(os.homedir(), '.claude/tools/router/decisions.log');
const VALIDATION_SET = path.join(__dirname, '../../tools/router/validation-set.json');
const OUTPUT = path.join(__dirname, 'validation-corpus.jsonl');

const RNG_SEED = 20260507; // deterministic
let rngState = RNG_SEED;
const rand = () => {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
};
const sample = (arr, n) => {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
};

// ── Source 1: validation-set.json (canonical + adversarial + historical) ─

function loadValidationSet() {
  const v = JSON.parse(fs.readFileSync(VALIDATION_SET, 'utf8'));
  const all = [];
  for (const bucket of ['canonical', 'adversarial', 'historical']) {
    if (!Array.isArray(v[bucket])) continue;
    for (const e of v[bucket]) {
      all.push({
        prompt: e.prompt,
        expected_tier: e.expected_tier,
        expected_category: e.expected_category,
        bucket,
        trust: e.trust || 'curated',
        notes: e.notes || '',
      });
    }
  }
  return all;
}

function pickFromValidationSet(all, n) {
  // Stratify by expected_tier so each tier is represented.
  const byTier = { T0: [], T1: [], T2: [], T3: [] };
  for (const e of all) {
    if (byTier[e.expected_tier]) byTier[e.expected_tier].push(e);
  }
  const perTier = Math.floor(n / 4);
  const picked = [];
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    picked.push(...sample(byTier[t], perTier));
  }
  // Fill remainder with mixed sample to hit n.
  const used = new Set(picked.map((p) => p.prompt));
  const rest = all.filter((e) => !used.has(e.prompt));
  picked.push(...sample(rest, n - picked.length));
  return picked.slice(0, n);
}

// ── Source 2: decisions.log (real organic prompts) ──────────────────────

function detectLang(prompt) {
  const ptHints = /\b(que|porque|porquê|para|com|sem|isto|isso|este|essa|aquela|fazer|preciso|consegue|deu|olhe|todo|melhor|pode|seria|também|registrar|registar)\b/i;
  return ptHints.test(prompt) ? 'pt' : 'en';
}

function classifyClass(prompt, tier) {
  const p = prompt.toLowerCase();
  if (/\b(commit|docstring|regex|format|rename|typo)\b/.test(p)) return 'transform';
  if (/\b(porque|why|debug|falha|fails|investiga|root cause|bug)\b/.test(p)) return 'debug';
  if (/\b(refator|refactor|reescrev|rewrite|migra|migrate)\b/.test(p)) return 'refactor';
  if (/\b(arquitet|architect|redesenha|redesign|audit|design)\b/.test(p)) return 'architecture';
  if (/\b(escreve|write|gera|generate|cria|create)\b/.test(p)) return 'code-gen';
  if (/\b(resume|summari|compara|compare|extrai|extract|traduz|translate)\b/.test(p)) return 'transform';
  if (/\b(matemática|matematica|math|cálcul|calculate|compute)\b/.test(p)) return 'math';
  if (tier === 'T0') return 'trivial';
  return 'misc';
}

function loadDecisionsSample(n) {
  if (!fs.existsSync(DECISIONS_LOG)) return [];
  const lines = fs.readFileSync(DECISIONS_LOG, 'utf8').split(/\r?\n/).filter(Boolean);
  const classified = [];
  for (const l of lines) {
    if (!l.includes('"event":"classified"')) continue;
    let o;
    try { o = JSON.parse(l); } catch { continue; }
    if (o.source && /tester|benchmark/i.test(o.source)) continue;
    const p = (o.prompt_preview || '').trim();
    if (!p) continue;
    if (p.startsWith('<task-notification>') || p.startsWith('<command-')) continue;
    if (p.length < 8) continue;
    classified.push(o);
  }
  // Dedupe by lowercase preview key (first 80 chars)
  const seen = new Set();
  const unique = [];
  for (const o of classified) {
    const key = (o.prompt_preview || '').toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(o);
  }
  // Stratify by tier — T0 abundant, T1 scarce. Take what we can.
  const byTier = { T0: [], T1: [], T2: [], T3: [] };
  for (const o of unique) if (byTier[o.tier]) byTier[o.tier].push(o);
  const targetPerTier = { T0: 5, T1: byTier.T1.length, T2: 5, T3: 5 };
  const picked = [];
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    picked.push(...sample(byTier[t], targetPerTier[t]));
  }
  // Fill rest randomly from the unused unique pool.
  const usedPrompts = new Set(picked.map((p) => p.prompt_preview));
  const rest = unique.filter((o) => !usedPrompts.has(o.prompt_preview));
  picked.push(...sample(rest, n - picked.length));
  return picked.slice(0, n).map((o) => ({
    prompt: sanitizeText(o.prompt_preview, { maxLength: 200 }),
    predicted_tier: o.tier,
    predicted_category: o.task_category,
    confidence_when_logged: o.confidence,
    bucket: 'decisions-log',
    truncated_at_log_time: true, // prompt_preview is already truncated
  }));
}

// ── Source 3: handcrafted multilingual (5 PT + 5 EN, balanced tiers) ────

const HANDCRAFTED = [
  // PT-PT
  { prompt: 'muda a cor do botão Login para azul', expected_tier: 'T0', expected_category: 'trivial_local', language: 'pt', class: 'trivial' },
  { prompt: 'gera commit message para o refactor do middleware de auth', expected_tier: 'T1', expected_category: 'short_routine', language: 'pt', class: 'transform' },
  { prompt: 'porque é que o websocket cai depois de 30s idle? investiga a causa raiz', expected_tier: 'T2', expected_category: 'reasoning_intermediate', language: 'pt', class: 'debug' },
  { prompt: 'redesenha o sistema de billing para suportar tax tiers por país, considerando IVA, GST e VAT', expected_tier: 'T3', expected_category: 'architecture_redesign', language: 'pt', class: 'architecture' },
  { prompt: 'explica este erro: TypeError: cannot read property of undefined no fetchUser', expected_tier: 'T1', expected_category: 'short_routine', language: 'pt', class: 'debug' },
  // EN
  { prompt: 'rename the variable counter to attemptCount in retry.ts', expected_tier: 'T0', expected_category: 'trivial_local', language: 'en', class: 'trivial' },
  { prompt: 'generate a regex that matches ISO-8601 dates with optional timezone', expected_tier: 'T1', expected_category: 'short_routine', language: 'en', class: 'transform' },
  { prompt: 'compare these two refactor approaches: extract-component vs prop-drill — recommend one with rationale', expected_tier: 'T2', expected_category: 'reasoning_intermediate', language: 'en', class: 'refactor' },
  { prompt: 'audit the auth migration in PR #142 before tonight production deploy — focus on session token storage', expected_tier: 'T3', expected_category: 'pre_release_audit', language: 'en', class: 'architecture' },
  { prompt: 'format this JSON file with 2-space indentation', expected_tier: 'T0', expected_category: 'trivial_local', language: 'en', class: 'transform' },
];

// ── Compose corpus ─────────────────────────────────────────────────────

function main() {
  const all = loadValidationSet();
  console.error(`[1/3] validation-set.json: ${all.length} entries available`);
  const fromVS = pickFromValidationSet(all, 30);
  console.error(`      picked ${fromVS.length} for corpus`);

  const fromLog = loadDecisionsSample(20);
  console.error(`[2/3] decisions.log: picked ${fromLog.length} after sanitize+dedupe+stratify`);

  console.error(`[3/3] handcrafted: ${HANDCRAFTED.length} prompts`);

  const corpus = [];
  let id = 1;

  for (const e of fromVS) {
    corpus.push({
      id: `prompt-${String(id++).padStart(3, '0')}`,
      prompt: e.prompt,
      expected_tier: e.expected_tier,
      expected_category: e.expected_category,
      language: detectLang(e.prompt),
      class: classifyClass(e.prompt, e.expected_tier),
      source: `validation-set:${e.bucket}`,
      trust: 'ground_truth',
      use_for_accuracy: true,
      notes: e.notes,
    });
  }

  for (const e of fromLog) {
    corpus.push({
      id: `prompt-${String(id++).padStart(3, '0')}`,
      prompt: e.prompt,
      expected_tier: null, // no ground truth — only a previous classifier prediction
      expected_category: null,
      previous_prediction: { tier: e.predicted_tier, category: e.predicted_category, confidence: e.confidence_when_logged },
      language: detectLang(e.prompt),
      class: classifyClass(e.prompt, e.predicted_tier),
      source: 'decisions-log',
      trust: 'predicted_only',
      use_for_accuracy: false, // exclude from Task #3 accuracy math
      truncated_at_log_time: e.truncated_at_log_time,
    });
  }

  for (const e of HANDCRAFTED) {
    corpus.push({
      id: `prompt-${String(id++).padStart(3, '0')}`,
      prompt: e.prompt,
      expected_tier: e.expected_tier,
      expected_category: e.expected_category,
      language: e.language,
      class: e.class,
      source: 'handcrafted',
      trust: 'ground_truth',
      use_for_accuracy: true,
    });
  }

  fs.writeFileSync(OUTPUT, corpus.map((e) => JSON.stringify(e)).join('\n') + '\n');
  console.error(`\nWrote ${corpus.length} prompts to ${OUTPUT}`);

  // Summary stats
  const stats = {
    total: corpus.length,
    by_source: {},
    by_tier: {},
    by_language: {},
    by_class: {},
    accuracy_subset_size: corpus.filter((e) => e.use_for_accuracy).length,
  };
  for (const e of corpus) {
    stats.by_source[e.source] = (stats.by_source[e.source] || 0) + 1;
    const t = e.expected_tier || `predicted:${e.previous_prediction?.tier || '?'}`;
    stats.by_tier[t] = (stats.by_tier[t] || 0) + 1;
    stats.by_language[e.language] = (stats.by_language[e.language] || 0) + 1;
    stats.by_class[e.class] = (stats.by_class[e.class] || 0) + 1;
  }
  console.error('\nCorpus stats:');
  console.error(JSON.stringify(stats, null, 2));
  fs.writeFileSync(path.join(__dirname, 'corpus-stats.json'), JSON.stringify(stats, null, 2));
}

main();
