// Stop session report — Wave 19 Day 4 (19.D). Three tests:
//   1. format — all sections render from real injected data + savings math;
//   2. empty session edge — honest "nothing recorded", no fabricated sections;
//   3. all-tiers populated — per-tier cost via pricing.js + reason grouping,
//      and a 100+ decision render stays well under 0.5s.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const sr = require('./stop_hook.js');

const FULL = {
  tokens: {
    T0: { calls: 5, tokens_in: 8000, tokens_out: 5000 },
    T1: { calls: 0, tokens_in: 0, tokens_out: 0 },
    T2: { calls: 3, tokens_in: 40000, tokens_out: 9000 },
    T3: { calls: 2, tokens_in: 1900000, tokens_out: 90000 },
  },
  records: [
    { ts: '2026-06-05T10:00:00Z', tier: 'T0', reason: 'classify_score=0.85 T0', via: 'local-summarizer' },
    { ts: '2026-06-05T10:05:00Z', tier: 'T0', reason: 'classify_score=0.85 T0', via: 'local-summarizer' },
    { ts: '2026-06-05T10:30:00Z', tier: 'T3', reason: 'beast_intent_force_t3', via: 'inline' },
    { ts: '2026-06-05T10:32:00Z', tier: 'T2', reason: 'reasoning_depth_required', via: 'model-reasoner' },
  ],
  hardware: { model: 'qwen3:30b', quant: { format: 'Q4_K_M', reduction: 72 }, adapter: { name: 'baseline', trained: 8 }, vram: { pct: 24, usedGb: 5.7, totalGb: 24 } },
  herd: { cumulative: [{ agent_name: 'local-summarizer', count: 3, avg_ms: 6200 }], peak_concurrent: 3 },
  context: { ctxPct: 23, anthRemPct: 42 },
  durationMs: 1925000,
};

test('19.D: full report renders every section with real figures', () => {
  const out = sr.buildSessionReport(FULL);
  assert.match(out, /🐮 Mooter session report — 32m 5s/);
  assert.match(out, /TOKENS BY TIER/);
  assert.match(out, /T0 \(local ollama\) +13\.0k tokens · 5 calls · \$0\.00/);
  assert.match(out, /T2 \(sonnet-4-6\) +49\.0k tokens · 3 calls · \$0\.26/);
  assert.match(out, /T3 \(opus-4-6\) +2\.0M tokens · 2 calls · \$11\.75/);
  assert.doesNotMatch(out, /T1 \(haiku/, 'tiers with 0 calls are omitted');
  assert.match(out, /CHOICE REASONS/);
  assert.match(out, /2× T0 → classify_score=0\.85 T0 \(delegated to local-summarizer\)/);
  assert.match(out, /1× T3 → beast_intent_force_t3/);
  assert.doesNotMatch(out, /T3 → beast_intent_force_t3 \(delegated/, 'inline via is not shown as delegation');
  assert.match(out, /HARDWARE STATE/);
  assert.match(out, /Model: qwen3:30b · Quant Q4_K_M \(-72% vs FP16\)/);
  assert.match(out, /Adapter: baseline · trained on 8 decisions/);
  assert.match(out, /GPU: 24% VRAM \(5\.7\/24 GB\)/);
  assert.match(out, /HERD/);
  assert.match(out, /3 Moo\(s\) spawned · local-summarizer avg 6200ms · peak concurrent: 3/);
  assert.match(out, /Ctx used: 23%/);
  assert.match(out, /Claude Max: 42% remaining/);
  assert.match(out, /SAVINGS/);
  // opusBaseline 12.34 − spent 12.01 = 0.33 saved (3%); honest small % since T3 dominates.
  assert.match(out, /Saved vs all-Opus: \$0\.33 \(3% reduction\)/);
  assert.match(out, /Total spent: \$12\.01/);
});

test('19.D: empty session is honest — no fabricated sections', () => {
  const out = sr.buildSessionReport({});
  assert.match(out, /🐮 Mooter session report/);
  assert.doesNotMatch(out, /— \d/, 'no duration when unknown');
  assert.match(out, /\(no LLM calls recorded this session\)/);
  assert.match(out, /\(no decisions logged this session\)/);
  assert.doesNotMatch(out, /SAVINGS/, 'no savings section without token data');
  assert.doesNotMatch(out, /HARDWARE STATE/, 'no hardware section without data');
  assert.doesNotMatch(out, /HERD/);
  assert.doesNotMatch(out, /CONTEXT/);
});

test('19.D: per-tier cost via pricing.js, reason grouping, and <0.5s at 100+ decisions', () => {
  // groupReasons collapses + counts + picks the dominant via, count-desc.
  const grouped = sr.groupReasons([
    { tier: 'T2', reason: 'r', via: 'model-reasoner' },
    { tier: 'T2', reason: 'r', via: 'model-reasoner' },
    { tier: 'T2', reason: 'r', via: 'inline' },
    { tier: 'T0', reason: 'x', via: 'local-summarizer' },
  ]);
  assert.equal(grouped[0].tier, 'T2');
  assert.equal(grouped[0].count, 3);
  assert.equal(grouped[0].via, 'model-reasoner'); // inline does not count as a via
  assert.equal(grouped[1].count, 1);

  // tierCost: T0 free; T3 priced from real pricing.js.
  assert.equal(sr.tierCost('T0', 100000, 100000), 0);
  assert.ok(sr.tierCost('T3', 1000000, 0) > 0);

  // Perf: a 150-decision session renders well under 0.5s.
  const records = [];
  for (let i = 0; i < 150; i++) records.push({ ts: `2026-06-05T10:${String(i % 60).padStart(2, '0')}:00Z`, tier: ['T0', 'T1', 'T2', 'T3'][i % 4], reason: `reason_${i % 7}`, via: i % 2 ? 'local-summarizer' : 'inline' });
  const big = { ...FULL, records };
  const t = process.hrtime.bigint();
  const out = sr.buildSessionReport(big);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.ok(ms < 500, `render took ${ms.toFixed(1)}ms (budget 500ms)`);
  assert.match(out, /CHOICE REASONS/);
});

// ── Wave 20 (20.F) — per-task breakdown ─────────────────────────────────

test('20.F: per-task breakdown lists each routed call with llm + reason (+via, +tokens)', () => {
  const records = [
    { ts: 't', op: 'cross_file_change', tier: 'T3', llm: 'opus', tokens_in: 1200, tokens_out: 3400, reason: 'classify_score=0.90 T3', via: 'model-architect' },
    { ts: 't', op: 'summarize', tier: 'T0', llm: 'qwen3:30b', tokens_in: 0, tokens_out: 0, reason: 'classify_score=0.85 T0', via: 'local-summarizer' },
    { ts: 't', op: 'edit', tier: 'T3', reason: 'beast_intent_force_t3', via: 'inline' }, // no llm/tokens
  ];
  const lines = sr.buildPerTaskLines(records);
  assert.match(lines[0], /1\. cross_file_change → opus · 1\.2k→3\.4k \(via model-architect\) · classify_score=0\.90 T3/);
  assert.match(lines[1], /2\. summarize → qwen3:30b \(via local-summarizer\) · classify_score=0\.85 T0/);
  assert.ok(!lines[1].includes('k→'), 'no token arrow when the call recorded no tokens');
  // inline via dropped; missing llm falls back to the tier default (opus for T3).
  assert.match(lines[2], /3\. edit → opus · beast_intent_force_t3/);
  assert.ok(!lines[2].includes('(via'), 'inline is not shown as a delegation');
  // Empty → one honest line, never a fabricated row.
  assert.deepEqual(sr.buildPerTaskLines([]), ['  (no decisions logged this session)']);
  // Long sessions cap the display with an honest "showing last N of M" header.
  const many = Array.from({ length: 40 }, (_, i) => ({ ts: 't', op: `op${i}`, tier: 'T0', llm: 'qwen3:30b', reason: 'r' }));
  const capped = sr.buildPerTaskLines(many, { limit: 25 });
  assert.match(capped[0], /showing last 25 of 40 tasks/);
  assert.equal(capped.length, 26, 'header + 25 rows (no silent truncation)');
});

test('20.F: buildSessionReport embeds the PER-TASK BREAKDOWN beneath the digest', () => {
  const out = sr.buildSessionReport(FULL);
  assert.match(out, /PER-TASK BREAKDOWN/);
  // FULL.records carry no op/llm → labelled by op default "task" + tier-default llm.
  assert.match(out, /1\. task → qwen3:30b \(via local-summarizer\) · classify_score=0\.85 T0/);
  assert.match(out, /3\. task → opus · beast_intent_force_t3/);
  // The grouped CHOICE REASONS summary is preserved (Wave 19 19.D intact).
  assert.match(out, /CHOICE REASONS/);
});
