// Wave 33.5 Block H — Worktree Conductor types.

/** A held lock, serialized to ~/.mooter/orchestration/locks/<resource>.lock */
export interface LockFile {
  resource: string;
  acquired_by: string; // session id
  terminal_name: string;
  intent: string;
  acquired_at: string; // ISO
  acquired_at_ms: number;
  ttl_seconds: number;
  pid: number;
}

/** A session heartbeat, at ~/.mooter/orchestration/heartbeats/<session-id>.json */
export interface Heartbeat {
  session_id: string;
  terminal_name: string;
  worktree_path: string;
  branch: string | null;
  intent: string;
  last_heartbeat: string; // ISO
  last_heartbeat_ms: number;
  active_locks: string[];
  pending_intents: string[];
  pid: number;
}

/** A queued serial intent (Sequencer). */
export interface QueueEntry {
  id: string;
  session_id: string;
  terminal_name: string;
  intent: string;
  resource: string;
  queued_at_ms: number;
  status: "queued" | "running" | "done" | "cancelled";
}

/** One line of the operations history log. */
export interface HistoryEntry {
  ts_ms: number;
  session_id: string;
  terminal_name: string;
  op: "ACQUIRED" | "RELEASED" | "QUEUED" | "DEQUEUED" | "FORCE_RELEASED" | "REAPED" | "WAIT" | "DENIED";
  resource: string;
  detail?: string;
}

export type AcquireOutcome =
  | { acquired: true; lock: LockFile }
  | { acquired: false; heldBy: LockFile; stale: boolean };
