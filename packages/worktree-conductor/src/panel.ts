// Wave 33.5 Block H.7 — Conductor panel for the sessions-watch TUI.
//
// Pure renderer: given a status snapshot it returns the boxed panel text that
// Block A's renderDashboard composes via its `extraPanels` hook.

import type { ConductorStatus } from "./conductor.ts";

function fmtAgo(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

export function renderConductorPanel(st: ConductorStatus): string {
  const now = st.generatedAtMs;
  const lines: string[] = [];
  lines.push("┌─ Conductor ─────────────────────────────────────────┐");
  lines.push(`│ Active locks: ${st.locks.length}`);
  for (const l of st.locks.slice(0, 4)) {
    const flag = l.holderDead ? "⚠ dead" : l.stale ? "stale" : `${fmtAgo(l.acquired_at_ms, now)}`;
    lines.push(`│   🔒 ${l.resource} (${l.terminal_name}, ${flag})`);
  }
  lines.push(`│ Pending queue: ${st.queue.length}`);
  for (const q of st.queue.slice(0, 4)) {
    lines.push(`│   ${q.status === "running" ? "▶" : "·"} ${q.terminal_name} — ${q.intent.slice(0, 32)}`);
  }
  lines.push(`│ Live sessions: ${st.liveSessions.length}${st.staleSessions.length ? ` (+${st.staleSessions.length} stale)` : ""}`);
  lines.push("└─────────────────────────────────────────────────────┘");
  return lines.join("\n");
}
