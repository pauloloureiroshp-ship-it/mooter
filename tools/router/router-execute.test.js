#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * router-execute.test.js — Wave-2 executor invariants (I1..I10 from SPEC §9).
 *
 * Phased coverage:
 *   T-05  → I1, I1b, I2, I3, I3b, I3c            (defer cases)
 *   T-06  → I7, I7b                              (chain construction)
 *   T-07  → I4, I5, I6, I9                       (dispatch loop)
 *   T-08  → I10                                  (telemetry + sanitisation)
 *   T-09  → I8                                   (calibration trigger)
 *
 * Each phase appends to this file under its own describe-style header.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runExecutorWithFixture, reset } = require('./router-execute.harness');

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'router-execute.fixtures.json'), 'utf8')
);

function fixtureById(id) {
  const f = FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`fixture not found: ${id}`);
  return f;
}

// ── T-05 — defer cases (I1, I1b, I2, I3, I3b) ───────────────────────────

test('I1: T3 classification always defers to model-architect', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I1_t3_always_defers') });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-architect');
  assert.equal(result.reason, 'tier_t3');
  assert.deepEqual(result.fallback_chain, []);
  assert.equal(result.classification_ref.tier, 'T3');
});

test('I1b: T3 defers even when codex_cli is mocked to succeed', async () => {
  reset();
  const { result, telemetryWrites } = await runExecutorWithFixture({
    fixture: fixtureById('I1b_t3_defers_even_when_codex_available'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-architect');
  assert.equal(result.reason, 'tier_t3');
  // No provider was tried — chain stays empty even though codex would have succeeded.
  assert.deepEqual(result.fallback_chain, []);
  // Telemetry must still record the defer.
  assert.equal(telemetryWrites.length, 1);
  assert.equal(telemetryWrites[0].outcome, 'deferred');
});

test('I2: T3 with high_risk signal defers with reason high_risk_floor', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I2_high_risk_floor') });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-architect');
  assert.equal(result.reason, 'high_risk_floor');
  assert.deepEqual(result.fallback_chain, []);
});

test('I3: user_override pinning Opus defers to model-architect with reason user_override', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I3_user_override_opus') });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-architect');
  assert.equal(result.reason, 'user_override');
  assert.deepEqual(result.fallback_chain, []);
});

test('I3b: user_override pinning Haiku defers to cheap-triage', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I3b_user_override_haiku') });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'cheap-triage');
  assert.equal(result.reason, 'user_override');
});

test('I3c: user_override pinning Sonnet defers to model-reasoner (boundary, not in fixtures)', async () => {
  reset();
  const handcrafted = {
    prompt: 'use sonnet to reason about this',
    classification: {
      tier: 'T2',
      confidence: 0.99,
      recommended_backend: 'claude_subagent',
      recommended_model: 'claude-sonnet-4-6',
      suggested_providers: ['sonnet'],
      task_category: 'reasoning',
      escalation_rule: 'user_override_positive',
      reasoning: 'override_positive=sonnet',
      user_override: {
        kind: 'positive',
        requested: 'sonnet',
        label: 'Sonnet',
        honored: true,
        original_tier: 'T1',
      },
    },
    provider_state: {},
    provider_mocks: {},
  };
  const { result } = await runExecutorWithFixture({ fixture: handcrafted });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-reasoner');
  assert.equal(result.reason, 'user_override');
});

test('classification_ref carries tier, confidence, task_category', async () => {
  reset();
  const { result } = await runExecutorWithFixture({ fixture: fixtureById('I1_t3_always_defers') });
  assert.equal(result.classification_ref.tier, 'T3');
  assert.equal(result.classification_ref.confidence, 0.85);
  assert.equal(result.classification_ref.task_category, 'architecture');
});

test('execute() with a missing classification returns a structured error', async () => {
  reset();
  const handcrafted = {
    prompt: 'noop',
    classification: null,
    provider_state: {},
    provider_mocks: {},
  };
  const { result } = await runExecutorWithFixture({ fixture: handcrafted });
  assert.equal(result.ok, false);
  assert.ok(result.errors && result.errors.length >= 1);
  assert.equal(result.reason, 'classification_invalid');
});

test('execute() never throws — all error paths produce a structured value', async () => {
  reset();
  const handcrafted = {
    prompt: 'noop',
    classification: { tier: 'T0', confidence: 0.5 }, // missing required-ish fields
    provider_state: {},
    provider_mocks: {},
  };
  // Should resolve, not reject, even with sparse classification.
  const out = await runExecutorWithFixture({ fixture: handcrafted });
  assert.ok(out && out.result);
  assert.equal(typeof out.result.ok, 'boolean');
});

// ── T-06 — fallback chain resolution (I7, I7b) ──────────────────────────

const { _internal } = require('./router-execute');

test('resolveFallbackChain: T2 with claude=ok keeps chain unchanged', () => {
  const chain = _internal.resolveFallbackChain(
    { tier: 'T2', suggested_providers: ['sonnet'] },
    { claude: 'ok', codex_cli: 'ok', ollama: 'ok' }
  );
  assert.deepEqual(chain, ['sonnet']);
});

test('I7: T2 with claude=degraded prepends codex_cli', () => {
  const chain = _internal.resolveFallbackChain(
    { tier: 'T2', suggested_providers: ['sonnet'] },
    { claude: 'degraded', codex_cli: 'ok', ollama: 'ok' }
  );
  assert.deepEqual(chain, ['codex_cli', 'sonnet']);
});

test('T1 with claude=degraded prepends codex_cli when available', () => {
  const chain = _internal.resolveFallbackChain(
    { tier: 'T1', suggested_providers: ['haiku'] },
    { claude: 'degraded', codex_cli: 'ok', ollama: 'ok' }
  );
  assert.deepEqual(chain, ['codex_cli', 'haiku']);
});

test('T1 with claude=degraded falls back to ollama when codex unavailable', () => {
  const chain = _internal.resolveFallbackChain(
    { tier: 'T1', suggested_providers: ['haiku'] },
    { claude: 'degraded', codex_cli: 'unavailable', ollama: 'ok' }
  );
  assert.deepEqual(chain, ['ollama', 'haiku']);
});

test('T2 with claude=degraded but codex unavailable does NOT inject ollama', () => {
  // T2 reasoning is too weak for Ollama — doctrine: prefer waiting for
  // sonnet rather than serving a bad answer.
  const chain = _internal.resolveFallbackChain(
    { tier: 'T2', suggested_providers: ['sonnet'] },
    { claude: 'degraded', codex_cli: 'unavailable', ollama: 'ok' }
  );
  assert.deepEqual(chain, ['sonnet']);
});

test('I7b: T3 with claude=degraded does NOT prepend anything (architecture work waits)', () => {
  const chain = _internal.resolveFallbackChain(
    { tier: 'T3', suggested_providers: ['opus'] },
    { claude: 'degraded', codex_cli: 'ok', ollama: 'ok' }
  );
  assert.deepEqual(chain, ['opus']);
});

test('codex_cli=exhausted is dropped from the chain', () => {
  const chain = _internal.resolveFallbackChain(
    { tier: 'T1', suggested_providers: ['codex_cli', 'haiku'] },
    { claude: 'ok', codex_cli: 'exhausted', ollama: 'ok' }
  );
  assert.deepEqual(chain, ['haiku']);
});

test('ollama=down is dropped from the chain', () => {
  const chain = _internal.resolveFallbackChain(
    { tier: 'T0', suggested_providers: ['ollama'] },
    { claude: 'ok', codex_cli: 'ok', ollama: 'down' }
  );
  assert.deepEqual(chain, []);
});

test('chain entries are normalised to lowercase', () => {
  const chain = _internal.resolveFallbackChain(
    { tier: 'T1', suggested_providers: ['Codex_CLI', 'HAIKU'] },
    { claude: 'ok', codex_cli: 'ok', ollama: 'ok' }
  );
  assert.deepEqual(chain, ['codex_cli', 'haiku']);
});

test('isAnthropicProvider classifies tier correctly', () => {
  assert.equal(_internal.isAnthropicProvider('haiku'), true);
  assert.equal(_internal.isAnthropicProvider('sonnet'), true);
  assert.equal(_internal.isAnthropicProvider('opus'), true);
  assert.equal(_internal.isAnthropicProvider('claude'), true);
  assert.equal(_internal.isAnthropicProvider('codex_cli'), false);
  assert.equal(_internal.isAnthropicProvider('ollama'), false);
  assert.equal(_internal.isAnthropicProvider(undefined), false);
});

// Integration via execute(): T1 default chain ['haiku'] resolves to all-Anthropic
// → defer cheap-triage with reason 'anthropic_only_chain'. Pre-T-07 verifies
// the new code path is wired correctly.
test('execute(): T1 default chain [haiku] resolves to all-Anthropic and defers cheap-triage', async () => {
  reset();
  const handcrafted = {
    prompt: 'explain TypeError: x is not a function',
    classification: {
      tier: 'T1',
      confidence: 0.85,
      recommended_backend: 'anthropic_api',
      recommended_model: 'claude-haiku-4-5-20251001',
      suggested_providers: ['haiku'],
      task_category: 'explain_error',
      escalation_rule: 'none',
    },
    provider_state: { claude: 'ok', codex_cli: 'ok', ollama: 'ok' },
    provider_mocks: {},
  };
  const { result } = await runExecutorWithFixture({ fixture: handcrafted });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'cheap-triage');
  assert.equal(result.reason, 'anthropic_only_chain');
  assert.deepEqual(result.fallback_chain, []);
});

test('execute(): T2 with degraded claude+codex but no wrapper provided fails with wrapper_missing → defers to model-reasoner', async () => {
  reset();
  const handcrafted = {
    prompt: 'compare mutex vs semaphore for our worker pool',
    classification: {
      tier: 'T2',
      confidence: 0.78,
      recommended_backend: 'claude_subagent',
      recommended_model: 'claude-sonnet-4-6',
      suggested_providers: ['sonnet'],
      task_category: 'reasoning',
      escalation_rule: 'none',
    },
    provider_state: { claude: 'degraded', codex_cli: 'ok', ollama: 'ok' },
    provider_mocks: {},  // no wrapper for codex_cli — dispatch records wrapper_missing
  };
  const { result } = await runExecutorWithFixture({ fixture: handcrafted });
  // codex_cli prepended via T-06 injection, but no wrapper → records error,
  // continues to next chain entry (sonnet, Anthropic) → defers to reasoner.
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'model-reasoner');
  assert.equal(result.reason, 'all_non_anthropic_failed');
  assert.deepEqual(result.fallback_chain, ['codex_cli']);
  assert.equal(result.errors[0].code, 'wrapper_missing');
});

// ── T-07 — dispatch loop (I4, I5, I6, I9) ───────────────────────────────

test('I4: codex_cli returns null → defer cheap-triage with all_non_anthropic_failed', async () => {
  reset();
  const { result, telemetryWrites } = await runExecutorWithFixture({
    fixture: fixtureById('I4_codex_fails_defers_to_triage'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'cheap-triage');
  assert.equal(result.reason, 'all_non_anthropic_failed');
  assert.deepEqual(result.fallback_chain, ['codex_cli']);
  assert.ok(result.errors && result.errors.length >= 1);
  assert.equal(result.errors[0].provider, 'codex_cli');
  assert.equal(telemetryWrites.length, 1);
  assert.equal(telemetryWrites[0].outcome, 'deferred');
});

test('I5: codex_cli returns ok → ExecuteResult_Ok with provider_used=codex_cli', async () => {
  reset();
  const { result, telemetryWrites } = await runExecutorWithFixture({
    fixture: fixtureById('I5_codex_succeeds'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider_used, 'codex_cli');
  assert.equal(result.model_used, 'gpt-5-codex');
  assert.deepEqual(result.fallback_chain, ['codex_cli']);
  assert.ok(result.text && result.text.length > 0);
  assert.equal(telemetryWrites.length, 1);
  assert.equal(telemetryWrites[0].outcome, 'ok');
  assert.equal(telemetryWrites[0].provider_used, 'codex_cli');
});

test('I6: T0 ollama success records usage exactly once on tracker', async () => {
  reset();
  const { result, tracker } = await runExecutorWithFixture({
    fixture: fixtureById('I6_t0_ollama_records_usage_once'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.provider_used, 'ollama');
  // Mock provider mirrors real wrapper: records usage once on success.
  assert.equal(tracker._calls.length, 1);
  assert.equal(tracker._calls[0].provider, 'ollama');
});

test('I9: provider throws → ExecuteResult_Error with reason all_providers_failed', async () => {
  reset();
  const { result } = await runExecutorWithFixture({
    fixture: fixtureById('I9_provider_throws'),
  });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'cheap-triage'); // T0 fallback subagent
  assert.equal(result.reason, 'all_providers_failed');
  assert.deepEqual(result.fallback_chain, ['ollama']);
  assert.ok(result.errors && result.errors.length === 1);
  assert.equal(result.errors[0].provider, 'ollama');
  assert.match(result.errors[0].message, /ECONNREFUSED/);
});

test('Mid-chain success: codex returns ok → no defer even if haiku is later in chain', async () => {
  reset();
  const handcrafted = {
    prompt: 'rename foo to bar',
    classification: {
      tier: 'T1',
      confidence: 0.9,
      recommended_backend: 'anthropic_api',
      recommended_model: 'claude-haiku-4-5-20251001',
      suggested_providers: ['codex_cli', 'haiku'],
      task_category: 'mechanical_trivial',
      escalation_rule: 'none',
    },
    provider_state: { claude: 'ok', codex_cli: 'ok', ollama: 'ok' },
    provider_mocks: {
      codex_cli: { ok: true, text: 'renamed', model: 'gpt-5-codex', tokens_in: 50, tokens_out: 20, cost_usd: 0, duration_ms: 800 },
    },
  };
  const { result } = await runExecutorWithFixture({ fixture: handcrafted });
  assert.equal(result.ok, true);
  assert.equal(result.provider_used, 'codex_cli');
  // haiku never reached — chain is just what was dispatched.
  assert.deepEqual(result.fallback_chain, ['codex_cli']);
});

test('Soft failure then mid-chain Anthropic: codex null → defer cheap-triage with one error', async () => {
  // Same as I4 but verifies the precise telemetry outcome label.
  reset();
  const handcrafted = {
    prompt: 'rename foo to bar',
    classification: {
      tier: 'T1',
      confidence: 0.9,
      suggested_providers: ['codex_cli', 'haiku'],
      task_category: 'mechanical_trivial',
      escalation_rule: 'none',
    },
    provider_state: { claude: 'ok', codex_cli: 'ok', ollama: 'ok' },
    provider_mocks: { codex_cli: null },
  };
  const { result, telemetryWrites } = await runExecutorWithFixture({ fixture: handcrafted });
  assert.equal(result.ok, false);
  assert.equal(result.defer_to_subagent, 'cheap-triage');
  assert.equal(result.reason, 'all_non_anthropic_failed');
  assert.equal(result.fallback_chain.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, 'wrapper_returned_null');
  assert.equal(telemetryWrites[0].outcome, 'deferred');
});

test('execute() never throws on async wrapper rejection — error captured in result', async () => {
  reset();
  const handcrafted = {
    prompt: 'p',
    classification: {
      tier: 'T0',
      confidence: 0.9,
      suggested_providers: ['ollama'],
      task_category: 'summarization',
      escalation_rule: 'none',
    },
    provider_state: { claude: 'ok', codex_cli: 'ok', ollama: 'ok' },
    provider_mocks: { ollama: { throws: 'spurious failure' } },
  };
  const out = await runExecutorWithFixture({ fixture: handcrafted });
  assert.ok(out.result);
  assert.equal(out.result.ok, false);
  assert.equal(out.result.errors[0].code, 'wrapper_threw');
  assert.match(out.result.errors[0].message, /spurious failure/);
});

// ── T-08 — telemetry write-through (I10 + disk write) ───────────────────

const os = require('node:os');
// fs and path are already required at the top of this file.

test('I10: prompt_preview redacts API keys, bearer tokens, and KEY=value patterns', () => {
  const r = _internal.sanitisePromptPreview(
    'use OPENAI_API_KEY=sk-proj-abcdef1234567890 to debug, also Bearer eyJhbGciOiJIUzI1Ni'
  );
  assert.ok(!r.includes('sk-proj-abcdef1234567890'), 'sk-proj key must be redacted');
  assert.ok(!r.includes('Bearer eyJhbGciOiJIUzI1Ni'), 'bearer token must be redacted');
  assert.ok(r.includes('[REDACTED]'));
  assert.ok(r.length <= 80, 'preview is capped at 80 chars');
});

test('I10: sanitisePromptPreview redacts ghp_ and AIza patterns', () => {
  const a = _internal.sanitisePromptPreview('GitHub PAT ghp_abcdefghijklmnopqrstuv1234');
  const b = _internal.sanitisePromptPreview('Google AIzaSyCabcdefghij1234567890abc');
  assert.ok(!a.includes('ghp_abcdefghijklmnopqrstuv'));
  assert.ok(!b.includes('AIzaSyCabcdefghij1234567890abc'));
});

test('I10: redacts GitHub PATs across all five prefixes (ghp/gho/ghu/ghs/ghr)', () => {
  for (const p of ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_']) {
    const token = p + 'abcdefghijklmnopqrstuv1234';
    const r = _internal.sanitisePromptPreview(`GitHub ${token} for repo`);
    assert.ok(!r.includes(token), `expected redaction for ${p} prefix in: ${r}`);
  }
});

test('I10: redacts AWS access key IDs (AKIA...)', () => {
  const r = _internal.sanitisePromptPreview('use AKIAIOSFODNN7EXAMPLE to upload backups');
  assert.ok(!r.includes('AKIAIOSFODNN7EXAMPLE'), `not redacted: ${r}`);
  assert.ok(r.includes('[REDACTED]'));
});

test('I10: redacts GitLab PATs (glpat-...)', () => {
  const r = _internal.sanitisePromptPreview('GITLAB_TOKEN=glpat-abcdef1234567890qrstuv');
  assert.ok(!r.includes('glpat-abcdef1234567890qrstuv'), `not redacted: ${r}`);
  assert.ok(r.includes('[REDACTED]'));
});

test('I10: redacts Slack tokens (xoxb/xoxp/xoxa/xoxr/xoxs)', () => {
  for (const p of ['xoxb-', 'xoxp-', 'xoxa-', 'xoxr-', 'xoxs-']) {
    const token = p + '1234-5678-9abcdefghijk';
    const r = _internal.sanitisePromptPreview(`SLACK ${token}`);
    assert.ok(!r.includes(token), `expected redaction for ${p} in: ${r}`);
  }
});

test('I10: redacts JWT tokens (eyJ.X.Y)', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4fwp';
  const r = _internal.sanitisePromptPreview(`Authorization: ${jwt} expired`);
  assert.ok(!r.includes(jwt.slice(0, 40)), `not redacted: ${r}`);
});

test('I10: redacts Azure SharedAccessSignature', () => {
  const r = _internal.sanitisePromptPreview('uri SharedAccessSignature sv=2020-08-04&ss=b&sig=abc');
  assert.ok(!r.includes('sv=2020-08-04'), `not redacted: ${r}`);
});

test('I10: redacts generic credential env-vars (SECRET_KEY, ACCESS_TOKEN, etc)', () => {
  const cases = [
    'SECRET_KEY=topsecret123',
    'ACCESS_TOKEN=ya29.aBcDeFgHiJ',
    'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    'AZURE_CLIENT_SECRET=Q1abcdefghij~',
    'GITLAB_TOKEN=glpat-shortbutset',
  ];
  for (const c of cases) {
    const r = _internal.sanitisePromptPreview(c);
    const value = c.split('=')[1];
    assert.ok(!r.includes(value), `expected redaction for "${c}", got: ${r}`);
  }
});

test('I10: sanitisePromptPreview tolerates non-string and empty input', () => {
  assert.equal(_internal.sanitisePromptPreview(undefined), '');
  assert.equal(_internal.sanitisePromptPreview(null), '');
  assert.equal(_internal.sanitisePromptPreview(''), '');
  // Numbers / objects pass through as ''.
  assert.equal(_internal.sanitisePromptPreview(/** @type {any} */ (42)), '');
});

test('appendDecisionsLog writes one JSONL line under MOOTER_DECISIONS_LOG override', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-exec-tel-'));
  const tmpLog = path.join(tmpDir, 'decisions.log');
  const SAVED = process.env.MOOTER_DECISIONS_LOG;
  process.env.MOOTER_DECISIONS_LOG = tmpLog;
  try {
    _internal.appendDecisionsLog({
      ts: '2026-05-07T18:42:11.234Z',
      event: 'executed',
      tier: 'T1',
      outcome: 'ok',
      provider_used: 'codex_cli',
    });
    const lines = fs.readFileSync(tmpLog, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.event, 'executed');
    assert.equal(parsed.provider_used, 'codex_cli');
  } finally {
    if (SAVED === undefined) delete process.env.MOOTER_DECISIONS_LOG;
    else process.env.MOOTER_DECISIONS_LOG = SAVED;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

test('appendDecisionsLog: best-effort on unwritable path (no throw)', () => {
  const SAVED = process.env.MOOTER_DECISIONS_LOG;
  process.env.MOOTER_DECISIONS_LOG = '/nonexistent/dir/that/cannot/exist/decisions.log';
  try {
    assert.doesNotThrow(() => _internal.appendDecisionsLog({ event: 'executed' }));
  } finally {
    if (SAVED === undefined) delete process.env.MOOTER_DECISIONS_LOG;
    else process.env.MOOTER_DECISIONS_LOG = SAVED;
  }
});

test('postToSavingsTracker: best-effort on unreachable port (no throw)', () => {
  const SAVED = process.env.MOOTER_TRACKER_PORT;
  process.env.MOOTER_TRACKER_PORT = '64999'; // unbound port
  try {
    assert.doesNotThrow(() => _internal.postToSavingsTracker({ event: 'executed' }));
  } finally {
    if (SAVED === undefined) delete process.env.MOOTER_TRACKER_PORT;
    else process.env.MOOTER_TRACKER_PORT = SAVED;
  }
});

test('defaultTelemetryWriter does not throw on any input shape', () => {
  assert.doesNotThrow(() => _internal.defaultTelemetryWriter({ event: 'executed' }));
  assert.doesNotThrow(() => _internal.defaultTelemetryWriter({}));
  assert.doesNotThrow(() => _internal.defaultTelemetryWriter(/** @type {any} */ (null)));
});

test('execute() with no telemetryWriter dep falls back to defaultTelemetryWriter (smoke)', async () => {
  // Don't assert side effects — just confirm execute() does not throw
  // when no telemetryWriter is provided in deps. Production path.
  const handcrafted = {
    prompt: 'rename foo to bar',
    classification: {
      tier: 'T1',
      confidence: 0.9,
      suggested_providers: ['haiku'],
      task_category: 'mechanical_trivial',
      escalation_rule: 'none',
    },
  };
  // Direct execute() call without harness — bypasses harness's telemetryWriter override.
  delete require.cache[require.resolve('./router-execute')];
  const { execute } = require('./router-execute');
  const SAVED = process.env.MOOTER_TRACKER_PORT;
  process.env.MOOTER_TRACKER_PORT = '64998';
  try {
    const result = await execute({ prompt: handcrafted.prompt, classification: handcrafted.classification });
    assert.equal(result.ok, false);
    assert.equal(result.defer_to_subagent, 'cheap-triage');
  } finally {
    if (SAVED === undefined) delete process.env.MOOTER_TRACKER_PORT;
    else process.env.MOOTER_TRACKER_PORT = SAVED;
  }
});

test('I10 (e2e): executed telemetry record has redacted prompt_preview', async () => {
  reset();
  const handcrafted = {
    prompt: 'use OPENAI_API_KEY=sk-proj-abcdef1234567890 to debug rate limiter',
    classification: {
      tier: 'T1',
      confidence: 0.85,
      suggested_providers: ['haiku'],
      task_category: 'explain_error',
      escalation_rule: 'none',
    },
    provider_state: {},
    provider_mocks: {},
  };
  const { telemetryWrites } = await runExecutorWithFixture({ fixture: handcrafted });
  assert.equal(telemetryWrites.length, 1);
  const preview = telemetryWrites[0].prompt_preview;
  assert.ok(!preview.includes('sk-proj-abcdef1234567890'),
    `expected redaction in: ${preview}`);
  assert.ok(preview.includes('[REDACTED]'));
});

// ── T-09 — calibration trigger (I8) ─────────────────────────────────────

const { runExecutorLoop } = require('./router-execute.harness');

async function withTempCalibrationState(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-calib-'));
  const tmpStatePath = path.join(tmpDir, '.calibration-state.json');
  const SAVED = process.env.MOOTER_CALIBRATION_STATE;
  process.env.MOOTER_CALIBRATION_STATE = tmpStatePath;
  try { return await fn(tmpStatePath); }
  finally {
    if (SAVED === undefined) delete process.env.MOOTER_CALIBRATION_STATE;
    else process.env.MOOTER_CALIBRATION_STATE = SAVED;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

test('I8: 1000 simulated executions trigger calibration spy exactly once', async () => {
  await withTempCalibrationState(async () => {
    reset();
    // Reset module-level counter via require cache flush.
    const { _internal } = require('./router-execute');
    _internal._resetCalibrationState();
    const fixture = fixtureById('I8_calibration_trigger_simple');
    const { spawnCount } = await runExecutorLoop({ fixture, times: 1000 });
    // Exactly one trigger event for the 1000th call.
    const triggers = spawnCount; // calibrationSpy receives one entry per fire/skip
    assert.equal(triggers, 1, `expected 1 calibration event after 1000 calls, got ${triggers}`);
  });
});

test('I8: 999 executions do NOT trigger calibration (just under threshold)', async () => {
  await withTempCalibrationState(async () => {
    reset();
    const { _internal } = require('./router-execute');
    _internal._resetCalibrationState();
    const fixture = fixtureById('I8_calibration_trigger_simple');
    const { spawnCount } = await runExecutorLoop({ fixture, times: 999 });
    assert.equal(spawnCount, 0);
  });
});

test('Calibration: second 1000-call cycle within 24h emits skipped event, not triggered', async () => {
  await withTempCalibrationState(async (statePath) => {
    reset();
    const { _internal } = require('./router-execute');
    _internal._resetCalibrationState();
    // Simulate that the first calibration ran 5 minutes ago.
    fs.writeFileSync(statePath, JSON.stringify({
      last_run_at: Date.now() - 5 * 60 * 1000,
      exec_counter: 1000,
    }));
    const fixture = fixtureById('I8_calibration_trigger_simple');
    const { calibrationEvents } = await runExecutorLoop({ fixture, times: 1000 });
    // The 1000th call hits %1000===0 → emits 'calibration_skipped' (within 24h).
    assert.equal(calibrationEvents.length, 1,
      `expected 1 event after 1000 calls, got ${calibrationEvents.length}`);
    assert.equal(calibrationEvents[0].type, 'calibration_skipped');
    assert.equal(calibrationEvents[0].reason, 'within_24h_window');
  });
});

test('readCalibrationState: tolerates missing file', async () => {
  await withTempCalibrationState(async () => {
    const { _internal } = require('./router-execute');
    const state = _internal.readCalibrationState();
    assert.equal(state.last_run_at, 0);
    assert.equal(state.exec_counter, 0);
  });
});

test('readCalibrationState: tolerates malformed JSON', async () => {
  await withTempCalibrationState(async (statePath) => {
    fs.writeFileSync(statePath, 'not valid json {{{');
    const { _internal } = require('./router-execute');
    const state = _internal.readCalibrationState();
    assert.equal(state.last_run_at, 0);
    assert.equal(state.exec_counter, 0);
  });
});

test('CALIBRATION_INTERVAL is 1000 and CALIBRATION_MIN_GAP_MS is 24h', () => {
  const { _internal } = require('./router-execute');
  assert.equal(_internal.CALIBRATION_INTERVAL, 1000);
  assert.equal(_internal.CALIBRATION_MIN_GAP_MS, 24 * 60 * 60 * 1000);
});

test('execute() with skipCalibrationCheck does not trigger calibration', async () => {
  await withTempCalibrationState(async () => {
    reset();
    const { _internal } = require('./router-execute');
    _internal._resetCalibrationState();
    const { execute } = require('./router-execute');
    const calibrationSpawns = [];
    const handcrafted = {
      tier: 'T0',
      confidence: 0.9,
      suggested_providers: ['ollama'],
      task_category: 'summarization',
      escalation_rule: 'none',
    };
    // Run 1000 with skipCalibrationCheck — must not fire even at the threshold.
    for (let i = 0; i < 1000; i++) {
      await execute({
        prompt: 'p',
        classification: handcrafted,
        options: {
          skipCalibrationCheck: true,
          __deps: {
            providers: { ollama: async () => ({ ok: true, text: 'x', model: 'qwen2.5:3b', tokens_in: 1, tokens_out: 1, cost_usd: 0, duration_ms: 10 }) },
            tracker: { recordUsage(){}, summary(){return{};}, shouldPreferCodex(){return false;} },
            providerState: { claude: 'ok', codex_cli: 'ok', ollama: 'ok' },
            telemetryWriter: () => {},
            calibrationSpy: (e) => calibrationSpawns.push(e),
          },
        },
      });
    }
    assert.equal(calibrationSpawns.length, 0,
      `skipCalibrationCheck must suppress all triggers; got ${calibrationSpawns.length}`);
  });
});

// ── T-10 — CLI smoke ────────────────────────────────────────────────────

const { spawnSync } = require('node:child_process');

function spawnCli(prompt, env = {}) {
  return spawnSync(process.execPath, [
    path.join(__dirname, 'router-execute.js'),
    prompt,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MOCK_PROVIDERS: '1',
      MOOTER_TRACKER_PORT: '64995', // unbound — telemetry is best-effort
      ...env,
    },
    timeout: 10_000,
  });
}

test('CLI: high_risk T3 prompt defers to model-architect with reason tier_t3', () => {
  const r = spawnCli('deploy this to production right now');
  assert.equal(r.status, 0, `CLI exit non-zero: ${r.stderr}`);
  const json = JSON.parse(r.stdout);
  assert.equal(json.defer_to_subagent, 'model-architect');
  assert.equal(json.reason, 'tier_t3');
});

test('CLI: T0 mechanical_trivial with mocked nulls → all_providers_failed', () => {
  const r = spawnCli('rename foo to bar in retry.ts');
  assert.equal(r.status, 0, `CLI exit non-zero: ${r.stderr}`);
  const json = JSON.parse(r.stdout);
  assert.equal(json.classification_ref.tier, 'T0');
  assert.deepEqual(json.fallback_chain, ['ollama']);
  assert.equal(json.reason, 'all_providers_failed');
});

test('CLI: T3 architecture defers to model-architect even with mocked providers', () => {
  const r = spawnCli('redesign the auth subsystem for multi-tenant');
  assert.equal(r.status, 0);
  const json = JSON.parse(r.stdout);
  assert.equal(json.classification_ref.tier, 'T3');
  assert.equal(json.defer_to_subagent, 'model-architect');
  assert.equal(json.reason, 'tier_t3');
  assert.deepEqual(json.fallback_chain, []); // no providers tried for T3
});

test('CLI: ambiguous explain prompt defers to a recognised subagent', () => {
  // The real classifier may put "explain TypeError ..." into either T0
  // (simple_transform_or_explain) or T1 (explain_error) depending on
  // patterns.js tuning. Both are valid; this CLI test only asserts the
  // executor produces a structured defer to a known subagent — not a
  // hard error. The flexible matcher prevents test brittleness when the
  // classifier is re-tuned.
  const r = spawnCli('explain TypeError x is not a function');
  assert.equal(r.status, 0);
  const json = JSON.parse(r.stdout);
  // Either anthropic_only_chain (no provider attempted) OR all_providers_failed
  // (mock attempted) — both are valid outputs depending on chain shape.
  assert.equal(json.ok, false);
  assert.match(json.defer_to_subagent || '',
    /^(cheap-triage|model-reasoner|model-architect)$/);
});

test('CLI: empty prompt exits 2 with a clear stderr message', () => {
  // Spawn with no argv prompt and stdin closed — should detect empty.
  const r = spawnSync(process.execPath, [
    path.join(__dirname, 'router-execute.js'),
  ], {
    encoding: 'utf8',
    input: '',
    env: { ...process.env, MOCK_PROVIDERS: '1', MOOTER_TRACKER_PORT: '64995' },
    timeout: 5_000,
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no prompt/i);
});
