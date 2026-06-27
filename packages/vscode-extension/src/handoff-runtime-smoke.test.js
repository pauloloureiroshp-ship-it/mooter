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
// A fake Ollama that ANSWERS /api/generate (captures the POST body) → the keep-warm + enrich path.
let liveServer = null;
let livePort = 0;
let lastGenBody = null; // the JSON body of the most recent /api/generate request

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

  // A LIVE fake Ollama: answers /api/tags AND /api/generate (capturing the body) so we can prove
  // keep_alive renewal and the enrich path (composeHandoff returns a model + a changed text).
  liveServer = http.createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ models: [{ name: 'qwen2.5:3b', size: 2.0e9 }] }));
      return;
    }
    if (req.url === '/api/generate') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try { lastGenBody = JSON.parse(body); } catch { lastGenBody = null; }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ response: 'wiring the handoff enrichment' }));
      });
      return;
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => liveServer.listen(0, '127.0.0.1', r));
  livePort = liveServer.address().port;
});

after(async () => {
  if (hungServer) {
    try { hungServer.closeAllConnections && hungServer.closeAllConnections(); } catch {}
    await new Promise((r) => hungServer.close(r));
  }
  if (liveServer) {
    try { liveServer.closeAllConnections && liveServer.closeAllConnections(); } catch {}
    await new Promise((r) => liveServer.close(r));
  }
});

test('Ollama DOWN: clipboard non-empty < 5s, PENDING verbatim, deterministic skeleton', async () => {
  const extra = freshExtra(deadPort);
  const t0 = Date.now();
  const { text, mode } = await extra.composeHandoff(ROW_QUICK, ROW_QUICK.pending);
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, `handoff must ship < 5s with Ollama down (took ${ms}ms)`);
  assert.ok(text && text.length > 0, 'clipboard text is NON-EMPTY (never "nothing generated")');
  assert.ok(text.includes('⇄ MOO HANDOFF'), 'deterministic skeleton present');
  assert.ok(text.includes('EXACT pending question — verbatim?'), 'PENDING copied verbatim');
  assert.equal(mode, 'quick', 'turns 7 → quick mode');
});

test('Ollama HUNG generate (quick): timeout aborts, clipboard < 5s, PENDING verbatim', async () => {
  const extra = freshExtra(hungPort);
  const t0 = Date.now();
  const { text } = await extra.composeHandoff(ROW_QUICK, ROW_QUICK.pending);
  const ms = Date.now() - t0;
  assert.ok(ms < 5000, `hung Ollama must not hang the clipboard (took ${ms}ms)`);
  assert.ok(text && text.includes('⇄ MOO HANDOFF'), 'skeleton shipped despite hung Ollama');
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
  assert.ok(text.includes('⇄ MOO HANDOFF'), 'skeleton shipped');
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

// ── KEEP-WARM (B) ────────────────────────────────────────────────────────────────────────────
test('keep-warm: every /api/generate body carries keep_alive "30m" (via composeHandoff)', async () => {
  const extra = freshExtra(livePort);
  lastGenBody = null;
  const c = await extra.composeHandoff(ROW_QUICK, ROW_QUICK.pending, { deadlineMs: 4000, doingMs: 3500 });
  assert.ok(lastGenBody, 'live Ollama /api/generate was reached');
  assert.equal(lastGenBody.keep_alive, '30m', 'keep_alive "30m" renews the warm model on every generate');
  assert.equal(c.model, 'qwen2.5:3b', 'composeHandoff reports the local gen model when the narrative ran');
  assert.ok(c.text.includes('⇄ MOO HANDOFF'), 'enriched text is still a valid handoff');
});

test('keep-warm: warmLocalGenModel fires a tiny generate with keep_alive "30m" (renew on warm)', async () => {
  const extra = freshExtra(livePort);
  lastGenBody = null;
  assert.equal(extra.warmLocalGenModel(200), true, 'warm never blocks — returns true immediately');
  // fire-and-forget → poll briefly for the background generate to land.
  const t0 = Date.now();
  while (lastGenBody == null && Date.now() - t0 < 3000) { await new Promise((r) => setTimeout(r, 25)); }
  assert.ok(lastGenBody, 'warm reached /api/generate in the background');
  assert.equal(lastGenBody.keep_alive, '30m', 'warm renews keep_alive "30m"');
  assert.equal(lastGenBody.options.num_predict, 1, 'warm uses a tiny generate (num_predict 1)');
});

// ── BACKGROUND ENRICHMENT handler-sim (A) ─────────────────────────────────────────────────────
// Mirrors the cockpit handler m.cmd==='handoff' WITHOUT vscode: skeleton 'ready' + clipboard BEFORE
// any LLM await; 'enriched' + re-clipboard ONLY when c.model!=null and the text changed.
test('handler-sim (live): ready+clipboard BEFORE LLM await; enriched only when model!=null & text changed', async () => {
  const extra = freshExtra(livePort);
  const row = Object.assign({}, ROW_QUICK);
  const pending = row.pending;
  const mode = (Number(row.turns) || 0) >= 12 ? 'full' : 'quick';
  const posts = []; const clips = [];
  // PASSO 1 — esqueleto, ANTES de qualquer await de LLM
  const text0 = extra.generateHandoff(row, pending, { mode });
  posts.push({ status: 'ready', text: text0 });
  clips.push(text0);
  assert.equal(posts.length, 1, 'exactly the ready post before any LLM work');
  assert.equal(posts[0].status, 'ready');
  assert.equal(clips[0], text0, 'skeleton copied to the clipboard first');
  assert.ok(clips[0].includes('EXACT pending question — verbatim?'), 'PENDING verbatim in the copied skeleton');
  // PASSO 2 — enriquecer
  const c = await extra.composeHandoff(row, pending, { mode, deadlineMs: 4000, doingMs: 3500, recapMs: 3800 });
  if (c && c.model && c.text && c.text !== text0) {
    posts.push({ status: 'enriched', text: c.text, model: c.model });
    clips.push(c.text);
  }
  assert.equal(posts.length, 2, 'enriched posted after the narrative ran (live Ollama)');
  assert.equal(posts[1].status, 'enriched');
  assert.equal(posts[1].model, 'qwen2.5:3b', 'enriched carries the model name');
  assert.equal(clips[1], c.text, 're-copied the enriched text');
  assert.ok(c.text !== text0, 'enriched text differs from the skeleton');
  assert.ok(c.text.includes('EXACT pending question — verbatim?'), 'PENDING still verbatim after enrichment');
});

test('handler-sim (Ollama down): ready+clipboard only, NO enriched (skeleton stays, never empty)', async () => {
  const extra = freshExtra(deadPort);
  const row = ROW_QUICK;
  const pending = row.pending;
  const mode = (Number(row.turns) || 0) >= 12 ? 'full' : 'quick';
  const posts = []; const clips = [];
  const text0 = extra.generateHandoff(row, pending, { mode });
  posts.push({ status: 'ready', text: text0 });
  clips.push(text0);
  const c = await extra.composeHandoff(row, pending, { mode, deadlineMs: 4000, doingMs: 3500 });
  if (c && c.model && c.text && c.text !== text0) { posts.push({ status: 'enriched' }); clips.push(c.text); }
  assert.equal(posts.length, 1, 'no enriched post when Ollama is down');
  assert.equal(clips.length, 1, 'clipboard holds only the skeleton');
  assert.equal(c.model, null, 'composeHandoff reports a null model when no narrative ran');
  assert.ok(clips[0].includes('⇄ MOO HANDOFF'), 'skeleton is non-empty (never "nothing generated")');
});
