// Wave 2.8 Ponto #8 — dashboard ADAPTER section honest disclosure. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDashboard } from "../src/commands/dashboard.ts";

test("dashboard ADAPTER section: honest baseline, no fabricated LoRA telemetry", () => {
  const out = buildDashboard({ lines: [], sessionId: "s1", metrics: null });
  assert.match(out, /ADAPTER · ◌ baseline — no LoRA yet/);
  assert.match(out, /projects with custom LoRA: 0/);
  assert.match(out, /packs with custom LoRA: 0/);
  assert.match(out, /Adapter Forge ships Wave 5/);
});

test("dashboard ADAPTER: zero hyperbole, no invented adapter counts", () => {
  const out = buildDashboard({ lines: [], sessionId: "s1", metrics: null });
  assert.ok(!/revolutionary|magic|AI-powered/i.test(out), "no hyperbole");
  // counts are honestly zero (baseline) — never a fabricated non-zero
  assert.ok(/custom LoRA: 0/.test(out));
});
