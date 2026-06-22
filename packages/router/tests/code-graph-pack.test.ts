// code-graph pack resolution — Wave 66 Block 1 (new file; addition only).
// Run: cd packages/router && npx tsx --test tests/code-graph-pack.test.ts
//
// Proves the code-graph pack resolves the graphify-mcp MCP as recommended and
// flags it `missing` (with a concrete registry install) when Graphify is absent —
// and reports no gap when it is present. packResolve is pure + injectable, so the
// env is supplied explicitly; the install command comes from the versioned
// mcp_install_registry.json. Kept in a dedicated file so the existing
// pack-resolve.test.ts (a frozen-package file) stays byte-identical.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPackManifest, packResolve, type ResolveEnv } from "../src/pack_resolve.ts";

const KNOWN: Pick<ResolveEnv, "skills_known" | "mcps_known"> = {
  skills_known: true,
  mcps_known: true,
};

test("code-graph manifest loads and recommends graphify-mcp", () => {
  const m = loadPackManifest("code-graph");
  assert.ok(m, "code-graph manifest must load");
  assert.ok(m!.mcps_recommended.includes("graphify-mcp"), "graphify-mcp is a recommended MCP");
  // Tier bounds: navigation is cheap (floor T1) but a wide refactor can escalate (ceiling T3).
  assert.equal(m!.model_floor, "T1");
  assert.equal(m!.model_ceiling, "T3");
});

test("without graphify-mcp in env → flagged missing + concrete registry install", () => {
  const m = loadPackManifest("code-graph");
  const env: ResolveEnv = { available_skills: [], available_mcps: [], ...KNOWN };
  const r = packResolve(m!, env);
  assert.deepEqual(r.missing_mcps, ["graphify-mcp"], "graphify-mcp flagged missing");
  assert.equal(r.suggest_install[0], "mooter pack install code-graph", "pack installer first");
  assert.ok(
    r.suggest_install.some((c) => c.includes("graphify install") || c.includes("graphifyy")),
    `expected a concrete graphify install from the registry, got ${JSON.stringify(r.suggest_install)}`,
  );
});

test("with graphify-mcp present in env → no gap, nothing to install", () => {
  const m = loadPackManifest("code-graph");
  const env: ResolveEnv = { available_skills: [], available_mcps: ["graphify-mcp"], ...KNOWN };
  const r = packResolve(m!, env);
  assert.deepEqual(r.missing_mcps, [], "graphify present → nothing missing");
  assert.deepEqual(r.suggest_install, [], "nothing to install");
  assert.deepEqual(r.available_mcps, ["graphify-mcp"], "resolved as available");
});

test("mcps_known=false → no false 'install graphify' nag", () => {
  const m = loadPackManifest("code-graph");
  // No mcp config source discovered → that dimension is unknown; never nag.
  const env: ResolveEnv = {
    available_skills: [],
    available_mcps: [],
    skills_known: true,
    mcps_known: false,
  };
  const r = packResolve(m!, env);
  assert.deepEqual(r.missing_mcps, [], "unknown MCP dimension → empty missing (graceful degradation)");
  assert.deepEqual(r.suggest_install, [], "no install suggestion when the gap is unknown");
});
