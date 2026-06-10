// `mooter pricing-update` (Wave 33 C.3) — pull the latest model/provider pricing
// from the hub into a local cache, so price tables refresh WITHOUT a CLI release.
//
//   mooter pricing-update           pull from hub → ~/.mooter/pricing_cache.json
//   mooter pricing-update --show    print the current cache
//
// Read-only network (GET /v1/pricing). On any failure it keeps the existing cache
// and reports honestly — never wipes a good cache with an error.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export const DEFAULT_HUB = "https://mooter-hub.paulo-loureiro.workers.dev";

export interface PricingModel {
  id: string;
  tier: string;
  input: number;
  output: number;
}
export interface PricingCache {
  generated_at: string;
  source: string;
  models: PricingModel[];
  pulled_at: number;
}

function cachePath(home: string): string {
  return join(home, ".mooter", "pricing_cache.json");
}

export function readCache(home = homedir()): PricingCache | null {
  try {
    return JSON.parse(readFileSync(cachePath(home), "utf8"));
  } catch {
    return null;
  }
}

function isValidBody(b: unknown): b is { generated_at: string; source: string; models: PricingModel[] } {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return Array.isArray(o.models) && o.models.every((m) => m && typeof (m as PricingModel).id === "string");
}

export async function runPricingUpdate(
  args: string[],
  deps: { fetchImpl?: typeof fetch; home?: string; hubUrl?: string; now?: number } = {},
): Promise<CmdResult> {
  const home = deps.home ?? homedir();

  if (args.includes("--show")) {
    const c = readCache(home);
    if (!c) return { exitCode: 1, output: "no pricing cache yet — run `mooter pricing-update`." };
    const rows = c.models.map((m) => `  ${m.id.padEnd(20)} ${m.tier}  in $${m.input}/Mtok · out $${m.output}/Mtok`);
    return { exitCode: 0, output: `🐮 pricing cache (from ${c.source}, generated ${c.generated_at}):\n${rows.join("\n")}` };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const hub = (deps.hubUrl ?? DEFAULT_HUB).replace(/\/$/, "");
  try {
    const res = await fetchImpl(`${hub}/v1/pricing`);
    if (!res.ok) {
      return { exitCode: 1, output: `hub returned ${res.status} — kept existing cache (no change).` };
    }
    const body = await res.json();
    if (!isValidBody(body)) {
      return { exitCode: 1, output: "hub returned an unexpected shape — kept existing cache (no change)." };
    }
    const cache: PricingCache = {
      generated_at: body.generated_at,
      source: body.source,
      models: body.models,
      pulled_at: deps.now ?? Date.now(),
    };
    mkdirSync(join(home, ".mooter"), { recursive: true });
    writeFileSync(cachePath(home), JSON.stringify(cache, null, 2) + "\n");
    return { exitCode: 0, output: `✓ pricing updated — ${cache.models.length} models cached (source: ${cache.source}).` };
  } catch (e) {
    return { exitCode: 1, output: `pricing pull failed (${(e as Error).message}) — kept existing cache (no change).` };
  }
}
