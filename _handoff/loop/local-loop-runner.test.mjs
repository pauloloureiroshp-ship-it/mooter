// local-loop-runner.test.mjs — F0.5 gate. Hermetic: no live Ollama/GPU/Ledger.
// Run: node --test _handoff/loop/local-loop-runner.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runLoop, gateAction, bashIsDestructive, parseAction, pickModel,
  DESTRUCTIVE_BASH, TOOL_ALLOWLIST,
} from "./local-loop-runner.mjs";

// A scripted Ollama: returns the next canned response per turn. reason:'x' → failure.
function mockOllama(scripts) {
  const q = scripts.slice();
  return {
    calls: 0,
    async generate() {
      this.calls++;
      const s = q.shift();
      if (s == null) return { ok: false, reason: "script-exhausted" };
      if (typeof s === "object" && s.fail) return { ok: false, reason: s.fail };
      return { ok: true, text: typeof s === "string" ? s : JSON.stringify(s) };
    },
  };
}
function mockJournal() {
  const events = [];
  return { events, appendEvent(ev) { events.push(ev); return { ok: true, deduped: false }; } };
}
const J = (o) => JSON.stringify(o);

// ── Governor ──────────────────────────────────────────────────────────────
test("governor: bashIsDestructive matches the exact sdk-runner bank", () => {
  for (const cmd of ["git push origin main", "git merge main", "rm -rf x", "npm publish",
    "gh pr merge 1", "git push --force", "vercel deploy", "docker push img", "git reset --hard",
    "rm -fr build", "rm --recursive node_modules", "rm -f secret", "rm plainfile.txt"]) {  // flag-order + bare rm
    assert.equal(bashIsDestructive(cmd), true, `should deny: ${cmd}`);
  }
  for (const cmd of ["git status", "npm test", "ls -la", "git add file.js", "node --test"]) {
    assert.equal(bashIsDestructive(cmd), false, `should allow: ${cmd}`);
  }
  assert.equal(DESTRUCTIVE_BASH.length, 12);
});

test("governor: gateAction denies classify.js writes, off-allowlist tools, destructive bash", () => {
  assert.equal(gateAction({ tool: "run_shell", args: { command: "ls" } }).behavior, "allow");
  assert.equal(gateAction({ tool: "read_file", args: { path: "src/x.ts" } }).behavior, "allow");
  assert.equal(gateAction({ tool: "run_shell", args: { command: "git push" } }).behavior, "deny");
  assert.equal(gateAction({ tool: "write_file", args: {} }).behavior, "deny", "off-allowlist tool");
  // classify.js: WRITES frozen, READS harmless (faithful to sdk-runner semantics)
  assert.equal(gateAction({ tool: "run_shell", args: { command: "echo x > tools/router/classify.js" } }).behavior, "deny", "shell write to classify.js");
  assert.equal(gateAction({ tool: "run_shell", args: { command: "sed -i s/a/b/ tools/router/classify.js" } }).behavior, "deny", "sed -i on classify.js");
  assert.equal(gateAction({ tool: "run_shell", args: { command: "python -c \"open('tools/router/classify.js','w')\"" } }).behavior, "deny", "interpreter write to classify.js");
  assert.equal(gateAction({ tool: "run_shell", args: { command: "perl -i -pe s/a/b/ tools/router/classify.js" } }).behavior, "deny", "perl -i on classify.js");
  assert.equal(gateAction({ tool: "run_shell", args: { command: "cat tools/router/classify.js" } }).behavior, "allow", "reading classify.js is harmless");
  assert.equal(gateAction({ tool: "run_shell", args: { command: "grep foo tools/router/classify.js" } }).behavior, "allow", "grep-reading classify.js is harmless");
  assert.equal(gateAction({ tool: "read_file", args: { path: "tools/router/classify.js" } }).behavior, "allow", "reading classify.js is harmless");
  // compound-command bypasses of the classify.js read-allowlist — MUST be denied
  assert.equal(gateAction({ tool: "run_shell", args: { command: "cat tools/router/classify.js && echo pwn > tools/router/classify.js" } }).behavior, "deny", "chain write to classify.js");
  assert.equal(gateAction({ tool: "run_shell", args: { command: "head tools/router/classify.js; rm tools/router/classify.js" } }).behavior, "deny", "chained rm of classify.js");
  assert.equal(gateAction({ tool: "run_shell", args: { command: "grep x tools/router/classify.js | tee tools/router/classify.js" } }).behavior, "deny", "piped tee to classify.js");
  assert.equal(gateAction({ tool: "run_shell", args: { command: "cat $(echo tools/router/classify.js)" } }).behavior, "deny", "subshell referencing classify.js");
  assert.deepEqual(TOOL_ALLOWLIST, ["read_file", "run_shell", "note", "finish"]);
});

// ── Loop happy path ─────────────────────────────────────────────────────────
test("loop: runs plan→act→observe→finish, logs a kind:turn per step + kind:outcome", async () => {
  const journal = mockJournal();
  let shellRan = null;
  const ollama = mockOllama([
    J({ thought: "note the goal", tool: "note", args: { text: "start" }, done: false }),
    J({ thought: "list files", tool: "run_shell", args: { command: "ls" }, done: false }),
    J({ thought: "done", tool: "finish", args: { summary: "listed files" }, done: true }),
  ]);
  const tools = {
    note: (a, ctx) => { ctx.notes.push(a.text); return { ok: true, observation: "noted" }; },
    run_shell: (a) => { shellRan = a.command; return { ok: true, observation: "a.txt\nb.txt" }; },
  };
  const res = await runLoop({ task: "list files", sid: "t1", journal, ollama, tools, model: "qwen3:30b" });

  assert.equal(res.ok, true);
  assert.equal(res.reason, "done");
  assert.equal(res.result, "listed files");
  assert.equal(shellRan, "ls", "the reversible shell action actually executed");
  assert.equal(res.turns.length, 2, "note + run_shell recorded; finish is not a tool step");
  const kinds = journal.events.map((e) => e.kind);
  assert.deepEqual(kinds, ["turn", "turn", "turn", "outcome"]);
  assert.ok(journal.events.every((e) => e.sid === "t1" && e.agent === "local-loop-runner"));
});

// ── The gate hook: irreversible → STOP + kind:decision, no execution ─────────
test("loop: HALTS on an irreversible action and emits kind:decision — never executes it", async () => {
  const journal = mockJournal();
  let pushed = false;
  const ollama = mockOllama([
    J({ thought: "ship it", tool: "run_shell", args: { command: "git push origin main" }, done: false }),
  ]);
  const tools = { run_shell: () => { pushed = true; return { ok: true, observation: "pushed" }; } };
  const res = await runLoop({ task: "deploy", sid: "t2", journal, ollama, tools });

  assert.equal(res.reason, "gated-irreversible");
  assert.equal(pushed, false, "the destructive command must NOT run");
  assert.match(res.pendingDecision.reason, /destructive|irreversible/);
  const decision = journal.events.find((e) => e.kind === "decision");
  assert.ok(decision, "a kind:decision event is emitted for the human");
  assert.equal(decision.gate, "irreversible");
  assert.equal(decision.output.answered_by, "pending-human");
});

test("loop: HALTS when the model tries to WRITE classify.js via shell — never executes it", async () => {
  const journal = mockJournal();
  let ran = false;
  const ollama = mockOllama([J({ tool: "run_shell", args: { command: "printf x >> tools/router/classify.js" }, done: false })]);
  const res = await runLoop({ task: "tamper", sid: "t3", journal, ollama, tools: { run_shell: () => { ran = true; return { observation: "!" }; } } });
  assert.equal(res.reason, "gated-irreversible");
  assert.equal(ran, false, "the classify.js write must NOT run");
  assert.match(res.pendingDecision.reason, /classify\.js is FROZEN/);
});

// ── Honesty: Ollama down → no fabrication ───────────────────────────────────
test("loop: Ollama unavailable → ok:false with an honest reason, no fabricated result", async () => {
  const journal = mockJournal();
  const ollama = mockOllama([{ fail: "ollama-unavailable" }]);
  const res = await runLoop({ task: "x", sid: "t4", journal, ollama, tools: {} });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "ollama-unavailable");
  assert.equal(res.result, undefined);
  assert.equal(journal.events.length, 0, "nothing logged when the brain never answered");
});

// ── Resilience: invalid JSON is recovered from, not fatal ────────────────────
test("loop: invalid JSON from the model is skipped, loop recovers and finishes", async () => {
  const journal = mockJournal();
  const ollama = mockOllama([
    "sorry I can't do that",                                   // unparseable
    J({ tool: "finish", args: { summary: "ok" }, done: true }),
  ]);
  const res = await runLoop({ task: "x", sid: "t5", journal, ollama, tools: {} });
  assert.equal(res.reason, "done");
  assert.equal(ollama.calls, 2, "asked again after the invalid turn");
});

// ── Bounds: maxTurns is a hard cap ──────────────────────────────────────────
test("loop: honors maxTurns as a hard stop", async () => {
  const journal = mockJournal();
  const never = J({ tool: "note", args: { text: "again" }, done: false });
  const ollama = mockOllama(Array(20).fill(never));
  const res = await runLoop({ task: "x", sid: "t6", journal, ollama, tools: { note: (a, c) => { c.notes.push(a.text); return { observation: "noted" }; } }, maxTurns: 3 });
  assert.equal(res.reason, "max-turns");
  assert.equal(res.turns.length, 3);
});

// ── Bounds: timeout via injected clock ──────────────────────────────────────
test("loop: honors timeout via injected clock", async () => {
  const journal = mockJournal();
  let t = 0;
  const now = () => (t += 10_000);   // each read jumps 10s
  const ollama = mockOllama(Array(20).fill(J({ tool: "note", args: { text: "x" }, done: false })));
  const res = await runLoop({ task: "x", sid: "t7", journal, ollama, now, timeoutMs: 15_000, tools: { note: () => ({ observation: "ok" }) } });
  assert.equal(res.reason, "timeout");
});

// ── Pure helpers ────────────────────────────────────────────────────────────
test("parseAction: clean JSON, prose-wrapped JSON, and garbage", () => {
  assert.equal(parseAction(J({ tool: "note", args: {}, done: false })).tool, "note");
  assert.equal(parseAction('Here you go: {"tool":"finish","args":{"summary":"s"},"done":true} !').tool, "finish");
  assert.equal(parseAction("no json here"), null);
  assert.equal(parseAction(""), null);
});

test("pickModel: prefers qwen, honest null when empty", () => {
  assert.equal(pickModel(["llama3:8b", "qwen2.5-coder:14b"]), "qwen2.5-coder:14b");
  assert.equal(pickModel(["mistral:7b"]), "mistral:7b");
  assert.equal(pickModel([]), null);
});
