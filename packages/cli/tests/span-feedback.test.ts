// Wave Mega 50-51 Phase 2.E — span feedback loop (local-only scoring +
// learn-from-spans join) and the why-not-fable honesty command.
// HOME-isolated like tests/observability.test.ts; zero network anywhere.
import { test } from "node:test";
import assert from "node:assert";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { spanId, traceId } from "../src/observability/span-id.ts";
import { decisionToSpan, readDecisionsTail } from "../src/observability/convert.ts";
import {
  runFeedbackSpan,
  runFeedbackSpans,
  readSpanFeedback,
  learnFromSpans,
  spanFeedbackPath,
  spanTrainingPath,
} from "../src/commands/span-feedback.ts";
import { runWhyNotFable } from "../src/commands/why-not-fable.ts";

function withHome<T>(fn: (home: string) => T): T {
  const prev = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "mooter-spanfb-"));
  process.env.HOME = home;
  try {
    return fn(home);
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
  }
}

function tmpLog(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "mooter-spanfb-log-"));
  const path = join(dir, "decisions.log");
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
  return path;
}

const ENTRY = {
  ts: "2026-06-09T23:57:53.283Z",
  ts_ms: 1781049473284,
  event: "classified",
  session_id: "s-test",
  prompt_len: 54,
  prompt_preview: "SECRET PROMPT TEXT MUST NOT LEAK",
  tier: "T2",
  task_category: "bug_investigation",
  recommended_backend: "claude_subagent",
  recommended_model: "claude-sonnet-4-6",
  confidence: 0.85,
};

// ---------------------------------------------------------------------------
// span id determinism + converter consistency

test("spanId is deterministic: same entry → same 16-hex id; tier change → different id", () => {
  const a = spanId(ENTRY);
  const b = spanId({ ...ENTRY });
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, spanId({ ...ENTRY, tier: "T3" }));
  // defensive: missing fields hash as "" instead of throwing
  assert.match(spanId({}), /^[0-9a-f]{16}$/);
});

test("OTLP converter uses the SAME deterministic span/trace ids as the feedback path", () => {
  const [d] = readDecisionsTail(tmpLog([JSON.stringify(ENTRY)]), 10);
  const span = decisionToSpan(d);
  assert.strictEqual(span.spanId, spanId(ENTRY));
  assert.strictEqual(span.traceId, traceId(ENTRY));
  // converting twice yields identical ids (same decision → same id everywhere)
  assert.strictEqual(decisionToSpan(d).spanId, span.spanId);
});

// ---------------------------------------------------------------------------
// `mooter feedback span` — score write/read roundtrip + guards

test("feedback span writes a score locally and reads it back (roundtrip, no network)", () => {
  withHome((home) => {
    const id = spanId(ENTRY);
    const r = runFeedbackSpan({ spanIdArg: id, scoreArg: "4", note: "good route", home });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /local only/);

    const rows = readSpanFeedback(home);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].span_id, id);
    assert.strictEqual(rows[0].score, 4);
    assert.strictEqual(rows[0].note, "good route");
    assert.match(rows[0].ts, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test("feedback span rejects a note containing an email (PII) and writes nothing", () => {
  withHome((home) => {
    const r = runFeedbackSpan({ spanIdArg: spanId(ENTRY), scoreArg: "5", note: "ping me at paulo@example.com", home });
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /email/);
    assert.strictEqual(existsSync(spanFeedbackPath(home)), false);
  });
});

test("feedback span rejects out-of-range or non-integer scores and malformed span ids", () => {
  withHome((home) => {
    for (const bad of ["0", "6", "3.5", "abc"]) {
      const r = runFeedbackSpan({ spanIdArg: spanId(ENTRY), scoreArg: bad, home });
      assert.strictEqual(r.exitCode, 1, `score "${bad}" must be rejected`);
      assert.match(r.output, /1-5/);
    }
    const r = runFeedbackSpan({ spanIdArg: "not-a-span-id", scoreArg: "3", home });
    assert.strictEqual(r.exitCode, 1);
    assert.match(r.output, /16 hex/);
    assert.strictEqual(existsSync(spanFeedbackPath(home)), false);
  });
});

// ---------------------------------------------------------------------------
// `mooter feedback spans` — discovery list

test("feedback spans lists recent decisions with their deterministic span ids", () => {
  const log = tmpLog([JSON.stringify(ENTRY), JSON.stringify({ ...ENTRY, ts_ms: 1781049473999, tier: "T0" })]);
  const r = runFeedbackSpans({ decisionsLog: log });
  assert.strictEqual(r.exitCode, 0);
  assert.ok(r.output.includes(spanId(ENTRY)));
  assert.ok(r.output.includes(spanId({ ...ENTRY, ts_ms: 1781049473999, tier: "T0" })));
  assert.match(r.output, /mooter feedback span <span_id>/);
});

test("feedback spans on an empty/missing log prints an honest empty state", () => {
  const missing = join(mkdtempSync(join(tmpdir(), "mooter-spanfb-none-")), "decisions.log");
  const r = runFeedbackSpans({ decisionsLog: missing });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /no routing decisions found/);
});

// ---------------------------------------------------------------------------
// `mooter pastor learn-from-spans` — features-only join + orphan handling

test("learn-from-spans joins scores with decisions by span_id — features only, no prompt text", () => {
  withHome((home) => {
    const log = tmpLog([JSON.stringify(ENTRY)]);
    const id = spanId(ENTRY);
    runFeedbackSpan({ spanIdArg: id, scoreArg: "5", home });
    runFeedbackSpan({ spanIdArg: "deadbeefdeadbeef", scoreArg: "1", home }); // orphan — not in the log

    const r = learnFromSpans({ home, decisionsLog: log });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /joined:\s+1 /);
    assert.match(r.output, /orphaned:\s+1 /);
    assert.match(r.output, /no Pastor adapter\/LoRA state was modified/);

    const raw = readFileSync(spanTrainingPath(home), "utf8");
    const rows = raw.trim().split("\n").map((l) => JSON.parse(l));
    assert.strictEqual(rows.length, 1); // orphan excluded from training rows
    assert.deepStrictEqual(rows[0], {
      span_id: id,
      task_category: "bug_investigation",
      tier: "T2",
      model: "claude-sonnet-4-6",
      confidence: 0.85,
      prompt_len: 54,
      score: 5,
      ts: rows[0].ts,
    });
    // privacy: the prompt preview must never reach the training file
    assert.ok(!raw.includes("SECRET PROMPT TEXT"));
  });
});

test("learn-from-spans with zero recorded feedback is an honest no-op", () => {
  withHome((home) => {
    const r = learnFromSpans({ home, decisionsLog: tmpLog([JSON.stringify(ENTRY)]) });
    assert.strictEqual(r.exitCode, 0);
    assert.match(r.output, /no span feedback recorded yet/);
    assert.strictEqual(existsSync(spanTrainingPath(home)), false);
  });
});

// ---------------------------------------------------------------------------
// `mooter why-not-fable`

test("why-not-fable prints honest empty state when no decisions are logged", () => {
  const missing = join(mkdtempSync(join(tmpdir(), "mooter-wnf-none-")), "decisions.log");
  const r = runWhyNotFable([], { decisionsLog: missing });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /no routing decisions logged yet/);
  assert.match(r.output, /@fable opt-in only/);
});

test("why-not-fable explains the most recent decision: tier, confidence, Fable $10/$50 vs chosen, doctrine", () => {
  const log = tmpLog([
    JSON.stringify({ ...ENTRY, ts_ms: 1, ts: "2026-06-09T00:00:01.000Z", tier: "T1", recommended_model: "claude-haiku-4-5" }),
    JSON.stringify(ENTRY), // most recent
  ]);
  const r = runWhyNotFable([], { decisionsLog: log });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /last 1 routing decision/);
  assert.match(r.output, /routed T2 \(claude-sonnet-4-6\) · confidence 0\.85/);
  assert.match(r.output, /Fable 5 is \$10\/\$50 per Mtok vs T2 at \$3\/\$15 per Mtok/);
  assert.match(r.output, /never auto-routed/);
  assert.match(r.output, /Free on Claude Max until 2026-06-22, then usage credits/);

  // --last 2 covers both, most recent first
  const r2 = runWhyNotFable(["--last", "2"], { decisionsLog: log });
  assert.match(r2.output, /last 2 routing decision/);
  assert.ok(r2.output.indexOf("T2") < r2.output.indexOf("T1"));
});
