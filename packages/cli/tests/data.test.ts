// Wave 32 (Phase NEW3) — `mooter data` command wiring (isolated HOME).
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runData } from "../src/commands/data.ts";

// HOME alone is NOT isolation on Windows — os.homedir() reads USERPROFILE and
// ignored it, so on 2026-08-05 the delete-all test below wiped the real
// ~/.mooter (232 ledger events) and ~/.claude/tools/router/decisions.log.
// MOOTER_HOME and MOOTER_CLAUDE_DIR are the mechanisms the code under test
// honours; HOME stays for the POSIX read paths.
function withHome<T>(fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {
    HOME: process.env.HOME,
    MOOTER_HOME: process.env.MOOTER_HOME,
    MOOTER_CLAUDE_DIR: process.env.MOOTER_CLAUDE_DIR,
  };
  const home = mkdtempSync(join(tmpdir(), "mooter-data-"));
  mkdirSync(join(home, ".mooter"), { recursive: true });
  writeFileSync(join(home, ".mooter", "effort.json"), JSON.stringify({ mode: "high" }));
  process.env.HOME = home;
  process.env.MOOTER_HOME = join(home, ".mooter");
  process.env.MOOTER_CLAUDE_DIR = join(home, ".claude");
  return fn().finally(() => {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]!;
    }
  });
}

test("data export emits clean JSON", async () => {
  await withHome(async () => {
    const r = await runData(["export"]);
    assert.strictEqual(r.exitCode, 0);
    const obj = JSON.parse(r.output);
    assert.strictEqual(obj.schema, "mooter-data-export/v1");
    assert.strictEqual(obj.config["effort.json"].mode, "high");
  });
});

test("data delete-all without --confirm is a safe dry-run", async () => {
  await withHome(async () => {
    const r = await runData(["delete-all"]);
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /DESTRUCTIVE/);
    assert.ok(existsSync(join(process.env.HOME!, ".mooter", "effort.json")), "not deleted");
  });
});

test("data delete-all --confirm wipes", async () => {
  await withHome(async () => {
    const r = await runData(["delete-all", "--confirm"]);
    assert.match(r.output, /removed \d+ item/);
    assert.ok(!existsSync(join(process.env.HOME!, ".mooter", "effort.json")), "deleted");
  });
});

test("data forget-me without --confirm refuses (no network)", async () => {
  await withHome(async () => {
    const r = await runData(["forget-me"]);
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /requires --confirm/);
  });
});

test("data help lists the three rights", async () => {
  const r = await runData(["help"]);
  assert.match(r.output, /export/);
  assert.match(r.output, /delete-all/);
  assert.match(r.output, /forget-me/);
});
