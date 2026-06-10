// decisions.log → OTLP/HTTP JSON span converter (Wave Mega 50-51 Phase 1.A).
//
// Reads the tail of the router's decisions.log (JSON lines, written by the
// FROZEN tools/router/classify.js pipeline — we only READ it) and maps each
// routing decision to an OTLP span named "mooter.route".
//
// Honesty rules:
//   · attributes are only emitted when the underlying field actually exists
//     in the log entry — NEVER fabricated;
//   · cost/savings attributes require real token counts (tokens_in/tokens_out
//     > 0) or a recorded cost_usd; "classified" events carry neither, so most
//     spans have no cost attributes — that is correct, not a bug;
//   · no prompt contents are exported (prompt_preview is deliberately dropped).
//
// Pure node built-ins (fs, crypto) — zero dependencies, no SDK.

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// decisions.log location + raw parsing

export function defaultDecisionsLogPath(): string {
  const claudeDir = process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || join(homedir(), ".claude");
  return join(claudeDir, "tools", "router", "decisions.log");
}

export type RawDecision = Record<string, unknown>;

/** Events that represent a routing decision (other events — turn_end,
 *  option_a_miss, shadow_pair… — are bookkeeping, not routes). */
const ROUTE_EVENTS = new Set(["classified", "executed"]);

function isRoutingDecision(d: RawDecision): boolean {
  if (typeof d.tier !== "string") return false;
  if (typeof d.event === "string") return ROUTE_EVENTS.has(d.event);
  return true; // defensively accept tier-bearing lines with no event field
}

/** Last `n` routing decisions from the log. Missing file → []. Malformed
 *  lines are skipped silently (the log is shared with other writers). */
export function readDecisionsTail(path: string, n = 100): RawDecision[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const out: RawDecision[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const parsed = JSON.parse(t) as RawDecision;
      if (parsed && typeof parsed === "object" && isRoutingDecision(parsed)) out.push(parsed);
    } catch {
      /* skip malformed line */
    }
  }
  return out.slice(-Math.max(0, n));
}

// ---------------------------------------------------------------------------
// pricing (USD per million tokens, input/output) — same authoritative table
// the CLI already publishes in `mooter explain tiers` (src/commands/explain.ts).

const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  T0: { input: 0, output: 0 }, // local Ollama
  T1: { input: 1, output: 5 }, // Haiku 4.5
  T2: { input: 3, output: 15 }, // Sonnet 4.6
  T3: { input: 5, output: 25 }, // Opus 4.6/4.8
  T5: { input: 10, output: 50 }, // Fable 5 (opt-in only)
};

function tierCostUsd(tier: string, tokensIn: number, tokensOut: number): number | null {
  const p = PRICE_PER_MTOK[tier];
  if (!p) return null;
  return (tokensIn / 1e6) * p.input + (tokensOut / 1e6) * p.output;
}

// ---------------------------------------------------------------------------
// OTLP JSON shapes (subset we emit — matches OTLP/HTTP JSON encoding)

export interface OtlpAttribute {
  key: string;
  value: { stringValue: string } | { doubleValue: number } | { intValue: string } | { boolValue: boolean };
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
}

export interface OtlpPayload {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: Array<{
      scope: { name: string; version: string };
      spans: OtlpSpan[];
    }>;
  }>;
}

const str = (key: string, v: string): OtlpAttribute => ({ key, value: { stringValue: v } });
const dbl = (key: string, v: number): OtlpAttribute => ({ key, value: { doubleValue: v } });

function hexId(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function startNanos(d: RawDecision): number {
  if (typeof d.ts_ms === "number" && Number.isFinite(d.ts_ms)) return d.ts_ms * 1e6;
  if (typeof d.ts === "string") {
    const ms = Date.parse(d.ts);
    if (Number.isFinite(ms)) return ms * 1e6;
  }
  return 0; // no timestamp in the entry — exported as epoch 0, never invented
}

/** Map one routing decision to an OTLP span. */
export function decisionToSpan(d: RawDecision): OtlpSpan {
  const start = startNanos(d);
  const durMs = typeof d.duration_ms === "number" && Number.isFinite(d.duration_ms) && d.duration_ms > 0 ? d.duration_ms : 0;
  const end = start + durMs * 1e6;

  const attrs: OtlpAttribute[] = [];
  const tier = typeof d.tier === "string" ? d.tier : null;
  if (tier) attrs.push(str("mooter.tier", tier));

  const model =
    (typeof d.recommended_model === "string" && d.recommended_model) ||
    (typeof d.model_used === "string" && d.model_used) ||
    (typeof d.model === "string" && d.model) ||
    null;
  if (model) {
    attrs.push(str("mooter.model", model));
    // OpenLLMetry / OTel gen_ai semantic conventions
    attrs.push(str("gen_ai.request.model", model));
  }
  if (typeof d.recommended_backend === "string" && d.recommended_backend) {
    attrs.push(str("gen_ai.system", d.recommended_backend));
  }
  if (typeof d.confidence === "number" && Number.isFinite(d.confidence)) {
    attrs.push(dbl("mooter.confidence", d.confidence));
  }
  if (typeof d.event === "string") attrs.push(str("mooter.event", d.event));
  if (typeof d.task_category === "string") attrs.push(str("mooter.task_category", d.task_category));

  // Cost + savings — ONLY when the entry carries real numbers.
  const tokensIn = typeof d.tokens_in === "number" && Number.isFinite(d.tokens_in) ? d.tokens_in : null;
  const tokensOut = typeof d.tokens_out === "number" && Number.isFinite(d.tokens_out) ? d.tokens_out : null;
  const loggedCost = typeof d.cost_usd === "number" && Number.isFinite(d.cost_usd) ? d.cost_usd : null;
  const hasTokens = tokensIn !== null && tokensOut !== null && tokensIn + tokensOut > 0;

  if (hasTokens && tier) {
    const chosen = tierCostUsd(tier, tokensIn!, tokensOut!);
    const t3 = tierCostUsd("T3", tokensIn!, tokensOut!);
    if (chosen !== null) {
      attrs.push(dbl("mooter.cost_estimate_usd", loggedCost ?? chosen));
      if (t3 !== null) attrs.push(dbl("mooter.savings_vs_t3_usd", t3 - (loggedCost ?? chosen)));
    } else if (loggedCost !== null) {
      attrs.push(dbl("mooter.cost_estimate_usd", loggedCost));
    }
  } else if (loggedCost !== null && loggedCost > 0) {
    // a real recorded spend with no token breakdown — report it, no savings claim
    attrs.push(dbl("mooter.cost_estimate_usd", loggedCost));
  }
  // tokens absent → cost/savings attributes omitted entirely (never fabricated)

  return {
    traceId: hexId(16),
    spanId: hexId(8),
    name: "mooter.route",
    kind: 1, // SPAN_KIND_INTERNAL
    startTimeUnixNano: String(start),
    endTimeUnixNano: String(end),
    attributes: attrs,
  };
}

export function buildOtlpPayload(spans: OtlpSpan[], serviceName: string): OtlpPayload {
  return {
    resourceSpans: [
      {
        resource: { attributes: [str("service.name", serviceName)] },
        scopeSpans: [
          {
            scope: { name: "mooter.observability", version: "1" },
            spans,
          },
        ],
      },
    ],
  };
}
