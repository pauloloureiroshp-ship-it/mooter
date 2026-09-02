// Per-attempt timeout on the PINNED dispatch path (executePinned) + the reason a
// pin failed. Two measurements, same defect, one local and one cloud:
//
//   local  — gemma4:e4b ~9.6GB → 79s cold-load, ~120s warm at 69% CPU on Paulo's
//            Mac. The 30s default returned no_output before the model answered.
//   cloud  — 2026-09-02: every /mooter-codex dispatch returned
//            {"ok":false,"error":{"code":"no_output"}} while `codex exec` itself
//            exited 0. The same prompt via executePinned({timeoutMs:600000})
//            answered in 283s. `codex exec` is an agentic loop, not a chat
//            completion: 30s was never enough, and the error named the wrong cause.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { executePinned } = require('./router-execute.js');

// Env keys this file toggles. Cleared before every capture so a stray value in
// Paulo's real shell cannot make a default-assertion pass for the wrong reason.
const ENV_KEYS = [
  'MOOTER_PER_ATTEMPT_TIMEOUT_MS',
  'MOOTER_LOCAL_PIN_TIMEOUT_MS',
  'MOOTER_CLOUD_PIN_TIMEOUT_MS',
];

async function withEnv(env, fn) {
  const saved = {};
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try { return await fn(); }
  finally {
    for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

function okWrapper(seenBox) {
  return async (_p, o) => {
    seenBox.timeoutMs = o.timeoutMs;
    return { ok: true, text: 'ok', model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, durationMs: 1 };
  };
}

// Capture the timeoutMs the wrapper receives, for a given env/options setup.
async function capture({ provider = 'ollama', options = {}, env = {} } = {}) {
  const box = {};
  await withEnv(env, () => executePinned({
    prompt: 'p', provider,
    options: { ...options, __deps: {
      availability: { ollama: true, openai_api: true, codex_cli: true },
      providers: { ollama: okWrapper(box), openai_api: okWrapper(box), codex_cli: okWrapper(box) },
    } },
  }));
  return box.timeoutMs;
}

// ── The budget the wrapper is handed ────────────────────────────────────────

test('local (ollama) pin with no timeout → generous 240s default (was 30s)', async () => {
  assert.equal(await capture({ provider: 'ollama' }), 240_000);
});

test('MOOTER_LOCAL_PIN_TIMEOUT_MS overrides the local default', async () => {
  assert.equal(await capture({ provider: 'ollama', env: { MOOTER_LOCAL_PIN_TIMEOUT_MS: '90000' } }), 90_000);
});

test('explicit options.timeoutMs wins over the local default', async () => {
  assert.equal(await capture({ provider: 'ollama', options: { timeoutMs: 5_000 } }), 5_000);
});

// The assertion this file used to make was `30_000`, and it was wrong-by-measurement
// rather than wrong-by-reading: it faithfully encoded the shipped behaviour, which is
// exactly why it made the defect look intentional. A pin is the user saying "this
// one, I'll wait" — and that is provider-independent.
test('cloud pin (codex_cli) with no timeout → 300s default, not the old 30s', async () => {
  assert.equal(await capture({ provider: 'codex-cli' }), 300_000);
});

test('cloud pin (openai_api) gets the same 300s default', async () => {
  assert.equal(await capture({ provider: 'openai_api' }), 300_000);
});

test('MOOTER_CLOUD_PIN_TIMEOUT_MS overrides the cloud default', async () => {
  assert.equal(await capture({ provider: 'codex-cli', env: { MOOTER_CLOUD_PIN_TIMEOUT_MS: '600000' } }), 600_000);
});

test('MOOTER_CLOUD_PIN_TIMEOUT_MS does not leak into the local default', async () => {
  assert.equal(await capture({ provider: 'ollama', env: { MOOTER_CLOUD_PIN_TIMEOUT_MS: '600000' } }), 240_000);
});

// Precedence: explicit option > MOOTER_PER_ATTEMPT_TIMEOUT_MS > per-provider default.
// The middle rung is how a HOOK caps a dispatch to fit its own budget (inject_context
// sets 2500ms), so it must beat the defaults; an explicit argument must beat it.
test('MOOTER_PER_ATTEMPT_TIMEOUT_MS is honoured on the pin path', async () => {
  assert.equal(await capture({ provider: 'codex-cli', env: { MOOTER_PER_ATTEMPT_TIMEOUT_MS: '2500' } }), 2_500);
  assert.equal(await capture({ provider: 'ollama', env: { MOOTER_PER_ATTEMPT_TIMEOUT_MS: '2500' } }), 2_500);
});

test('explicit options.timeoutMs beats MOOTER_PER_ATTEMPT_TIMEOUT_MS', async () => {
  const t = await capture({ provider: 'codex-cli', options: { timeoutMs: 600_000 }, env: { MOOTER_PER_ATTEMPT_TIMEOUT_MS: '2500' } });
  assert.equal(t, 600_000);
});

// ── The regression, end to end ──────────────────────────────────────────────

// A codex run that needs `workMs` of wall clock. Behaves like spawnSync: it either
// finishes inside the budget, or is killed AT the deadline and says so via diag.
function codexNeeding(workMs) {
  return async (_p, o) => {
    if (o.timeoutMs >= workMs) {
      return { ok: true, text: 'the full answer', model: 'gpt-5.6', tokensIn: 0, tokensOut: 0, costUsd: 0, durationMs: workMs };
    }
    if (o.diag) Object.assign(o.diag, { reason: 'timeout', elapsedMs: o.timeoutMs, timeoutMs: o.timeoutMs, signal: 'SIGTERM' });
    return null;
  };
}

async function pinCodex({ needsMs, options = {}, env = {} }) {
  return withEnv(env, () => executePinned({
    prompt: 'p', provider: 'codex-cli',
    options: { ...options, __deps: {
      availability: { codex_cli: true },
      providers: { codex_cli: codexNeeding(needsMs) },
    } },
  }));
}

// THE test. 283s is the measured duration of the real dispatch on 2026-09-02.
// Under the old 30s cloud default this returns no_output; under the fix it answers.
test('measured 283s codex dispatch now succeeds (old 30s cap made it no_output)', async () => {
  const r = await pinCodex({ needsMs: 283_000 });
  assert.equal(r.ok, true, 'expected ok, got ' + JSON.stringify(r.error));
  assert.equal(r.text, 'the full answer');
});

test('a pin that really is capped short reports timeout — not no_output', async () => {
  const r = await pinCodex({ needsMs: 283_000, options: { timeoutMs: 30_000 } });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'timeout');
  assert.equal(r.error.provider, 'codex_cli');
  assert.equal(r.error.timeout_ms, 30_000);
  assert.equal(r.error.elapsed_ms, 30_000);
  assert.match(r.error.message, /30s/);
  assert.match(r.error.message, /MOOTER_CLOUD_PIN_TIMEOUT_MS/);
});

// Bite test: the new code must not relabel every failure as a timeout. A wrapper
// that returns null WITHOUT filling diag has to keep the old error verbatim —
// otherwise "timeout" becomes as uninformative as "no_output" was.
test('a silent null (no diag) is still no_output, with no invented reason', async () => {
  const r = await executePinned({
    prompt: 'p', provider: 'codex-cli',
    options: { __deps: { availability: { codex_cli: true }, providers: { codex_cli: async () => null } } },
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'no_output');
  assert.equal(r.error.reason, undefined);
  assert.equal(r.error.message, 'provider returned no usable text');
});

test('a non-timeout failure keeps code no_output but now names the reason', async () => {
  const r = await executePinned({
    prompt: 'p', provider: 'codex-cli',
    options: { __deps: { availability: { codex_cli: true }, providers: {
      codex_cli: async (_p, o) => { Object.assign(o.diag, { reason: 'nonzero_exit', status: 1, detail: 'boom' }); return null; },
    } } },
  });
  assert.equal(r.error.code, 'no_output');
  assert.equal(r.error.reason, 'nonzero_exit');
  assert.match(r.error.message, /nonzero_exit: boom/);
});

// ── The adapter: does it actually SEE the deadline kill? ────────────────────
//
// Everything above trusts a fake wrapper to fill diag. These prove the REAL adapter
// fills it, from the two shapes spawnSync actually produces — otherwise the suite
// would be green on a lie.

function freshCodex() {
  // Point the quota tracker at a throwaway dir: callCodex records every attempt,
  // and a test must not spend Paulo's real 5h codex budget.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-codex-'));
  const savedDir = process.env.MOOTER_CLAUDE_DIR;
  process.env.MOOTER_CLAUDE_DIR = tmp;
  fs.mkdirSync(path.join(tmp, 'tools', 'router'), { recursive: true });
  for (const k of Object.keys(require.cache)) {
    if (/[\\/](codex-cli|quota-tracker|paths)\.js$/.test(k)) delete require.cache[k];
  }
  const mod = require('./providers/codex-cli.js');
  return {
    mod,
    restore() {
      if (savedDir === undefined) delete process.env.MOOTER_CLAUDE_DIR;
      else process.env.MOOTER_CLAUDE_DIR = savedDir;
      for (const k of Object.keys(require.cache)) {
        if (/[\\/](codex-cli|quota-tracker|paths)\.js$/.test(k)) delete require.cache[k];
      }
    },
  };
}

test('adapter: POSIX deadline kill (error.code ETIMEDOUT) → diag.reason timeout', () => {
  const { mod, restore } = freshCodex();
  try {
    const diag = {};
    const out = mod.callCodex('p', {
      timeoutMs: 30_000,
      diag,
      __run: () => ({
        error: Object.assign(new Error('spawnSync codex ETIMEDOUT'), { code: 'ETIMEDOUT' }),
        status: null, signal: 'SIGTERM', stdout: '', stderr: '',
      }),
    });
    assert.equal(out, null, 'contract unchanged: failure is still a bare null');
    assert.equal(diag.reason, 'timeout');
    assert.equal(diag.timeoutMs, 30_000);
    assert.equal(diag.signal, 'SIGTERM');
  } finally { restore(); }
});

test('adapter: Windows shell:true kill (no error, only SIGTERM) → diag.reason timeout', () => {
  const { mod, restore } = freshCodex();
  try {
    const diag = {};
    const out = mod.callCodex('p', {
      timeoutMs: 5, // the busy-wait below exceeds 0.9 * 5ms, so the guard is satisfied
      diag,
      __run: () => {
        const until = Date.now() + 20;
        while (Date.now() < until) { /* burn wall clock deterministically */ }
        return { error: undefined, status: null, signal: 'SIGTERM', stdout: '', stderr: '' };
      },
    });
    assert.equal(out, null);
    assert.equal(diag.reason, 'timeout');
  } finally { restore(); }
});

// The guard that stops the SIGTERM heuristic from swallowing real failures: a signal
// that arrives well before the deadline is NOT our kill.
test('adapter: SIGTERM far from the deadline is not called a timeout', () => {
  const { mod, restore } = freshCodex();
  try {
    const diag = {};
    assert.equal(mod.callCodex('p', {
      timeoutMs: 600_000, diag,
      __run: () => ({ error: undefined, status: null, signal: 'SIGTERM', stdout: '', stderr: 'killed by someone else' }),
    }), null);
    assert.equal(diag.reason, 'nonzero_exit');
    assert.match(diag.detail, /killed by someone else/);
  } finally { restore(); }
});

test('adapter: plain non-zero exit reports nonzero_exit with stderr, not timeout', () => {
  const { mod, restore } = freshCodex();
  try {
    const diag = {};
    assert.equal(mod.callCodex('p', {
      timeoutMs: 600_000, diag,
      __run: () => ({ error: undefined, status: 1, signal: null, stdout: '', stderr: 'codex: not logged in' }),
    }), null);
    assert.equal(diag.reason, 'nonzero_exit');
    assert.equal(diag.status, 1);
    assert.match(diag.detail, /not logged in/);
  } finally { restore(); }
});

test('adapter: quota exhaustion still wins over every other reason', () => {
  const { mod, restore } = freshCodex();
  try {
    const diag = {};
    assert.equal(mod.callCodex('p', {
      timeoutMs: 600_000, diag,
      __run: () => ({ error: undefined, status: 1, signal: null, stdout: '', stderr: 'You have hit your usage limit' }),
    }), null);
    assert.equal(diag.reason, 'quota_exhausted');
  } finally { restore(); }
});

test('adapter: success path is untouched and never writes diag', () => {
  const { mod, restore } = freshCodex();
  try {
    const diag = {};
    const out = mod.callCodex('p', {
      timeoutMs: 600_000, diag,
      __run: () => ({ error: undefined, status: 0, signal: null, stdout: '  hello  ', stderr: '' }),
    });
    assert.equal(out.ok, true);
    assert.equal(out.text, 'hello');
    assert.deepEqual(diag, {});
  } finally { restore(); }
});

// diag is a pure out-parameter: omitting it must change nothing. This is what lets
// every existing caller (execute()'s chain loop, the .planning validation harness)
// keep working byte-for-byte.
test('adapter: omitting diag changes nothing — same null, no throw', () => {
  const { mod, restore } = freshCodex();
  try {
    assert.equal(mod.callCodex('p', {
      timeoutMs: 30_000,
      __run: () => ({ error: Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }), status: null, signal: 'SIGTERM', stdout: '', stderr: '' }),
    }), null);
  } finally { restore(); }
});
