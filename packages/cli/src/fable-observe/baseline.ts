// Router baseline (Wave Mega 50-51 Phase 5) — what the deterministic local
// router (sha-frozen tools/router/classify.js) would do for the same prompt.
// READ-ONLY invocation via `node classify.js "<prompt>"`; classify.js is
// NEVER modified. The gap between Fable's decision and this baseline is the
// learnable pattern for Pastor.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { RouterBaseline } from "./schema.ts";

/** Resolve the classify.js to invoke. Explicit dep > env > installed > repo cwd. */
export function resolveClassifyJs(explicit?: string): string | null {
  const candidates = [
    explicit,
    process.env.MOOTER_CLASSIFY_JS,
    join(homedir(), ".claude", "tools", "router", "classify.js"),
    join(process.cwd(), "tools", "router", "classify.js"),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

/** Run classify.js on the prompt; null on any failure (baseline is best-effort). */
export function runRouterBaseline(prompt: string, classifyJs?: string): RouterBaseline | null {
  const js = resolveClassifyJs(classifyJs);
  if (!js || !prompt) return null;
  try {
    const stdout = execFileSync("node", [js, prompt], {
      encoding: "utf8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    if (
      typeof parsed.tier === "string" &&
      typeof parsed.recommended_model === "string" &&
      typeof parsed.confidence === "number" &&
      typeof parsed.task_category === "string"
    ) {
      return {
        tier: parsed.tier,
        model: parsed.recommended_model,
        confidence: parsed.confidence,
        task_category: parsed.task_category,
      };
    }
  } catch {
    /* baseline is advisory — degrade to null */
  }
  return null;
}
