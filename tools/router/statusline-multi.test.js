#!/usr/bin/env node
// @ts-check
/**
 * Tests for statusline-multi.js — narrative statusline renderer.
 *
 * Covers the pure helpers (no I/O) so we can guarantee:
 *   - the four primary states (green / yellow / red / empty) are reachable
 *     and never render a degraded "—" by accident,
 *   - the priority order is RED > YELLOW > GREEN (so a critical Anthropic
 *     situation is never masked by a yellow savings warning),
 *   - the digest aggregator filters tester noise + non-today events,
 *   - the beast-overkill heuristic counts only forced-T3 + low-complexity
 *     turns (no false positives on real T3 work).
 *
 * Run with:  node --test statusline-multi.test.js
 */

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  pickState, renderFromContext,
  digest, beastOverkillPct, zenUnderkillPct, avgConfidence,
  computeAnthropicRem, computeCodexRem, computeCodexMessagesLeft,
  getAdapterStatus, clampPercent,
  DEMO_CONTEXTS,
} = require('./statusline-multi.js');

// ── pickState — primary states ──────────────────────────────────────────

test('pickState: green when savings tracker reports healthy figures', () => {
  const s = pickState(DEMO_CONTEXTS.green);
  assert.equal(s.color, 'green');
  // Wave 12 PR-I — headline carries the de-branded saved clause with the "today"
  // and "vs all-Opus" qualifiers; the tier badge moves to state.lastLabel so the
  // 2-line renderer can sit the sparkline ahead of it.
  assert.match(s.headline, /saved \$0\.27 all-time \(89% vs all-Opus\)/);
  assert.doesNotMatch(s.headline, /mooter saved/);
  assert.match(s.lastLabel, /T2 sonnet · conf 0\.84/);
});

test('pickState: yellow when beast overkill exceeds threshold', () => {
  const s = pickState(DEMO_CONTEXTS.yellow);
  assert.equal(s.color, 'yellow');
  assert.match(s.headline, /forced T3 on trivials/);
});

test('pickState: red when Anthropic 5h window is critically low', () => {
  const s = pickState(DEMO_CONTEXTS.red);
  assert.equal(s.color, 'red');
  assert.match(s.headline, /Anthropic 8% used/);
  assert.match(s.headline, /Codex \(84%\)/);
});

test('pickState: setup state when no data and no quota state (Wave 2 Day 2)', () => {
  // The cold-start branch was renamed empty → setup so a fresh WSL install
  // sees the concrete next step instead of a generic "no data" message.
  const s = pickState(DEMO_CONTEXTS.empty);
  assert.equal(s.color, 'setup');
  assert.match(s.headline, /setup incomplete/);
  assert.match(s.headline, /\/mooter init/);
});

test('pickState: tracker online but no decisions yet → not setup, proof "—" (NIT 3 Day 2)', () => {
  // dataMissing=false means the savings tracker has spun up; total=0 means no
  // decisions have landed yet. The setup branch must NOT fire (tracker online),
  // and with nothing to show the proof falls back to the "—" placeholder rather
  // than a stale number.
  const ctx = {
    ...DEMO_CONTEXTS.green,
    dataMissing: false,
    total: 0,
    last: null,
    recent: [],
    anthRem: undefined,
    savedPct: undefined,
    savedUsd: undefined,
  };
  const s = pickState(ctx);
  assert.notEqual(s.color, 'setup', 'tracker is online — setup state must not fire');
  assert.doesNotMatch(s.headline, /setup incomplete/);
  assert.equal(s.proof, '—', 'no decisions yet → proof placeholder');
});

// ── pickState — priority ordering ───────────────────────────────────────

test('pickState: RED Anthropic-low beats YELLOW low-savings', () => {
  const ctx = {
    ...DEMO_CONTEXTS.green,
    anthRem: 5,           // critical
    savedPct: 10, total: 20, // would be yellow on its own
  };
  assert.equal(pickState(ctx).color, 'red');
});

test('pickState: RED confidence-collapse beats YELLOW beast-overkill', () => {
  const beastEvents = Array(10).fill({
    tier: 'T3',
    escalation_rule: 'beast_intent_force_t3',
    prompt_complexity_score: 0.01,
    confidence: 0.3,
  });
  const ctx = {
    ...DEMO_CONTEXTS.green,
    anthRem: 80,
    last:   beastEvents[0],
    recent: beastEvents,
  };
  const s = pickState(ctx);
  assert.equal(s.color, 'red');
  assert.match(s.headline, /miscalibrated/);
});

test('pickState: YELLOW low-savings only fires after enough turns', () => {
  const ctx = {
    ...DEMO_CONTEXTS.green,
    total: 3,             // below the 5-turn floor
    savedPct: 5,
  };
  assert.equal(pickState(ctx).color, 'green');
});

// ── renderFromContext — output shape ────────────────────────────────────

test('renderFromContext: prints exactly one line with glyph + headline + proof', () => {
  for (const k of ['green', 'yellow', 'red', 'empty']) {
    const out = renderFromContext(DEMO_CONTEXTS[k]);
    assert.equal(out.includes('\n'), false, `state ${k} produced multiline output`);
    // Wave 2.5 Day 1: brand glyphs 🐮 / 🐂 / 🚨 replace the traffic-light dots;
    // setup keeps 🛠 and ⚪ stays for the legacy empty fallback.
    assert.match(out, /^[🐮🐂🚨⚪🛠]/u, `state ${k} missing color glyph`);
    assert.match(out, / │ /, `state ${k} missing separator`);
  }
});

test('renderFromContext: never returns empty string', () => {
  const out = renderFromContext(DEMO_CONTEXTS.empty);
  assert.ok(out.length > 5);
});

// ── digest — log filtering ──────────────────────────────────────────────

test('digest: ignores tester_* events and non-today entries', () => {
  const today = new Date().toISOString();
  const yesterday = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const lines = [
    JSON.stringify({ event: 'classified', source: 'mooter-tester', ts: today, tier: 'T2' }),
    JSON.stringify({ event: 'classified', ts: yesterday, tier: 'T2' }),
    JSON.stringify({ event: 'classified', ts: today, tier: 'T2', confidence: 0.9 }),
    JSON.stringify({ event: 'classified', ts: today, tier: 'T0', confidence: 0.5,
                     suggested_providers: ['ollama'] }),
    JSON.stringify({ event: 'turn_end',   ts: today }),
  ];
  const d = digest(lines);
  assert.equal(d.total, 2, 'expected only 2 today-classified non-tester events');
  assert.equal(d.counts.T2, 1);
  assert.equal(d.counts.T0, 1);
  assert.ok(d.last);
  assert.equal(d.recent.length >= 2, true);
});

test('digest: counts codex_cli first-suggested separately from tier', () => {
  const today = new Date().toISOString();
  const lines = [
    JSON.stringify({ event: 'classified', ts: today, tier: 'T2',
                     suggested_providers: ['codex_cli', 'sonnet'], confidence: 0.8 }),
    JSON.stringify({ event: 'classified', ts: today, tier: 'T2',
                     suggested_providers: ['sonnet'], confidence: 0.8 }),
  ];
  const d = digest(lines);
  assert.equal(d.counts.codex, 1);
  assert.equal(d.counts.T2,    1);
  assert.equal(d.total, 2);
});

// ── Quota helpers ──────────────────────────────────────────────────────

test('computeAnthropicRem: integer percentage from window_5h', () => {
  const q = { providers: { anthropic: { window_5h: { tokens_used: 250, limit: 1000 } } } };
  assert.equal(computeAnthropicRem(q), 75);
});

test('computeCodexRem: 0 when exhausted flag set', () => {
  const q = { providers: { openai_codex_cli: {
    window_5h: { messages_used: 5, limit: 100 },
    exhausted: true,
  } } };
  assert.equal(computeCodexRem(q), 0);
});

test('computeCodexMessagesLeft: subtracts used from limit and clamps at 0', () => {
  const q = { providers: { openai_codex_cli: {
    window_5h: { messages_used: 60, limit: 150 },
  } } };
  assert.equal(computeCodexMessagesLeft(q), 90);
});

// ── Heuristics ─────────────────────────────────────────────────────────

test('beastOverkillPct: 0 on empty, ignores high-complexity prompts', () => {
  assert.equal(beastOverkillPct([]), 0);
  const events = [
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.4 },
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.6 },
  ];
  // Both are real T3 work (complexity above the 0.05 trivial threshold).
  assert.equal(beastOverkillPct(events), 0);
});

test('beastOverkillPct: counts forced trivials only', () => {
  const events = [
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.01 },
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.5  },
    { tier: 'T0' },
    { tier: 'T3', escalation_rule: 'beast_intent_force_t3', prompt_complexity_score: 0.01 },
  ];
  // 2 of 4 are forced trivials → 50%.
  assert.equal(beastOverkillPct(events), 50);
});

test('zenUnderkillPct: 0 on empty, ignores low-complexity prompts', () => {
  assert.equal(zenUnderkillPct([]), 0);
  const events = [
    { tier: 'T1', active_mode: 'zen', prompt_complexity_score: 0.1 },
    { tier: 'T1', active_mode: 'zen', prompt_complexity_score: 0.3 },
  ];
  // Both are within zen's competence (complexity ≤ 0.5) → no underkill.
  assert.equal(zenUnderkillPct(events), 0);
});

test('zenUnderkillPct: counts capped complex tasks only', () => {
  const events = [
    { tier: 'T1', active_mode: 'zen', prompt_complexity_score: 0.8 }, // capped + complex
    { tier: 'T0', active_mode: 'zen', prompt_complexity_score: 0.7 }, // capped + complex
    { tier: 'T1', active_mode: 'zen', prompt_complexity_score: 0.2 }, // capped + simple — fine
    { tier: 'T2' }, // no zen
  ];
  // 2 of 4 are zen-capped complex tasks → 50%.
  assert.equal(zenUnderkillPct(events), 50);
});

test('pickState: yellow when zen underkill exceeds threshold', () => {
  const zenEvents = Array(10).fill({
    tier: 'T1',
    active_mode: 'zen',
    escalation_rule: 'zen_mode',
    prompt_complexity_score: 0.7,
    confidence: 0.8,
  });
  const ctx = {
    ...DEMO_CONTEXTS.green,
    last:   zenEvents[0],
    recent: zenEvents,
  };
  const s = pickState(ctx);
  assert.equal(s.color, 'yellow');
  assert.match(s.headline, /zen-capped on complex tasks/);
});

test('pickState: severe drift wins over beast overkill (priority)', () => {
  const beastEvents = Array(10).fill({
    tier: 'T3',
    escalation_rule: 'beast_intent_force_t3',
    prompt_complexity_score: 0.01,
    confidence: 0.95,
  });
  const ctx = {
    ...DEMO_CONTEXTS.yellow,
    recent: beastEvents,
    drift: { drift: true, severity: 'severe', tier: 'T3', actual: 80, expected: 25, deltaPct: 55 },
  };
  const s = pickState(ctx);
  assert.equal(s.color, 'yellow');
  assert.match(s.headline, /routing drift/);
});

test('pickState: mild drift surfaces only when no other yellow fires', () => {
  const ctx = {
    ...DEMO_CONTEXTS.green,
    drift: { drift: true, severity: 'mild', tier: 'T0', deltaPct: 12 },
  };
  const s = pickState(ctx);
  assert.equal(s.color, 'yellow');
  assert.match(s.headline, /mild drift on T0/);
});

test('pickState: drift=false context is identical to no-drift baseline', () => {
  const ctx = { ...DEMO_CONTEXTS.green, drift: { drift: false } };
  const s = pickState(ctx);
  assert.equal(s.color, 'green');
});

test('avgConfidence: ignores undefined / non-finite values', () => {
  const xs = [{ confidence: 0.8 }, { confidence: 0.4 }, { confidence: NaN }, {}];
  const avg = avgConfidence(xs);
  assert.ok(avg !== null && Math.abs(avg - 0.6) < 1e-9);
});

test('avgConfidence: returns null when no usable values', () => {
  assert.equal(avgConfidence([]),     null);
  assert.equal(avgConfidence([{}]),   null);
  assert.equal(avgConfidence([{ confidence: 'not-a-number' }]), null);
});

// ── Wave 2 Day 2 — pack + adapter chips ─────────────────────────────────

test('renderFromContext: appends pack chip when lastPack has a concrete pack id', () => {
  const ctx = { ...DEMO_CONTEXTS.green, lastPack: { pack_id: 'animation-web', candidates: null } };
  const out = renderFromContext(ctx);
  assert.match(out, /· pack: animation-web/, 'pack chip missing');
});

test('renderFromContext: AMBIGUOUS pack chip lists the top-2 candidates', () => {
  const ctx = {
    ...DEMO_CONTEXTS.green,
    lastPack: { pack_id: 'AMBIGUOUS', candidates: ['animation-web', 'code-audit', 'diagram-systems'] },
  };
  const out = renderFromContext(ctx);
  assert.match(out, /· pack: AMBIGUOUS \(animation-web, code-audit\)/, 'AMBIGUOUS chip wrong shape');
});

test('renderFromContext: skips pack chip for GENERAL (no domain match)', () => {
  const ctx = { ...DEMO_CONTEXTS.green, lastPack: { pack_id: 'GENERAL' } };
  const out = renderFromContext(ctx);
  assert.doesNotMatch(out, /· pack:/, 'GENERAL pack chip should be suppressed');
});

test('renderFromContext: appends idle adapter chip (Wave 5 placeholder)', () => {
  const ctx = { ...DEMO_CONTEXTS.green, adapter: { status: 'idle' } };
  const out = renderFromContext(ctx);
  assert.match(out, /· adapter: ◌/, 'idle adapter chip missing');
});

test('renderFromContext: adapter chip glyphs follow status', () => {
  for (const [status, glyph] of [['idle', '◌'], ['loading', '◐'], ['loaded', '●']]) {
    const out = renderFromContext({ ...DEMO_CONTEXTS.green, adapter: { status } });
    assert.match(out, new RegExp(`· adapter: ${glyph}`), `status ${status} → glyph ${glyph}`);
  }
});

test('renderFromContext: setup state suppresses pack + adapter chips', () => {
  // While the user has nothing wired the chips would be misleading — the
  // headline already tells them exactly what to do.
  const ctx = {
    ...DEMO_CONTEXTS.empty,
    lastPack: { pack_id: 'animation-web' }, // would normally render
    adapter:  { status: 'idle' },           // would normally render
  };
  const out = renderFromContext(ctx);
  assert.doesNotMatch(out, /· pack:/);
  assert.doesNotMatch(out, /· adapter:/);
  assert.match(out, /\/mooter init/);
});

test('getAdapterStatus: idle when no active adapter (B2 reads real state)', () => {
  // Wave 16-18 Day 2 B2 — now wired to getActiveAdapter(); with no
  // ~/.mooter/preferences.json (CI/default), it correctly reports idle.
  const a = getAdapterStatus();
  assert.equal(a.status, 'idle');
  assert.equal(a.id, null);
});

// ── Wave 2.5 Day 1 — glyphs, headline badge, cost/ctx chips, compact ─────

test('renderFromContext: healthy state renders the 🐮 cow glyph', () => {
  const out = renderFromContext(DEMO_CONTEXTS.green);
  assert.match(out, /^🐮 /u, 'green should lead with the cow glyph');
});

test('renderFromContext: warning state renders the 🐂 ox glyph', () => {
  const out = renderFromContext(DEMO_CONTEXTS.yellow);
  assert.match(out, /^🐂 /u, 'yellow should lead with the ox glyph');
});

test('renderFromContext: critical state renders the 🚨 glyph', () => {
  const out = renderFromContext(DEMO_CONTEXTS.red);
  assert.match(out, /^🚨 /u, 'red should lead with the siren glyph');
});

test('pickState: green exposes Tier + model + confidence on state.lastLabel', () => {
  const s = pickState(DEMO_CONTEXTS.green);
  assert.equal(s.color, 'green');
  // PR-I — the tier badge is exposed separately (not folded into the headline)
  // so the 2-line renderer can position the sparkline between outcome and tier.
  assert.match(s.lastLabel, /^T2 sonnet · conf 0\.84$/, 'tier badge lives on state.lastLabel');
  assert.doesNotMatch(s.headline, /T2 sonnet/, 'tier badge no longer inlined in the green headline');
});

test('pickState: ctx % chip rendered when context.percent_used is present', () => {
  const ctx = { ...DEMO_CONTEXTS.green, ctxPercent: 23 };
  const s = pickState(ctx);
  assert.match(s.proof, /ctx 23%/, 'ctx chip missing from proof');
});

test('pickState: turn + alltime cost chips rendered from tracker metrics', () => {
  const ctx = { ...DEMO_CONTEXTS.green, lastTurnCost: 0.04, alltimeCost: 4.21 };
  const s = pickState(ctx);
  assert.match(s.proof, /turn \$0\.04/, 'turn chip missing');
  assert.match(s.proof, /alltime \$4\.21/, 'alltime chip missing');
});

test('pickState: full green proof orders ctx · 5h · turn · alltime', () => {
  const ctx = { ...DEMO_CONTEXTS.green, ctxPercent: 23, lastTurnCost: 0.04, alltimeCost: 4.21 };
  const s = pickState(ctx);
  assert.equal(s.proof, 'ctx 23% · 42% 5h est · turn $0.04 · alltime $4.21');
});

test('renderFromContext: full mode (COLUMNS=120) shows pack + adapter chips', () => {
  const prev = process.env.COLUMNS;
  process.env.COLUMNS = '120';
  try {
    const ctx = { ...DEMO_CONTEXTS.green, lastPack: { pack_id: 'animation-web' }, adapter: { status: 'idle' } };
    const out = renderFromContext(ctx);
    assert.match(out, /· pack: animation-web/, 'pack chip should show in full mode');
    assert.match(out, /· adapter: ◌/, 'adapter chip should show in full mode');
  } finally { if (prev === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prev; }
});

test('renderFromContext: compact mode (COLUMNS=80) omits pack + adapter chips', () => {
  const prev = process.env.COLUMNS;
  process.env.COLUMNS = '80';
  try {
    const ctx = { ...DEMO_CONTEXTS.green, lastPack: { pack_id: 'animation-web' }, adapter: { status: 'idle' } };
    const out = renderFromContext(ctx);
    assert.doesNotMatch(out, /· pack:/, 'pack chip must be dropped in compact mode');
    assert.doesNotMatch(out, /· adapter:/, 'adapter chip must be dropped in compact mode');
    // …but the essential cost/quota chips stay.
    assert.match(out, /42% 5h/, 'compact mode must keep the essential 5h chip');
  } finally { if (prev === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prev; }
});

test('clampPercent: rounds and clamps to 0..100, null on garbage', () => {
  assert.equal(clampPercent(23.4), 23);
  assert.equal(clampPercent(150), 100);
  assert.equal(clampPercent(-5), 0);
  assert.equal(clampPercent('not-a-number'), null);
  assert.equal(clampPercent(undefined), null);
});
