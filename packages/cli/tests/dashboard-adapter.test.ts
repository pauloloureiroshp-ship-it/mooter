// Wave 2.8 Ponto #8 — dashboard ADAPTER section honest disclosure. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDashboard } from "../src/commands/dashboard.ts";

test("dashboard ADAPTER section: honest baseline, foundation/D2 disclosure (W5 D1)", () => {
  const out = buildDashboard({ lines: [], sessionId: "s1", metrics: null });
  assert.match(out, /ADAPTER · ◌ baseline/);
  assert.match(out, /Install a \.gguf via `mooter forge install`/);
  assert.match(out, /Auto-training ships Wave 5 D3/);
  assert.match(out, /mooter adapter list/);
});

test("dashboard ADAPTER: zero hyperbole, no fabricated adapter data", () => {
  const out = buildDashboard({ lines: [], sessionId: "s1", metrics: null });
  assert.ok(!/revolutionary|magic|AI-powered/i.test(out), "no hyperbole");
  assert.ok(!/\d+% (faster|better|accuracy)/i.test(out), "no fabricated perf numbers");
});
