#!/usr/bin/env node
// @ts-check
/**
 * Unit tests for quota-tracker.js.
 *
 * Each test isolates state by pointing MOOTER_CLAUDE_DIR at a tmp directory
 * and reloading the module from cache, so we never touch the user's real
 * quota-state.json. Mocks Date.now via the public Date global only when
 * exercising window-rollover logic.
 *
 * Run with:  node --test quota-tracker.test.js
 */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

let TMP_DIR;
let RealDate;

function freshTracker() {
  // Reload paths.js + quota-tracker.js with the new MOOTER_CLAUDE_DIR.
  delete require.cache[require.resolve('./paths.js')];
  delete require.cache[require.resolve('./quota-tracker.js')];
  return require('./quota-tracker.js');
}

beforeEach(() => {
  TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-quota-'));
  // paths.js reads MOOTER_CLAUDE_DIR; ROUTER_DIR = $DIR/tools/router
  fs.mkdirSync(path.join(TMP_DIR, 'tools', 'router'), { recursive: true });
  process.env.MOOTER_CLAUDE_DIR = TMP_DIR;
  delete process.env.MOOTER_ANTHROPIC_5H_LIMIT;
  delete process.env.MOOTER_CODEX_5H_LIMIT;
  RealDate = Date;
});

afterEach(() => {
  global.Date = RealDate;
  delete process.env.MOOTER_CLAUDE_DIR;
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
});

// ── getState ────────────────────────────────────────────────────────────

test('getState: returns defaults when state file does not exist', () => {
  const t = freshTracker();
  const s = t.getState();
  assert.equal(s.version, t.SCHEMA_VERSION);
  assert.equal(s.providers.anthropic.window_5h.tokens_used, 0);
  assert.equal(s.providers.openai_codex_cli.window_5h.messages_used, 0);
  assert.equal(s.providers.openai_codex_cli.exhausted, false);
});

test('getState: respects MOOTER_ANTHROPIC_5H_LIMIT env override', () => {
  process.env.MOOTER_ANTHROPIC_5H_LIMIT = '500000';
  const t = freshTracker();
  const s = t.getState();
  assert.equal(s.providers.anthropic.window_5h.limit, 500000);
});

// ── recordUsage ─────────────────────────────────────────────────────────

test('recordUsage: increments anthropic tokens + cost', () => {
  const t = freshTracker();
  t.recordUsage('anthropic', { tokens: 1000, cost_usd: 0.5 });
  t.recordUsage('anthropic', { tokens:  500, cost_usd: 0.25 });
  const s = t.getState();
  assert.equal(s.providers.anthropic.window_5h.tokens_used, 1500);
  assert.equal(s.providers.anthropic.today.cost_usd, 0.75);
});

test('recordUsage: increments codex messages and flags exhaustion', () => {
  const t = freshTracker();
  t.recordUsage('openai_codex_cli', { messages: 1 });
  t.recordUsage('openai_codex_cli', { messages: 1, exhausted: true });
  const s = t.getState();
  assert.equal(s.providers.openai_codex_cli.window_5h.messages_used, 2);
  assert.equal(s.providers.openai_codex_cli.exhausted, true);
});

test('recordUsage: openai_api accumulates tokens_in/out and cost', () => {
  const t = freshTracker();
  t.recordUsage('openai_api', { tokens_in: 100, tokens_out: 50, cost_usd: 0.001 });
  const s = t.getState();
  assert.equal(s.providers.openai_api.today.tokens_in, 100);
  assert.equal(s.providers.openai_api.today.tokens_out, 50);
  assert.ok(Math.abs(s.providers.openai_api.today.cost_usd - 0.001) < 1e-9);
});

test('recordUsage: throws on unknown provider', () => {
  const t = freshTracker();
  assert.throws(() => t.recordUsage('imaginary', { tokens: 1 }), /unknown provider/);
});

// ── getQuotaRemaining ───────────────────────────────────────────────────

test('getQuotaRemaining: anthropic at 50% when half-used', () => {
  process.env.MOOTER_ANTHROPIC_5H_LIMIT = '1000';
  const t = freshTracker();
  t.recordUsage('anthropic', { tokens: 500 });
  assert.equal(t.getQuotaRemaining('anthropic'), 0.5);
});

test('getQuotaRemaining: codex returns 0 when exhausted flag set', () => {
  const t = freshTracker();
  t.recordUsage('openai_codex_cli', { messages: 1, exhausted: true });
  assert.equal(t.getQuotaRemaining('openai_codex_cli'), 0);
});

test('getQuotaRemaining: openai_api and ollama always return 1', () => {
  const t = freshTracker();
  t.recordUsage('openai_api', { tokens_in: 1000, tokens_out: 500, cost_usd: 50 });
  t.recordUsage('ollama', { calls: 100 });
  assert.equal(t.getQuotaRemaining('openai_api'), 1);
  assert.equal(t.getQuotaRemaining('ollama'), 1);
});

test('getQuotaRemaining: clamps at [0, 1] even past hard cap', () => {
  process.env.MOOTER_ANTHROPIC_5H_LIMIT = '100';
  const t = freshTracker();
  t.recordUsage('anthropic', { tokens: 999 });
  assert.equal(t.getQuotaRemaining('anthropic'), 0);
});

// ── shouldPreferCodex ───────────────────────────────────────────────────

test('shouldPreferCodex: true when fresh codex quota', () => {
  const t = freshTracker();
  assert.equal(t.shouldPreferCodex(), true);
});

test('shouldPreferCodex: false when codex exhausted', () => {
  const t = freshTracker();
  t.recordUsage('openai_codex_cli', { messages: 1, exhausted: true });
  assert.equal(t.shouldPreferCodex(), false);
});

test('shouldPreferCodex: false when below 20% threshold', () => {
  process.env.MOOTER_CODEX_5H_LIMIT = '100';
  const t = freshTracker();
  t.recordUsage('openai_codex_cli', { messages: 85 }); // 15% remaining
  assert.equal(t.shouldPreferCodex(), false);
});

// ── resetIfExpired ──────────────────────────────────────────────────────

test('resetIfExpired: rolls 5h window when reset_at has passed', () => {
  process.env.MOOTER_ANTHROPIC_5H_LIMIT = '1000';
  const t = freshTracker();

  t.recordUsage('anthropic', { tokens: 500 });
  let s = t.getState();
  assert.equal(s.providers.anthropic.window_5h.tokens_used, 500);

  // Force the reset_at into the past, write back, and reload the state.
  s.providers.anthropic.window_5h.reset_at = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(t.STATE_PATH, JSON.stringify(s));
  const after = t.getState();
  assert.equal(after.providers.anthropic.window_5h.tokens_used, 0);
});

// ── summary ─────────────────────────────────────────────────────────────

test('summary: integer percentages and stable shape', () => {
  process.env.MOOTER_ANTHROPIC_5H_LIMIT = '1000';
  process.env.MOOTER_CODEX_5H_LIMIT     = '100';
  const t = freshTracker();
  t.recordUsage('anthropic',        { tokens: 250 });   // 75% remain
  t.recordUsage('openai_codex_cli', { messages: 33 });  // 67% remain
  const out = t.summary();
  assert.equal(out.anthropic_remaining_pct, 75);
  assert.equal(out.codex_remaining_pct,     67);
  assert.equal(out.codex_exhausted, false);
  assert.equal(typeof out.today_cost_usd, 'number');
});
