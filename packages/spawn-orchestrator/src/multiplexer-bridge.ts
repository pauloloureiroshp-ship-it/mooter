// Wave 58 Phase E — terminal-multiplexer bridge with honest capability detection.
//
// Real sandboxed launches (runner.ts → assembleBwrap) only work on Linux with
// bubblewrap. On macOS/Windows there is NO sandbox backend (detect.ts → "none"),
// so this bridge is the abstraction layer that decides HOW a spawn's command is
// surfaced once the pipeline has produced an argv:
//
//   - If a terminal multiplexer is present (tmux / zellij / wezterm), drop the
//     command into a NEW PANE so the user can watch it live.
//   - If none is present (the common case, and ALWAYS on Windows where `command
//     -v` finds nothing), fall back to a plain child_process spawn with PIPED
//     stdio — cross-platform, no PTY, no new dependency.
//
// The Win32-null pattern mirrors vram_detect.js line 47: on win32 the POSIX
// `command -v` probe is meaningless, so detectMultiplexer() returns null without
// even shelling out. A capability struct documents what works where so callers
// (and tests) never have to guess.
//
// NOTHING here pretends to sandbox. Sandboxing is runner.ts's job and it throws
// on platforms without bubblewrap. This layer is purely about display/transport.

import { spawn as nodeSpawn, execFileSync } from "node:child_process";
import { platform as osPlatform } from "node:os";

/** The multiplexers we know how to drive, in detection-preference order. */
export const KNOWN_MULTIPLEXERS = ["tmux", "zellij", "wezterm"] as const;
export type Multiplexer = (typeof KNOWN_MULTIPLEXERS)[number];

/** Injectable POSIX `command -v <bin>` probe (presence check). */
export type WhichRunner = (bin: string) => boolean;

const defaultWhich: WhichRunner = (bin) => {
  try {
    // `command -v` is the portable POSIX way to test for a binary. It is a shell
    // builtin, so we run it through `sh -c`. Absent on Windows — see detect below.
    execFileSync("sh", ["-c", `command -v ${bin}`], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
};

/**
 * Detect an available terminal multiplexer, preferring tmux → zellij → wezterm.
 *
 * Win32-null pattern (cf. vram_detect.js:47): on Windows none of these ship with
 * a POSIX `command -v`, and even where the binaries exist the pane-injection CLIs
 * we drive (`tmux send-keys`, etc.) are not the Windows console model — so we
 * short-circuit to null and let callers take the pipe fallback. Honest over
 * optimistic: better to pipe reliably than to claim a pane we can't drive.
 */
export function detectMultiplexer(
  which: WhichRunner = defaultWhich,
  plat: NodeJS.Platform = osPlatform(),
): Multiplexer | null {
  if (plat === "win32") return null; // Win32-null: no POSIX multiplexer story here
  for (const mux of KNOWN_MULTIPLEXERS) {
    if (which(mux)) return mux;
  }
  return null;
}

/** What the bridge can actually do on a given platform — for docs and the chip. */
export interface BridgeCapability {
  platform: NodeJS.Platform;
  /** The detected multiplexer, or null when none is usable (always on win32). */
  multiplexer: Multiplexer | null;
  /** True when we can open a live pane (a multiplexer was detected). */
  canPane: boolean;
  /** Pipe fallback is always available (child_process, cross-platform, no PTY). */
  canPipe: true;
  /** The transport a spawn would take right now. */
  transport: "pane" | "pipe";
  /** One-line human explanation (surfaced in CLI / chip). */
  note: string;
}

export function describeCapability(
  which: WhichRunner = defaultWhich,
  plat: NodeJS.Platform = osPlatform(),
): BridgeCapability {
  const multiplexer = detectMultiplexer(which, plat);
  const canPane = multiplexer !== null;
  const note = canPane
    ? `${multiplexer} detected — spawns open in a live pane`
    : plat === "win32"
      ? "Windows: no POSIX multiplexer; spawns use piped child_process (no PTY)"
      : "no tmux/zellij/wezterm found; spawns use piped child_process (no PTY)";
  return {
    platform: plat,
    multiplexer,
    canPane,
    canPipe: true,
    transport: canPane ? "pane" : "pipe",
    note,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Launch transports
// ────────────────────────────────────────────────────────────────────────

export interface LaunchHooks {
  onData: (s: string) => void;
  onExit: (code: number) => void;
}

export interface LaunchHandle {
  pid: number | null;
  transport: "pane" | "pipe";
}

/** Injectable raw spawner so spawnInPane/spawnPipe never fork in tests. */
export type RawSpawn = (
  bin: string,
  args: string[],
  hooks: LaunchHooks,
) => { pid: number | null };

const defaultRawSpawn: RawSpawn = (bin, args, hooks) => {
  const child = nodeSpawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d) => hooks.onData(d.toString()));
  child.stderr?.on("data", (d) => hooks.onData(d.toString()));
  child.on("close", (code) => hooks.onExit(code ?? 0));
  child.on("error", (e) => {
    hooks.onData(`spawn error: ${e.message}\n`);
    hooks.onExit(127);
  });
  return { pid: child.pid ?? null };
};

/**
 * Build the multiplexer CLI argv that injects `command` into a NEW pane/tab for
 * the given backend. Pure — returns argv only, so it is fully unit-testable.
 *
 *   tmux    → `tmux new-window <cmd…>`        (a fresh window in the session)
 *   zellij  → `zellij action new-pane -- <cmd…>`
 *   wezterm → `wezterm cli spawn -- <cmd…>`
 */
export function paneArgv(mux: Multiplexer, command: string[]): string[] {
  switch (mux) {
    case "tmux":
      return ["tmux", "new-window", ...command];
    case "zellij":
      return ["zellij", "action", "new-pane", "--", ...command];
    case "wezterm":
      return ["wezterm", "cli", "spawn", "--", ...command];
  }
}

/**
 * Launch `command` inside a multiplexer pane. The pane process is detached from
 * our stdio (the multiplexer owns it), so onData typically only sees the CLI's
 * own ack; onExit reports whether the pane-creation command itself succeeded.
 */
export function spawnInPane(
  mux: Multiplexer,
  command: string[],
  hooks: LaunchHooks,
  rawSpawn: RawSpawn = defaultRawSpawn,
): LaunchHandle {
  const argv = paneArgv(mux, command);
  const { pid } = rawSpawn(argv[0], argv.slice(1), hooks);
  return { pid, transport: "pane" };
}

/**
 * Cross-platform fallback: run `command` as a child_process with piped stdio.
 * No PTY, no new dependency. This is what Windows always gets, and any POSIX box
 * without a multiplexer. argv[0] is the binary; the rest are its args.
 */
export function spawnPipe(
  command: string[],
  hooks: LaunchHooks,
  rawSpawn: RawSpawn = defaultRawSpawn,
): LaunchHandle {
  const { pid } = rawSpawn(command[0], command.slice(1), hooks);
  return { pid, transport: "pipe" };
}

export interface BridgeLaunchOptions {
  which?: WhichRunner;
  platform?: NodeJS.Platform;
  rawSpawn?: RawSpawn;
  /** Force a transport (tests / explicit caller choice). */
  forceMultiplexer?: Multiplexer | null;
}

/**
 * The one entry point callers use: detect the backend and launch `command`
 * through it (pane when a multiplexer is present, piped child_process otherwise).
 * Returns the handle plus the resolved capability so the caller can report
 * honestly which transport actually carried the spawn.
 */
export function launchViaBridge(
  command: string[],
  hooks: LaunchHooks,
  opts: BridgeLaunchOptions = {},
): { handle: LaunchHandle; capability: BridgeCapability } {
  const which = opts.which ?? defaultWhich;
  const plat = opts.platform ?? osPlatform();
  const mux =
    opts.forceMultiplexer !== undefined ? opts.forceMultiplexer : detectMultiplexer(which, plat);
  const capability = describeCapability(() => mux !== null, plat);
  // describeCapability re-derives transport from a stub which() so the reported
  // capability matches the mux we actually resolved above (honest, not a 2nd probe).
  capability.multiplexer = mux;
  capability.canPane = mux !== null;
  capability.transport = mux !== null ? "pane" : "pipe";

  const handle =
    mux !== null
      ? spawnInPane(mux, command, hooks, opts.rawSpawn)
      : spawnPipe(command, hooks, opts.rawSpawn);
  return { handle, capability };
}
