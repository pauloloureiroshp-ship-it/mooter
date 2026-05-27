// `mooter pack` command group (Wave 1 Day 5 — PASTOR §10.5).
//
// Four subcommands, all with a human (tabular, ✓/✗) default and a --json mode:
//   list      — every packs/<name>/pack.yaml                       (exit 0)
//   show      — pack.yaml pretty-print + scaffold inline           (exit 0 / 1)
//   diff      — env gap via packResolve() (the Day-4 module)        (exit 0 / 2)
//   validate  — deterministic schema + presence checks, zero LLM    (exit 0 / 1)
//
// Exit-code contract: 0 success · 1 error (pack missing / validation FAIL) ·
// 2 missing deps (diff only). Commands return CmdResult; index.ts owns stdout
// and process.exit, so the suite asserts on the result without spawning.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import yaml from "js-yaml";
import { defaultPacksDir } from "../../../router/src/classify_domain.ts";
import {
  loadPackManifest,
  packResolve,
  detectEnv,
  type ResolveEnv,
} from "../../../router/src/pack_resolve.ts";
import { validatePack } from "../../../../packs/validate.ts";

export const PACK_USAGE = `Pack subcommands:
  mooter pack list                 list installed packs
  mooter pack show <name>          show pack.yaml + scaffold
  mooter pack diff <name>          gap: skills/MCPs present vs required
  mooter pack validate <name>      schema + presence checks (deterministic)

Flags:
  --json                           machine-readable output (all subcommands)`;

const OK = "✓";
const NO = "✗";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface PackCmdOptions {
  json?: boolean;
  packsDir?: string;
  env?: ResolveEnv; // diff only — injectable for tests; defaults to detectEnv()
}

// Directories under packs/ that are not packs themselves (mirrors classify_domain).
const NON_PACK_DIRS = new Set(["node_modules", "tests", "__mock__"]);

type Doc = Record<string, unknown>;

function packYamlPath(name: string, packsDir: string): string {
  return join(packsDir, name, "pack.yaml");
}

function loadDoc(path: string): Doc | null {
  try {
    return (yaml.load(readFileSync(path, "utf8")) ?? {}) as Doc;
  } catch {
    return null;
  }
}

// js-yaml parses unquoted ISO dates as Date objects; normalise both to YYYY-MM-DD.
function fmtDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

function lastValidated(doc: Doc): string {
  const meta = (doc.metadata ?? {}) as Doc;
  const va = (meta.validated_against ?? {}) as Doc;
  return fmtDate(va.mcp_registry_snapshot) ?? fmtDate(meta.created) ?? "—";
}

function discoverPackDirs(packsDir: string): string[] {
  if (!existsSync(packsDir)) return [];
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !NON_PACK_DIRS.has(d.name))
    .map((d) => d.name)
    .filter((name) => existsSync(packYamlPath(name, packsDir)))
    .sort();
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

// --- list --------------------------------------------------------------------
export function packList(opts: PackCmdOptions = {}): CmdResult {
  const packsDir = opts.packsDir ?? defaultPacksDir();
  const rows = discoverPackDirs(packsDir).map((dir) => {
    const doc = loadDoc(packYamlPath(dir, packsDir)) ?? {};
    return {
      name: typeof doc.name === "string" ? doc.name : dir,
      version: typeof doc.version === "string" ? doc.version : "—",
      model_floor: typeof doc.model_floor === "string" ? doc.model_floor : "—",
      last_validated: lastValidated(doc),
    };
  });

  if (opts.json) return { exitCode: 0, output: JSON.stringify(rows, null, 2) };

  if (rows.length === 0) return { exitCode: 0, output: "No packs found." };

  const headers = ["NAME", "VERSION", "FLOOR", "LAST_VALIDATED"];
  const widths = [
    Math.max(headers[0].length, ...rows.map((r) => r.name.length)),
    Math.max(headers[1].length, ...rows.map((r) => r.version.length)),
    Math.max(headers[2].length, ...rows.map((r) => r.model_floor.length)),
    Math.max(headers[3].length, ...rows.map((r) => r.last_validated.length)),
  ];
  const line = (c: string[]) => c.map((v, i) => pad(v, widths[i])).join("  ").trimEnd();
  const out = [
    line(headers),
    rows.map((r) => line([r.name, r.version, r.model_floor, r.last_validated])).join("\n"),
    "",
    `${rows.length} pack${rows.length === 1 ? "" : "s"}.`,
  ].join("\n");
  return { exitCode: 0, output: out };
}

// --- show --------------------------------------------------------------------
export function packShow(name: string, opts: PackCmdOptions = {}): CmdResult {
  const packsDir = opts.packsDir ?? defaultPacksDir();
  const path = packYamlPath(name, packsDir);
  if (!existsSync(path)) {
    return { exitCode: 1, output: `${NO} pack '${name}' not found in ${packsDir}` };
  }
  const doc = loadDoc(path);
  if (!doc) return { exitCode: 1, output: `${NO} pack '${name}': pack.yaml is not valid YAML` };

  const scaffoldRel = typeof doc.prompt_scaffold_path === "string" ? doc.prompt_scaffold_path : null;
  const scaffoldPath = scaffoldRel ? join(dirname(path), scaffoldRel) : null;
  const scaffold =
    scaffoldPath && existsSync(scaffoldPath) ? readFileSync(scaffoldPath, "utf8") : null;

  if (opts.json) {
    return {
      exitCode: 0,
      output: JSON.stringify(
        { ...doc, _scaffold_path: scaffoldRel, _scaffold: scaffold },
        null,
        2,
      ),
    };
  }

  const parts = [`# ${name}`, "", yaml.dump(doc, { lineWidth: 100 }).trimEnd()];
  if (scaffoldRel) {
    parts.push("", `--- scaffold (${scaffoldRel}) ---`, "");
    parts.push(scaffold ?? `${NO} referenced scaffold not found: ${scaffoldRel}`);
  }
  return { exitCode: 0, output: parts.join("\n") };
}

// --- diff --------------------------------------------------------------------
function diffLine(label: string, present: string[], missing: string[]): string {
  const total = present.length + missing.length;
  const all = missing.length === 0;
  const items =
    total === 0
      ? "none"
      : [...present.map((s) => `${s} ${OK}`), ...missing.map((s) => `${s} ${NO}`)].join(", ");
  return `${all ? OK : NO} ${label} (${present.length}/${total}): ${items}`;
}

export function packDiff(name: string, opts: PackCmdOptions = {}): CmdResult {
  const packsDir = opts.packsDir ?? defaultPacksDir();
  const manifest = loadPackManifest(name, packsDir);
  if (!manifest) {
    return { exitCode: 1, output: `${NO} pack '${name}' not found in ${packsDir}` };
  }
  const env = opts.env ?? detectEnv();
  const res = packResolve(manifest, env);
  const missingCount = res.missing_skills.length + res.missing_mcps.length;
  const exitCode = missingCount > 0 ? 2 : 0;

  if (opts.json) {
    return {
      exitCode,
      output: JSON.stringify({ pack: name, ...res, ok: exitCode === 0 }, null, 2),
    };
  }

  const lines = [
    `Pack: ${name}`,
    diffLine("Skills", res.available_skills, res.missing_skills),
    diffLine("MCPs", res.available_mcps, res.missing_mcps),
  ];
  if (res.suggest_install.length > 0) {
    lines.push("", "Install missing:");
    for (const cmd of res.suggest_install) lines.push(`  ${cmd}`);
  } else {
    lines.push("", "All dependencies available.");
  }
  return { exitCode, output: lines.join("\n") };
}

// --- validate ----------------------------------------------------------------
interface Check {
  name: string;
  pass: boolean;
  detail: string;
}

const isStr = (v: unknown): v is string => typeof v === "string";

function validUrl(v: unknown): boolean {
  if (!isStr(v) || !/^https?:\/\//.test(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function reposCheck(doc: Doc): Check {
  const repos = doc.repos_canonical;
  if (repos === undefined) {
    return { name: "repos_canonical", pass: true, detail: "absent (optional)" };
  }
  if (!Array.isArray(repos)) {
    return { name: "repos_canonical", pass: false, detail: "must be a list when present" };
  }
  const bad: string[] = [];
  repos.forEach((entry, i) => {
    const e = (entry ?? {}) as Doc;
    if (!isStr(e.name)) bad.push(`#${i} missing name`);
    if (!validUrl(e.url)) bad.push(`#${i} invalid url`);
    if (!isStr(e.license)) bad.push(`#${i} missing license`);
  });
  return bad.length === 0
    ? { name: "repos_canonical", pass: true, detail: `${repos.length} entr${repos.length === 1 ? "y" : "ies"} OK` }
    : { name: "repos_canonical", pass: false, detail: bad.join("; ") };
}

function scaffoldCheck(doc: Doc, yamlPath: string): Check {
  const rel = doc.prompt_scaffold_path;
  if (rel === undefined) {
    // inline prompt_scaffold or no scaffold at all — nothing to resolve on disk.
    return { name: "scaffold", pass: true, detail: "no scaffold_path referenced" };
  }
  if (!isStr(rel)) {
    return { name: "scaffold", pass: false, detail: "prompt_scaffold_path must be a string" };
  }
  const exists = existsSync(join(dirname(yamlPath), rel));
  return exists
    ? { name: "scaffold", pass: true, detail: rel }
    : { name: "scaffold", pass: false, detail: `referenced file not found: ${rel}` };
}

export function packValidate(name: string, opts: PackCmdOptions = {}): CmdResult {
  const packsDir = opts.packsDir ?? defaultPacksDir();
  const path = packYamlPath(name, packsDir);
  if (!existsSync(path)) {
    return { exitCode: 1, output: `${NO} pack '${name}' not found in ${packsDir}` };
  }
  const doc = loadDoc(path);
  if (!doc) return { exitCode: 1, output: `${NO} pack '${name}': pack.yaml is not valid YAML` };

  const validation = (doc.validation ?? {}) as Doc;
  const checks: Check[] = [];

  // 1. schema (reuses packs/validate.ts — same validator as packs/tests/schema.test.ts)
  const schemaErrors = validatePack(doc);
  checks.push({
    name: "schema",
    pass: schemaErrors.length === 0,
    detail: schemaErrors.length === 0 ? "valid against pack.schema.yaml" : schemaErrors.join("; "),
  });

  // 2. smoke_test present (non-empty string)
  const smoke = validation.smoke_test;
  checks.push({
    name: "smoke_test",
    pass: isStr(smoke) && smoke.trim().length > 0,
    detail: isStr(smoke) && smoke.trim().length > 0 ? "present" : "missing or empty",
  });

  // 3. acceptance_criteria non-empty list of strings
  const ac = validation.acceptance_criteria;
  const acOk = Array.isArray(ac) && ac.length >= 1 && ac.every(isStr);
  checks.push({
    name: "acceptance_criteria",
    pass: acOk,
    detail: acOk ? `${(ac as string[]).length} criteri${(ac as string[]).length === 1 ? "on" : "a"}` : "must be a non-empty string list",
  });

  // 4. repos_canonical entries have name/url/license (when present)
  checks.push(reposCheck(doc));

  // 5. referenced scaffold exists
  checks.push(scaffoldCheck(doc, path));

  const allPass = checks.every((c) => c.pass);

  if (opts.json) {
    return { exitCode: allPass ? 0 : 1, output: JSON.stringify({ pack: name, ok: allPass, checks }, null, 2) };
  }

  const lines = [`Validate: ${name}`];
  for (const c of checks) lines.push(`  ${c.pass ? OK : NO} ${pad(c.name, 20)} ${c.detail}`);
  lines.push("", allPass ? `${OK} PASS` : `${NO} FAIL`);
  return { exitCode: allPass ? 0 : 1, output: lines.join("\n") };
}

// --- dispatch ----------------------------------------------------------------
export function runPack(argv: string[]): CmdResult {
  const json = argv.includes("--json");
  const positional = argv.filter((a) => a !== "--json");
  const [sub, name] = positional;

  switch (sub) {
    case "list":
      return packList({ json });
    case "show":
      if (!name) return { exitCode: 1, output: `${NO} usage: mooter pack show <name>` };
      return packShow(name, { json });
    case "diff":
      if (!name) return { exitCode: 1, output: `${NO} usage: mooter pack diff <name>` };
      return packDiff(name, { json });
    case "validate":
      if (!name) return { exitCode: 1, output: `${NO} usage: mooter pack validate <name>` };
      return packValidate(name, { json });
    default:
      return { exitCode: 1, output: `${NO} unknown pack subcommand '${sub ?? ""}'\n\n${PACK_USAGE}` };
  }
}
