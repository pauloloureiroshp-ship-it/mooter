'use strict';

// Wave 60.5 Block B — <reasoning-effort> emission in the router-hint.
// inject_context.js is a hook *script* (reads the payload on stdin, prints the
// hint), so we drive it as a subprocess like inject_context.test.js does.
//
// Two contracts:
//   1. When the module loads, the hint carries exactly one valid
//      <reasoning-effort>LEVEL</reasoning-effort> tag, placed after </router-hint>.
//   2. When the module is ABSENT (require fails), the tag is omitted and the rest
//      of the hint is byte-identical — the best-effort guarantee (DoD + invariant 6).

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const DIR = __dirname;
const SCRIPT = path.join(DIR, 'inject_context.js');
const MODULE = path.join(DIR, 'reasoning-effort.js');
const MODULE_PARKED = path.join(DIR, 'reasoning-effort.js.parked-for-test');

function runHook(prompt) {
  const env = Object.assign({}, process.env);
  delete env.MOOTER_PIN_MODEL;
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt, session_id: 'test-reasoning-effort' }),
    encoding: 'utf8',
    timeout: 15000,
    env,
  });
  return (res.stdout || '') + (res.stderr || '');
}

const RE_TAG = /<reasoning-effort>(none|low|medium|high)<\/reasoning-effort>/;

test('high-risk prompt → <reasoning-effort>high> in hint (HIGH_RISK floor)', () => {
  const out = runHook('redesign the architecture of the vault for multi-user access');
  assert.match(out, /<reasoning-effort>high<\/reasoning-effort>/, 'architecture prompt must floor to high');
});

test('tag carries exactly one valid level, placed after </router-hint>', () => {
  const out = runHook('redesign the architecture of the vault for multi-user access');
  const matches = out.match(/<reasoning-effort>/g) || [];
  assert.equal(matches.length, 1, 'exactly one reasoning-effort tag');
  assert.match(out, RE_TAG, 'level is one of none|low|medium|high');
  const hintEnd = out.indexOf('</router-hint>');
  const tagAt = out.indexOf('<reasoning-effort>');
  assert.ok(hintEnd >= 0 && tagAt > hintEnd, 'tag emitted after the router-hint block');
});

test('module absent → tag omitted AND hint byte-identical (best-effort guarantee)', () => {
  const prompt = 'redesign the architecture of the vault for multi-user access';
  const withMod = runHook(prompt);
  let without;
  fs.renameSync(MODULE, MODULE_PARKED);
  try {
    without = runHook(prompt);
  } finally {
    fs.renameSync(MODULE_PARKED, MODULE); // always restore, even on assert failure
  }
  // 1. absent → no tag at all.
  assert.ok(!RE_TAG.test(without), 'no reasoning-effort tag when the module is absent');
  // 2. additive only: Block B pushes two array entries (a blank line + the tag).
  //    Removing exactly those two lines from the with-module output must
  //    reproduce the module-absent output byte-for-byte.
  const wm = withMod.split('\n');
  const idx = wm.findIndex((l) => /^<reasoning-effort>/.test(l));
  assert.ok(idx > 0, 'tag line found with a preceding blank line');
  assert.equal(wm[idx - 1], '', 'the line Block B adds before the tag is blank');
  wm.splice(idx - 1, 2); // drop the blank line + the tag line
  assert.equal(wm.join('\n'), without, 'hint is byte-identical apart from the added blank+tag');
});
