// Wave 5 D4 — `mooter quiet --badge-off | --badge-always | --badge-threshold=X`.
// The bash badge is always-on by default; these flags persist display prefs to
// preferences.json (badge_off / badge_threshold), preserving unrelated prefs.
// node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runQuiet } from "../src/commands/quiet.ts";

function home(): string {
  return mkdtempSync(join(tmpdir(), "mooter-badge-"));
}
function prefs(h: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(h, "preferences.json"), "utf8"));
}

test("--badge-off sets badge_off=true", () => {
  const h = home();
  const res = runQuiet({ badgeOff: true, mooterHome: h });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Bash badge disabled/);
  assert.equal(prefs(h).badge_off, true);
});

test("--badge-always re-enables (badge_off=false, threshold 0)", () => {
  const h = home();
  runQuiet({ badgeOff: true, mooterHome: h });
  const res = runQuiet({ badgeAlways: true, mooterHome: h });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Bash badge on \(threshold 0\)/);
  assert.equal(prefs(h).badge_off, false);
  assert.equal(prefs(h).badge_threshold, 0);
});

test("--badge-threshold=0.7 raises the floor", () => {
  const h = home();
  const res = runQuiet({ badgeThreshold: 0.7, mooterHome: h });
  assert.equal(res.exitCode, 0);
  assert.equal(prefs(h).badge_threshold, 0.7);
  assert.equal(prefs(h).badge_off, false);
});

test("--badge-threshold out of range → exit 1, prefs untouched", () => {
  const h = home();
  const res = runQuiet({ badgeThreshold: 1.5, mooterHome: h });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /must be 0\.\.1/);
});

test("badge flags preserve unrelated prefs (moo_card_enabled, hidden_chips)", () => {
  const h = home();
  runQuiet({ mooCard: true, mooterHome: h });
  runQuiet({ hideChips: ["quant"], mooterHome: h });
  runQuiet({ badgeThreshold: 0.5, mooterHome: h });
  const p = prefs(h);
  assert.equal(p.moo_card_enabled, true);
  assert.deepEqual(p.hidden_chips, ["quant"]);
  assert.equal(p.badge_threshold, 0.5);
});
