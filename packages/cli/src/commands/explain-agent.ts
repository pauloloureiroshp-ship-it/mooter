// `mooter explain agent` (Wave 58 A.11) — educational mode: given a task
// description or task_category, explain which model Mooter would pick, why,
// and what the alternatives are. Mirrors the /explain wave + Wave 53 explain
// pattern: pure (text-only return), injectable engine for tests, lazy import.
//
// Usage:
//   mooter explain agent <task>
//   mooter explain agent <task> [--force-model <id>] [--max-cost <usd>] [--prefer-local] [--json]
//
// The <task> argument may be:
//   - A raw task_category string (e.g. "coding.frontend")
//   - A natural-language description (mapped heuristically to the closest category)
//
// NO FABRICATION (Doctrine V4 #5): all scores, costs, and TES values are
// passed through from decideAgent() as-is. Null is rendered as "?" and
// heuristic picks are clearly labelled. We never invent a number.

export interface CmdResult {
  exitCode: number;
  output: string;
}

// ── Injectable engine (lazy import seam for tests) ────────────────────────────

export interface AgentEngine {
  decideAgent(args: {
    task_category: string;
    min_score?: number;
    max_cost_usd?: number;
    prefer_local?: boolean;
    force_model?: string;
  }): {
    chosen_model: string | null;
    reason: string;
    tes: number | null;
    alternatives: Array<{
      model: string;
      score: number | null;
      tes: number | null;
      cost: number | null;
      why_not: string;
    }>;
    cited_source: string | null;
    coverage_note: string;
  };
  emojiForModel(id: string): { emoji: string; label: string; color: string };
  TASK_CATEGORIES: readonly string[];
}

// Default loader: lazy-imports the real engine modules. Tests substitute their own.
async function loadEngine(): Promise<AgentEngine> {
  const [{ decideAgent, TASK_CATEGORIES }, { default: emojiMap }] = await Promise.all([
    import("../../../router/src/decide-agent.ts"),
    import("../../../../tools/router/llm-emoji-map.js"),
  ]);
  return { decideAgent, emojiForModel: emojiMap.emojiForModel, TASK_CATEGORIES };
}

// ── parseArgs ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  task: string;
  forceModel: string | undefined;
  maxCost: number | undefined;
  preferLocal: boolean;
  json: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  if (argv.length === 0) {
    return { error: "missing <task> argument" };
  }

  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force-model" || a === "--max-cost") {
      const key = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[key] = argv[++i];
      } else {
        return { error: `${a} requires a value` };
      }
    } else if (a === "--prefer-local" || a === "--json") {
      flags[a.slice(2)] = true;
    } else {
      positional.push(a);
    }
  }

  if (positional.length === 0) {
    return { error: "missing <task> argument" };
  }

  const maxCostRaw = flags["max-cost"];
  let maxCost: number | undefined;
  if (typeof maxCostRaw === "string") {
    maxCost = parseFloat(maxCostRaw);
    if (!Number.isFinite(maxCost) || maxCost < 0) {
      return { error: `--max-cost must be a non-negative number, got "${maxCostRaw}"` };
    }
  }

  return {
    task: positional.join(" "),
    forceModel: typeof flags["force-model"] === "string" ? flags["force-model"] : undefined,
    maxCost,
    preferLocal: flags["prefer-local"] === true,
    json: flags["json"] === true,
  };
}

// ── Natural-language → task_category heuristic ───────────────────────────────
//
// If the task is already a valid category string, use it directly. Otherwise
// apply a lightweight keyword heuristic to pick the closest. The mapping is
// best-effort — coverage_note from decideAgent always says whether it is
// measured or heuristic, so any mis-mapping is transparent to the user.

const KEYWORD_MAP: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["frontend", "ui", "react", "vue", "css", "html", "tailwind", "component"], category: "coding.frontend" },
  { keywords: ["backend", "api", "server", "express", "fastapi", "django", "node", "rest", "graphql"], category: "coding.backend" },
  { keywords: ["data", "sql", "database", "etl", "pipeline", "pandas", "spark", "analytics"], category: "coding.data" },
  { keywords: ["infra", "devops", "docker", "kubernetes", "ci", "terraform", "cloud", "deploy"], category: "coding.infra" },
  { keywords: ["security", "auth", "vulnerability", "cve", "pentest", "owasp"], category: "coding.security" },
  { keywords: ["competitive", "leetcode", "algo", "algorithm", "contest"], category: "coding.competitive" },
  { keywords: ["refactor", "cleanup", "clean up", "restructure", "simplify code"], category: "coding.refactor" },
  { keywords: ["test", "unit test", "integration test", "spec", "jest", "vitest", "coverage"], category: "coding.test" },
  { keywords: ["debug", "fix bug", "error", "exception", "stack trace", "broken"], category: "coding.debug" },
  { keywords: ["math", "equation", "calculus", "proof", "formula", "statistics"], category: "reasoning.math" },
  { keywords: ["science", "physics", "chemistry", "biology", "research paper"], category: "reasoning.science" },
  { keywords: ["reasoning", "logic", "puzzle", "general question", "explain"], category: "reasoning.general" },
  { keywords: ["agentic", "agent", "tool use", "multi-step", "orchestrat"], category: "reasoning.agentic" },
  { keywords: ["prose", "portuguese", "pt-pt", "escreve", "artigo"], category: "writing.prose-pt-pt" },
  { keywords: ["essay", "writing", "article", "blog", "copywriting"], category: "writing.prose-en" },
  { keywords: ["structured", "json output", "schema", "form", "table"], category: "writing.structured" },
  { keywords: ["translat", "translate", "localis", "localize"], category: "writing.translation" },
  { keywords: ["coordinator", "coordinat", "plan tasks", "delegate"], category: "agents.coordinator" },
  { keywords: ["implement", "build feature", "write code", "code for"], category: "agents.implementor" },
  { keywords: ["review", "code review", "audit"], category: "agents.reviewer" },
  { keywords: ["large context", "long context", "big file", "huge"], category: "context.large" },
  { keywords: ["small context", "short", "snippet", "one-liner"], category: "context.small" },
  { keywords: ["image", "vision", "screenshot", "multimodal", "ocr"], category: "context.multimodal" },
  { keywords: ["audio", "transcrib", "speech", "voice"], category: "context.audio" },
];

export function inferCategory(task: string, validCategories: readonly string[]): string {
  // Exact match first (user may pass a category directly)
  if (validCategories.includes(task)) return task;

  const lower = task.toLowerCase();

  // Longest keyword match wins (tie → first in table)
  let bestCategory = "coding.backend"; // sensible fallback
  let bestLen = 0;

  for (const { keywords, category } of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (lower.includes(kw) && kw.length > bestLen) {
        bestLen = kw.length;
        bestCategory = category;
      }
    }
  }

  return bestCategory;
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

function fmtTes(tes: number | null, status?: string): string {
  if (tes === null) return "? (pending/unmeasured)";
  const suffix = status === "free" ? " (floored — local model)" : "";
  return `${tes.toFixed(2)}${suffix}`;
}

function fmtCost(cost: number | null): string {
  if (cost === null) return "? (pending)";
  if (cost === 0) return "$0 (local)";
  return `$${cost.toFixed(4)}/1k tokens (blended)`;
}

function renderHuman(
  task: string,
  category: string,
  taskIsCategory: boolean,
  result: ReturnType<AgentEngine["decideAgent"]>,
  emojiForModel: AgentEngine["emojiForModel"],
): string {
  const lines: string[] = [];

  const inferLine = taskIsCategory
    ? `task category: ${category}`
    : `task: "${task}"  →  inferred category: ${category}`;

  lines.push(`mooter explain agent — ${inferLine}`);
  lines.push("");

  if (result.chosen_model === null) {
    lines.push(`chosen model:  (none — no candidate qualified)`);
    lines.push(`reason:        ${result.reason}`);
  } else {
    const em = emojiForModel(result.chosen_model);
    lines.push(`chosen model:  ${em.emoji} ${result.chosen_model}`);
    lines.push(`reason:        ${result.reason}`);
    lines.push(`TES:           ${fmtTes(result.tes)}`);
  }

  lines.push(`cited source:  ${result.cited_source ?? "(none — heuristic pick)"}`);
  lines.push(`coverage note: ${result.coverage_note}`);

  if (result.alternatives.length > 0) {
    lines.push("");
    lines.push("alternatives considered:");
    const maxModel = Math.max(
      ...result.alternatives.map((a) => a.model.length),
      "model".length,
    );
    for (const alt of result.alternatives) {
      const em = emojiForModel(alt.model);
      const pad = alt.model.padEnd(maxModel);
      const score = alt.score !== null ? `score=${alt.score}` : "score=?";
      const tes = alt.tes !== null ? `TES=${alt.tes.toFixed(2)}` : "TES=?";
      const cost = fmtCost(alt.cost);
      lines.push(`  ${em.emoji} ${pad}  ${score}  ${tes}  cost=${cost}`);
      lines.push(`           why not: ${alt.why_not}`);
    }
  }

  lines.push("");
  lines.push("(see: mooter explain tiers · mooter explain agents)");

  return lines.join("\n");
}

// ── Main entry point ──────────────────────────────────────────────────────────

export const EXPLAIN_AGENT_USAGE = `mooter explain agent <task> [flags]

  Explain which model Mooter picks for a task, why, and what the alternatives are.

  <task>          task_category (e.g. "coding.frontend") or natural-language description
  --force-model   override and explain a specific model instead of the TES winner
  --max-cost      hard cap on blended per-1k cost in USD (e.g. --max-cost 0.005)
  --prefer-local  prefer a free local model if within 5% TES of the top pick
  --json          emit raw JSON instead of human-readable text

Examples:
  mooter explain agent "fix a React bug"
  mooter explain agent coding.backend --prefer-local
  mooter explain agent "write a blog post" --json
  mooter explain agent "coding.debug" --force-model qwen3-30b`;

export async function runExplainAgent(
  argv: string[],
  engineLoader: () => Promise<AgentEngine> = loadEngine,
): Promise<CmdResult> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return { exitCode: 0, output: EXPLAIN_AGENT_USAGE };
  }

  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    return { exitCode: 1, output: `error: ${parsed.error}\n\n${EXPLAIN_AGENT_USAGE}` };
  }

  let engine: AgentEngine;
  try {
    engine = await engineLoader();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      exitCode: 1,
      output: `error: could not load the agent engine — ${msg}\n(run npm install in packages/router)`,
    };
  }

  const taskIsCategory = engine.TASK_CATEGORIES.includes(parsed.task);
  const category = inferCategory(parsed.task, engine.TASK_CATEGORIES);

  const result = engine.decideAgent({
    task_category: category,
    max_cost_usd: parsed.maxCost,
    prefer_local: parsed.preferLocal,
    force_model: parsed.forceModel,
  });

  if (parsed.json) {
    return {
      exitCode: 0,
      output: JSON.stringify(
        {
          task: parsed.task,
          inferred_category: category,
          task_is_category: taskIsCategory,
          ...result,
        },
        null,
        2,
      ),
    };
  }

  return {
    exitCode: 0,
    output: renderHuman(parsed.task, category, taskIsCategory, result, engine.emojiForModel),
  };
}
