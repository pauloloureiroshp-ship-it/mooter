// Wave 3 Day 2 — dashboard PACK section (fixes W2.7 MIN-1). node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildDashboard, displayWidth } from "../src/commands/dashboard.ts";

function homeWith(packs: string[]): string {
  const home = mkdtempSync(join(tmpdir(), "mooter-dpack-"));
  if (packs.length) writeFileSync(join(home, "installed.json"), JSON.stringify({ schema_version: "1.0.0", packs }));
  return home;
}

test("dashboard PACK section present, lists installed packs", () => {
  const out = buildDashboard({ lines: [], sessionId: "s1", metrics: null, mooterHome: homeWith(["diagram-systems", "code-audit"]) });
  assert.match(out, /PACK/);
  assert.match(out, /Installed: 2 packs/);
  assert.match(out, /diagram-systems/);
});

test("dashboard PACK: graceful 'none' active + 'no usage data' (honest)", () => {
  const out = buildDashboard({ lines: [], sessionId: "s1", metrics: null, mooterHome: homeWith(["diagram-systems"]) });
  assert.match(out, /Active: none/);
  assert.match(out, /no per-pack usage data yet/);
});

test("dashboard PACK: 0 packs when installed.json absent", () => {
  const out = buildDashboard({ lines: [], sessionId: "s1", metrics: null, mooterHome: homeWith([]) });
  assert.match(out, /Installed: 0 packs/);
});

test("dashboard still has all rows aligned to one width with PACK added", () => {
  const out = buildDashboard({ lines: [], sessionId: "s1", metrics: null, mooterHome: homeWith(["diagram-systems"]) });
  const framed = out.split("\n").filter((r) => /^[┌│├└]/.test(r));
  // Alignment is in DISPLAY columns (emoji = 2), not code points.
  const widths = new Set(framed.map((r) => displayWidth(r)));
  assert.equal(widths.size, 1, "all framed rows share one display width");
});
