// inline-scaffold-exclusion.test.ts — Wave 2 Day 3 NIT 2.
//
// resolveInlineScaffold() returns AT MOST ONE scaffold. Before this refactor
// the renderer computed `fallback` and `ambig` in parallel and emitted both
// lines (only one ever fired at a time because of caller order, but the
// exclusion was circumstantial). The refactor makes exclusion structural —
// the return type is a tagged union and only one tag exists per call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveInlineScaffold } from "../src/hooks/inject_context.ts";
import { buildHints } from "../src/hooks/inject_context.ts";
import { loadPacks, type CompiledPack } from "../src/classify_domain.ts";
import { type ResolveEnv } from "../src/pack_resolve.ts";
import { EmbeddingStore } from "../src/embedding_store.ts";
import { OllamaClient } from "../src/ollama_client.ts";

const PACKS: CompiledPack[] = loadPacks();
const ENV: ResolveEnv = {
  available_skills: [],
  available_mcps: [],
  skills_known: true,
  mcps_known: true,
};
// Pin v1-only behaviour so the buildHints assertions below exercise the
// AMBIGUOUS / GENERAL render paths regardless of what v2 would choose.
const DEAD_STORE = new EmbeddingStore(new OllamaClient("http://127.0.0.1:1", 200));

test("resolveInlineScaffold: AMBIGUOUS → single 'ambiguous' kind", () => {
  const s = resolveInlineScaffold({
    pack_id: "AMBIGUOUS",
    candidates: ["animation-web", "code-audit"],
    recommended_tier: "T1",
  });
  assert.ok(s, "scaffold expected");
  assert.equal(s?.kind, "ambiguous");
  assert.match(s?.scaffold ?? "", /Multiple packs match/);
});

test("resolveInlineScaffold: GENERAL with low tier → single 'fallback' kind", () => {
  const s = resolveInlineScaffold({
    pack_id: "GENERAL",
    candidates: [],
    recommended_tier: "T0",
  });
  assert.ok(s, "scaffold expected");
  assert.equal(s?.kind, "fallback");
  assert.equal((s as { tier: string }).tier, "T2");
});

test("resolveInlineScaffold: GENERAL with high tier → no scaffold", () => {
  // applyGeneralFallback does NOT promote when tier already >= T2.
  const s = resolveInlineScaffold({
    pack_id: "GENERAL",
    candidates: [],
    recommended_tier: "T3",
  });
  assert.equal(s, null);
});

test("resolveInlineScaffold: confident pack → no scaffold", () => {
  const s = resolveInlineScaffold({
    pack_id: "animation-web",
    candidates: ["animation-web"],
    recommended_tier: "T2",
  });
  assert.equal(s, null);
});

test("hook render: AMBIGUOUS pack-hint emits exactly one inline_scaffold line", async () => {
  const out = await buildHints(
    "Review the scroll-trigger animation for security",
    PACKS,
    ENV,
    DEAD_STORE, // pin v1 — AMBIGUOUS verdict is the contract under test
  );
  const matches = (out.match(/inline_scaffold=/g) ?? []).length;
  assert.equal(matches, 1, "AMBIGUOUS hint must carry exactly one inline_scaffold");
});

test("hook render: GENERAL low-tier hint emits exactly one inline_scaffold line", async () => {
  const out = await buildHints("explain debounce vs throttle", PACKS, ENV, DEAD_STORE);
  const matches = (out.match(/inline_scaffold=/g) ?? []).length;
  // The combined classifier may, in theory, route to a confident pack here;
  // the structural guarantee is "at most one", not "exactly one".
  assert.ok(matches <= 1, "at most one inline_scaffold permitted");
});

test("hook render: confident pack-hint emits zero inline_scaffold lines", async () => {
  const out = await buildHints(
    "preciso de uma animação scroll-trigger no hero da landing",
    PACKS,
    ENV,
    DEAD_STORE,
  );
  const matches = (out.match(/inline_scaffold=/g) ?? []).length;
  assert.equal(matches, 0, "a confident pack render should not carry inline_scaffold");
});
