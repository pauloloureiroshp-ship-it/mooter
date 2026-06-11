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

const { test, after } = require('node:test');
const assert   = require('node:assert/strict');
const os       = require('node:os');
const path     = require('node:path');

const {
  pickState, renderFromContext, renderTwoLine, render,
  digest, beastOverkillPct, zenUnderkillPct, avgConfidence,
  computeAnthropicRem, computeCodexRem, computeCodexMessagesLeft,
  getAdapterStatus, clampPercent, formatSessionAge,
  DEMO_CONTEXTS,
} = require('./statusline-multi.js');

// Wave 55 (Phase H) — hermetic HOME for the adaptive-layout render() tests, so a
// dev's ~/.mooter/preferences.json {statusline_mode} pin can't force line-3.
const CLEAN_HOME = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'mooter-sl-multi-'));
after(() => { try { require('node:fs').rmSync(CLEAN_HOME, { recursive: true, force: true }); } catch { /* best-effort */ } });

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
  assert.match(s.proof, /\$0\.04 this turn/, 'this-turn chip missing');
  assert.match(s.proof, /\$4\.21 all-time/, 'all-time chip missing');
});

test('pickState: full green proof orders ctx · 5h · this turn · all-time', () => {
  const ctx = { ...DEMO_CONTEXTS.green, ctxPercent: 23, lastTurnCost: 0.04, alltimeCost: 4.21 };
  const s = pickState(ctx);
  assert.equal(s.proof, 'ctx 23% · 42% 5h est · $0.04 this turn · $4.21 all-time');
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
    const lines = render({ ...DEMO_CONTEXTS.green, lastTurnCost: 0.04, alltimeCost: 4.21 }, { home: CLEAN_HOME }).split('\n');
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
  assert.equal(sl20.buildHerdsChip({ active: 0, total: 5, peak: 3 }, { color: false, tick: 0 }), '🐄 agents 0 active · 5 spawned · peak 3');
  // active: dim ◉/◯ trails, alternating per tick
  assert.equal(sl20.buildHerdsChip({ active: 1, total: 5, peak: 3 }, { color: false, tick: 0 }), '🐄 agents 1 active · 5 spawned · peak 3 ◉');
  assert.equal(sl20.buildHerdsChip({ active: 1, total: 5, peak: 3 }, { color: false, tick: 1 }), '🐄 agents 1 active · 5 spawned · peak 3 ◯');
  // ≥3 concurrent lights ⚡ workflow
  assert.equal(sl20.buildHerdsChip({ active: 3, total: 9, peak: 3 }, { color: false, tick: 0 }), '🐄 agents 3 active · 9 spawned · peak 3 · ⚡ workflow ◉');
});

test('22.A buildHerdsChip renders with color (unhidden)', () => {
  const out = sl20.buildHerdsChip({ active: 3, total: 9, peak: 3 }, { color: true, tick: 0 });
  assert.ok(out.includes('🐄 agents 3 active · 9 spawned · peak 3'), `expected count: ${out}`);
  assert.ok(out.includes('⚡ workflow'), `expected workflow cue: ${out}`);
});

// Wave 49 (Phase 1) — Anthropic-aligned honesty: a single low-confidence route (<0.60)
// is marked ⚠ in-line so the operator sees the uncertainty without waiting for the
// three-in-a-row red headline. Healthy/unknown confidence carries no marker.
test('49: low-confidence (<0.60) last decision gets ⚠ marker in lastLabel', () => {
  const lo = { tier: 'T2', recommended_model: 'claude-sonnet-4-6', confidence: 0.42, suggested_providers: ['sonnet'] };
  const st = pickState({ total: 1000, last: lo, recent: [lo], savedPct: 50, savedUsd: 0.3 });
  assert.match(st.lastLabel, /⚠ conf 0\.42/, `expected ⚠ marker: ${st.lastLabel}`);
});

test('49: healthy confidence (>=0.60) carries no ⚠ marker', () => {
  const hi = { tier: 'T2', recommended_model: 'claude-sonnet-4-6', confidence: 0.88, suggested_providers: ['sonnet'] };
  const st = pickState({ total: 1000, last: hi, recent: [hi], savedPct: 50, savedUsd: 0.3 });
  assert.match(st.lastLabel, /conf 0\.88/);
  assert.ok(!/⚠/.test(st.lastLabel), `no marker expected: ${st.lastLabel}`);
});

// ── Wave Mega 50-51 (2.D) — 🔒 spawn-sandbox proof chip ────────────────────
// The chip renders ONLY when the host can enforce the spawn sandbox; when it
// cannot, it renders NOTHING (no "open lock" scare state). Detection is pure
// file-stat (no exec) and degrades silently.
const { sandboxCapable, buildSandboxChip } = require('./statusline-multi.js');

test('50: buildSandboxChip renders 🔒 sandbox when capable', () => {
  assert.equal(buildSandboxChip(true), '🔒 sandbox');
});

test('50: buildSandboxChip renders nothing (null) when not capable', () => {
  assert.equal(buildSandboxChip(false), null);
});

test('50: sandboxCapable returns a boolean and never throws', () => {
  const v = sandboxCapable();
  assert.equal(typeof v, 'boolean');
});

test('50: sandboxCapable file-stat detection stays under 5ms', () => {
  sandboxCapable(); // warm fs cache once
  const t0 = process.hrtime.bigint();
  sandboxCapable();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 5, `sandboxCapable took ${ms.toFixed(2)}ms (budget 5ms)`);
});

// ── Wave Mega 50-51 (4.A) — honest Claude Max quota chip ───────────────────
// No real-time quota API exists (anthropics/claude-code#44328) — every figure
// is a LOCAL estimate, so the chip must carry `est` when data is fresh and the
// literal `quota ?` when it is missing/stale, never a fake 100%.
const {
  summarizeQuotaWindow, formatQuotaChip, fmtWindowRemain,
  detectWidth, layoutForWidth, resolveLayout, layoutChips,
  truncateToWidth, renderNarrow,
} = require('./statusline-multi.js');

test('50-51 4.A: quota chip = remaining window time + ~% est marker from real quota-state fields', () => {
  const now = Date.parse('2026-06-09T12:00:00Z');
  const quota = {
    last_updated: '2026-06-09T11:30:00.000Z', // fresh (30min old)
    providers: { anthropic: { window_5h: {
      tokens_used: 126000, limit: 200000, reset_at: '2026-06-09T14:13:30.000Z',
    } } },
  };
  const info = summarizeQuotaWindow(quota, now);
  assert.equal(info.ok, true);
  assert.equal(info.usedPct, 63);
  assert.equal(formatQuotaChip(info, { color: false }), 'Max · 2h13m/5h · ~63% est');
});

test('50-51 4.A: missing or stale (>6h) quota data renders the honest `quota ?`', () => {
  // Missing entirely.
  assert.equal(formatQuotaChip(summarizeQuotaWindow(null)), 'quota ?');
  assert.equal(formatQuotaChip(summarizeQuotaWindow({})), 'quota ?');
  // Stale: last_updated 7h ago — tokens_used 0 would have read as a fake 100% left.
  const now = Date.parse('2026-06-09T12:00:00Z');
  const stale = {
    last_updated: '2026-06-09T05:00:00.000Z',
    providers: { anthropic: { window_5h: { tokens_used: 0, limit: 200000, reset_at: '2026-06-09T14:00:00.000Z' } } },
  };
  assert.equal(formatQuotaChip(summarizeQuotaWindow(stale, now)), 'quota ?');
});

test('50-51 4.A: pickState proof carries the est-marked chip and drops the bare % form', () => {
  const ctx = {
    ...DEMO_CONTEXTS.green,
    quotaWindow: { ok: true, usedPct: 63, remainMs: (2 * 60 + 13) * 60000 },
  };
  const s = pickState(ctx);
  assert.match(s.proof, /Max · 2h13m\/5h · ~63% est/, `proof: ${s.proof}`);
  assert.doesNotMatch(s.proof, /42% 5h est/, 'legacy bare-percent chip must be replaced, not duplicated');
  // Unknown window → honest `quota ?` in the proof, never a fake 100%.
  const s2 = pickState({ ...DEMO_CONTEXTS.green, quotaWindow: { ok: false } });
  assert.match(s2.proof, /quota \?/, `proof: ${s2.proof}`);
});

test('50-51 4.A: usage color thresholds — green <70, yellow 70-90, red >90 (% used)', () => {
  const chip = (usedPct) => formatQuotaChip({ ok: true, usedPct, remainMs: 60000 }, { color: true });
  assert.ok(chip(42).includes('\x1b[32m'), 'under 70% used → green');
  assert.ok(chip(75).includes('\x1b[33m'), '70-90% used → yellow');
  assert.ok(chip(95).includes('\x1b[31m'), 'over 90% used → red');
  assert.equal(fmtWindowRemain(47 * 60000), '47m');
  assert.equal(fmtWindowRemain(0), '0m');
});

// ── Wave Mega 50-51 (4.B) — responsive layouts ─────────────────────────────

const PRIORITY_CHIPS = [
  { text: '🐮 saved $0.27 all-time·local', priority: 'primary' },
  { text: 'Max · 2h13m/5h · ~63% est',     priority: 'quota' },
  { text: 'T2 sonnet · conf 0.84',         priority: 'tier' },
  { text: '(2 active)',                    priority: 'sessions' },
  { text: '🔒 sandbox',                    priority: 'sandbox' },
];

test('50-51 4.B: layoutChips drops lowest-priority chips first as width shrinks', () => {
  // Ample width → everything survives, original order preserved.
  assert.deepEqual(layoutChips(PRIORITY_CHIPS, 500).map((c) => c.priority),
    ['primary', 'quota', 'tier', 'sessions', 'sandbox']);
  // Tight width → sandbox goes first, then sessions; quota/tier outlive both.
  assert.deepEqual(layoutChips(PRIORITY_CHIPS, 90).map((c) => c.priority),
    ['primary', 'quota', 'tier']);
  // Tighter still → only primary + quota.
  assert.deepEqual(layoutChips(PRIORITY_CHIPS, 65).map((c) => c.priority),
    ['primary', 'quota']);
  // The primary state sentence is NEVER dropped, even at absurd widths.
  assert.deepEqual(layoutChips(PRIORITY_CHIPS, 5).map((c) => c.priority), ['primary']);
});

test('50-51 4.B: narrow layout renders exactly 1 truncated line (proofs dropped)', () => {
  const out = renderNarrow({ ...DEMO_CONTEXTS.green }, 40);
  assert.equal(out.includes('\n'), false, 'narrow is one line');
  assert.match(out, /^🐮/u, 'primary state glyph survives');
  assert.ok(out.length <= 40, `truncated to width (got ${out.length})`);
  assert.ok(out.endsWith('…'), 'over-width headline gets an ellipsis');
  assert.doesNotMatch(out, /this turn|all-time \(/, 'proof chips dropped at narrow');
});

test('50-51 4.B: COLUMNS env honored when not a TTY; TTY columns win; default 100', () => {
  assert.equal(detectWidth({ isTTY: false }, { COLUMNS: '72' }), 72);
  assert.equal(detectWidth({ isTTY: true, columns: 150 }, { COLUMNS: '72' }), 150);
  assert.equal(detectWidth({ isTTY: false }, {}), 100);
  assert.equal(detectWidth({ isTTY: false }, { COLUMNS: 'garbage' }), 100);
  assert.equal(layoutForWidth(79), 'narrow');
  assert.equal(layoutForWidth(80), 'medium');
  assert.equal(layoutForWidth(120), 'medium');
  assert.equal(layoutForWidth(121), 'wide');
});

test('50-51 4.B: explicit statusline_layout preference overrides width detection', () => {
  assert.equal(resolveLayout({ pref: 'narrow', width: 200 }), 'narrow');
  assert.equal(resolveLayout({ pref: 'wide', width: 60 }), 'wide');
  assert.equal(resolveLayout({ pref: 'medium', width: 60 }), 'medium');
  // auto / absent → detection decides.
  assert.equal(resolveLayout({ pref: null, width: 60 }), 'narrow');
  assert.equal(resolveLayout({ pref: null, width: 100 }), 'medium');
  assert.equal(resolveLayout({ pref: null, width: 140 }), 'wide');
});

test('50-51 4.B: render() honors MOOTER_STATUSLINE_LAYOUT=narrow → 1 line even on a wide terminal', () => {
  const prevL = process.env.MOOTER_STATUSLINE_LAYOUT;
  const prevC = process.env.COLUMNS;
  process.env.MOOTER_STATUSLINE_LAYOUT = 'narrow';
  process.env.COLUMNS = '200';
  try {
    const out = render({ ...DEMO_CONTEXTS.green });
    assert.equal(out.split('\n').length, 1, 'pinned narrow renders one line');
  } finally {
    if (prevL === undefined) delete process.env.MOOTER_STATUSLINE_LAYOUT; else process.env.MOOTER_STATUSLINE_LAYOUT = prevL;
    if (prevC === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prevC;
  }
});

test('50-51 4.B: wide layout keeps all line-2 chips (no truncation) incl. the quota chip', () => {
  const prevL = process.env.MOOTER_STATUSLINE_LAYOUT;
  const prevC = process.env.COLUMNS;
  process.env.MOOTER_STATUSLINE_LAYOUT = 'wide';
  process.env.COLUMNS = '60'; // would be narrow by width — the pin must win
  try {
    const ctx = {
      ...DEMO_CONTEXTS.green,
      ctxPercent: 23,
      quotaWindow: { ok: true, usedPct: 63, remainMs: (2 * 60 + 13) * 60000 },
    };
    const lines = render(ctx).split('\n');
    assert.ok(lines.length >= 2, 'wide renders the 2-line layout');
    assert.match(lines[1], /🧬/, 'adapter chip kept on line 2');
    assert.match(lines[1], /☁ Claude Max \[/, 'quota chip kept with its usage bar');
    assert.match(lines[1], /~63% est/, 'est marker present at wide');
  } finally {
    if (prevL === undefined) delete process.env.MOOTER_STATUSLINE_LAYOUT; else process.env.MOOTER_STATUSLINE_LAYOUT = prevL;
    if (prevC === undefined) delete process.env.COLUMNS; else process.env.COLUMNS = prevC;
  }
});

test('50-51 4.B: truncateToWidth leaves fitting (even colored) strings untouched', () => {
  assert.equal(truncateToWidth('short', 80), 'short');
  const colored = '\x1b[32mok\x1b[0m';
  assert.equal(truncateToWidth(colored, 80), colored, 'ANSI does not count against width');
  assert.equal(truncateToWidth('abcdefghij', 5), 'abcd…');
});

test('50-51 4.B: width detection + layout resolution stay well under 1ms', () => {
  resolveLayout(); // warm the prefs read once
  const t0 = process.hrtime.bigint();
  resolveLayout({ width: detectWidth() });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 1, `resolveLayout took ${ms.toFixed(3)}ms (budget 1ms)`);
});
