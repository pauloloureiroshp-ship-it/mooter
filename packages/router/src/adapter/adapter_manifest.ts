// `mooter_adapter` manifest v1 (Wave 5 D1 — Adapter Forge foundation).
//
// The canonical shape describing an installed adapter (a LoRA/DoRA/full fine-tune
// merged onto a base Moo). D1 only defines + validates + signs the manifest; the
// runtime that HONORS it ships in D2 (`tools/router/adapter_selection.js` returns
// null today). HMAC-signed so an installed manifest can be verified locally.
//
// Honesty rule encoded here: `performance` may ONLY be present alongside a
// `benchmark_run_id` — you cannot claim an accuracy delta without a benchmark.

import { createHmac, createHash } from "node:crypto";

export interface AdapterPerformance {
  benchmark_run_id: string;
  accuracy_delta: number; // vs baseline (+0.05 = 5% better)
  inference_speed_factor: number; // 1.0 = same as baseline
  measured_at_utc: string;
}

export interface AdapterManifestV1 {
  schema_version: 1;
  adapter_id: string; // sha256-truncated hash of the .gguf file
  name: string;
  domain?: string;
  base_model: string; // must match the Ollama-loaded base, e.g. "qwen2.5:3b"
  adapter_type: "lora" | "dora" | "full-finetune";
  quantization: "fp16" | "q8_0" | "q4_k_m";
  source: "user-provided" | "mooter-forge";
  training_data?: { seed_count: number; examples_count: number; sha256: string };
  performance?: AdapterPerformance;
  installed_at_utc: string;
  file_path_pseudonymous: string; // hashed local path, never the raw path
  signature: string; // HMAC of the manifest (sans signature)
}

export const ADAPTER_SCHEMA_VERSION = 1 as const;

/** Adapter id = truncated sha256 of the adapter file bytes (or any stable input). */
export function adapterIdFromContent(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

/** Pseudonymous local path — hashed so the raw filesystem path never leaks. */
export function pseudonymizePath(absPath: string): string {
  return "path:" + createHash("sha256").update(absPath).digest("hex").slice(0, 16);
}

function signablePayload(m: Omit<AdapterManifestV1, "signature">): string {
  return JSON.stringify(m);
}

export function signManifest(m: Omit<AdapterManifestV1, "signature">, secret: string): string {
  return createHmac("sha256", secret).update(signablePayload(m)).digest("hex");
}

export function buildManifest(fields: Omit<AdapterManifestV1, "signature">, secret: string): AdapterManifestV1 {
  return { ...fields, signature: signManifest(fields, secret) };
}

export function verifyManifest(m: AdapterManifestV1, secret: string): boolean {
  if (!m || !m.signature) return false;
  const { signature, ...rest } = m;
  return signManifest(rest as Omit<AdapterManifestV1, "signature">, secret) === signature;
}

/**
 * Structural + honesty validation. Returns { valid, errors }. The honesty rule:
 * a `performance` block is only legal if it carries a `benchmark_run_id` (no
 * fabricated accuracy claims without a benchmark to back them).
 */
export function validateManifest(m: AdapterManifestV1): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (m.schema_version !== ADAPTER_SCHEMA_VERSION) errors.push(`schema_version must be ${ADAPTER_SCHEMA_VERSION}`);
  if (!m.adapter_id) errors.push("adapter_id required");
  if (!m.name) errors.push("name required");
  if (!m.base_model) errors.push("base_model required");
  if (!["lora", "dora", "full-finetune"].includes(m.adapter_type)) errors.push("invalid adapter_type");
  if (!["fp16", "q8_0", "q4_k_m"].includes(m.quantization)) errors.push("invalid quantization");
  if (!["user-provided", "mooter-forge"].includes(m.source)) errors.push("invalid source");
  if (m.performance && !m.performance.benchmark_run_id) {
    errors.push("performance present without benchmark_run_id (no unbenchmarked accuracy claims)");
  }
  if (!m.installed_at_utc) errors.push("installed_at_utc required");
  return { valid: errors.length === 0, errors };
}
