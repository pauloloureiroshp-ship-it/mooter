// Deterministic span/trace ids for routing decisions (Wave Mega 50-51 Phase 2.E).
//
// The SAME decisions.log entry must map to the SAME span id everywhere — in the
// OTLP converter (convert.ts) AND in the span-feedback loop (`mooter feedback
// span` / `mooter pastor learn-from-spans`) — so a user can score a span they
// saw in their collector and the Pastor can join that score back to the
// decision's features.
//
// spanId(entry) = first 16 hex chars of sha256("<ts_ms>|<session_id>|<prompt_len>|<tier>")
// Missing fields are serialized as "" (defensive: the log is shared with other
// writers and older entries may lack fields). Pure node:crypto — zero deps.

import { createHash } from "node:crypto";

export type SpanIdSource = Record<string, unknown>;

function field(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function decisionKey(entry: SpanIdSource): string {
  return `${field(entry.ts_ms)}|${field(entry.session_id)}|${field(entry.prompt_len)}|${field(entry.tier)}`;
}

/** Deterministic 16-hex-char span id for a decisions.log entry. */
export function spanId(entry: SpanIdSource): string {
  return createHash("sha256").update(decisionKey(entry)).digest("hex").slice(0, 16);
}

/** Deterministic 32-hex-char trace id for the same entry (distinct hash input
 *  so the trace id is not simply a prefix-extension of the span id). */
export function traceId(entry: SpanIdSource): string {
  return createHash("sha256").update(`trace|${decisionKey(entry)}`).digest("hex").slice(0, 32);
}
