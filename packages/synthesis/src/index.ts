// @mooter/synthesis — public surface (Wave 29 "Synthesis Ultimate").
//
// Layers shipped as foundation in Wave 29 (opt-in, privacy-first, zero proxy):
//   L12 LLMLingua compression   → ./lingua
//   L13 LoRA hot-swap (infra)    → ./lora
//   L14 Setup Intelligence       → ./setup
//   L15 Ecosystem Awareness      → ./ecosystem
//   L16.1 Quality telemetry      → ./quality
//
// The full bandit/federated/hot-swap engines land in Waves 30–34. Everything
// here uses Node builtins only — no native deps — so the CLI bundle stays
// zero-runtime-deps and the engine never sits between the user and a model.

export const SYNTHESIS_VERSION = "0.1.0";

export const SYNTHESIS_LAYERS = [
  { id: "L12", name: "LLMLingua compression", status: "foundation" },
  { id: "L13", name: "LoRA hot-swap", status: "infra-only" },
  { id: "L14", name: "Setup Intelligence", status: "foundation" },
  { id: "L15", name: "Ecosystem Awareness", status: "foundation" },
  { id: "L16.1", name: "Prompt Quality telemetry", status: "schema+logger" },
] as const;

export function isSynthesisReady(): boolean {
  return SYNTHESIS_VERSION.length > 0;
}

// L12 — LLMLingua compression
export {
  compressPrompt,
  compressHeuristic,
  estimateTokens,
  llmlinguaAvailable,
  type CompressionOptions,
  type CompressionResult,
  type CompressionBackend,
} from "./lingua/compressor.ts";
export {
  planCompression,
  compressWithinBudget,
  loadBudgetConfig,
  DEFAULT_BUDGET,
  type BudgetConfig,
  type BudgetPlan,
  type ManagedCompression,
} from "./lingua/budget-controller.ts";

// Shared config / paths
export {
  mooterHome,
  mooterPath,
  readPreferences,
  readJsonSafe,
  writeJson,
  appendJsonl,
  type Preferences,
} from "./config.ts";

// L13 — LoRA hot-swap foundation (infra only)
export {
  loadRegistry,
  listAdapters,
  getAdapter,
  registerAdapter,
  removeAdapter,
  isMaterialised,
  DEFAULT_ADAPTERS,
  CURRENT_WAVE,
  type LoraAdapter,
  type AdapterRegistry,
} from "./lora/adapter-registry.ts";
export { loadAdapter, ollamaReachable, type LoadResult, type LoadReason } from "./lora/lora-loader.ts";
export { selectAdapterForTask, AUTO_SWAP_ENABLED, type RoutingFeatures } from "./lora/routing-stub.ts";
