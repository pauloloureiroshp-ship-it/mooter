// Wave 33.5 Block H.3 — `mooter conductor` CLI handlers.
//
// Sub-commands: status · lock · unlock · queue · wait · heartbeats · locks ·
// history · reap · auto-lock · auto-unlock · beat. Each returns {exitCode,output}.
// Auto-lock/auto-unlock are the hook entrypoints (H.4): non-blocking, never exit
// >1 so a hook can't wedge Claude Code's native flow.

import { tryAcquire, release, listLocks, setLockIntent } from "./locks.ts";
import { acquireWithRecovery, forceRelease, status, reap } from "./conductor.ts";
import { listHeartbeats, writeHeartbeat, clearHeartbeat } from "./heartbeat.ts";
import { enqueue, listQueue, markDone, cancel } from "./queue.ts";
import { readHistory } from "./history.ts";
import { detectShellIntent } from "./intent.ts";
import { renderConductorPanel } from "./panel.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface ConductorCmdOptions {
  home?: string;
  now?: number;
  cwd?: string;
  sessionId?: string;
  terminalName?: string;
  pid?: number;
}

function owner(opts: ConductorCmdOptions) {
  return {
    sessionId: opts.sessionId ?? process.env.CLAUDE_SESSION_ID ?? "unknown",
    terminalName: opts.terminalName ?? process.env.MOOTER_TERMINAL_NAME ?? "unknown",
    pid: opts.pid ?? process.pid,
  };
}

/**
 * Realise the documented "writer called … on each conductor CLI invocation" rule
 * (see heartbeat.ts) that was never wired up: every conductor command run from a
 * live session refreshes that session's heartbeat, so `status` always counts the
 * live caller — plus any other session that touched the conductor within
 * STALE_MS. Without this, the heartbeats dir stayed empty unless a session ran
 * `beat` explicitly, so `conductor status` reported 0 live sessions even with
 * concurrent Claude Code sessions active (the Wave 34.5.A bug).
 *
 * Guards: skip when there is no real session id (so ad-hoc shells never create a
 * phantom "unknown" heartbeat) and for `stop`/`beat` — the former is clearing
 * this session's heartbeat on purpose, the latter writes its own below.
 * Best-effort: a heartbeat write must never wedge a conductor command.
 */
function refreshOwnHeartbeat(sub: string, opts: ConductorCmdOptions): void {
  if (sub === "stop" || sub === "beat") return;
  const sessionId = opts.sessionId ?? process.env.CLAUDE_SESSION_ID;
  if (!sessionId || sessionId === "unknown") return;
  const o = owner(opts);
  try {
    writeHeartbeat(
      {
        sessionId: o.sessionId,
        terminalName: o.terminalName,
        worktreePath: opts.cwd ?? process.cwd(),
        intent: "active",
        activeLocks: listLocks(opts.home).filter((l) => l.acquired_by === o.sessionId).map((l) => l.resource),
        pid: o.pid,
      },
      { home: opts.home, now: opts.now },
    );
  } catch {
    /* best-effort: heartbeat I/O must never break a conductor command */
  }
}

function flag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
}

export function runConductor(args: string[], opts: ConductorCmdOptions = {}): CmdResult {
  const sub = args[0] ?? "status";
  const rest = args.slice(1);
  const home = opts.home;
  const now = opts.now;
  const cwd = opts.cwd ?? process.cwd();

  // A live session that talks to the conductor is, by definition, live — record
  // it so `status` counts concurrent sessions correctly (Wave 34.5.A fix).
  refreshOwnHeartbeat(sub, opts);

  switch (sub) {
    case "status": {
      return { exitCode: 0, output: renderConductorPanel(status({ home, now })) };
    }

    case "locks": {
      const locks = listLocks(home);
      if (!locks.length) return { exitCode: 0, output: "no active locks." };
      return {
        exitCode: 0,
        output: locks.map((l) => `🔒 ${l.resource} · ${l.terminal_name} (${l.acquired_by.slice(0, 8)}) · ${l.intent || "—"}`).join("\n"),
      };
    }

    case "heartbeats": {
      const hbs = listHeartbeats(home);
      if (!hbs.length) return { exitCode: 0, output: "no live sessions." };
      return {
        exitCode: 0,
        output: hbs.map((h) => `${h.session_id.slice(0, 8)} · ${h.terminal_name} · ${h.branch ?? "?"} · locks:[${h.active_locks.join(",")}]`).join("\n"),
      };
    }

    case "lock": {
      const resource = rest[0];
      if (!resource) return { exitCode: 1, output: "usage: mooter conductor lock <resource> [--intent <s>]" };
      const r = acquireWithRecovery(resource, owner(opts), { home, now });
      if (r.outcome.acquired) {
        const intent = flag(rest, "--intent");
        if (intent) setLockIntent(resource, intent, home);
        return { exitCode: 0, output: `acquired 🔒 ${resource}` };
      }
      const held = r.outcome.heldBy;
      const lines = [
        `🐮 Mooter Conductor`,
        ``,
        `Lock '${resource}' held by ${held.acquired_by.slice(0, 8)} ('${held.terminal_name}')`,
        `Intent: '${held.intent || "—"}'  (TTL ${held.ttl_seconds}s${r.outcome.stale ? ", EXPIRED" : ""})`,
        ``,
        r.recoverable
          ? `Holder looks DEAD (heartbeat stale). Force-release with:\n  mooter conductor unlock ${resource} --force`
          : `Options:\n  [w] wait — mooter conductor lock ${resource} --wait 60\n  [c] cancel your intent`,
      ];
      return { exitCode: 1, output: lines.join("\n") };
    }

    case "unlock": {
      const resource = rest[0];
      if (!resource) return { exitCode: 1, output: "usage: mooter conductor unlock <resource> [--force]" };
      const force = rest.includes("--force");
      const ok = force
        ? forceRelease(resource, owner(opts).sessionId, { home, now })
        : release(resource, owner(opts).sessionId, { home, now });
      return ok
        ? { exitCode: 0, output: `released ${resource}${force ? " (forced)" : ""}` }
        : { exitCode: 1, output: `could not release ${resource} (not held, or not yours — use --force if the holder is dead)` };
    }

    case "queue": {
      const action = rest[0];
      if (action === "list" || !action) {
        const q = listQueue(home);
        if (!q.length) return { exitCode: 0, output: "queue empty." };
        return {
          exitCode: 0,
          output: q.map((e, i) => `${i + 1}. ${e.session_id.slice(0, 8)} (${e.terminal_name}) — ${e.intent} [${e.status}]`).join("\n"),
        };
      }
      if (action === "add") {
        const intent = rest.slice(1).filter((a) => !a.startsWith("--")).join(" ");
        const resource = flag(rest, "--resource") ?? "tag";
        if (!intent) return { exitCode: 1, output: "usage: mooter conductor queue add <intent> [--resource <r>]" };
        const e = enqueue({ ...owner(opts), intent, resource }, { home, now });
        return { exitCode: 0, output: `queued ${e.id} — ${intent}` };
      }
      if (action === "done" || action === "cancel") {
        const id = rest[1];
        if (!id) return { exitCode: 1, output: `usage: mooter conductor queue ${action} <id>` };
        const e = action === "done" ? markDone(id, { home, now }) : cancel(id, { home, now });
        return e ? { exitCode: 0, output: `${action}: ${id}` } : { exitCode: 1, output: `not found: ${id}` };
      }
      return { exitCode: 1, output: "usage: mooter conductor queue <list|add|done|cancel>" };
    }

    case "history": {
      const limStr = flag(rest, "--tail");
      const limit = limStr ? Math.max(1, parseInt(limStr, 10) || 50) : 50;
      const h = readHistory(home, limit);
      if (!h.length) return { exitCode: 0, output: "no history yet." };
      return {
        exitCode: 0,
        output: h.map((e) => `${new Date(e.ts_ms).toISOString().slice(11, 19)} ${e.session_id.slice(0, 8)} ${e.op.padEnd(14)} ${e.resource}`).join("\n"),
      };
    }

    case "reap": {
      const reaped = reap({ home, now });
      return { exitCode: 0, output: reaped.length ? `reaped ${reaped.length} dead session(s): ${reaped.map((s) => s.slice(0, 8)).join(", ")}` : "no stale sessions." };
    }

    case "beat": {
      // Write/refresh this session's heartbeat (called from a session poll).
      const o = owner(opts);
      const hb = writeHeartbeat(
        {
          sessionId: o.sessionId,
          terminalName: o.terminalName,
          worktreePath: cwd,
          intent: rest.join(" ") || "active",
          activeLocks: listLocks(home).filter((l) => l.acquired_by === o.sessionId).map((l) => l.resource),
          pid: o.pid,
        },
        { home, now },
      );
      return { exitCode: 0, output: `❤ ${hb.session_id.slice(0, 8)} @ ${hb.terminal_name}` };
    }

    case "stop": {
      clearHeartbeat(owner(opts).sessionId, home);
      return { exitCode: 0, output: "heartbeat cleared." };
    }

    // ── hook entrypoints (H.4) — non-blocking, exit 0 even on miss ──────────
    case "auto-lock": {
      const cmd = flag(rest, "--cmd") ?? "";
      const det = cmd ? detectShellIntent(cmd, cwd) : null;
      if (!det) return { exitCode: 0, output: "" };
      const r = tryAcquire(det.resource, owner(opts), { home, now });
      if (r.acquired) {
        setLockIntent(det.resource, det.intent, home);
        return { exitCode: 0, output: `🔒 ${det.resource}` };
      }
      // Surface a non-fatal warning; never block the tool (exit 0).
      return { exitCode: 0, output: `⚠ ${det.resource} held by ${r.heldBy.terminal_name}${r.stale ? " (stale)" : ""} — concurrent op` };
    }

    case "auto-unlock": {
      const cmd = flag(rest, "--cmd") ?? "";
      const det = cmd ? detectShellIntent(cmd, cwd) : null;
      if (!det) return { exitCode: 0, output: "" };
      release(det.resource, owner(opts).sessionId, { home, now });
      return { exitCode: 0, output: "" };
    }

    default:
      return {
        exitCode: 1,
        output: "usage: mooter conductor <status|lock|unlock|queue|heartbeats|locks|history|reap|beat|stop>",
      };
  }
}
