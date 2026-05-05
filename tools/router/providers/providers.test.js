#!/usr/bin/env node
// @ts-check
/**
 * Tests for providers/codex-cli.js + providers/openai-api.js.
 *
 * No real API calls and no real `codex` invocations. We exercise:
 *   - the quota-exhaustion detection regex
 *   - cost computation against the canonical pricing.js
 *   - the .env loader resolution order
 *   - isAvailable() degradations (missing key, missing binary)
 *
 * Run with:  node --test providers/providers.test.js
 */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

let TMP_DIR;
let SAVED_OPENAI;

function loadFresh() {
  for (const m of [
    './_load-env.js',
    '../paths.js',
    '../quota-tracker.js',
    './codex-cli.js',
    './openai-api.js',
  ]) {
    try { delete require.cache[require.resolve(m)]; } catch {}
  }
  return {
    codex:  require('./codex-cli.js'),
    openai: require('./openai-api.js'),
    loadEnv: require('./_load-env.js'),
  };
}

beforeEach(() => {
  TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-prov-'));
  fs.mkdirSync(path.join(TMP_DIR, 'tools', 'router'), { recursive: true });
  process.env.MOOTER_CLAUDE_DIR = TMP_DIR;
  SAVED_OPENAI = process.env.OPENAI_API_KEY;
});

afterEach(() => {
  delete process.env.MOOTER_CLAUDE_DIR;
  if (SAVED_OPENAI === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = SAVED_OPENAI;
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
});

// ── codex-cli: QUOTA_HINTS detection ────────────────────────────────────

test('codex QUOTA_HINTS: matches every documented exhaustion phrase', () => {
  const { codex } = loadFresh();
  const hits = [
    'You hit the rate limit. Try again later.',
    'rate-limited at the moment',
    'Quota exceeded for this 5 hour window',
    'You\'ve hit the 5-hour cap',
    'Weekly limit reached',
    'usage limit applied',
  ];
  for (const h of hits) {
    const blob = h.toLowerCase();
    const matched = codex.QUOTA_HINTS.some((needle) => blob.includes(needle));
    assert.ok(matched, `expected match for: ${h}`);
  }
});

test('codex QUOTA_HINTS: does NOT match benign output', () => {
  const { codex } = loadFresh();
  const benign = [
    'Logged in using ChatGPT',
    'I generated the function as requested.',
    'No errors found.',
  ];
  for (const h of benign) {
    const blob = h.toLowerCase();
    const matched = codex.QUOTA_HINTS.some((needle) => blob.includes(needle));
    assert.equal(matched, false, `unexpected match: ${h}`);
  }
});

// ── openai-api: cost math ───────────────────────────────────────────────

test('openai computeCost: uses pricing.js for gpt-4o', () => {
  const { openai } = loadFresh();
  // gpt-4o pricing (verified 2026-04-16 in pricing.js): input 2.50, output 10.0
  // 1M in + 1M out → 2.50 + 10.0 = 12.50
  const cost = openai.computeCost('gpt-4o', 1_000_000, 1_000_000);
  assert.ok(Math.abs(cost - 12.5) < 1e-6, `expected 12.5, got ${cost}`);
});

test('openai computeCost: uses pricing.js for o3', () => {
  const { openai } = loadFresh();
  // o3 pricing: input 2.00, output 8.00
  const cost = openai.computeCost('o3', 500_000, 500_000);
  assert.ok(Math.abs(cost - 5.0) < 1e-6, `expected 5.0, got ${cost}`);
});

test('openai computeCost: falls back gracefully for unknown model', () => {
  const { openai } = loadFresh();
  const cost = openai.computeCost('made-up-model', 1000, 1000);
  // Falls back to a sane default rate (>0, finite). We don't pin the exact
  // rate to avoid coupling this test to FALLBACK_PRICE constants.
  assert.ok(Number.isFinite(cost) && cost >= 0);
});

// ── openai-api: isAvailable ─────────────────────────────────────────────

test('openai isAvailable: false when OPENAI_API_KEY is unset', () => {
  // Load the module first (its module-load .env scan may re-populate the
  // var from the canonical tree). Then clear and probe — isAvailable reads
  // process.env at call time.
  const { openai } = loadFresh();
  delete process.env.OPENAI_API_KEY;
  assert.equal(openai.isAvailable(), false);
});

test('openai isAvailable: true when OPENAI_API_KEY is set', () => {
  const { openai } = loadFresh();
  process.env.OPENAI_API_KEY = 'sk-test-fake';
  assert.equal(openai.isAvailable(), true);
});

// ── _load-env: precedence ───────────────────────────────────────────────

test('_load-env: does NOT overwrite a pre-set process.env var', () => {
  // Drop a synthetic .env into the runtime ROUTER_DIR.
  const envFile = path.join(TMP_DIR, 'tools', 'router', '.env');
  fs.writeFileSync(envFile, 'OPENAI_API_KEY=from-dotenv\n');
  process.env.OPENAI_API_KEY = 'from-shell';
  const { loadEnv } = loadFresh();
  loadEnv.loadEnv();
  assert.equal(process.env.OPENAI_API_KEY, 'from-shell');
});

test('_load-env: fills in missing vars from .env', () => {
  const envFile = path.join(TMP_DIR, 'tools', 'router', '.env');
  fs.writeFileSync(envFile, 'OPENAI_API_KEY=from-dotenv\n');
  delete process.env.OPENAI_API_KEY;
  const { loadEnv } = loadFresh();
  loadEnv.loadEnv();
  assert.equal(process.env.OPENAI_API_KEY, 'from-dotenv');
});

test('_load-env: ignores comments and blank lines, strips quotes', () => {
  const envFile = path.join(TMP_DIR, 'tools', 'router', '.env');
  fs.writeFileSync(
    envFile,
    '# comment line\n' +
    '\n' +
    'TEST_FOO_VAR="quoted-value"\n' +
    "TEST_BAR_VAR='single-quoted'\n"
  );
  delete process.env.TEST_FOO_VAR;
  delete process.env.TEST_BAR_VAR;
  const { loadEnv } = loadFresh();
  loadEnv.loadEnv();
  assert.equal(process.env.TEST_FOO_VAR, 'quoted-value');
  assert.equal(process.env.TEST_BAR_VAR, 'single-quoted');
});
