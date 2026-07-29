#!/usr/bin/env node
'use strict';
// MP-Q Q3 — quota defcon tests.
//
// Layer 1: pure unit tests on quota-live.js#applyQuotaDefcon (bands, floors,
//          fable suppression, reasoning).
// Layer 2: subprocess tests driving inject_context.js with an ISOLATED
//          USERPROFILE/HOME + MOOTER_HOME, proving:
//            - official weekly + defcon reasoning reach the emitted hint;
//            - HIGH_RISK T3 floors never come down (⚫ band);
//            - fresh quota-live.json fully replaces the /api/oauth/usage
//              refresh path (no .budget-refresh.lock), while a missing
//              quota-live still enters the legacy refresh path (lock).
//
// Run with:  node --test quota-defcon.test.js

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const QL = require('./quota-live.js');
const SCRIPT = path.join(__dirname, 'inject_context.js');

// ── Layer 1: pure ───────────────────────────────────────────────────────────

function mkDecision(over) {
  return Object.assign({
    tier: 'T2', max_tier: 'T3', confidence: 0.9,
    risk_level: 'low', escalation_rule: 'none',
  }, over);
}
function live(sevenDay, extra) {
  return Object.assign({
    fresh: true, five_hour_pct: 48, seven_day_pct: sevenDay,
    opus_or_fable_pct: null, resets: {},
  }, extra);
}

test('defcon levels: band edges', () => {
  assert.equal(QL.quotaDefconLevel(69.9).name, 'green');
  assert.equal(QL.quotaDefconLevel(70).name, 'yellow');
  assert.equal(QL.quotaDefconLevel(85).name, 'red');
  assert.equal(QL.quotaDefconLevel(95).name, 'black');
  assert.equal(QL.quotaDefconLevel(null), null);
});

test('green / stale / missing → decision untouched', () => {
  for (const l of [live(30), Object.assign(live(89), { fresh: false }), null]) {
    const d = mkDecision();
    assert.equal(QL.applyQuotaDefcon(d, l, false), null);
    assert.equal(d.tier, 'T2');
    assert.equal(d.quota_defcon, undefined);
  }
});

test('yellow 70-84: only borderline T2 (confidence ≤0.7) biases down to T1', () => {
  const borderline = mkDecision({ confidence: 0.6 });
  QL.applyQuotaDefcon(borderline, live(75), false);
  assert.equal(borderline.tier, 'T1');
  assert.match(borderline.escalation_rule, /quota_defcon/);

  const confident = mkDecision({ confidence: 0.9 });
  QL.applyQuotaDefcon(confident, live(75), false);
  assert.equal(confident.tier, 'T2', 'confident T2 stays');

  const t3 = mkDecision({ tier: 'T3', confidence: 0.6 });
  QL.applyQuotaDefcon(t3, live(75), false);
  assert.equal(t3.tier, 'T3', 'yellow never touches T3');
});

test('red 85-94: cap T2 + one-tier local bias; floors exempt', () => {
  const t3 = mkDecision({ tier: 'T3' });
  QL.applyQuotaDefcon(t3, live(89), false);
  assert.equal(t3.tier, 'T2');
  assert.equal(t3.max_tier, 'T2');

  const t2 = mkDecision();
  QL.applyQuotaDefcon(t2, live(89), false);
  assert.equal(t2.tier, 'T1');

  const t1 = mkDecision({ tier: 'T1' });
  QL.applyQuotaDefcon(t1, live(89), false);
  assert.equal(t1.tier, 'T0');

  const floor = mkDecision({ tier: 'T3', risk_level: 'high' });
  const info = QL.applyQuotaDefcon(floor, live(89), false);
  assert.equal(floor.tier, 'T3', 'risk_level:high floor untouched');
  assert.match(info.action, /floor kept/);

  const floorByRegex = mkDecision({ tier: 'T3' });
  QL.applyQuotaDefcon(floorByRegex, live(89), true);
  assert.equal(floorByRegex.tier, 'T3', 'hook-regex HIGH_RISK floor untouched');
});

test('black ≥95: everything non-floor goes local (T0)', () => {
  const t3 = mkDecision({ tier: 'T3' });
  QL.applyQuotaDefcon(t3, live(96), false);
  assert.equal(t3.tier, 'T0');
  assert.equal(t3.max_tier, 'T0');

  const floor = mkDecision({ tier: 'T3', risk_level: 'high' });
  QL.applyQuotaDefcon(floor, live(96), false);
  assert.equal(floor.tier, 'T3', 'doctrine floor survives even at ⚫');
});

test('reasoning is explicable: "weekly 89% → defcon 🔴 → …"', () => {
  const d = mkDecision();
  const info = QL.applyQuotaDefcon(d, live(89), false);
  assert.match(info.reasoning, /^weekly 89% → defcon 🔴 → T1 \(was T2\)$/);
});

test('opus/fable window at 100% → suppress_fable, at any band', () => {
  const d = mkDecision();
  QL.applyQuotaDefcon(d, live(89, { opus_or_fable_pct: 100 }), false);
  assert.equal(d.suppress_fable, true);
  const g = mkDecision();
  QL.applyQuotaDefcon(g, live(30, { opus_or_fable_pct: 100 }), false);
  assert.equal(g.suppress_fable, true, 'suppression applies even at green');
});

// ── Layer 2: subprocess (isolated home) ─────────────────────────────────────

let TMP;

beforeEach(() => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-defcon-'));
  // inject_context.js derives ROUTER_DIR from os.homedir(); pre-create it so
  // the legacy refresh path can actually write its lock file.
  fs.mkdirSync(path.join(TMP, '.claude', 'tools', 'router'), { recursive: true });
  fs.mkdirSync(path.join(TMP, '.mooter'), { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows lag */ }
});

function writeLiveFile(rec) {
  fs.writeFileSync(path.join(TMP, '.mooter', 'quota-live.json'), JSON.stringify(Object.assign({
    v: 1, source: 'cc-statusline-stdin', ts: Date.now(),
    five_hour_pct: 48, seven_day_pct: 89, opus_or_fable_pct: null,
    resets: { five_hour: null, seven_day: '2026-07-09T04:00:00.000Z' },
  }, rec)));
}

function runHook(prompt) {
  const env = Object.assign({}, process.env, {
    USERPROFILE: TMP.replace(/\//g, '\\'),
    HOME: TMP,
    MOOTER_CLAUDE_DIR: path.join(TMP, '.claude'),
    MOOTER_HOME: path.join(TMP, '.mooter'),
  });
  delete env.MOOTER_PIN_MODEL;
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt, session_id: 'test-defcon' }),
    encoding: 'utf8',
    timeout: 20000,
    env,
  });
  return (res.stdout || '') + (res.stderr || '');
}

const lockPath = () => path.join(TMP, '.claude', 'tools', 'router', '.budget-refresh.lock');

test('hook: fresh quota-live → weekly+defcon in hint, NO oauth refresh spawn', () => {
  writeLiveFile({});
  const out = runHook('why does the websocket reconnect sometimes fail intermittently');
  assert.match(out, /anthropic_weekly: 89% used \(official, resets 2026-07-09\)/);
  assert.match(out, /quota_defcon: weekly 89% → defcon 🔴/);
  assert.ok(!/tier: T3/.test(out), 'red band must cap non-floor prompts at T2');
  assert.equal(fs.existsSync(lockPath()), false,
    'fresh quota-live must fully replace the /api/oauth/usage refresh (no lock)');
});

test('hook: NO quota-live → legacy refresh path entered (lock written)', () => {
  const out = runHook('why does the websocket reconnect sometimes fail intermittently');
  assert.ok(!/quota_defcon:/.test(out), 'no official data → no defcon line');
  assert.equal(fs.existsSync(lockPath()), true,
    'without quota-live the legacy background refresh must still run');
});

test('hook: ⚫ 96% + HIGH_RISK deploy prompt → T3 floor intact', () => {
  writeLiveFile({ seven_day_pct: 96 });
  const out = runHook('deploy to production and push the release now');
  assert.match(out, /tier: T3/);
  assert.match(out, /quota_defcon: weekly 96% → defcon ⚫ → T3/);
});

test('hook: opus/fable exhausted → fable_suppressed line', () => {
  writeLiveFile({ opus_or_fable_pct: 100 });
  const out = runHook('why does the websocket reconnect sometimes fail intermittently');
  assert.match(out, /fable_suppressed: opus\/fable weekly at 100%/);
});
