// buildHints auto-skill directive tests — Cockpit v2 Wave 1 (PASSO 2).
// Run: cd packages/router && node --test tests/auto-skill-hint.test.ts (or: npm test)
//
// Asserts the <pack-hint> surfaces the right skills line per the auto-skill
// decision, and that the DEFAULT (autoMode off) output is byte-for-byte the
// legacy `skills_invoke=[…]` advisory — a backward-compat guard (P18).
//
// Env is injected (decision #5): tests never read the real ~/.claude config.
// We synthesise a pack whose skills are all PRESENT so skills_invoke is
// non-empty, then drive a prompt that confidently resolves to it.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildHints,
  renderHints,
  autoSkillModeFromEnv,
  type HintClassifications,
} from "../src/hooks/inject_context.ts";
import { loadPacks, type CompiledPack } from "../src/classify_domain.ts";
import { detectEnv, loadPackManifest, type ResolveEnv } from "../src/pack_resolve.ts";

const PACKS: CompiledPack[] = loadPacks();

function getBlock(out: string, tag: string): string {
  const m = out.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}

// Pick a real shipped pack + a prompt that resolves to it confidently, and an
// env that makes its skills present so skills_invoke is non-empty.
const DIAGRAM_PROMPT = "draw me a mermaid architecture diagram of the system components";

function envWithPackSkills(packId: string): ResolveEnv {
  const m = loadPackManifest(packId);
  const skills = m ? [...m.skills_required, ...m.skills_recommended] : [];
  const mcps = m ? [...m.mcps_required, ...m.mcps_recommended] : [];
  return { available_skills: skills, available_mcps: mcps, skills_known: true, mcps_known: true };
}

test("default (autoMode off): emits the legacy advisory skills_invoke line, no directive", async () => {
  const env = envWithPackSkills("diagram-systems");
  const out = await buildHints(DIAGRAM_PROMPT, PACKS, env, undefined, false);
  const pack = getBlock(out, "pack-hint");
  assert.match(pack, /pack=diagram-systems /);
  assert.match(pack, /\nskills_invoke=\[/, "expected advisory skills_invoke line");
  assert.ok(!pack.includes("auto_skill_directive="), "must NOT emit a directive when opt-in is off");
});

test("autoMode on + confident + not-high-risk: emits an imperative auto_skill_directive", () => {
  // Driven via renderHints with a synthetic LOW-risk complexity so the verdict
  // is deterministic and independent of how classify.js scores any one prompt.
  const env = envWithPackSkills("diagram-systems");
  if (!env.available_skills.length) return; // pack ships no skills → nothing to direct (off)

  const c: HintClassifications = {
    complexity: {
      tier: "T1",
      task_category: "code_generation",
      risk_level: "low",
      recommended_backend: "claude_subagent",
      recommended_model: "claude-haiku-4-5",
      suggested_subagent: "cheap-triage",
      confidence: 0.8,
      escalation_rule: "none",
      reason: "",
    },
    domain: {
      pack_id: "diagram-systems",
      confidence: 0.92,
      reason: "diagram-systems: 3 keyword (score 3, conf 0.92)",
      candidates: [{ pack_id: "diagram-systems", score: 3 }],
      source: "regex_confident",
    },
  };
  const out = renderHints(c, env, "draw a mermaid sequence diagram of the checkout steps", true);
  const pack = getBlock(out, "pack-hint");
  assert.match(pack, /auto_skill_directive=\[/, "expected an imperative directive line");
  assert.match(pack, /conf=0\.92/);
  assert.match(pack, /invoca agora/, "directive copy must signal high confidence honestly");
  // Honesty guardrail: never claim deterministic application.
  assert.ok(
    !/aplicad[ao] deterministicamente|applied deterministically/i.test(pack),
    "directive copy must not claim the skill was applied deterministically",
  );
  // When a directive fires, the plain advisory line is replaced (not both).
  assert.ok(!/\nskills_invoke=\[/.test(pack), "directive replaces the advisory skills_invoke line");
});

test("autoMode on but empty env skills → off → skills_invoke=[] (no directive)", async () => {
  const env: ResolveEnv = { available_skills: [], available_mcps: [], skills_known: true, mcps_known: true };
  const out = await buildHints(DIAGRAM_PROMPT, PACKS, env, undefined, true);
  const pack = getBlock(out, "pack-hint");
  assert.match(pack, /\nskills_invoke=\[\]/);
  assert.ok(!pack.includes("auto_skill_directive="), "no present skills → no directive");
});

test("HIGH_RISK never becomes a directive even with autoMode on", () => {
  // Drive renderHints directly with a synthetic high-risk complexity + a
  // confident pack whose skills are present.
  const env = envWithPackSkills("diagram-systems");
  if (!env.available_skills.length) return;
  const c: HintClassifications = {
    complexity: {
      tier: "T3",
      task_category: "architecture_or_critical",
      risk_level: "high",
      recommended_backend: "claude_subagent",
      recommended_model: "claude-opus-4-6",
      suggested_subagent: "model-architect",
      confidence: 0.9,
      escalation_rule: "high_risk",
      reason: "",
    },
    domain: {
      pack_id: "diagram-systems",
      confidence: 0.92,
      reason: "diagram-systems: 3 keyword (score 3, conf 0.92)",
      candidates: [{ pack_id: "diagram-systems", score: 3 }],
      source: "regex_confident",
    },
  };
  const out = renderHints(c, env, "deploy and migrate the production diagram service", true);
  const pack = getBlock(out, "pack-hint");
  assert.ok(!pack.includes("auto_skill_directive="), "HIGH_RISK must stay a suggestion");
  assert.match(pack, /\nskills_invoke=\[/, "HIGH_RISK keeps the advisory skills_invoke line");
});

test("autoSkillModeFromEnv: opt-in parsing", () => {
  assert.equal(autoSkillModeFromEnv({} as NodeJS.ProcessEnv), false);
  assert.equal(autoSkillModeFromEnv({ MOOTER_AUTO_SKILL: "1" } as NodeJS.ProcessEnv), true);
  assert.equal(autoSkillModeFromEnv({ MOOTER_AUTO_SKILL: "true" } as NodeJS.ProcessEnv), true);
  assert.equal(autoSkillModeFromEnv({ MOOTER_AUTO_SKILL: "0" } as NodeJS.ProcessEnv), false);
});

// Backward-compat: detectEnv()-driven buildHints (no autoMode arg) keeps working.
test("buildHints without autoMode arg defaults to off (no throw, advisory shape)", async () => {
  const out = await buildHints(DIAGRAM_PROMPT, PACKS, detectEnv());
  assert.match(out, /<pack-hint>/);
  assert.ok(!out.includes("auto_skill_directive="), "default path emits no directive");
});
