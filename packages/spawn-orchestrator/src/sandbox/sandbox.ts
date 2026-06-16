// Wave 33.5 Block B.3 — sandbox config builder + invocation assembler.
//
// One place to construct the 4-layer SandboxConfig for a spawn, and to turn it
// into a concrete argv for the detected backend. The secrets layer is tier-aware:
// a LOCAL (Ollama) spawn never receives ANTHROPIC_API_KEY or any *_KEY/_TOKEN;
// a CLOUD spawn gets exactly the keys its tier requires and nothing else.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { SandboxConfig, NetworkPolicy, Tier } from "../types.ts";
import { buildBwrapInvocation } from "./linux_bubblewrap.ts";
import { buildSeatbeltInvocation } from "./darwin_seatbelt.ts";
import { detectSandbox } from "./detect.ts";

export interface BuildConfigInput {
  worktreePath: string;
  mode: "cloud" | "local";
  tier: Tier;
  home?: string;
}

/**
 * Extra DIRECTORIES to mask beyond the wholesale $HOME tmpfs. Empty by default:
 * the home mask already covers every in-$HOME credential store, and the read-only
 * root makes system secrets (/etc/shadow) unreadable to a non-root spawn anyway.
 * NOTE: entries MUST be directories — `--tmpfs` over a file errors out and breaks
 * the whole sandbox. Paths under $HOME are filtered by the builder (redundant).
 */
function defaultBlockedPaths(_home: string): string[] {
  return [];
}

/** Env names always safe to forward (no secrets). */
const SAFE_ENV = ["TERM", "LANG", "LC_ALL", "TZ", "NODE_ENV", "CLAUDE_PROJECT_DIR"];

export function buildSandboxConfig(input: BuildConfigInput): SandboxConfig {
  const home = input.home ?? homedir();
  // L1: a local spawn talks to Ollama on host loopback; a cloud spawn talks to
  // the provider API. Both keep host net in the MVP (per-domain allowlisting
  // needs a proxy — captured in allowedDomains, not yet enforced). Pure-compute
  // callers can still request "none" directly for full isolation.
  const network: NetworkPolicy = input.mode === "local" ? "local" : "cloud";
  const allowedDomains =
    input.mode === "local" ? ["127.0.0.1:11434", "localhost:11434"] : ["api.anthropic.com"];

  // L3: only a cloud spawn may carry the provider key, and ONLY that key.
  const envWhitelist = [...SAFE_ENV];
  if (input.mode === "cloud") envWhitelist.push("ANTHROPIC_API_KEY");

  return {
    network,
    allowedDomains,
    worktreePath: input.worktreePath,
    homeDir: home,
    readOnlyPaths: ["/usr", "/bin", "/lib", "/etc"],
    blockedPaths: defaultBlockedPaths(home),
    envWhitelist,
    configReadOnly: [join(home, ".claude", "settings.json"), join(home, ".mooter", "preferences.json")],
  };
}

export interface AssembleInput {
  config: SandboxConfig;
  command: string[];
  /** Source env to pull whitelisted values from (defaults to process.env). */
  sourceEnv?: NodeJS.ProcessEnv;
  /** Override existence check (tests). */
  exists?: (p: string) => boolean;
}

/** Assemble the bubblewrap invocation argv (argv[0] = "bwrap"). */
export function assembleBwrap(input: AssembleInput): string[] {
  const exists = input.exists ?? existsSync;
  const src = input.sourceEnv ?? process.env;
  const env: Record<string, string> = {};
  for (const name of input.config.envWhitelist) {
    const v = src[name];
    if (typeof v === "string") env[name] = v;
  }
  const existingBlockedPaths = input.config.blockedPaths.filter((p) => exists(p));
  return ["bwrap", ...buildBwrapInvocation(input.config, { existingBlockedPaths, env }, input.command)];
}

/** Resolve the whitelisted env values from the source env (shared by both backends). */
function resolveEnv(input: AssembleInput): Record<string, string> {
  const src = input.sourceEnv ?? process.env;
  const env: Record<string, string> = {};
  for (const name of input.config.envWhitelist) {
    const v = src[name];
    if (typeof v === "string") env[name] = v;
  }
  return env;
}

/** Assemble the macOS Seatbelt invocation argv (argv[0] = "sandbox-exec"). */
export function assembleSeatbelt(input: AssembleInput): string[] {
  return buildSeatbeltInvocation(input.config, { env: resolveEnv(input) }, input.command);
}

/**
 * Assemble the sandbox invocation for the platform's detected backend. This is the
 * entry point the runner uses — it never runs unsandboxed: an unsupported platform
 * throws (security wins, mirroring the rejected `--no-sandbox`).
 * `backend` is injectable for tests; defaults to the live detection.
 */
export function assembleSandbox(input: AssembleInput, backend?: string): string[] {
  const b = backend ?? detectSandbox().backend;
  if (b === "seatbelt") return assembleSeatbelt(input);
  if (b === "bubblewrap") return assembleBwrap(input);
  throw new Error(`no sandbox backend available for this platform (got '${b}') — Mooter never spawns unsandboxed`);
}
