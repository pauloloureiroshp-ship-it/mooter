// Wave 58 Phase E — multiplexer bridge + background fan-out tests.
//
// NEVER launches a real process: the raw spawner and the per-task launcher are
// injected, detectMultiplexer is driven by a stub which(), and createSpawn runs
// with injected git/classifier. Especially important since real spawn throws on
// Windows (no bubblewrap) — these tests must pass on any OS.

import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detectMultiplexer,
  describeCapability,
  paneArgv,
  spawnInPane,
  spawnPipe,
  launchViaBridge,
  KNOWN_MULTIPLEXERS,
  type RawSpawn,
  type Multiplexer,
} from "../src/multiplexer-bridge.ts";
import {
  fanOut,
  isMultiAgent,
  buildReport,
  FANOUT_THRESHOLD,
  type FanoutTask,
  type HerdTracker,
  type FanoutTaskResult,
} from "../src/fanout.ts";
import { readRecord } from "../src/state.ts";

const NOW = 1_780_000_000_000;

function home(): string {
  const h = mkdtempSync(join(tmpdir(), "moo-fanout-"));
  process.env.MOOTER_HOME = h;
  return h;
}

/** A raw spawner that fakes a successful synchronous process. */
const fakeRawSpawn = (calls: { bin: string; args: string[] }[], code = 0): RawSpawn => {
  return (bin, args, hooks) => {
    calls.push({ bin, args });
    hooks.onData("ok\n");
    hooks.onExit(code);
    return { pid: 9999 };
  };
};

/** An in-memory herd tracker so no tmp herd file is touched. */
function memHerd(): HerdTracker & { events: string[] } {
  const events: string[] = [];
  let seq = 0;
  return {
    events,
    trackSpawn: (o) => {
      const id = o.spawn_id || `m-${++seq}`;
      events.push(`spawn:${o.agent_name ?? "?"}`);
      return id;
    },
    trackComplete: (id) => {
      events.push(`complete:${id}`);
      return true;
    },
    trackError: (id) => {
      events.push(`error:${id}`);
      return true;
    },
  };
}

// ── multiplexer-bridge: detection ────────────────────────────────────────

test("detectMultiplexer: win32 returns null without probing (Win32-null pattern)", () => {
  let probed = false;
  const which = () => {
    probed = true;
    return true;
  };
  assert.strictEqual(detectMultiplexer(which, "win32"), null);
  assert.strictEqual(probed, false, "must not even shell out on Windows");
});

test("detectMultiplexer: prefers tmux → zellij → wezterm in order", () => {
  // only wezterm present
  assert.strictEqual(detectMultiplexer((b) => b === "wezterm", "linux"), "wezterm");
  // zellij + wezterm present → zellij wins (earlier in order)
  assert.strictEqual(detectMultiplexer((b) => b === "zellij" || b === "wezterm", "linux"), "zellij");
  // all present → tmux wins
  assert.strictEqual(detectMultiplexer(() => true, "linux"), "tmux");
  // none present → null
  assert.strictEqual(detectMultiplexer(() => false, "linux"), null);
});

test("describeCapability: pane when mux present, pipe otherwise, always canPipe", () => {
  const withMux = describeCapability(() => true, "linux");
  assert.strictEqual(withMux.canPane, true);
  assert.strictEqual(withMux.transport, "pane");
  assert.strictEqual(withMux.canPipe, true);
  assert.match(withMux.note, /tmux/);

  const win = describeCapability(() => true, "win32");
  assert.strictEqual(win.multiplexer, null);
  assert.strictEqual(win.canPane, false);
  assert.strictEqual(win.transport, "pipe");
  assert.strictEqual(win.canPipe, true);
  assert.match(win.note, /Windows/);

  const bare = describeCapability(() => false, "linux");
  assert.strictEqual(bare.transport, "pipe");
  assert.match(bare.note, /child_process/);
});

// ── multiplexer-bridge: backend argv selection ────────────────────────────

test("paneArgv builds the correct CLI invocation per backend", () => {
  assert.deepStrictEqual(paneArgv("tmux", ["ollama", "run", "qwen3:30b", "t"]), [
    "tmux", "new-window", "ollama", "run", "qwen3:30b", "t",
  ]);
  assert.deepStrictEqual(paneArgv("zellij", ["claude", "-p", "t"]), [
    "zellij", "action", "new-pane", "--", "claude", "-p", "t",
  ]);
  assert.deepStrictEqual(paneArgv("wezterm", ["claude", "-p", "t"]), [
    "wezterm", "cli", "spawn", "--", "claude", "-p", "t",
  ]);
});

test("spawnInPane drives the multiplexer CLI; spawnPipe runs the command directly", () => {
  for (const mux of KNOWN_MULTIPLEXERS as readonly Multiplexer[]) {
    const calls: { bin: string; args: string[] }[] = [];
    let exit = -1;
    const h = spawnInPane(mux, ["echo", "hi"], { onData: () => {}, onExit: (c) => (exit = c) }, fakeRawSpawn(calls));
    assert.strictEqual(h.transport, "pane");
    assert.strictEqual(calls[0].bin, mux, "pane spawn invokes the multiplexer binary");
    assert.strictEqual(exit, 0);
  }

  const calls: { bin: string; args: string[] }[] = [];
  const h = spawnPipe(["echo", "hi"], { onData: () => {}, onExit: () => {} }, fakeRawSpawn(calls));
  assert.strictEqual(h.transport, "pipe");
  assert.strictEqual(calls[0].bin, "echo", "pipe spawn invokes the command itself, no PTY/multiplexer");
  assert.deepStrictEqual(calls[0].args, ["hi"]);
});

test("launchViaBridge: Windows falls back to pipe; Linux+mux uses a pane", () => {
  const winCalls: { bin: string; args: string[] }[] = [];
  const win = launchViaBridge(
    ["ollama", "run", "m", "t"],
    { onData: () => {}, onExit: () => {} },
    { platform: "win32", which: () => true, rawSpawn: fakeRawSpawn(winCalls) },
  );
  assert.strictEqual(win.capability.transport, "pipe");
  assert.strictEqual(win.handle.transport, "pipe");
  assert.strictEqual(winCalls[0].bin, "ollama", "Windows runs the command directly (no multiplexer)");

  const linCalls: { bin: string; args: string[] }[] = [];
  const lin = launchViaBridge(
    ["ollama", "run", "m", "t"],
    { onData: () => {}, onExit: () => {} },
    { platform: "linux", which: () => true, rawSpawn: fakeRawSpawn(linCalls) },
  );
  assert.strictEqual(lin.capability.transport, "pane");
  assert.strictEqual(lin.handle.transport, "pane");
  assert.strictEqual(linCalls[0].bin, "tmux", "Linux with a multiplexer opens a pane");
});

// ── fanout: detection ──────────────────────────────────────────────────────

test("isMultiAgent fires at the 3-agent threshold", () => {
  assert.strictEqual(FANOUT_THRESHOLD, 3);
  assert.strictEqual(isMultiAgent([{ task: "a" }, { task: "b" }]), false);
  assert.strictEqual(isMultiAgent([{ task: "a" }, { task: "b" }, { task: "c" }]), true);
});

// ── fanout: live path (mocked spawn layer) ───────────────────────────────

test("fanOut aggregates ONE summary across launched agents (Linux, mocked)", async () => {
  const h = home();
  const herd = memHerd();
  const tasks: FanoutTask[] = [
    { task: "agent one", forceTier: "T0" },
    { task: "agent two", forceTier: "T0" },
    { task: "agent three", forceTier: "T0" },
  ];

  const report = await fanOut(tasks, {
    home: h,
    now: NOW,
    which: () => true,
    platform: "linux",
    classifier: () => "T0",
    git: () => "",
    herd,
    sessionId: "s1",
    // mocked launcher — never forks; reports a clean pipe exit
    launch: async (res, _bridge, onData) => {
      onData("done\n");
      return { exitCode: 0, handle: { pid: 1, transport: "pipe" }, transport: "pipe" };
    },
  });

  assert.strictEqual(report.realSpawn, true);
  assert.strictEqual(report.mode, "live");
  assert.strictEqual(report.total, 3);
  assert.strictEqual(report.launched, 3);
  assert.strictEqual(report.unavailable, 0);
  assert.match(report.summary, /3\/3 launched/);
  // each spawn was tracked + completed in the herd
  assert.strictEqual(herd.events.filter((e) => e.startsWith("complete:")).length, 3);
  // records persisted + finalized to done
  for (const t of report.tasks) {
    assert.strictEqual(t.status, "launched");
    assert.ok(t.spawnId);
    assert.strictEqual(readRecord(t.spawnId as string, h)?.status, "done");
  }
});

// ── fanout: Windows degraded honesty ────────────────────────────────────────

test("fanOut degrades honestly when sandbox unavailable (Windows reality)", async () => {
  const h = home();
  const herd = memHerd();
  let launched = 0;
  const tasks: FanoutTask[] = [{ task: "a" }, { task: "b" }, { task: "c" }];

  const report = await fanOut(tasks, {
    home: h,
    now: NOW,
    // Windows: detectSandbox → backend "none" → createSpawn throws. No mux either.
    which: () => false,
    platform: "win32",
    classifier: () => "T2",
    git: () => "",
    herd,
    launch: async () => {
      launched++;
      return { exitCode: 0, handle: { pid: 1, transport: "pipe" }, transport: "pipe" };
    },
  });

  assert.strictEqual(launched, 0, "must NEVER launch when sandbox is unavailable");
  assert.strictEqual(report.realSpawn, false);
  assert.strictEqual(report.mode, "degraded");
  assert.strictEqual(report.unavailable, 3);
  assert.strictEqual(report.launched, 0);
  // honest summary names the real reason, never claims a launch
  assert.match(report.summary, /real spawn unavailable/i);
  assert.ok(!/launched/.test(report.summary) || /0\//.test(report.summary));
  for (const t of report.tasks) {
    assert.strictEqual(t.status, "unavailable");
    assert.strictEqual(t.spawnId, null);
    assert.ok(t.reason && t.reason.length > 0, "real reason recorded, not invented");
  }
  // herd still recorded the attempted fan-out shape (tracking-only)
  assert.ok(herd.events.some((e) => e.startsWith("spawn:")));
  assert.ok(herd.events.some((e) => e.startsWith("error:")));
});

// ── fanout: report builder honesty (no fabricated numbers) ──────────────────

test("buildReport: mixed launched/unavailable summary is live and additive", () => {
  const tasks: FanoutTaskResult[] = [
    { task: "a", status: "launched", spawnId: "sp_a", tier: "T0", mode: "local", transport: "pipe", exitCode: 0 },
    { task: "b", status: "unavailable", spawnId: null, tier: null, mode: null, transport: null, exitCode: null, reason: "no sandbox" },
  ];
  const r = buildReport(tasks);
  assert.strictEqual(r.realSpawn, true);
  assert.strictEqual(r.mode, "live");
  assert.strictEqual(r.launched, 1);
  assert.strictEqual(r.unavailable, 1);
  assert.match(r.summary, /1\/2 launched/);
  assert.match(r.summary, /1 unavailable/);
});

test("buildReport: empty task list yields a no-op summary, zeroed counts", () => {
  const r = buildReport([]);
  assert.strictEqual(r.total, 0);
  assert.strictEqual(r.realSpawn, false);
  assert.strictEqual(r.herd.active, 0);
  assert.strictEqual(r.herd.totalCostUsd, 0);
  assert.match(r.summary, /no tasks/i);
});
