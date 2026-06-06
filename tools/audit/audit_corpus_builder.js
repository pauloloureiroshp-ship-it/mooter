#!/usr/bin/env node
'use strict';

// audit_corpus_builder.js — Wave 23 Phase 1 worker.
//
// Builds the self-audit corpus: a 5-line PT-PT summary of every source/doc file in
// the scan-list, produced by the LOCAL T0 model (qwen3:30b via Ollama) so the corpus
// is genuinely "summarized by the local tier we ship", at ~$0 and without burning the
// orchestrator's context. (The Agent-tool `local-summarizer` path actually executes on
// cloud Haiku when an API key is present — Wave 23 Discovery 2 — so Phase 4 quantifies
// that divergence on a controlled sample rather than paying for 400 cloud spawns here.)
//
// Resumable: each entry keys on the file's sha256, so a re-run skips files already in
// corpus.jsonl. Every string written is piped through audit_pii_redactor first.
//
// CLI:
//   node audit_corpus_builder.js scan          → print the scan-list as JSON (no LLM)
//   node audit_corpus_builder.js run [limit]    → summarize, append to corpus.jsonl
//   node audit_corpus_builder.js stats          → (re)compute corpus_stats.json

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { redact, redactObject } = require('./audit_pii_redactor.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const AUDIT_DIR = path.join(REPO_ROOT, 'audit');
const CORPUS_PATH = path.join(AUDIT_DIR, 'corpus.jsonl');
const STATS_PATH = path.join(AUDIT_DIR, 'corpus_stats.json');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://host.docker.internal:11434';
// qwen2.5-coder:7b is the project's canonical local model (Wave 12 Gate A: keep-qwen2.5-coder)
// and — unlike qwen3:30b — is NOT a reasoning model, so it emits the clean 5-line summary
// instead of leaking chain-of-thought into the corpus. Honest, fast (~4s/file), $0.
const T0_MODEL = process.env.AUDIT_T0_MODEL || 'qwen2.5-coder:7b';
const MAX_CONTENT_CHARS = 6000; // bound the prompt; note truncation in the entry

// ── scan-list ────────────────────────────────────────────────────────────────

// Categories → list of {dir, recursive, exts, rootOnly}. Mirrors the brief, but hub
// is `.js` (worker.js + lib/routes/jobs), not the hub/src TypeScript the brief guessed.
const SCAN_SPEC = [
  { category: 'router', dir: 'tools/router', recursive: false, exts: ['.js'] },
  { category: 'audit', dir: 'tools/audit', recursive: false, exts: ['.js'] },
  { category: 'hub', dir: 'hub', recursive: true, exts: ['.js'], exclude: ['node_modules'] },
  { category: 'landing-app', dir: 'landing/app', recursive: true, exts: ['.tsx'], exclude: ['node_modules', '.next'] },
  { category: 'landing-components', dir: 'landing/components', recursive: true, exts: ['.tsx'], exclude: ['node_modules'] },
  { category: 'strategy', dir: 'docs/strategy', recursive: false, exts: ['.md'] },
  { category: 'root-doc', dir: '.', recursive: false, exts: ['.md'] },
];

function walk(absDir, { recursive, exts, exclude = [] }) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(absDir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (exclude.includes(e.name)) continue;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      if (recursive) out.push(...walk(abs, { recursive, exts, exclude }));
    } else if (e.isFile() && exts.includes(path.extname(e.name))) {
      out.push(abs);
    }
  }
  return out;
}

function sha256File(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

/** Deterministic scan-list, sorted by relative path for stable ordering. */
function buildScanList() {
  const seen = new Set();
  const files = [];
  for (const spec of SCAN_SPEC) {
    const absDir = path.join(REPO_ROOT, spec.dir);
    for (const abs of walk(absDir, spec)) {
      const rel = path.relative(REPO_ROOT, abs);
      if (seen.has(rel)) continue;
      seen.add(rel);
      let bytes = 0, sha = '';
      try { bytes = fs.statSync(abs).size; sha = sha256File(abs); } catch { continue; }
      files.push({ path: rel, abspath: abs, sha256: sha, bytes, category: spec.category });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

// ── prompt ───────────────────────────────────────────────────────────────────

function summaryPrompt(relPath, content) {
  const truncated = content.length > MAX_CONTENT_CHARS;
  const body = truncated ? content.slice(0, MAX_CONTENT_CHARS) : content;
  return [
    `Resume o ficheiro \`${relPath}\` em EXACTAMENTE 5 linhas, em PT-PT.`,
    'Formato estrito (uma linha cada, sem numeração extra, sem preâmbulo):',
    'linha 1: propósito (para que serve)',
    'linha 2: exports / API pública principal',
    'linha 3: dependências (imports + runtime)',
    'linha 4: invariantes / claims não-óbvios',
    'linha 5: cobertura de testes (nomeia o test file se referenciado, senão "sem teste conhecido")',
    truncated ? `\n[NOTA: conteúdo truncado a ${MAX_CONTENT_CHARS} chars de ${content.length}]` : '',
    '\n--- CONTEÚDO ---',
    body,
  ].join('\n');
}

// ── Ollama ───────────────────────────────────────────────────────────────────

/** POST /api/generate (stream:false). Resolves {text, tokens_in, tokens_out,
 *  duration_ms, model} or rejects on transport/HTTP error. think:false keeps qwen3
 *  from emitting reasoning tokens we'd have to strip. */
function ollamaGenerate(prompt, { model = T0_MODEL, host = OLLAMA_HOST, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL('/api/generate', host);
    const payload = JSON.stringify({
      model, prompt, stream: false, think: false,
      keep_alive: -1,
      options: { temperature: 0.2, num_predict: 320 },
    });
    const req = http.request(
      { hostname: u.hostname, port: u.port || 11434, path: u.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`ollama HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          try {
            const j = JSON.parse(data);
            resolve({
              text: String(j.response || '').trim(),
              tokens_in: Number(j.prompt_eval_count) || 0,
              tokens_out: Number(j.eval_count) || 0,
              duration_ms: j.total_duration ? Math.round(Number(j.total_duration) / 1e6) : 0,
              model: j.model || model,
            });
          } catch (e) { reject(new Error(`ollama parse: ${e.message}`)); }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('ollama timeout')));
    req.write(payload);
    req.end();
  });
}

// ── corpus io ──────────────────────────────────────────────────────────────--

function ensureAuditDir() { fs.mkdirSync(AUDIT_DIR, { recursive: true }); }

/** sha256 set of files already summarized (resume support). */
function loadDoneShas() {
  if (!fs.existsSync(CORPUS_PATH)) return new Set();
  const done = new Set();
  for (const line of fs.readFileSync(CORPUS_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line); if (e.sha256) done.add(e.sha256); } catch { /* skip */ }
  }
  return done;
}

function appendCorpus(entry) {
  ensureAuditDir();
  fs.appendFileSync(CORPUS_PATH, JSON.stringify(redactObject(entry)) + '\n');
}

/** Summarize one file → corpus entry (NOT yet redacted; appendCorpus redacts). */
async function summarizeFile(file) {
  const content = fs.readFileSync(file.abspath, 'utf8');
  const prompt = summaryPrompt(file.path, content);
  const r = await ollamaGenerate(prompt);
  return {
    path: file.path,
    sha256: file.sha256,
    category: file.category,
    bytes: file.bytes,
    summary: r.text,
    actual_exec_tier: 'T0',
    actual_model: r.model,
    tokens_in: r.tokens_in,
    tokens_out: r.tokens_out,
    duration_ms: r.duration_ms,
    truncated: content.length > MAX_CONTENT_CHARS,
  };
}

// ── stats ──────────────────────────────────────────────────────────────────--

function computeStats() {
  if (!fs.existsSync(CORPUS_PATH)) return null;
  const entries = fs.readFileSync(CORPUS_PATH, 'utf8').split('\n')
    .filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  const byTier = {}; const byCat = {};
  let tin = 0, tout = 0, dur = 0;
  for (const e of entries) {
    const tier = e.actual_exec_tier || 'unknown';
    byTier[tier] = byTier[tier] || { files: 0, tokens_in: 0, tokens_out: 0 };
    byTier[tier].files += 1;
    byTier[tier].tokens_in += e.tokens_in || 0;
    byTier[tier].tokens_out += e.tokens_out || 0;
    byCat[e.category] = (byCat[e.category] || 0) + 1;
    tin += e.tokens_in || 0; tout += e.tokens_out || 0; dur += e.duration_ms || 0;
  }
  // T0 (Ollama) is $0. T1+ would carry cost — computed in audit_benchmark from pricing.
  const stats = {
    total_files: entries.length,
    by_tier: byTier,
    by_category: byCat,
    total_tokens_in: tin,
    total_tokens_out: tout,
    total_duration_ms: dur,
    cost_actual_usd: 0, // all-local T0
    generated_with: T0_MODEL,
    note: 'T0 local corpus; cloud-Haiku divergence quantified on a sample in Phase 4.',
  };
  ensureAuditDir();
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
  return stats;
}

// ── runner ─────────────────────────────────────────────────────────────────--

async function run(limit) {
  const list = buildScanList();
  const done = loadDoneShas();
  const todo = list.filter((f) => !done.has(f.sha256));
  const slice = limit ? todo.slice(0, limit) : todo;
  process.stderr.write(`[corpus] ${list.length} files, ${done.size} done, ${slice.length} to do\n`);
  let ok = 0, fail = 0;
  for (let i = 0; i < slice.length; i += 1) {
    const f = slice[i];
    try {
      const entry = await summarizeFile(f);
      appendCorpus(entry);
      ok += 1;
      process.stderr.write(`[${i + 1}/${slice.length}] ✓ ${f.path} (${entry.tokens_out}t/${entry.duration_ms}ms)\n`);
    } catch (e) {
      fail += 1;
      process.stderr.write(`[${i + 1}/${slice.length}] ✗ ${f.path} — ${e.message}\n`);
    }
    await new Promise((r) => setTimeout(r, 100)); // rate limit
  }
  const stats = computeStats();
  process.stderr.write(`[corpus] done ok=${ok} fail=${fail} total=${stats ? stats.total_files : '?'}\n`);
}

module.exports = {
  buildScanList, summaryPrompt, ollamaGenerate, summarizeFile,
  loadDoneShas, appendCorpus, computeStats,
  REPO_ROOT, CORPUS_PATH, STATS_PATH, SCAN_SPEC, redact,
};

if (require.main === module) {
  const cmd = process.argv[2] || 'scan';
  if (cmd === 'scan') {
    const list = buildScanList().map(({ abspath, ...rest }) => rest);
    process.stdout.write(JSON.stringify({ count: list.length, files: list }, null, 2) + '\n');
  } else if (cmd === 'run') {
    run(process.argv[3] ? parseInt(process.argv[3], 10) : 0).then(() => process.exit(0));
  } else if (cmd === 'stats') {
    process.stdout.write(JSON.stringify(computeStats(), null, 2) + '\n');
  } else {
    process.stderr.write('usage: audit_corpus_builder.js {scan|run [limit]|stats}\n');
    process.exit(2);
  }
}
