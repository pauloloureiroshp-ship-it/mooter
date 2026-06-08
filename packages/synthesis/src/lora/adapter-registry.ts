// L13 — LoRA adapter catalog. Wave 29 foundation, Wave 31 (Pastor v2) per-task.
//
// This is the adapter *catalog*. Wave 29 shipped it infra-only (one seed adapter,
// no auto-swap). Wave 31 extends it with per-task metadata so the LORAUTER engine
// (routing-lorauter.ts) can deterministically match a task to an adapter, and
// registers the six canonical per-task adapter types. Nothing auto-swaps unless
// the user opts in (MOOTER_LORA_AUTOSWAP) — classify.js still owns the tier; a
// LoRA adapter only biases *within* the tier the classifier already chose.

import { existsSync } from "node:fs";
import { mooterPath, readJsonSafe, writeJson } from "../config.ts";

/** Wave that activates auto hot-swap. Anything above CURRENT_WAVE is registered but not swapped. */
export const CURRENT_WAVE = 31;

/** The six canonical per-task adapter types (Wave 31). "baseline" = no specialisation. */
export type TaskType =
  | "coding-frontend"
  | "coding-backend"
  | "coding-data"
  | "prose-pt-pt"
  | "prose-en"
  | "baseline";

export const TASK_ADAPTER_TYPES: TaskType[] = [
  "coding-frontend",
  "coding-backend",
  "coding-data",
  "prose-pt-pt",
  "prose-en",
  "baseline",
];

export interface LoraAdapter {
  name: string;
  base_model: string; // e.g. "qwen3:30b"
  path: string; // local adapter dir/file ("" if not materialised yet)
  task_tags: string[]; // ["pt-pt", "routing", "brevity"]
  trained_on: "user" | "global" | "none";
  description?: string;
  registered_at: string; // ISO
  wave_ready: number; // wave at which this adapter becomes auto-swappable

  // ── Wave 31 (Pastor v2) per-task metadata. All optional → backward compatible. ──
  task_type?: TaskType; // which canonical task class this adapter specialises in
  version?: string; // adapter manifest version (e.g. "1.0.0")
  training_data_hash?: string; // sha256 of the training corpus ("" until trained)
  /** Per-task-type benchmark scores 0..1 (e.g. { "coding-frontend": 0.82 }). */
  score_per_task_type?: Partial<Record<TaskType, number>>;
  /** Characteristic terms used by LORAUTER for cosine matching (deterministic, no LLM). */
  keyword_profile?: string[];
  /** Language affinity for prose adapters. "any" → no language gate. */
  lang_affinity?: "pt" | "en" | "any";
  /** File-extension signals that boost this adapter (e.g. [".tsx", ".css"]). */
  file_ext_affinity?: string[];
}

export interface AdapterRegistry {
  version: number;
  adapters: LoraAdapter[];
}

const REGISTERED_AT = "2026-06-07T00:00:00.000Z";

// Seed: the Wave 23 Pastor LoRA is *registered* but not materialised/trained
// (gate not met — see memory). It surfaces in `mooter lora list` with an empty
// path so the loader honestly reports no_path. Kept for backward compat.
const LEGACY_PASTOR: LoraAdapter = {
  name: "pastor-v1-default",
  base_model: "qwen3:30b",
  path: "",
  task_tags: ["routing", "doctrine", "pt-pt"],
  trained_on: "global",
  description: "Mooter Pastor routing adapter (Wave 23 carry). Superseded by the per-task set in Wave 31.",
  registered_at: REGISTERED_AT,
  wave_ready: 31,
  task_type: "baseline",
  version: "1.0.0",
};

/**
 * The six canonical per-task adapters (Wave 31). All registered, none materialised
 * yet (path "" → training is the user's overnight `train_lora.sh` job). The
 * keyword_profile / lang_affinity / file_ext_affinity drive LORAUTER's deterministic
 * cosine match — see routing-lorauter.ts.
 */
export const TASK_ADAPTERS: LoraAdapter[] = [
  {
    name: "pastor-frontend",
    base_model: "qwen2.5-coder:7b",
    path: "",
    task_tags: ["coding", "frontend", "ui"],
    trained_on: "global",
    description: "Front-end coding (React/CSS/components/layout).",
    registered_at: REGISTERED_AT,
    wave_ready: 31,
    task_type: "coding-frontend",
    version: "1.0.0",
    training_data_hash: "",
    score_per_task_type: { "coding-frontend": 0.82 },
    lang_affinity: "any",
    file_ext_affinity: [".tsx", ".jsx", ".css", ".scss", ".svg", ".vue", ".html"],
    keyword_profile: [
      "react", "component", "css", "tailwind", "ui", "button", "layout", "render",
      "hook", "dom", "animation", "frontend", "style", "flex", "grid", "modal",
      "página", "botão", "ecrã", "componente", "estilo",
    ],
  },
  {
    name: "pastor-backend",
    base_model: "qwen2.5-coder:7b",
    path: "",
    task_tags: ["coding", "backend", "api"],
    trained_on: "global",
    description: "Back-end coding (APIs/servers/auth/routes/workers).",
    registered_at: REGISTERED_AT,
    wave_ready: 31,
    task_type: "coding-backend",
    version: "1.0.0",
    training_data_hash: "",
    score_per_task_type: { "coding-backend": 0.8 },
    lang_affinity: "any",
    file_ext_affinity: [".ts", ".js", ".go", ".rs", ".java"],
    keyword_profile: [
      "api", "server", "endpoint", "route", "auth", "middleware", "handler",
      "request", "response", "worker", "backend", "service", "token", "session",
      "controller", "rota", "servidor", "autenticação",
    ],
  },
  {
    name: "pastor-data",
    base_model: "qwen2.5-coder:7b",
    path: "",
    task_tags: ["coding", "data", "analysis"],
    trained_on: "global",
    description: "Data work (SQL/ETL/dataframes/migrations/analysis).",
    registered_at: REGISTERED_AT,
    wave_ready: 31,
    task_type: "coding-data",
    version: "1.0.0",
    training_data_hash: "",
    score_per_task_type: { "coding-data": 0.78 },
    lang_affinity: "any",
    file_ext_affinity: [".sql", ".ipynb", ".csv", ".parquet", ".py"],
    keyword_profile: [
      "sql", "query", "dataframe", "pandas", "csv", "etl", "pipeline", "dataset",
      "migration", "schema", "aggregate", "transform", "numpy", "parquet", "table",
      "join", "índice", "consulta", "dados",
    ],
  },
  {
    name: "pastor-portuguese",
    base_model: "qwen3:30b",
    path: "",
    task_tags: ["prose", "pt-pt", "writing"],
    trained_on: "user",
    description: "PT-PT prose (writing/summaries/docs in Portuguese).",
    registered_at: REGISTERED_AT,
    wave_ready: 31,
    task_type: "prose-pt-pt",
    version: "1.0.0",
    training_data_hash: "",
    score_per_task_type: { "prose-pt-pt": 0.85 },
    lang_affinity: "pt",
    file_ext_affinity: [".md", ".txt"],
    keyword_profile: [
      "escreve", "texto", "resumo", "artigo", "redige", "explica", "português",
      "carta", "email", "documenta", "traduz", "frase", "parágrafo", "revê",
    ],
  },
  {
    name: "pastor-english",
    base_model: "qwen3:30b",
    path: "",
    task_tags: ["prose", "en", "writing"],
    trained_on: "global",
    description: "English prose (writing/summaries/docs/copy).",
    registered_at: REGISTERED_AT,
    wave_ready: 31,
    task_type: "prose-en",
    version: "1.0.0",
    training_data_hash: "",
    score_per_task_type: { "prose-en": 0.81 },
    lang_affinity: "en",
    file_ext_affinity: [".md", ".txt", ".mdx"],
    keyword_profile: [
      "write", "draft", "essay", "summary", "article", "blog", "document", "copy",
      "prose", "explain", "rewrite", "paragraph", "sentence", "edit", "proofread",
    ],
  },
  {
    name: "pastor-baseline",
    base_model: "qwen3:30b",
    path: "",
    task_tags: ["routing", "general"],
    trained_on: "none",
    description: "No specialisation — the safe fallback when no adapter matches.",
    registered_at: REGISTERED_AT,
    wave_ready: 31,
    task_type: "baseline",
    version: "1.0.0",
    training_data_hash: "",
    score_per_task_type: { baseline: 0.5 },
    lang_affinity: "any",
    file_ext_affinity: [],
    keyword_profile: [],
  },
];

// Legacy alias first so existing `some(name === "pastor-v1-default")` checks hold,
// then the six canonical per-task adapters.
export const DEFAULT_ADAPTERS: LoraAdapter[] = [LEGACY_PASTOR, ...TASK_ADAPTERS];

function registryPath(): string {
  return mooterPath("lora", "registry.json");
}

/** Read the registry, falling back to the seeded defaults when no file exists. */
export function loadRegistry(): AdapterRegistry {
  const onDisk = readJsonSafe<AdapterRegistry | null>(registryPath(), null);
  if (onDisk && Array.isArray(onDisk.adapters)) return onDisk;
  return { version: 1, adapters: [...DEFAULT_ADAPTERS] };
}

export function listAdapters(): LoraAdapter[] {
  return loadRegistry().adapters;
}

/** The per-task adapters (task_type set), in TASK_ADAPTER_TYPES order. Wave 31. */
export function listTaskAdapters(): LoraAdapter[] {
  const all = loadRegistry().adapters.filter((a) => a.task_type !== undefined);
  return all.sort(
    (a, b) =>
      TASK_ADAPTER_TYPES.indexOf(a.task_type as TaskType) -
      TASK_ADAPTER_TYPES.indexOf(b.task_type as TaskType),
  );
}

export function getAdapter(name: string): LoraAdapter | null {
  return loadRegistry().adapters.find((a) => a.name === name) ?? null;
}

/** First registered adapter whose task_type matches (Wave 31). */
export function getTaskAdapter(type: TaskType): LoraAdapter | null {
  return loadRegistry().adapters.find((a) => a.task_type === type) ?? null;
}

/** Upsert an adapter by name and persist the registry (seeds included). */
export function registerAdapter(adapter: LoraAdapter): AdapterRegistry {
  const reg = loadRegistry();
  const idx = reg.adapters.findIndex((a) => a.name === adapter.name);
  if (idx >= 0) reg.adapters[idx] = adapter;
  else reg.adapters.push(adapter);
  writeJson(registryPath(), reg);
  return reg;
}

export function removeAdapter(name: string): boolean {
  const reg = loadRegistry();
  const before = reg.adapters.length;
  reg.adapters = reg.adapters.filter((a) => a.name !== name);
  if (reg.adapters.length === before) return false;
  writeJson(registryPath(), reg);
  return true;
}

/** True when an adapter is materialised on disk (path set and exists). */
export function isMaterialised(adapter: LoraAdapter): boolean {
  return adapter.path.length > 0 && existsSync(adapter.path);
}
