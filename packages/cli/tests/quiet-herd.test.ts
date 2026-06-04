// Wave 13 "Show the Herd" — `mooter quiet --verbose|--herd-standard|--herd-quiet|--herd-off`.
// node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runQuiet, loadPreferences } from "../src/commands/quiet.ts";

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "mooter-prefs-"));
}

test("quiet --verbose: sets herd_visibility=verbose (default was unset → standard)", () => {
  const home = tmpHome();
  assert.equal(loadPreferences(home).herd_visibility, undefined, "unset by default (= standard at render)");
  const res = runQuiet({ herdVisibility: "verbose", mooterHome: home });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /verbose/);
  assert.equal(loadPreferences(home).herd_visibility, "verbose");
});

test("quiet --herd-off: sets herd_visibility=silent", () => {
  const home = tmpHome();
  const res = runQuiet({ herdVisibility: "silent", mooterHome: home });
  assert.match(res.output, /hidden/);
  assert.equal(loadPreferences(home).herd_visibility, "silent");
});

test("quiet --herd-quiet / --herd-standard: round-trip the level", () => {
  const home = tmpHome();
  runQuiet({ herdVisibility: "quiet", mooterHome: home });
  assert.equal(loadPreferences(home).herd_visibility, "quiet");
  runQuiet({ herdVisibility: "standard", mooterHome: home });
  assert.equal(loadPreferences(home).herd_visibility, "standard");
});

test("quiet herd level: rejects an invalid value", () => {
  const home = tmpHome();
  const res = runQuiet({ herdVisibility: "loud", mooterHome: home });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /invalid herd visibility/);
  assert.equal(loadPreferences(home).herd_visibility, undefined, "nothing written on error");
});

test("quiet herd level preserves other prefs and does not flip badge quiet", () => {
  const home = tmpHome();
  writeFileSync(join(home, "preferences.json"), JSON.stringify({ quiet: true, badge_position: "end", custom_key: 7 }));
  runQuiet({ herdVisibility: "verbose", mooterHome: home });
  const prefs = JSON.parse(readFileSync(join(home, "preferences.json"), "utf8"));
  assert.equal(prefs.herd_visibility, "verbose");
  assert.equal(prefs.quiet, true, "badge quiet state untouched");
  assert.equal(prefs.badge_position, "end", "unrelated pref preserved");
  assert.equal(prefs.custom_key, 7, "future key preserved");
});

test("bare quiet does not touch herd_visibility, and vice-versa", () => {
  const home = tmpHome();
  runQuiet({ herdVisibility: "verbose", mooterHome: home });
  runQuiet({ mooterHome: home }); // bare quiet → badges off
  const prefs = loadPreferences(home);
  assert.equal(prefs.quiet, true);
  assert.equal(prefs.herd_visibility, "verbose", "herd level survives a badge toggle");
});
