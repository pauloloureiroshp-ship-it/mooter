// Adapter validation pipeline (Wave 5 D2). Composes the D1 manifest primitives
// (structural `validateManifest` + signature `verifyManifest`) and adds an async
// base-model availability check against Ollama. Reuses D1's NATURAL-ORDER signing
// (do NOT re-canonicalize — that would break D1 signatures). The Ollama probe is
// injectable so tests run without a real `ollama` binary.

import { type AdapterManifestV1, validateManifest as validateStructural, verifyManifest } from "./adapter_manifest.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Alias kept for the kickoff's naming; delegates to D1's verifyManifest. */
export function verifyManifestSignature(manifest: AdapterManifestV1, secret: string): boolean {
  return verifyManifest(manifest, secret);
}

export type ModelChecker = (model: string) => Promise<boolean>;

/** Default Ollama probe: `ollama list` contains the model. Resolves false on any failure. */
export const defaultModelChecker: ModelChecker = async (model) => {
  try {
    const { spawn } = await import("node:child_process");
    return await new Promise<boolean>((resolve) => {
      const proc = spawn("ollama", ["list"], { stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      proc.stdout.on("data", (d) => { out += d.toString(); });
      proc.on("close", () => resolve(out.includes(model)));
      proc.on("error", () => resolve(false));
    });
  } catch {
    return false;
  }
};

/**
 * Full adapter validation: structural + honesty (no performance without a
 * benchmark_run_id, from D1) + HMAC signature + base-model availability. A
 * missing base model is a WARNING (Ollama can pull it later), not an error.
 */
export async function validateAdapter(
  manifest: AdapterManifestV1,
  secret: string,
  checkModel: ModelChecker = defaultModelChecker,
): Promise<ValidationResult> {
  const structural = validateStructural(manifest);
  const errors = [...structural.errors];
  const warnings: string[] = [];

  if (!verifyManifest(manifest, secret)) {
    errors.push("signature verification failed (tamper detected or wrong secret)");
  }

  if (manifest.base_model) {
    const available = await checkModel(manifest.base_model);
    if (!available) warnings.push(`base_model "${manifest.base_model}" not loaded in Ollama (run: ollama pull ${manifest.base_model})`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** REAL benchmark metric computation. Pure given the per-prompt results. */
export interface BenchmarkRow {
  prompt: string;
  expected: string;
  baseline: string;
  adapter: string;
}
export function computeBenchmarkMetrics(rows: BenchmarkRow[]): { baseline_accuracy: number; adapter_accuracy: number; accuracy_delta: number; n: number } {
  const n = rows.length;
  if (n === 0) return { baseline_accuracy: 0, adapter_accuracy: 0, accuracy_delta: 0, n: 0 };
  const b = rows.filter((r) => r.baseline === r.expected).length / n;
  const a = rows.filter((r) => r.adapter === r.expected).length / n;
  return { baseline_accuracy: b, adapter_accuracy: a, accuracy_delta: Math.round((a - b) * 1000) / 1000, n };
}
