// Wave 3 Day 2 — persona-aware pack recommendations. node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";

import { recommendPacks, buildProfile, PERSONA_WEIGHTS, type Persona } from "../src/commands/init.ts";

const FIXED_NOW = new Date("2026-05-31T00:00:00Z");

function fakeProfile() {
  return {
    os: "linux", os_version: "6", node_version: "v20", gpu: { model: "RTX 4090", vram_gb: 24 },
    ram_gb: 64, cpu_cores: 32, ollama: { url: "x", models: ["qwen3:7b"], available: true },
  } as any;
}

const PACKS = [
  { pack_id: "code-audit", model_floor: "T1", model_ceiling: "T2" },
  { pack_id: "diagram-systems", model_floor: "T2", model_ceiling: "T2" },
  { pack_id: "animation-web", model_floor: "T1", model_ceiling: "T2" },
  { pack_id: "legal-contracts", model_floor: "T2", model_ceiling: "T3" },
];

test("PERSONA_WEIGHTS has the 4 personas with weights summing to 1.0", () => {
  for (const k of ["solo_founder", "senior_ic", "oss_maintainer", "other"] as Persona[]) {
    const w = PERSONA_WEIGHTS[k];
    assert.ok(Math.abs(w.hardware + w.provider + w.trust - 1.0) < 1e-9, `${k} weights sum to 1`);
  }
});

test("recommendPacks: 'other' (default) is backward-compatible (3-arg call)", () => {
  const a = recommendPacks(PACKS, fakeProfile(), "T3");
  const b = recommendPacks(PACKS, fakeProfile(), "T3", "other");
  assert.deepEqual(a.map((f) => f.pack_id), b.map((f) => f.pack_id), "3-arg == explicit other");
});

test("recommendPacks: different personas produce different rankings/scores", () => {
  const solo = recommendPacks(PACKS, fakeProfile(), "T3", "solo_founder");
  const oss = recommendPacks(PACKS, fakeProfile(), "T3", "oss_maintainer");
  // bonus packs differ → at least one score differs
  const soloScore = (id: string) => solo.find((f) => f.pack_id === id)!.fit_score;
  const ossScore = (id: string) => oss.find((f) => f.pack_id === id)!.fit_score;
  assert.notEqual(soloScore("animation-web"), ossScore("animation-web"), "weights/bonus shift scores");
});

test("recommendPacks: persona bonus adds to affinity packs only", () => {
  // Two identical packs (same floor/ceiling, both default trust 70 — absent from
  // STATIC_TRUST). "refactor" is in the oss bonus set; "zzz-neutral" is not.
  const twins = [
    { pack_id: "refactor", model_floor: "T1", model_ceiling: "T2" },
    { pack_id: "zzz-neutral", model_floor: "T1", model_ceiling: "T2" },
  ];
  const oss = recommendPacks(twins, fakeProfile(), "T3", "oss_maintainer");
  const bonus = oss.find((f) => f.pack_id === "refactor")!.fit_score;
  const neutral = oss.find((f) => f.pack_id === "zzz-neutral")!.fit_score;
  assert.ok(bonus > neutral, "identical pack scores higher only because of the persona bonus");
});

test("buildProfile: persists persona when given, omits when not (compat)", () => {
  const withP = buildProfile(fakeProfile(), FIXED_NOW, "senior_ic");
  assert.equal(withP.persona, "senior_ic");
  const without = buildProfile(fakeProfile(), FIXED_NOW);
  assert.ok(!("persona" in without), "no persona key when not asked");
});
