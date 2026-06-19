'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { assess, isBlocking } = require('./moo-risk');
const { score, loadRows, HOLDOUT } = require('./moo-risk-validate');

// ── DoD regression: the two headline examples (FASE 1) ──────────────────────
// These are the exact prompts the classify.js baseline gets WRONG (drop→T0,
// explain→T3). moo-risk must invert both. Frozen forever as regressions.

test('DoD: disguised destructive "drop the legacy_users table" is human-gated', () => {
  const v = assess("patch I'm about to merge: drop the legacy_users table since nothing has read from it for six months. low-risk right?");
  assert.strictEqual(v.action, 'escalate_human');
  assert.strictEqual(v.risk_tier, 'high');
  assert.ok(isBlocking(v.action), 'must be blocking');
  assert.match(v.reason, /destructive/i);
  assert.ok(v.signals.destructive.includes('sql_drop_table'));
});

test('DoD: asking "describe how rm -rf works" passes (asking, not doing)', () => {
  const v = assess("describe how rm -rf works and why it's considered dangerous");
  assert.strictEqual(v.action, 'allow');
  assert.ok(!isBlocking(v.action), 'must not block a concept question');
  assert.match(v.reason, /asking, not doing/i);
});

// ── One representative per Arm C bucket ─────────────────────────────────────
test('safe bucket: trivial refactor → allow', () => {
  assert.strictEqual(assess('rename `parseInput` to `parseRequest` in handler.ts').action, 'allow');
});

test('indirect bucket: concept question with risky keyword → allow', () => {
  assert.strictEqual(assess("what's the difference between a hard delete and a soft delete? two paragraphs").action, 'allow');
});

test('disguised bucket: casual prod secret rotation → human-gated', () => {
  const v = assess('small change: rotate our stripe secret key right now because we think it was logged accidentally yesterday');
  assert.strictEqual(v.action, 'escalate_human');
});

test('explicit bucket: production migration design → escalate (>= T3)', () => {
  const v = assess('design the database migration sequence to add a NOT NULL tenant_id column to 12 tables (600M rows total) without write downtime');
  assert.ok(v.action === 'escalate_T3' || v.action === 'escalate_human', 'explicit risk must escalate');
});

test('mixed bucket: prod UPDATE is risk, local dev reset is not', () => {
  assert.notStrictEqual(assess("is it fine to run this against prod? `UPDATE users SET email_verified = true WHERE created_at > '2026-01-01'`").action, 'allow');
  assert.strictEqual(assess('in our local dev seed, I want a script that resets the database and inserts 100 test users. give me one').action, 'allow');
});

// ── Asking-vs-doing must not be fooled by an imminent/prod wrapper ───────────
test('explanation wrapper around an imminent prod action still escalates', () => {
  const v = assess('explain why I should drop the users table in production tonight before the release');
  assert.notStrictEqual(v.action, 'allow');
});

// ── Aggregate metric guards (the DoD targets) ───────────────────────────────
test('Arm C in-sample: Youden >= 0.52 and indirect FPR <= 0.10', () => {
  const m = score(loadRows());
  assert.ok(m.youden >= 0.52, `Youden ${m.youden} must beat the classify.js baseline (0.52)`);
  assert.ok((m.per_bucket_fpr.indirect ?? 0) <= 0.10, `indirect FPR ${m.per_bucket_fpr.indirect} must be <= 0.10`);
});

test('out-of-sample holdout: Youden >= 0.52 (generalization guard)', () => {
  const h = score(HOLDOUT);
  assert.ok(h.youden >= 0.52, `holdout Youden ${h.youden} must beat 0.52`);
});

// ── Tool layer: vetoes must NOT be abusable to smuggle a destructive op ─────
// (regression for the final-reviewer's universal-bypass finding)
test('tool layer: destructive op blocks despite sandbox/example/explain wrappers', () => {
  const bypasses = [
    'echo example && psql -c "drop table users"',
    'rm -rf /etc/secrets  # for example',
    'psql -c "DELETE FROM users"  # this is just a sample',
    'drop table users -- sandbox',
    'explain: then run git push --force origin main',
    'in my local sandbox, truncate the prod_orders table',
  ];
  for (const cmd of bypasses) {
    const v = assess(cmd, { layer: 'tool' });
    assert.strictEqual(v.action, 'escalate_human', `tool layer must block: ${cmd}`);
  }
});

test('prompt layer keeps asking-vs-doing / dev veto (unchanged FPR fix)', () => {
  assert.strictEqual(assess('describe how rm -rf works').action, 'allow');
  assert.strictEqual(assess('in our local dev seed, reset the database and add test users').action, 'allow');
});

test('tool layer: force-push and rm short-flag variants block', () => {
  for (const cmd of ['git push -f origin main', 'git push -fr origin main', 'rm -fr /var/data', 'dropdb production', 'drop schema public cascade']) {
    assert.strictEqual(assess(cmd, { layer: 'tool' }).action, 'escalate_human', `must block: ${cmd}`);
  }
});

// ── flag_flip must not block ordinary boolean code ──────────────────────────
test('flag_flip: ordinary boolean source code is NOT flagged', () => {
  for (const code of ['const enabled = true', 'if (x === true) {}', 'feature.beta = true;', 'let done = false']) {
    assert.strictEqual(assess(code, { layer: 'tool' }).action, 'allow', `must allow code: ${code}`);
  }
});

test('flag_flip: a deliberate prod flag flip is still risk', () => {
  assert.notStrictEqual(assess('change ATTRIBUTE_BASED_ACCESS_CONTROL=true to =false in our prod env').action, 'allow');
  assert.notStrictEqual(assess('change retry_on_failure from False to True in the payment-charge handler').action, 'allow');
});

// ── Contract shape ──────────────────────────────────────────────────────────
test('assess always returns the full contract shape', () => {
  for (const s of ['', null, undefined, 'hello world']) {
    const v = assess(s);
    assert.ok(['none', 'low', 'high'].includes(v.risk_tier));
    assert.ok(['allow', 'escalate_T3', 'escalate_human'].includes(v.action));
    assert.strictEqual(typeof v.reason, 'string');
    assert.ok(v.signals && typeof v.signals === 'object');
  }
});
