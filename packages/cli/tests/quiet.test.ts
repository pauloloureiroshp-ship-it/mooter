// `mooter quiet` suite (Wave 2.5 Day 3 sub-feature 3).
// Run: cd packages/cli && npm test
//
// Drives runQuiet() against a temp ~/.mooter so it never touches the real home.
// Covers: quiet=true on bare run, quiet=false on --off, field preservation on
// re-toggle, and the loadPreferences default when the file is absent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runQuiet, loadPreferences } from "../src/commands/quiet.ts";

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-quiet-"));
}

const prefs = (home: string) => JSON.parse(readFileSync(join(home, "preferences.json"), "utf8"));

test("mooter quiet writes preferences.json with quiet=true", () => {
  const home = tmpHome();
  const res = runQuiet({ mooterHome: home });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Badges disabled/);
  assert.ok(existsSync(join(home, "preferences.json")));
  assert.equal(prefs(home).quiet, true);
});

test("mooter quiet --off writes quiet=false", () => {
  const home = tmpHome();
  runQuiet({ mooterHome: home }); // enable first
  const res = runQuiet({ off: true, mooterHome: home });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Badges enabled/);
  assert.equal(prefs(home).quiet, false);
});

test("mooter quiet preserves unrelated preference fields", () => {
  const home = tmpHome();
  writeFileSync(
    join(home, "preferences.json"),
    JSON.stringify({ quiet: false, badge_position: "end", statusline_view: "mix", custom_future_key: 42 }),
  );
  runQuiet({ mooterHome: home });
  const p = prefs(home);
  assert.equal(p.quiet, true, "quiet toggled");
  assert.equal(p.badge_position, "end", "badge_position preserved");
  assert.equal(p.statusline_view, "mix", "statusline_view preserved");
  assert.equal(p.custom_future_key, 42, "unknown future key preserved");
});

test("loadPreferences falls back to defaults when the file is absent", () => {
  const home = tmpHome();
  const p = loadPreferences(home);
  assert.equal(p.quiet, false);
  assert.equal(p.badge_position, "inline");
  assert.equal(p.statusline_view, "auto");
});

test("loadPreferences coerces a non-boolean quiet to false", () => {
  const home = tmpHome();
  writeFileSync(join(home, "preferences.json"), JSON.stringify({ quiet: "yes" }));
  assert.equal(loadPreferences(home).quiet, false, "only literal true enables quiet");
});
