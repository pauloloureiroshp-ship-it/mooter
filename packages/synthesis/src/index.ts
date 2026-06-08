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
  listTaskAdapters,
  getAdapter,
  getTaskAdapter,
  registerAdapter,
  removeAdapter,
  isMaterialised,
  DEFAULT_ADAPTERS,
  TASK_ADAPTERS,
  TASK_ADAPTER_TYPES,
  CURRENT_WAVE,
  type LoraAdapter,
  type AdapterRegistry,
  type TaskType,
} from "./lora/adapter-registry.ts";
export {
  loadAdapter,
  ollamaReachable,
  hotSwapAdapter,
  swappedModelTag,
  type LoadResult,
  type LoadReason,
  type SwapResult,
  type SwapReason,
  type SwapOptions,
} from "./lora/lora-loader.ts";
// Wave 31 — LORAUTER real per-task router (replaces routing-stub.ts).
export {
  selectAdapterForTask,
  routeAdapter,
  autoSwapEnabled,
  tokenize,
  cosineSimilarity,
  buildIdf,
  extractFileExts,
  detectLang,
  AUTO_SWAP_ENABLED,
  ROUTE_THRESHOLD,
  BASELINE_PRIOR,
  type RoutingFeatures,
  type RouteDecision,
  type AdapterScore,
} from "./lora/routing-lorauter.ts";

// Pastor v2 — per-task routing layer (Wave 31)
export {
  routeRequest,
  type ClassifyDecision,
  type RouteRequestInput,
  type RouteRequestResult,
} from "./pastor/per-task-router.ts";
export {
  loadPastorState,
  savePastorState,
  recordRoute,
  summarizePastor,
  pastorStatePath,
  emptyPastorState,
  type PastorState,
  type PastorSummary,
  type AdapterUsage,
} from "./pastor/pastor-state.ts";
export {
  loadFeedback,
  recordFeedback,
  adapterBias,
  applyFeedbackBias,
  feedbackStatePath,
  BIAS_MIN,
  BIAS_MAX,
  type FeedbackState,
} from "./pastor/feedback-incorporator.ts";
export {
  trainSpec,
  trainStatus,
  trainStatusPath,
  type TrainSpec,
  type TrainStatus,
  type TrainPhase,
} from "./pastor/adapter-trainer-stub.ts";

// Knowledge distillation — Pastor learnings → installable skill (Wave 31)
export {
  parseDecisions,
  extractPatterns,
  type ClassifiedEvent,
  type RoutingPattern,
  type DistilledPatterns,
} from "./distill/pattern-extractor.ts";
export { generateSkillMarkdown, type SkillMeta } from "./distill/markdown-generator.ts";
export { emitSkill, defaultDecisionsLog, type EmitOptions, type EmitResult } from "./distill/skill-emitter.ts";

// L14 — Setup Intelligence
export {
  detectSetup,
  collectRaw,
  buildProfile,
  saveProfile,
  loadProfile,
  classifyOs,
  deriveSubscriptionTier,
  type SetupProfile,
  type RawDetect,
  type OsClass,
  type SubscriptionTier,
} from "./setup/detect.ts";
export { explainSetup } from "./setup/explain.ts";
export { recommendForSetup, recommendationLines, type Recommendation } from "./setup/recommendations.ts";

// L15 — Ecosystem Awareness
export {
  loadCatalog,
  getCatalogItem,
  searchCatalog,
  type Catalog,
  type CatalogItem,
  type CatalogCategory,
  type CatalogCompatibility,
  type CatalogRoi,
} from "./ecosystem/catalog.ts";
export {
  recommend,
  compatibilityScore,
  roiValue,
  type RankedRecommendation,
  type RecommendOptions,
} from "./ecosystem/recommend.ts";
export {
  trackRoi,
  readRoiEntries,
  summariseRoi,
  getRoiSummary,
  type RoiEntry,
  type RoiSummary,
} from "./ecosystem/roi-tracker.ts";

// L16.1 — Prompt Quality decision telemetry
export {
  logDecision,
  readDecisions,
  aggregateStats,
  assertNoPromptContent,
  sanitizeRecord,
  DECISION_COLUMNS,
  FORBIDDEN_KEYS,
  type DecisionRecord,
  type DecisionStats,
} from "./quality/decision-logger.ts";
export { selectArm, BANDIT_ENABLED, type BanditContext, type BanditArm } from "./quality/bandit-stub.ts";
