'use strict';
// prompt-traits.js — the write side keeps a hash + closed-vocabulary traits,
// the read side answers the same questions for legacy (prompt_preview) and new
// (prompt_sha256) decisions.log lines.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const t = require('./prompt-traits.js');

test('promptTraits: hash of the full prompt, fixed-vocabulary traits, no text field', () => {
  const prompt = 'pensa bem: refactor the auth flow in api.ts before we deploy';
  const r = t.promptTraits(prompt);
  assert.deepEqual(Object.keys(r).sort(), [
    'deliberate_high_tier', 'has_code_block', 'has_file_refs', 'is_system_prompt',
    'keyword_signals', 'prompt_sha256', 'tuning_exclude',
  ]);
  assert.equal(r.prompt_sha256, crypto.createHash('sha256').update(prompt, 'utf8').digest('hex'));
  assert.equal(r.tuning_exclude, true);
  assert.equal(r.deliberate_high_tier, true);
  assert.equal(r.has_file_refs, true);
  for (const k of r.keyword_signals) assert.ok(t.KEYWORD_ALLOW_LIST.has(k), k);
  // Nothing outside the allow-list survives: "auth" and "flow" are prompt words, not signals.
  const flat = JSON.stringify(r);
  for (const w of ['auth', 'flow', 'pensa', 'api.ts']) assert.ok(!flat.includes(w), `leaks ${w}`);
});

test('promptTraits tolerates non-string input', () => {
  const r = t.promptTraits(/** @type {any} */ (undefined));
  assert.equal(r.prompt_sha256, crypto.createHash('sha256').update('').digest('hex'));
  assert.deepEqual(r.keyword_signals, []);
});

test('line helpers: new lines use the stored traits, legacy lines re-derive from the preview', () => {
  const legacy = { prompt_preview: 'git push --force origin main and ultrathink' };
  const fresh = { prompt_sha256: 'a'.repeat(64), tuning_exclude: true, deliberate_high_tier: false, keyword_signals: ['deploy', 'not-allowed'] };
  assert.equal(t.lineHighRisk(legacy), true);
  assert.equal(t.lineDeliberateHighTier(legacy), true);
  assert.equal(t.lineHighRisk(fresh), true);
  assert.equal(t.lineDeliberateHighTier(fresh), false);
  // A stored signal outside the allow-list is dropped on read.
  assert.deepEqual(t.lineKeywordSignals(fresh), ['deploy']);
  assert.equal(t.lineHighRisk({}), false);
});

test('backtest.lineSignature: first 3 words for legacy, hash prefix for new, never text for new', () => {
  const { lineSignature } = require('./backtest.js');
  assert.equal(lineSignature({ prompt_preview: 'Explain this error please' }), 'explain this error');
  assert.equal(lineSignature({ prompt_sha256: 'abcdef0123456789ffff' }), 'sha:abcdef0123456789');
  assert.equal(lineSignature({}), '');
});

test('event-builder: a new-format HIGH_RISK line never enters the corpus; a safe one keeps its signals', () => {
  const { buildEvent } = require('./event-builder.js');
  const base = { event: 'classified', tier: 'T1', prompt_len: 40, confidence: 0.8, task_category: 'explain_error', ts: new Date().toISOString() };
  assert.equal(buildEvent({ ...base, ...t.promptTraits('git push --force origin main') }, [], null, {}), null);
  const ev = buildEvent({ ...base, ...t.promptTraits('explain this bug please') }, [], null, {});
  assert.ok(ev, 'safe line builds an event');
  assert.deepEqual(JSON.parse(ev.keyword_signals), ['explain', 'bug']); // stored as a JSON string column
});

test('migrate-prompt-preview: drops user text, keeps traits + excerpt hash, leaves tester lines and junk alone', () => {
  const { migrateText } = require('./migrate-prompt-preview.js');
  const user = { ts: 'x', event: 'classified', tier: 'T3', prompt_preview: 'deploy the zanzibar build now' };
  const tester = { event: 'tester_misrouting', prompt_preview: 'synthetic prompt' };
  const input = [JSON.stringify(user), JSON.stringify(tester), 'not json', JSON.stringify({ event: 'executed' }), ''].join('\n');
  const r = migrateText(input);
  assert.equal(r.migrated, 1);
  assert.equal(r.kept_synthetic, 1);
  const [m, t2, junk, other] = r.out.split('\n');
  assert.ok(!m.includes('zanzibar') && !('prompt_preview' in JSON.parse(m)));
  const mj = JSON.parse(m);
  assert.equal(mj.migrated_from_preview, true);
  assert.equal(mj.tuning_exclude, true);
  assert.equal(mj.prompt_preview_sha256, crypto.createHash('sha256').update(user.prompt_preview).digest('hex'));
  assert.equal(mj.prompt_sha256, undefined, 'the full-prompt hash cannot be recovered and is not faked');
  assert.equal(t2, JSON.stringify(tester));
  assert.equal(junk, 'not json');
  assert.equal(other, JSON.stringify({ event: 'executed' }));
  assert.equal(require('./backtest.js').lineSignature(mj), 'sha:' + mj.prompt_preview_sha256.slice(0, 16));
});

test('savings-tracker.isSystemPrompt: hook echoes stay out of the stats on new-format lines too', () => {
  const tracker = require('./savings-tracker.js');
  assert.equal(tracker.isSystemPrompt(t.promptTraits('<task-notification> done')), true);
  assert.equal(tracker.isSystemPrompt(t.promptTraits('que horas são')), false);
  assert.equal(tracker.isSystemPrompt({ prompt_preview: '<system-reminder> x' }), true); // legacy line
});

test('backtest: hash-only lines never become tuning patterns nor count as additional savings', () => {
  const { analyze, buildTuning } = require('./backtest.js');
  const now = Date.now();
  /** @type {any[]} */
  const decisions = [];
  for (let i = 0; i < 6; i++) {
    // short, low-confidence, high tier: exactly what feeds demote + promote pools
    decisions.push({ event: 'classified', ts: new Date(now + i).toISOString(), tier: 'T3', prompt_len: 12, confidence: 0.4,
      ...t.promptTraits('ok faz isso') });
  }
  const stats = analyze(decisions);
  const tuning = buildTuning(stats);
  const flat = JSON.stringify(tuning);
  assert.ok(!flat.includes('sha:'), `tuning leaked a sha signature: ${flat}`);
  assert.equal(stats.additionalSavings, 0);
  // Bite: the same lines as legacy text DO produce a pattern (the pool is live).
  const legacy = decisions.map((d) => ({ event: d.event, ts: d.ts, tier: d.tier, prompt_len: d.prompt_len, confidence: d.confidence, prompt_preview: 'ok faz isso' }));
  assert.ok(analyze(legacy).topDemote.length > 0, 'control: legacy lines reach the demote pool');
});
