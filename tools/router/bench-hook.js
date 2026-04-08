#!/usr/bin/env node
/**
 * bench-hook.js — micro-benchmark for the full inject_context.js hook.
 *
 * Runs a batch of prompts through `node inject_context.js` via spawnSync
 * and measures wall-clock p50/p95/p99 end-to-end (including the classify
 * spawn, budget cache lookup, and any Option A work).
 *
 * Usage:
 *   node bench-hook.js --iters 50
 *   node bench-hook.js --iters 100 --prompts ./corpus.txt
 *   node bench-hook.js --warm-first   # run once before measuring (filesystem cache)
 *
 * The default prompts exercise the 4 main paths: cached hit, cold classify,
 * quality intent promotion, and sub-tier code routing.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { iters: 20, warmFirst: false, promptsFile: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iters') opts.iters = parseInt(args[++i], 10);
    else if (args[i] === '--warm-first') opts.warmFirst = true;
    else if (args[i] === '--prompts') opts.promptsFile = args[++i];
  }
  return opts;
}

const DEFAULT_PROMPTS = [
  'lista os ficheiros modificados hoje',
  'explica o que faz esta função',
  'calcula o integral de x ao quadrado',
  'pensa bem antes de responder a isto',
  'refactora a arquitetura para multi-tenant',
  'what does this regex do: /\\b\\w+/g',
  '@sonnet diagnostica este bug intermitente',
  'mostra o git status',
  'resume o ficheiro hub/src/llm.ts',
  'ultrathink this problem carefully',
];

function loadPrompts(file) {
  if (!file) return DEFAULT_PROMPTS;
  const raw = fs.readFileSync(file, 'utf8');
  return raw.split('\n').filter((l) => l.trim().length > 4);
}

function runHookOnce(prompt) {
  const script = path.join(__dirname, 'inject_context.js');
  const payload = JSON.stringify({ prompt });
  const start = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [script], {
    input: payload,
    encoding: 'utf8',
    timeout: 15000,
  });
  const end = process.hrtime.bigint();
  return {
    ms: Number(end - start) / 1e6,
    status: r.status,
    stdoutBytes: (r.stdout || '').length,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100));
  return sorted[idx];
}

function main() {
  const opts = parseArgs();
  const prompts = loadPrompts(opts.promptsFile);

  if (opts.warmFirst) {
    console.log('Warm-up run (not measured)...');
    for (const p of prompts) runHookOnce(p);
  }

  console.log(`Benchmarking ${opts.iters} iterations × ${prompts.length} prompts = ${opts.iters * prompts.length} runs`);
  const samples = [];
  let totalBytes = 0;
  const startedAt = Date.now();
  for (let i = 0; i < opts.iters; i++) {
    for (const p of prompts) {
      const r = runHookOnce(p);
      samples.push(r.ms);
      totalBytes += r.stdoutBytes;
    }
    if ((i + 1) % 5 === 0) process.stdout.write(`  ${i + 1}/${opts.iters} iters…\n`);
  }
  const elapsed = Date.now() - startedAt;

  samples.sort((a, b) => a - b);
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);
  const max = samples[samples.length - 1];
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

  console.log('');
  console.log(`Total samples:  ${samples.length}`);
  console.log(`Total wall:     ${elapsed} ms (${(elapsed / samples.length).toFixed(1)} ms/sample incl. spawn)`);
  console.log(`Hint bytes avg: ${(totalBytes / samples.length).toFixed(0)}`);
  console.log('');
  console.log(`avg:  ${avg.toFixed(1)} ms`);
  console.log(`p50:  ${p50.toFixed(1)} ms`);
  console.log(`p95:  ${p95.toFixed(1)} ms`);
  console.log(`p99:  ${p99.toFixed(1)} ms`);
  console.log(`max:  ${max.toFixed(1)} ms`);
  console.log('');
  console.log('Targets (v0.7):');
  console.log(`  p50 < 200ms:  ${p50 < 200 ? '✓' : '✗'}`);
  console.log(`  p95 < 500ms:  ${p95 < 500 ? '✓' : '✗'}`);
  console.log(`  p99 < 4000ms: ${p99 < 4000 ? '✓' : '✗'}`);
}

if (require.main === module) main();
