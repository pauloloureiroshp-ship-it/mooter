// Hook integration test suite (Pastor Wave 1, Day 4).
// Run: cd packages/router && npm test
//
// Asserts the DoD of §10.4:
//   - <router-hint> AND <pack-hint> are emitted together (backward-compat P18)
//   - <pack-hint> follows the §6.1 format with a numeric confidence
//   - 5 scenarios: single-pack high-confidence · ambiguous · GENERAL ·
//     missing MCP · missing skill (+ graceful degradation when env unknown)
//   - combined p99 latency <= 60ms over warm iterations
//
// Env is always injected as a mock (decision #5): the suite never reads the
// real ~/.claude config — packResolve is driven by explicit ResolveEnv objects.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHints } from "../src/hooks/inject_context.ts";
import { loadPacks, type CompiledPack } from "../src/classify_domain.ts";
import {
  packResolve,
  suggestInstallCmd,
  type PackManifest,
  type ResolveEnv,
} from "../src/pack_resolve.ts";

const PACKS: CompiledPack[] = loadPacks();

// --- mock environments --------------------------------------------------------
const ENV_FULL: ResolveEnv = {
  available_skills: ["web-artifacts-builder", "algorithmic-art", "canvas-design"],
  available_mcps: ["vercel", "github", "sentry"],
  skills_known: true,
  mcps_known: true,
};
const ENV_NO_MCPS: ResolveEnv = {
  available_skills: ["web-artifacts-builder", "algorithmic-art", "design:accessibility-review", "design:design-critique"],
  available_mcps: [],
  skills_known: true,
  mcps_known: true,
};
const ENV_NO_SKILLS: ResolveEnv = {
  available_skills: [],
  available_mcps: ["vercel"],
  skills_known: true,
  mcps_known: true,
};
const ENV_UNKNOWN: ResolveEnv = {
  available_skills: [],
  available_mcps: [],
  skills_known: false,
  mcps_known: false,
};

// --- block/field parsing ------------------------------------------------------
function getBlock(out: string, tag: string): string {
  const m = out.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}
function token(block: string, key: string): string {
  const m = block.match(new RegExp(`${key}=(\\S+)`));
  return m ? m[1] : "";
}
function lineValue(block: string, key: string): string {
  const m = block.match(new RegExp(`^${key}\\s*[=:]\\s*(.*)$`, "m"));
  return m ? m[1].trim() : "";
}
function listField(block: string, key: string): string[] {
  const raw = lineValue(block, key);
  const inner = raw.replace(/^\[/, "").replace(/\].*$/, "").trim();
  return inner ? inner.split(",").map((s) => s.trim()) : [];
}

// --------------------------------------------------------------------------
// Scenario 1 — single pack, high confidence
// --------------------------------------------------------------------------
test("S1: single-pack high-confidence — both hints, skills + MCP resolved", async () => {
  const out = await buildHints(
    "Add a scroll-trigger animation to the hero section",
    PACKS,
    ENV_FULL,
  );
  const router = getBlock(out, "router-hint");
  const pack = getBlock(out, "pack-hint");

  assert.ok(router, "router-hint must be present (backward-compat P18)");
  assert.ok(pack, "pack-hint must be present");
  assert.match(router, /tier:\s*T[0-3]/, "router-hint carries a tier");

  assert.equal(token(pack, "pack"), "animation-web");
  const conf = Number(token(pack, "confidence"));
  assert.ok(conf >= 0 && conf <= 1, `confidence numeric in [0,1], got ${conf}`);
  assert.ok(
    listField(pack, "skills_invoke").some((s) => s.includes("web-artifacts-builder")),
    "skills_invoke includes the required skill",
  );
  assert.ok(listField(pack, "mcps_recommended").includes("vercel"), "vercel recommended");
  assert.deepEqual(listField(pack, "mcps_missing"), [], "nothing missing");
  assert.deepEqual(listField(pack, "suggest_install"), [], "no install needed");
  assert.match(pack, /scaffold_url=packs\/animation-web\/scaffold\.md/);
  assert.match(pack, /model_floor=T2 \(raised\)/, "T0 prompt < T2 floor → raised");
});

// --------------------------------------------------------------------------
// Scenario 2 — ambiguous (multi-pack contention)
// --------------------------------------------------------------------------
test("S2: ambiguous — pack=AMBIGUOUS, candidates listed, no skills invoked", async () => {
  const out = await buildHints(
    "Review the scroll-trigger animation for security", // anim + audit tie
    PACKS,
    ENV_FULL,
  );
  const pack = getBlock(out, "pack-hint");
  assert.ok(getBlock(out, "router-hint"), "router-hint still emitted");
  assert.equal(token(pack, "pack"), "AMBIGUOUS");
  assert.match(pack, /reason="candidates:.*animation-web.*code-audit|reason="candidates:.*code-audit.*animation-web/);
  assert.deepEqual(listField(pack, "skills_invoke"), [], "ambiguous → no skills");
  assert.deepEqual(listField(pack, "suggest_install"), []);
});

// --------------------------------------------------------------------------
// Scenario 3 — GENERAL (no domain signal)
// --------------------------------------------------------------------------
test("S3: GENERAL — pack=GENERAL, only axis-1 routing", async () => {
  const out = await buildHints("What's the weather today?", PACKS, ENV_FULL);
  const pack = getBlock(out, "pack-hint");
  assert.ok(getBlock(out, "router-hint"), "router-hint still emitted");
  assert.equal(token(pack, "pack"), "GENERAL");
  assert.deepEqual(listField(pack, "skills_invoke"), []);
  assert.doesNotMatch(pack, /scaffold_url/, "GENERAL omits scaffold_url");
});

// --------------------------------------------------------------------------
// Scenario 4 — missing MCP
// --------------------------------------------------------------------------
test("S4: missing MCP — mcps_missing populated, suggest_install non-empty", async () => {
  const out = await buildHints(
    "audita este repositório antes de fazer push", // → code-audit
    PACKS,
    ENV_NO_MCPS,
  );
  const pack = getBlock(out, "pack-hint");
  assert.equal(token(pack, "pack"), "code-audit");
  const missing = listField(pack, "mcps_missing");
  assert.ok(missing.length > 0, `expected missing MCPs, got ${JSON.stringify(missing)}`);
  assert.ok(missing.includes("github") || missing.includes("sentry"));
  const install = listField(pack, "suggest_install");
  assert.ok(install.length > 0, "suggest_install must be non-empty");
  assert.equal(install[0], "mooter pack install code-audit", "primary install command first");
});

// --------------------------------------------------------------------------
// Scenario 5 — missing skill
// --------------------------------------------------------------------------
test("S5: missing skill — skills_invoke empty, suggest_install has skill cmd", async () => {
  const out = await buildHints(
    "Add a scroll-trigger animation to the hero section", // → animation-web
    PACKS,
    ENV_NO_SKILLS,
  );
  const pack = getBlock(out, "pack-hint");
  assert.equal(token(pack, "pack"), "animation-web");
  assert.deepEqual(listField(pack, "skills_invoke"), [], "no skills available → none invoked");
  // suggest_install renders as a tree (Day 6, §6.1): the pack installer sits on
  // the key line, per-item commands hang below with └─.
  assert.equal(lineValue(pack, "suggest_install"), "mooter pack install animation-web");
  assert.match(pack, /└─ claude skill install/, "skill install command hangs below the primary");
});

// --------------------------------------------------------------------------
// Scenario 6 — graceful degradation: env unknown → no false nag (decision #5)
// --------------------------------------------------------------------------
test("S6: env unknown — missing lists empty, no install nag", async () => {
  const out = await buildHints(
    "Add a scroll-trigger animation to the hero section",
    PACKS,
    ENV_UNKNOWN,
  );
  const pack = getBlock(out, "pack-hint");
  assert.equal(token(pack, "pack"), "animation-web");
  assert.deepEqual(listField(pack, "mcps_missing"), [], "unknown env → no missing MCPs");
  assert.deepEqual(listField(pack, "suggest_install"), [], "unknown env → no install nag");
});

// --------------------------------------------------------------------------
// Unit — synthetic missing skill not in registry (Day 6 scenario C seed)
// --------------------------------------------------------------------------
test("packResolve: skill not in registry → manual-install fallback", () => {
  const synthetic: PackManifest = {
    pack_id: "synthetic",
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
  assert.ok(r.suggest_install.includes("claude skill install foo:bar"));
});

test("suggestInstallCmd: empty when nothing missing", () => {
  assert.deepEqual(suggestInstallCmd("animation-web", [], []), []);
});

test("suggestInstallCmd: registry hit yields concrete MCP install", () => {
  const cmds = suggestInstallCmd("code-audit", [], ["github"]);
  assert.equal(cmds[0], "mooter pack install code-audit");
  // Registry hit produces the concrete github MCP install (official remote, not the
  // generic "not in registry" fallback). Don't pin the exact package — the registry
  // tracks the current official command (hardened Day 6).
  assert.ok(cmds.some((c) => c.includes("api.githubcopilot.com")), `got ${JSON.stringify(cmds)}`);
});

// --------------------------------------------------------------------------
// Performance — combined p99 <= 60ms (PASTOR §6.4)
// --------------------------------------------------------------------------
test("p99 combined hint latency <= 60ms (warm)", async () => {
  const prompts = [
    "Add a scroll-trigger animation to the hero section",
    "audita este repositório antes de fazer push",
    "Create a mermaid flowchart for the pipeline",
    "What's the weather today?",
    "Review the scroll-trigger animation for security",
  ];
  // warm-up (primes classify.js require + regex compilation + pack manifests)
  for (let i = 0; i < 50; i++) await buildHints(prompts[i % prompts.length], PACKS, ENV_FULL);

  const samples: number[] = [];
  for (let i = 0; i < 500; i++) {
    const t0 = process.hrtime.bigint();
    await buildHints(prompts[i % prompts.length], PACKS, ENV_FULL);
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(0.5 * samples.length)];
  const p99 = samples[Math.floor(0.99 * samples.length)];
  console.log(`\n=== hook latency ===\np50 ${p50.toFixed(3)}ms   p99 ${p99.toFixed(3)}ms\n====================\n`);
  assert.ok(p99 <= 60, `combined p99 ${p99.toFixed(3)}ms > 60ms`);
});
