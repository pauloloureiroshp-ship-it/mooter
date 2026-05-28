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
// alone flagged as AMBIGUOUS. The hook should then emit a confident pack-hint
// (no AMBIGUOUS scaffold). Skipped when Ollama is unreachable so CI without
// Ollama still passes the suite.
async function ollamaReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(
      `${process.env.OLLAMA_HOST ?? "http://host.docker.internal:11434"}/api/tags`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

test(
  "combined classifier disambiguates an AMBIGUOUS prompt via embedding",
  { timeout: 30_000 },
  async (t) => {
    if (!(await ollamaReachable())) return t.skip("Ollama unreachable");
    // "Review the scroll-trigger animation for security" — v1 sees both
    // animation-web and code-audit. With v2 the embedding picks one with
    // strong sim and Rule 2 (embedding_disambiguates) promotes it.
    const out = await buildHints(
      "Review the scroll-trigger animation for security",
      PACKS,
      ENV_FULL,
    );
    const pack = getBlock(out, "pack-hint");
    const packId = token(pack, "pack");
    assert.notEqual(packId, "AMBIGUOUS", "embedding should disambiguate");
    assert.ok(
      ["animation-web", "code-audit"].includes(packId),
      `disambiguated pack must be one of the original candidates, got ${packId}`,
    );
    // No AMBIGUOUS scaffold leaks when the prompt was disambiguated.
    assert.doesNotMatch(
      pack,
      /inline_scaffold="Multiple packs match/,
      "AMBIGUOUS scaffold must not appear when v2 disambiguated",
    );
  },
);
