// Wave 5 D3 — `mooter quiet --hide-<chip>` / `--show-all`. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runQuiet, loadPreferences } from "../src/commands/quiet.ts";

function home(): string {
  return mkdtempSync(join(tmpdir(), "mooter-hide-"));
}
function hidden(h: string): string[] {
  return (loadPreferences(h).hidden_chips as string[]) ?? [];
}

test("--hide-vram adds vram to hidden_chips", () => {
  const h = home();
  const res = runQuiet({ hideChips: ["vram"], mooterHome: h });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /Hidden chips: vram/);
  assert.deepEqual(hidden(h), ["vram"]);
});

test("multiple --hide flags accumulate (sorted, deduped)", () => {
  const h = home();
  runQuiet({ hideChips: ["quant"], mooterHome: h });
  runQuiet({ hideChips: ["vram", "quant", "ctx"], mooterHome: h });
  assert.deepEqual(hidden(h), ["ctx", "quant", "vram"]);
});

test("--show-all clears hidden_chips", () => {
  const h = home();
  runQuiet({ hideChips: ["vram", "adapter"], mooterHome: h });
  const res = runQuiet({ showAll: true, mooterHome: h });
  assert.match(res.output, /All statusline chips shown/);
  assert.deepEqual(hidden(h), []);
});

test("unknown chip → exit 1, prefs untouched", () => {
  const h = home();
  runQuiet({ hideChips: ["vram"], mooterHome: h });
  const res = runQuiet({ hideChips: ["bogus"], mooterHome: h });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /unknown chip/);
  assert.deepEqual(hidden(h), ["vram"], "valid prefs preserved on rejection");
});

test("hide flags preserve other prefs (quiet, moo_card_enabled)", () => {
  const h = home();
  runQuiet({ mooCard: true, mooterHome: h });
  runQuiet({ hideChips: ["quant"], mooterHome: h });
  const prefs = JSON.parse(readFileSync(join(h, "preferences.json"), "utf8"));
  assert.equal(prefs.moo_card_enabled, true, "moo card pref preserved");
  assert.deepEqual(prefs.hidden_chips, ["quant"]);
});
