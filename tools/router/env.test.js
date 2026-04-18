#!/usr/bin/env node
// @ts-check
/**
 * Unit tests for env.js — Zod schema validation + precedence + fail-fast.
 * Uses node:test. Run with: node --test env.test.js
 *
 * Sprint 2 of CCA Testing foundation — gates regressions in Environment
 * Safety (criterion #10). Tests MOOTER > FRUGAL > default precedence,
 * schema rejection on malformed URLs, and silent fallback via tryEnv().
 */

'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Clone a known-good env so individual tests can mutate safely.
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Reset env so previous test mutations don't leak.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('MOOTER_') || k.startsWith('FRUGAL_')) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (k.startsWith('MOOTER_') || k.startsWith('FRUGAL_')) {
      process.env[k] = v;
    }
  }
});

// Fresh require after env mutation — env.js reads process.env at call time,
// not at require time, so a single require() works for all tests. But the
// module exports are stable so we cache the reference.
const env = require('./env.js');

// ── Defaults ───────────────────────────────────────────────────────────

test('requireEnv: returns defaults when no env vars set', () => {
  delete process.env.MOOTER_HUB_URL;
  delete process.env.FRUGAL_HUB_URL;
  delete process.env.MOOTER_LANDING_URL;
  delete process.env.FRUGAL_LANDING_URL;
  delete process.env.MOOTER_TRACKER_PORT;
  delete process.env.FRUGAL_TRACKER_PORT;
  delete process.env.MOOTER_LOG_LEVEL;
  delete process.env.FRUGAL_LOG_LEVEL;
  const v = env.requireEnv();
  assert.equal(v.hub_url, env.DEFAULT_HUB_URL);
  assert.equal(v.landing_url, env.DEFAULT_LANDING_URL);
  assert.equal(v.tracker_port, 7821);
  assert.equal(v.log_level, 'info');
  assert.equal(v.sentry_dsn, undefined);
});

// ── Precedence: MOOTER_* > FRUGAL_* ───────────────────────────────────

test('requireEnv: MOOTER_HUB_URL wins over FRUGAL_HUB_URL', () => {
  process.env.MOOTER_HUB_URL = 'https://mooter.example.com';
  process.env.FRUGAL_HUB_URL = 'https://frugal.example.com';
  const v = env.requireEnv();
  assert.equal(v.hub_url, 'https://mooter.example.com');
});

test('requireEnv: FRUGAL_HUB_URL is used when MOOTER_HUB_URL absent', () => {
  delete process.env.MOOTER_HUB_URL;
  process.env.FRUGAL_HUB_URL = 'https://legacy.example.com';
  const v = env.requireEnv();
  assert.equal(v.hub_url, 'https://legacy.example.com');
});

test('requireEnv: empty MOOTER_HUB_URL falls through to FRUGAL_HUB_URL', () => {
  process.env.MOOTER_HUB_URL = '';
  process.env.FRUGAL_HUB_URL = 'https://legacy.example.com';
  const v = env.requireEnv();
  assert.equal(v.hub_url, 'https://legacy.example.com');
});

// ── Schema rejection ──────────────────────────────────────────────────

test('requireEnv: throws on malformed hub URL', () => {
  process.env.MOOTER_HUB_URL = 'not-a-url';
  assert.throws(() => env.requireEnv(), /hub_url|url/i);
});

test('requireEnv: throws on non-integer tracker port', () => {
  process.env.MOOTER_TRACKER_PORT = 'abc';
  assert.throws(() => env.requireEnv());
});

test('requireEnv: throws on out-of-range tracker port (privileged)', () => {
  process.env.MOOTER_TRACKER_PORT = '80';
  assert.throws(() => env.requireEnv(), /port/i);
});

test('requireEnv: throws on out-of-range tracker port (ephemeral)', () => {
  process.env.MOOTER_TRACKER_PORT = '50000';
  assert.throws(() => env.requireEnv(), /port/i);
});

test('requireEnv: throws on unknown log level', () => {
  process.env.MOOTER_LOG_LEVEL = 'chatty';
  assert.throws(() => env.requireEnv(), /log_level/i);
});

test('requireEnv: accepts sentry_dsn when well-formed', () => {
  process.env.MOOTER_SENTRY_DSN = 'https://abc@o123.ingest.sentry.io/456';
  const v = env.requireEnv();
  assert.equal(v.sentry_dsn, 'https://abc@o123.ingest.sentry.io/456');
});

test('requireEnv: rejects malformed sentry_dsn', () => {
  process.env.MOOTER_SENTRY_DSN = 'not-a-url';
  assert.throws(() => env.requireEnv());
});

// ── tryEnv() soft-fallback ────────────────────────────────────────────

test('tryEnv: returns ok:true with valid env', () => {
  process.env.MOOTER_HUB_URL = 'https://mooter.example.com';
  const r = env.tryEnv();
  assert.equal(r.ok, true);
  assert.equal(r.value.hub_url, 'https://mooter.example.com');
});

test('tryEnv: returns ok:false + defaults when env invalid (soft fail)', () => {
  process.env.MOOTER_HUB_URL = 'not-a-url';
  const r = env.tryEnv();
  assert.equal(r.ok, false);
  // Must still have defaults populated so hooks don't crash.
  assert.equal(r.value.hub_url, env.DEFAULT_HUB_URL);
  assert.equal(r.value.landing_url, env.DEFAULT_LANDING_URL);
  // Error message should name the offending field.
  assert.match(/** @type {any} */ (r).error || '', /hub_url/);
});

// ── Legacy getters ────────────────────────────────────────────────────

test('getHubUrl: returns hub_url via tryEnv', () => {
  process.env.MOOTER_HUB_URL = 'https://explicit.example.com';
  assert.equal(env.getHubUrl(), 'https://explicit.example.com');
});

test('getLandingUrl: returns landing_url via tryEnv', () => {
  process.env.MOOTER_LANDING_URL = 'https://landing.example.com';
  assert.equal(env.getLandingUrl(), 'https://landing.example.com');
});

test('getHubUrl: returns default when no env var set', () => {
  delete process.env.MOOTER_HUB_URL;
  delete process.env.FRUGAL_HUB_URL;
  assert.equal(env.getHubUrl(), env.DEFAULT_HUB_URL);
});
