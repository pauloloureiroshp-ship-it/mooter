import { test } from "node:test";
import assert from "node:assert/strict";
import { composeCouncil, DEFAULT_ROSTER, type RosterEntry } from "../src/compose.ts";
import type { CasResult } from "../src/cas.ts";

const decideStub: any = () => ({
  chosen_model: "qwen3-30b",
  reason: "stub",
  tes: null,
  alternatives: [],
  cited_source: null,
  coverage_note: "stub",
});

const cas = (score: number): CasResult => ({ score, reasons: [], convene: true, threshold: 0.5 });

function families(seatIds: string[], roster: RosterEntry[] = DEFAULT_ROSTER): string[] {
  return seatIds.map((id) => roster.find((e) => e.id === id)?.family ?? "?");
}

test("compose: no cloud key → all-local, odd seats, ≥1 local, deterministic judge", () => {
  const c = composeCouncil("coding.security", cas(0.6), { maxCostUsd: 1 }, {
    hasCloudKey: false,
    decide: decideStub,
  });
  assert.ok(c.seats.length % 2 === 1, "odd seat count");
  assert.ok(c.seats.length >= 1);
  assert.ok(c.seats.every((s) => s.kind === "local"), "all seats local");
  assert.equal(c.judge, null, "deterministic judge");
  assert.equal(c.estCostUsd, 0, "all-local costs nothing");
  const fams = families(c.seats.map((s) => s.id));
  assert.equal(new Set(fams).size, fams.length, "distinct families");
});

test("compose: cloud key + budget → includes a cloud (anthropic) seat + Opus judge", () => {
  const c = composeCouncil("coding.security", cas(0.6), { maxCostUsd: 1 }, {
    hasCloudKey: true,
    decide: decideStub,
  });
  assert.ok(c.seats.some((s) => s.kind === "cloud"), "has a cloud seat");
  assert.ok(c.seats.some((s) => s.kind === "local"), "still ≥1 local");
  assert.equal(c.judge?.id, "claude-opus-4-8");
  assert.ok(c.seats.length % 2 === 1);
});

test("compose: judge is never one of the seats", () => {
  const c = composeCouncil("coding.security", cas(0.6), { maxCostUsd: 1 }, {
    hasCloudKey: true,
    decide: decideStub,
  });
  if (c.judge) assert.ok(!c.seats.some((s) => s.id === c.judge!.id));
});

test("compose: localOnly forces all-local even with key+budget", () => {
  const c = composeCouncil("coding.security", cas(0.6), { maxCostUsd: 5 }, {
    hasCloudKey: true,
    localOnly: true,
    decide: decideStub,
  });
  assert.ok(c.seats.every((s) => s.kind === "local"));
  assert.equal(c.judge, null);
  assert.match(c.note, /local-only/);
});

test("compose: zero budget → all-local", () => {
  const c = composeCouncil("coding.security", cas(0.6), { maxCostUsd: 0 }, {
    hasCloudKey: true,
    decide: decideStub,
  });
  assert.ok(c.seats.every((s) => s.kind === "local"));
});

test("compose: Fable is never auto-seated", () => {
  const roster: RosterEntry[] = [
    { id: "qwen3:30b", family: "qwen", tier: "T0", kind: "local", estCostUsd: 0 },
    { id: "gemma3:12b", family: "gemma", tier: "T0", kind: "local", estCostUsd: 0 },
    { id: "claude-fable-5", family: "anthropic-fable", tier: "T3", kind: "cloud", estCostUsd: 0.1 },
  ];
  const c = composeCouncil("reasoning.math", cas(0.6), { maxCostUsd: 5 }, {
    hasCloudKey: true,
    roster,
    decide: decideStub,
  });
  assert.ok(!c.seats.some((s) => /fable/i.test(s.id)), "no fable seat");
  assert.match(c.note, /excluded Fable/);
});

test("compose: high CAS wants 5 but caps to distinct families (note explains), stays odd", () => {
  const c = composeCouncil("coding.refactor", cas(0.9), { maxCostUsd: 1 }, {
    hasCloudKey: false,
    decide: decideStub,
  });
  assert.ok(c.seats.length % 2 === 1);
  // default roster has 3 distinct local families (qwen/gemma/deepseek) when no cloud
  assert.equal(c.seats.length, 3);
  assert.match(c.note, /wanted 5 seats/);
});

test("compose: throws if roster has no local seat (≥1 local invariant)", () => {
  const roster: RosterEntry[] = [
    { id: "claude-haiku-4-5-20251001", family: "anthropic", tier: "T1", kind: "cloud", estCostUsd: 0.02 },
  ];
  assert.throws(
    () => composeCouncil("coding.backend", cas(0.6), { maxCostUsd: 1 }, { hasCloudKey: true, roster, decide: decideStub }),
    /no local seat/,
  );
});
