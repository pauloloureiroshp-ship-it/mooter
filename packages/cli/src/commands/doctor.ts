// Wave 33.5 Block C.3 — `mooter doctor` health check + multiplexer detection.
//
// The install-wizard's final gate, runnable any time: verifies classify.js is
// intact (doctrine sha), a sandbox backend exists, Ollama is reachable, the
// Pastor state is present, and which terminal multiplexers are installed. All
// probes are injectable so the check is testable without a live host.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EXPECTED_CLASSIFY_SHA } from "../../../synthesis/src/state/central-state.ts";
import { detectSandbox } from "../../../spawn-orchestrator/src/index.ts";
import { reconcileStats, type ReconcileResult } from "./stats-reconcile.ts";
import { gatherCoherence, renderCoherence, type CoherenceReport } from "./coherence.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

type Level = "ok" | "warn" | "fail";
interface Check {
  name: string;
  level: Level;
  detail: string;
}

export interface DoctorProbes {
  home?: string;
  /** Returns true if a binary is on PATH. */
  which?: (bin: string) => boolean;
  /** Returns true if Ollama answers on localhost. */
  ollamaUp?: () => boolean;
  /** Override classify.js path resolution. */
  classifyPath?: string | null;
  /** Override the stats reconcile (tests). Returns null to skip the check. */
  statsReconcile?: () => ReconcileResult | null;
  /** Override the coherence gather (tests). Only used with `--coherence`. */
  coherence?: () => CoherenceReport;
}

function defaultWhich(bin: string): boolean {
  try {
    execFileSync("which", [bin], { stdio: ["ignore", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function defaultOllamaUp(): boolean {
  try {
    // Cheap, synchronous reachability check with a hard timeout.
    execFileSync("curl", ["-fsS", "--max-time", "1", "http://127.0.0.1:11434/api/tags"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function findClassify(): string | null {
  const bases: string[] = [];
  try {
    bases.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* bundled */
  }
  bases.push(process.cwd());
  for (const base of bases) {
    let dir = base;
    for (let i = 0; i < 9; i++) {
      const cand = join(dir, "tools", "router", "classify.js");
      if (existsSync(cand)) return cand;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

export function runDoctorChecks(probes: DoctorProbes = {}): Check[] {
  const home = probes.home ?? homedir();
  const which = probes.which ?? defaultWhich;
  const ollamaUp = probes.ollamaUp ?? defaultOllamaUp;
  const checks: Check[] = [];

  // 1 — classify.js doctrine sha.
  const cp = probes.classifyPath !== undefined ? probes.classifyPath : findClassify();
  if (cp && existsSync(cp)) {
    const sha = createHash("sha256").update(readFileSync(cp)).digest("hex");
    checks.push(
      sha === EXPECTED_CLASSIFY_SHA
        ? { name: "classify.js doctrine sha", level: "ok", detail: `${sha.slice(0, 16)}… INTACT` }
        : { name: "classify.js doctrine sha", level: "fail", detail: `MISMATCH ${sha.slice(0, 16)}… (expected ${EXPECTED_CLASSIFY_SHA.slice(0, 16)}…)` },
    );
  } else {
    checks.push({ name: "classify.js doctrine sha", level: "warn", detail: "router not located (running outside the repo?)" });
  }

  // 2 — sandbox backend.
  const sb = detectSandbox(which);
  checks.push(
    sb.available
      ? { name: "spawn sandbox backend", level: "ok", detail: `${sb.backend} ready` }
      : { name: "spawn sandbox backend", level: "warn", detail: sb.hint },
  );

  // 3 — Ollama reachable (local-first model host).
  checks.push(
    ollamaUp()
      ? { name: "Ollama (local models)", level: "ok", detail: "reachable on 127.0.0.1:11434" }
      : { name: "Ollama (local models)", level: "warn", detail: "not reachable — local spawns will fail until `ollama serve` runs" },
  );

  // 4 — Pastor state.
  const pastor = join(home, ".mooter", "pastor-state.json");
  checks.push(
    existsSync(pastor)
      ? { name: "Pastor state", level: "ok", detail: "present" }
      : { name: "Pastor state", level: "warn", detail: "not trained yet (runs as you work)" },
  );

  // 5 — terminal multiplexers (C.2 step 8).
  const muxes = ["zellij", "tmux", "wezterm"].filter((m) => which(m));
  checks.push(
    muxes.length
      ? { name: "multiplexers detected", level: "ok", detail: muxes.join(", ") }
      : { name: "multiplexers detected", level: "warn", detail: "none (Zellij/tmux/WezTerm) — sessions still work, no pane integration" },
  );

  // 6 — Wave 33.8 Block A: statusline (local) vs hub (cross-device) stats sanity.
  // A divergence here is the thing that made "$0.00 all-time·local" look like a bug
  // next to the landing's real total. `unknown` (never synced) maps to warn so the
  // user gets the actionable hint; a legitimate multi-device gap is `warn` but says
  // so plainly; aligned numbers are `ok`.
  const recon = (probes.statsReconcile ?? (() => reconcileStats({ mooterHome: join(home, ".mooter") })))();
  if (recon) {
    checks.push({
      name: "stats sync (local↔hub)",
      level: recon.level === "ok" ? "ok" : "warn",
      detail: recon.detail,
    });
  }

  return checks;
}

const GLYPH: Record<Level, string> = { ok: "✓", warn: "⚠", fail: "✗" };

export function runDoctor(args: string[], probes: DoctorProbes = {}): CmdResult {
  const checks = runDoctorChecks(probes);
  // `--coherence` cross-checks the savings/usage numbers across local + hub
  // surfaces and names the probable cause of any divergence (Wave 59A). It is
  // diagnostic only — it never changes the doctor exit code.
  const coherence = args.includes("--coherence")
    ? (probes.coherence ?? (() => gatherCoherence({ mooterHome: join(probes.home ?? homedir(), ".mooter") })))()
    : null;
  if (args.includes("--json")) {
    const fail = checks.some((c) => c.level === "fail");
    return { exitCode: fail ? 1 : 0, output: JSON.stringify({ checks, ...(coherence ? { coherence } : {}) }, null, 2) };
  }
  const out: string[] = ["🐮 Mooter doctor — health check", ""];
  for (const c of checks) out.push(`  ${GLYPH[c.level]} ${c.name.padEnd(26)} ${c.detail}`);
  out.push("");
  const fails = checks.filter((c) => c.level === "fail").length;
  const warns = checks.filter((c) => c.level === "warn").length;
  out.push(fails ? `${fails} failure(s) — fix before spawning.` : warns ? `${warns} warning(s) — Mooter is usable; address when convenient.` : "All green. 🐮");
  if (coherence) out.push(...renderCoherence(coherence));
  return { exitCode: fails ? 1 : 0, output: out.join("\n") };
}
