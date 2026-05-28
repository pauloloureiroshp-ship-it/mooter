// parquet-write.ts — columnar output for DuckDB analytics (§13.5).
//
// Events are FLATTENED into wide columns (lineage_* essentials, judge dimensions,
// mis-routing flags). The full `response` text stays in the JSONL only — Parquet
// stays lean for `read_parquet()` aggregations. Uses @dsnp/parquetjs (pure JS).

import parquetjs from "@dsnp/parquetjs";
import type { BenchEvent } from "./types.ts";

// Minimal typing for the bits of @dsnp/parquetjs we use (no @types shipped).
interface ParquetWriterT {
  appendRow(row: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}
interface ParquetModule {
  ParquetSchema: new (def: Record<string, unknown>) => unknown;
  ParquetWriter: { openFile(schema: unknown, path: string): Promise<ParquetWriterT> };
}
const parquet = parquetjs as unknown as ParquetModule;

const U = { type: "UTF8" } as const;
const Uo = { type: "UTF8", optional: true } as const;
const I = { type: "INT64" } as const;
const Io = { type: "INT64", optional: true } as const;
const D = { type: "DOUBLE" } as const;
const Do = { type: "DOUBLE", optional: true } as const;
const Bo = { type: "BOOLEAN", optional: true } as const;

const EVENT_SCHEMA_DEF: Record<string, unknown> = {
  event_id: U, run_id: U, prompt_id: U, arm: U, block: U,
  expected_pack: U, expected_tier_floor: U, model_used: U,
  tier_routed: Uo, pack_routed: Uo, pack_confidence: Do,
  latency_classifier_ms: D, latency_llm_ms: D, latency_total_ms: D,
  tokens_input: I, tokens_output: I, tokens_total: I, cost_micros: I,
  correctness: Do, completeness: Io, relevance: Io, actionability: Io, hallucination: Io,
  quality_score: Do, judge_seed_position: Io,
  pack_correct: Bo, tier_appropriate: Bo, would_higher_tier_help: Bo,
  deterministic_ran: Bo, deterministic_passed: Bo, deterministic_kind: Uo,
  status: U, error: Uo, response_len: I,
  pastor_version: U, commit_sha: U, pricing_version: U, timestamp: U,
};

const undef = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

export function flattenEvent(ev: BenchEvent): Record<string, unknown> {
  const j = ev.judge_scores;
  const d = ev.deterministic;
  return {
    event_id: ev.event_id, run_id: ev.lineage.run_id, prompt_id: ev.prompt_id,
    arm: ev.arm, block: ev.block, expected_pack: ev.expected_pack,
    expected_tier_floor: ev.expected_tier_floor, model_used: ev.model_used,
    tier_routed: undef(ev.tier_routed), pack_routed: undef(ev.pack_routed),
    pack_confidence: undef(ev.pack_confidence),
    latency_classifier_ms: ev.latency_classifier_ms, latency_llm_ms: ev.latency_llm_ms,
    latency_total_ms: ev.latency_total_ms,
    tokens_input: ev.tokens_input, tokens_output: ev.tokens_output,
    tokens_total: ev.tokens_total, cost_micros: ev.cost_micros,
    correctness: undef(j ? j.correctness : null), completeness: undef(j ? j.completeness : null),
    relevance: undef(j ? j.relevance : null), actionability: undef(j ? j.actionability : null),
    hallucination: undef(j ? j.hallucination : null),
    quality_score: undef(ev.quality_score), judge_seed_position: undef(ev.judge_seed_position),
    pack_correct: undef(ev.pack_correct), tier_appropriate: undef(ev.tier_appropriate),
    would_higher_tier_help: undef(ev.would_higher_tier_help),
    deterministic_ran: undef(d ? d.ran : null), deterministic_passed: undef(d ? d.passed : null),
    deterministic_kind: undef(d ? d.kind : null),
    status: ev.status, error: undef(ev.error), response_len: ev.response.length,
    pastor_version: ev.lineage.pastor_version, commit_sha: ev.lineage.commit_sha,
    pricing_version: ev.lineage.pricing_version, timestamp: ev.timestamp,
  };
}

/** Write a flat-record table to a Parquet file with the given schema definition. */
export async function writeParquet(
  schemaDef: Record<string, unknown>,
  rows: Record<string, unknown>[],
  outPath: string,
): Promise<void> {
  const schema = new parquet.ParquetSchema(schemaDef);
  const writer = await parquet.ParquetWriter.openFile(schema, outPath);
  for (const row of rows) await writer.appendRow(row);
  await writer.close();
}

export async function writeEventsParquet(events: BenchEvent[], outPath: string): Promise<void> {
  await writeParquet(EVENT_SCHEMA_DEF, events.map(flattenEvent), outPath);
}

export { EVENT_SCHEMA_DEF };
