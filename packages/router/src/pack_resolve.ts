// pack_resolve.ts — env gap analysis for a resolved pack (Pastor Wave 1, Day 4).
//
// Once classify_domain() picks a pack, the hook needs to know: which of the
// pack's skills/MCPs are actually available in this environment, which are
// missing, and what to suggest installing. packResolve() answers that.
//
// Day 4 creates this as a dedicated module (front-running the Day 6 extraction:
// PASTOR §10.6 reuses it from `mooter pack diff/install`). It is pure +
// injectable: callers pass a ResolveEnv, so tests never touch the real disk.
// detectEnv() is the best-effort disk reader used by the live hook.
//
// Graceful degradation (PASTOR §10.4 constraint): when an environment
// dimension cannot be determined (no mcpServers in settings.json/.claude.json/
// .mcp.json, no skills inventory), that dimension is marked *_known=false and
// its `missing` list is empty — we never emit a false "install X" nag.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { defaultPacksDir } from "./classify_domain.ts";

// --- pack manifest (the slice of pack.yaml packResolve cares about) ---
export interface PackManifest {
  pack_id: string;
  model_floor: string; // T0..T3
  model_ceiling: string;
  skills_required: string[];
  skills_recommended: string[];
  mcps_required: string[];
  mcps_recommended: string[];
  subagent_primary: string | null;
  subagent_reviewer: string | null;
  scaffold_url: string | null; // packs/<id>/scaffold.md when a scaffold is referenced
}

// --- the environment packResolve diffs the pack against ---
export interface ResolveEnv {
  available_skills: string[];
  available_mcps: string[];
  // When false, that dimension is unknown → its `missing` list stays empty
  // (no false nag). Defaults to true when omitted (explicit test envs).
  skills_known?: boolean;
  mcps_known?: boolean;
}

// --- result consumed by the hook to build <pack-hint> ---
export interface PackResolution {
  available_skills: string[]; // pack-wanted skills present in env
  available_mcps: string[]; // pack-wanted MCPs present in env
  skills_invoke: string[]; // skills to invoke at the start of the response
  missing_skills: string[];
  missing_mcps: string[];
  suggest_install: string[]; // empty when nothing is missing
}

// --- MCP install registry shape (packages/router/data/mcp_install_registry.json) ---
interface McpRegistryEntry {
  install: string;
  transport?: string;
  note?: string;
}
interface McpRegistry {
  version?: string;
  servers: Record<string, McpRegistryEntry>;
}

const asArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Read packs/<pack_id>/pack.yaml and project it to a PackManifest.
 * Returns null if the pack does not exist (caller treats as GENERAL).
 */
export function loadPackManifest(
  pack_id: string,
  packsDir: string = defaultPacksDir(),
): PackManifest | null {
  const yamlPath = join(packsDir, pack_id, "pack.yaml");
  if (!existsSync(yamlPath)) return null;
  let doc: Record<string, unknown>;
  try {
    doc = (yaml.load(readFileSync(yamlPath, "utf8")) ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
  const skills = (doc.skills ?? {}) as Record<string, unknown>;
  const mcps = (doc.mcps ?? {}) as Record<string, unknown>;
  const subagents = (doc.subagents ?? {}) as Record<string, unknown>;
  const hasScaffold =
    typeof doc.prompt_scaffold_path === "string" || typeof doc.prompt_scaffold === "string";
  return {
    pack_id: typeof doc.name === "string" ? doc.name : pack_id,
    model_floor: typeof doc.model_floor === "string" ? doc.model_floor : "T2",
    model_ceiling: typeof doc.model_ceiling === "string" ? doc.model_ceiling : "T3",
    skills_required: asArr(skills.required),
    skills_recommended: asArr(skills.recommended),
    mcps_required: asArr(mcps.required),
    mcps_recommended: asArr(mcps.recommended),
    subagent_primary: typeof subagents.primary === "string" ? subagents.primary : null,
    subagent_reviewer: typeof subagents.reviewer === "string" ? subagents.reviewer : null,
    scaffold_url: hasScaffold ? `packs/${pack_id}/scaffold.md` : null,
  };
}

// --- tolerant matching --------------------------------------------------------
// Skills are namespaced (`anthropic-skills:web-artifacts-builder`); an env may
// list either the full id or the bare name. MCPs differ in casing across config
// sources. Match on lowercase, accepting the post-colon tail for skills.
function skillKeys(name: string): string[] {
  const lower = name.toLowerCase();
  const tail = lower.includes(":") ? lower.slice(lower.indexOf(":") + 1) : lower;
  return tail === lower ? [lower] : [lower, tail];
}
function hasSkill(available: string[], wanted: string): boolean {
  const av = new Set(available.map((s) => s.toLowerCase()));
  return skillKeys(wanted).some((k) => av.has(k));
}
function hasMcp(available: string[], wanted: string): boolean {
  const w = wanted.toLowerCase();
  return available.some((a) => {
    const al = a.toLowerCase();
    return al === w || al.includes(w) || w.includes(al);
  });
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

/**
 * Diff a pack against an environment.
 *
 * Policy (generic — nothing pack-specific is hard-coded):
 *   wanted_skills = required ∪ recommended;  wanted_mcps = required ∪ recommended
 *   skills_invoke = wanted_skills present in env
 *   missing_*     = wanted_* absent from env   (skipped when *_known === false)
 *   available_*   = wanted_* present in env
 * Required-vs-recommended is treated uniformly for the gap here; the hard
 * "required blocks / recommended is optional" doctrine is a Day 6 refinement.
 */
export function packResolve(
  manifest: PackManifest,
  env: ResolveEnv,
  registry: McpRegistry | null = loadMcpRegistry(),
): PackResolution {
  const skillsKnown = env.skills_known !== false;
  const mcpsKnown = env.mcps_known !== false;

  const wantedSkills = uniq([...manifest.skills_required, ...manifest.skills_recommended]);
  const wantedMcps = uniq([...manifest.mcps_required, ...manifest.mcps_recommended]);

  const availableSkills = wantedSkills.filter((s) => hasSkill(env.available_skills, s));
  const availableMcps = wantedMcps.filter((m) => hasMcp(env.available_mcps, m));

  const missingSkills = skillsKnown
    ? wantedSkills.filter((s) => !hasSkill(env.available_skills, s))
    : [];
  const missingMcps = mcpsKnown
    ? wantedMcps.filter((m) => !hasMcp(env.available_mcps, m))
    : [];

  // skills_invoke: invoke what is actually present. When skills are unknown,
  // fall back to the required set (advisory — Claude Code surfaces if absent).
  const skillsInvoke = skillsKnown ? availableSkills : manifest.skills_required;

  const suggestInstall = suggestInstallCmd(
    manifest.pack_id,
    missingSkills,
    missingMcps,
    registry,
  );

  return {
    available_skills: availableSkills,
    available_mcps: availableMcps,
    skills_invoke: skillsInvoke,
    missing_skills: missingSkills,
    missing_mcps: missingMcps,
    suggest_install: suggestInstall,
  };
}

/**
 * Build install suggestions. First element is the one-shot pack installer;
 * per-item commands follow (MCP install from the registry, skills via the
 * Anthropic skill installer, with a clear fallback when not in the registry).
 * Returns [] when nothing is missing.
 */
export function suggestInstallCmd(
  pack_id: string,
  missingSkills: string[],
  missingMcps: string[],
  registry: McpRegistry | null = loadMcpRegistry(),
): string[] {
  if (missingSkills.length === 0 && missingMcps.length === 0) return [];
  const out: string[] = [`mooter pack install ${pack_id}`];
  for (const mcp of missingMcps) {
    const entry = registry?.servers?.[mcp.toLowerCase()] ?? registry?.servers?.[mcp];
    out.push(entry ? entry.install : `# ${mcp}: not in mcp_install_registry — manual install`);
  }
  for (const skill of missingSkills) {
    out.push(`claude skill install ${skill}`);
  }
  return out;
}

// --- registry loading ---------------------------------------------------------
// Runtime override at ~/.mooter/cache/mcp_install_registry.json wins; the
// versioned default in packages/router/data/ is the source of truth.
let _registry: McpRegistry | null | undefined;
export function loadMcpRegistry(): McpRegistry | null {
  if (_registry !== undefined) return _registry;
  const candidates = [
    join(homedir(), ".mooter", "cache", "mcp_install_registry.json"),
    join(import.meta.dirname ?? ".", "..", "data", "mcp_install_registry.json"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        _registry = JSON.parse(readFileSync(p, "utf8")) as McpRegistry;
        return _registry;
      }
    } catch {
      /* try next */
    }
  }
  _registry = null;
  return _registry;
}

// --- live environment detection (best-effort; never throws) -------------------
/**
 * Detect available skills + MCPs from disk. Each dimension carries a *_known
 * flag: false means we found no config source for it, so packResolve will not
 * report anything as missing for that dimension (graceful degradation).
 */
export function detectEnv(cwd: string = process.cwd()): ResolveEnv {
  const mcps = detectMcps(cwd);
  const skills = detectSkills(cwd);
  return {
    available_mcps: mcps.list,
    mcps_known: mcps.known,
    available_skills: skills.list,
    skills_known: skills.known,
  };
}

function readJson(p: string): Record<string, unknown> | null {
  try {
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function mcpServerKeys(obj: unknown): string[] {
  return obj && typeof obj === "object" ? Object.keys(obj as Record<string, unknown>) : [];
}

function detectMcps(cwd: string): { list: string[]; known: boolean } {
  const found: string[] = [];
  let known = false;

  // 1) ~/.claude/settings.json → mcpServers
  const settings = readJson(join(homedir(), ".claude", "settings.json"));
  if (settings && "mcpServers" in settings) {
    known = true;
    found.push(...mcpServerKeys(settings.mcpServers));
  }
  // 2) ~/.claude.json → mcpServers + projects[cwd].mcpServers
  const claudeJson = readJson(join(homedir(), ".claude.json"));
  if (claudeJson) {
    if ("mcpServers" in claudeJson) {
      known = true;
      found.push(...mcpServerKeys(claudeJson.mcpServers));
    }
    const projects = claudeJson.projects as Record<string, { mcpServers?: unknown }> | undefined;
    if (projects && projects[cwd] && "mcpServers" in projects[cwd]) {
      known = true;
      found.push(...mcpServerKeys(projects[cwd].mcpServers));
    }
  }
  // 3) ./.mcp.json → mcpServers
  const projectMcp = readJson(join(cwd, ".mcp.json"));
  if (projectMcp && "mcpServers" in projectMcp) {
    known = true;
    found.push(...mcpServerKeys(projectMcp.mcpServers));
  }

  return { list: uniq(found), known };
}

function detectSkills(cwd: string): { list: string[]; known: boolean } {
  const found: string[] = [];
  let known = false;
  for (const dir of [join(homedir(), ".claude", "skills"), join(cwd, ".claude", "skills")]) {
    try {
      if (existsSync(dir)) {
        known = true;
        for (const d of readdirSync(dir, { withFileTypes: true })) {
          if (d.isDirectory()) found.push(d.name);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return { list: uniq(found), known };
}
