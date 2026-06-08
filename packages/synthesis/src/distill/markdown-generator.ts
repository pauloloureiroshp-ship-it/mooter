// Pastor distillation — markdown generator (Wave 31). Turns DistilledPatterns into
// an Anthropic-compatible `.skill.md` (YAML frontmatter `name`/`description` + body).
// The output is a portable, installable skill that encodes *this machine's* learned
// routing patterns — the NotebookLM-style "distil what you learned into a skill"
// pattern from the Wave 29 audit.

import type { DistilledPatterns, RoutingPattern } from "./pattern-extractor.ts";

export interface SkillMeta {
  name: string; // kebab-case skill name
  date: string; // ISO date (caller-supplied — no Date.now in here)
  min_count: number; // patterns below this support are summarised, not tabled
}

const TIER_MODEL: Record<string, string> = {
  T0: "local (Ollama)",
  T1: "Haiku",
  T2: "Sonnet",
  T3: "Opus",
};

function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function distRow(dist: Record<string, number>, total: number): string {
  return Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${pct(v, total)}`)
    .join(" · ");
}

function patternTable(patterns: RoutingPattern[], minCount: number): string {
  const rows = patterns.filter((p) => p.count >= minCount);
  if (!rows.length) return "_No high-support patterns yet — keep routing and re-distil later._";
  const header = "| Task category | Tier | Model | Lang | n | avg conf |\n|---|---|---|---|---|---|";
  const body = rows
    .map(
      (p) =>
        `| ${p.task_category} | ${p.tier} | ${TIER_MODEL[p.tier] ?? p.model} | ${p.dominant_lang} | ${p.count} | ${p.avg_confidence.toFixed(2)} |`,
    )
    .join("\n");
  return `${header}\n${body}`;
}

/** Build the full `.skill.md` document (frontmatter + body) from distilled patterns. */
export function generateSkillMarkdown(patterns: DistilledPatterns, meta: SkillMeta): string {
  const total = patterns.total;
  const topCat = patterns.patterns[0]?.task_category ?? "—";
  const description =
    `Learned LLM routing patterns distilled from ${total} local routing decisions ` +
    `(top category: ${topCat}). Use as a routing reference: match the task to a category ` +
    `below and prefer the listed tier/model.`;

  const frontmatter = ["---", `name: ${meta.name}`, `description: ${description}`, "---", ""].join("\n");

  const body = [
    `# Pastor — Distilled Routing Skill`,
    "",
    `> Generated ${meta.date} from ${patterns.generated_from} classified routing decisions on this machine.`,
    `> Privacy: features only — no prompts or responses are included.`,
    "",
    `## Tier mix`,
    "",
    distRow(patterns.tier_distribution, total) || "—",
    "",
    `## Language mix`,
    "",
    distRow(patterns.lang_distribution, total) || "—",
    "",
    `## Learned routing rules`,
    "",
    `When a task matches one of these categories, prefer the corresponding tier/model:`,
    "",
    patternTable(patterns.patterns, meta.min_count),
    "",
    `## How to use`,
    "",
    `1. Classify the incoming task into one of the categories above.`,
    `2. Route to the listed tier (T0 local → T3 Opus). Escalate only on HIGH_RISK signals (deploy, migration, secrets).`,
    `3. The doctrine guardrail always wins: never downgrade a HIGH_RISK task below T3.`,
    "",
    `_This skill is a snapshot. Re-run \`mooter pastor distill\` to refresh it as the Pastor learns more._`,
    "",
  ].join("\n");

  return frontmatter + body;
}
