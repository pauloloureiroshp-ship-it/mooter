// `mooter trail --calls` suite (Wave 19 Day 3, 19.B).
// Drives buildCalls/runCalls with injected decisions_v2.jsonl lines so it needs
// no router state — asserts the per-call breakdown reflects the logged records
// (op/tier/llm/tokens/reason/via) and totals them per tier.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runTrail, buildCalls, printCallsHuman, type CallRecord } from "../src/commands/trail.ts";

const V2_LINES = [
  JSON.stringify({ ts: "2026-06-05T10:30:00Z", op: "summarize_file", tier: "T0", llm: "qwen3:30b", tokens_in: 1200, tokens_out: 300, reason: "classify_score=0.85 T0", via: "local-summarizer" }),
  JSON.stringify({ ts: "2026-06-05T10:31:00Z", op: "cross_file_change", tier: "T2", llm: "sonnet", tokens_in: 20000, tokens_out: 4200, reason: "classify_score=0.75 T2", via: "claude_subagent" }),
  "not-json-should-be-skipped",
  JSON.stringify({ op: "noise", llm: "x" }), // no tier → skipped
];

test("buildCalls parses valid records and skips junk / tierless lines", () => {
  const calls = buildCalls(V2_LINES);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, "summarize_file");
  assert.equal(calls[1].tier, "T2");
  assert.equal(calls[1].tokens_in, 20000);
});

test("buildCalls keeps only the last N (limit)", () => {
  const many: string[] = [];
  for (let i = 0; i < 5; i++) many.push(JSON.stringify({ ts: `t${i}`, tier: "T0", llm: "qwen", op: "x", tokens_in: i, tokens_out: 0 }));
  const calls = buildCalls(many, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].tokens_in, 3); // last two: i=3, i=4
  assert.equal(calls[1].tokens_in, 4);
});

test("printCallsHuman renders the breakdown + per-tier totals", () => {
  const out = printCallsHuman(buildCalls(V2_LINES));
  assert.match(out, /per-call trail/);
  assert.match(out, /2 call\(s\) in scope/);
  assert.match(out, /T0 +qwen3:30b +summarize_file +1\.2k→300 +via local-summarizer/);
  assert.match(out, /T2 +sonnet +cross_file_change +20\.0k→4\.2k +via claude_subagent/);
  assert.match(out, /classify_score=0\.85 T0/);
  assert.match(out, /TOTALS/);
  assert.match(out, /T0: 1 call\(s\) · 1\.2k→300 tokens/);
  assert.match(out, /T2: 1 call\(s\) · 20\.0k→4\.2k tokens/);
});

test("runTrail dispatches --calls and supports --json", async () => {
  const human = await runTrail({ calls: true, v2Lines: V2_LINES });
  assert.equal(human.exitCode, 0);
  assert.match(human.output, /per-call trail/);

  const json = await runTrail({ calls: true, json: true, v2Lines: V2_LINES });
  const parsed = JSON.parse(json.output) as CallRecord[];
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].via, "local-summarizer");
});

test("empty trail is honest, never invented", async () => {
  const res = await runTrail({ calls: true, v2Lines: [] });
  assert.match(res.output, /no calls logged yet/);
});
