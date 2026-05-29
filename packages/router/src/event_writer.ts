// event_writer.ts — local JSONL writer for MooterEvent (Pastor Wave 2 Day 4).
//
// Local-only. Never uploads. Hub upload is Wave 3 D4 and lands behind an
// explicit consent flow; this module never reaches the network.
//
// Layout under MOOTER_HOME (default: ~/.mooter):
//
//   sessions/<session_id>.jsonl   — append-only, one event per line, mtime
//                                   reflects last activity in that session
//   events/<YYYY-MM-DD>.jsonl     — daily roll-up, idempotent (events keyed by
//                                   event_id so re-running rollupDaily(date)
//                                   never duplicates)
//
// Permissions:
//   - directories  mode 0o700 (owner-only)
//   - files        mode 0o600 (owner-only)
//
// Retention (pruneRetention):
//   - events/  files older than 30 days  → deleted
//   - sessions/ files older than 90 days → deleted
//
// All I/O failures are swallowed at write() so a broken disk never breaks a
// turn — telemetry is best-effort. Callers can opt in to stricter behaviour
// by awaiting `init()` separately first.

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MooterEvent } from "./mooter_event.ts";

const DEFAULT_HOME = join(homedir(), ".mooter");

export const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface RollupResult {
  events_written: number;
  sessions_touched: number;
}

export interface PruneResult {
  events_pruned: number;
  sessions_pruned: number;
}

export class EventWriter {
  private readonly home: string;
  private readonly sessionsDir: string;
  private readonly eventsDir: string;
  private initialized = false;

  constructor(home: string = process.env.MOOTER_HOME ?? DEFAULT_HOME) {
    this.home = home;
    this.sessionsDir = join(home, "sessions");
    this.eventsDir = join(home, "events");
  }

  /** Ensure the home/sessions/events directories exist with 0o700 perms. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.sessionsDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.eventsDir, { recursive: true, mode: 0o700 });
    // mkdir respects umask on existing dirs; chmod is idempotent and cheap.
    await fs.chmod(this.sessionsDir, 0o700).catch(() => {});
    await fs.chmod(this.eventsDir, 0o700).catch(() => {});
    this.initialized = true;
  }

  /**
   * Append one event as a JSONL line to its session file.
   * Best-effort: failures are swallowed so telemetry never breaks a turn.
   */
  async write(event: MooterEvent): Promise<void> {
    try {
      await this.init();
      const line = JSON.stringify(event) + "\n";
      const file = join(this.sessionsDir, `${event.session_id}.jsonl`);
      await fs.appendFile(file, line, { mode: 0o600 });
    } catch {
      // best-effort
    }
  }

  /**
   * Consolidate every event with timestamp_utc starting with `date` (YYYY-MM-DD)
   * from each session file into events/<date>.jsonl. Idempotent: dedupes by
   * event_id, so running twice for the same day yields the same file content.
   */
  async rollupDaily(date: string): Promise<RollupResult> {
    await this.init();
    const eventsFile = join(this.eventsDir, `${date}.jsonl`);

    // 1. Read existing roll-up event_ids so we never write a duplicate.
    const seen = new Set<string>();
    try {
      const existing = await fs.readFile(eventsFile, "utf8");
      for (const line of existing.split("\n")) {
        if (!line) continue;
        try {
          const ev = JSON.parse(line) as Partial<MooterEvent>;
          if (ev.event_id) seen.add(ev.event_id);
        } catch {
          // skip malformed
        }
      }
    } catch {
      // no existing file — fresh roll-up
    }

    // 2. Scan every session file and collect matching, unseen events.
    const sessions = await fs.readdir(this.sessionsDir).catch(() => [] as string[]);
    const toWrite: string[] = [];
    const sessionsTouched = new Set<string>();
    for (const file of sessions) {
      if (!file.endsWith(".jsonl")) continue;
      const content = await fs.readFile(join(this.sessionsDir, file), "utf8").catch(() => "");
      if (!content) continue;
      for (const line of content.split("\n")) {
        if (!line) continue;
        let ev: Partial<MooterEvent>;
        try {
          ev = JSON.parse(line) as Partial<MooterEvent>;
        } catch {
          continue;
        }
        if (!ev.timestamp_utc || !ev.event_id) continue;
        if (!ev.timestamp_utc.startsWith(date)) continue;
        if (seen.has(ev.event_id)) continue;
        seen.add(ev.event_id);
        toWrite.push(line);
        sessionsTouched.add(file);
      }
    }

    if (toWrite.length > 0) {
      await fs.appendFile(eventsFile, toWrite.join("\n") + "\n", { mode: 0o600 });
    }

    return {
      events_written: toWrite.length,
      sessions_touched: sessionsTouched.size,
    };
  }

  /** Delete events/ files older than 30d and sessions/ files older than 90d. */
  async pruneRetention(now: number = Date.now()): Promise<PruneResult> {
    await this.init();
    let eventsPruned = 0;
    let sessionsPruned = 0;

    const events = await fs.readdir(this.eventsDir).catch(() => [] as string[]);
    for (const file of events) {
      const path = join(this.eventsDir, file);
      const stat = await fs.stat(path).catch(() => null);
      if (!stat) continue;
      if (now - stat.mtimeMs > EVENT_RETENTION_MS) {
        await fs.unlink(path).catch(() => {});
        eventsPruned++;
      }
    }

    const sessions = await fs.readdir(this.sessionsDir).catch(() => [] as string[]);
    for (const file of sessions) {
      const path = join(this.sessionsDir, file);
      const stat = await fs.stat(path).catch(() => null);
      if (!stat) continue;
      if (now - stat.mtimeMs > SESSION_RETENTION_MS) {
        await fs.unlink(path).catch(() => {});
        sessionsPruned++;
      }
    }

    return { events_pruned: eventsPruned, sessions_pruned: sessionsPruned };
  }

  /** Test-only inspector. Returns absolute paths to the writer's dirs. */
  getDirs(): { home: string; sessions: string; events: string } {
    return { home: this.home, sessions: this.sessionsDir, events: this.eventsDir };
  }
}

/** Module-level singleton. Tests instantiate their own writer with a tmp home. */
export const eventWriter = new EventWriter();
