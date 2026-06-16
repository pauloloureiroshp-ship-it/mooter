// Wave — macOS (Seatbelt / sandbox-exec) sandbox arg builder.
//
// Mirrors the SECURITY PROPERTIES that bubblewrap enforces on Linux, so a spawn
// behaves the same on macOS as on Linux:
//   L1 network    — policy "none" → fully denied; "local"/"cloud" keep host net
//                   (parity with the bwrap MVP: per-domain allowlisting needs a
//                   proxy and is tracked honestly as a known limitation, NOT
//                   silently claimed).
//   L2 filesystem — writes are allowed ONLY under the worktree (+ ephemeral tmp
//                   and /dev); every other path — incl. ~/.claude, ~/.mooter,
//                   ~/.ssh, project .env outside the worktree — is read-only.
//                   Reads stay broad (allow default) because node/ollama/claude
//                   need dyld + many system reads; the bwrap model also leaves the
//                   root readable (`--ro-bind / /`). The fail-closed property we
//                   reproduce is the same one bwrap guarantees: NO writes escape
//                   the worktree.
//   L3 secrets    — the child receives ONLY the whitelisted env, via `env -i`,
//                   plus a sane PATH + HOME=worktree (same as bwrap's --clearenv
//                   then --setenv of the whitelist).
//
// sandbox-exec is deprecated-but-functional on macOS; detect.ts already gates the
// "seatbelt" backend on `which sandbox-exec`.

import type { SandboxConfig } from "../types.ts";

export interface SeatbeltBuildContext {
  /** Env values to inject for the whitelisted names (already resolved by caller). */
  env: Record<string, string>;
}

/** Quote a path for SBPL (double-quoted, backslash-escaped). */
function sbq(s: string): string {
  return '"' + String(s).replace(/(["\\])/g, "\\$1") + '"';
}

/**
 * Build the Seatbelt profile (SBPL). Allow-by-default for reads/exec, then deny
 * ALL writes and re-allow only the worktree + ephemeral temp + /dev. For network
 * "none" we additionally deny all network (full egress block, like bwrap's
 * --unshare-net); "local"/"cloud" keep host net.
 */
export function buildSeatbeltProfile(cfg: SandboxConfig): string {
  const wt = cfg.worktreePath;
  const lines = [
    "(version 1)",
    "(allow default)",
    cfg.network === "none" ? "(deny network*)" : "",
    "(deny file-write*)",
    "(allow file-write*",
    "  (subpath " + sbq(wt) + ")",
    '  (subpath "/private/tmp")',
    '  (subpath "/private/var/folders")',
    '  (subpath "/private/var/tmp")',
    '  (subpath "/dev"))',
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Full argv to exec:
 *   sandbox-exec -p <profile> /usr/bin/env -i PATH=.. HOME=wt TMPDIR=wt <whitelist..> <cmd..>
 * `env -i` reproduces bwrap's --clearenv (only the whitelist + a sane PATH/HOME
 * reach the child). The worktree is HOME (matches bwrap) so per-user caches land
 * inside the only writable mount.
 */
export function buildSeatbeltInvocation(
  cfg: SandboxConfig,
  ctx: SeatbeltBuildContext,
  command: string[],
): string[] {
  const envArgs: string[] = ["-i"];
  // A sane PATH so the child resolves ollama/claude/node — bwrap sets the same
  // class of default PATH. Includes Homebrew (Apple Silicon + Intel) and system.
  if (!cfg.envWhitelist.includes("PATH")) {
    envArgs.push("PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin");
  }
  for (const name of cfg.envWhitelist) {
    if (Object.prototype.hasOwnProperty.call(ctx.env, name)) {
      envArgs.push(name + "=" + ctx.env[name]);
    }
  }
  envArgs.push("HOME=" + cfg.worktreePath, "TMPDIR=" + cfg.worktreePath);
  return ["sandbox-exec", "-p", buildSeatbeltProfile(cfg), "/usr/bin/env", ...envArgs, ...command];
}
