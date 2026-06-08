// Wave 32 (Phase B) — `mooter statusline` command. Uses an isolated HOME so the
// real ~/.mooter/preferences.json is never touched.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runStatusline } from "../src/commands/statusline.ts";

function withHome<T>(fn: () => T): T {
  const prev = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "mooter-sl-"));
  mkdirSync(join(home, ".mooter"), { recursive: true });
  process.env.HOME = home;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
  }
}

test("mode set persists to preferences.json and merges", () => {
  withHome(() => {
    const prefsPath = join(process.env.HOME!, ".mooter", "preferences.json");
    writeFileSync(prefsPath, JSON.stringify({ quiet: true, statusline_line3: true }));
    const r = runStatusline(["mode", "full"]);
    assert.strictEqual(r.exitCode, 0);
    const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
    assert.strictEqual(prefs.statusline_mode, "full");
    assert.strictEqual(prefs.quiet, true, "unrelated keys preserved");
    assert.strictEqual(prefs.statusline_line3, true, "unrelated keys preserved");
  });
});

test("mode auto removes the key", () => {
  withHome(() => {
    const prefsPath = join(process.env.HOME!, ".mooter", "preferences.json");
    runStatusline(["mode", "didactic"]);
    runStatusline(["mode", "auto"]);
    const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
    assert.ok(!("statusline_mode" in prefs), "auto deletes statusline_mode");
  });
});

test("unknown mode is rejected with usage", () => {
  withHome(() => {
    const r = runStatusline(["mode", "ultra-galaxy"]);
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /unknown mode/);
  });
});

test("show reports current mode and lists all four", () => {
  withHome(() => {
    runStatusline(["mode", "mini"]);
    const r = runStatusline(["show"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /statusline mode: mini/);
    for (const m of ["mini", "compact", "full", "didactic"]) assert.match(r.output, new RegExp(m));
  });
});

test("bare command prints usage", () => {
  withHome(() => {
    const r = runStatusline([]);
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /usage: mooter statusline/);
  });
});
