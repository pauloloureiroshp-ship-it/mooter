// `mooter pack` command suite (Wave 1 Day 5 — PASTOR §10.5 DoD).
// Run: cd packages/cli && npm test   (tsx --test tests/*.test.ts)
//
// Covers the DoD:
//   - list returns >= 3 packs (the Day-2 seed packs)
//   - show <pack> returns the pack's real content
//   - validate PASS for the 3 seed packs (animation-web, code-audit, diagram-systems)
//   - validate FAIL for a deliberately broken pack (built in a temp packsDir)
//   - diff returns correctly when an MCP is missing (exit 2) and when all present (exit 0)
//   - exit-code contract: show-missing -> 1
//
// diff env is always injected (ResolveEnv), so the suite never reads ~/.claude.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packList, packShow, packDiff, packValidate, runPack } from "../src/commands/pack.ts";
import type { ResolveEnv } from "../../router/src/pack_resolve.ts";

const SEED_PACKS = ["animation-web", "code-audit", "diagram-systems"];

// --- list --------------------------------------------------------------------
test("pack list returns >= 3 packs (json)", () => {
  const res = packList({ json: true });
  assert.equal(res.exitCode, 0);
  const rows = JSON.parse(res.output) as { name: string; version: string }[];
  assert.ok(rows.length >= 3, `expected >= 3 packs, got ${rows.length}`);
  for (const name of SEED_PACKS) {
    assert.ok(rows.some((r) => r.name === name), `list is missing seed pack ${name}`);
  }
});

test("pack list human output is tabular with a header", () => {
  const res = packList({});
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /NAME\s+VERSION\s+FLOOR\s+LAST_VALIDATED/);
  assert.match(res.output, /animation-web/);
});

// --- show --------------------------------------------------------------------
test("pack show animation-web returns correct content (json)", () => {
  const res = packShow("animation-web", { json: true });
  assert.equal(res.exitCode, 0);
  const doc = JSON.parse(res.output) as Record<string, unknown>;
  assert.equal(doc.name, "animation-web");
  assert.equal(doc.model_floor, "T2");
  assert.equal(doc._scaffold_path, "./scaffold.md");
  assert.ok(typeof doc._scaffold === "string" && (doc._scaffold as string).length > 0);
});

test("pack show human output includes scaffold inline", () => {
  const res = packShow("animation-web", {});
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /# animation-web/);
  assert.match(res.output, /--- scaffold \(\.\/scaffold\.md\) ---/);
});

test("pack show on a missing pack exits 1", () => {
  const res = packShow("does-not-exist", {});
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /not found/);
});

// --- validate (PASS x3) ------------------------------------------------------
for (const name of SEED_PACKS) {
  test(`pack validate ${name} PASSes`, () => {
    const res = packValidate(name, { json: true });
    assert.equal(res.exitCode, 0, `expected ${name} to validate; got: ${res.output}`);
    const parsed = JSON.parse(res.output) as { ok: boolean; checks: { name: string; pass: boolean }[] };
    assert.equal(parsed.ok, true);
    assert.ok(parsed.checks.every((c) => c.pass), `failing checks: ${res.output}`);
    // every seed pack exercises all five checks
    assert.deepEqual(
      parsed.checks.map((c) => c.name).sort(),
      ["acceptance_criteria", "repos_canonical", "scaffold", "schema", "smoke_test"],
    );
  });
}

// --- validate (FAIL) ---------------------------------------------------------
test("pack validate FAILs on a broken pack", () => {
  const dir = mkdtempSync(join(tmpdir(), "mooter-pack-"));
  mkdirSync(join(dir, "broken"));
  // Broken on multiple axes: bad name/version, missing description, ceiling < floor,
  // empty smoke_test, empty acceptance_criteria, repo missing url/license.
  writeFileSync(
    join(dir, "broken", "pack.yaml"),
    [
      "name: Broken Pack",
      "version: 1.0",
      "domain_signals:",
      "  keywords: []",
      "model_floor: T3",
      "model_ceiling: T1",
      "repos_canonical:",
      "  - { name: x }",
      "validation:",
      '  smoke_test: ""',
      "  acceptance_criteria: []",
      "prompt_scaffold_path: ./missing.md",
      "metadata:",
      "  author: tester",
      "  created: 2026-05-27",
      "",
    ].join("\n"),
  );

  const res = packValidate("broken", { packsDir: dir, json: true });
  assert.equal(res.exitCode, 1);
  const parsed = JSON.parse(res.output) as { ok: boolean; checks: { name: string; pass: boolean }[] };
  assert.equal(parsed.ok, false);
  const failed = new Set(parsed.checks.filter((c) => !c.pass).map((c) => c.name));
  for (const expected of ["schema", "smoke_test", "acceptance_criteria", "repos_canonical", "scaffold"]) {
    assert.ok(failed.has(expected), `expected check '${expected}' to FAIL`);
  }
});

// --- diff --------------------------------------------------------------------
const ENV_NO_MCPS: ResolveEnv = {
  available_skills: ["web-artifacts-builder", "algorithmic-art"],
  available_mcps: [],
  skills_known: true,
  mcps_known: true,
};
const ENV_FULL: ResolveEnv = {
  available_skills: ["web-artifacts-builder", "algorithmic-art"],
  available_mcps: ["vercel"],
  skills_known: true,
  mcps_known: true,
};

test("pack diff exits 2 when an MCP is missing", () => {
  const res = packDiff("animation-web", { env: ENV_NO_MCPS, json: true });
  assert.equal(res.exitCode, 2);
  const parsed = JSON.parse(res.output) as { missing_mcps: string[]; suggest_install: string[] };
  assert.ok(parsed.missing_mcps.includes("vercel"), "vercel should be reported missing");
  assert.ok(parsed.suggest_install.length > 0, "should suggest install commands");
});

test("pack diff human output renders ✓/✗ and Install block on missing MCP", () => {
  const res = packDiff("animation-web", { env: ENV_NO_MCPS });
  assert.equal(res.exitCode, 2);
  assert.match(res.output, /Pack: animation-web/);
  assert.match(res.output, /✗ MCPs \(0\/1\): vercel ✗/);
  assert.match(res.output, /Install missing:/);
});

test("pack diff exits 0 when all deps are present", () => {
  const res = packDiff("animation-web", { env: ENV_FULL, json: true });
  assert.equal(res.exitCode, 0);
  const parsed = JSON.parse(res.output) as { ok: boolean; missing_mcps: string[]; missing_skills: string[] };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.missing_mcps.length, 0);
  assert.equal(parsed.missing_skills.length, 0);
});

test("pack diff on a missing pack exits 1", () => {
  const res = packDiff("does-not-exist", { env: ENV_FULL });
  assert.equal(res.exitCode, 1);
  assert.match(res.output, /not found/);
});

// --- dispatch ----------------------------------------------------------------
test("runPack dispatches subcommands and flags", () => {
  assert.equal(runPack(["list", "--json"]).exitCode, 0);
  assert.equal(runPack(["validate", "animation-web"]).exitCode, 0);
  assert.equal(runPack(["bogus"]).exitCode, 1);
  assert.equal(runPack(["show"]).exitCode, 1); // missing name
});
