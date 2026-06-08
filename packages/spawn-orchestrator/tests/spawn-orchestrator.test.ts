// Wave 33.5 Block B — @mooter/spawn-orchestrator tests.
import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detectSandbox } from "../src/sandbox/detect.ts";
import { buildBwrapArgs } from "../src/sandbox/linux_bubblewrap.ts";
import { buildSandboxConfig, assembleBwrap } from "../src/sandbox/sandbox.ts";
import { tierToMode } from "../src/classify-tier.ts";
import { createSpawn, SandboxUnavailableError } from "../src/pipeline.ts";
import { runSandboxed } from "../src/runner.ts";
import { readRecord, listRecords } from "../src/state.ts";
import { spawnSummary } from "../src/chip.ts";
import { runSpawn } from "../src/commands.ts";
import { runSandboxEscapeTest } from "../src/security-test.ts";

const NOW = 1_780_000_000_000;

function home(): string {
  const h = mkdtempSync(join(tmpdir(), "moo-spawn-"));
  process.env.MOOTER_HOME = h;
  return h;
}

test("detectSandbox: linux→bubblewrap, darwin→seatbelt, other→none", () => {
  assert.strictEqual(detectSandbox(() => true, "linux").backend, "bubblewrap");
  assert.strictEqual(detectSandbox(() => false, "linux").available, false);
  assert.strictEqual(detectSandbox(() => true, "darwin").backend, "seatbelt");
  assert.strictEqual(detectSandbox(() => false, "win32").backend, "none");
});

test("buildBwrapArgs enforces the 4 layers in argv", () => {
  const cfg = buildSandboxConfig({ worktreePath: "/wt", mode: "local", tier: "T0", home: "/home/u" });
  const args = buildBwrapArgs(cfg, { existingBlockedPaths: ["/home/u/.ssh"], env: {} });
  const s = args.join(" ");
  // L1 — local keeps net (no --unshare-net); none would add it
  assert.ok(!args.includes("--unshare-net"));
  // L2 — ro root + WHOLESALE home mask + single writable worktree (re-exposed after)
  assert.ok(s.includes("--ro-bind / /"));
  assert.ok(s.includes("--tmpfs /home/u"), "whole $HOME masked");
  assert.ok(s.includes("--bind /wt /wt"));
  // a blocked path UNDER the home mask must NOT be double-masked (would error)
  assert.ok(!s.includes("--tmpfs /home/u/.ssh"));
  // the home mask must come BEFORE the worktree bind (so the worktree survives it)
  assert.ok(s.indexOf("--tmpfs /home/u") < s.indexOf("--bind /wt /wt"));
  // L3 — clearenv present
  assert.ok(args.includes("--clearenv"));
  // none-policy adds --unshare-net
  const none = buildBwrapArgs({ ...cfg, network: "none" }, { existingBlockedPaths: [], env: {} });
  assert.ok(none.includes("--unshare-net"));
});

test("buildSandboxConfig scopes secrets by mode (local excludes the API key)", () => {
  const local = buildSandboxConfig({ worktreePath: "/wt", mode: "local", tier: "T0", home: "/h" });
  const cloud = buildSandboxConfig({ worktreePath: "/wt", mode: "cloud", tier: "T3", home: "/h" });
  assert.ok(!local.envWhitelist.includes("ANTHROPIC_API_KEY"));
  assert.ok(cloud.envWhitelist.includes("ANTHROPIC_API_KEY"));
  assert.strictEqual(local.network, "local");
  assert.strictEqual(cloud.network, "cloud");
});

test("assembleBwrap injects only whitelisted env values", () => {
  const cfg = buildSandboxConfig({ worktreePath: "/wt", mode: "cloud", tier: "T3", home: "/h" });
  const argv = assembleBwrap({
    config: cfg,
    command: ["echo", "hi"],
    sourceEnv: { ANTHROPIC_API_KEY: "sk-x", SECRET_OTHER: "nope", TERM: "xterm" } as NodeJS.ProcessEnv,
    exists: () => false,
  });
  const s = argv.join(" ");
  assert.strictEqual(argv[0], "bwrap");
  assert.ok(s.includes("--setenv ANTHROPIC_API_KEY sk-x"));
  assert.ok(s.includes("--setenv TERM xterm"));
  assert.ok(!s.includes("SECRET_OTHER"));
  assert.ok(s.endsWith("-- echo hi"));
});

test("tierToMode: T0/T1 local, T2/T3 cloud", () => {
  assert.strictEqual(tierToMode("T0"), "local");
  assert.strictEqual(tierToMode("T1"), "local");
  assert.strictEqual(tierToMode("T2"), "cloud");
  assert.strictEqual(tierToMode("T3"), "cloud");
});

test("createSpawn refuses when no sandbox is available (no unsandboxed mode)", () => {
  home();
  assert.throws(
    () => createSpawn({ task: "x" }, { which: () => false, platform: "linux", now: NOW }),
    SandboxUnavailableError,
  );
});

test("createSpawn plans a local spawn: tier→mode, worktree, record, command", () => {
  const h = home();
  const gitCalls: string[][] = [];
  const res = createSpawn(
    { task: "rename a variable" },
    {
      home: h,
      now: NOW,
      which: () => true,
      platform: "linux",
      classifier: () => "T0",
      git: (args) => {
        gitCalls.push(args);
        return "";
      },
      localModel: "qwen3:30b",
    },
  );
  assert.strictEqual(res.record.tier, "T0");
  assert.strictEqual(res.record.mode, "local");
  assert.strictEqual(res.record.status, "sandboxed");
  assert.ok(res.record.branch.startsWith("spawn/"));
  assert.deepStrictEqual(res.command, ["ollama", "run", "qwen3:30b", "rename a variable"]);
  // worktree was created via git
  assert.ok(gitCalls.some((c) => c[0] === "worktree" && c[1] === "add"));
  // persisted
  assert.strictEqual(readRecord(res.record.id, h)?.id, res.record.id);
});

test("runSandboxed transitions record running→done via injected spawnImpl", async () => {
  const h = home();
  const res = createSpawn(
    { task: "t", forceTier: "T0" },
    { home: h, now: NOW, which: () => true, platform: "linux", git: () => "" },
  );
  const handle = runSandboxed(res.record, {
    home: h,
    command: res.command,
    spawnImpl: (_argv, hooks) => {
      hooks.onData("hello\n");
      hooks.onExit(0);
      return { pid: 4242 };
    },
  });
  const code = await handle.done;
  assert.strictEqual(code, 0);
  assert.strictEqual(readRecord(res.record.id, h)?.status, "done");
  assert.strictEqual(readRecord(res.record.id, h)?.exitCode, 0);
});

test("spawnSummary counts active + cost", () => {
  const s = spawnSummary([
    { status: "running", estCostUsd: 0.01 } as never,
    { status: "sandboxed" } as never,
    { status: "done", estCostUsd: 0.02 } as never,
  ]);
  assert.strictEqual(s.active, 2);
  assert.ok(Math.abs(s.totalCostUsd - 0.03) < 1e-9);
});

test("runSpawn rejects --no-sandbox and lists/ batches", async () => {
  const h = home();
  const reject = await runSpawn(["--no-sandbox", "do x"], { home: h });
  assert.strictEqual(reject.exitCode, 1);
  assert.ok(reject.output.includes("never spawns unsandboxed"));

  // a planned spawn with injected launcher (no real process)
  let launched = 0;
  const r = await runSpawn(["fix", "the", "bug"], {
    home: h,
    now: NOW,
    which: () => true,
    platform: "linux",
    classifier: () => "T0",
    git: () => "",
    launch: async () => {
      launched++;
      return 0;
    },
  });
  assert.strictEqual(r.exitCode, 0);
  assert.strictEqual(launched, 1);
  assert.ok(r.output.includes("🐝 spawned"));

  const list = await runSpawn(["list"], { home: h });
  assert.ok(list.output.includes("active"));
});

// REAL bubblewrap — gated. Skips cleanly where bwrap is absent (CI without it);
// runs for real on this dev box and MUST pass (CVE-2025-59528 mitigation).
test("runSandboxEscapeTest blocks the escape (real bwrap)", { skip: !detectSandbox().available }, () => {
  const v = runSandboxEscapeTest();
  assert.strictEqual(v.available, true);
  for (const c of v.checks) assert.strictEqual(c.pass, true, `${c.name}: ${c.detail}`);
  assert.strictEqual(v.pass, true);
});
