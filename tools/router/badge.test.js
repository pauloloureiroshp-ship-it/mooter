'use strict';

// Tier badge suite (Wave 2.5 Day 3 sub-feature 1). Two layers:
//   1. Pure unit tests for shortModel / buildBadge / readPrefs.
//   2. Subprocess tests that the live hook (inject_context.js) emits a
//      <tier-badge> for a confident prompt and suppresses it under `quiet`.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readPrefs, shortModel, buildBadge } = require('./badge.js');

const SCRIPT = path.join(__dirname, 'inject_context.js');

function tmpHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-badge-'));
  fs.mkdirSync(path.join(dir, '.mooter'), { recursive: true });
  return dir;
}

// ── pure helpers ────────────────────────────────────────────────────────────

test('shortModel collapses full model ids to short labels', () => {
  assert.equal(shortModel('claude-opus-4-6'), 'opus');
  assert.equal(shortModel('claude-sonnet-4-6'), 'sonnet');
  assert.equal(shortModel('claude-haiku-4-5'), 'haiku');
  assert.equal(shortModel('qwen3:30b'), 'ollama');
  assert.equal(shortModel('gpt-4o'), 'gpt');
  assert.equal(shortModel('gemini-2.0-flash'), 'gemini');
  assert.equal(shortModel(undefined), 'unknown');
});

// Wave 2.6 Day 3 — badge now leads with the centralized Moo glyph (tier +
// provider) instead of the bare tier code: `[🐂 ☁ sonnet 0.84]`.
test('buildBadge renders [glyph model conf] with 2-decimal confidence', () => {
  assert.equal(
    buildBadge({ tier: 'T2', recommended_model: 'claude-sonnet-4-6', recommended_backend: 'anthropic', confidence: 0.84 }),
    '[🐂 ☁ sonnet 0.84]',
  );
});

test('buildBadge omits provider glyph when backend is absent', () => {
  assert.equal(
    buildBadge({ tier: 'T0', recommended_model: 'qwen3:30b', confidence: 0.8 }),
    '[🐄 ollama 0.80]',
  );
});

test('buildBadge degrades gracefully on missing fields', () => {
  // Unknown tier → 🐮 fallback glyph; unknown model; 0.00 confidence.
  assert.equal(buildBadge({}), '[🐮 unknown 0.00]');
  assert.equal(buildBadge({ tier: 'T1', confidence: 'nope' }), '[🐎 unknown 0.00]');
});

test('readPrefs returns quiet=true from an explicit prefs path', () => {
  const home = tmpHome();
  const p = path.join(home, '.mooter', 'preferences.json');
  fs.writeFileSync(p, JSON.stringify({ quiet: true, badge_position: 'end' }));
  const prefs = readPrefs(p);
  assert.equal(prefs.quiet, true);
  assert.equal(prefs.badge_position, 'end');
});

test('readPrefs falls back to defaults when the file is missing or bad', () => {
  assert.equal(readPrefs('/nonexistent/path/preferences.json').quiet, false);
  const home = tmpHome();
  const p = path.join(home, '.mooter', 'preferences.json');
  fs.writeFileSync(p, '{ not json');
  assert.equal(readPrefs(p).quiet, false);
});

// ── live hook subprocess ──────────────────────────────────────────────────────

/** Run the hook with a prompt + isolated home; return combined stdout+stderr.
 * MOOTER_HOME (the .mooter dir) is the cross-platform prefs override — $HOME is a
 * no-op for os.homedir() on Windows, so it alone cannot isolate the hook's prefs. */
function runHook(prompt, home) {
  const env = Object.assign({}, process.env, {
    HOME: home,
    MOOTER_HOME: path.join(home, '.mooter'),
  });
  delete env.MOOTER_PIN_MODEL;
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt, session_id: 'badge-test' }),
    encoding: 'utf8',
    timeout: 15000,
    env,
  });
  return (res.stdout || '') + (res.stderr || '');
}

test('hook emits <tier-badge> for a confident prompt when not quiet', () => {
  const home = tmpHome(); // no preferences.json → defaults (quiet=false)
  const out = runHook('review the architecture and deploy to production', home);
  // Wave 2.6 Day 3 — badge leads with the Moo glyph: `[🦬 ☁ opus 0.90]`.
  assert.match(out, /<tier-badge>\[\S+ (\S+ )?[a-z]+ \d\.\d{2}\]<\/tier-badge>/u);
});

test('hook suppresses <tier-badge> when quiet=true', () => {
  const home = tmpHome();
  fs.writeFileSync(path.join(home, '.mooter', 'preferences.json'), JSON.stringify({ quiet: true }));
  const out = runHook('review the architecture and deploy to production', home);
  assert.ok(/<router-hint>/.test(out), 'hint still emitted');
  assert.ok(!/<tier-badge>/.test(out), 'badge suppressed under quiet');
});

// ── kimi visivel no tier-badge (2026-08-16) ─────────────────────────────────
test('buildBadge: kimi aparece com nome proprio, distinto dos motores Anthropic', () => {
  const kimi = buildBadge({ tier: 'T2', recommended_model: 'kimi-k3', recommended_backend: 'kimi', confidence: 0.84 });
  assert.match(kimi, /kimi/, 'o motor que o dono paga tem de ser nomeado');
  assert.doesNotMatch(kimi, /kimi-k3/, 'o id cru nao vai para o badge — colapsa para o nome curto');
  // e nao pode ser confundido com um motor de subscricao
  const sonnet = buildBadge({ tier: 'T2', recommended_model: 'claude-sonnet-4-6', recommended_backend: 'anthropic', confidence: 0.84 });
  assert.notEqual(kimi, sonnet, 'kimi e sonnet no mesmo tier tem de ler-se diferente');
});

