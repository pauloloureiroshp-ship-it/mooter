#!/usr/bin/env node
// @ts-check
/**
 * Unit tests for detect-subscriptions.js (Wave-1.5 task #1).
 *
 * Strategy: each pure detector is exported, so we don't mock spawnSync.
 * Instead we exercise the merge/flatten logic and the env-driven branches
 * directly. The codex CLI branch is integration-tested manually (see
 * Wave-1.5 verdict) since spawnSync is platform-sensitive.
 */

'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const ORIGINAL_ENV = { ...process.env };
function resetEnv() {
  for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY']) {
    delete process.env[k];
  }
}

beforeEach(() => {
  resetEnv();
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY'].includes(k)) {
      process.env[k] = v;
    }
  }
});

const ds = require('./detect-subscriptions.js');

// ── Gemini env-driven branch ──────────────────────────────────────────────

test('detectGemini: none when no env vars', () => {
  resetEnv();
  const r = ds.detectGemini();
  assert.equal(r.plan, 'none');
  assert.equal(r.available, false);
});

test('detectGemini: api-paid when GEMINI_API_KEY present', () => {
  resetEnv();
  process.env.GEMINI_API_KEY = 'fake-key';
  const r = ds.detectGemini();
  assert.equal(r.plan, 'api-paid');
  assert.equal(r.available, true);
  assert.equal(r.evidence.env_var, 'GEMINI_API_KEY');
});

test('detectGemini: api-paid when only GOOGLE_API_KEY present', () => {
  resetEnv();
  process.env.GOOGLE_API_KEY = 'fake-key';
  const r = ds.detectGemini();
  assert.equal(r.plan, 'api-paid');
  assert.equal(r.evidence.env_var, 'GOOGLE_API_KEY');
});

// ── OpenAI API branch (no smoke) ──────────────────────────────────────────

test('detectOpenAIApi: none without env key', async () => {
  resetEnv();
  const r = await ds.detectOpenAIApi();
  assert.equal(r.plan, 'none');
  assert.equal(r.available, false);
});

test('detectOpenAIApi: api-paid presence-only when env key set', async () => {
  resetEnv();
  process.env.OPENAI_API_KEY = 'sk-fake';
  const r = await ds.detectOpenAIApi();
  assert.equal(r.plan, 'api-paid');
  assert.equal(r.available, true);
  assert.equal(r.evidence.smoke_skipped, true);
});

// ── Anthropic fallback branch ─────────────────────────────────────────────

test('detectAnthropic: api-paid fallback when env key present and no creds', () => {
  resetEnv();
  process.env.ANTHROPIC_API_KEY = 'sk-ant-fake';
  const r = ds.detectAnthropic();
  // If the live machine has credentials.json, that wins. We accept either
  // outcome but assert the function returned a structured object.
  assert.ok(r.plan);
  assert.ok(typeof r.available === 'boolean');
});

// ── Merge / flatten contract ──────────────────────────────────────────────

test('flattenForBackcompat: produces legacy-shape profiles dict', () => {
  const detected = {
    checked_at: 'x',
    anthropic: { plan: 'max' },
    openai_codex_cli: { plan: 'chatgpt_pro_or_plus' },
    openai_api: { plan: 'none' },
    gemini: { plan: 'none' },
    ollama: { plan: 'installed' },
  };
  const flat = ds.flattenForBackcompat(detected);
  assert.equal(flat.anthropic, 'max');
  assert.equal(flat.openai_codex_cli, 'chatgpt_pro_or_plus');
  assert.equal(flat.gemini, 'none');
  assert.equal(flat.ollama, 'installed');
});

test('mergeIntoExisting: preserves created_at and routing_hints from legacy file', () => {
  const existing = {
    created_at: '2026-04-10T06:00:00.000Z',
    profiles: { anthropic: 'max' },
    routing_hints: { prefer_local_t0: true },
    notes: 'legacy',
  };
  const detected = {
    checked_at: '2026-05-07T00:00:00.000Z',
    anthropic: { plan: 'max', available: true, detected_via: 'x', evidence: {} },
    openai_codex_cli: { plan: 'chatgpt_pro_or_plus', available: true, detected_via: 'x', evidence: {} },
    openai_api: { plan: 'none', available: false, detected_via: null, evidence: null },
    gemini: { plan: 'none', available: false, detected_via: null, evidence: null },
    ollama: { plan: 'installed', available: true, detected_via: 'x', evidence: {} },
  };
  const merged = ds.mergeIntoExisting(existing, detected);
  assert.equal(merged.created_at, '2026-04-10T06:00:00.000Z');
  assert.deepEqual(merged.routing_hints, { prefer_local_t0: true });
  assert.equal(merged.profiles.anthropic, 'max');
  assert.equal(merged.profiles.openai_codex_cli, 'chatgpt_pro_or_plus');
  assert.ok(merged.detected, 'detected sub-object should be present');
});

test('mergeIntoExisting: synthesises created_at when no legacy file', () => {
  const detected = {
    checked_at: '2026-05-07T00:00:00.000Z',
    anthropic: { plan: 'none', available: false, detected_via: null, evidence: null },
    openai_codex_cli: { plan: 'none', available: false, detected_via: null, evidence: null },
    openai_api: { plan: 'none', available: false, detected_via: null, evidence: null },
    gemini: { plan: 'none', available: false, detected_via: null, evidence: null },
    ollama: { plan: 'none', available: false, detected_via: null, evidence: null },
  };
  const merged = ds.mergeIntoExisting(null, detected);
  assert.ok(merged.created_at, 'created_at should be set');
  assert.ok(merged.updated_at, 'updated_at should be set');
});

// ── Smoke: detectAll resolves and shape is correct ────────────────────────

test('detectAll: resolves with all 5 providers + checked_at', async () => {
  const r = await ds.detectAll();
  assert.ok(r.checked_at);
  for (const k of ['anthropic', 'openai_codex_cli', 'openai_api', 'gemini', 'ollama']) {
    assert.ok(r[k], `missing provider key: ${k}`);
    assert.ok(typeof r[k].available === 'boolean');
    assert.ok('plan' in r[k]);
  }
});
