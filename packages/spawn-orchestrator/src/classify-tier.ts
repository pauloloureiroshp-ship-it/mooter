// Wave 33.5 Block B.2 (step 1) — tier classification for a spawn.
//
// Reuses the canonical router (tools/router/classify.js) so spawns route by the
// SAME doctrine as everything else — classify.js is NEVER modified. The classifier
// is injectable; the default shells out to the canonical script and reads its tier.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Tier } from "./types.ts";

export type Classifier = (task: string) => Tier;

function findClassifyScript(): string | null {
  const bases: string[] = [];
  try {
    bases.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* bundled */
  }
  bases.push(process.cwd());
  for (const base of bases) {
    let dir = base;
    for (let i = 0; i < 9; i++) {
      const cand = join(dir, "tools", "router", "classify.js");
      if (existsSync(cand)) return cand;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

/** Default classifier: `node classify.js "<task>"` → parse JSON → tier. */
export const defaultClassifier: Classifier = (task) => {
  const script = findClassifyScript();
  if (!script) return "T2"; // safe middle when the router can't be located
  try {
    const out = execFileSync("node", [script, task], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const json = JSON.parse(out);
    const t = String(json.tier ?? "");
    return /^T[0-3]$/.test(t) ? (t as Tier) : "T2";
  } catch {
    return "T2";
  }
};

export function classifyTier(task: string, classifier: Classifier = defaultClassifier): Tier {
  return classifier(task);
}

/** local-first mapping: T0/T1 → Ollama (free), T2/T3 → cloud. */
export function tierToMode(tier: Tier): "cloud" | "local" {
  return tier === "T0" || tier === "T1" ? "local" : "cloud";
}
