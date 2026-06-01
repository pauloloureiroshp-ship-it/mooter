// Wave 2.6 Day 3 — `mooter quiet --moo-card[-off]`. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runQuiet, loadPreferences } from "../src/commands/quiet.ts";

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-prefs-"));
}

test("quiet --moo-card: enables the card (default was OFF)", () => {
  const home = tmpHome();
  assert.equal(loadPreferences(home).moo_card_enabled, undefined, "off by default");
  const res = runQuiet({ mooCard: true, mooterHome: home });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Moo card enabled/);
  assert.equal(loadPreferences(home).moo_card_enabled, true);
});

test("quiet --moo-card-off: disables the card", () => {
  const home = tmpHome();
  runQuiet({ mooCard: true, mooterHome: home });
  const res = runQuiet({ mooCardOff: true, mooterHome: home });
  assert.match(res.output, /Moo card disabled/);
  assert.equal(loadPreferences(home).moo_card_enabled, false);
});

test("quiet --moo-card preserves other prefs (quiet, badge_position)", () => {
  const home = tmpHome();
  writeFileSync(join(home, "preferences.json"), JSON.stringify({ quiet: true, badge_position: "end", custom_key: 7 }));
  runQuiet({ mooCard: true, mooterHome: home });
  const prefs = JSON.parse(readFileSync(join(home, "preferences.json"), "utf8"));
  assert.equal(prefs.moo_card_enabled, true);
  assert.equal(prefs.quiet, true, "badge quiet state untouched");
  assert.equal(prefs.badge_position, "end", "unrelated pref preserved");
  assert.equal(prefs.custom_key, 7, "future key preserved");
});

test("quiet --moo-card does not toggle badge quiet, and vice-versa", () => {
  const home = tmpHome();
  // enabling the card must not flip quiet on
  runQuiet({ mooCard: true, mooterHome: home });
  assert.equal(loadPreferences(home).quiet, false);
  // bare quiet must not touch moo_card_enabled
  runQuiet({ mooterHome: home });
  const prefs = loadPreferences(home);
  assert.equal(prefs.quiet, true);
  assert.equal(prefs.moo_card_enabled, true, "card stays enabled when toggling badges");
});
