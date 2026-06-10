// Wave 34 — `mooter audit fan-out` facets.
//
// A facet is a read-only probe over a slice of the repo plus a worker prompt.
// `gather` does node:fs reads only (the IO is injectable so tests run without a
// filesystem); it NEVER writes — in particular the `classify` facet only READS
// the sha-locked classify.js. The LLM call lives in the orchestrator, not here,
// so this module is pure and trivially testable.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface FacetInput {
  /** One-line human summary of what was probed. */
  summary: string;
  /** Evidence text fed to the worker (file excerpts + counts). */
  evidence: string;
  /** Number of sources actually found and read. */
  sources: number;
}

export interface FacetIO {
  /** Read a file; null when missing/unreadable. */
  read: (path: string) => string | null;
  /** List a directory; [] when missing. */
  list: (dir: string) => string[];
  /** Existence check. */
  exists: (path: string) => boolean;
}

export interface Facet {
  name: string;
  description: string;
  gather: (root: string, io: FacetIO) => FacetInput;
  prompt: (input: FacetInput) => string;
}

/** Default IO — the real filesystem, every call guarded. */
export function realIO(): FacetIO {
  return {
    read: (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } },
    list: (d) => { try { return readdirSync(d); } catch { return []; } },
    exists: (p) => { try { return existsSync(p); } catch { return false; } },
  };
}

function clip(s: string | null, max = 3500): string {
  if (s === null) return "(absent)";
  return s.length > max ? `${s.slice(0, max)}\n…(${s.length - max} more chars)` : s;
}

/** Read the first candidate that exists; returns its path + content (or nulls). */
function readFirst(root: string, io: FacetIO, candidates: string[]): { path: string | null; content: string | null } {
  for (const c of candidates) {
    const content = io.read(join(root, c));
    if (content !== null) return { path: c, content };
  }
  return { path: null, content: null };
}

export const AUDIT_SYSTEM =
  "You are a meticulous code auditor. Given evidence from a repository, return concrete findings as terse bullets: strengths, risks (most severe first), and 1-2 specific recommendations. Cite filenames/line ideas where possible. No preamble, no flattery.";

export const FACETS: Record<string, Facet> = {
  install: {
    name: "install",
    description: "installer safety, idempotency, dry-run, graceful degradation",
    gather: (root, io) => {
      const sh = io.read(join(root, "install.sh"));
      const ps = io.read(join(root, "install.ps1"));
      const sources = [sh, ps].filter((x) => x !== null).length;
      const evidence = `# install.sh\n${clip(sh)}\n\n# install.ps1\n${clip(ps, 1500)}`;
      return { summary: "installer scripts (sh + ps1)", evidence, sources };
    },
    prompt: (i) =>
      `Audit the Mooter installer for: idempotency (safe re-runs), safety (no blind sudo / no curl|bash footguns), dry-run support, and graceful degradation when deps are missing. Evidence:\n\n${i.evidence}`,
  },
  classify: {
    name: "classify",
    description: "router classifier tier doctrine + sha-gate integrity (READ-ONLY)",
    gather: (root, io) => {
      // READ ONLY — classify.js is sha-locked; this facet must never write it.
      const js = io.read(join(root, "tools/router/classify.js"));
      const sha = io.read(join(root, "tools/router/classify.js.sha256"));
      const sources = [js].filter((x) => x !== null).length;
      const evidence = `# tools/router/classify.js (head)\n${clip(js)}\n\n# tools/router/classify.js.sha256\n${clip(sha, 200)}`;
      return { summary: "classify.js + recorded sha", evidence, sources };
    },
    prompt: (i) =>
      `Audit the routing classifier's tier doctrine (does it cover T0/T1/T2/T3 with sensible signals?) and its sha-gate integrity. classify.js is sha-LOCKED — do NOT suggest editing it; only assess coverage and whether the recorded sha guards it. Evidence:\n\n${i.evidence}`,
  },
  statusline: {
    name: "statusline",
    description: "statusline modes, chip honesty, prefs persistence",
    gather: (root, io) => {
      const multi = io.read(join(root, "tools/router/statusline-multi.js"));
      const modes = io.read(join(root, "tools/router/statusline-modes.js"));
      const sources = [multi, modes].filter((x) => x !== null).length;
      const evidence = `# statusline-multi.js (head)\n${clip(multi)}\n\n# statusline-modes.js (head)\n${clip(modes, 1500)}`;
      return { summary: "statusline renderer + modes", evidence, sources };
    },
    prompt: (i) =>
      `Audit the Mooter statusline: are the modes (mini/compact/full/didactic/auto) coherent, are chip values honest (no fabricated numbers, graceful when data absent), and is there a latency risk? Evidence:\n\n${i.evidence}`,
  },
  mlwr: {
    name: "mlwr",
    description: "Mooter Local Win Rate metric correctness + freshness",
    gather: (root, io) => {
      const status = io.read(join(root, "tools/router/mlwr-status.js"));
      const bench = io.read(join(root, "packages/validation/src/benchmark/mlwr.ts"));
      const sources = [status, bench].filter((x) => x !== null).length;
      const evidence = `# tools/router/mlwr-status.js (head)\n${clip(status, 1500)}\n\n# packages/validation/src/benchmark/mlwr.ts (head)\n${clip(bench)}`;
      return { summary: "MLWR status + benchmark", evidence, sources };
    },
    prompt: (i) =>
      `Audit the MLWR (Mooter Local Win Rate) metric: is the per-tier local win-rate computed against an objective floor (not self-judged), is snapshot freshness handled, and is the claim honest? Evidence:\n\n${i.evidence}`,
  },
  routing: {
    name: "routing",
    description: "routing patterns + model resolver single-source-of-truth",
    gather: (root, io) => {
      const patterns = io.read(join(root, "tools/router/patterns.js"));
      const resolver = io.read(join(root, "tools/router/_model-resolver.js"));
      const sources = [patterns, resolver].filter((x) => x !== null).length;
      const evidence = `# tools/router/patterns.js (head)\n${clip(patterns)}\n\n# tools/router/_model-resolver.js (head)\n${clip(resolver, 1800)}`;
      return { summary: "routing patterns + model resolver", evidence, sources };
    },
    prompt: (i) =>
      `Audit the routing patterns and model resolver: are tier-escalation rules sound, is there false-positive risk in the HIGH_RISK signals, and is model selection single-source-of-truth (no drift vs classify.js)? Evidence:\n\n${i.evidence}`,
  },
  packages: {
    name: "packages",
    description: "monorepo package boundaries + native-dep / load-safety",
    gather: (root, io) => {
      const dirs = io.list(join(root, "packages")).filter((d) => io.exists(join(root, "packages", d, "package.json")));
      const lines: string[] = [];
      for (const d of dirs) {
        const pj = io.read(join(root, "packages", d, "package.json"));
        if (!pj) continue;
        try {
          const j = JSON.parse(pj) as { name?: string; dependencies?: Record<string, string> };
          const deps = Object.keys(j.dependencies ?? {});
          const native = deps.filter((x) => /isolated-vm|better-sqlite3|ink|sharp|node-gyp/.test(x));
          lines.push(`- ${d} (${j.name ?? "?"}): deps=[${deps.join(", ") || "none"}]${native.length ? ` NATIVE=[${native.join(", ")}]` : ""}`);
        } catch {
          lines.push(`- ${d}: (unparseable package.json)`);
        }
      }
      return { summary: `${dirs.length} packages`, evidence: `# packages/*/package.json\n${lines.join("\n")}`, sources: dirs.length };
    },
    prompt: (i) =>
      `Audit the monorepo package boundaries: which packages carry native deps (isolated-vm/better-sqlite3/ink), and is the zero-runtime-deps CLI at risk of bundling them? Flag any package that should stay lazy-imported. Evidence:\n\n${i.evidence}`,
  },
};

export const FACET_NAMES = Object.keys(FACETS);

export function selectFacets(csv: string | undefined): { facets: Facet[]; unknown: string[] } {
  const names =
    csv && csv.trim() ? csv.split(",").map((s) => s.trim()).filter(Boolean) : FACET_NAMES;
  const facets: Facet[] = [];
  const unknown: string[] = [];
  for (const n of names) {
    if (FACETS[n]) facets.push(FACETS[n]);
    else unknown.push(n);
  }
  return { facets, unknown };
}
