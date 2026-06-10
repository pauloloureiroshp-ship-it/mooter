// Wave 33.5 Block A.7 — terminal / worktree name resolution for the statusline.
//
// Resolution chain (first hit wins), all pure-from-inputs so the statusline can
// call it on the ≤10ms render budget with everything injected:
//   1. explicit user override   (`mooter terminal label <name>`)
//   2. $TMUX_PANE_TITLE         (tmux)
//   3. $ZELLIJ_SESSION_NAME     (Zellij)
//   4. $WEZTERM_PANE → pane id  (WezTerm; numeric, prefixed)
//   5. git worktree branch matched against cwd
//   6. directory basename
//
// The result is cached by PID at the call site (looked up once per session).

import { basename } from "node:path";

import { encodeProjectDir } from "./worktrees.ts";
import type { WorktreeInfo } from "./types.ts";

export interface TerminalContext {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Cached worktree list (caller polls git at most every 30s). */
  worktrees?: WorktreeInfo[];
  /** Explicit override from `mooter terminal label`. */
  override?: string | null;
}

export interface TerminalLabel {
  name: string;
  /** Which rung of the chain produced it — useful for `mooter sessions show`. */
  source: "override" | "tmux" | "zellij" | "wezterm" | "worktree" | "cwd";
}

function clean(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  return t.length ? t : null;
}

export function resolveTerminalLabel(ctx: TerminalContext = {}): TerminalLabel {
  const env = ctx.env ?? process.env;
  const cwd = ctx.cwd ?? process.cwd();

  const override = clean(ctx.override);
  if (override) return { name: override, source: "override" };

  const tmux = clean(env.TMUX_PANE_TITLE);
  if (tmux) return { name: tmux, source: "tmux" };

  const zellij = clean(env.ZELLIJ_SESSION_NAME);
  if (zellij) return { name: zellij, source: "zellij" };

  const wezterm = clean(env.WEZTERM_PANE);
  if (wezterm) return { name: `pane-${wezterm}`, source: "wezterm" };

  if (ctx.worktrees && ctx.worktrees.length) {
    const encoded = encodeProjectDir(cwd);
    const exact = ctx.worktrees.find((w) => w.encoded === encoded);
    if (exact && exact.branch) return { name: exact.branch, source: "worktree" };
    // cwd may be a subdir of a worktree — fall back to longest path prefix.
    const prefix = ctx.worktrees
      .filter((w) => cwd === w.path || cwd.startsWith(w.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (prefix && prefix.branch) return { name: prefix.branch, source: "worktree" };
  }

  return { name: basename(cwd) || "session", source: "cwd" };
}

/** Statusline chip text for A.7, e.g. `(wave33_5-historic)`. Empty when hidden. */
export function terminalChip(ctx: TerminalContext = {}, hidden = false): string {
  if (hidden) return "";
  const { name } = resolveTerminalLabel(ctx);
  return `(${name})`;
}
