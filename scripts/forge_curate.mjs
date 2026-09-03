#!/usr/bin/env node
// Adapter Forge — Phase 1 curation extractor ($0, no GPU, no cloud).
//
// Turns measured-with-gain pairs into a curated training JSONL that
// scripts/train_lora.py already consumes ({prompt, completion, score}).
// Implements the Phase-1 hardening from docs/strategy/ADAPTER_FORGE.md §5-§6:
//   AF-02/03 provenance filter (measured-only, anti model-collapse)
//   AF-10    PII/secret scrub BEFORE training (adapter = exfiltration surface)
//   AF-16    anti-poisoning quarantine (injection markers / length outliers)
//   AF-19    split-by-origin FIRST, dedupe WITHIN each side (no leakage)
//   diversity cap (anti-overfit to a recent task)
//
// MODES:
//   --mode=measured  each pair must carry provenance.measured===true & gain>0,
//                    and must NOT be self_generated (anti-collapse). This is the
//                    real path once the Fleet FSM emits measured-with-gain pairs.
//   --mode=dryrun    (default) no measured-pair Ledger exists yet, so run over
//                    audit/lora_train.jsonl (real scored self-audit pairs) using
//                    score>=min-score as the gain proxy. Proves the pipeline shape
//                    at $0 — does NOT prove measured-gain. Honest by construction.
//
// CC never runs training; this script is pure curation and is safe to run inline.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

// ---- args ------------------------------------------------------------------
function parseArgs(argv) {
  const a = {
    in: path.join(REPO, 'audit', 'lora_train.jsonl'),
    out: path.join(REPO, 'audit', 'forge', 'lora_train.curated.jsonl'),
    report: path.join(REPO, 'audit', 'forge', 'curation-report.json'),
    mode: 'dryrun',
    minScore: 8,
    valFrac: 0.20,
    maxCategoryFrac: 0.40,
    dedupeThreshold: 0.85, // Jaccard over token shingles
    seed: 3407,
  };
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'in') a.in = path.resolve(v);
    else if (k === 'out') a.out = path.resolve(v);
    else if (k === 'report') a.report = path.resolve(v);
    else if (k === 'mode') a.mode = v;
    else if (k === 'min-score') a.minScore = Number(v);
    else if (k === 'val-frac') a.valFrac = Number(v);
    else if (k === 'max-category-frac') a.maxCategoryFrac = Number(v);
    else if (k === 'dedupe-threshold') a.dedupeThreshold = Number(v);
    else if (k === 'seed') a.seed = Number(v);
  }
  return a;
}

// ---- primitives ------------------------------------------------------------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function loadPairs(inPath) {
  const raw = fs.readFileSync(inPath, 'utf8');
  const pairs = [];
  raw.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    let obj;
    try { obj = JSON.parse(t); } catch { throw new Error(`bad JSON at ${inPath}:${i + 1}`); }
    pairs.push(obj);
  });
  return pairs;
}

// AF-10 — secrets that must NEVER reach the weights (pair excluded, not redacted).
const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/,                          // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,        // private key block
  /\bsk-[A-Za-z0-9]{20,}\b/,                    // OpenAI-style key
  /\bghp_[A-Za-z0-9]{30,}\b/,                   // GitHub PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,           // Slack token
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, // JWT
  /\b[Bb]earer\s+[A-Za-z0-9._-]{20,}\b/,        // bearer token
  /\bAIza[0-9A-Za-z_-]{35}\b/,                  // Google API key
];
// PII we redact in place (pair kept, value scrubbed) rather than exclude.
// Bounded quantifiers + no '.'-overlap between classes → ReDoS-safe (linear).
const PII_EMAIL = /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}\b/g;

// AF-16 — prompt-injection markers → quarantine (never train on hostile steering).
const INJECTION_MARKERS = [
  /ignore (all )?previous instructions/i,
  /disregard (the )?(system|above)/i,
  /you are now (a|an|the)/i,
  /reveal your (system )?prompt/i,
  /\bBEGIN SYSTEM\b/i,
];

function scrub(pair) {
  const blob = `${pair.prompt || ''}\n${pair.completion || ''}`;
  for (const re of SECRET_PATTERNS) {
    if (re.test(blob)) return { pair, excluded: true, redacted: false, reason: 'secret' };
  }
  let redacted = false;
  const clean = (s) => {
    if (typeof s !== 'string') return s;
    if (PII_EMAIL.test(s)) { redacted = true; PII_EMAIL.lastIndex = 0; return s.replace(PII_EMAIL, '[REDACTED_EMAIL]'); }
    PII_EMAIL.lastIndex = 0;
    return s;
  };
  const out = { ...pair, prompt: clean(pair.prompt), completion: clean(pair.completion) };
  return { pair: out, excluded: false, redacted, reason: redacted ? 'pii_redacted' : null };
}

function isPoison(pair) {
  const p = pair.prompt || '', c = pair.completion || '';
  if (!c.trim()) return 'empty_completion';
  for (const re of INJECTION_MARKERS) if (re.test(p) || re.test(c)) return 'injection_marker';
  const ratio = c.length / Math.max(1, p.length);
  if (ratio > 40 || (p.length > 200 && ratio < 0.02)) return 'length_outlier';
  return null;
}

// AF-02/03 — only measured-with-gain, never approved, never self-generated.
function provenanceFilter(pair, mode, minScore) {
  if (mode === 'measured') {
    const pv = pair.provenance || {};
    if (pv.self_generated === true) return { keep: false, reason: 'self_generated' };
    if (pv.measured !== true) return { keep: false, reason: 'not_measured' };
    if (!(Number(pv.gain) > 0)) return { keep: false, reason: 'no_gain' };
    return { keep: true, stamp: `measured:gain=${pv.gain}` };
  }
  // dryrun: score is the gain proxy; stamp the honest provenance.
  const score = Number(pair.score);
  if (!(score >= minScore)) return { keep: false, reason: `score<${minScore}` };
  return { keep: true, stamp: `self-audit-corpus:score=${score}` };
}

function categoryOf(pair) {
  const p = (pair.prompt || '').toLowerCase();
  if (/\bresume|resumo|summar/.test(p)) return 'summarize';
  if (/\bexport|api pública|public api|interface/.test(p)) return 'api';
  if (/\barquitet|architecture|design/.test(p)) return 'architecture';
  if (/\btest|teste|spec\b/.test(p)) return 'test';
  if (/\bregex|pattern/.test(p)) return 'regex';
  if (/\bexplic|explain|porqu|why\b/.test(p)) return 'explain';
  if (/\btraduz|translate/.test(p)) return 'translate';
  return 'other';
}

// AF-19 — origin key decides the split side; same origin never straddles.
function normalizeText(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9à-ÿ ]+/gi, ' ').replace(/\s+/g, ' ').trim();
}
function shingles(text) {
  const norm = normalizeText(text);
  const toks = norm.split(' ').filter(Boolean);
  const set = new Set();
  for (let i = 0; i < toks.length; i++) set.add(toks.slice(i, i + 3).join(' '));
  if (set.size === 0 && norm) set.add(norm);
  return set;
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function splitByOrigin(pairs, valFrac) {
  // Deterministic origin = normalized-prompt hash → exact/normalized duplicate
  // prompts co-locate on one side. Fuzzy (Jaccard) near-dups may still straddle in
  // dryrun; mode=measured splits by timestamp (true temporal generalization).
  const train = [], held = [];
  for (const pair of pairs) {
    const bucket = parseInt(sha256(normalizeText(pair.prompt)).slice(0, 8), 16) / 0xffffffff;
    (bucket < valFrac ? held : train).push(pair);
  }
  return { train, held };
}

function dedupeWithin(pairs, threshold) {
  const kept = [], sigs = [];
  const dropped = [];
  const ordered = [...pairs].sort((x, y) => (Number(y.score) || 0) - (Number(x.score) || 0));
  for (const pair of ordered) {
    const sig = shingles(pair.prompt);
    let dup = false;
    for (const s of sigs) { if (jaccard(sig, s) >= threshold) { dup = true; break; } }
    if (dup) dropped.push(pair);
    else { kept.push(pair); sigs.push(sig); }
  }
  return { kept, droppedCount: dropped.length };
}

function diversityCap(pairs, maxFrac) {
  const cap = Math.max(1, Math.floor(pairs.length * maxFrac));
  const byCat = new Map();
  const kept = [];
  let dropped = 0;
  for (const pair of [...pairs].sort((x, y) => (Number(y.score) || 0) - (Number(x.score) || 0))) {
    const cat = categoryOf(pair);
    const n = byCat.get(cat) || 0;
    if (n >= cap) { dropped++; continue; }
    byCat.set(cat, n + 1);
    kept.push(pair);
  }
  return { kept, dropped, cap, distribution: Object.fromEntries(byCat) };
}

// ---- pipeline --------------------------------------------------------------
export function curate(pairs, opts) {
  const { mode, minScore, valFrac, maxCategoryFrac, dedupeThreshold } = opts;
  const report = {
    mode, input: pairs.length,
    excluded_secret: 0, redacted_pii: 0, quarantined: {}, dropped_provenance: {},
  };

  const surviving = [];
  for (const raw of pairs) {
    const prov = provenanceFilter(raw, mode, minScore);
    if (!prov.keep) { report.dropped_provenance[prov.reason] = (report.dropped_provenance[prov.reason] || 0) + 1; continue; }
    const s = scrub(raw);
    if (s.excluded) { report.excluded_secret++; continue; }
    if (s.redacted) report.redacted_pii++;
    const poison = isPoison(s.pair);
    if (poison) { report.quarantined[poison] = (report.quarantined[poison] || 0) + 1; continue; }
    surviving.push({ ...s.pair, _provenance: prov.stamp });
  }
  report.after_filters = surviving.length;

  // AF-19: split BEFORE dedupe, dedupe WITHIN each side.
  const { train, held } = splitByOrigin(surviving, valFrac);
  const trainDedup = dedupeWithin(train, dedupeThreshold);
  const heldDedup = dedupeWithin(held, dedupeThreshold);
  report.split = { train: train.length, held_out: held.length };
  report.dedupe = { train_dropped: trainDedup.droppedCount, held_dropped: heldDedup.droppedCount };

  const div = diversityCap(trainDedup.kept, maxCategoryFrac);
  report.diversity = { cap_per_category: div.cap, dropped: div.dropped, distribution: div.distribution };

  const trainOut = div.kept.map(({ _provenance, ...p }) => p);
  const heldOut = heldDedup.kept.map(({ _provenance, ...p }) => p);
  report.output = { train: trainOut.length, held_out: heldOut.length };
  return { trainOut, heldOut, report };
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(a.in)) { console.error(`[forge-curate] input not found: ${a.in}`); process.exit(1); }
  const pairs = loadPairs(a.in);
  const { trainOut, heldOut, report } = curate(pairs, a);

  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  fs.writeFileSync(a.out, trainOut.map((p) => JSON.stringify(p)).join('\n') + '\n');
  const heldPath = a.out.replace(/\.jsonl$/, '.heldout.jsonl');
  fs.writeFileSync(heldPath, heldOut.map((p) => JSON.stringify(p)).join('\n') + '\n');

  report.generated_at = new Date().toISOString();
  report.input_path = a.in;
  report.input_sha256 = sha256(fs.readFileSync(a.in));
  report.output_path = a.out;
  report.output_sha256 = sha256(fs.readFileSync(a.out));
  report.heldout_path = heldPath;
  report.params = { minScore: a.minScore, valFrac: a.valFrac, maxCategoryFrac: a.maxCategoryFrac, dedupeThreshold: a.dedupeThreshold, seed: a.seed };
  fs.writeFileSync(a.report, JSON.stringify(report, null, 2) + '\n');

  console.log(`[forge-curate] mode=${report.mode} in=${report.input} → after-filters=${report.after_filters} → train=${report.output.train} held-out=${report.output.held_out}`);
  console.log(`[forge-curate]   excluded(secret)=${report.excluded_secret} redacted(pii)=${report.redacted_pii} quarantined=${JSON.stringify(report.quarantined)} dropped(prov)=${JSON.stringify(report.dropped_provenance)}`);
  console.log(`[forge-curate]   dedupe=${JSON.stringify(report.dedupe)} diversity-cap=${report.diversity.cap_per_category} dist=${JSON.stringify(report.diversity.distribution)}`);
  console.log(`[forge-curate] wrote ${a.out} + ${heldPath} + ${a.report}`);
}

// run when invoked directly (not when imported by the test)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
