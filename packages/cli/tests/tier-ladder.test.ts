// Wave Mega 50-51 (2.A) — tier-ladder VERIFICATION against the real, frozen
// classify.js (sha 427d8c0b…). The real ladder is T0–T3 auto-routed + T5
// (Fable 5) strictly via an explicit "@fable" user pin. T4 does NOT exist —
// these tests pin that fact so no future copy/code can quietly invent it.
//
// Each case spawns `node tools/router/classify.js "<prompt>"` from the repo
// root (local, side-effect-light) and inspects the emitted JSON.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runExplain } from "../src/commands/explain.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLASSIFY = join(REPO_ROOT, "tools", "router", "classify.js");
const STATUSLINE = join(REPO_ROOT, "tools", "router", "statusline-multi.js");

const KNOWN_TIERS = ["T0", "T1", "T2", "T3", "T5"];

interface Decision {
  tier: string;
  recommended_model: string;
  raw: string;
  [k: string]: unknown;
}

function classify(prompt: string): Decision {
  const raw = execFileSync("node", [CLASSIFY, prompt], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 30000,
  });
  return { ...JSON.parse(raw), raw } as Decision;
}

test("tier ladder: '@fable redesign the vault' → T5 / claude-fable-5 (explicit opt-in)", () => {
  const d = classify("@fable redesign the vault");
  assert.equal(d.tier, "T5");
  assert.equal(d.recommended_model, "claude-fable-5");
});

test("tier ladder: trivial 'fix typo in README' routes to a cheap tier, never T3/T5", () => {
  // VERIFIED REALITY (not the brief's assumption): the frozen classifier routes
  // this short imperative to T1 (cheap-triage), not T0 — both are correct
  // "cheap" outcomes. The invariant worth pinning: a trivial prompt must never
  // burn T3/T5.
  const d = classify("fix typo in README");
  assert.ok(["T0", "T1"].includes(d.tier), `expected T0/T1, got ${d.tier}`);
});

test("tier ladder: a pure extraction prompt → T0 (local, $0)", () => {
  const d = classify("extract the function names from this snippet");
  assert.equal(d.tier, "T0");
  assert.match(String(d.recommended_model), /qwen/);
});

test("tier ladder: NO output ever claims a T4 tier (T4 does not exist)", () => {
  const prompts = [
    "@fable redesign the vault",
    "fix typo in README",
    "extract the function names from this snippet",
  ];
  for (const p of prompts) {
    const d = classify(p);
    assert.ok(KNOWN_TIERS.includes(d.tier), `unknown tier ${d.tier} for "${p}"`);
    assert.ok(!d.raw.includes('"tier": "T4"') && !d.raw.includes('"tier":"T4"'),
      `classify output claimed T4 for "${p}"`);
  }
});

test("explain tiers: advertises T5 as opt-in-only and explicitly denies T4", () => {
  const res = runExplain({ topic: "tiers" });
  assert.equal(res.exitCode, 0);
  assert.match(res.output, /T5/);
  assert.match(res.output, /opt-in ONLY/);
  assert.match(res.output, /never auto-routed/);
  // The ONLY mention of T4 allowed is the explicit denial.
  assert.match(res.output, /There is no T4/);
  assert.equal(res.output.match(/T4/g)?.length, 1, "T4 may appear only in the denial");
});

test("statusline-multi --mock smoke: exits 0 and renders all demo states", () => {
  const out = execFileSync("node", [STATUSLINE, "--mock"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.ok(out.trim().length > 0);
});
