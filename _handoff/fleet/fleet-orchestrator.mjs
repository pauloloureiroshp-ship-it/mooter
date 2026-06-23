#!/usr/bin/env node
/**
 * Mooter Autopilot Fleet — Fleet Orchestrator F1
 *
 * Evolution of loop-runner for N pillars. Reads fleet.json + each pillar STATE,
 * picks next eligible pillar by priority + fair round-robin, runs one CC headless
 * round in that pillar directory, enforces caps (GPU, cloud, daily budget, STOP),
 * writes fleet ledger + heartbeat. Never dies (try/catch per round).
 *
 * Scheduling model:
 *   SPOQ — Specialist Orchestrated Queuing (arXiv 2606.03115)
 *   MOSAIC — Mixture-of-Agent Scheduling (arXiv 2606.03014)
 *
 * Bus layout:
 *   _handoff/fleet/<pilar>/{STATE.json, INBOX.md, OUTBOX.md, CRITERIA.md,
 *                           QUEUE.jsonl, ledger.jsonl, heartbeat.json, transcript/}
 *   _handoff/fleet/fleet-ledger.jsonl
 *   _handoff/fleet/fleet-heartbeat.json
 *   _handoff/fleet/STOP   (kill switch)
 *
 * Env vars:
 *   FLEET_DIR          path to _handoff/fleet/ (default: dir of this file)
 *   REPO               repo root (default: 2 levels up from FLEET_DIR)
 *   DRY_RUN            "1" = simulate CC calls without spending tokens
 *   POLL_MS            polling interval ms (default: 5000)
 *   ROUND_TIMEOUT_MS   per-round CC timeout ms (default: 1800000 = 30min)
 *   CLAUDE_BIN         claude binary name (default: "claude")
 *   PERMISSION_MODE    CC permission mode (default: "acceptEdits")
 *   MAX_FAILS_GLOBAL   consecutive global fails before 60s backoff (default: 10)
 *   STOP_AFTER_N       exit after N total rounds — smoke/test mode (default: Infinity)
 */
import { spawn } from "node:child_process";
import {
  readFileSync, writeFileSync, existsSync, renameSync,
  mkdirSync, appendFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLEET_DIR = process.env.FLEET_DIR ? resolve(process.env.FLEET_DIR) : HERE;
const REPO      = process.env.REPO      ? resolve(process.env.REPO)      : resolve(FLEET_DIR, "..", "..");
const DRY_RUN   = process.env.DRY_RUN === "1";
const POLL_MS   = Number(process.env.POLL_MS          || 5000);
const TIMEOUT   = Number(process.env.ROUND_TIMEOUT_MS  || 30 * 60 * 1000);
const CLAUDE    = process.env.CLAUDE_BIN               || "claude";
const PERM      = process.env.PERMISSION_MODE          || "acceptEdits";
const MAX_FAILS = Number(process.env.MAX_FAILS_GLOBAL  || 10);
const STOP_N    = process.env.STOP_AFTER_N ? Number(process.env.STOP_AFTER_N) : Infinity;

const ts  = () => new Date().toISOString();
const log = (...a) => console.log("[fleet " + ts() + "]", ...a);
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const F   = (...p) => join(FLEET_DIR, ...p);
const P   = (id, f) => join(FLEET_DIR, id, f);

// ── Fleet config ──────────────────────────────────────────────────────────────

function loadConfig() {
  const p = F("fleet.json");
  if (!existsSync(p)) throw new Error("fleet.json missing: " + p);
  return JSON.parse(readFileSync(p, "utf8"));
}

// ── Pillar bus ────────────────────────────────────────────────────────────────

function initBus(id) {
  mkdirSync(join(FLEET_DIR, id, "transcript"), { recursive: true });
  if (!existsSync(P(id, "STATE.json")))
    writeFileSync(P(id, "STATE.json"), JSON.stringify(
      { status: "idle", round: 0, pillar: id, created_at: ts() }, null, 2));
  if (!existsSync(P(id, "INBOX.md")))
    writeFileSync(P(id, "INBOX.md"), "# INBOX\n\n(empty — waiting for first wave)\n");
  if (!existsSync(P(id, "CRITERIA.md")))
    writeFileSync(P(id, "CRITERIA.md"), "# CRITERIA\n\n(no active wave — charter is the guide)\n");
}

function readState(id) {
  try { return JSON.parse(readFileSync(P(id, "STATE.json"), "utf8")); }
  catch (e) { return { status: "idle", round: 0, pillar: id }; }
}

function writeState(id, s) {
  s.updated_at = ts();
  const tmp = P(id, "STATE.json.tmp");
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, P(id, "STATE.json"));
}

function readQueue(id) {
  const qp = P(id, "QUEUE.jsonl");
  if (!existsSync(qp)) return [];
  return readFileSync(qp, "utf8")
    .split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch (e) { return null; } })
    .filter(Boolean);
}

function dequeue(id) {
  const qp = P(id, "QUEUE.jsonl");
  const waves = readQueue(id);
  if (!waves.length) return null;
  const wave = waves[0];
  const rest = waves.slice(1);
  writeFileSync(qp, rest.map((w) => JSON.stringify(w)).join("\n") + (rest.length ? "\n" : ""));
  return wave;
}

function pillarLedger(id, entry) {
  try { appendFileSync(P(id, "ledger.jsonl"), JSON.stringify({ ts: ts(), pillar: id, ...entry }) + "\n"); }
  catch (e) {}
}

// ── Fleet-level I/O ───────────────────────────────────────────────────────────

const FLEET_LEDGER = F("fleet-ledger.jsonl");
const FLEET_HB     = F("fleet-heartbeat.json");
const FLEET_STOP   = F("STOP");

function fleetLedger(entry) {
  try { appendFileSync(FLEET_LEDGER, JSON.stringify({ ts: ts(), ...entry }) + "\n"); }
  catch (e) {}
}

function fleetHeartbeat(extra) {
  try { writeFileSync(FLEET_HB, JSON.stringify({ ts: ts(), pid: process.pid, dry_run: DRY_RUN, ...extra })); }
  catch (e) {}
}

// ── SPOQ scheduler ────────────────────────────────────────────────────────────
//
// 1. Filter: not currently running, not done/stopped
// 2. Cap:    at most max_gpu_heavy_concurrent gpu_heavy slots
//            at most max_cloud_sessions_concurrent cloud slots
// 3. Sort:   priority ASC (1 = highest), then last_run_ts ASC (fairness)

function pickNext(pillars, running, caps) {
  const nGpu   = [...running].filter((id) => pillars.find((p) => p.id === id)?.gpu_heavy).length;
  const nCloud = [...running].filter((id) => pillars.find((p) => p.id === id)?.cloud).length;

  const eligible = pillars.filter((p) => {
    if (running.has(p.id)) return false;
    const s = readState(p.id);
    if (s.status === "done" || s.status === "stopped") return false;
    if (p.gpu_heavy && nGpu   >= caps.max_gpu_heavy_concurrent)    return false;
    if (p.cloud    && nCloud  >= caps.max_cloud_sessions_concurrent) return false;
    return true;
  });

  if (!eligible.length) return null;

  eligible.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ta = readState(a.id).last_run_ts || "0";
    const tb = readState(b.id).last_run_ts || "0";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  return eligible[0];
}

// ── Protocol footer injected into every CC round ──────────────────────────────

function protocolFooter(id, charter) {
  const fence = "```";
  return [
    "",
    "--- FLEET LOOP PROTOCOL (GENERATOR — pilar: " + id + ") ---",
    "Charter: " + charter,
    "Work THIS round only in your scope dirs. NEVER merge/push to main.",
    "Stay on branch fleet-f1. End your turn with EXACTLY:",
    fence + "status",
    "DID: one-line summary of what changed",
    "TESTS: pass/fail counts or n/a",
    "BLOCKERS: none | what needs a human",
    "NEXT: what the next round should do",
    "DONE: yes|no — is the charter goal met?",
    fence,
    "WORLD-CLASS RUBRIC: revert if score does not improve. 1-in-3 cycles = measure-only.",
    "---",
  ].join("\n");
}

const DRY_STATUS = (id) =>
  "```status\nDID: [DRY_RUN] simulated round for " + id +
  "\nTESTS: n/a (dry run)\nBLOCKERS: none\nNEXT: continue charter\nDONE: no\n```";

// ── CC runner ─────────────────────────────────────────────────────────────────

function runCC(id, prompt, sessionId, cwd) {
  return new Promise((done) => {
    if (DRY_RUN) {
      // Simulate a short async CC round
      setTimeout(() => done({
        ok: true,
        sessionId: sessionId || ("dry-" + id + "-" + Date.now()),
        text: DRY_STATUS(id),
      }), 150 + Math.floor(Math.random() * 200));
      return;
    }

    const args = [
      "-p", "--output-format", "stream-json",
      "--verbose", "--permission-mode", PERM,
    ];
    if (sessionId) args.push("--resume", sessionId);

    let child;
    try { child = spawn(CLAUDE, args, { cwd: cwd || REPO, shell: true }); }
    catch (e) { return done({ ok: false, sessionId, text: "spawn error: " + e.message }); }

    let sid = sessionId || null;
    let finalText = "";
    let buf = "";

    const timer = setTimeout(() => {
      log("[" + id + "] round timeout — killing CC");
      try { child.kill("SIGKILL"); } catch (_) {}
    }, TIMEOUT);

    try { child.stdin.write(prompt); child.stdin.end(); } catch (_) {}

    child.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.session_id && !sid) sid = ev.session_id;
          if (ev.type === "result" && typeof ev.result === "string") {
            finalText = ev.result;
          } else if (ev.type === "assistant" && ev.message && ev.message.content) {
            for (const c of ev.message.content) {
              if (c.type === "text") finalText += c.text;
            }
          }
        } catch (_) {}
      }
    });

    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ ok: code === 0, sessionId: sid, text: finalText || stderr || "(no output)" });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      done({ ok: false, sessionId: sid, text: "error: " + e.message });
    });
  });
}

// ── One round for a pillar ────────────────────────────────────────────────────

async function oneRound(pilar, wave) {
  const { id, charter } = pilar;
  const s = readState(id);
  const round = (s.round || 0) + 1;

  const inbox = existsSync(P(id, "INBOX.md"))
    ? readFileSync(P(id, "INBOX.md"), "utf8")
    : "(empty INBOX)";
  const waveCtx = wave
    ? "\n\n## Active Wave\n" + JSON.stringify(wave, null, 2) + "\n"
    : "";
  const prompt = inbox + waveCtx + protocolFooter(id, charter);

  log("[" + id + "] round " + round + " starting");
  const result = await runCC(id, prompt, s.sessionId, pilar._worktreeDir || null);

  // Write OUTBOX
  try { writeFileSync(P(id, "OUTBOX.md"), result.text); } catch (_) {}

  // Append transcript
  try {
    const td = join(FLEET_DIR, id, "transcript");
    mkdirSync(td, { recursive: true });
    writeFileSync(join(td, "round-" + round + "-inbox.md"), inbox);
    writeFileSync(join(td, "round-" + round + "-outbox.md"), result.text);
  } catch (_) {}

  // Parse DONE signal from status block
  const doneSignal = /```status[\s\S]*?DONE:\s*yes/i.test(result.text);

  writeState(id, {
    ...s,
    status: doneSignal ? "done" : "awaiting_eval",
    round,
    sessionId: result.sessionId,
    lastOk: result.ok,
    last_run_ts: ts(),
    wave: wave ? wave.id : s.wave,
  });

  pillarLedger(id, { event: "round", round, ok: result.ok, done: doneSignal, chars: result.text.length });
  fleetLedger({ event: "round_complete", pillar: id, round, ok: result.ok, done: doneSignal });
  log("[" + id + "] round " + round + " done ok=" + result.ok + " done=" + doneSignal);

  return { ok: result.ok, done: doneSignal };
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main() {
  const cfg     = loadConfig();
  const pillars = cfg.pillars;
  const caps    = cfg.global_caps;

  // Boot: init every pillar bus
  for (const p of pillars) initBus(p.id);

  log("fleet-orchestrator F1 up — " + pillars.length + " pillars  dry=" + DRY_RUN + "  repo=" + REPO);
  fleetLedger({ event: "startup", pillars: pillars.map((p) => p.id), dry_run: DRY_RUN });

  // F2 will populate _worktreeDir per pillar; F1 uses the main REPO for all
  for (const p of pillars) p._worktreeDir = null;

  const running = new Set(); // pillar ids currently executing a round
  let totalRounds = 0;
  let globalFails = 0;

  for (;;) {
    try {
      // Kill switch
      if (existsSync(FLEET_STOP)) { log("FLEET_STOP detected — exiting cleanly"); return; }

      // Smoke/test mode
      if (totalRounds >= STOP_N) { log("STOP_AFTER_N=" + STOP_N + " reached — exiting"); return; }

      // Heartbeat
      fleetHeartbeat({
        total_rounds: totalRounds,
        running: Array.from(running),
        pillars_idle: pillars.filter((p) => readState(p.id).status === "idle").length,
        pillars_done: pillars.filter((p) => readState(p.id).status === "done").length,
        global_fails: globalFails,
      });

      // Scheduling decision
      const chosen = pickNext(pillars, running, caps);
      if (!chosen) {
        // All pillars blocked by caps, all done, or nothing to do
        await nap(POLL_MS);
        continue;
      }

      running.add(chosen.id);
      const wave = dequeue(chosen.id); // null if no queued wave (charter-auto mode)
      writeState(chosen.id, { ...readState(chosen.id), status: "cc_running" });
      fleetLedger({ event: "round_start", pillar: chosen.id, wave: wave ? wave.id : null, round: (readState(chosen.id).round || 0) });
      totalRounds++;

      // Launch round async so orchestrator can immediately schedule next pillar
      oneRound(chosen, wave).then((r) => {
        running.delete(chosen.id);
        if (!r.ok) {
          globalFails++;
          if (globalFails >= MAX_FAILS) {
            log("too many consecutive global failures (" + globalFails + ") — backing off 60s");
            fleetLedger({ event: "global_backoff", global_fails: globalFails });
            globalFails = 0;
            return nap(60000);
          }
        } else {
          globalFails = 0;
        }
      }).catch((e) => {
        running.delete(chosen.id);
        log("[" + chosen.id + "] round error:", e && e.message);
        fleetLedger({ event: "round_error", pillar: chosen.id, error: e && e.message });
      });

      // Short yield before next scheduling tick
      await nap(500);

    } catch (e) {
      log("orchestrator iteration error (continuing):", e && e.message);
      try { fleetLedger({ event: "iter_error", msg: e && e.message }); } catch (_) {}
      await nap(POLL_MS);
    }
  }
}

main().catch((e) => { log("fatal (restart recommended):", e); process.exit(1); });
