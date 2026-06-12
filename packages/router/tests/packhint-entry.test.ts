// Wave A (Moo Packs wired) — tests for the SHIPPED pack-hint artifact.
//
// Unlike hook-integration.test.ts (library-level buildHints), this suite
// builds the actual esbuild bundle install.sh ships (pack-hint.cjs) and
// drives it as Claude Code does: JSON on stdin, hint (or nothing) on stdout.
//
// DoD asserted:
//   - active-pack prompt  -> <pack-hint> with pack id, model_floor, §6.1 fields
//   - no pack matched     -> NO output at all (zero context cost)
//   - missing packs dir   -> silent, exit 0 (fail-silent: never breaks CC)
//   - malformed stdin     -> silent, exit 0
//   - cold-spawn latency  -> well under the 500ms hook budget
// Run: cd packages/router && npm test

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = join(PKG_ROOT, "pack-hint.cjs");
const REPO_PACKS = join(PKG_ROOT, "..", "..", "packs");

before(() => {
  execSync("npm run build:packhint", { cwd: PKG_ROOT, stdio: "pipe" });
  assert.ok(existsSync(BUNDLE), "esbuild bundle was not produced");
});

function runHook(stdin: string, packsDir: string = REPO_PACKS) {
  const r = spawnSync(process.execPath, [BUNDLE], {
    input: stdin,
    encoding: "utf8",
    env: { ...process.env, MOOTER_PACKS_DIR: packsDir },
    timeout: 5000,
  });
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status };
}

test("active pack: diagram prompt emits a full <pack-hint>", () => {
  const { stdout, status } = runHook(
    JSON.stringify({ prompt: "draw me a mermaid architecture diagram of the system components" }),
  );
  assert.equal(status, 0);
  assert.match(stdout, /^<pack-hint>\n/);
  assert.match(stdout, /\n<\/pack-hint>\n$/);
  assert.match(stdout, /pack=diagram-systems confidence=\d\.\d{2}/);
  assert.match(stdout, /model_floor=T\d/);
  for (const field of ["skills_invoke=[", "mcps_recommended=[", "mcps_missing=[", "subagent_primary="]) {
    assert.ok(stdout.includes(field), `missing §6.1 field: ${field}`);
  }
});

test("DoD scenario: code-audit pack resolves on an audit prompt", () => {
  const { stdout, status } = runHook(
    JSON.stringify({ prompt: "audita este módulo: corre um security review e um dependency check antes do push" }),
  );
  assert.equal(status, 0);
  assert.match(stdout, /pack=code-audit /);
  assert.match(stdout, /model_floor=T2/);
});

test("no pack matched: generic prompt emits NOTHING", () => {
  const { stdout, stderr, status } = runHook(JSON.stringify({ prompt: "hello how are you today" }));
  assert.equal(status, 0);
  assert.equal(stdout, "");
  assert.equal(stderr, "");
});

test("fail-silent: missing packs dir -> no output, exit 0", () => {
  const { stdout, status } = runHook(
    JSON.stringify({ prompt: "draw a mermaid diagram" }),
    "/nonexistent/packs/dir",
  );
  assert.equal(status, 0);
  assert.equal(stdout, "");
});

test("fail-silent: malformed stdin -> no output, exit 0", () => {
  for (const bad of ["not json at all", "", "{}", '{"cwd":"/tmp"}']) {
    const { stdout, status } = runHook(bad);
    assert.equal(status, 0, `exit != 0 for stdin: ${JSON.stringify(bad)}`);
    assert.equal(stdout, "", `unexpected output for stdin: ${JSON.stringify(bad)}`);
  }
});

test("latency: cold spawn stays well under the 500ms hook budget", () => {
  const input = JSON.stringify({ prompt: "draw me a mermaid architecture diagram" });
  runHook(input); // warm OS caches once
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    runHook(input);
    times.push(performance.now() - t0);
  }
  const worst = Math.max(...times);
  console.log(`    pack-hint cold-spawn worst of 5: ${worst.toFixed(0)}ms`);
  assert.ok(worst < 500, `worst spawn ${worst.toFixed(0)}ms exceeds 500ms hook budget`);
});
