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
