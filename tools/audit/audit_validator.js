#!/usr/bin/env node
'use strict';

// audit_validator.js — Wave 23 Phase 2 worker.
//
// Cross-checks each T0 (Ollama) corpus summary against the ACTUAL file, using the
// T1 model (Haiku). The local summary can hallucinate exports, miss invariants, or
// fabricate test coverage; Haiku is more reliable but still fallible — so the audit
// is honest about both by recording a structured drift verdict per file. The files
// with the highest drift are the prime bug/staleness candidates fed to Phase 3.
//
// Like the corpus builder, this calls the model DIRECTLY (one bounded HTTPS call per
// file) rather than through the Agent-tool subagent path, so 366 validations cost a
// couple of dollars and never touch the orchestrator's context. Resumable by path+sha.
//
// CLI:
//   node audit_validator.js run [limit]   → validate corpus.jsonl → validation.jsonl
//   node audit_validator.js stats         → (re)compute validation_stats.json

const fs = require('fs');
const path = require('path');
const https = require('https');
const { redactObject } = require('./audit_pii_redactor.js');
const { REPO_ROOT, CORPUS_PATH } = require('./audit_corpus_builder.js');

const AUDIT_DIR = path.join(REPO_ROOT, 'audit');
const VALIDATION_PATH = path.join(AUDIT_DIR, 'validation.jsonl');
const VALIDATION_STATS_PATH = path.join(AUDIT_DIR, 'validation_stats.json');

const T1_MODEL = process.env.AUDIT_T1_MODEL || 'claude-haiku-4-5-20251001';
const MAX_CONTENT_CHARS = 6000;

// ── prompt ───────────────────────────────────────────────────────────────────

function validationPrompt(entry, content) {
  const body = content.length > MAX_CONTENT_CHARS ? content.slice(0, MAX_CONTENT_CHARS) : content;
  return [
    'Compara este RESUMO com o CONTEÚDO real do ficheiro e devolve SÓ JSON (sem markdown):',
    '{',
    '  "drift_level": "none|minor|major",',
    '  "evidence": ["discrepância específica 1", "..."],',
    '  "missing": ["facto importante que o resumo omitiu"],',
    '  "fabricated": ["claim do resumo que NÃO está no código"],',
    '  "score_0_to_10": <inteiro: exactidão do resumo>',
    '}',
    '',
    `FICHEIRO: ${entry.path}`,
    '--- RESUMO ---',
    entry.summary || '',
    '--- CONTEÚDO ---',
    body,
  ].join('\n');
}

// ── Haiku call ─────────────────────────────────────────────────────────────--

const VALIDATOR_SYSTEM = 'És um validador de código. Respondes EXCLUSIVAMENTE com um objecto JSON válido e compacto (sem markdown, sem ```), com arrays curtos (≤3 itens, frases breves). Nada antes ou depois do JSON.';

function callHaiku(prompt, { apiKey = process.env.ANTHROPIC_API_KEY, model = T1_MODEL, maxTokens = 1024, system = VALIDATOR_SYSTEM, timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('ANTHROPIC_API_KEY missing'));
    const body = JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] });
    const req = https.request(
      { hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (res.statusCode !== 200) return reject(new Error(`anthropic HTTP ${res.statusCode}: ${(j.error && j.error.message) || data.slice(0, 160)}`));
            const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
            resolve({ text, tokens_in: (j.usage || {}).input_tokens || 0, tokens_out: (j.usage || {}).output_tokens || 0, model: j.model || model });
          } catch (e) { reject(new Error(`anthropic parse: ${e.message}`)); }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('anthropic timeout')));
    req.write(body);
    req.end();
  });
}

/** Parse the Haiku JSON verdict, tolerating markdown fences / leading prose. Returns a
 *  normalized verdict; never throws (a parse miss becomes a flagged 'unparsed' verdict). */
function parseValidation(text) {
  let raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  try {
    const j = JSON.parse(raw);
    const lvl = ['none', 'minor', 'major'].includes(j.drift_level) ? j.drift_level : 'minor';
    let score = Number(j.score_0_to_10);
    if (!Number.isFinite(score)) score = null; else score = Math.max(0, Math.min(10, Math.round(score)));
    return {
      drift_level: lvl,
      evidence: Array.isArray(j.evidence) ? j.evidence.slice(0, 8) : [],
      missing: Array.isArray(j.missing) ? j.missing.slice(0, 8) : [],
      fabricated: Array.isArray(j.fabricated) ? j.fabricated.slice(0, 8) : [],
      score_0_to_10: score,
      parsed: true,
    };
  } catch {
    return { drift_level: 'minor', evidence: [], missing: [], fabricated: [], score_0_to_10: null, parsed: false };
  }
}

// ── io ─────────────────────────────────────────────────────────────────────--

function ensureAuditDir() { fs.mkdirSync(AUDIT_DIR, { recursive: true }); }

function loadCorpus() {
  if (!fs.existsSync(CORPUS_PATH)) return [];
  return fs.readFileSync(CORPUS_PATH, 'utf8').split('\n').filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function loadDoneKeys() {
  if (!fs.existsSync(VALIDATION_PATH)) return new Set();
  const done = new Set();
  for (const line of fs.readFileSync(VALIDATION_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (e.path && e.sha256) done.add(`${e.path}@${e.sha256}`); } catch { /* skip */ }
  }
  return done;
}

function appendValidation(entry) {
  ensureAuditDir();
  fs.appendFileSync(VALIDATION_PATH, JSON.stringify(redactObject(entry)) + '\n');
}

/** Validate one corpus entry. Reads the real file (by recorded path). llmFn is
 *  injectable for tests; defaults to the live Haiku call. */
async function validateEntry(corpusEntry, { llmFn = callHaiku } = {}) {
  const abs = path.join(REPO_ROOT, corpusEntry.path);
  let content = '';
  try { content = fs.readFileSync(abs, 'utf8'); } catch { content = ''; }
  const prompt = validationPrompt(corpusEntry, content);
  const r = await llmFn(prompt);
  const verdict = parseValidation(r.text);
  return {
    path: corpusEntry.path,
    sha256: corpusEntry.sha256,
    category: corpusEntry.category,
    summary: corpusEntry.summary,
    validation: verdict,
    tokens_in: r.tokens_in || 0,
    tokens_out: r.tokens_out || 0,
    validator_model: r.model || T1_MODEL,
  };
}

// ── stats ──────────────────────────────────────────────────────────────────--

function driftHistogram(validations) {
  const hist = { none: 0, minor: 0, major: 0, unparsed: 0 };
  let scoreSum = 0, scoreN = 0, tin = 0, tout = 0;
  for (const v of validations) {
    const val = v.validation || {};
    if (val.parsed === false) hist.unparsed += 1;
    hist[val.drift_level] = (hist[val.drift_level] || 0) + 1;
    if (typeof val.score_0_to_10 === 'number') { scoreSum += val.score_0_to_10; scoreN += 1; }
    tin += v.tokens_in || 0; tout += v.tokens_out || 0;
  }
  const top = validations
    .filter((v) => v.validation && typeof v.validation.score_0_to_10 === 'number')
    .sort((a, b) => a.validation.score_0_to_10 - b.validation.score_0_to_10)
    .slice(0, 20)
    .map((v) => ({ path: v.path, score: v.validation.score_0_to_10, drift: v.validation.drift_level }));
  return {
    total: validations.length,
    histogram: hist,
    avg_score: scoreN ? +(scoreSum / scoreN).toFixed(2) : null,
    scored_files: scoreN,
    top20_highest_drift: top,
    total_tokens_in: tin,
    total_tokens_out: tout,
  };
}

function computeValidationStats() {
  if (!fs.existsSync(VALIDATION_PATH)) return null;
  const vals = fs.readFileSync(VALIDATION_PATH, 'utf8').split('\n').filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const stats = driftHistogram(vals);
  ensureAuditDir();
  fs.writeFileSync(VALIDATION_STATS_PATH, JSON.stringify(stats, null, 2));
  return stats;
}

async function run(limit) {
  const corpus = loadCorpus();
  const done = loadDoneKeys();
  const todo = corpus.filter((e) => !done.has(`${e.path}@${e.sha256}`));
  const slice = limit ? todo.slice(0, limit) : todo;
  process.stderr.write(`[validate] corpus=${corpus.length} done=${done.size} todo=${slice.length}\n`);
  let ok = 0, fail = 0;
  for (let i = 0; i < slice.length; i += 1) {
    try {
      const v = await validateEntry(slice[i]);
      appendValidation(v);
      ok += 1;
      const sc = v.validation.score_0_to_10;
      process.stderr.write(`[${i + 1}/${slice.length}] ✓ ${v.path} drift=${v.validation.drift_level} score=${sc}\n`);
    } catch (e) {
      fail += 1;
      process.stderr.write(`[${i + 1}/${slice.length}] ✗ ${slice[i].path} — ${e.message}\n`);
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  const stats = computeValidationStats();
  process.stderr.write(`[validate] done ok=${ok} fail=${fail} avg_score=${stats ? stats.avg_score : '?'}\n`);
}

module.exports = {
  validationPrompt, callHaiku, parseValidation, validateEntry,
  driftHistogram, computeValidationStats, loadCorpus,
  VALIDATION_PATH, VALIDATION_STATS_PATH,
};

if (require.main === module) {
  const cmd = process.argv[2] || 'run';
  if (cmd === 'run') run(process.argv[3] ? parseInt(process.argv[3], 10) : 0).then(() => process.exit(0));
  else if (cmd === 'stats') process.stdout.write(JSON.stringify(computeValidationStats(), null, 2) + '\n');
  else { process.stderr.write('usage: audit_validator.js {run [limit]|stats}\n'); process.exit(2); }
}
