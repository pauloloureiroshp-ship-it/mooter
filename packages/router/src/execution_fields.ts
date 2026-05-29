// execution_fields.ts — fill the execution half of a MooterEvent (Wave 2 Day 6).
//
// Day 4 wrote routing-only events (execution fields all null) at hook time.
// Day 6 supplies the post-call logic: given the draft event captured before the
// LLM call and the response (tokens/model/latency/error) observed after it,
// `applyExecutionFields` returns the completed event.
//
// Why a pure function, not an in-hook side effect: the UserPromptSubmit hook
// (inject_context.ts) runs BEFORE the model call, so it cannot see usage. The
// trigger that feeds a response back lives in the harness Stop/post-call path,
// which is not yet plumbed in this repo (it lands when Claude Code exposes turn
// usage to a Stop hook). Shipping the capture as a pure, fully-tested function
// means the wire is a one-liner the day that hook exists — and the contract
// (integer microUSD, graceful unknown-model, positive latency) is locked now.
//
// Invariants (enforced by execution-fields.test.ts):
//   - cost_micros is INTEGER microUSD (cost.ts, §13.3) — never a float.
//   - latency_ms_total >= 0; latency_ms_per_tok null unless tokens_out > 0.
//   - an error response zeroes tokens/cost and populates error_type.
//   - unknown model → cost_micros 0, no throw.
//   - does NOT mutate the input draft (returns a new object).

import { computeCostMicros, providerForModel } from "./cost.ts";
import type { MooterEvent, Provider } from "./mooter_event.ts";

/** Token usage as reported by the Anthropic / provider response. */
export interface ResponseUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}

/** The post-call observation the harness hands us at turn end. */
export interface LlmResponseObservation {
  model: string; // model_actual that served the turn
  usage?: ResponseUsage;
  latency_ms_total: number;
  latency_ms_ttft?: number | null;
  retries?: number;
  error?: { type?: string } | null;
}

const nonNegInt = (n: number | undefined | null): number => {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
};

/**
 * Return a copy of `draft` with the execution fields filled from `obs`. The
 * routing/envelope/quality fields are passed through untouched.
 */
export function applyExecutionFields(
  draft: MooterEvent,
  obs: LlmResponseObservation,
): MooterEvent {
  const errored = !!obs.error && !!obs.error.type;

  // On error the turn produced no useful completion — zero tokens & cost so a
  // failed call never inflates spend. ttft/per-tok stay null.
  const tokensIn = errored ? 0 : nonNegInt(obs.usage?.input_tokens);
  const tokensOut = errored ? 0 : nonNegInt(obs.usage?.output_tokens);
  const tokensCacheHit = errored ? 0 : nonNegInt(obs.usage?.cache_read_input_tokens);

  const costMicros = errored ? 0 : computeCostMicros(obs.model, tokensIn, tokensOut);

  const latencyTotal = nonNegInt(obs.latency_ms_total);
  const latencyTtft =
    typeof obs.latency_ms_ttft === "number" && Number.isFinite(obs.latency_ms_ttft)
      ? Math.max(0, Math.round(obs.latency_ms_ttft))
      : null;
  // per-token latency only meaningful once we have output tokens + a total.
  const latencyPerTok =
    tokensOut > 0 && latencyTotal > 0 ? Math.round(latencyTotal / tokensOut) : null;

  const provider: Provider | null = providerForModel(obs.model);

  return {
    ...draft,
    model_actual: obs.model,
    provider,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    tokens_cache_hit: tokensCacheHit,
    cost_micros: costMicros,
    latency_ms_total: latencyTotal,
    latency_ms_ttft: latencyTtft,
    latency_ms_per_tok: latencyPerTok,
    error_type: errored ? obs.error?.type ?? "unknown" : null,
    retries: nonNegInt(obs.retries),
  };
}
