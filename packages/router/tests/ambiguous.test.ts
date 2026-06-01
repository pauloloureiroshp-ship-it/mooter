// ambiguous.test.ts — Wave 2 Day 2 — AMBIGUOUS scaffold injection.
//
// classify_domain already detects ambiguity (confidence in [0.4, 0.6) →
// pack_id="AMBIGUOUS" with top candidates). Day 2 adds the inline scaffold:
// when the hook renders an AMBIGUOUS pack-hint it now ships a short
// disambiguation directive, so the model asks one clarifying question (or
// picks the more general approach) before planning instead of guessing.
//
// Covers:
//   - 3 contention prompts → AMBIGUOUS + inline_scaffold present + candidates
//     interpolated into the scaffold text
//   - non-ambiguous prompts (high-confidence pack, GENERAL) → no AMBIGUOUS
//     scaffold (GENERAL keeps its own fallback scaffold, untouched here)
//   - applyAmbiguousScaffold pure-function contract: no scaffold when
//     pack_id != "AMBIGUOUS" or candidates.length < 2

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHints } from "../src/hooks/inject_context.ts";
import { loadPacks, type CompiledPack } from "../src/classify_domain.ts";
import { applyAmbiguousScaffold } from "../src/policy.ts";
import { type ResolveEnv } from "../src/pack_resolve.ts";
import { EmbeddingStore } from "../src/embedding_store.ts";
import { OllamaClient } from "../src/ollama_client.ts";

const PACKS: CompiledPack[] = loadPacks();
const ENV_FULL: ResolveEnv = {
  available_skills: ["web-artifacts-builder", "algorithmic-art"],
  available_mcps: ["vercel", "github", "sentry"],
  skills_known: true,
  mcps_known: true,
};

// AMBIGUOUS flow is the v1-only contract: when the embedding classifier (v2)
// is unavailable, an ambiguous prompt must still surface as AMBIGUOUS with the
// scaffold and candidates. Tests below pin v2-down via a dead Ollama URL so
// the test exercises the AMBIGUOUS path deterministically — independent of
// whether seeds happen to disambiguate this or that prompt today.
const DEAD_STORE = new EmbeddingStore(new OllamaClient("http://127.0.0.1:1", 500));

function getBlock(out: string, tag: string): string {
  const m = out.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}
function token(block: string, key: string): string {
  const m = block.match(new RegExp(`${key}=(\\S+)`));
  return m ? m[1] : "";
}

// Three prompts that the classifier already flags as AMBIGUOUS — mirror
// fixtures from classify_domain.test.ts so the suites stay aligned.
const AMBIGUOUS_PROMPTS = [
  "Review the scroll-trigger animation for security",     // animation-web ↔ code-audit
  "Security audit of the architecture diagram",           // code-audit ↔ diagram-systems
  "Animate the sequence flowchart transition",            // animation-web ↔ diagram-systems
];

for (const prompt of AMBIGUOUS_PROMPTS) {
  test(`AMBIGUOUS prompt emits inline_scaffold — "${prompt}"`, async () => {
    // Force v1-only: v2 may legitimately disambiguate some of these prompts
    // (see "combined classifier disambiguates AMBIGUOUS" below for that case).
    const out = await buildHints(prompt, PACKS, ENV_FULL, DEAD_STORE);
    const pack = getBlock(out, "pack-hint");
    assert.equal(token(pack, "pack"), "AMBIGUOUS", "pack must be AMBIGUOUS");
    assert.match(pack, /inline_scaffold="[^"]+"/, "inline_scaffold line must be present");
    // The scaffold names at least one of the candidate packs so the model can
    // craft a precise disambiguation question instead of a generic one.
    assert.match(
      pack,
      /inline_scaffold="[^"]*(?:animation-web|code-audit|diagram-systems)/,
      "scaffold must interpolate at least one candidate pack id",
    );
    // No skills/MCPs invoked while ambiguous — the model first resolves which
    // pack we are talking about.
    assert.match(pack, /skills_invoke=\[\]/);
    assert.match(pack, /suggest_install=\[\]/);
  });
}

// Non-ambiguous prompts — high-confidence pack matches must NOT emit the
// AMBIGUOUS scaffold (would confuse the model into asking a redundant
// question on a clear request).
const NON_AMBIGUOUS_PROMPTS = [
  "Add a scroll-trigger animation to the hero section",   // animation-web
  "Audita este repositório antes do deploy",              // code-audit
  "Create a mermaid flowchart for the pipeline",          // diagram-systems
];

for (const prompt of NON_AMBIGUOUS_PROMPTS) {
  test(`non-ambiguous prompt has no AMBIGUOUS scaffold — "${prompt}"`, async () => {
    const out = await buildHints(prompt, PACKS, ENV_FULL);
    const pack = getBlock(out, "pack-hint");
    assert.notEqual(token(pack, "pack"), "AMBIGUOUS", "pack must NOT be AMBIGUOUS");
    // The AMBIGUOUS scaffold template starts with "Multiple packs match" — its
    // presence on a non-ambiguous render would be a false positive. We do not
    // forbid inline_scaffold outright because GENERAL keeps its own scaffold.
    assert.doesNotMatch(
      pack,
      /inline_scaffold="Multiple packs match/,
      "AMBIGUOUS scaffold must not leak into non-ambiguous renders",
    );
  });
}

// Pure-function contract.
test("applyAmbiguousScaffold: no scaffold when pack_id is not AMBIGUOUS", () => {
  const r = applyAmbiguousScaffold({ pack_id: "animation-web", candidates: ["animation-web", "code-audit"] });
  assert.equal(r.applied, false);
  assert.equal(r.scaffold, "");
});

test("applyAmbiguousScaffold: no scaffold with fewer than 2 candidates", () => {
  const r = applyAmbiguousScaffold({ pack_id: "AMBIGUOUS", candidates: ["animation-web"] });
  assert.equal(r.applied, false);
});

test("applyAmbiguousScaffold: interpolates candidates into template", () => {
  const r = applyAmbiguousScaffold({
    pack_id: "AMBIGUOUS",
    candidates: ["animation-web", "code-audit", "diagram-systems"],
  });
  assert.equal(r.applied, true);
  assert.match(r.scaffold, /animation-web, code-audit, diagram-systems/);
  assert.match(r.scaffold, /clarifying question/);
});

// Wave 2 Day 3 — combined classifier (v1+v2) DISAMBIGUATES prompts that v1
// alone flagged as AMBIGUOUS, when the embedding similarity clears
// EMBED_PROMOTE_SIM. The hook then emits a confident pack-hint (no AMBIGUOUS
// scaffold).
//
// Wave 2 Day 5 recalibration (pack set 3 → 7, ADR 018): EMBED_PROMOTE_SIM rose
// 0.55 → 0.70. With 7 packs the nearest seed clears 0.55 for almost any prompt,
// so the old threshold over-promoted weak/ambiguous signals into a pack. The
// two cases below pin the boundary deterministically with a stub store (no
// Ollama dependency, no flakiness): the same v1-AMBIGUOUS prompt is promoted
// only when v2 is genuinely strong, and stays AMBIGUOUS when v2 is weak.
//
// "Review the scroll-trigger animation for security" → v1 = AMBIGUOUS with
// candidates {animation-web, code-audit}; the stub controls v2.
const AMBIG_PROMPT = "Review the scroll-trigger animation for security";
const stubStore = (pack_id: string, similarity: number) =>
  ({ classify: async () => ({ pack_id, similarity }) }) as unknown as EmbeddingStore;

test("v2 promotes a v1-AMBIGUOUS prompt when similarity clears EMBED_PROMOTE_SIM (0.70)", async () => {
  // Strong v2 on a v1 candidate → Rule 2 (embedding_disambiguates) fires.
  const out = await buildHints(AMBIG_PROMPT, PACKS, ENV_FULL, stubStore("animation-web", 0.82));
  const pack = getBlock(out, "pack-hint");
  assert.equal(token(pack, "pack"), "animation-web", "strong v2 must disambiguate to the candidate");
  assert.doesNotMatch(
    pack,
    /inline_scaffold="Multiple packs match/,
    "AMBIGUOUS scaffold must not appear when v2 disambiguated",
  );
});

test("v2 does NOT promote below the recalibrated EMBED_PROMOTE_SIM — stays AMBIGUOUS (Day-5 0.55→0.70)", async () => {
  // sim 0.60 would have promoted at the old 0.55 threshold; at 0.70 it must
  // stay AMBIGUOUS so the disambiguation scaffold still ships. This is the
  // precision guard the Day-5 recalibration buys.
  const out = await buildHints(AMBIG_PROMPT, PACKS, ENV_FULL, stubStore("animation-web", 0.6));
  const pack = getBlock(out, "pack-hint");
  assert.equal(token(pack, "pack"), "AMBIGUOUS", "weak v2 must not over-promote");
  assert.match(pack, /inline_scaffold="Multiple packs match/, "AMBIGUOUS scaffold must ship");
});
