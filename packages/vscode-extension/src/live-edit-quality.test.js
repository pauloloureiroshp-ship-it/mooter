'use strict';
// live-edit-quality.test.js — LP-4.7 §1/§2 · the Moo Quality Engine. The contracts under test:
// greedy-first (one call when the moo gets it right — today's cost), best-of-N with FIRST VALID
// WINS (no wasted samples), round 2 carries the verifier's EXACT error, exhaustion returns
// EVIDENCE (never a cloud call — escalation is the user's click, not this module's), infra
// failures abort as-is, and telemetry records features only (no prompt, no node, no reply).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LEQ = require('./live-edit-quality.js');
const LEA = require('./live-edit-ast.js');

const SRC = [
  "import { useState } from 'react';",
  '',
  'export default function P() {',
  '  return (',
  '    <section className="hero">',
  '      <img src="/a.png" alt="a" />',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const RANGE = (() => { const r = LEA.locateRange(SRC, { line: 6, tag: 'img' }); return { start: r.start, end: r.end }; })();
const INPUT = { nodeSource: SRC.slice(RANGE.start, RANGE.end), prompt: 'faz qualquer coisa', file: 'app/page.tsx', line: 6 };

function mkWs(withPkgs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leq-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'ws' }), 'utf8');
  for (const p of withPkgs || []) {
    const dir = path.join(root, 'node_modules', p);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: p }), 'utf8');
  }
  return root;
}

// A scripted fake moo: pops replies in order and records every call's opts for assertions.
function scriptedRewrite(replies) {
  const calls = [];
  const fn = async (input, opts) => {
    calls.push({ input, opts });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return typeof r === 'function' ? r(input, opts) : r;
  };
  return { fn, calls };
}

const GOOD = { ok: true, text: '<img src="/a.png" alt="a" className="rounded" />', newImports: [], envelope: true, model: 'fake-moo' };
const BAD_TWO_ROOTS = { ok: true, text: '<i>a</i>\n<i>b</i>', newImports: [], envelope: true, model: 'fake-moo' };

test('greedy sample valid → exactly ONE call at T=0.1, envelope on, result carries the pass', async () => {
  const { fn, calls } = scriptedRewrite([GOOD]);
  const events = [];
  const r = await LEQ.runQualityLoop(INPUT, {
    source: SRC, range: RANGE, wsRoot: mkWs([]), rewrite: fn, telemetrySink: (rec) => events.push(rec),
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.replacement, GOOD.text);
  assert.deepStrictEqual(r.imports, []);
  assert.strictEqual(r.samplesTried, 1);
  assert.deepStrictEqual(r.passed, { round: 1, sample: 0, temperature: 0.1 });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].opts.temperature, 0.1);
  assert.strictEqual(calls[0].opts.envelope, true);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].outcome, 'passed');
});

test('greedy fails → T=0.7 burst, FIRST VALID WINS (no further samples after the pass)', async () => {
  const { fn, calls } = scriptedRewrite([BAD_TWO_ROOTS, BAD_TWO_ROOTS, GOOD, GOOD, GOOD]);
  const r = await LEQ.runQualityLoop(INPUT, { source: SRC, range: RANGE, wsRoot: mkWs([]), rewrite: fn, telemetrySink: () => {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.samplesTried, 3, 'stopped at the first valid sample');
  assert.deepStrictEqual(r.passed, { round: 1, sample: 2, temperature: 0.7 });
  assert.deepStrictEqual(calls.map((c) => c.opts.temperature), [0.1, 0.7, 0.7]);
});

test('round 2 carries the verifier EXACT error; a repaired greedy ends the loop at 6 calls', async () => {
  const replies = [BAD_TWO_ROOTS, BAD_TWO_ROOTS, BAD_TWO_ROOTS, BAD_TWO_ROOTS, BAD_TWO_ROOTS, GOOD];
  const { fn, calls } = scriptedRewrite(replies);
  const r = await LEQ.runQualityLoop(INPUT, { source: SRC, range: RANGE, wsRoot: mkWs([]), rewrite: fn, telemetrySink: () => {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.samplesTried, 6);
  assert.deepStrictEqual(r.passed, { round: 2, sample: 0, temperature: 0.1 });
  const round1Blocks = (calls[0].opts.extraBlocks || []).join('\n');
  assert.ok(round1Blocks.indexOf('RECUSADA') === -1, 'round 1 has no feedback');
  const round2Blocks = (calls[5].opts.extraBlocks || []).join('\n');
  assert.ok(round2Blocks.indexOf('RECUSADA') !== -1, 'round 2 feeds the failure back');
  assert.ok(round2Blocks.indexOf('replacement-parse-error') !== -1, 'the EXACT fence reason, verbatim');
  assert.ok(round2Blocks.indexOf('Adjacent JSX elements') !== -1, 'the parser detail rides too — the most teachable part');
});

test('everything fails → local-quality-exhausted with full evidence, NEVER a cloud call', async () => {
  const { fn, calls } = scriptedRewrite([BAD_TWO_ROOTS]);
  const events = [];
  const r = await LEQ.runQualityLoop(INPUT, { source: SRC, range: RANGE, wsRoot: mkWs([]), rewrite: fn, telemetrySink: (e) => events.push(e) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'local-quality-exhausted');
  assert.strictEqual(calls.length, 10, '2 rounds × (1 greedy + 4 sampled)');
  assert.strictEqual(r.evidence.samplesTried, 10);
  assert.strictEqual(r.evidence.rounds, 2);
  assert.strictEqual(r.evidence.lastReason, 'replacement-parse-error');
  assert.strictEqual(r.evidence.failures.length, 10);
  assert.strictEqual(r.evidence.model, 'fake-moo');
  assert.strictEqual(events[0].outcome, 'exhausted');
});

test('infra failure aborts the loop as-is (sampling cannot repair a dead daemon)', async () => {
  const { fn, calls } = scriptedRewrite([{ ok: false, reason: 'local-model-offline' }]);
  const r = await LEQ.runQualityLoop(INPUT, { source: SRC, range: RANGE, wsRoot: mkWs([]), rewrite: fn, telemetrySink: () => {} });
  assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: 'local-model-offline' });
  assert.strictEqual(calls.length, 1);
});

test('empty reply is a QUALITY failure (resampled), not an abort', async () => {
  const { fn, calls } = scriptedRewrite([{ ok: false, reason: 'local-model-empty' }, GOOD]);
  const r = await LEQ.runQualityLoop(INPUT, { source: SRC, range: RANGE, wsRoot: mkWs([]), rewrite: fn, telemetrySink: () => {} });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls.length, 2);
});

test('a hallucinated lucide brand import is caught, taught back in round 2, and repaired', async () => {
  const ws = mkWs(['lucide-react']);
  const withGhost = { ok: true, text: '<img alt="a" />', newImports: ["import { Github } from 'lucide-react'"], envelope: true, model: 'fake-moo' };
  const replies = [withGhost, withGhost, withGhost, withGhost, withGhost, GOOD];
  const { fn, calls } = scriptedRewrite(replies);
  const r = await LEQ.runQualityLoop(INPUT, { source: SRC, range: RANGE, wsRoot: ws, absFile: path.join(ws, 'app', 'page.tsx'), rewrite: fn, telemetrySink: () => {} });
  assert.strictEqual(r.ok, true);
  const fb = (calls[5].opts.extraBlocks || []).join('\n');
  assert.ok(fb.indexOf('lucide-name-unknown') !== -1);
  assert.ok(fb.indexOf('lucide-react não exporta Github') !== -1, 'the teachable detail rides the retry');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('verified imports ride the result; an import-conflict dry-run counts as a failed sample', async () => {
  const ws = mkWs(['simple-icons']);
  const withImport = { ok: true, text: '<img alt="a" />', newImports: ["import { siGithub } from 'simple-icons'"], envelope: true, model: 'fake-moo' };
  const { fn } = scriptedRewrite([withImport]);
  const r = await LEQ.runQualityLoop(INPUT, { source: SRC, range: RANGE, wsRoot: ws, absFile: path.join(ws, 'app', 'page.tsx'), rewrite: fn, telemetrySink: () => {} });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.imports, ["import { siGithub } from 'simple-icons'"]);
  // Conflict: the reply wants a local name the file already binds from ANOTHER module.
  const conflicting = { ok: true, text: '<img alt="a" />', newImports: ["import { useState } from 'simple-icons'"], envelope: true, model: 'fake-moo' };
  const s2 = scriptedRewrite([conflicting, GOOD]);
  const r2 = await LEQ.runQualityLoop(INPUT, { source: SRC, range: RANGE, wsRoot: ws, absFile: path.join(ws, 'app', 'page.tsx'), rewrite: s2.fn, telemetrySink: () => {} });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(s2.calls.length, 2, 'conflict burned one sample, next one passed');
  fs.rmSync(ws, { recursive: true, force: true });
});

test('asset intent puts the whitelist block on EVERY sample; telemetry stays feature-only', async () => {
  const { fn, calls } = scriptedRewrite([GOOD]);
  const events = [];
  const r = await LEQ.runQualityLoop(
    { nodeSource: INPUT.nodeSource, prompt: 'insere o logo do github no hero', file: 'app/page.tsx', line: 6 },
    { source: SRC, range: RANGE, wsRoot: mkWs([]), rewrite: fn, telemetrySink: (e) => events.push(e) },
  );
  assert.strictEqual(r.ok, true);
  const blocks = (calls[0].opts.extraBlocks || []).join('\n');
  assert.ok(blocks.indexOf('REGRAS DE ASSETS') !== -1, 'asset block injected');
  assert.ok(blocks.indexOf('aria-label="GitHub"') !== -1, 'the vendored SVG rides the prompt');
  const flat = JSON.stringify(events);
  assert.ok(flat.indexOf('insere o logo') === -1, 'no prompt text in telemetry');
  assert.ok(flat.indexOf('<img') === -1, 'no node/reply text in telemetry');
  assert.strictEqual(events[0].assetBlock, true);
});

test('status callbacks narrate round/sample honestly for the panel', async () => {
  const { fn } = scriptedRewrite([BAD_TWO_ROOTS, GOOD]);
  const seen = [];
  await LEQ.runQualityLoop(INPUT, { source: SRC, range: RANGE, wsRoot: mkWs([]), rewrite: fn, telemetrySink: () => {}, onStatus: (s) => seen.push(s) });
  assert.deepStrictEqual(seen[0], { phase: 'sampling', round: 1, rounds: 2, sample: 1, of: 5 });
  assert.deepStrictEqual(seen[1], { phase: 'sampling', round: 1, rounds: 2, sample: 2, of: 5 });
});

test('missing fence context is refused before any model call', async () => {
  const { fn, calls } = scriptedRewrite([GOOD]);
  const r = await LEQ.runQualityLoop(INPUT, { rewrite: fn, telemetrySink: () => {} });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'bad-request');
  assert.strictEqual(calls.length, 0);
});
