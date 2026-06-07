import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPack } from "../src/commands/pack.ts";

let home: string;
const prevHome = process.env.MOOTER_HOME;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "mooter-pack-"));
  process.env.MOOTER_HOME = home;
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.MOOTER_HOME;
  else process.env.MOOTER_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

test("install caveman → records + Pastor signal; idempotent; uninstall cycle", () => {
  // install
  const r1 = runPack(["install", "caveman"]);
  assert.equal(r1.exitCode, 0);
  assert.match(r1.output, /installed caveman/);
  assert.match(r1.output, /Julius Brussee/); // attribution surfaced
  assert.match(r1.output, /pastor/i);

  // registry written
  const reg = JSON.parse(readFileSync(join(home, "installed_packs.json"), "utf8"));
  assert.equal(reg.packs.length, 1);
  assert.equal(reg.packs[0].name, "caveman");

  // pastor acceptance signal written
  assert.ok(existsSync(join(home, "pack_signals.jsonl")));
  const sig = readFileSync(join(home, "pack_signals.jsonl"), "utf8").trim();
  assert.match(sig, /"event":"install"/);
  assert.match(sig, /"pack":"caveman"/);

  // idempotent
  const r2 = runPack(["install", "caveman"]);
  assert.equal(r2.exitCode, 0);
  assert.match(r2.output, /already installed/);

  // uninstall
  const r3 = runPack(["uninstall", "caveman"]);
  assert.equal(r3.exitCode, 0);
  assert.match(r3.output, /uninstalled caveman/);
  const reg2 = JSON.parse(readFileSync(join(home, "installed_packs.json"), "utf8"));
  assert.equal(reg2.packs.length, 0);

  // uninstall again → not installed
  const r4 = runPack(["uninstall", "caveman"]);
  assert.equal(r4.exitCode, 1);
  assert.match(r4.output, /not installed/);
});

test("install unknown pack → not found", () => {
  const r = runPack(["install", "does-not-exist"]);
  assert.equal(r.exitCode, 1);
  assert.match(r.output, /not found/);
});

test("install --json is machine-readable", () => {
  const r = runPack(["install", "caveman", "--json"]);
  assert.equal(r.exitCode, 0);
  const j = JSON.parse(r.output);
  assert.equal(j.pack, "caveman");
  assert.equal(j.installed, true);
});

test("pack info caveman surfaces attribution metadata", () => {
  const r = runPack(["info", "caveman"]);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /Julius Brussee/);
});
