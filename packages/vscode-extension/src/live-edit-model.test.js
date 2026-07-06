'use strict';
// live-edit-model.test.js — LP-4 §1 contract: the local $0 runner talks to a REAL http server
// (an Ollama stand-in on an ephemeral 127.0.0.1 port), never a mocked fetch, so the wire shape
// (endpoint, system prompt, stream:false, subtree-only reads) and every fail-soft path (offline,
// timeout, junk) are proven end-to-end without touching a real GPU.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const LEM = require('./live-edit-model.js');

const NODE = '<img src="/moo.png" alt="moo" />';

function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => {
      resolve({ srv, url: 'http://127.0.0.1:' + srv.address().port });
    });
  });
}

test('happy path: strict wire contract + cleaned reply, model from explicit opt', async () => {
  let seen = null;
  const { srv, url } = await serve((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen = { url: req.url, body: JSON.parse(body) };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ response: '```jsx\n<img src="/moo.png" alt="moo" className="rounded-xl border" />\n```' }));
    });
  });
  try {
    const r = await LEM.rewriteElement(
      { nodeSource: NODE, prompt: 'põe cantos redondos e borda fina', file: 'C:/ws/landing/app/page.tsx', line: 12 },
      { baseUrl: url, model: 'test-moo' },
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.text, '<img src="/moo.png" alt="moo" className="rounded-xl border" />', 'fence unwrapped');
    assert.strictEqual(r.model, 'test-moo');
    assert.strictEqual(seen.url, '/api/generate', 'Ollama generate endpoint');
    assert.strictEqual(seen.body.model, 'test-moo');
    assert.strictEqual(seen.body.stream, false, 'no streaming — one honest answer');
    assert.strictEqual(seen.body.system, LEM.SYSTEM_PROMPT, 'strict system prompt: only the element, no prose/markdown');
    assert.ok(seen.body.prompt.includes(NODE), 'the model sees the subtree');
    assert.ok(seen.body.prompt.includes('põe cantos redondos'), 'the model sees the instruction');
    // NEVER the whole file: the payload carries exactly instruction + location + subtree.
    assert.ok(!seen.body.prompt.includes('export default'), 'no file content beyond the subtree');
  } finally { srv.close(); }
});

test('qwen3 <think> reasoning block is stripped from the reply', async () => {
  const { srv, url } = await serve((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ response: '<think>the user wants rounded corners…</think>\n<img className="rounded" />' }));
  });
  try {
    const r = await LEM.rewriteElement({ nodeSource: NODE, prompt: 'x' }, { baseUrl: url, model: 'm' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.text, '<img className="rounded" />');
  } finally { srv.close(); }
});

test('Ollama offline (closed port) → honest local-model-offline, never a throw', async () => {
  const { srv, url } = await serve(() => {});
  await new Promise((r) => srv.close(r)); // the port is now provably closed
  const r = await LEM.rewriteElement({ nodeSource: NODE, prompt: 'x' }, { baseUrl: url, model: 'm' });
  assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'local-model-offline' });
});

test('timeout is fail-soft: slow model → local-model-timeout (no hang, no throw)', async () => {
  const { srv, url } = await serve(() => { /* never responds */ });
  try {
    const r = await LEM.rewriteElement({ nodeSource: NODE, prompt: 'x' }, { baseUrl: url, model: 'm', timeoutMs: 120 });
    assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'local-model-timeout' });
  } finally { srv.close(); }
});

test('empty / whitespace reply → local-model-empty (no fabricated element)', async () => {
  const { srv, url } = await serve((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ response: '   \n ' }));
  });
  try {
    const r = await LEM.rewriteElement({ nodeSource: NODE, prompt: 'x' }, { baseUrl: url, model: 'm' });
    assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'local-model-empty' });
  } finally { srv.close(); }
});

test('non-200 → local-model-error with the status in detail', async () => {
  const { srv, url } = await serve((req, res) => { res.statusCode = 500; res.end('boom'); });
  try {
    const r = await LEM.rewriteElement({ nodeSource: NODE, prompt: 'x' }, { baseUrl: url, model: 'm' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'local-model-error');
    assert.strictEqual(r.detail, 'http 500');
  } finally { srv.close(); }
});

test('oversized subtree is refused before any network call (node-too-large)', async () => {
  const big = '<div>' + 'x'.repeat(LEM.MAX_NODE_BYTES) + '</div>';
  const r = await LEM.rewriteElement({ nodeSource: big, prompt: 'x' }, { baseUrl: 'http://127.0.0.1:1', model: 'm' });
  assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'node-too-large' });
});

test('missing prompt or subtree → bad-request', async () => {
  assert.strictEqual((await LEM.rewriteElement({ nodeSource: '', prompt: 'x' }, {})).reason, 'bad-request');
  assert.strictEqual((await LEM.rewriteElement({ nodeSource: NODE, prompt: '  ' }, {})).reason, 'bad-request');
});

// ── LP-4.7 §4 — the structured envelope: only the WRAPPER is constrained, the JSX inside is free.
test('envelope mode: format schema on the wire, {jsx,new_imports} parsed, temperature honoured', async () => {
  let seen = null;
  const { srv, url } = await serve((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ response: JSON.stringify({ jsx: '<img className="rounded" />', new_imports: ["import { Star } from 'lucide-react'"] }) }));
    });
  });
  try {
    const r = await LEM.rewriteElement(
      { nodeSource: NODE, prompt: 'x' },
      { baseUrl: url, model: 'm', envelope: true, temperature: 0.7, extraBlocks: ['REGRAS DE ASSETS: só desta lista'] },
    );
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.text, '<img className="rounded" />');
    assert.deepStrictEqual(r.newImports, ["import { Star } from 'lucide-react'"]);
    assert.strictEqual(r.envelope, true);
    assert.deepStrictEqual(seen.format, LEM.ENVELOPE_FORMAT, 'structured output constrains ONLY the wrapper');
    assert.strictEqual(seen.system, LEM.ENVELOPE_SYSTEM_PROMPT);
    assert.strictEqual(seen.options.temperature, 0.7, 'best-of-N sampling temperature rides through');
    assert.ok(seen.prompt.indexOf('REGRAS DE ASSETS') !== -1, 'asset block rides the prompt');
    assert.ok(seen.prompt.indexOf('REGRAS DE ASSETS') < seen.prompt.indexOf('Elemento JSX:'), 'blocks sit before the element');
  } finally { srv.close(); }
});

test('envelope not honoured by the daemon → honest fallback to legacy cleaning, envelope:false', async () => {
  const { srv, url } = await serve((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ response: '```jsx\n<img className="x" />\n```' }));
  });
  try {
    const r = await LEM.rewriteElement({ nodeSource: NODE, prompt: 'x' }, { baseUrl: url, model: 'm', envelope: true });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.text, '<img className="x" />');
    assert.strictEqual(r.envelope, false, 'no fabricated envelope');
    assert.deepStrictEqual(r.newImports, []);
  } finally { srv.close(); }
});

test('parseEnvelope: think-block + junk tolerance, junk imports filtered, non-envelope → null', () => {
  const e1 = LEM.parseEnvelope('<think>hmm</think>{"jsx":"<a />","new_imports":[]}');
  assert.deepStrictEqual(e1, { jsx: '<a />', newImports: [] });
  const e2 = LEM.parseEnvelope('claro! {"jsx":"<a />","new_imports":["import x from \'y\'", "", 42]} fim');
  assert.deepStrictEqual(e2, { jsx: '<a />', newImports: ["import x from 'y'"] });
  assert.strictEqual(LEM.parseEnvelope('<img />'), null);
  assert.strictEqual(LEM.parseEnvelope('{"nope":1}'), null);
  assert.strictEqual(LEM.parseEnvelope(''), null);
});

test('default mode is byte-for-byte the legacy wire contract (no envelope, no format key)', async () => {
  let seen = null;
  const { srv, url } = await serve((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ response: '<img />' }));
    });
  });
  try {
    const r = await LEM.rewriteElement({ nodeSource: NODE, prompt: 'x' }, { baseUrl: url, model: 'm' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual('format' in seen, false, 'no format key unless envelope is asked for');
    assert.strictEqual(seen.system, LEM.SYSTEM_PROMPT);
    assert.strictEqual(seen.options.temperature, 0.2, 'legacy default temperature');
  } finally { srv.close(); }
});

test('model comes from ~/.mooter/preferences.json with the doctrine fallback qwen3:30b', () => {
  assert.strictEqual(LEM.localModelName({ live_edit: { model: 'qwen2.5-coder:7b' } }), 'qwen2.5-coder:7b', 'live_edit.model wins');
  assert.strictEqual(LEM.localModelName({ local_model: 'gemma3:12b' }), 'gemma3:12b', 'general local default');
  assert.strictEqual(LEM.localModelName({}), 'qwen3:30b', 'doctrine fallback');
  assert.strictEqual(LEM.localModelName(null), 'qwen3:30b', 'junk-safe');
  // And the file read is fail-soft: a missing prefs file falls back, never throws.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lem-prefs-'));
  try {
    assert.strictEqual(LEM.readPrefs(path.join(dir, 'absent.json')), null);
    const f = path.join(dir, 'preferences.json');
    fs.writeFileSync(f, JSON.stringify({ live_edit: { model: 'deepseek-r1:7b' } }), 'utf8');
    assert.strictEqual(LEM.localModelName(LEM.readPrefs(f)), 'deepseek-r1:7b');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
