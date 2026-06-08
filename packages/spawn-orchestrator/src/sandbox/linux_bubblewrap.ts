// Wave 33.5 Block B.3 — bubblewrap (Linux/WSL2) sandbox arg builder.
//
// Translates a SandboxConfig into the `bwrap` argv that enforces the 4 layers:
//   L1 network — `--unshare-net` for policy "none" (full egress block). "local"/
//                "cloud" keep host net (per-domain allowlisting needs a proxy;
//                tracked honestly as a known limitation — NOT silently allowed).
//   L2 filesystem — `--ro-bind / /` (whole root read-only) + a single writable
//                `--bind <worktree>` + an empty `--tmpfs` mask over each blocked
//                secret dir (so ~/.ssh etc. are unreadable from inside).
//   L3 secrets — `--clearenv` then `--setenv` only the whitelisted vars.
//   L4 config — config files are read-only by virtue of the ro-root and the
//                worktree being the ONLY writable mount.
//
// Pure: returns argv given the config + which blocked paths actually exist (the
// caller stats them, so this stays testable without a filesystem).

import type { SandboxConfig } from "../types.ts";

export interface BwrapBuildContext {
  /** Subset of config.blockedPaths that exist on disk (masking a missing path errors). */
  existingBlockedPaths: string[];
  /** Env values to inject for the whitelisted names (already resolved by caller). */
  env: Record<string, string>;
}

/**
 * Build the bwrap argv (everything AFTER the `bwrap` binary, ending with `--`
 * then the command). The command itself is appended by the runner.
 */
export function buildBwrapArgs(cfg: SandboxConfig, ctx: BwrapBuildContext): string[] {
  const a: string[] = [];

  // Process isolation + lifecycle.
  a.push("--die-with-parent");
  a.push("--unshare-pid");
  a.push("--unshare-ipc");
  a.push("--unshare-uts");

  // L1 — network egress.
  if (cfg.network === "none") a.push("--unshare-net");

  // L2 — filesystem: read-only root, real /dev + /proc, ephemeral /tmp.
  a.push("--ro-bind", "/", "/");
  a.push("--dev", "/dev");
  a.push("--proc", "/proc");
  a.push("--tmpfs", "/tmp");

  // The single writable mount: the spawn's worktree.
  a.push("--bind", cfg.worktreePath, cfg.worktreePath);

  // Mask each existing blocked secret dir with an empty tmpfs (unreadable).
  for (const p of ctx.existingBlockedPaths) {
    a.push("--tmpfs", p);
  }

  // L3 — secrets: drop the entire host env, then inject only the whitelist.
  a.push("--clearenv");
  for (const name of cfg.envWhitelist) {
    if (Object.prototype.hasOwnProperty.call(ctx.env, name)) {
      a.push("--setenv", name, ctx.env[name]);
    }
  }
  // A minimal sane PATH/HOME so the child can find binaries inside the sandbox.
  if (!cfg.envWhitelist.includes("PATH")) a.push("--setenv", "PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
  a.push("--setenv", "HOME", cfg.worktreePath);

  // Start in the worktree.
  a.push("--chdir", cfg.worktreePath);

  return a;
}

/** Build the full argv to exec: `bwrap <layers> -- <cmd...>`. */
export function buildBwrapInvocation(cfg: SandboxConfig, ctx: BwrapBuildContext, command: string[]): string[] {
  return [...buildBwrapArgs(cfg, ctx), "--", ...command];
}
