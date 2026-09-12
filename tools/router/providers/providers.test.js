#!/usr/bin/env node
// @ts-check
/**
 * Tests for providers/codex-cli.js + providers/openai-api.js.
 *
 * No real API calls and no real `codex` invocations. We exercise:
 *   - the quota-exhaustion detection regex
 *   - cost computation against the canonical pricing.js
 *   - the .env loader resolution order
 *   - isAvailable() degradations (missing key, missing binary)
 *
 * Run with:  node --test providers/providers.test.js
 */

'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

let TMP_DIR;
let SAVED_OPENAI;

function loadFresh() {
  for (const m of [
    './_load-env.js',
    '../paths.js',
    '../quota-tracker.js',
    './codex-cli.js',
    './openai-api.js',
    './ollama-api.js',
  ]) {
    try { delete require.cache[require.resolve(m)]; } catch {}
  }
  return {
    codex:   require('./codex-cli.js'),
    openai:  require('./openai-api.js'),
    ollama:  require('./ollama-api.js'),
    loadEnv: require('./_load-env.js'),
  };
}

beforeEach(() => {
  TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-prov-'));
  fs.mkdirSync(path.join(TMP_DIR, 'tools', 'router'), { recursive: true });
  process.env.MOOTER_CLAUDE_DIR = TMP_DIR;
  SAVED_OPENAI = process.env.OPENAI_API_KEY;
});

afterEach(() => {
  delete process.env.MOOTER_CLAUDE_DIR;
  if (SAVED_OPENAI === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = SAVED_OPENAI;
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
});

// ── codex-cli: QUOTA_HINTS detection ────────────────────────────────────

test('codex QUOTA_HINTS: matches every documented exhaustion phrase', () => {
  const { codex } = loadFresh();
  const hits = [
    'You hit the rate limit. Try again later.',
    'rate-limited at the moment',
    'Quota exceeded for this 5 hour window',
    'You\'ve hit the 5-hour cap',
    'Weekly limit reached',
    'usage limit applied',
  ];
  for (const h of hits) {
    const blob = h.toLowerCase();
    const matched = codex.QUOTA_HINTS.some((needle) => blob.includes(needle));
    assert.ok(matched, `expected match for: ${h}`);
  }
});

test('codex QUOTA_HINTS: does NOT match benign output', () => {
  const { codex } = loadFresh();
  const benign = [
    'Logged in using ChatGPT',
    'I generated the function as requested.',
    'No errors found.',
  ];
  for (const h of benign) {
    const blob = h.toLowerCase();
    const matched = codex.QUOTA_HINTS.some((needle) => blob.includes(needle));
    assert.equal(matched, false, `unexpected match: ${h}`);
  }
});

// ── openai-api: cost math ───────────────────────────────────────────────

test('openai computeCost: uses pricing.js for gpt-4o', () => {
  const { openai } = loadFresh();
  // gpt-4o pricing (verified 2026-04-16 in pricing.js): input 2.50, output 10.0
  // 1M in + 1M out → 2.50 + 10.0 = 12.50
  const cost = openai.computeCost('gpt-4o', 1_000_000, 1_000_000);
  assert.ok(Math.abs(cost - 12.5) < 1e-6, `expected 12.5, got ${cost}`);
});

test('openai computeCost: uses pricing.js for o3', () => {
  const { openai } = loadFresh();
  // o3 pricing: input 2.00, output 8.00
  const cost = openai.computeCost('o3', 500_000, 500_000);
  assert.ok(Math.abs(cost - 5.0) < 1e-6, `expected 5.0, got ${cost}`);
});

test('openai computeCost: falls back gracefully for unknown model', () => {
  const { openai } = loadFresh();
  const cost = openai.computeCost('made-up-model', 1000, 1000);
  // Falls back to a sane default rate (>0, finite). We don't pin the exact
  // rate to avoid coupling this test to FALLBACK_PRICE constants.
  assert.ok(Number.isFinite(cost) && cost >= 0);
});

// ── openai-api: isAvailable ─────────────────────────────────────────────

test('openai isAvailable: false when OPENAI_API_KEY is unset', () => {
  // Load the module first (its module-load .env scan may re-populate the
  // var from the canonical tree). Then clear and probe — isAvailable reads
  // process.env at call time.
  const { openai } = loadFresh();
  delete process.env.OPENAI_API_KEY;
  assert.equal(openai.isAvailable(), false);
});

test('openai isAvailable: true when OPENAI_API_KEY is set', () => {
  const { openai } = loadFresh();
  process.env.OPENAI_API_KEY = 'sk-test-fake';
  assert.equal(openai.isAvailable(), true);
});

// ── _load-env: precedence ───────────────────────────────────────────────

test('_load-env: does NOT overwrite a pre-set process.env var', () => {
  // Drop a synthetic .env into the runtime ROUTER_DIR.
  const envFile = path.join(TMP_DIR, 'tools', 'router', '.env');
  fs.writeFileSync(envFile, 'OPENAI_API_KEY=from-dotenv\n');
  process.env.OPENAI_API_KEY = 'from-shell';
  const { loadEnv } = loadFresh();
  loadEnv.loadEnv();
  assert.equal(process.env.OPENAI_API_KEY, 'from-shell');
});

test('_load-env: fills in missing vars from .env', () => {
  const envFile = path.join(TMP_DIR, 'tools', 'router', '.env');
  fs.writeFileSync(envFile, 'OPENAI_API_KEY=from-dotenv\n');
  delete process.env.OPENAI_API_KEY;
  const { loadEnv } = loadFresh();
  loadEnv.loadEnv();
  assert.equal(process.env.OPENAI_API_KEY, 'from-dotenv');
});

test('_load-env: ignores comments and blank lines, strips quotes', () => {
  const envFile = path.join(TMP_DIR, 'tools', 'router', '.env');
  fs.writeFileSync(
    envFile,
    '# comment line\n' +
    '\n' +
    'TEST_FOO_VAR="quoted-value"\n' +
    "TEST_BAR_VAR='single-quoted'\n"
  );
  delete process.env.TEST_FOO_VAR;
  delete process.env.TEST_BAR_VAR;
  const { loadEnv } = loadFresh();
  loadEnv.loadEnv();
  assert.equal(process.env.TEST_FOO_VAR, 'quoted-value');
  assert.equal(process.env.TEST_BAR_VAR, 'single-quoted');
});

// ── ollama-api: callOllama ──────────────────────────────────────────────
//
// Mocks the global `fetch` so tests stay deterministic without a real
// Ollama server. Each test installs its own stub and restores afterwards.

let SAVED_FETCH;

function withMockedFetch(stub, fn) {
  SAVED_FETCH = globalThis.fetch;
  globalThis.fetch = stub;
  try { return fn(); }
  finally { globalThis.fetch = SAVED_FETCH; }
}

function makeFetchStub(jsonOrError) {
  return async () => {
    if (jsonOrError instanceof Error) throw jsonOrError;
    return {
      ok: true,
      json: async () => jsonOrError,
    };
  };
}

test('ollama callOllama: success returns shape with token counts and zero cost', async () => {
  const { ollama } = loadFresh();
  await withMockedFetch(
    makeFetchStub({
      response: 'O sistema processa em lotes de 100.',
      prompt_eval_count: 32,
      eval_count: 12,
    }),
    async () => {
      const result = await ollama.callOllama('summarise', { timeoutMs: 5000 });
      assert.equal(result && result.ok, true);
      assert.equal(result.text, 'O sistema processa em lotes de 100.');
      assert.equal(result.tokensIn,  32);
      assert.equal(result.tokensOut, 12);
      assert.equal(result.costUsd, 0);
      assert.ok(typeof result.durationMs === 'number');
    }
  );
});

test('ollama callOllama: records usage exactly once on success', async () => {
  const { ollama } = loadFresh();
  const tracker = require('../quota-tracker.js');
  // Capture only the calls produced by THIS test (tracker is module-singleton).
  const baseline = tracker.snapshot ? tracker.snapshot() : null;
  let calls = 0;
  const origRecord = tracker.recordUsage;
  tracker.recordUsage = (...args) => { calls++; return origRecord.apply(tracker, args); };

  await withMockedFetch(
    makeFetchStub({ response: 'short answer', prompt_eval_count: 4, eval_count: 2 }),
    async () => {
      await ollama.callOllama('p', { timeoutMs: 5000 });
    }
  );
  tracker.recordUsage = origRecord;
  assert.equal(calls, 1);
  void baseline;
});

test('ollama callOllama: does NOT record usage on failure (fetch throws)', async () => {
  const { ollama } = loadFresh();
  const tracker = require('../quota-tracker.js');
  let calls = 0;
  const origRecord = tracker.recordUsage;
  tracker.recordUsage = (...args) => { calls++; return origRecord.apply(tracker, args); };

  const result = await withMockedFetch(
    makeFetchStub(new Error('ECONNREFUSED')),
    async () => ollama.callOllama('p', { timeoutMs: 5000 })
  );
  tracker.recordUsage = origRecord;
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('ollama callOllama: returns null when response has no text', async () => {
  const { ollama } = loadFresh();
  await withMockedFetch(
    makeFetchStub({ response: '', prompt_eval_count: 0, eval_count: 0 }),
    async () => {
      const r = await ollama.callOllama('p', { timeoutMs: 5000 });
      assert.equal(r, null);
    }
  );
});

test('ollama callOllama: returns null when http response is not ok', async () => {
  const { ollama } = loadFresh();
  const stub = async () => ({ ok: false, json: async () => ({ error: 'boom' }) });
  await withMockedFetch(stub, async () => {
    const r = await ollama.callOllama('p', { timeoutMs: 5000 });
    assert.equal(r, null);
  });
});

test('ollama callOllama: opts.model overrides the default', async () => {
  const { ollama } = loadFresh();
  let capturedBody;
  const stub = async (_url, init) => {
    capturedBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ response: 'hi', prompt_eval_count: 1, eval_count: 1 }) };
  };
  await withMockedFetch(stub, async () => {
    const r = await ollama.callOllama('p', { model: 'qwen2.5-coder:14b', timeoutMs: 5000 });
    assert.equal(r && r.model, 'qwen2.5-coder:14b');
  });
  assert.equal(capturedBody.model, 'qwen2.5-coder:14b');
});

test('ollama callOllama: throws on empty prompt (defensive)', async () => {
  const { ollama } = loadFresh();
  await assert.rejects(() => ollama.callOllama(''), /non-empty/);
  await assert.rejects(() => ollama.callOllama(null), /non-empty/);
});

test('ollama isAvailable: returns false when fetch throws', async () => {
  const { ollama } = loadFresh();
  await withMockedFetch(
    async () => { throw new Error('ENOTFOUND'); },
    async () => {
      const probe = await ollama.isAvailable({ timeoutMs: 200 });
      assert.equal(probe.available, false);
      assert.match(probe.reason || '', /ENOTFOUND|tags error/);
    }
  );
});

test('ollama isAvailable: returns true when /api/tags responds ok', async () => {
  const { ollama } = loadFresh();
  await withMockedFetch(
    async () => ({ ok: true, json: async () => ({ models: [] }) }),
    async () => {
      const probe = await ollama.isAvailable({ timeoutMs: 200 });
      assert.equal(probe.available, true);
    }
  );
});

// ── ollama-api: OLLAMA_HOST sem esquema ─────────────────────────────────
//
// `OLLAMA_HOST=127.0.0.1:11434` é o formato canónico do Ollama. Este ficheiro
// concatenava-o à bruta e produzia `fetch('127.0.0.1:11434/api/…')`.
//
// Medido a 2026-08-31, com o Ollama vivo e 10 modelos:
//   · isAvailable() → {available:false, reason:'…Failed to parse URL…'}
//   · callOllama()  → null, SEM razão nenhuma
//
// O segundo é o que custava: o motor $0 falhava mudo e o trabalho caía para um
// motor pago sem sinal nenhum. Estes testes mordem esse caminho — capturam o
// URL que chega ao fetch, que é onde o defeito vivia.

let SAVED_OLLAMA_HOST;

function withOllamaHost(valor, fn) {
  SAVED_OLLAMA_HOST = process.env.OLLAMA_HOST;
  if (valor === undefined) delete process.env.OLLAMA_HOST;
  else process.env.OLLAMA_HOST = valor;
  const restaurar = () => {
    if (SAVED_OLLAMA_HOST === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = SAVED_OLLAMA_HOST;
  };
  return Promise.resolve()
    .then(fn)
    .finally(restaurar);
}

/** Stub que grava o URL recebido e responde ok. */
function fetchQueGravaUrl(caixa, corpo) {
  return async (url) => {
    caixa.url = url;
    return { ok: true, json: async () => corpo };
  };
}

test('ollama normalizeHost: prefixa http:// quando falta o esquema', () => {
  const { ollama } = loadFresh();
  assert.equal(ollama.normalizeHost('127.0.0.1:11434'), 'http://127.0.0.1:11434');
  assert.equal(ollama.normalizeHost('localhost:11434'), 'http://localhost:11434');
});

test('ollama normalizeHost: não mexe em http:// nem https://', () => {
  const { ollama } = loadFresh();
  assert.equal(ollama.normalizeHost('http://localhost:11434'), 'http://localhost:11434');
  assert.equal(ollama.normalizeHost('https://gpu.local:11434'), 'https://gpu.local:11434');
  // maiúsculas contam como esquema — não pode virar http://HTTP://…
  assert.equal(ollama.normalizeHost('HTTP://localhost:11434'), 'HTTP://localhost:11434');
});

test('ollama normalizeHost: apara barras finais e cai no default quando vazio', () => {
  const { ollama } = loadFresh();
  assert.equal(ollama.normalizeHost('127.0.0.1:11434///'), 'http://127.0.0.1:11434');
  assert.equal(ollama.normalizeHost(''), ollama.DEFAULT_HOST);
  assert.equal(ollama.normalizeHost('   '), ollama.DEFAULT_HOST);
  assert.equal(ollama.normalizeHost(undefined), ollama.DEFAULT_HOST);
});

test('ollama isAvailable: host sem esquema chega ao fetch como URL absoluto', async () => {
  await withOllamaHost('127.0.0.1:11434', async () => {
    const { ollama } = loadFresh();
    const caixa = {};
    await withMockedFetch(fetchQueGravaUrl(caixa, { models: [] }), async () => {
      const probe = await ollama.isAvailable({ timeoutMs: 200 });
      assert.equal(probe.available, true);
    });
    assert.equal(caixa.url, 'http://127.0.0.1:11434/api/tags');
  });
});

test('ollama callOllama: host sem esquema chega ao fetch como URL absoluto', async () => {
  // A mordida que interessa: antes da correcção isto devolvia `null` mudo.
  await withOllamaHost('127.0.0.1:11434', async () => {
    const { ollama } = loadFresh();
    const caixa = {};
    await withMockedFetch(
      fetchQueGravaUrl(caixa, { message: { content: 'ok' }, prompt_eval_count: 1, eval_count: 1 }),
      async () => {
        const r = await ollama.callOllama('diz ok', { timeoutMs: 200 });
        assert.notEqual(r, null, 'callOllama não pode devolver null por causa do host');
        assert.equal(r.ok, true);
      }
    );
    assert.equal(caixa.url, 'http://127.0.0.1:11434/api/chat');
  });
});

test('ollama: host COM esquema continua a funcionar exactamente como antes', async () => {
  // Guarda de regressão: a correcção não pode mudar o caminho que já servia.
  await withOllamaHost('http://localhost:11434', async () => {
    const { ollama } = loadFresh();
    const caixa = {};
    await withMockedFetch(fetchQueGravaUrl(caixa, { models: [] }), async () => {
      await ollama.isAvailable({ timeoutMs: 200 });
    });
    assert.equal(caixa.url, 'http://localhost:11434/api/tags');
  });
});
