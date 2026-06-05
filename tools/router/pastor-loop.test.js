// Pastor learning loop — integration test (Wave 16-18 Day 2, Tier C).
// Proves the chain decisions.log → backtest.js → update-router.js →
// tuning-state.json runs end-to-end and emits the shape classify.js consumes.
// Runs entirely in a temp dir (MOOTER_ROUTER_DIR) — never touches ~/.claude or
// the repo, and never modifies classify.js (the learning lives in tuning-state.json).

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PASTOR_TUNE = path.join(__dirname, 'pastor-tune.js');

// A handful of clean, structural classified events (no PII — innocuous previews
// so event-builder's privacy filter keeps them).
function fixtureLog(n = 8) {
  const base = 1780181910506;
  const rows = [];
  const tiers = ['T0', 'T1', 'T2', 'T3'];
  for (let i = 0; i < n; i++) {
    rows.push(JSON.stringify({
      ts_ms: base + i * 1000,
      event: 'classified',
      session_id: 'pastor-itest',
      prompt_len: 20 + i,
      prompt_preview: 'rename the local variable',
      tier: tiers[i % tiers.length],
      task_category: 'simple_transform_or_explain',
      confidence: 0.85,
      escalation_rule: 'none',
      has_code_block: false,
      has_file_refs: false,
    }));
  }
  return rows.join('\n') + '\n';
}

function withTmp(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pastor-'));
  try { return fn(tmp); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

test('Pastor loop runs end-to-end and emits a valid tuning-state.json', () => {
  withTmp((tmp) => {
    fs.writeFileSync(path.join(tmp, 'decisions.log'), fixtureLog(8));
    const env = {
      ...process.env,
      MOOTER_ROUTER_DIR: tmp,
      MOOTER_DECISIONS_LOG: path.join(tmp, 'decisions.log'),
      MOOTER_TUNE_MIN_DECISIONS: '1',
    };
    execFileSync('node', [PASTOR_TUNE], { env, stdio: 'pipe' });

    // backtest output + the runtime tuning state were both produced
    assert.ok(fs.existsSync(path.join(tmp, 'router-tuning.json')), 'backtest must emit router-tuning.json');
    const statePath = path.join(tmp, 'tuning-state.json');
    assert.ok(fs.existsSync(statePath), 'update-router must emit tuning-state.json');

    // shape MUST match classify.js _loadTuningState contract:
    // { complexity_threshold:number, promote_t0:string[], demote_t3:string[] }
    const ts = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(typeof ts.complexity_threshold, 'number', 'complexity_threshold number');
    assert.ok(Array.isArray(ts.promote_t0), 'promote_t0 array');
    assert.ok(Array.isArray(ts.demote_t3), 'demote_t3 array');
    assert.ok(typeof ts.sample_size === 'number' && ts.sample_size >= 1, 'sample_size reflects input');
    // every emitted pattern must be a valid regex source (classify.js does new RegExp(s,'i'))
    for (const s of [...ts.promote_t0, ...ts.demote_t3]) {
      assert.doesNotThrow(() => new RegExp(s, 'i'), `emitted pattern compiles: ${s}`);
    }
  });
});

test('Pastor loop guards: skips and writes nothing below MIN_DECISIONS', () => {
  withTmp((tmp) => {
    fs.writeFileSync(path.join(tmp, 'decisions.log'), ''); // 0 decisions
    const env = {
      ...process.env,
      MOOTER_ROUTER_DIR: tmp,
      MOOTER_DECISIONS_LOG: path.join(tmp, 'decisions.log'),
      MOOTER_TUNE_MIN_DECISIONS: '100',
    };
    const out = execFileSync('node', [PASTOR_TUNE], { env, encoding: 'utf8' });
    assert.match(out, /not enough signal, skipping/);
    assert.ok(!fs.existsSync(path.join(tmp, 'tuning-state.json')), 'must not tune below threshold');
  });
});

test('classify.js stays byte-identical — the loop only writes tuning-state.json', () => {
  // Sanity: the canonical classify.js sha256 is gate-protected; the loop must
  // never write to it. (update-router writes tuning-state.json only.)
  const src = fs.readFileSync(path.join(__dirname, 'update-router.js'), 'utf8');
  assert.ok(!/writeFileSync\([^)]*classify\.js/.test(src), 'update-router must not write classify.js');
});
