// skill_apply unit tests — Cockpit v2 Wave 1 (PASSO 1).
// Run: cd packages/router && node --test tests/skill-apply.test.ts  (or: npm test)
//
// decideSkillApply is a PURE function. These tests pin the full truth table and
// the load-bearing INVARIANT: HIGH_RISK is never 'directive'.

import { test } from "node:test";
import assert from "node:assert/strict";
import { decideSkillApply } from "../src/skill_apply.ts";
import { THRESHOLDS } from "../src/classify_domain.ts";

const SKILLS = ["web-artifacts-builder", "canvas-design"];

test("directive: conf>=single + autoMode + not-high-risk → 'directive'", () => {
  const d = decideSkillApply({
    confidence: 0.7,
    skillsInvoke: SKILLS,
    highRisk: false,
    autoMode: true,
  });
  assert.equal(d.mode, "directive");
  assert.deepEqual(d.skills, SKILLS);
});

test("INVARIANT: conf>=single + autoMode + HIGH_RISK → 'suggest' (never directive)", () => {
  const d = decideSkillApply({
    confidence: 0.95,
    skillsInvoke: SKILLS,
    highRisk: true,
    autoMode: true,
  });
  assert.equal(d.mode, "suggest");
  assert.deepEqual(d.skills, SKILLS);
});

test("suggest: conf>=single + autoMode OFF → 'suggest' (opt-in default off)", () => {
  const d = decideSkillApply({
    confidence: 0.7,
    skillsInvoke: SKILLS,
    highRisk: false,
    autoMode: false,
  });
  assert.equal(d.mode, "suggest");
});

test("suggest: confidence below single threshold → 'suggest' even with autoMode", () => {
  const d = decideSkillApply({
    confidence: 0.5,
    skillsInvoke: SKILLS,
    highRisk: false,
    autoMode: true,
  });
  assert.equal(d.mode, "suggest");
});

test("off: empty skillsInvoke → 'off' regardless of other flags", () => {
  for (const autoMode of [true, false]) {
    for (const highRisk of [true, false]) {
      const d = decideSkillApply({ confidence: 0.99, skillsInvoke: [], highRisk, autoMode });
      assert.equal(d.mode, "off", `autoMode=${autoMode} highRisk=${highRisk}`);
      assert.deepEqual(d.skills, []);
    }
  }
});

test("boundary: confidence exactly at THRESHOLDS.single is treated as confident", () => {
  const d = decideSkillApply({
    confidence: THRESHOLDS.single,
    skillsInvoke: SKILLS,
    highRisk: false,
    autoMode: true,
  });
  assert.equal(d.mode, "directive");
});

test("missing skillsInvoke (undefined) is tolerated → 'off'", () => {
  // @ts-expect-error — exercise the runtime guard for skillsInvoke?.length
  const d = decideSkillApply({ confidence: 0.9, highRisk: false, autoMode: true });
  assert.equal(d.mode, "off");
});
