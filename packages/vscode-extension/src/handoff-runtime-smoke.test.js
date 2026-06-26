// handoff-runtime-smoke.test.js — RUNTIME smoke for the ⇄ Handoff button.
//
// The other handoff tests are SIMs: they feed generateHandoff() pre-baked opts and never touch the
// Ollama path. This file exercises the REAL orchestration (host-extra.composeHandoff — the exact
// code the cockpit handler runs) against a controllable Ollama, to prove the failure the user hit
// ("⇄ Handoff não gerou nada"):
//
//   • Ollama DOWN  → port refused        → narrative is null, skeleton ships immediately.
//   • Ollama HUNG  → /api/generate never answers (simulates a >10s cold generate) → the per-call
//                    socket timeouts must abort AND the hard deadline backstops, so the clipboard
//                    is written with the deterministic text in well under 5s — never "nothing".
//
// In BOTH scenarios we assert: clipboard text is NON-EMPTY, produced in < 5s, and the PENDING
// question is copied VERBATIM (the LLM never gets to touch it).
//
// Port injection: host-extra reads MOOTER_OLLAMA_PORT at module-load, so we set it then re-require
// a fresh copy per scenario. Real Ollama on 11434 is left untouched.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');

const HOST_EXTRA = require.resolve('./host-extra.js');

function freshExtra(port) {
  process.env.MOOTER_OLLAMA_PORT = String(port);
  delete require.cache[HOST_EXTRA];
  return require('./host-extra.js');
}

// A fake Ollama that answers /api/tags instantly but HANGS on /api/generate (never responds) —
// the worst real case: Ollama is up, model is cold, generate takes far longer than our budget.
let hungServer = null;
let hungPort = 0;
let deadPort = 0; // a port nobody listens on → connection refused (Ollama DOWN)

const ROW_QUICK = {
  fullId: 'smoke-quick', id: 'smoke-qu', name: 'wire the handoff button', turns: 7,
  branch: 'wave/cockpit-handoff', model: 'claude-opus-4-8', mode: 'moo', cwd: null,
  pending: { lastAssistantText: 'EXACT pending question — verbatim?', lastToolActions: [{ name: 'Write', target: 'host-extra.js' }], stopped: true },
};
const ROW_FULL = Object.assign({}, ROW_QUICK, { fullId: 'smoke-full', id: 'smoke-fu', turns: 20 });

before(async () => {
  // Bind two ephemeral ports; keep one server (hung) and immediately free the other (dead).
  hungServer = http.createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ models: [{ name: 'qwen2.5:3b', size: 2.0e9 }] }));
      return;
    }
    // /api/generate: intentionally never respond — hold the socket so the CLIENT timeout must fire.
    if (req.url === '/api/generate') return;
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => hungServer.listen(0, '127.0.0.1', r));
  hungPort = hungServer.address().port;

  // Grab a second free port, then release it so connections are refused (the DOWN scenario).
  const tmp = http.createServer();
  await new Promise((r) => tmp.listen(0, '127.0.0.1', r));
  deadPort = tmp.address().port;
  await new Promise((r) => tmp.close(r));
});

after(async () => {
  if (hungServer) {
    try { hungServer.closeAllConnections && hungServer.closeAllConnections(); } catch {}
    await new Promise((r) => hungServer.close(r));
  }
});

test('Ollama DOWN: clipboard non-empty < 5s, PENDING verbatim, deterministic skeleton', async () => {
  const extra = freshExtra(deadPort);
  const t0 = Date.now();
  const { text, mode } = await extra.composeHandoff(ROW_QUICK, ROW_QUICK.pending);
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, `handoff must ship < 5s with Ollama down (took ${ms}ms)`);
  assert.ok(text && text.length > 0, 'clipboard text is NON-EMPTY (never "nothing generated")');
  assert.ok(text.includes('⇄ MOOTER HANDOFF'), 'deterministic skeleton present');
  assert.ok(text.includes('EXACT pending question — verbatim?'), 'PENDING copied verbatim');
  assert.equal(mode, 'quick', 'turns 7 → quick mode');
});

test('Ollama HUNG generate (quick): timeout aborts, clipboard < 5s, PENDING verbatim', async () => {
  const extra = freshExtra(hungPort);
  const t0 = Date.now();
  const { text } = await extra.composeHandoff(ROW_QUICK, ROW_QUICK.pending);
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, `hung Ollama must not hang the clipboard (took ${ms}ms)`);
  assert.ok(text && text.includes('⇄ MOOTER HANDOFF'), 'skeleton shipped despite hung Ollama');
  assert.ok(text.includes('EXACT pending question — verbatim?'), 'PENDING verbatim under hang');
});

test('Ollama HUNG generate (full/RECAP path): parallel doing+recap + deadline still < 5s', async () => {
  const extra = freshExtra(hungPort);
  const t0 = Date.now();
  const { text, mode, timedOut } = await extra.composeHandoff(ROW_FULL, ROW_FULL.pending);
  const ms = Date.now() - t0;
  // full mode would be ~6s if doing(2s) and recap(4s) ran SEQUENTIALLY — the bug. Parallel = ~4s.
  assert.ok(ms < 5000, `full-mode handoff must ship < 5s even when Ollama hangs (took ${ms}ms)`);
  assert.equal(mode, 'full', 'turns 20 → full mode');
  assert.ok(text.includes('⇄ MOOTER HANDOFF'), 'skeleton shipped');
  assert.ok(text.includes('EXACT pending question — verbatim?'), 'PENDING verbatim in full mode');
  assert.ok(timedOut === false || timedOut === true, 'timedOut flag is reported (telemetry)');
});

test('SYNC.md upsert path still works with the deterministic text (no Ollama needed)', async () => {
  const fs = require('fs');
  const os = require('os');
  const extra = freshExtra(deadPort);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-handoff-smoke-'));
  try {
    const row = Object.assign({}, ROW_QUICK, { cwd: tmpDir });
    const { text } = await extra.composeHandoff(row, row.pending);
    const w = extra.writeHandoffToSync(tmpDir, row.fullId, text, { name: row.name });
    assert.equal(w.ok, true, 'SYNC.md write ok');
    const sync = fs.readFileSync(path.join(tmpDir, 'SYNC.md'), 'utf8');
    assert.ok(sync.includes('⇄ Handoff'), 'SYNC.md upserted with the handoff block');
    assert.ok(sync.includes('EXACT pending question — verbatim?'), 'PENDING reached SYNC.md verbatim');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
