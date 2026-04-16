#!/usr/bin/env node
/**
 * similarity.js — KNN retrospective lookup over prompt embeddings.
 *
 * Per METHODOLOGY §5.2 and §12.1(b): given a prompt, find the K most
 * similar historical prompts and report how they were classified + how
 * they performed (quality signals). Used for:
 *   - Signature-based override: if 3+ similar prompts all rated good at
 *     tier X, bias toward X even if classifier suggests otherwise
 *   - Drift detection: if similar prompts were classified differently
 *     across versions, flag as potential regression
 *
 * Embedding model: nomic-embed-text (Ollama, 768d, free, local).
 * Cache: embedding-cache.jsonl (append-only, deduped by prompt hash).
 * Lookup: cosine similarity, sub-ms on 10k vectors in memory.
 *
 * Usage:
 *   node similarity.js "fix the websocket bug"        # top-5 similar
 *   node similarity.js --build                        # embed all unembedded from decisions.log
 *   node similarity.js --build --limit 200            # cap embeddings per run
 *   node similarity.js --stats                        # cache stats
 *   node similarity.js --k 10 "my prompt"             # top-10
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const CACHE_PATH = path.join(ROUTER_DIR, 'embedding-cache.jsonl');
const EMBED_MODEL = 'nomic-embed-text';

const args = process.argv.slice(2);
const buildMode = args.includes('--build');
const statsMode = args.includes('--stats');
const kIdx = args.indexOf('--k');
const K = kIdx >= 0 ? parseInt(args[kIdx + 1], 10) : 5;
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 500;
const query = args.filter(a => !a.startsWith('--') && (kIdx < 0 || args.indexOf(a) !== kIdx + 1) && (limitIdx < 0 || args.indexOf(a) !== limitIdx + 1)).join(' ');

// ────────────────────────────────────────────────────────────────────────
// Embedding via Ollama API (direct HTTP, no bash wrapper needed)
// ────────────────────────────────────────────────────────────────────────
function embed(text) {
  try {
    const http = require('http');
    const payload = JSON.stringify({ model: EMBED_MODEL, prompt: text });
    return new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1', port: 11434, path: '/api/embeddings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 30000,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(body).embedding || null); }
          catch (_) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(payload);
      req.end();
    });
  } catch (_) {
    return Promise.resolve(null);
  }
}

function embedSync(text) {
  // Synchronous wrapper using execSync with node inline script (Windows-safe)
  try {
    const script = `
      const http = require('http');
      const payload = JSON.stringify({ model: '${EMBED_MODEL}', prompt: process.argv[1] });
      const req = http.request({ hostname: '127.0.0.1', port: 11434, path: '/api/embeddings', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      }, (res) => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try{process.stdout.write(JSON.stringify(JSON.parse(b).embedding||[]))}catch(_){process.stdout.write('[]')} }); });
      req.on('error',()=>process.stdout.write('[]'));
      req.write(payload); req.end();
    `;
    const result = execSync(`node -e "${script.replace(/\n/g, ' ').replace(/"/g, '\\"')}" "${text.replace(/"/g, '\\"').slice(0, 500)}"`, {
      encoding: 'utf8', timeout: 30000, windowsHide: true
    });
    const vec = JSON.parse(result);
    return vec && vec.length > 0 ? vec : null;
  } catch (_) {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Cache management
// ────────────────────────────────────────────────────────────────────────
function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return new Map();
  const lines = fs.readFileSync(CACHE_PATH, 'utf8').split('\n').filter(Boolean);
  const cache = new Map();
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.hash && e.vec) cache.set(e.hash, e);
    } catch (_) { /* skip */ }
  }
  return cache;
}

function appendCache(entry) {
  fs.appendFileSync(CACHE_PATH, JSON.stringify(entry) + '\n');
}

function promptHash(text) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text.trim().toLowerCase().slice(0, 200)).digest('hex').slice(0, 16);
}

// ────────────────────────────────────────────────────────────────────────
// Cosine similarity
// ────────────────────────────────────────────────────────────────────────
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function topK(queryVec, cache, k) {
  const scored = [];
  for (const [hash, entry] of cache) {
    const sim = cosine(queryVec, entry.vec);
    scored.push({ ...entry, similarity: sim });
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

// ────────────────────────────────────────────────────────────────────────
// Build mode: embed unembedded prompts from decisions.log
// ────────────────────────────────────────────────────────────────────────
function buildEmbeddings() {
  const cache = loadCache();
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const toEmbed = [];

  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.event !== 'classified') continue;
      const preview = (e.prompt_preview || '').trim();
      if (preview.length < 10) continue;
      const hash = promptHash(preview);
      if (cache.has(hash)) continue;
      toEmbed.push({ hash, preview, tier: e.tier, category: e.task_category, ts: e.ts });
    } catch (_) { /* skip */ }
  }

  const batch = toEmbed.slice(0, limit);
  console.log(`Build: ${toEmbed.length} unembedded prompts, processing ${batch.length}`);

  let embedded = 0;
  let failed = 0;
  for (const item of batch) {
    const vec = embedSync(item.preview);
    if (vec) {
      const entry = {
        hash: item.hash,
        vec,
        preview: item.preview.slice(0, 100),
        tier: item.tier,
        category: item.category,
        ts: item.ts,
      };
      appendCache(entry);
      embedded++;
      if (embedded % 20 === 0) process.stdout.write(`  embedded ${embedded}/${batch.length}\r`);
    } else {
      failed++;
    }
  }
  console.log(`\nDone: ${embedded} embedded, ${failed} failed, cache now ${cache.size + embedded} entries`);
}

// ────────────────────────────────────────────────────────────────────────
// Query mode
// ────────────────────────────────────────────────────────────────────────
function querySimilar(text) {
  const cache = loadCache();
  if (cache.size === 0) {
    console.log('Cache empty. Run: node similarity.js --build');
    return;
  }

  const queryVec = embedSync(text);
  if (!queryVec) {
    console.error('Failed to embed query. Is Ollama running with nomic-embed-text?');
    process.exit(1);
  }

  const results = topK(queryVec, cache, K);
  console.log(`\nTop-${K} similar prompts (cache: ${cache.size} entries):`);
  console.log('');
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const sim = (r.similarity * 100).toFixed(1);
    console.log(`  ${i + 1}. [${sim}%] tier=${r.tier} cat=${r.category}`);
    console.log(`     "${r.preview}"`);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Stats mode
// ────────────────────────────────────────────────────────────────────────
function showStats() {
  const cache = loadCache();
  const byTier = {};
  const byCat = {};
  for (const [, entry] of cache) {
    byTier[entry.tier] = (byTier[entry.tier] || 0) + 1;
    byCat[entry.category] = (byCat[entry.category] || 0) + 1;
  }
  console.log(`Embedding cache: ${cache.size} entries`);
  console.log(`  File: ${CACHE_PATH}`);
  if (fs.existsSync(CACHE_PATH)) {
    const sizeMB = (fs.statSync(CACHE_PATH).size / 1024 / 1024).toFixed(1);
    console.log(`  Size: ${sizeMB} MB`);
  }
  console.log('  By tier:', byTier);
  console.log('  By category:', Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(', '));
}

// ────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────
if (buildMode) {
  buildEmbeddings();
} else if (statsMode) {
  showStats();
} else if (query) {
  querySimilar(query);
} else {
  console.log('Usage:');
  console.log('  node similarity.js "prompt text"   # find similar');
  console.log('  node similarity.js --build         # embed unembedded prompts');
  console.log('  node similarity.js --stats         # cache stats');
}

module.exports = { embed, cosine, topK, loadCache, promptHash, CACHE_PATH };
