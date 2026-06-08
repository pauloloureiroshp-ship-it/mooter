// Pastor distillation — skill emitter (Wave 31). Orchestrates the distill pipeline:
//   read decisions log → extract patterns → generate markdown → write .skill.md.
// Pure-ish: the decisions source and clock are injectable so the CLI/tests stay
// deterministic. Resolves a sensible default decisions log when none is given.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mooterPath } from "../config.ts";
import { parseDecisions, extractPatterns, type DistilledPatterns } from "./pattern-extractor.ts";
import { generateSkillMarkdown, type SkillMeta } from "./markdown-generator.ts";

/** Candidate decisions-log locations, most-authoritative first. */
export function defaultDecisionsLog(): string | null {
  const env = process.env.MOOTER_DECISIONS_LOG;
  const candidates = [
    env,
    join(homedir(), ".claude", "tools", "router", "decisions.log"),
    join(process.cwd(), "tools", "router", "decisions.log"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
  return candidates.find((p) => existsSync(p)) ?? null;
}

export interface EmitOptions {
  decisionsPath?: string; // explicit log path (else defaultDecisionsLog())
  decisionsText?: string; // raw log text (overrides path — for tests)
  outPath?: string; // explicit output file (else ~/.mooter/distilled/pastor-<date>.skill.md)
  date?: string; // ISO date string (else derived from `now`)
  now?: () => Date; // injectable clock
  name?: string; // skill name (else "my-pastor-routing")
  minCount?: number; // min support for a pattern to be tabled
}

export interface EmitResult {
  ok: boolean;
  path?: string;
  markdown: string;
  patterns: DistilledPatterns;
  reason?: string;
}

/** Run the full distillation and write the skill markdown. Returns the path + content. */
export function emitSkill(opts: EmitOptions = {}): EmitResult {
  const now = opts.now ? opts.now() : new Date();
  const date = opts.date ?? now.toISOString().slice(0, 10);

  let text = opts.decisionsText;
  if (text === undefined) {
    const path = opts.decisionsPath ?? defaultDecisionsLog();
    if (!path || !existsSync(path)) {
      const empty = extractPatterns([]);
      return {
        ok: false,
        markdown: "",
        patterns: empty,
        reason: "no decisions log found — set MOOTER_DECISIONS_LOG or route some tasks first",
      };
    }
    text = readFileSync(path, "utf8");
  }

  const events = parseDecisions(text);
  const patterns = extractPatterns(events);
  const meta: SkillMeta = {
    name: opts.name ?? "my-pastor-routing",
    date,
    min_count: opts.minCount ?? 2,
  };
  const markdown = generateSkillMarkdown(patterns, meta);

  if (events.length === 0) {
    return { ok: false, markdown, patterns, reason: "decisions log has no classified events yet" };
  }

  const outPath = opts.outPath ?? mooterPath("distilled", `pastor-${date}.skill.md`);
  // writeJson only writes JSON; emit raw markdown via the same dir-safe approach.
  writeSkillFile(outPath, markdown);
  return { ok: true, path: outPath, markdown, patterns };
}

// Dir-safe raw-text write (mirrors config.writeJson's mkdir behaviour).
function writeSkillFile(path: string, content: string): void {
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content, "utf8");
}
