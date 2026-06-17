// matrix-roster.ts — the single source of the specialization roster inside the
// landing app. Consumed by BOTH the admin matrix route and the public
// /api/rankings route so the 17×24 grid is described in exactly one place here.
//
// ── Why a mirror instead of a direct import of the engine const ──────────────
// The CANONICAL roster lives in the (frozen, sha-gated) router engine:
//   packages/router/src/specialization-matrix.ts → MATRIX_MODELS    (17)
//   packages/router/src/task-categories.ts       → TASK_CATEGORIES  (24)
// Next's bundler cannot pull those sibling-package modules into the landing
// build graph: they use explicit `.ts` import specifiers and drag in
// benchmark-fetcher (node:fs), and there is no `transpilePackages` wiring. So we
// mirror the two PURE string arrays here and GUARD them against the engine with a
// lockstep test (matrix-roster.test.ts) that imports the engine consts and fails
// CI the instant either roster drifts. One source of truth, enforced by CI — not
// by a second hand-maintained copy that silently rots.
//
// Roster (Wave 58 + 58.4): 17 models. Order is lockstep with MATRIX_MODELS.
export const MATRIX_MODELS = [
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-fable-5',
  'gpt-5',
  'gpt-5-3-codex',
  'gpt-oss',
  'gemini-3.1-pro',
  'gemini-3-flash',
  'deepseek-v3.2',
  'deepseek-v4-pro',
  'minimax',
  'kimi-k2.6',
  'qwen3.6',
  'qwen3-30b',
] as const;

// 24 categories — order is lockstep with TASK_CATEGORIES (coding → reasoning →
// writing → agents → context).
export const MATRIX_CATEGORIES = [
  'coding.frontend',
  'coding.backend',
  'coding.data',
  'coding.infra',
  'coding.security',
  'coding.competitive',
  'coding.refactor',
  'coding.test',
  'coding.debug',
  'reasoning.math',
  'reasoning.science',
  'reasoning.general',
  'reasoning.agentic',
  'writing.prose-pt-pt',
  'writing.prose-en',
  'writing.structured',
  'writing.translation',
  'agents.coordinator',
  'agents.implementor',
  'agents.reviewer',
  'context.large',
  'context.small',
  'context.multimodal',
  'context.audio',
] as const;

export type MatrixModel = (typeof MATRIX_MODELS)[number];
export type MatrixCategory = (typeof MATRIX_CATEGORIES)[number];
