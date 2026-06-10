// packages/cli/src/fable-observe/cca-f-questions.ts — Wave 54 Phase A.
//
// Seed-deterministic synthetic question generator for the CCA-F audit harness.
// Questions are INSPIRED BY the five public CCA-F domains (Agentic Architecture,
// CC Configuration, Prompt Engineering, Tool/MCP, Context Management) — they are
// NOT, and must never be, copies of protected official exam questions. Every
// question carries a `citation` naming the public objective it is modelled on.
//
// Honesty doctrine: same seed ⇒ identical 60 questions (reproducibility). The RNG
// is a self-contained mulberry32 (credited to wave2-benchmark/lib/stats.ts) so the
// shipped CLI carries no dependency on a sibling package's scripts/ tree.

import type { CcaFDomain } from "./cca-f-export.ts";

export type AuditDomain = "agentic" | "cc_config" | "prompt_eng" | "mcp" | "context";
export type Difficulty = "foundational" | "intermediate" | "advanced";
export type Tier = "T0" | "T1" | "T2" | "T3";

export interface CCAFQuestion {
  id: string; // 'wave54-q001'
  domain: AuditDomain;
  difficulty: Difficulty;
  prompt: string; // 300-800 chars
  rubric: {
    criteria: string[]; // 3-5 items
    pass_threshold: number; // 0-100
  };
  expected_tier: Tier;
  expected_subagent?: string;
  citation: string; // "inspired by CCA-F objective X.Y"
  seed: number; // per-question derived seed (for traceability)
}

// The official domain weights → exact per-domain question counts summing to 60.
export const DOMAIN_ALLOCATION: Record<AuditDomain, number> = {
  agentic: 16, // 27%
  cc_config: 12, // 20%
  prompt_eng: 12, // 20%
  mcp: 11, // 18%
  context: 9, // 15%
};

export const TOTAL_QUESTIONS = Object.values(DOMAIN_ALLOCATION).reduce((a, b) => a + b, 0); // 60

/** The AuditDomain set is a strict subset of the export's CcaFDomain union. */
const _domainSubset: AuditDomain extends CcaFDomain ? true : false = true;
void _domainSubset;

// ---------------------------------------------------------------------------
// mulberry32 — deterministic PRNG (credit: wave2-benchmark/lib/stats.ts).
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return (): number => {
    t = (t + 0x6d2b79f5) >>> 0;
    let z = t;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    z = (z ^ (z >>> 14)) >>> 0;
    return z / 0x100000000;
  };
}

/** Deterministic 32-bit FNV-1a hash → per-question sub-seed. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------------------------------------------------------------------------
// Template library — 3 difficulties × 5 domains. Each template fills variation
// slots from a small pool so the same seed reproduces the exact same prompt.
// ---------------------------------------------------------------------------
interface Template {
  difficulty: Difficulty;
  expected_tier: Tier;
  expected_subagent?: string;
  citation: string;
  criteria: string[];
  pass_threshold: number;
  // `slots` are filled deterministically; `render` composes a 300-800 char prompt.
  slots: Record<string, readonly string[]>;
  render: (s: Record<string, string>) => string;
}

const TEMPLATES: Record<AuditDomain, Template[]> = {
  agentic: [
    {
      difficulty: "foundational",
      expected_tier: "T1",
      citation: "inspired by CCA-F objective 1.1 (subagent fundamentals)",
      criteria: ["names the correct subagent role", "justifies delegate-vs-inline", "no over-engineering"],
      pass_threshold: 60,
      slots: { task: ["summarise a 200-line file", "rename a symbol across one module", "extract fields from a log line"] },
      render: (s) =>
        `You are orchestrating a coding agent. The user asks to ${s.task}. Decide whether to handle it inline ` +
        `or delegate to a subagent, and if delegating, which role (reasoner, triage, local-summarizer, architect). ` +
        `Explain the minimum-viable choice and why a heavier tier would waste budget. Keep the reasoning to the ` +
        `decision itself — do not actually perform the task.`,
    },
    {
      difficulty: "intermediate",
      expected_tier: "T2",
      expected_subagent: "model-reasoner",
      citation: "inspired by CCA-F objective 1.3 (orchestration trade-offs)",
      criteria: ["correct fan-out vs sequential call", "identifies data dependencies", "bounds parallelism", "names a failure mode"],
      pass_threshold: 65,
      slots: { work: ["review 8 changed files for bugs", "migrate 12 call-sites to a new API", "research 5 libraries for one feature"] },
      render: (s) =>
        `Design the orchestration for this task: ${s.work}. Should the subtasks fan out in parallel or run as a ` +
        `pipeline? Identify which steps have data dependencies (so they cannot be parallel), how to bound concurrency ` +
        `so the machine is not overwhelmed, and one failure mode (e.g. one subtask throwing) plus how the orchestrator ` +
        `should degrade. Return the orchestration shape and the reasoning, not an implementation.`,
    },
    {
      difficulty: "advanced",
      expected_tier: "T3",
      expected_subagent: "model-architect",
      citation: "inspired by CCA-F objective 1.5 (multi-agent system design)",
      criteria: ["sound agent topology", "explicit verification/adversarial step", "cost-vs-confidence trade-off", "blast-radius control", "honest uncertainty"],
      pass_threshold: 70,
      slots: { system: ["a code-review system that must not miss security bugs", "a research harness that must cite every claim", "a migration agent that mutates files in parallel"] },
      render: (s) =>
        `Architect ${s.system}. Specify the agent topology (which agents, which model tier each, how they hand off), ` +
        `where an independent verification or adversarial-refutation step belongs, and how you trade extra agent cost ` +
        `against higher confidence. Address blast-radius: how do you stop one bad agent from corrupting the whole run? ` +
        `State where the design is uncertain rather than overclaiming.`,
    },
  ],
  cc_config: [
    {
      difficulty: "foundational",
      expected_tier: "T0",
      citation: "inspired by CCA-F objective 2.1 (CC settings basics)",
      criteria: ["correct settings.json location", "right key for the behaviour", "no invented fields"],
      pass_threshold: 55,
      slots: { want: ["allow all npm commands without prompting", "set an env var for every session", "change the default model"] },
      render: (s) =>
        `A Claude Code user wants to ${s.want}. Which settings file does this belong in (project vs user), and what ` +
        `is the exact JSON key and shape? Explain whether this needs a hook or is a plain setting, and warn about any ` +
        `field that does NOT exist so the user does not invent one. Be concise — this is a configuration lookup.`,
    },
    {
      difficulty: "intermediate",
      expected_tier: "T2",
      citation: "inspired by CCA-F objective 2.3 (hooks & slash commands)",
      criteria: ["correct hook event", "side-effect-free where required", "explains exit-code/stdout contract", "no destructive default"],
      pass_threshold: 65,
      slots: { automation: ["run a linter before every commit", "inject context on each user prompt", "block edits to a frozen file"] },
      render: (s) =>
        `Implement an automation in Claude Code to ${s.automation}. Which hook event fires at the right moment, what ` +
        `is the stdout/exit-code contract the harness expects, and how do you keep the hook from blocking or corrupting ` +
        `the session? Note where the hook must be idempotent and what happens on non-zero exit. Describe the wiring, ` +
        `not a full script.`,
    },
    {
      difficulty: "advanced",
      expected_tier: "T3",
      expected_subagent: "model-architect",
      citation: "inspired by CCA-F objective 2.5 (workflow architecture)",
      criteria: ["coherent multi-hook workflow", "state-sharing across processes", "failure isolation", "no shared-config corruption"],
      pass_threshold: 70,
      slots: { workflow: ["a router that classifies every prompt and picks a model tier", "a self-improving feedback loop across sessions", "a cost-tracking statusline fed by a stop hook"] },
      render: (s) =>
        `Design a Claude Code workflow: ${s.workflow}. Hooks are separate processes, so how do you share state across ` +
        `invocations safely (tmpdir file? lock?), isolate failures so one broken hook does not brick the session, and ` +
        `avoid corrupting shared project config? Lay out the components, the data flow between them, and the failure ` +
        `model. State the riskiest assumption explicitly.`,
    },
  ],
  prompt_eng: [
    {
      difficulty: "foundational",
      expected_tier: "T1",
      citation: "inspired by CCA-F objective 3.1 (structured output basics)",
      criteria: ["valid schema shape", "constrains the model to JSON only", "handles a missing field"],
      pass_threshold: 55,
      slots: { extract: ["a person's name, email and role from a paragraph", "three action items from a meeting note", "severity and file from an error log"] },
      render: (s) =>
        `Write a prompt that makes an LLM extract ${s.extract} and return STRICT JSON only (no prose, no markdown). ` +
        `Specify the exact field names and types, instruct the model what to emit when a field is absent, and explain ` +
        `how you would validate the output so a malformed response is caught rather than trusted. Keep it tight.`,
    },
    {
      difficulty: "intermediate",
      expected_tier: "T2",
      citation: "inspired by CCA-F objective 3.3 (robust prompting)",
      criteria: ["clear role/instruction separation", "few-shot or rubric where useful", "guards against injection/ambiguity", "deterministic where needed"],
      pass_threshold: 65,
      slots: { goal: ["classify support tickets into 5 categories", "rewrite text into PT-PT preserving code", "grade an answer against a rubric"] },
      render: (s) =>
        `Engineer a production prompt to ${s.goal}. Separate the system role from the user instruction, decide whether ` +
        `few-shot examples or an explicit rubric raises reliability, and harden it against ambiguous or adversarial ` +
        `input. Where determinism matters, say how you achieve it (temperature, schema, examples). Return the prompt ` +
        `design plus the reasoning behind each choice.`,
    },
    {
      difficulty: "advanced",
      expected_tier: "T3",
      expected_subagent: "model-architect",
      citation: "inspired by CCA-F objective 3.5 (LLM-judge & eval prompting)",
      criteria: ["bias-aware judge design", "blind/positional controls", "calibrated rubric", "parse-failure fallback", "honest bias disclaimer"],
      pass_threshold: 70,
      slots: { judged: ["two code answers to the same task", "a summary against the source document", "an agent's tool-use trace"] },
      render: (s) =>
        `Design an LLM-as-judge prompt to evaluate ${s.judged}. Address judge bias: how do you blind the inputs, ` +
        `control for position/length effects, and calibrate the rubric so scores are comparable across runs? Specify ` +
        `the JSON the judge must emit and the fallback when it returns unparseable output. Acknowledge that an LLM ` +
        `grading output is not a ground-truth measurement and say how you would validate it.`,
    },
  ],
  mcp: [
    {
      difficulty: "foundational",
      expected_tier: "T1",
      citation: "inspired by CCA-F objective 4.1 (MCP tool basics)",
      criteria: ["correct tool name/inputSchema notion", "clear single responsibility", "no invented capability"],
      pass_threshold: 55,
      slots: { tool: ["fetch a weather forecast", "look up a customer by id", "list open pull requests"] },
      render: (s) =>
        `Define an MCP tool that lets an agent ${s.tool}. Give the tool name, a one-line description the model will ` +
        `read, and the input schema (fields + types). Explain why a tight single-responsibility tool is easier for the ` +
        `model to call correctly than a broad one, and avoid promising a capability the underlying service does not ` +
        `have. Keep it to the tool contract.`,
    },
    {
      difficulty: "intermediate",
      expected_tier: "T2",
      citation: "inspired by CCA-F objective 4.3 (MCP integration design)",
      criteria: ["good tool granularity", "error/empty-result handling", "auth/secret handling", "model-friendly descriptions"],
      pass_threshold: 65,
      slots: { server: ["a GitHub issues server", "a Supabase query server", "a filesystem search server"] },
      render: (s) =>
        `You are integrating ${s.server} over MCP. Decide the tool granularity (few broad tools vs many narrow ones), ` +
        `how each tool reports errors and empty results so the agent does not hallucinate success, and how secrets/auth ` +
        `are handled without leaking into the model's context. Note what makes a tool description model-friendly. ` +
        `Return the integration design and trade-offs.`,
    },
    {
      difficulty: "advanced",
      expected_tier: "T3",
      expected_subagent: "model-architect",
      citation: "inspired by CCA-F objective 4.5 (MCP architecture & safety)",
      criteria: ["safe tool surface", "least-privilege & confirmation gates", "composition across servers", "observability", "abuse/failure containment"],
      pass_threshold: 70,
      slots: { platform: ["a multi-server MCP setup mixing read and write tools", "an agent that can deploy and roll back", "tools that can spend money or send messages"] },
      render: (s) =>
        `Architect the safety and composition story for ${s.platform}. How do you enforce least privilege, gate ` +
        `irreversible/outward-facing actions behind confirmation, compose tools across multiple MCP servers without ` +
        `confused-deputy bugs, and observe what the agent actually called? Describe how a misbehaving or compromised ` +
        `tool is contained. State the biggest residual risk honestly.`,
    },
  ],
  context: [
    {
      difficulty: "foundational",
      expected_tier: "T0",
      citation: "inspired by CCA-F objective 5.1 (context basics)",
      criteria: ["reads minimum viable context", "uses search before full read", "avoids loading whole files"],
      pass_threshold: 55,
      slots: { find: ["where a function is defined", "which file sets a config value", "the one line that throws an error"] },
      render: (s) =>
        `An agent needs to ${s.find} in a large repo. Describe the minimum-viable way to get there: which cheap search ` +
        `(glob/grep) runs first, and how to read only the relevant window instead of whole files. Explain why reading ` +
        `the entire file into context wastes budget and how a 30-line window suffices. This is a discipline question, ` +
        `not an implementation.`,
    },
    {
      difficulty: "intermediate",
      expected_tier: "T2",
      citation: "inspired by CCA-F objective 5.3 (context management & reliability)",
      criteria: ["handles context-window pressure", "summarise vs drop strategy", "preserves task-critical state", "reliability under truncation"],
      pass_threshold: 65,
      slots: { session: ["a long debugging session", "a multi-file refactor", "a research task with many sources"] },
      render: (s) =>
        `During ${s.session} the context window fills up. Describe a reliable strategy: what to summarise versus drop, ` +
        `how to preserve the task-critical state (decisions made, files already changed) across a compaction, and how ` +
        `to keep the agent correct when earlier turns are truncated. Identify what silently breaks if this is done ` +
        `naively. Return the strategy and the reasoning.`,
    },
    {
      difficulty: "advanced",
      expected_tier: "T3",
      expected_subagent: "model-architect",
      citation: "inspired by CCA-F objective 5.5 (reliable long-running agents)",
      criteria: ["durable state across resets", "idempotent resume", "no duplicated side effects", "verification of recovered state", "honest failure handling"],
      pass_threshold: 70,
      slots: { agent: ["an overnight audit harness", "a long migration that can crash midway", "a multi-session planning workflow"] },
      render: (s) =>
        `Design context and reliability for ${s.agent} that may span many hours and survive context resets. How do you ` +
        `persist durable state so a resume is idempotent (no duplicated side effects), verify the recovered state is ` +
        `consistent before continuing, and handle a crash mid-run? Describe the checkpoint model and what you do when ` +
        `recovered state is ambiguous. Be explicit about the failure modes you cannot fully prevent.`,
    },
  ],
};

/**
 * For a domain with N questions and 3 difficulty templates, spread N across the
 * three difficulties as evenly as possible, remainder favouring earlier (easier)
 * tiers. e.g. 16 → [6,5,5]; 12 → [4,4,4]; 11 → [4,4,3]; 9 → [3,3,3].
 */
export function difficultySplit(n: number): [number, number, number] {
  const base = Math.floor(n / 3);
  const rem = n % 3;
  return [base + (rem > 0 ? 1 : 0), base + (rem > 1 ? 1 : 0), base];
}

function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}

/**
 * Generate `count` deterministic questions from `seed`. Same (seed, count) ⇒ the
 * exact same questions (reproducibility). `count` must equal TOTAL_QUESTIONS (60)
 * to honour the official domain allocation; other counts scale each domain's
 * share proportionally (rounded) and are intended for tests only.
 */
export function generateQuestions(seed: number, count: number = TOTAL_QUESTIONS): CCAFQuestion[] {
  const questions: CCAFQuestion[] = [];
  const domains = Object.keys(DOMAIN_ALLOCATION) as AuditDomain[];

  // Per-domain target counts. For the canonical 60 this is the exact allocation;
  // otherwise scale proportionally then fix rounding drift on the largest domain.
  const targets: Record<AuditDomain, number> = { ...DOMAIN_ALLOCATION };
  if (count !== TOTAL_QUESTIONS) {
    let assigned = 0;
    for (const d of domains) {
      targets[d] = Math.round((DOMAIN_ALLOCATION[d] / TOTAL_QUESTIONS) * count);
      assigned += targets[d];
    }
    targets.agentic += count - assigned; // absorb rounding drift on the largest
  }

  let idx = 0;
  for (const domain of domains) {
    const n = targets[domain];
    if (n <= 0) continue;
    const split = difficultySplit(n);
    const templates = TEMPLATES[domain];
    for (let di = 0; di < 3; di++) {
      const tpl = templates[di];
      for (let k = 0; k < split[di]; k++) {
        idx += 1;
        const id = `wave54-q${pad3(idx)}`;
        const qSeed = (hashStr(`${id}:${domain}:${tpl.difficulty}`) ^ (seed >>> 0)) >>> 0;
        const rng = mulberry32(qSeed);
        const filled: Record<string, string> = {};
        for (const [slot, pool] of Object.entries(tpl.slots)) filled[slot] = pick(rng, pool);
        questions.push({
          id,
          domain,
          difficulty: tpl.difficulty,
          prompt: tpl.render(filled),
          rubric: { criteria: tpl.criteria, pass_threshold: tpl.pass_threshold },
          expected_tier: tpl.expected_tier,
          ...(tpl.expected_subagent ? { expected_subagent: tpl.expected_subagent } : {}),
          citation: tpl.citation,
          seed: qSeed,
        });
      }
    }
  }
  return questions;
}

export interface QuestionValidation {
  ok: boolean;
  total: number;
  by_domain: Record<string, number>;
  prompt_len_min: number;
  prompt_len_max: number;
  errors: string[];
}

/** A.3 — structural validation of a generated set (used by tests + the CLI). */
export function validateQuestions(qs: CCAFQuestion[]): QuestionValidation {
  const errors: string[] = [];
  const byDomain: Record<string, number> = {};
  let minLen = Infinity;
  let maxLen = 0;
  const ids = new Set<string>();

  for (const q of qs) {
    byDomain[q.domain] = (byDomain[q.domain] ?? 0) + 1;
    const len = q.prompt.length;
    minLen = Math.min(minLen, len);
    maxLen = Math.max(maxLen, len);
    if (len < 300 || len > 800) errors.push(`${q.id}: prompt length ${len} outside 300-800`);
    if (q.rubric.criteria.length < 3 || q.rubric.criteria.length > 5) {
      errors.push(`${q.id}: rubric must have 3-5 criteria (has ${q.rubric.criteria.length})`);
    }
    if (q.rubric.pass_threshold < 0 || q.rubric.pass_threshold > 100) {
      errors.push(`${q.id}: pass_threshold ${q.rubric.pass_threshold} outside 0-100`);
    }
    if (!q.citation.toLowerCase().includes("cca-f")) errors.push(`${q.id}: missing CCA-F citation`);
    if (ids.has(q.id)) errors.push(`${q.id}: duplicate id`);
    ids.add(q.id);
  }

  if (qs.length === TOTAL_QUESTIONS) {
    for (const [d, want] of Object.entries(DOMAIN_ALLOCATION)) {
      if ((byDomain[d] ?? 0) !== want) errors.push(`domain ${d}: expected ${want}, got ${byDomain[d] ?? 0}`);
    }
  }

  return {
    ok: errors.length === 0,
    total: qs.length,
    by_domain: byDomain,
    prompt_len_min: minLen === Infinity ? 0 : minLen,
    prompt_len_max: maxLen,
    errors,
  };
}
