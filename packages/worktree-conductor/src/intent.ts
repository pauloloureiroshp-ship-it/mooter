// Wave 33.5 Block H.4 — intent detection.
//
// Maps a shell command (or an MCP write) to the orchestration RESOURCE it must
// serialize on. Used by the auto-lock hooks: a `git push` acquires the per-repo
// git lock; a `git tag` the tag lock; a `wrangler deploy` the hub-deploy lock; a
// Notion write the notion lock. Pure + deterministic so the hook stays ≤5s.

import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { join, dirname } from "node:path";

/** Find the git toplevel by walking up for a .git dir/file. Pure file reads. */
export function gitRoot(startCwd: string): string | null {
  let dir = startCwd;
  for (let i = 0; i < 12; i++) {
    try {
      statSync(join(dir, ".git"));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
  return null;
}

/** Stable per-repo resource id: `git-<8hex>` from the repo root path. */
export function repoResource(cwd: string): string {
  const root = gitRoot(cwd) ?? cwd;
  return `git-${createHash("sha1").update(root).digest("hex").slice(0, 8)}`;
}

export interface DetectedIntent {
  resource: string;
  intent: string;
}

/**
 * Detect which resource a shell command must lock, or null if it needs none.
 * Order matters: the most specific git op (tag) is checked before the generic
 * push so a `git tag` never falls through to the repo lock.
 */
export function detectShellIntent(cmd: string, cwd: string): DetectedIntent | null {
  const c = cmd.trim();
  if (/\bgit\s+tag\b/.test(c) && !/\bgit\s+tag\s+(-l|--list)\b/.test(c)) {
    return { resource: "tag", intent: c.slice(0, 80) };
  }
  if (/\bgit\s+push\b/.test(c)) {
    return { resource: repoResource(cwd), intent: c.slice(0, 80) };
  }
  if (/\bwrangler\s+deploy\b/.test(c) || /\bwrangler\s+d1\s+(execute|migrations)\b/.test(c)) {
    return { resource: "deploy-hub", intent: c.slice(0, 80) };
  }
  if (/\bnpm\s+publish\b/.test(c)) {
    return { resource: "npm-publish", intent: c.slice(0, 80) };
  }
  return null;
}

/** Notion (and other MCP) writes serialize on the notion lock. */
export function detectMcpIntent(toolName: string): DetectedIntent | null {
  if (/notion/i.test(toolName) && /(write|create|update|append|page|comment)/i.test(toolName)) {
    return { resource: "notion", intent: toolName };
  }
  return null;
}
