// Wave 33.5 Block H.2 — session heartbeats.
//
// Each Mooter-aware session writes a heartbeat every ~5s. Other sessions read
// them to know who is live; a heartbeat older than STALE_MS marks its session
// dead, which gates lock auto-recovery (H.8). No daemon — the writer is called
// from the session's own poll (or the conductor CLI on each invocation).

import { writeFileSync, readFileSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { heartbeatsDir } from "./paths.ts";
import type { Heartbeat } from "./types.ts";

export const STALE_MS = 30000;

function hbPath(sessionId: string, home?: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_.-]/g, "-");
  return join(heartbeatsDir(home), `${safe}.json`);
}

export interface WriteHeartbeatInput {
  sessionId: string;
  terminalName?: string;
  worktreePath?: string;
  branch?: string | null;
  intent?: string;
  activeLocks?: string[];
  pendingIntents?: string[];
  pid?: number;
}

export function writeHeartbeat(input: WriteHeartbeatInput, opts: { home?: string; now?: number } = {}): Heartbeat {
  const now = opts.now ?? Date.now();
  const hb: Heartbeat = {
    session_id: input.sessionId,
    terminal_name: input.terminalName ?? "unknown",
    worktree_path: input.worktreePath ?? "",
    branch: input.branch ?? null,
    intent: input.intent ?? "",
    last_heartbeat: new Date(now).toISOString(),
    last_heartbeat_ms: now,
    active_locks: input.activeLocks ?? [],
    pending_intents: input.pendingIntents ?? [],
    pid: input.pid ?? 0,
  };
  mkdirSync(heartbeatsDir(opts.home), { recursive: true });
  writeFileSync(hbPath(input.sessionId, opts.home), JSON.stringify(hb));
  return hb;
}

export function readHeartbeat(sessionId: string, home?: string): Heartbeat | null {
  try {
    return JSON.parse(readFileSync(hbPath(sessionId, home), "utf8")) as Heartbeat;
  } catch {
    return null;
  }
}

export function listHeartbeats(home?: string): Heartbeat[] {
  let files: string[];
  try {
    files = readdirSync(heartbeatsDir(home));
  } catch {
    return [];
  }
  const out: Heartbeat[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(join(heartbeatsDir(home), f), "utf8")) as Heartbeat);
    } catch {
      /* skip */
    }
  }
  return out;
}

export function isHeartbeatStale(hb: Heartbeat, now = Date.now()): boolean {
  return now - hb.last_heartbeat_ms > STALE_MS;
}

/** Remove stale heartbeat files; returns the reaped session ids. */
export function reapStaleHeartbeats(opts: { home?: string; now?: number } = {}): string[] {
  const now = opts.now ?? Date.now();
  const reaped: string[] = [];
  for (const hb of listHeartbeats(opts.home)) {
    if (isHeartbeatStale(hb, now)) {
      try {
        rmSync(hbPath(hb.session_id, opts.home), { force: true });
        reaped.push(hb.session_id);
      } catch {
        /* skip */
      }
    }
  }
  return reaped;
}

export function clearHeartbeat(sessionId: string, home?: string): void {
  try {
    rmSync(hbPath(sessionId, home), { force: true });
  } catch {
    /* best-effort */
  }
}
