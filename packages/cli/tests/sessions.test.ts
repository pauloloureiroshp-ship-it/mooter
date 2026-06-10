// Wave 33 (A.6) — `mooter sessions list`. Builds an isolated fake ~ with a
// project transcript dir + a decisions.log so no real session data is touched.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSessions, encodeProjectDir } from "../src/commands/sessions.ts";

function fixture(): { home: string; cwd: string } {
  const home = mkdtempSync(join(tmpdir(), "mooter-sess-"));
  const cwd = "/work/myproject";
  const projDir = join(home, ".claude", "projects", encodeProjectDir(cwd));
  mkdirSync(projDir, { recursive: true });
  const sid = "11111111-1111-1111-1111-111111111111";
  // Two real user prompts + one tool_result continuation (must NOT be counted).
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: "first prompt" } }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: "ok" } }),
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "x" }] } }),
    JSON.stringify({ type: "user", message: { role: "user", content: "second prompt" } }),
  ].join("\n");
  writeFileSync(join(projDir, `${sid}.jsonl`), lines);

  // decisions.log: 1×T0, 2×T2, 1×T3 for this session.
  const routerDir = join(home, ".claude", "tools", "router");
  mkdirSync(routerDir, { recursive: true });
  const dec = [
    { event: "classified", session_id: sid, tier: "T0" },
    { event: "classified", session_id: sid, tier: "T2" },
    { event: "classified", session_id: sid, tier: "T2" },
    { event: "classified", session_id: sid, tier: "T3" },
    { event: "stop", session_id: sid }, // no tier → ignored
  ].map((o) => JSON.stringify(o)).join("\n");
  writeFileSync(join(routerDir, "decisions.log"), dec);

  return { home, cwd };
}

test("sessions list shows the session with prompt count and tier breakdown", () => {
  const { home, cwd } = fixture();
  const r = runSessions(["list"], { home, cwd, now: Date.now(), liveSessionId: "11111111-1111-1111-1111-111111111111" });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /session start/);
  assert.match(r.output, /\(LIVE\)/, "current session marked LIVE");
  // 2 real prompts (the tool_result turn is excluded).
  assert.match(r.output, /\b2\b/);
  // tier mix 1/0/2/1.
  assert.match(r.output, /1\/0\/2\/1/);
  // est saved = 1*0.035 + 2*0.014 + 1*0 = 0.063 → $0.06.
  assert.match(r.output, /\$0\.06/);
});

test("sessions list reports cleanly when the project has no sessions", () => {
  const home = mkdtempSync(join(tmpdir(), "mooter-sess-empty-"));
  const r = runSessions(["list"], { home, cwd: "/work/empty" });
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.output, /no Claude Code sessions/);
});

test("sessions with an unknown subcommand prints usage", () => {
  const r = runSessions(["frobnicate"], { home: "/tmp/x", cwd: "/work/x" });
  assert.strictEqual(r.exitCode, 1);
  assert.match(r.output, /usage: mooter sessions/);
});

test("encodeProjectDir matches Claude Code's non-alphanumeric → '-' encoding", () => {
  assert.strictEqual(
    encodeProjectDir("/mnt/c/Users/Paulo Loureiro/frugal"),
    "-mnt-c-Users-Paulo-Loureiro-frugal",
  );
});
