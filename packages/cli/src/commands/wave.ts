// `mooter wave` — wave lifecycle helper (Wave 30 Phase D).
//
//   mooter wave start <n> [--branch <name>] [--template wave30] [--json]
//   mooter wave status [--json]            current phase + classify.js sha verify + git HEAD
//   mooter wave phase <id> [--done|--in-progress] [--commit <h>] [--notes <t>]
//   mooter wave ship [--tag <t>] [--merge <commit>] [--force] [--json]
//
// Pure delegator to @mooter/synthesis central-state. `status` and `ship` verify
// the doctrine-gated tools/router/classify.js sha; `ship` refuses on mismatch
// unless --force.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import type { CmdResult } from "./trail.ts";
import {
  startWave,
  setPhase,
  shipWave,
  summarize,
  loadState,
  recordClassifySha,
  classifyShaOk,
  EXPECTED_CLASSIFY_SHA,
  type PhaseStatus,
} from "../../../synthesis/src/state/central-state.ts";

export const WAVE_USAGE = `mooter wave — wave lifecycle helper

  mooter wave start <n> [--branch <name>] [--template wave30] [--json]
  mooter wave status [--json]
  mooter wave phase <id> [--done|--in-progress] [--commit <h>] [--notes "<t>"]
  mooter wave ship [--tag <t>] [--merge <commit>] [--force] [--json]`;

// Canonical A-O scaffold for the mega wave; used when --template wave30 (or n===30).
const WAVE30_PHASES: Array<{ id: string; title: string }> = [
  { id: "A", title: "Day 0 recon" },
  { id: "B", title: "Mission apply" },
  { id: "C", title: "Decision logs + ADR" },
  { id: "D", title: "mooter wave CLI + state.json" },
  { id: "E", title: "mooter dogfood log" },
  { id: "F", title: "CI benchmark workflow" },
  { id: "G", title: "L16.2 Bandit Learner" },
  { id: "H", title: "Adversarial Review" },
  { id: "I", title: "Threat model + supply chain CI" },
  { id: "J", title: "Cost cap + anomaly" },
  { id: "K", title: "Mooter MCP server" },
  { id: "L", title: "Benchmark v2 execution" },
  { id: "M", title: "Recovery UX + responsive" },
  { id: "N", title: "Statusline line-3 chips" },
  { id: "O", title: "Final review + merge + tag" },
];

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

/** Walk up from the module dir and cwd to locate a repo-relative file. */
function findRepoFile(rel: string): string | null {
  const bases: string[] = [];
  try {
    bases.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    /* bundled — fall back to cwd */
  }
  bases.push(process.cwd());
  for (const base of bases) {
    let dir = base;
    for (let i = 0; i < 9; i++) {
      const cand = join(dir, rel);
      if (existsSync(cand)) return cand;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function classifySha(): { path: string | null; sha: string | null } {
  const p = findRepoFile("tools/router/classify.js");
  if (!p) return { path: null, sha: null };
  try {
    const sha = createHash("sha256").update(readFileSync(p)).digest("hex");
    return { path: p, sha };
  } catch {
    return { path: p, sha: null };
  }
}

function gitInfo(): { branch: string | null; head: string | null } {
  try {
    const branch = execFileSync("git", ["branch", "--show-current"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return { branch: branch || null, head: head || null };
  } catch {
    return { branch: null, head: null };
  }
}

export function runWave(args: string[]): CmdResult {
  const sub = args[0];
  const rest = args.slice(1);
  const json = rest.includes("--json") || args.includes("--json");

  if (!sub || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: WAVE_USAGE };
  }

  if (sub === "start") {
    const n = Number(rest.find((a) => /^\d+$/.test(a)));
    if (!Number.isFinite(n) || n <= 0) {
      return { exitCode: 1, output: "usage: mooter wave start <n> [--branch <name>] [--template wave30]" };
    }
    const branch = flag(rest, "--branch") ?? `wave${n}`;
    const useTemplate = rest.includes("--template") || n === 30;
    const phases = useTemplate ? WAVE30_PHASES : [];
    const s = startWave({ number: n, branch, phases });
    const { sha } = classifySha();
    if (sha) recordClassifySha(sha);
    const sum = summarize(s);
    if (json) return { exitCode: 0, output: JSON.stringify(sum, null, 2) };
    const lines = [
      `🐮 Wave ${n} started on branch ${branch}`,
      `   phases: ${sum.total} (${phases.map((p) => p.id).join("")})`,
      `   classify.js sha: ${sha ? (classifyShaOk(sha) ? "✓ intact" : "✗ MISMATCH") : "not found"}`,
      ``,
      `Checklist:`,
      `  1. Day 0 recon (sha, hub, ollama, baseline tests)`,
      `  2. Implement phases in dependency order; commit per phase`,
      `  3. mooter wave phase <id> --done after each`,
      `  4. mooter wave ship after dev→main merge`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "status") {
    const s = loadState();
    const sum = summarize(s);
    const { path, sha } = classifySha();
    const git = gitInfo();
    const ok = sha ? classifyShaOk(sha) : false;
    if (json) {
      return {
        exitCode: ok || !sha ? 0 : 2,
        output: JSON.stringify(
          {
            ...sum,
            classify: { path, sha, ok, expected: EXPECTED_CLASSIFY_SHA },
            git,
          },
          null,
          2,
        ),
      };
    }
    if (!sum.active) {
      return {
        exitCode: 0,
        output: `No active wave. (${sum.historyCount} in history)\nclassify.js sha: ${
          sha ? (ok ? "✓ intact" : "✗ MISMATCH") : "not found"
        }`,
      };
    }
    const phaseLine = sum.phases
      .map((p) => `${p.status === "done" ? "✅" : p.status === "in_progress" ? "🔄" : "⬜"} ${p.id}`)
      .join(" ");
    const lines = [
      `🐮 Wave ${sum.number} · branch ${sum.branch} · git ${git.branch ?? "?"}@${git.head ?? "?"}`,
      `   phase ${sum.phase} · ${sum.done}/${sum.total} done`,
      `   ${phaseLine}`,
      `   classify.js sha: ${sha ? (ok ? "✓ intact" : "✗ MISMATCH — DOCTRINE GATE FAIL") : "not found"}`,
    ];
    return { exitCode: ok || !sha ? 0 : 2, output: lines.join("\n") };
  }

  if (sub === "phase") {
    const id = rest.find((a) => !a.startsWith("--"));
    if (!id) return { exitCode: 1, output: "usage: mooter wave phase <id> [--done|--in-progress] [--commit <h>] [--notes <t>]" };
    let status: PhaseStatus | undefined;
    if (rest.includes("--done")) status = "done";
    else if (rest.includes("--in-progress")) status = "in_progress";
    const commit = flag(rest, "--commit");
    const notes = flag(rest, "--notes");
    try {
      const s = setPhase(id, { status, commit, notes });
      const sum = summarize(s);
      if (json) return { exitCode: 0, output: JSON.stringify(sum, null, 2) };
      return { exitCode: 0, output: `Phase ${id} → ${status ?? "updated"} (${sum.done}/${sum.total} done)` };
    } catch (e) {
      return { exitCode: 1, output: `mooter wave: ${(e as Error).message}` };
    }
  }

  if (sub === "ship") {
    const force = rest.includes("--force");
    const { sha } = classifySha();
    const ok = sha ? classifyShaOk(sha) : false;
    if (sha && !ok && !force) {
      return {
        exitCode: 2,
        output: `✗ classify.js sha MISMATCH — refusing to ship (doctrine gate). Use --force to override.\n  expected ${EXPECTED_CLASSIFY_SHA}\n  actual   ${sha}`,
      };
    }
    const tag = flag(rest, "--tag");
    const merge = flag(rest, "--merge");
    try {
      const s = shipWave({ tag, mergeCommit: merge });
      const shipped = s.history[s.history.length - 1];
      if (json) return { exitCode: 0, output: JSON.stringify(shipped, null, 2) };
      const lines = [
        `🐮 Wave ${shipped.number} shipped${tag ? ` · tag ${tag}` : ""}${merge ? ` · merge ${merge}` : ""}`,
        `   classify.js sha: ${sha ? (ok ? "✓ intact" : "✗ forced") : "not found"}`,
        `   phases done: ${shipped.phases.filter((p) => p.status === "done").length}/${shipped.phases.length}`,
        `Next: tag after dev→main merge, hub deploy, Notion auto-write.`,
      ];
      return { exitCode: 0, output: lines.join("\n") };
    } catch (e) {
      return { exitCode: 1, output: `mooter wave: ${(e as Error).message}` };
    }
  }

  return { exitCode: 1, output: `mooter wave: unknown subcommand '${sub}'\n\n${WAVE_USAGE}` };
}
