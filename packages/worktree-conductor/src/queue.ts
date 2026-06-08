// Wave 33.5 Block H.6 — cross-session intent queue (Sequencer).
//
// For operations that must be SERIAL across sessions (tag bumps, hub deploys,
// Notion mass-writes), sessions append intents here and execute in FIFO order.
// Stored as an append-only jsonl with status rewrites compacted on read.

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

import { queuePath } from "./paths.ts";
import { appendHistory } from "./history.ts";
import type { QueueEntry } from "./types.ts";

function load(home?: string): QueueEntry[] {
  let data: string;
  try {
    data = readFileSync(queuePath(home), "utf8");
  } catch {
    return [];
  }
  const out: QueueEntry[] = [];
  for (const line of data.split("\n")) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as QueueEntry);
    } catch {
      /* skip */
    }
  }
  return out;
}

function save(entries: QueueEntry[], home?: string): void {
  const p = queuePath(home);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : ""));
}

export interface EnqueueInput {
  sessionId: string;
  terminalName?: string;
  intent: string;
  resource: string;
}

export function enqueue(input: EnqueueInput, opts: { home?: string; now?: number } = {}): QueueEntry {
  const now = opts.now ?? Date.now();
  const entries = load(opts.home);
  const entry: QueueEntry = {
    id: `q_${createHash("sha1").update(input.intent + now + input.sessionId).digest("hex").slice(0, 8)}`,
    session_id: input.sessionId,
    terminal_name: input.terminalName ?? "unknown",
    intent: input.intent,
    resource: input.resource,
    queued_at_ms: now,
    status: "queued",
  };
  entries.push(entry);
  save(entries, opts.home);
  appendHistory(
    { ts_ms: now, session_id: input.sessionId, terminal_name: entry.terminal_name, op: "QUEUED", resource: input.resource, detail: input.intent },
    opts.home,
  );
  return entry;
}

/** FIFO list of still-pending entries (queued or running), oldest first. */
export function pending(home?: string): QueueEntry[] {
  return load(home)
    .filter((e) => e.status === "queued" || e.status === "running")
    .sort((a, b) => a.queued_at_ms - b.queued_at_ms);
}

export function listQueue(home?: string): QueueEntry[] {
  return load(home).sort((a, b) => a.queued_at_ms - b.queued_at_ms);
}

/** The next entry to run = oldest queued. Returns null when the queue is idle. */
export function head(home?: string): QueueEntry | null {
  return pending(home).find((e) => e.status === "queued") ?? null;
}

function setStatus(id: string, status: QueueEntry["status"], opts: { home?: string; now?: number } = {}): QueueEntry | null {
  const entries = load(opts.home);
  const e = entries.find((x) => x.id === id);
  if (!e) return null;
  e.status = status;
  save(entries, opts.home);
  if (status === "done" || status === "cancelled") {
    appendHistory(
      { ts_ms: opts.now ?? Date.now(), session_id: e.session_id, terminal_name: e.terminal_name, op: "DEQUEUED", resource: e.resource, detail: `${status}: ${e.intent}` },
      opts.home,
    );
  }
  return e;
}

export const markRunning = (id: string, opts?: { home?: string; now?: number }) => setStatus(id, "running", opts);
export const markDone = (id: string, opts?: { home?: string; now?: number }) => setStatus(id, "done", opts);
export const cancel = (id: string, opts?: { home?: string; now?: number }) => setStatus(id, "cancelled", opts);
