#!/usr/bin/env node
// @ts-check
/**
 * Tests for the Wave 29 (29.J) statusline line-3 chip helpers:
 *   compression-status.js · setup-status.js · ecosystem-status.js
 *
 * Pure builders + statusLine() file readers (temp MOOTER_HOME). The line-3 is
 * opt-in and default OFF, so lines 1-2 of statusline-multi.js are unaffected.
 *
 * Run with:  node --test statusline-line3.test.js
 */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const comp = require('./compression-status.js');
const setup = require('./setup-status.js');
const eco = require('./ecosystem-status.js');

let HOME;
let SAVED;
beforeEach(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-l3-'));
  SAVED = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = HOME;
});
afterEach(() => {
  if (SAVED === undefined) delete process.env.MOOTER_HOME;
  else process.env.MOOTER_HOME = SAVED;
  try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {}
});

function write(rel, obj) {
  const p = path.join(HOME, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
}

// ── compression ────────────────────────────────────────────────────────
test('compression chip: null when disabled, chip when enabled', () => {
  assert.equal(comp.buildCompressionChip(null), null);
  assert.equal(comp.buildCompressionChip({ compression: { enabled: false } }), null);
  assert.equal(comp.buildCompressionChip({ compression: { enabled: true, target_ratio: 4 } }), '📦 lingua 4×');
});

test('compression statusLine reads preferences.json', () => {
  assert.equal(comp.statusLine(), null); // no file yet
  write('preferences.json', { compression: { enabled: true, target_ratio: 6 } });
  assert.equal(comp.statusLine(), '📦 lingua 6×');
});

// ── setup ──────────────────────────────────────────────────────────────
test('setup chip: null without profile; hardware · sub · packs when present', () => {
  assert.equal(setup.buildSetupChip(null, null), null);
  const profile = { hardware: { hardware_class: 'apple-silicon' }, subscriptions: { subscription_tier: 'claude-max' } };
  assert.equal(setup.buildSetupChip(profile, null), '🔧 apple-silicon · claude-max');
  assert.equal(setup.buildSetupChip(profile, { packs: [{ name: 'caveman' }] }), '🔧 apple-silicon · claude-max · 1 pack');
  assert.equal(setup.buildSetupChip(profile, { packs: [{ name: 'a' }, { name: 'b' }] }), '🔧 apple-silicon · claude-max · 2 packs');
});

test('setup statusLine reads profile + installed packs', () => {
  assert.equal(setup.statusLine(), null);
  write('setup_profile.json', { hardware: { hardware_class: 'nvidia-rtx-4090' }, subscriptions: { subscription_tier: 'claude-max' } });
  write('installed_packs.json', { packs: [{ name: 'caveman' }] });
  assert.equal(setup.statusLine(), '🔧 nvidia-rtx-4090 · claude-max · 1 pack');
});

// ── ecosystem ──────────────────────────────────────────────────────────
test('ecosystem chip: null without/zero count; chip with count', () => {
  assert.equal(eco.buildEcosystemChip(null), null);
  assert.equal(eco.buildEcosystemChip({ count: 0 }), null);
  assert.equal(eco.buildEcosystemChip({ count: 1 }), '📚 1 recommendation');
  assert.equal(eco.buildEcosystemChip({ count: 5 }), '📚 5 recommendations');
});

test('ecosystem statusLine reads the cached reco count', () => {
  assert.equal(eco.statusLine(), null);
  write('ecosystem/reco_count.json', { count: 5, generated_at: '2026-06-07T00:00:00Z' });
  assert.equal(eco.statusLine(), '📚 5 recommendations');
});
