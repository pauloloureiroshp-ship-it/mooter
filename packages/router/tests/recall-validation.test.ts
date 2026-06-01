// recall-validation.test.ts — Wave 2 Day 3 combined-classifier recall.
//
// Reads the 24 single-pack prompts (animation-web / code-audit /
// diagram-systems) from the Wave 1 validation set and verifies that the
// combined v1 + v2 classifier picks the expected pack for ≥ 90% of them.
// AMBIGUOUS / GENERAL prompts are intentionally excluded — they measure
// uncertainty handling, not pack identification.
//
// Skipped (not failed) when Ollama is unreachable so CI without Ollama still
// passes the suite.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDomain, classifyDomainCombined, loadPacks } from "../src/classify_domain.ts";
import { EmbeddingStore } from "../src/embedding_store.ts";
import { OllamaClient, DEFAULT_OLLAMA_URL } from "../src/ollama_client.ts";

interface PromptEntry {
  id: string;
  expected_pack: string;
  prompt: string;
}

const PACKS = loadPacks();
const TARGET_RECALL = 0.9;
const SINGLE_PACKS = new Set(["animation-web", "code-audit", "diagram-systems"]);

function loadValidationPrompts(): PromptEntry[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, "..", "scripts", "wave1-benchmark", "prompts.jsonl");
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as PromptEntry)
    .filter((p) => SINGLE_PACKS.has(p.expected_pack));
}

async function ollamaReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${DEFAULT_OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

test(
  "combined classifier recall ≥ 0.90 on single-pack validation set",
  { timeout: 90_000 },
  async (t) => {
    if (!(await ollamaReachable())) return t.skip("Ollama unreachable");

    const prompts = loadValidationPrompts();
    assert.ok(prompts.length >= 20, `expected ≥ 20 prompts, found ${prompts.length}`);

    const store = new EmbeddingStore(new OllamaClient());
    await store.init();

    let v1Correct = 0;
    let combinedCorrect = 0;
    const wrong: Array<{ id: string; expected: string; got: string; source: string }> = [];
    for (const p of prompts) {
      const v1 = classifyDomain(p.prompt, PACKS);
      const v2 = await classifyDomainCombined(p.prompt, PACKS, store);
      if (v1.pack_id === p.expected_pack) v1Correct++;
      if (v2.pack_id === p.expected_pack) combinedCorrect++;
      else wrong.push({ id: p.id, expected: p.expected_pack, got: v2.pack_id, source: v2.source });
    }
    const v1Recall = v1Correct / prompts.length;
    const combinedRecall = combinedCorrect / prompts.length;

    // Always report — the numbers go straight into the PR body.
    console.log(`v1 recall: ${(v1Recall * 100).toFixed(1)}% (${v1Correct}/${prompts.length})`);
    console.log(
      `combined recall: ${(combinedRecall * 100).toFixed(1)}% (${combinedCorrect}/${prompts.length})`,
    );
    if (wrong.length > 0) {
      console.log("misses:");
      for (const w of wrong) {
        console.log(`  - ${w.id}: expected ${w.expected}, got ${w.got} (${w.source})`);
      }
    }

    // The brief says combined ≥ 0.90. v1 is also reported so any regression
    // shows up in the test log without failing on its own.
    assert.ok(
      combinedRecall >= TARGET_RECALL,
      `combined recall ${combinedRecall.toFixed(3)} < ${TARGET_RECALL}`,
    );
    // Combined must not regress vs v1 alone — additive is the whole point.
    assert.ok(
      combinedRecall >= v1Recall - 0.001,
      `combined ${combinedRecall.toFixed(3)} regressed below v1 ${v1Recall.toFixed(3)}`,
    );
  },
);
