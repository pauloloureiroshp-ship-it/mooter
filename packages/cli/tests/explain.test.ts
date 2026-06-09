// Wave 5 D3 — `mooter explain`. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { runExplain } from "../src/commands/explain.ts";

test("explain statusline: describes the chips + hide flags", () => {
  const res = runExplain({ topic: "statusline" });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Mooter statusline guide/);
  assert.match(res.output, /tier \(T0\/T1\/T2\/T3\)/);
  assert.match(res.output, /GPU \+ live VRAM/);
  assert.match(res.output, /context window used/);
  assert.match(res.output, /quant Q4_K_M/);
  assert.match(res.output, /--hide-vram/);
  assert.match(res.output, /--show-all/);
});

test("explain (no topic) defaults to the statusline guide", () => {
  assert.match(runExplain({}).output, /Mooter statusline guide/);
});

test("explain unknown topic → exit 1 + lists topics", () => {
  const res = runExplain({ topic: "bogus" });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /Available topics: statusline/);
});

test("explain: no hyperbole, honest about omitted VRAM", () => {
  const out = runExplain({ topic: "statusline" }).output;
  assert.ok(!/revolutionary|magic|AI-powered/i.test(out));
  assert.match(out, /omitted if unavailable/);
});

// Wave 40 — per-chip deep dives.
test("explain <chip>: deep dive renders What/How/Example for a chip", () => {
  const res = runExplain({ topic: "saved" });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /mooter explain — saved/);
  assert.match(res.output, /What it is:/);
  assert.match(res.output, /How to read it:/);
  assert.match(res.output, /Example:/);
  assert.match(res.output, /all-T3 \(Opus\) baseline|all-Opus/);
});

test("explain <chip>: aliases resolve to the canonical chip", () => {
  // 'gpu' and 'rtx' are aliases of the vram chip; 'lora' → adapter.
  assert.match(runExplain({ topic: "gpu" }).output, /mooter explain — vram/);
  assert.match(runExplain({ topic: "rtx" }).output, /mooter explain — vram/);
  assert.match(runExplain({ topic: "lora" }).output, /mooter explain — adapter/);
});

test("explain list: lists every deep-divable chip", () => {
  const res = runExplain({ topic: "list" });
  assert.equal(res.exitCode, 0);
  for (const chip of ["saved", "tier", "vram", "ctx", "quota", "adapter", "local-routes", "user", "sessions", "embed", "agents", "cost-cap", "tiers"]) {
    assert.match(res.output, new RegExp(`\\b${chip}\\b`), `list mentions ${chip}`);
  }
});

test("explain <chip>: privacy + honesty in the user-hash explainer", () => {
  const out = runExplain({ topic: "user" }).output;
  assert.match(out, /NOT your GitHub handle/);
  assert.ok(!/revolutionary|magic/i.test(out));
});

test("explain unknown still lists chips so the user can recover", () => {
  const res = runExplain({ topic: "zzz" });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /Available topics: statusline/);
  assert.match(res.output, /saved/);
});

// Wave 34.5 (Bug D) — honest caveat: delegated work counts; inline-Opus reads low.
test("explain saved: honest about delegation + inline-Opus reducing savings", () => {
  const out = runExplain({ topic: "saved" }).output;
  assert.match(out, /delegat/i, "explains delegated subagent work counts");
  assert.match(out, /inline|extended-thinking|high-effort/i, "explains why it can read near 0%");
  assert.ok(!/revolutionary|magic|guaranteed/i.test(out), "no hyperbole");
});

// Wave 49 (Phase 1) — Anthropic-aligned honesty: dedicated confidence + uncertainty.
test("explain confidence: dedicated topic explains the 0-1 route confidence + ⚠", () => {
  const res = runExplain({ topic: "confidence" });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /mooter explain — confidence/);
  assert.match(res.output, /0\.60|<0\.60/, "names the low-confidence threshold");
  assert.match(res.output, /⚠/, "mentions the in-line warning marker");
  assert.match(res.output, /pin a tier|@haiku|force T3/i, "tells the user how to act on low confidence");
  assert.ok(!/revolutionary|magic|guaranteed/i.test(res.output), "no hyperbole");
});

test("explain conf: alias resolves to the confidence explainer", () => {
  assert.match(runExplain({ topic: "conf" }).output, /mooter explain — confidence/);
});

test("explain uncertainty: metacognition topic is honest, not a correctness claim", () => {
  const out = runExplain({ topic: "uncertainty" }).output;
  assert.match(out, /mooter explain — uncertainty/);
  assert.match(out, /metacognition/i);
  assert.match(out, /not a correctness guarantee/i, "explicitly disclaims correctness");
  assert.match(out, /declining to bluff|feature, not a failure/i);
});

test("explain list: includes the new confidence + uncertainty topics", () => {
  const out = runExplain({ topic: "list" }).output;
  for (const chip of ["confidence", "uncertainty"]) {
    assert.match(out, new RegExp(`\\b${chip}\\b`), `list mentions ${chip}`);
  }
});
