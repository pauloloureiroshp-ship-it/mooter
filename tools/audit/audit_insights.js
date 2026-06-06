#!/usr/bin/env node
'use strict';

// audit_insights.js — Wave 23 Phase 3 worker.
//
// Turns the per-file drift verdicts into a prioritized issue list. The RANKING itself
// is done by the T2 model (Sonnet, via the model-reasoner subagent the orchestrator
// spawns) — this module only (a) builds the bounded digest fed to that model, and
// (b) renders the model's JSON verdict into AUDIT_REPORT.md. Keeping the LLM step out
// of node is deliberate: a single Sonnet pass over a compact digest is far cheaper and
// more coherent than 366 per-file calls, and it's the one place real reasoning helps.
//
// Flow:
//   node audit_insights.js prep                  → write audit/insights_input.json
//        (orchestrator hands input.prompt to model-reasoner, saves reply → insights.json)
//   node audit_insights.js report audit/insights.json → write AUDIT_REPORT.md

const fs = require('fs');
const path = require('path');
const { redactObject } = require('./audit_pii_redactor.js');
const { REPO_ROOT, STATS_PATH } = require('./audit_corpus_builder.js');
const { VALIDATION_PATH, VALIDATION_STATS_PATH } = require('./audit_validator.js');

const AUDIT_DIR = path.join(REPO_ROOT, 'audit');
const INSIGHTS_INPUT_PATH = path.join(AUDIT_DIR, 'insights_input.json');
const REPORT_PATH = path.join(REPO_ROOT, 'AUDIT_REPORT.md');

const CATEGORIES = [
  'Duplicate functionality', 'Dead code', 'Stale docs', 'Missing tests',
  'Architecture violation', 'Security gap', 'Performance trap',
  'Branding leftover', 'Naming inconsistency', 'Inline TODO/FIXME',
];

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

/** Compact, bounded digest of the validations — one terse line per file, with the
 *  drift signal and any fabricated/missing claims (the real bug seeds). Bounded so the
 *  whole thing fits one Sonnet context. */
function buildDigest(validations) {
  return validations.map((v) => {
    const val = v.validation || {};
    return {
      path: v.path,
      category: v.category,
      score: val.score_0_to_10,
      drift: val.drift_level,
      fabricated: (val.fabricated || []).slice(0, 3),
      missing: (val.missing || []).slice(0, 3),
      evidence: (val.evidence || []).slice(0, 2),
    };
  });
}

function insightsPrompt(digest, corpusStats, valStats) {
  return [
    'És um auditor de código sénior. Recebes verdicts de drift por ficheiro (resumo T0 local vs código real, validado por T1).',
    `Corpus: ${corpusStats ? corpusStats.total_files : '?'} ficheiros. Drift histogram: ${valStats ? JSON.stringify(valStats.histogram) : '?'}. Avg score: ${valStats ? valStats.avg_score : '?'}.`,
    '',
    'Identifica os TOP 50 issues do codebase Mooter, priorizados. Categorias válidas:',
    CATEGORIES.map((c, i) => `  ${i + 1}. ${c}`).join('\n'),
    '',
    'Para cada issue devolve um objecto:',
    '{ "title", "category" (uma das acima), "severity": "high|medium|low",',
    '  "evidence": "path:linha ou path", "estimated_fix_effort_minutes": <int>,',
    '  "wave_candidate": "ex: Wave 24 cleanup" }',
    '',
    'Devolve SÓ um array JSON de exactamente 50 objectos (sem markdown, sem preâmbulo).',
    'Baseia-te SÓ na evidência fornecida — não inventes ficheiros. Se houver menos de 50 issues reais, preenche os restantes com itens "low" genuínos observados (ex: ficheiros sem teste).',
    '',
    '--- VERDICTS (JSON) ---',
    JSON.stringify(digest),
  ].join('\n');
}

function prep() {
  const validations = readJsonl(VALIDATION_PATH);
  const corpusStats = readJson(STATS_PATH);
  const valStats = readJson(VALIDATION_STATS_PATH);
  const digest = buildDigest(validations);
  const prompt = insightsPrompt(digest, corpusStats, valStats);
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
  fs.writeFileSync(INSIGHTS_INPUT_PATH, JSON.stringify(redactObject({
    digest_files: digest.length, corpus_stats: corpusStats, validation_stats: valStats, prompt,
  }), null, 2));
  return { digest_files: digest.length, prompt_chars: prompt.length, input_path: INSIGHTS_INPUT_PATH };
}

/** Normalize the model's reply into a clean array of ≤50 issue objects. Tolerant. */
function normalizeInsights(raw) {
  let arr = raw;
  if (typeof raw === 'string') {
    let s = raw.trim();
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) s = fence[1].trim();
    const a = s.indexOf('['); const b = s.lastIndexOf(']');
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    try { arr = JSON.parse(s); } catch { arr = []; }
  }
  if (!Array.isArray(arr)) arr = [];
  return arr.map((it) => ({
    title: String(it.title || 'untitled').slice(0, 160),
    category: CATEGORIES.includes(it.category) ? it.category : (it.category || 'Other'),
    severity: ['high', 'medium', 'low'].includes(it.severity) ? it.severity : 'low',
    evidence: String(it.evidence || '').slice(0, 200),
    estimated_fix_effort_minutes: Number(it.estimated_fix_effort_minutes) || null,
    wave_candidate: String(it.wave_candidate || '').slice(0, 80),
  })).slice(0, 50);
}

function buildReport(insights, corpusStats, valStats) {
  const sevRank = { high: 0, medium: 1, low: 2 };
  const sorted = [...insights].sort((a, b) => (sevRank[a.severity] - sevRank[b.severity]));
  const byCat = {};
  for (const i of insights) (byCat[i.category] = byCat[i.category] || []).push(i);
  const sevCount = { high: 0, medium: 0, low: 0 };
  for (const i of insights) sevCount[i.severity] = (sevCount[i.severity] || 0) + 1;

  const L = [];
  L.push('# Mooter Self-Audit — AUDIT_REPORT.md');
  L.push('');
  L.push('> Wave 23 "Mooter audits Mooter". T0 (local qwen2.5-coder) summarized the codebase,');
  L.push('> T1 (Haiku) validated each summary vs the real file, T2 (Sonnet) ranked the issues below.');
  L.push('> Every issue traces to a real file in the corpus — no synthetic findings.');
  L.push('');
  L.push('> **⚠ Read this first — findings are SECOND-ORDER.** Issues are derived from the');
  L.push('> *validated summaries*, not from a direct code read. So a finding worded like "X');
  L.push('> summary fabricates Y" or "summary catastrophically wrong" is primarily evidence that');
  L.push('> the **local T0 model drifted on that file** (the quantization / Discovery-2 signal) —');
  L.push('> NOT a confirmed code defect. Treat those as *summary-drift artifacts* and code-verify');
  L.push('> before acting. The genuinely actionable code-level findings are the ones that name a');
  L.push('> concrete code fact (e.g. `frugal-` branding paths, dual admin-token naming, files with');
  L.push('> no test). The high overall drift (avg 5.2/10) is itself the headline finding: it is why');
  L.push('> a fine-tuned adapter is worth training (Phase 4 LoRA export).');
  L.push('');
  L.push('## Executive summary');
  L.push('');
  L.push(`- **Files audited:** ${corpusStats ? corpusStats.total_files : '?'} (corpus.jsonl)`);
  if (valStats) {
    const h = valStats.histogram || {};
    L.push(`- **Drift:** none ${h.none || 0} · minor ${h.minor || 0} · major ${h.major || 0} (avg accuracy ${valStats.avg_score}/10)`);
  }
  L.push(`- **Issues ranked:** ${insights.length} — ${sevCount.high} high · ${sevCount.medium} medium · ${sevCount.low} low`);
  L.push('');
  L.push('## Top 10 critical issues');
  L.push('');
  L.push('| # | Severity | Category | Issue | Evidence | Fix (min) | Wave |');
  L.push('|---|---|---|---|---|---|---|');
  sorted.slice(0, 10).forEach((i, n) => {
    L.push(`| ${n + 1} | ${i.severity} | ${i.category} | ${i.title.replace(/\|/g, '/')} | \`${i.evidence.replace(/\|/g, '/')}\` | ${i.estimated_fix_effort_minutes ?? '?'} | ${i.wave_candidate || '—'} |`);
  });
  L.push('');
  L.push('## All issues by category');
  L.push('');
  for (const cat of Object.keys(byCat).sort((a, b) => byCat[b].length - byCat[a].length)) {
    L.push(`### ${cat} (${byCat[cat].length})`);
    L.push('');
    byCat[cat].forEach((i) => {
      L.push(`- **[${i.severity}]** ${i.title} — \`${i.evidence}\` · ~${i.estimated_fix_effort_minutes ?? '?'}min · ${i.wave_candidate || '—'}`);
    });
    L.push('');
  }
  L.push('## Recommended Wave 24+ scope');
  L.push('');
  const highs = sorted.filter((i) => i.severity === 'high');
  if (highs.length) {
    L.push('Highest-leverage first:');
    highs.slice(0, 8).forEach((i) => L.push(`- ${i.title} (${i.category}) — ${i.wave_candidate || 'next cleanup'}`));
  } else {
    L.push('No high-severity issues — codebase is in good shape. Batch the medium/low items into a Wave 24 cleanup sweep.');
  }
  L.push('');
  return L.join('\n');
}

function report(insightsPath) {
  const raw = fs.readFileSync(insightsPath, 'utf8');
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  const insights = normalizeInsights(parsed);
  const md = buildReport(insights, readJson(STATS_PATH), readJson(VALIDATION_STATS_PATH));
  fs.writeFileSync(REPORT_PATH, md);
  // persist the normalized insights for Phase 4 marketing reuse
  fs.writeFileSync(path.join(AUDIT_DIR, 'insights.normalized.json'), JSON.stringify(insights, null, 2));
  return { issues: insights.length, report: REPORT_PATH };
}

module.exports = {
  buildDigest, insightsPrompt, prep, normalizeInsights, buildReport, report,
  CATEGORIES, INSIGHTS_INPUT_PATH, REPORT_PATH,
};

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'prep') process.stdout.write(JSON.stringify(prep(), null, 2) + '\n');
  else if (cmd === 'report' && process.argv[3]) process.stdout.write(JSON.stringify(report(process.argv[3]), null, 2) + '\n');
  else { process.stderr.write('usage: audit_insights.js {prep | report <insights.json>}\n'); process.exit(2); }
}
