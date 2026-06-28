// job-catalogue.ts — the asymmetry-safe job registry + real-pending-work discovery.
//
// "asymmetry-safe" = local moos do bricks and verification, NEVER the piano.
// Every kind in CATALOGUE is a verification step or a draft that is hard-gated
// downstream. The allocator rejects any JobKind not in ASYMMETRY_SAFE_KINDS.
//
// humanMinutes here are DOCUMENTED ESTIMATES (a human-equivalent baseline per
// kind), not measurements. They become "recovered time" only when a job's gate
// PASSES at runtime (metrics.ts), and always carry the METR caveat. They are
// intentionally conservative — inflating them would be the cardinal sin (§9).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateKind, JobKind, PendingJob, Resource } from "./types.ts";

interface CatalogueEntry {
  resource: Resource;
  gate: GateKind;
  /** Wave-58 TaskCategory for the matrix lookup. */
  category: string;
  /** Conservative human-equivalent minutes unblocked on a PASSING gate (estimate). */
  humanMinutes: number;
  /** Continuous-batching slots consumed. Default 1. */
  kvWeight: number;
  /** Does this kind need a local LLM (GPU) to produce its artifact? */
  needsLLM: boolean;
}

/**
 * The catalogue. CPU entries are pure deterministic verification (no LLM, truly
 * $0). GPU entries draft an artifact with a local model and are then gated
 * deterministically (the draft must compile / its tests must pass / it must be
 * non-empty). Nothing here is "the piano".
 */
export const CATALOGUE: Record<JobKind, CatalogueEntry> = {
  // ── CPU verification track ────────────────────────────────────────────────
  "run-tests": { resource: "cpu", gate: "test", category: "coding.test", humanMinutes: 3, kvWeight: 1, needsLLM: false },
  typecheck: { resource: "cpu", gate: "types", category: "coding.refactor", humanMinutes: 2, kvWeight: 1, needsLLM: false },
  lint: { resource: "cpu", gate: "lint", category: "coding.refactor", humanMinutes: 1.5, kvWeight: 1, needsLLM: false },
  "dead-code-scan": { resource: "cpu", gate: "exec", category: "coding.refactor", humanMinutes: 4, kvWeight: 1, needsLLM: false },
  "dep-audit": { resource: "cpu", gate: "exec", category: "coding.security", humanMinutes: 5, kvWeight: 1, needsLLM: false },
  // ── GPU LLM track (output hard-gated) ─────────────────────────────────────
  "doc-gen": { resource: "gpu", gate: "exec", category: "writing.structured", humanMinutes: 8, kvWeight: 1, needsLLM: true },
  "boilerplate-draft": { resource: "gpu", gate: "compile", category: "coding.backend", humanMinutes: 10, kvWeight: 1, needsLLM: true },
  "test-stubs": { resource: "gpu", gate: "test", category: "coding.test", humanMinutes: 7, kvWeight: 1, needsLLM: true },
  "commit-msg": { resource: "gpu", gate: "exec", category: "writing.structured", humanMinutes: 2, kvWeight: 1, needsLLM: true },
  "journal-rollup": { resource: "gpu", gate: "exec", category: "writing.structured", humanMinutes: 4, kvWeight: 1, needsLLM: true },
  "backlog-summarize": { resource: "gpu", gate: "exec", category: "writing.structured", humanMinutes: 6, kvWeight: 1, needsLLM: true },
  "code-review-gated": { resource: "gpu", gate: "exec", category: "agents.reviewer", humanMinutes: 6, kvWeight: 1, needsLLM: true },
};

/** The hard guard: only these kinds may ever be allocated to a local moo. */
export const ASYMMETRY_SAFE_KINDS: ReadonlySet<JobKind> = new Set(
  Object.keys(CATALOGUE) as JobKind[],
);

/** Build a PendingJob from a catalogue kind, filling defaults. */
export function makeJob(
  id: string,
  kind: JobKind,
  opts: { command?: string; cwd?: string; pending?: boolean; humanMinutes?: number } = {},
): PendingJob {
  const e = CATALOGUE[kind];
  return {
    id,
    kind,
    category: e.category,
    humanMinutes: opts.humanMinutes ?? e.humanMinutes,
    kvWeight: e.kvWeight,
    resource: e.resource,
    gate: e.gate,
    command: opts.command,
    cwd: opts.cwd,
    pending: opts.pending ?? true,
  };
}

// ── Real-pending-work discovery ──────────────────────────────────────────────
//
// "Só trabalho pendente real" — we derive jobs from the live repo, never invent
// them. Source of truth = git's changed-file set ("diffs por testar"): a package
// with uncommitted changes AND a `test` script earns a run-tests job; one with a
// tsconfig earns a typecheck job. No changes ⇒ no jobs ⇒ honest IDLE.

function changedPackages(repoRoot: string): string[] {
  let out = "";
  try {
    out = execFileSync("git", ["-C", repoRoot, "status", "--porcelain"], {
      encoding: "utf8",
      timeout: 10_000,
    });
  } catch {
    return []; // not a git repo / git missing → no discovered work (honest)
  }
  const pkgs = new Set<string>();
  for (const line of out.split("\n")) {
    const m = line.slice(3).match(/^"?packages\/([^/"]+)\//);
    if (m) pkgs.add(m[1]);
  }
  return [...pkgs];
}

function hasTestScript(pkgDir: string): boolean {
  try {
    const pj = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    return !!(pj.scripts && pj.scripts.test);
  } catch {
    return false;
  }
}

/**
 * Discover REAL pending verification work from the repo's diff.
 * Returns [] when there is nothing to do — the caller must then go IDLE, not
 * manufacture busywork.
 */
export function discoverPendingJobs(repoRoot: string): PendingJob[] {
  const jobs: PendingJob[] = [];
  for (const name of changedPackages(repoRoot)) {
    const pkgDir = join(repoRoot, "packages", name);
    if (hasTestScript(pkgDir)) {
      jobs.push(
        makeJob(`run-tests:${name}`, "run-tests", {
          command: "npm test",
          cwd: pkgDir,
          pending: true,
        }),
      );
    }
    if (existsSync(join(pkgDir, "tsconfig.json"))) {
      jobs.push(
        makeJob(`typecheck:${name}`, "typecheck", {
          // Typecheck via the shared tsx-resolved tsc is package-specific; the
          // runner only executes commands that exist. We use tsc --noEmit when a
          // local tsc is resolvable, else this job stays a plan-only candidate.
          command: "npx --no-install tsc -p tsconfig.json --noEmit",
          cwd: pkgDir,
          pending: true,
        }),
      );
    }
  }
  return jobs;
}
