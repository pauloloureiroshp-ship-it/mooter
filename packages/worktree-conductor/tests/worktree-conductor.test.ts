// Wave 33.5 Block H — @mooter/worktree-conductor tests.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { tryAcquire, release, listLocks, isStale, readLock } from "../src/locks.ts";
import { writeHeartbeat, listHeartbeats, isHeartbeatStale, reapStaleHeartbeats, STALE_MS } from "../src/heartbeat.ts";
import { enqueue, pending, head, markDone } from "../src/queue.ts";
import { detectShellIntent, detectMcpIntent, repoResource } from "../src/intent.ts";
import { acquireWithRecovery, status, forceRelease } from "../src/conductor.ts";
import { renderConductorPanel } from "../src/panel.ts";
import { runConductor } from "../src/commands.ts";

const NOW = 1_780_000_000_000;

function home(): string {
  // MOOTER_HOME points at a dir treated as the ~/.mooter root by paths.ts.
  const h = mkdtempSync(join(tmpdir(), "moo-cond-"));
  process.env.MOOTER_HOME = h;
  return h;
}

test("tryAcquire is mutually exclusive — second caller is denied (race)", () => {
  const h = home();
  const a = tryAcquire("git-x", { sessionId: "sessA", terminalName: "wave33" }, { home: h, now: NOW });
  const b = tryAcquire("git-x", { sessionId: "sessB", terminalName: "wave34" }, { home: h, now: NOW });
  assert.strictEqual(a.acquired, true);
  assert.strictEqual(b.acquired, false);
  if (!b.acquired) {
    assert.strictEqual(b.heldBy.acquired_by, "sessA");
    assert.strictEqual(b.stale, false);
  }
  assert.strictEqual(listLocks(h).length, 1);
});

test("only the owner can release; force overrides", () => {
  const h = home();
  tryAcquire("tag", { sessionId: "owner" }, { home: h, now: NOW });
  assert.strictEqual(release("tag", "intruder", { home: h, now: NOW }), false);
  assert.strictEqual(release("tag", "owner", { home: h, now: NOW }), true);
  // re-acquire then force-release by a different session
  tryAcquire("tag", { sessionId: "owner2" }, { home: h, now: NOW });
  assert.strictEqual(release("tag", "x", { home: h, now: NOW, force: true }), true);
  assert.strictEqual(readLock("tag", h), null);
});

test("isStale is TTL-based", () => {
  const h = home();
  tryAcquire("dep", { sessionId: "s" }, { home: h, now: NOW, ttlSeconds: 60 });
  const lock = readLock("dep", h)!;
  assert.strictEqual(isStale(lock, NOW + 30000), false);
  assert.strictEqual(isStale(lock, NOW + 61000), true);
});

test("heartbeat staleness + reaping", () => {
  const h = home();
  writeHeartbeat({ sessionId: "live", terminalName: "t1" }, { home: h, now: NOW });
  writeHeartbeat({ sessionId: "dead", terminalName: "t2" }, { home: h, now: NOW - STALE_MS - 1000 });
  assert.strictEqual(listHeartbeats(h).length, 2);
  const hbDead = listHeartbeats(h).find((x) => x.session_id === "dead")!;
  assert.strictEqual(isHeartbeatStale(hbDead, NOW), true);
  const reaped = reapStaleHeartbeats({ home: h, now: NOW });
  assert.deepStrictEqual(reaped, ["dead"]);
  assert.strictEqual(listHeartbeats(h).length, 1);
});

test("acquireWithRecovery flags a recoverable lock (TTL stale AND holder dead)", () => {
  const h = home();
  // holder acquired long ago, TTL elapsed, and never heartbeats → dead
  tryAcquire("deploy-hub", { sessionId: "ghost" }, { home: h, now: NOW - 120000, ttlSeconds: 60 });
  const r = acquireWithRecovery("deploy-hub", { sessionId: "me" }, { home: h, now: NOW });
  assert.strictEqual(r.outcome.acquired, false);
  assert.strictEqual(r.holderDead, true);
  assert.strictEqual(r.recoverable, true);
  // a live holder with expired TTL is NOT recoverable (no theft)
  writeHeartbeat({ sessionId: "ghost", terminalName: "t" }, { home: h, now: NOW });
  const r2 = acquireWithRecovery("deploy-hub", { sessionId: "me" }, { home: h, now: NOW });
  assert.strictEqual(r2.recoverable, false);
});

test("intent detection: tag before push, deploy, notion", () => {
  assert.strictEqual(detectShellIntent("git tag v1.21.1", "/x")!.resource, "tag");
  assert.strictEqual(detectShellIntent("git tag -l", "/x"), null); // listing is not a write
  assert.ok(detectShellIntent("git push origin main", "/x")!.resource.startsWith("git-"));
  assert.strictEqual(detectShellIntent("npx wrangler deploy", "/x")!.resource, "deploy-hub");
  assert.strictEqual(detectShellIntent("ls -la", "/x"), null);
  assert.strictEqual(detectMcpIntent("mooter_notion_write")!.resource, "notion");
  assert.strictEqual(detectMcpIntent("mooter_sessions_list"), null);
  // repoResource is stable for the same root
  assert.strictEqual(repoResource("/x"), repoResource("/x"));
});

test("queue is FIFO and head tracks the next queued", () => {
  const h = home();
  const e1 = enqueue({ sessionId: "a", intent: "git tag v1", resource: "tag" }, { home: h, now: NOW });
  enqueue({ sessionId: "b", intent: "git tag v2", resource: "tag" }, { home: h, now: NOW + 1000 });
  assert.strictEqual(pending(h).length, 2);
  assert.strictEqual(head(h)!.id, e1.id);
  markDone(e1.id, { home: h, now: NOW + 2000 });
  assert.strictEqual(head(h)!.session_id, "b");
});

test("status + panel render the live picture", () => {
  const h = home();
  tryAcquire("git-z", { sessionId: "s1", terminalName: "wave33" }, { home: h, now: NOW });
  writeHeartbeat({ sessionId: "s1", terminalName: "wave33" }, { home: h, now: NOW });
  enqueue({ sessionId: "s2", terminalName: "wave34", intent: "git tag v2", resource: "tag" }, { home: h, now: NOW });
  const st = status({ home: h, now: NOW });
  assert.strictEqual(st.locks.length, 1);
  assert.strictEqual(st.liveSessions.length, 1);
  assert.strictEqual(st.queue.length, 1);
  const panel = renderConductorPanel(st);
  assert.ok(panel.includes("Conductor"), panel);
  assert.ok(panel.includes("git-z"), panel);
});

test("runConductor CLI: lock → conflict → force unlock → history", () => {
  const h = home();
  const opts = { home: h, now: NOW, sessionId: "cli-a", terminalName: "wave33", cwd: "/x" };
  assert.strictEqual(runConductor(["lock", "tag"], opts).exitCode, 0);
  // second session is denied
  const denied = runConductor(["lock", "tag"], { ...opts, sessionId: "cli-b" });
  assert.strictEqual(denied.exitCode, 1);
  assert.ok(denied.output.includes("held by"), denied.output);
  // owner unlocks
  assert.strictEqual(runConductor(["unlock", "tag"], opts).exitCode, 0);
  // history records the ops
  const hist = runConductor(["history"], opts);
  assert.ok(hist.output.includes("ACQUIRED"), hist.output);
  assert.ok(hist.output.includes("RELEASED"), hist.output);
});

test("runConductor auto-lock/auto-unlock are non-blocking (exit 0) and detect intent", () => {
  const h = home();
  const opts = { home: h, now: NOW, sessionId: "hook", cwd: "/x" };
  const al = runConductor(["auto-lock", "--cmd", "git tag v9"], opts);
  assert.strictEqual(al.exitCode, 0);
  assert.ok(al.output.includes("tag"), al.output);
  // a non-locking command → silent, exit 0
  const noop = runConductor(["auto-lock", "--cmd", "ls"], opts);
  assert.strictEqual(noop.exitCode, 0);
  assert.strictEqual(noop.output, "");
  // auto-unlock releases
  assert.strictEqual(runConductor(["auto-unlock", "--cmd", "git tag v9"], opts).exitCode, 0);
});

test("Wave 34.5.A: conductor status counts each live session that invokes the CLI", () => {
  const h = home();
  delete process.env.CLAUDE_SESSION_ID;
  // two concurrent sessions each run a (read-only) conductor command
  runConductor(["status"], { home: h, now: NOW, sessionId: "ccA", terminalName: "wave34", cwd: "/a" });
  runConductor(["status"], { home: h, now: NOW, sessionId: "ccB", terminalName: "wave33", cwd: "/b" });
  const st = status({ home: h, now: NOW });
  assert.strictEqual(st.liveSessions.length, 2, "both invoking sessions must be live");
  assert.deepStrictEqual(st.liveSessions.map((s) => s.session_id).sort(), ["ccA", "ccB"]);
});

test("Wave 34.5.A: a crashed session goes stale, is not counted live, and is reaped", () => {
  const h = home();
  delete process.env.CLAUDE_SESSION_ID;
  // session last touched the conductor long ago (crashed, never refreshed)
  runConductor(["status"], { home: h, now: NOW - STALE_MS - 5000, sessionId: "ccDead", cwd: "/d" });
  // a live session now
  runConductor(["status"], { home: h, now: NOW, sessionId: "ccLive", cwd: "/l" });
  const st = status({ home: h, now: NOW });
  assert.strictEqual(st.liveSessions.length, 1);
  assert.strictEqual(st.liveSessions[0].session_id, "ccLive");
  assert.strictEqual(st.staleSessions.length, 1);
  // reap drops the dead one (the reaping session stays live)
  const reaped = runConductor(["reap"], { home: h, now: NOW, sessionId: "ccLive", cwd: "/l" });
  assert.ok(reaped.output.includes("reaped 1"), reaped.output);
  assert.strictEqual(status({ home: h, now: NOW }).staleSessions.length, 0);
});

test("Wave 34.5.A: no real session id → no phantom heartbeat is written", () => {
  const h = home();
  delete process.env.CLAUDE_SESSION_ID; // ad-hoc shell, owner() resolves to "unknown"
  runConductor(["status"], { home: h, now: NOW, cwd: "/x" });
  assert.strictEqual(status({ home: h, now: NOW }).liveSessions.length, 0);
});

test("Wave 34.5.A: `stop` clears and does not resurrect the heartbeat", () => {
  const h = home();
  delete process.env.CLAUDE_SESSION_ID;
  runConductor(["beat"], { home: h, now: NOW, sessionId: "ccS", cwd: "/s" });
  assert.strictEqual(status({ home: h, now: NOW }).liveSessions.length, 1);
  runConductor(["stop"], { home: h, now: NOW, sessionId: "ccS", cwd: "/s" });
  assert.strictEqual(status({ home: h, now: NOW }).liveSessions.length, 0, "stop must not self-beat");
});

test("forceRelease logs a REAPED op", () => {
  const h = home();
  tryAcquire("notion", { sessionId: "dead" }, { home: h, now: NOW - 120000, ttlSeconds: 60 });
  assert.strictEqual(forceRelease("notion", "rescuer", { home: h, now: NOW }), true);
  assert.strictEqual(readLock("notion", h), null);
});
