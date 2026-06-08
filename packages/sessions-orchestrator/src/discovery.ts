// Wave 33.5 Block A — cross-session discovery.
//
// Unlike `mooter sessions list` (single-project, Wave 33), this scans EVERY
// project folder under ~/.claude/projects so the orchestrator can reason across
// all live Claude Code sessions on the machine. All reads are best-effort and
// crash-safe: a missing/corrupt file degrades to zero, never an exception.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { SessionInfo, TierMix } from "./types.ts";

// Nominal $ saved per routed call vs an all-Opus baseline (avg ~3k-in/0.8k-out):
// Opus ≈ $0.035, Haiku ≈ $0.007, Sonnet ≈ $0.021, local $0. Mirrors the Wave 33
// `sessions list` table so cross-session figures stay consistent.
export const SAVED_PER_CALL: Record<keyof TierMix, number> = {
  T0: 0.035,
  T1: 0.028,
  T2: 0.014,
  T3: 0,
};

export interface DiscoverOptions {
  /** ~ root (defaults to os.homedir()). Injectable for tests. */
  home?: string;
  /** "now" in ms (defaults to Date.now()). */
  now?: number;
  /** The live session id (defaults to env CLAUDE_SESSION_ID). */
  liveSessionId?: string | null;
  /** Treat sessions touched within this many ms as "active" (defaults 30 min). */
  activeWithinMs?: number;
}

function projectsRoot(home: string): string {
  return join(home, ".claude", "projects");
}

function decisionsLogPath(home: string): string {
  return join(home, ".claude", "tools", "router", "decisions.log");
}

/** Count real user-turn prompts in a transcript (tool_result-only turns excluded). */
export function countUserPrompts(file: string): number {
  let data: string;
  try {
    data = readFileSync(file, "utf8");
  } catch {
    return 0;
  }
  let n = 0;
  for (const line of data.split("\n")) {
    if (!line) continue;
    if (line.indexOf('"type":"user"') === -1) continue;
    try {
      const o = JSON.parse(line);
      if (o.type !== "user" || o.isMeta) continue;
      const content = o.message && o.message.content;
      if (typeof content === "string") {
        if (content.trim()) n++;
      } else if (Array.isArray(content)) {
        if (content.some((b: { type?: string }) => b && b.type !== "tool_result")) n++;
      }
    } catch {
      /* skip malformed line */
    }
  }
  return n;
}

/** Group classified decisions by session_id into a tier histogram (global log). */
export function tierBySession(home: string): Map<string, TierMix> {
  const map = new Map<string, TierMix>();
  let data: string;
  try {
    data = readFileSync(decisionsLogPath(home), "utf8");
  } catch {
    return map;
  }
  for (const line of data.split("\n")) {
    if (!line || line.indexOf('"tier"') === -1) continue;
    try {
      const o = JSON.parse(line);
      const sid: unknown = o.session_id;
      const tier: unknown = o.tier;
      if (typeof sid !== "string" || typeof tier !== "string" || !/^T[0-3]$/.test(tier)) continue;
      let rec = map.get(sid);
      if (!rec) {
        rec = { T0: 0, T1: 0, T2: 0, T3: 0 };
        map.set(sid, rec);
      }
      rec[tier as keyof TierMix]++;
    } catch {
      /* skip */
    }
  }
  return map;
}

export function estSaved(rec: TierMix): number {
  return (
    rec.T0 * SAVED_PER_CALL.T0 +
    rec.T1 * SAVED_PER_CALL.T1 +
    rec.T2 * SAVED_PER_CALL.T2 +
    rec.T3 * SAVED_PER_CALL.T3
  );
}

/**
 * Discover every Claude Code session across all local projects, newest first.
 * Sessions touched within `activeWithinMs` (default 30 min) sort to the top and
 * are flagged live=true; the env/opts live id always wins as live.
 */
export function discoverSessions(opts: DiscoverOptions = {}): SessionInfo[] {
  const home = opts.home ?? homedir();
  const now = opts.now ?? Date.now();
  const liveId = opts.liveSessionId ?? process.env.CLAUDE_SESSION_ID ?? null;
  const activeWithin = opts.activeWithinMs ?? 30 * 60 * 1000;

  const root = projectsRoot(home);
  if (!existsSync(root)) return [];

  const tiers = tierBySession(home);
  const sessions: SessionInfo[] = [];

  let projects: string[];
  try {
    projects = readdirSync(root);
  } catch {
    return [];
  }

  for (const project of projects) {
    const dir = join(root, project);
    let entries: string[];
    try {
      if (!statSync(dir).isDirectory()) continue;
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.endsWith(".jsonl")) continue;
      const full = join(dir, f);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      const sid = f.replace(/\.jsonl$/, "");
      const birth = st.birthtimeMs > 0 ? st.birthtimeMs : st.ctimeMs;
      const rec = tiers.get(sid) ?? { T0: 0, T1: 0, T2: 0, T3: 0 };
      sessions.push({
        sessionId: sid,
        project,
        transcriptPath: full,
        birthMs: birth,
        mtimeMs: st.mtimeMs,
        ageMs: Math.max(0, now - birth),
        prompts: countUserPrompts(full),
        tiers: rec,
        estSavedUsd: estSaved(rec),
        live: sid === liveId || now - st.mtimeMs <= activeWithin,
        terminalName: null,
        worktreePath: null,
        branch: null,
        workflow: null,
      });
    }
  }

  sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
  // The explicit live id (if any) is authoritative; otherwise newest-active wins.
  if (liveId) {
    for (const s of sessions) s.live = s.sessionId === liveId;
  }
  return sessions;
}
