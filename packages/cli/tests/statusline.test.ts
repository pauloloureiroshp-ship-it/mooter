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
  const prevUP = process.env.USERPROFILE;
  const home = mkdtempSync(join(tmpdir(), "mooter-sl-"));
  mkdirSync(join(home, ".mooter"), { recursive: true });
  process.env.HOME = home;
  process.env.MOOTER_HOME = join(home, ".mooter");
  // os.homedir() (used by statusline.ts) reads USERPROFILE on Windows, HOME on
  // POSIX — set both so these tests never touch Paulo's real ~/.mooter on Windows.
  process.env.USERPROFILE = home;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
    if (prevUP === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUP;
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

// Wave 33 (A.1) — `legacy` is an alias for `auto`: removes the pin.
test("mode legacy removes the key (alias for auto)", () => {
  withHome(() => {
    const prefsPath = join(process.env.HOME!, ".mooter", "preferences.json");
    runStatusline(["mode", "full"]);
    const r = runStatusline(["mode", "legacy"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /legacy/);
    const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
    assert.ok(!("statusline_mode" in prefs), "legacy deletes statusline_mode");
  });
});

// Wave 55 (Phase B) — friendly aliases map onto the canonical modes (no parallel
// mode system; P2 found the "dropped" chips were never dropped).
test("mode aliases minimal/standard/extended map to mini/compact/full", () => {
  withHome(() => {
    const prefsPath = join(process.env.HOME!, ".mooter", "preferences.json");
    const pairs: ReadonlyArray<readonly [string, string]> = [
      ["minimal", "mini"],
      ["standard", "compact"],
      ["extended", "full"],
    ];
    for (const [alias, canonical] of pairs) {
      const r = runStatusline(["mode", alias]);
      assert.strictEqual(r.exitCode, 0, `${alias} accepted`);
      assert.match(r.output, new RegExp(`= ${canonical}`), `${alias} notes the canonical mode`);
      const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
      assert.strictEqual(prefs.statusline_mode, canonical, `${alias} persists ${canonical}`);
    }
  });
});

// Wave 33 (A.1) — `--preview <mode>` never persists.
test("mode --preview does not persist the mode", () => {
  withHome(() => {
    const prefsPath = join(process.env.HOME!, ".mooter", "preferences.json");
    writeFileSync(prefsPath, JSON.stringify({ quiet: true }));
    const r = runStatusline(["mode", "--preview", "compact"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /preview · compact/);
    const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
    assert.ok(!("statusline_mode" in prefs), "--preview must not write statusline_mode");
  });
});

test("mode --preview rejects an unknown mode", () => {
  withHome(() => {
    const r = runStatusline(["mode", "--preview", "warp-drive"]);
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /unknown mode/);
  });
});

test("mode --help prints usage with exit 0", () => {
  withHome(() => {
    const r = runStatusline(["mode", "--help"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /usage: mooter statusline/);
    assert.match(r.output, /legacy/);
  });
});

// Wave Mega 50-51 (4.B) — `mooter statusline layout <narrow|medium|wide|auto>`
// persists the responsive layout pin (mode picks content, layout picks shape).

test("layout set persists statusline_layout to preferences.json and merges", () => {
  withHome(() => {
    const prefsPath = join(process.env.HOME!, ".mooter", "preferences.json");
    writeFileSync(prefsPath, JSON.stringify({ quiet: true, statusline_mode: "full" }));
    const r = runStatusline(["layout", "narrow"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /statusline layout → narrow/);
    const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
    assert.strictEqual(prefs.statusline_layout, "narrow");
    assert.strictEqual(prefs.quiet, true, "unrelated keys preserved");
    assert.strictEqual(prefs.statusline_mode, "full", "mode pin preserved — layout composes with mode");
  });
});

test("layout auto removes the key (width detection restored)", () => {
  withHome(() => {
    const prefsPath = join(process.env.HOME!, ".mooter", "preferences.json");
    runStatusline(["layout", "wide"]);
    const r = runStatusline(["layout", "auto"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /auto/);
    const prefs = JSON.parse(readFileSync(prefsPath, "utf8"));
    assert.ok(!("statusline_layout" in prefs), "auto deletes statusline_layout");
  });
});

test("unknown layout is rejected with usage", () => {
  withHome(() => {
    const r = runStatusline(["layout", "ultra-wide-galaxy"]);
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /unknown layout/);
    assert.match(r.output, /narrow\|medium\|wide\|auto/);
  });
});

test("usage text documents the layout subcommand and its composition rule", () => {
  withHome(() => {
    const r = runStatusline([]);
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /statusline layout <narrow\|medium\|wide\|auto>/);
    assert.match(r.output, /mode picks content, layout picks shape/);
  });
});

test("show reports the current layout alongside the mode", () => {
  withHome(() => {
    runStatusline(["layout", "wide"]);
    const r = runStatusline(["show"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /statusline layout: wide/);
  });
});
