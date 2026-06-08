// Wave 33.5 Block A.3 — Ralph-style sessions-watch render.
//
// A pure frame renderer: given a snapshot it returns the text to paint. The CLI
// `mooter sessions watch` loop clears + repaints this on each poll. Keeping it
// pure (no I/O, no timers) makes it testable and lets Block H graft a Conductor
// panel by composing another renderer onto the same frame.

import type { SessionsState } from "./state.ts";
import type { AggregateResult } from "./aggregator.ts";
import type { SessionInfo } from "./types.ts";

function fmtAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0m";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h${min % 60}m`;
  return `${Math.floor(hr / 24)}d${hr % 24}h`;
}

function glyph(s: SessionInfo, now: number): string {
  if (s.live) return "●"; // live / focused
  const idleMin = (now - s.mtimeMs) / 60000;
  if (idleMin < 30) return "◐"; // recently active
  return "○"; // idle
}

export interface RenderOptions {
  now?: number;
  /** Extra panel text appended before the footer (Block H Conductor grafts here). */
  extraPanels?: string[];
  width?: number;
}

/** Render one frame of the sessions-watch TUI. */
export function renderDashboard(
  state: SessionsState,
  aggregate: AggregateResult | null,
  opts: RenderOptions = {},
): string {
  const now = opts.now ?? state.generatedAtMs;
  const out: string[] = [];

  out.push("🐮 Mooter Sessions  ·  cross-session intelligence");
  out.push("");

  // ── per-session cards (compact rows) ─────────────────────────────────────
  if (!state.sessions.length) {
    out.push("  no Claude Code sessions discovered yet.");
  } else {
    out.push("   session       age     prompts  term/branch          T0/T1/T2/T3   ~saved   wf");
    for (const s of state.sessions.slice(0, 12)) {
      const g = glyph(s, now);
      const sid = s.sessionId.slice(0, 8).padEnd(8);
      const age = fmtAge(s.ageMs).padEnd(7);
      const prm = String(s.prompts).padEnd(7);
      const term = (s.branch ?? s.terminalName ?? s.project.slice(0, 18)).slice(0, 18).padEnd(18);
      const mix = `${s.tiers.T0}/${s.tiers.T1}/${s.tiers.T2}/${s.tiers.T3}`.padEnd(13);
      const saved = `$${s.estSavedUsd.toFixed(2)}`.padEnd(7);
      const wf = s.workflow ? `${s.workflow.done}/${s.workflow.total}` : "–";
      out.push(` ${g} ${sid} ${age} ${prm} ${term} ${mix} ${saved} ${wf}`);
    }
  }
  out.push("");

  // ── global widgets ───────────────────────────────────────────────────────
  const totalSaved = state.sessions.reduce((a, s) => a + s.estSavedUsd, 0);
  const q = state.quota;
  out.push(`  Σ ~saved across sessions : $${totalSaved.toFixed(2)} (estimated)`);
  out.push(
    `  5h quota (est.)          : ${q.cloudCallsInWindow} cloud in window · ~${q.projectedCloudCalls} projected · resets ${q.windowResetInMin}m`,
  );
  if (aggregate && aggregate.categories.length) {
    const top = aggregate.categories[0];
    out.push(
      `  Pastor agg (advisory)    : ${aggregate.totalSessions} sessions · top "${top.category}" → ${top.modalTier} (${top.confidence.toFixed(2)})`,
    );
  }

  for (const panel of opts.extraPanels ?? []) {
    out.push("");
    out.push(panel);
  }

  out.push("");
  out.push("  ↑/↓ navigate · Enter focus · k kill · w worktrees · q quit · ? help");
  return out.join("\n");
}
