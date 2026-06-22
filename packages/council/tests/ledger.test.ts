import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLedger, writeLastCouncilState, readLastCouncilState, recordCouncil } from "../src/ledger.ts";
import { buildTelemetryRecord } from "../src/telemetry.ts";
import type { CouncilVerdict } from "../src/types.ts";

function tmpHome(): string {
  return mkdtempSync(join(tmpdir(), "council-vault-"));
}
function v(partial: Partial<CouncilVerdict> = {}): CouncilVerdict {
  return {
    recommendation: "r",
    confidence: 0.9,
    consensus: [],
    dissent: [],
    uniqueFindings: [],
    minorityReport: [],
    seats: ["a", "b", "c"],
    winnerSeatId: "a",
    judge: null,
    rounds: 1,
    costUsd: 0,
    latencyMs: 1200,
    modelCalls: 9,
    stable: false,
    convergence: "CONFIRMED",
    voteScore: 0.9,
    coverageNote: "all-local",
    ...partial,
  };
}

test("appendLedger writes JSONL and appends across calls", () => {
  const home = tmpHome();
  const rec = buildTelemetryRecord(v(), { category: "coding.infra", localOnly: true });
  appendLedger(rec, { home });
  const file = appendLedger(rec, { home });
  const lines = readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).category, "coding.infra");
});

test("writeLastCouncilState + readLastCouncilState roundtrip with computed savedPct", () => {
  const home = tmpHome();
  writeLastCouncilState(v({ costUsd: 0, modelCalls: 10 }), { category: "reasoning.math" }, { home });
  const s = readLastCouncilState({ home });
  assert.ok(s);
  assert.equal(s!.category, "reasoning.math");
  assert.equal(s!.savedPct, 100); // $0 vs estimated all-Opus baseline
  assert.equal(s!.convergence, "CONFIRMED");
});

test("readLastCouncilState returns null when absent", () => {
  assert.equal(readLastCouncilState({ home: tmpHome() }), null);
});

test("recordCouncil writes ledger + state in one call", () => {
  const home = tmpHome();
  const { record, ledgerPath, statePath } = recordCouncil(v(), { category: "coding.debug", localOnly: true }, { home });
  assert.equal(record.category, "coding.debug");
  assert.ok(readFileSync(ledgerPath, "utf8").includes("coding.debug"));
  assert.ok(readFileSync(statePath, "utf8").includes("savedPct"));
});
