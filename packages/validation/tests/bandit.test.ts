import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  reward,
  costEfficiency,
  latencyFactor,
  DEFAULT_REWARD_CONFIG,
  type Outcome,
} from "../src/bandit/reward-fn.ts";
import {
  mulberry32,
  sampleBeta,
  sampleGamma,
  chooseArm,
  uniformPrior,
  posteriorMean,
  type BetaPosterior,
} from "../src/bandit/thompson-sampling.ts";
import {
  allowedArms,
  violatesDoctrine,
  clampTier,
  type TieredArm,
} from "../src/bandit/doctrine-guardrail.ts";
import {
  MemoryPosteriorStore,
  JsonPosteriorStore,
  contextKey,
  type BanditContext,
} from "../src/bandit/posterior-store.ts";
import { Bandit } from "../src/bandit/bandit.ts";

// ─── reward function ────────────────────────────────────────────────────────

test("reward: free + fast + accepted ≈ 1; rejected = 0", () => {
  assert.equal(reward({ accepted: false, costUsd: 0, latencyMs: 10 }), 0);
  const r = reward({ accepted: true, costUsd: 0, latencyMs: 500 });
  assert.ok(r > 0.99, `expected ~1, got ${r}`);
});

test("reward: deterministic and monotone in cost", () => {
  const cheap = reward({ accepted: true, costUsd: 0.001, latencyMs: 500 });
  const pricey = reward({ accepted: true, costUsd: 0.2, latencyMs: 500 });
  assert.ok(cheap > pricey);
  // determinism
  assert.equal(
    reward({ accepted: true, costUsd: 0.05, latencyMs: 1000 }),
    reward({ accepted: true, costUsd: 0.05, latencyMs: 1000 }),
  );
});

test("reward: latency over budget penalises; at 2x budget → 0", () => {
  const b = DEFAULT_REWARD_CONFIG.latencyBudgetMs;
  assert.equal(latencyFactor(b), 1);
  assert.equal(latencyFactor(2 * b), 0);
  assert.ok(latencyFactor(1.5 * b) > 0 && latencyFactor(1.5 * b) < 1);
});

test("reward: costEfficiency clamps to [0,1]", () => {
  assert.equal(costEfficiency(0), 1);
  assert.ok(costEfficiency(10) < 0.01);
});

// ─── Thompson sampling math ─────────────────────────────────────────────────

test("mulberry32 is deterministic for a fixed seed", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next());
});

test("sampleGamma mean ≈ k (k=5) over many draws", () => {
  const rng = mulberry32(7);
  let sum = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) sum += sampleGamma(5, rng);
  const mean = sum / N;
  assert.ok(Math.abs(mean - 5) < 0.4, `gamma mean ${mean} not ≈ 5`);
});

test("sampleBeta mean ≈ a/(a+b) and stays in [0,1]", () => {
  const rng = mulberry32(11);
  let sum = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const x = sampleBeta(2, 8, rng);
    assert.ok(x >= 0 && x <= 1);
    sum += x;
  }
  const mean = sum / N;
  assert.ok(Math.abs(mean - 0.2) < 0.03, `beta mean ${mean} not ≈ 0.2`);
});

test("chooseArm converges to the higher-mean arm given confident posteriors", () => {
  const rng = mulberry32(3);
  const posteriors = new Map<string, BetaPosterior>([
    ["good", { alpha: 90, beta: 10, pulls: 100 }], // mean 0.9
    ["bad", { alpha: 10, beta: 90, pulls: 100 }], // mean 0.1
  ]);
  let good = 0;
  for (let i = 0; i < 300; i++) {
    if (chooseArm(["good", "bad"], posteriors, rng).arm === "good") good++;
  }
  assert.ok(good > 285, `expected >285/300 good, got ${good}`);
});

test("chooseArm explores unseen arms (uniform prior) sometimes", () => {
  const rng = mulberry32(5);
  const posteriors = new Map<string, BetaPosterior>([
    ["known", { alpha: 6, beta: 4, pulls: 10 }],
  ]);
  let unseen = 0;
  for (let i = 0; i < 300; i++) {
    if (chooseArm(["known", "unseen"], posteriors, rng).arm === "unseen") unseen++;
  }
  assert.ok(unseen > 20, `expected some exploration of unseen, got ${unseen}`);
});

// ─── doctrine guardrail ─────────────────────────────────────────────────────

const ARMS: TieredArm[] = [
  { id: "qwen3:30b", tier: "T0" },
  { id: "haiku", tier: "T1" },
  { id: "sonnet", tier: "T2" },
  { id: "opus", tier: "T3" },
];

test("violatesDoctrine / clampTier basics", () => {
  assert.equal(violatesDoctrine("T0", "T3"), true);
  assert.equal(violatesDoctrine("T3", "T3"), false);
  assert.equal(clampTier("T0", "T2"), "T2");
  assert.equal(clampTier("T3", "T2"), "T3");
});

test("allowedArms: T2 floor drops T0/T1", () => {
  const a = allowedArms(ARMS, { classifyTier: "T2" });
  assert.deepEqual(a.map((x) => x.tier).sort(), ["T2", "T3"]);
});

test("allowedArms: high-risk pins to the exact classify tier", () => {
  const a = allowedArms(ARMS, { classifyTier: "T3", highRisk: true });
  assert.deepEqual(a.map((x) => x.id), ["opus"]);
});

test("allowedArms throws when no arm satisfies the floor", () => {
  assert.throws(() => allowedArms([{ id: "x", tier: "T0" }], { classifyTier: "T3" }), /no arm at or above/);
});

// ─── bandit orchestration + doctrine invariant ──────────────────────────────

const CTX: BanditContext = { promptClass: "refactor", hardwareClass: "gpu-high", subscriptionTier: "max" };

test("DOCTRINE: bandit cannot force a lower tier when classify says T3", () => {
  const store = new MemoryPosteriorStore();
  const bandit = new Bandit(store, { seed: 1 });
  // Make the cheap T0 arm look amazing — it must STILL never be chosen at T3.
  for (let i = 0; i < 50; i++) bandit.observe(CTX, "qwen3:30b", { accepted: true, costUsd: 0, latencyMs: 100 });
  for (let trial = 0; trial < 200; trial++) {
    const d = bandit.decide({ context: CTX, classifyTier: "T3", arms: ARMS });
    assert.equal(d.tier, "T3");
    assert.equal(d.arm, "opus");
    assert.equal(violatesDoctrine(d.tier, "T3"), false);
  }
});

test("bandit biases toward the rewarded arm WITHIN the allowed tier set", () => {
  const store = new MemoryPosteriorStore();
  const bandit = new Bandit(store, { seed: 2 });
  // classify floor T1 → allowed {haiku,sonnet,opus}. Reward sonnet heavily, punish others.
  for (let i = 0; i < 60; i++) {
    bandit.observe(CTX, "sonnet", { accepted: true, costUsd: 0.01, latencyMs: 800 });
    bandit.observe(CTX, "opus", { accepted: false, costUsd: 0.2, latencyMs: 5000 });
    bandit.observe(CTX, "haiku", { accepted: false, costUsd: 0.005, latencyMs: 600 });
  }
  let sonnet = 0;
  for (let i = 0; i < 200; i++) {
    const d = bandit.decide({ context: CTX, classifyTier: "T1", arms: ARMS });
    assert.notEqual(d.tier, "T0"); // never below floor
    if (d.arm === "sonnet") sonnet++;
  }
  assert.ok(sonnet > 150, `expected bandit to favour sonnet, got ${sonnet}/200`);
});

test("decide reports guardrailApplied when candidates are narrowed", () => {
  const store = new MemoryPosteriorStore();
  const bandit = new Bandit(store, { seed: 4 });
  const d = bandit.decide({ context: CTX, classifyTier: "T2", arms: ARMS });
  assert.equal(d.guardrailApplied, true); // T0/T1 dropped
  const d0 = bandit.decide({ context: CTX, classifyTier: "T0", arms: ARMS });
  assert.equal(d0.guardrailApplied, false); // all arms allowed
});

// ─── posterior store persistence ────────────────────────────────────────────

test("observe updates posterior counts (mean moves toward reward)", () => {
  const store = new MemoryPosteriorStore();
  const bandit = new Bandit(store, { seed: 6 });
  const before = posteriorMean(store.get(contextKey(CTX), "sonnet"));
  for (let i = 0; i < 20; i++) bandit.observe(CTX, "sonnet", { accepted: true, costUsd: 0.005, latencyMs: 500 });
  const after = posteriorMean(store.get(contextKey(CTX), "sonnet"));
  assert.ok(after > before);
  assert.equal(store.get(contextKey(CTX), "sonnet").pulls, 20);
});

test("JsonPosteriorStore persists and reloads across instances", () => {
  const dir = mkdtempSync(join(tmpdir(), "mooter-bandit-"));
  const prev = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = dir;
  try {
    const path = join(dir, "bandit-state.json");
    const s1 = new JsonPosteriorStore(path);
    s1.update(contextKey(CTX), "sonnet", 5, 1);
    assert.ok(existsSync(path));
    const s2 = new JsonPosteriorStore(path);
    const p = s2.get(contextKey(CTX), "sonnet");
    assert.equal(p.alpha, uniformPrior().alpha + 5);
    assert.equal(p.pulls, 1);
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HOME;
    else process.env.MOOTER_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
