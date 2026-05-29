// recalibrate.ts — Wave 2 Day 5 threshold sweep for axis-2 v2 (combined
// regex + embedding) classifier after the pack set grew 3 → 7.
//
// Why this exists (and why it is NOT the env-var grid the Day-5 brief sketched):
// the combined classifier is RULE-BASED, not a weighted blend. There are no
// REGEX_WEIGHT / EMBED_WEIGHT knobs to sweep — classifyDomainCombined() trusts a
// confident v1, and only lets v2 PROMOTE a v1 GENERAL/AMBIGUOUS verdict when the
// embedding similarity clears EMBED_PROMOTE_SIM. So the single meaningful
// accuracy knob is EMBED_PROMOTE_SIM. AGREEMENT_BONUS only nudges confidence; it
// never changes the chosen pack, hence never moves recall or precision — it is
// reported for completeness but not swept.
//
// The code comment in classify_domain.ts ("more packs ⇒ runner-up similarity
// rises ⇒ same threshold becomes more permissive") is exactly the risk we test:
// with 7 packs a too-low EMBED_PROMOTE_SIM can FALSELY PROMOTE a GENERAL prompt
// (e.g. "parse a CSV" → data-spreadsheet). The Day-3 recall test does not catch
// this because it excludes GENERAL/AMBIGUOUS prompts. So we measure BOTH:
//   - single_recall   : the 24 single-pack prompts land on the right pack (≥0.90)
//   - general_keep     : GENERAL-expected prompts STAY GENERAL (precision guard)
//   - ambiguous_keep   : AMBIGUOUS-expected prompts are not over-promoted
//
// Each prompt is embedded ONCE; thresholds are then swept in-memory (changing
// EMBED_PROMOTE_SIM never re-embeds), so the whole sweep costs 34 embed calls.
//
// Run:  npx tsx scripts/recalibrate.ts
//
// Source of truth for the decision: docs/adr/018-calibration-day5.md.

import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDomain, loadPacks, THRESHOLDS } from "../src/classify_domain.ts";
import { EmbeddingStore } from "../src/embedding_store.ts";
import { OllamaClient } from "../src/ollama_client.ts";

interface PromptEntry {
  id: string;
  expected_pack: string; // a pack name | "AMBIGUOUS" | "GENERAL"
  prompt: string;
}

const SWEEP_PROMOTE_SIM = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];
const SINGLE_PACKS = new Set(["animation-web", "code-audit", "diagram-systems"]);
const LATENCY_BUDGET_MS = 80;

function loadPrompts(): PromptEntry[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, "wave1-benchmark", "prompts.jsonl");
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as PromptEntry);
}

/** Pre-computed per-prompt facts that do not depend on the threshold. */
interface Precomputed {
  entry: PromptEntry;
  v1_pack: string;
  v1_confidence: number;
  v1_candidates: Set<string>;
  v2_pack: string | null;
  v2_sim: number; // 0 when v2 unavailable
}

/**
 * Replicate classifyDomainCombined()'s pack decision for a given promoteSim.
 * Mirrors the five rules in classify_domain.ts exactly; only EMBED_PROMOTE_SIM
 * is parameterised. Returns the chosen pack_id.
 */
function decide(p: Precomputed, promoteSim: number): string {
  const { v1_pack, v1_confidence, v1_candidates, v2_pack, v2_sim } = p;
  if (v2_pack === null) return v1_pack; // regex_fallback

  // Rule 1: confident v1 wins outright.
  if (v1_confidence >= THRESHOLDS.single && v1_pack !== "AMBIGUOUS" && v1_pack !== "GENERAL") {
    return v1_pack;
  }
  // Rule 2: AMBIGUOUS + strong v2 that is one of the candidates → promote.
  if (v1_pack === "AMBIGUOUS" && v2_sim >= promoteSim && v1_candidates.has(v2_pack)) {
    return v2_pack;
  }
  // Rule 3: GENERAL + strong v2 → promote.
  if (v1_pack === "GENERAL" && v2_sim >= promoteSim) {
    return v2_pack;
  }
  // Rule 5: v1 stands.
  return v1_pack;
}

async function main() {
  const packs = loadPacks();
  const prompts = loadPrompts();
  const store = new EmbeddingStore(new OllamaClient());

  const initStart = performance.now();
  await store.init();
  const initMs = performance.now() - initStart;

  // Embed every prompt once; capture v1 + raw v2.
  const pre: Precomputed[] = [];
  const latencies: number[] = [];
  for (const entry of prompts) {
    const v1 = classifyDomain(entry.prompt, packs);
    const t0 = performance.now();
    const v2 = await store.classify(entry.prompt).catch(() => null);
    latencies.push(performance.now() - t0);
    pre.push({
      entry,
      v1_pack: v1.pack_id,
      v1_confidence: v1.confidence,
      v1_candidates: new Set(v1.candidates.map((c) => c.pack_id)),
      v2_pack: v2?.pack_id ?? null,
      v2_sim: v2?.similarity ?? 0,
    });
  }

  latencies.sort((a, b) => a - b);
  const p99 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.99))];

  const single = pre.filter((p) => SINGLE_PACKS.has(p.entry.expected_pack));
  const general = pre.filter((p) => p.entry.expected_pack === "GENERAL");
  const ambiguous = pre.filter((p) => p.entry.expected_pack === "AMBIGUOUS");

  console.log(`packs: ${packs.length} · prompts: ${prompts.length} ` +
    `(single ${single.length} / general ${general.length} / ambiguous ${ambiguous.length})`);
  console.log(`embedding init: ${initMs.toFixed(0)} ms · p99 classify: ${p99.toFixed(1)} ms ` +
    `(budget ${LATENCY_BUDGET_MS} ms)\n`);

  const rows: Array<Record<string, number | string>> = [];
  for (const sim of SWEEP_PROMOTE_SIM) {
    const singleHits = single.filter((p) => decide(p, sim) === p.entry.expected_pack).length;
    const generalKeep = general.filter((p) => decide(p, sim) === "GENERAL").length;
    const ambiguousHandled = ambiguous.filter((p) => {
      const got = decide(p, sim);
      return got === "AMBIGUOUS" || got === "GENERAL"; // not over-promoted to a pack
    }).length;
    rows.push({
      EMBED_PROMOTE_SIM: sim,
      single_recall: +(singleHits / single.length).toFixed(3),
      general_keep: +(generalKeep / general.length).toFixed(3),
      ambiguous_keep: +(ambiguousHandled / ambiguous.length).toFixed(3),
    });
  }

  console.log("EMBED_PROMOTE_SIM sweep (AGREEMENT_BONUS irrelevant to pack choice):");
  console.table(rows);

  // Winner: max single_recall, tie-break by general_keep (precision), then by the
  // lowest threshold that achieves it (most permissive that is still safe → best
  // semantic recall headroom for unseen paraphrases).
  const valid = rows.filter((r) => (r.single_recall as number) >= 0.9 && p99 <= LATENCY_BUDGET_MS);
  valid.sort((a, b) =>
    (b.single_recall as number) - (a.single_recall as number) ||
    (b.general_keep as number) - (a.general_keep as number) ||
    (a.EMBED_PROMOTE_SIM as number) - (b.EMBED_PROMOTE_SIM as number),
  );
  console.log("\nwinner:", JSON.stringify(valid[0] ?? "none meets gate", null, 2));
}

main().catch((e) => {
  console.error("recalibrate failed:", e);
  process.exit(1);
});
