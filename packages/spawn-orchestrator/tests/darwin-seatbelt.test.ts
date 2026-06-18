// Hermetic tests for the macOS Seatbelt sandbox assembler — mirrors the security
// properties bubblewrap enforces on Linux (writes only under the worktree; only the
// whitelisted env reaches the child; network denied for "none", kept otherwise).
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSeatbeltProfile, buildSeatbeltInvocation } from "../src/sandbox/darwin_seatbelt.ts";
import { assembleSandbox, assembleSeatbelt } from "../src/sandbox/sandbox.ts";
import type { SandboxConfig } from "../src/types.ts";

const WT = "/Users/x/.mooter/spawns/sp_1/tree";
function cfg(over: Partial<SandboxConfig> = {}): SandboxConfig {
  return {
    network: "local",
    allowedDomains: ["127.0.0.1:11434"],
    worktreePath: WT,
    homeDir: "/Users/x",
    readOnlyPaths: ["/usr", "/bin"],
    blockedPaths: [],
    envWhitelist: ["TERM", "LANG"],
    configReadOnly: [],
    ...over,
  };
}

test("seatbelt profile: allow-default, deny writes, worktree re-allowed", () => {
  const p = buildSeatbeltProfile(cfg());
  assert.ok(p.includes("(allow default)"));
  assert.ok(p.includes("(deny file-write*)"));
  assert.ok(p.includes('(subpath "' + WT + '")'));
});

test("seatbelt profile: network denied only for policy 'none'", () => {
  assert.ok(!buildSeatbeltProfile(cfg({ network: "local" })).includes("(deny network*)"));
  assert.ok(!buildSeatbeltProfile(cfg({ network: "cloud" })).includes("(deny network*)"));
  assert.ok(buildSeatbeltProfile(cfg({ network: "none" })).includes("(deny network*)"));
});

test("seatbelt invocation: sandbox-exec + env -i with PATH/HOME + command last", () => {
  const inv = buildSeatbeltInvocation(cfg(), { env: { TERM: "xterm", LANG: "en" } }, ["ollama", "run", "qwen2.5:3b", "hi"]);
  assert.equal(inv[0], "sandbox-exec");
  assert.equal(inv[1], "-p");
  assert.ok(inv[2].includes("deny file-write*"));
  assert.ok(inv.includes("/usr/bin/env") && inv.includes("-i"));
  assert.ok(inv.some((a) => a.startsWith("PATH=")));
  assert.ok(inv.includes("HOME=" + WT));
  assert.ok(inv.includes("TERM=xterm") && inv.includes("LANG=en"));
  assert.deepEqual(inv.slice(-4), ["ollama", "run", "qwen2.5:3b", "hi"]);
});

test("env isolation: only whitelisted vars reach the child (no leaked secret)", () => {
  const inv = buildSeatbeltInvocation(cfg(), { env: { TERM: "x" } }, ["x"]);
  assert.ok(!inv.some((a) => a.startsWith("ANTHROPIC_API_KEY")));
  const c = cfg({ envWhitelist: ["TERM", "ANTHROPIC_API_KEY"] });
  const inv2 = buildSeatbeltInvocation(c, { env: { ANTHROPIC_API_KEY: "sk-x" } }, ["x"]);
  assert.ok(inv2.includes("ANTHROPIC_API_KEY=sk-x"));
});

test("assembleSandbox dispatches by backend (injected) and never runs unsandboxed", () => {
  const input = { config: cfg(), command: ["ollama", "run", "m", "t"], sourceEnv: { TERM: "x" } as NodeJS.ProcessEnv };
  assert.equal(assembleSandbox(input, "seatbelt")[0], "sandbox-exec");
  assert.equal(assembleSandbox(input, "bubblewrap")[0], "bwrap");
  assert.throws(() => assembleSandbox(input, "none"), /never spawns unsandboxed/);
});

test("assembleSeatbelt resolves whitelisted env from sourceEnv", () => {
  const inv = assembleSeatbelt({ config: cfg(), command: ["x"], sourceEnv: { TERM: "xterm", SECRET: "no" } as NodeJS.ProcessEnv });
  assert.ok(inv.includes("TERM=xterm"));
  assert.ok(!inv.some((a) => a.startsWith("SECRET")));
});
