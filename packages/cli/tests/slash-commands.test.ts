// Wave Mega 50-51 (2.C) — `mooter slash-commands` (install the /mooter Claude
// Code skill). HOME-isolated via opts.home / env, same pattern as security.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runSlashCommands,
  installedSkillPath,
  templatePath,
  SKILL_TEMPLATE,
  SLASH_USAGE,
} from "../src/commands/slash-commands.ts";

function fakeHome(): string {
  return mkdtempSync(join(tmpdir(), "moo-slash-"));
}

test("slash-commands install: creates ~/.claude/skills/mooter/SKILL.md under the HOME override", () => {
  const home = fakeHome();
  const r = runSlashCommands(["install"], { home, env: {} as NodeJS.ProcessEnv });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /installed \/mooter skill/);
  const target = installedSkillPath(home);
  assert.ok(existsSync(target), "SKILL.md should exist after install");
  const content = readFileSync(target, "utf8");
  assert.match(content, /name: mooter/);
  assert.match(content, /mooter why-not-fable/);
  assert.match(content, /mooter local-models/);
  assert.match(content, /ONLY works inside the Mooter repo checkout/); // honest bench caveat
});

test("slash-commands install: HOME env (not just opts.home) is respected", () => {
  const home = fakeHome();
  const r = runSlashCommands(["install"], { env: { HOME: home } as NodeJS.ProcessEnv });
  assert.equal(r.exitCode, 0);
  assert.ok(existsSync(installedSkillPath(home)));
});

test("slash-commands install: idempotent — second run reports up to date", () => {
  const home = fakeHome();
  runSlashCommands(["install"], { home, env: {} as NodeJS.ProcessEnv });
  const r2 = runSlashCommands(["install"], { home, env: {} as NodeJS.ProcessEnv });
  assert.equal(r2.exitCode, 0);
  assert.match(r2.output, /already installed and up to date/);
});

test("slash-commands install --dry-run: prints intent, writes nothing", () => {
  const home = fakeHome();
  const r = runSlashCommands(["install", "--dry-run"], { home, env: {} as NodeJS.ProcessEnv });
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /\[dry-run\] would install/);
  assert.ok(!existsSync(installedSkillPath(home)), "dry-run must not write");
});

test("slash-commands status: not installed → says so; after install → in sync; after edit → differs", () => {
  const home = fakeHome();
  const opts = { home, env: {} as NodeJS.ProcessEnv };
  assert.match(runSlashCommands(["status"], opts).output, /NOT installed/);
  runSlashCommands(["install"], opts);
  assert.match(runSlashCommands(["status"], opts).output, /in sync with the template/);
  writeFileSync(installedSkillPath(home), "# user-edited\n");
  assert.match(runSlashCommands(["status"], opts).output, /DIFFERS from the template/);
});

test("slash-commands: unknown subcommand → usage, exit 1", () => {
  const r = runSlashCommands(["bogus"], { home: fakeHome(), env: {} as NodeJS.ProcessEnv });
  assert.equal(r.exitCode, 1);
  assert.equal(r.output, SLASH_USAGE);
});

test("slash-commands: repo template file stays byte-identical to the embedded fallback", () => {
  const p = templatePath();
  assert.ok(p, "template file should resolve inside a repo checkout");
  assert.equal(readFileSync(p!, "utf8"), SKILL_TEMPLATE,
    "packages/cli/skills-templates/mooter/SKILL.md drifted from SKILL_TEMPLATE in slash-commands.ts");
});
