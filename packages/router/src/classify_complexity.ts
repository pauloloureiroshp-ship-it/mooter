// classify_complexity() — axis 1 of two-axis routing (Pastor Wave 1, Day 4).
//
// Axis 1 (complexity → tier) is OWNED by the canonical regex classifier at
// tools/router/classify.js (~47KB, battle-tested, CommonJS). This module does
// NOT re-implement it — it is a thin async wrapper so the hook can call
// classifyComplexity() and classifyDomain() side by side via Promise.all.
//
// Backward-compat (PASTOR §10.4 / Principle P18): the <router-hint> emitted by
// the hook reflects exactly this decision, identical to the frugal hook. We
// reuse the canonical classifier rather than fork it.
//
// Constraint (Day 4): regex-only. classify.js itself is pure regex — the Haiku
// arbiter and Ollama Option-A live in inject_context.js (frugal), NOT here, so
// calling classify() touches no network/LLM. See ADR 015 + 016.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// packages/router/src/classify_complexity.ts -> <repo>/tools/router/classify.js
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const CLASSIFY_JS = join(here, "..", "..", "..", "tools", "router", "classify.js");

/** The fields of classify.js's decision we surface in the <router-hint>. */
export interface ComplexityClassification {
  tier: string; // T0..T3
  task_category: string;
  risk_level: string;
  recommended_backend: string;
  recommended_model: string;
  suggested_subagent: string;
  confidence: number;
  escalation_rule: string;
  reason: string;
}

type ClassifyFn = (prompt: string) => Record<string, unknown>;

/** Lazily resolve classify.js once (module cache keeps it warm thereafter). */
let _classify: ClassifyFn | null = null;
function loadClassifier(): ClassifyFn | null {
  if (_classify) return _classify;
  try {
    const mod = require(CLASSIFY_JS) as {
      classifyWithRetry?: ClassifyFn;
      classify?: ClassifyFn;
    };
    _classify = mod.classifyWithRetry ?? mod.classify ?? null;
  } catch {
    _classify = null; // graceful: hook falls back to a no-op router-hint
  }
  return _classify;
}

const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);

/**
 * Classify a prompt's complexity (axis 1) by delegating to the canonical
 * regex classifier. Async by signature only — the work is synchronous regex —
 * so it composes cleanly inside Promise.all alongside the (also-sync) domain
 * classifier. Never throws: on any failure returns a low-confidence T2 default
 * so the hook degrades to "router-hint, no pack" rather than crashing.
 */
export async function classifyComplexity(
  prompt: string,
): Promise<ComplexityClassification> {
  const classify = loadClassifier();
  if (!classify) {
    return {
      tier: "T2",
      task_category: "unknown",
      risk_level: "unknown",
      recommended_backend: "claude_subagent",
      recommended_model: "claude-sonnet-4-6",
      suggested_subagent: "model-reasoner",
      confidence: 0,
      escalation_rule: "classifier_unavailable",
      reason: "classify.js unavailable — defaulting to T2",
    };
  }

  const d = classify(prompt);
  return {
    tier: str(d.tier, "T2"),
    task_category: str(d.task_category, "unknown"),
    risk_level: str(d.risk_level, "unknown"),
    recommended_backend: str(d.recommended_backend, "claude_subagent"),
    recommended_model: str(d.recommended_model, "claude-sonnet-4-6"),
    suggested_subagent: str(d.suggested_subagent, "model-reasoner"),
    confidence: num(d.confidence, 0),
    escalation_rule: str(d.escalation_rule, "none"),
    reason: str(d.reasoning, ""),
  };
}
