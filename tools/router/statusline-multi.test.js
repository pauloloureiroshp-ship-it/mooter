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
  pickState, renderFromContext, renderTwoLine, render,
  digest, beastOverkillPct, zenUnderkillPct, avgConfidence,
  computeAnthropicRem, computeCodexRem, computeCodexMessagesLeft,
  getAdapterStatus, clampPercent, formatSessionAge,
  DEMO_CONTEXTS,
} = require('./statusline-multi.js');

// ── pickState — primary states ──────────────────────────────────────────

test('pickState: green when savings tracker reports healthy figures', () => {
  const s = pickState(DEMO_CONTEXTS.green);
  assert.equal(s.color, 'green');
  // Wave 12 PR-I — headline carries the de-branded saved clause with the "today"
  // and "vs all-Opus" qualifiers; the tier badge moves to state.lastLabel so the
  // 2-line renderer can sit the sparkline ahead of it.
  assert.match(s.headline, /saved \$0\.27 all-time·local \(89% vs all-Opus\)/);
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

test('pickState: this-prompt + session cost chips rendered from tracker metrics', () => {
  const ctx = { ...DEMO_CONTEXTS.green, lastTurnCost: 0.04, alltimeCost: 4.21 };
  const s = pickState(ctx);
  assert.match(s.proof, /this prompt \$0\.04/, 'this-prompt chip missing');
  assert.match(s.proof, /session \$4\.21/, 'session chip missing');
});

test('pickState: full green proof orders ctx · 5h · this prompt · session', () => {
  const ctx = { ...DEMO_CONTEXTS.green, ctxPercent: 23, lastTurnCost: 0.04, alltimeCost: 4.21 };
  const s = pickState(ctx);
  assert.equal(s.proof, 'ctx 23% · 42% 5h est · this prompt $0.04 · session $4.21');
});

// Wave 33 (A.2) — session-age formatter buckets.
test('formatSessionAge: <60min → Nm, <24h → NhNm, ≥24h → NdNh', () => {
  assert.equal(formatSessionAge(47 * 60000), '47m');
  assert.equal(formatSessionAge(2 * 3600000 + 47 * 60000), '2h47m');
  assert.equal(formatSessionAge(2 * 86400000 + 4 * 3600000), '2d4h');
  assert.equal(formatSessionAge(0), '0m');
  assert.equal(formatSessionAge(-5), '0m');
  assert.equal(formatSessionAge(NaN), '0m');
});

// Wave 33 (C.1) — narrow terminals (<120) get a compact GPU chip on the single
// line, never the wide "VRAM (x/y GB)" chip. Hardware-tolerant: only asserts the
// FORM when a GPU profile happens to exist on the test machine.
test('C.1: narrow render is single-line and uses the compact GPU form', () => {
  const prev = process.env.COLUMNS;
  process.env.COLUMNS = '90';
  try {
    const lines = render({ ...DEMO_CONTEXTS.green, lastTurnCost: 0.04, alltimeCost: 4.21 }).split('\n');
    assert.equal(lines.length, 1, 'narrow terminal renders a single line');
    if (/🎮/.test(lines[0])) {
      assert.ok(!/VRAM \(/.test(lines[0]), 'narrow GPU chip is compact, not the wide VRAM chip');
    }
  } finally {
    if (prev === undefined) delete process.env.COLUMNS;
    else process.env.COLUMNS = prev;
  }
});

// Wave 33 (A.2) — the ⏱️ chip is gated to explicit modes (opts.forceLine3 is a
// boolean) so the adaptive default stays byte-identical.
test('renderTwoLine: session timer appears only when an explicit mode is pinned', () => {
  const ctx = { ...DEMO_CONTEXTS.green, ctxPercent: 23, sessionAge: 2 * 3600000 + 47 * 60000 };
  const adaptive = renderTwoLine(ctx);                      // no opts → adaptive default
  const explicit = renderTwoLine(ctx, { forceLine3: false }); // compact mode
  assert.ok(!/⏱️ session/.test(adaptive), 'adaptive default must not show the session timer');
  assert.match(explicit, /⏱️ session 2h47m/, 'explicit mode shows the session timer');
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

// ── Wave 20 — token label, dual metric, herd pulse ──────────────────────
const sl20 = require('./statusline-multi.js');

test('20.C: 🪙 token chip carries a single "tkns" unit label on the first tier', () => {
  const snap = { T0: { tokens_in: 13300, tokens_out: 0 }, T1: {}, T2: { tokens_in: 24200, tokens_out: 0 }, T3: {} };
  const chip = sl20.buildTokenChip(snap, { color: false });
  assert.match(chip, /^🪙 T0:13\.3k tkns · T1:0 · T2:24\.2k · T3:0$/);
  assert.equal((chip.match(/tkns/g) || []).length, 1, 'unit label appears exactly once, not per tier');
});

test('20.D: tokensLocalPct — a high call-share can mask a tiny token-share', () => {
  // 3 cheap local calls vs 1 huge Opus turn: lots of local CALLS, almost no local TOKENS.
  const snap = { T0: { tokens_in: 300, tokens_out: 200 }, T1: {}, T2: {}, T3: { tokens_in: 400000, tokens_out: 100000 } };
  const pct = sl20.tokensLocalPct(snap);
  assert.ok(pct > 0 && pct < 1, `expected sub-1% local by tokens, got ${pct}`);
  assert.equal(sl20.fmtSharePct(pct), pct.toFixed(1), 'sub-10% keeps one decimal (0.1%)');
  assert.equal(sl20.fmtSharePct(60), '60', '≥10% rounds to an integer');
  assert.equal(sl20.tokensLocalPct({ T0: {}, T1: {}, T2: {}, T3: {} }), null, 'no tokens → null, never a fake 0%');
});

test('20.D: home chip renders calls % AND tokens local % together (integration)', () => {
  const tt = require('./token_tracker.js');
  const session = `w20d-${process.pid}-${Date.now()}`;
  tt.trackCall('T0', 'qwen3:30b', 300, 200, { sessionId: session });  // local, small
  tt.trackCall('T3', 'opus', 400000, 100000, { sessionId: session });  // cloud, huge
  const prev = process.env.COLUMNS;
  process.env.COLUMNS = '160';
  try {
    const ctx = {
      counts: { T0: 6, T1: 0, T2: 0, T3: 4 }, total: 10,
      last: { tier: 'T0', confidence: 0.8, suggested_providers: ['qwen'] },
      recent: [{ tier: 'T0' }], savedUsd: 0.2, savedPct: 80, ctxPercent: 20,
      dataMissing: false, sessionId: session,
    };
    const line2 = sl20.renderTwoLine(ctx).split('\n')[1];
    // Wave 21 (C4) — single-source 🏠 chip: calls AND token% both derive from the
    // token_tracker snapshot (1 local push + 1 cloud push → 1/2 calls), so the chip
    // agrees with the 🪙 chip. The honesty juxtaposition survives: 50% of CALLS
    // local while only 0.1% of TOKENS local (one Opus turn dwarfs many Ollama calls).
    assert.match(line2, /🏠 1\/2 calls \(50%\)/, 'calls share from the token snapshot');
    assert.match(line2, /· 0\.1% tokens local/, 'tiny token share exposed alongside it (honesty)');
  } finally {
    if (prev === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prev;
    require('fs').rmSync(tt.cachePath(session), { force: true });
  }
});

// Wave 22 (22.A) — herd chip UNHIDDEN: the native SubagentStop hook now writes the
// herd file for real (Day 0 proved it fires once per spawn), so the chip renders a true
// `🐄 N/M/peakK`. The 20.E dim trailing pulse alternates by tick when ≥1 Moo is active.
test('22.A: herd chip pulse renders (dim trailing, alternating by tick)', () => {
  // idle (0 active): no pulse, count visible
  assert.equal(sl20.buildHerdsChip({ active: 0, total: 5, peak: 3 }, { color: false, tick: 0 }), '🐄 0/5/peak3');
  // active: dim ◉/◯ trails, alternating per tick
  assert.equal(sl20.buildHerdsChip({ active: 1, total: 5, peak: 3 }, { color: false, tick: 0 }), '🐄 1/5/peak3 ◉');
  assert.equal(sl20.buildHerdsChip({ active: 1, total: 5, peak: 3 }, { color: false, tick: 1 }), '🐄 1/5/peak3 ◯');
  // ≥3 concurrent lights ⚡ workflow
  assert.equal(sl20.buildHerdsChip({ active: 3, total: 9, peak: 3 }, { color: false, tick: 0 }), '🐄 3/9/peak3 · ⚡ workflow ◉');
});

test('22.A buildHerdsChip renders with color (unhidden)', () => {
  const out = sl20.buildHerdsChip({ active: 3, total: 9, peak: 3 }, { color: true, tick: 0 });
  assert.ok(out.includes('🐄 3/9/peak3'), `expected count: ${out}`);
  assert.ok(out.includes('⚡ workflow'), `expected workflow cue: ${out}`);
});
