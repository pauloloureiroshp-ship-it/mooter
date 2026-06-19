'use strict';

// run-bench.js — score moo-risk on the INDEPENDENT adversarial set (First Magic — FASE 5).
//
// Mirrors the Arm C scoring (predicted-risk == escalate, proxy the harness expressed as
// tier==T3) so the number is comparable to the classify.js baseline ON THE SAME held-out
// set. Reports moo-risk (prompt layer) vs classify.js vs trivial baselines, per-bucket TPR/
// FPR/Youden, a disjointness check against the design set, and a coverage-gap list (which
// UNKNOWN destructive ops moo-risk missed — actionable, but DO NOT tune against this set).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { generate } = require('./generator');

const ROUTER = path.join(__dirname, '..', '..', 'tools', 'router');
const { assess } = require(path.join(ROUTER, 'moo-risk'));
const { HOLDOUT } = require(path.join(ROUTER, 'moo-risk-validate'));
const FIFTY = path.join(__dirname, '..', 'value-benchmark-2026-05', 'data', 'risk-axis-prompts.jsonl');

// ── predictors (each → boolean "treat as risk") ─────────────────────────────
const mooRisk = (p) => { const a = assess(p).action; return a === 'escalate_T3' || a === 'escalate_human'; };

const RISK_KW = ['env', 'deploy', 'migration', 'production', 'prod ', 'secret', 'credential', 'force push', 'drop table', 'rm -rf', 'rollback', 'merge to main', 'release', 'destructive', 'pre-merge', 'pre-deploy', 'audit', 'compliance', 'outage', 'downtime', 'shard', 'rotate', 'decommission', 'replat', 'incident'];
function tenlineTier(p) {
  const L = p.length, low = p.toLowerCase();
  const risk = RISK_KW.reduce((n, k) => n + (low.includes(k) ? 1 : 0), 0);
  if (risk >= 2) return 'T3';
  if (risk >= 1 && L > 200) return 'T3';
  if (L < 80) return 'T0'; if (L < 300) return 'T1'; if (L < 800) return 'T2'; return 'T3';
}
const tenline = (p) => tenlineTier(p) === 'T3';

function classifyTier(p) {
  try {
    const r = spawnSync('node', [path.join(ROUTER, 'classify.js'), p], { encoding: 'utf8', timeout: 20000 });
    return JSON.parse(r.stdout).tier;
  } catch { return 'ERR'; }
}

// ── metrics (overall + per bucket), identical math to arm_c_risk.py ─────────
function score(rows, predict) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const bt = {}, bf = {};
  for (const r of rows) {
    const pred = predict(r.prompt), act = r.is_risk, b = r.bucket;
    if (act && pred) { tp++; (bt[b] = bt[b] || [0, 0])[0]++; bt[b][1]++; }
    else if (act && !pred) { fn++; (bt[b] = bt[b] || [0, 0])[1]++; }
    else if (!act && pred) { fp++; (bf[b] = bf[b] || [0, 0])[0]++; bf[b][1]++; }
    else { tn++; (bf[b] = bf[b] || [0, 0])[1]++; }
  }
  const tpr = (tp + fn) ? tp / (tp + fn) : null;
  const fpr = (fp + tn) ? fp / (fp + tn) : null;
  const ratio = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v[1] ? +(v[0] / v[1]).toFixed(2) : null]));
  return { tp, fp, fn, tn, tpr, fpr, youden: (tpr != null && fpr != null) ? +(tpr - fpr).toFixed(3) : null, per_bucket_tpr: ratio(bt), per_bucket_fpr: ratio(bf) };
}

// ── disjointness: exact-match AND near-duplicate (token Jaccard) vs design ──
// Exact-match==0 alone is weak (a near-paraphrase could still leak). We also report the
// per-bucket nearest-neighbour token Jaccard so the independence claim is auditable — and
// so we can PROVE the RISK buckets (which drive recall) are not paraphrases of design risk
// prompts (that would inflate recall). A high Jaccard in a SAFE bucket only makes FPR harsher.
function tokens(s) { return new Set(String(s).toLowerCase().match(/[a-z0-9]+/g) || []); }
function jaccard(a, b) { const A = tokens(a), B = tokens(b); let inter = 0; for (const t of A) if (B.has(t)) inter++; const uni = A.size + B.size - inter; return uni ? inter / uni : 0; }

function disjointness(rows) {
  const design = [];
  try { fs.readFileSync(FIFTY, 'utf8').split('\n').filter(Boolean).forEach((l) => design.push(JSON.parse(l).prompt.trim())); } catch { /* */ }
  (HOLDOUT || []).forEach((h) => design.push(h.prompt.trim()));
  const designSet = new Set(design);
  const exact = rows.filter((r) => designSet.has(r.prompt.trim())).length;
  const maxJByBucket = {};
  let maxJRisk = 0;
  for (const r of rows) {
    let mj = 0;
    for (const d of design) { const j = jaccard(r.prompt, d); if (j > mj) mj = j; }
    if ((maxJByBucket[r.bucket] = Math.max(maxJByBucket[r.bucket] || 0, mj)) === mj) maxJByBucket[r.bucket] = +mj.toFixed(2);
    if (r.is_risk && mj > maxJRisk) maxJRisk = mj;
  }
  return { design_size: designSet.size, generated: rows.length, exact_overlap: exact, max_jaccard_by_bucket: maxJByBucket, max_jaccard_risk_buckets: +maxJRisk.toFixed(2) };
}

function run(opts = {}) {
  const rows = generate(opts);
  const dj = disjointness(rows);
  const withClassify = opts.classify !== false;

  const baselines = { moo_risk: mooRisk, tenline_keyword: tenline, always_T3: () => true, always_T0: () => false };
  if (withClassify) baselines.classify_js = (p) => classifyTier(p) === 'T3';

  const metrics = {};
  for (const [name, fn] of Object.entries(baselines)) metrics[name] = score(rows, fn);

  // coverage gaps: UNKNOWN-op risky prompts moo-risk missed (false negatives)
  const gaps = rows.filter((r) => r.bucket === 'disguised-unknown' && !mooRisk(r.prompt))
    .map((r) => r.prompt.replace(/^.*?(shred|mkfs|dd |chmod|terraform|kubectl|helm|aws s3|gcloud|git branch|docker|npm unpublish|redis-cli|DROP ROLE|> \/dev).*/i, '$1').trim());
  const gapCounts = gaps.reduce((m, g) => (m[g] = (m[g] || 0) + 1, m), {});

  return { as_of: opts.as_of || null, seed: Number.isFinite(opts.seed) ? opts.seed : 20260619, n: rows.length, disjointness: dj, metrics, coverage_gaps: gapCounts, rows: opts.includeRows ? rows : undefined };
}

module.exports = { run, score, mooRisk, tenline };

if (require.main === module) {
  const fullRun = !process.argv.includes('--no-classify');
  const res = run({ classify: fullRun });
  const pct = (x) => (x == null ? '  — ' : (x * 100).toFixed(1).padStart(5) + '%');
  process.stdout.write('\n  moo-risk — INDEPENDENT adversarial benchmark (held-out, out-of-design)\n');
  process.stdout.write(`  n=${res.n} · seed=${res.seed} · disjoint from design: exact_overlap=${res.disjointness.exact_overlap} (must be 0)\n`);
  process.stdout.write('  ' + '-'.repeat(64) + '\n');
  process.stdout.write(`  ${'baseline'.padEnd(18)}${'TPR'.padStart(8)}${'FPR'.padStart(8)}${'Youden'.padStart(9)}\n`);
  for (const [b, m] of Object.entries(res.metrics).sort((a, c) => (c[1].youden ?? -2) - (a[1].youden ?? -2))) {
    process.stdout.write(`  ${b.padEnd(18)}${pct(m.tpr)}${pct(m.fpr)}${(m.youden == null ? '—' : m.youden.toFixed(3)).padStart(9)}\n`);
  }
  const mr = res.metrics.moo_risk;
  process.stdout.write('\n  moo-risk per-bucket TPR (recall): ' + JSON.stringify(mr.per_bucket_tpr) + '\n');
  process.stdout.write('  moo-risk per-bucket FPR (alarm) : ' + JSON.stringify(mr.per_bucket_fpr) + '\n');
  process.stdout.write('\n  COVERAGE GAPS (UNKNOWN destructive ops moo-risk missed — honest, do NOT tune against this set):\n');
  const gaps = Object.entries(res.coverage_gaps).sort((a, b) => b[1] - a[1]);
  if (!gaps.length) process.stdout.write('    (none)\n');
  for (const [op, c] of gaps) process.stdout.write(`    ✗ ${op}  ×${c}\n`);
  process.stdout.write(`\n  disjointness: exact_overlap=${res.disjointness.exact_overlap}, max token-Jaccard vs design — risk buckets=${res.disjointness.max_jaccard_risk_buckets}, by bucket=${JSON.stringify(res.disjointness.max_jaccard_by_bucket)}\n\n`);

  // persist the canonical report ONLY on a full run (with the classify.js baseline), so a
  // fast --no-classify run can never partially clobber REPORT.json.
  if (fullRun) {
    try {
      fs.writeFileSync(path.join(__dirname, 'REPORT.json'), JSON.stringify(run({ classify: true, as_of: '2026-06-19', includeRows: true }), null, 2) + '\n');
      process.stdout.write('  → wrote REPORT.json (full run)\n\n');
    } catch (e) { process.stdout.write('  (report write skipped: ' + e.message + ')\n'); }
  } else {
    process.stdout.write('  (--no-classify: REPORT.json NOT overwritten; run without the flag to refresh the canonical artifact)\n\n');
  }
}
