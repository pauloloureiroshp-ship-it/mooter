// pack-resolve 5-scenario integration suite (Pastor Wave 1, Day 6 — PASTOR §10.6 / §7).
// Run: cd packages/router && node --test tests/pack-resolve.test.ts   (or: npm test)
//
// Exercises packResolve() + suggestInstallCmd() + the <pack-hint> renderer end to
// end across the five canonical UX scenarios (§7 A–E). packResolve is pure and
// injectable, so every scenario drives an explicit manifest + ResolveEnv — no test
// ever reads the real ~/.claude config. The MCP install commands come from the
// versioned registry (packages/router/data/mcp_install_registry.json).
//
// Scenario map (§10.6 table):
//   A  all present      animation-web, skills+MCP available  → missing=[], suggest=[]
//   B  missing MCP      code-audit without sentry            → missing_mcps=[sentry], concrete install
//   C  missing skill    synthetic pack wanting foo:bar        → missing_skills=[foo:bar], manual-install fallback
//   D  ambiguous        3 packs contend                       → pack=AMBIGUOUS, candidates listed, no choice
//   E  GENERAL          no domain signal                      → pack=GENERAL, hub-search nudge
//
// Note on B: the shipped code-audit pack treats `snyk` as a tools_cli, not an MCP
// (its MCPs are github + sentry). So the "missing MCP" scenario removes sentry —
// a real gap for this pack — rather than the snyk-mcp the PASTOR narrative sketches.
// snyk-mcp still lives in the registry for packs that do declare it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHints } from "../src/hooks/inject_context.ts";
import {
  classifyDomain,
  compilePack,
  loadPacks,
  type CompiledPack,
} from "../src/classify_domain.ts";
import {
  loadPackManifest,
  packResolve,
  suggestInstallCmd,
  type PackManifest,
  type ResolveEnv,
} from "../src/pack_resolve.ts";

const REAL_PACKS: CompiledPack[] = loadPacks();

// Env presence doesn't affect classification (only resolution); for D/E it is inert.
const ENV_INERT: ResolveEnv = {
  available_skills: [],
  available_mcps: [],
  skills_known: true,
  mcps_known: true,
};

function block(out: string, tag: string): string {
  const m = out.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}

// ---------------------------------------------------------------------------
// A — all present
// ---------------------------------------------------------------------------
test("A: all present — animation-web with full env → no gaps, no install", () => {
  const m = loadPackManifest("animation-web");
  assert.ok(m, "animation-web manifest must load");
  // Bare skill names match the namespaced pack ids via packResolve's tolerant match.
  const env: ResolveEnv = {
    available_skills: ["web-artifacts-builder", "algorithmic-art"],
    available_mcps: ["vercel"],
    skills_known: true,
    mcps_known: true,
  };
  const r = packResolve(m!, env);
  assert.deepEqual(r.missing_skills, [], "no missing skills");
  assert.deepEqual(r.missing_mcps, [], "no missing MCPs");
  assert.deepEqual(r.suggest_install, [], "nothing to install");
  assert.ok(
    r.skills_invoke.some((s) => s.includes("web-artifacts-builder")),
    "the required skill is invoked",
  );
});

// ---------------------------------------------------------------------------
// B — missing MCP
// ---------------------------------------------------------------------------
test("B: missing MCP — code-audit without sentry → concrete install command", () => {
  const m = loadPackManifest("code-audit");
  assert.ok(m, "code-audit manifest must load");
  const env: ResolveEnv = {
    available_skills: ["accessibility-review", "design-critique"],
    available_mcps: ["github"], // sentry absent
    skills_known: true,
    mcps_known: true,
  };
  const r = packResolve(m!, env);
  assert.deepEqual(r.missing_skills, [], "skills all present");
  assert.deepEqual(r.missing_mcps, ["sentry"], "only sentry missing");
  assert.equal(r.suggest_install[0], "mooter pack install code-audit", "pack installer first");
  assert.ok(
    r.suggest_install.some((c) => c.includes("@sentry/mcp-server")),
    `expected a concrete sentry install, got ${JSON.stringify(r.suggest_install)}`,
  );
});

test("B (hook): code-audit missing sentry → <pack-hint> renders install as a tree", async () => {
  const env: ResolveEnv = {
    available_skills: ["accessibility-review", "design-critique"],
    available_mcps: ["github"],
    skills_known: true,
    mcps_known: true,
  };
  const out = await buildHints("audita este repositório antes de fazer push", REAL_PACKS, env);
  const pack = block(out, "pack-hint");
  assert.match(pack, /pack=code-audit/, "code-audit selected");
  assert.match(pack, /mcps_missing=\[sentry\]/, "sentry flagged missing");
  assert.match(pack, /suggest_install=mooter pack install code-audit/, "primary on the key line");
  assert.match(pack, /\n {2}└─ .*@sentry\/mcp-server/, "per-item command hangs below with └─");
});

// ---------------------------------------------------------------------------
// C — missing skill (synthetic)
// ---------------------------------------------------------------------------
test("C: missing synthetic skill foo:bar → manual skill-install fallback", () => {
  // There is no skills registry, so `claude skill install <name>` is itself the
  // documented manual-install fallback for a skill not otherwise resolvable.
  const synthetic: PackManifest = {
    pack_id: "synthetic-c",
    model_floor: "T2",
    model_ceiling: "T3",
    skills_required: ["foo:bar"],
    skills_recommended: [],
    mcps_required: [],
    mcps_recommended: [],
    subagent_primary: "model-reasoner",
    subagent_reviewer: null,
    scaffold_url: null,
  };
  const r = packResolve(synthetic, {
    available_skills: [],
    available_mcps: [],
    skills_known: true,
    mcps_known: true,
  });
  assert.deepEqual(r.missing_skills, ["foo:bar"]);
  assert.equal(r.suggest_install[0], "mooter pack install synthetic-c");
  assert.ok(
    r.suggest_install.includes("claude skill install foo:bar"),
    `expected skill fallback, got ${JSON.stringify(r.suggest_install)}`,
  );
});

test("C (registry miss): unknown MCP → '# … not in registry' fallback", () => {
  // The MCP equivalent of C: an MCP absent from the registry yields a clearly
  // non-executable manual-install marker rather than an invented command.
  const cmds = suggestInstallCmd("synthetic-c", [], ["totally-made-up-mcp"]);
  assert.equal(cmds[0], "mooter pack install synthetic-c");
  assert.ok(
    cmds.some((c) => c.startsWith("#") && c.includes("not in mcp_install_registry")),
    `expected manual-install marker, got ${JSON.stringify(cmds)}`,
  );
});

// ---------------------------------------------------------------------------
// D — ambiguous (3 packs contend)
// ---------------------------------------------------------------------------
test("D: ambiguous — 3 packs contend → AMBIGUOUS, candidates listed, no choice", async () => {
  // Synthetic packs keep the contention deterministic and independent of seed-pack
  // keyword drift. Scores 2 / 1 / 1 → confidence 0.5 ∈ [0.4, 0.6) → AMBIGUOUS.
  const packs: CompiledPack[] = [
    compilePack("alpha", { keywords: ["alphaone", "alphatwo"] }),
    compilePack("beta", { keywords: ["betaone"] }),
    compilePack("gamma", { keywords: ["gammaone"] }),
  ];
  const prompt = "alphaone alphatwo betaone gammaone";

  const domain = classifyDomain(prompt, packs);
  assert.equal(domain.pack_id, "AMBIGUOUS", "top score is < 60% of the top-3 sum");
  assert.equal(domain.candidates.length, 3, "all three contend");

  const out = await buildHints(prompt, packs, ENV_INERT);
  const pack = block(out, "pack-hint");
  assert.match(pack, /pack=AMBIGUOUS/);
  assert.match(pack, /reason="candidates:.*alpha.*beta.*gamma/, "candidates listed, descending");
  assert.match(pack, /skills_invoke=\[\]/, "no pack chosen → no skills invoked");
  assert.match(pack, /suggest_install=\[\]/, "no install nag when undecided");
  assert.doesNotMatch(pack, /scaffold_url/, "no scaffold without a chosen pack");
});

// ---------------------------------------------------------------------------
// E — GENERAL (no signal)
// ---------------------------------------------------------------------------
test("E: GENERAL — no domain signal → pack=GENERAL with a hub-search nudge", async () => {
  const out = await buildHints("What's the weather today?", REAL_PACKS, ENV_INERT);
  const pack = block(out, "pack-hint");
  assert.match(pack, /pack=GENERAL/, "no pack matched");
  assert.match(pack, /suggest_search=mooter pack search/, "nudge toward hub discovery");
  assert.match(pack, /skills_invoke=\[\]/);
  assert.doesNotMatch(pack, /scaffold_url/, "GENERAL omits scaffold_url");
});

// ---------------------------------------------------------------------------
// Registry coverage — DoD: >= 20 MCPs, every entry actionable
// ---------------------------------------------------------------------------
test("registry: >= 20 MCPs, each with a non-empty install + transport", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, "..", "data", "mcp_install_registry.json");
  const reg = JSON.parse(readFileSync(path, "utf8")) as {
    servers: Record<string, { install: string; transport?: string }>;
  };
  const ids = Object.keys(reg.servers);
  assert.ok(ids.length >= 20, `registry must cover >= 20 MCPs, has ${ids.length}`);
  for (const id of ids) {
    const e = reg.servers[id];
    assert.ok(e.install && e.install.length > 0, `${id} has an install string`);
    assert.ok(e.transport, `${id} declares a transport`);
  }
  // The MCPs the seed packs actually reference must resolve to a registry entry.
  for (const need of ["github", "sentry", "vercel"]) {
    assert.ok(reg.servers[need], `seed-pack MCP '${need}' must be in the registry`);
  }
});
