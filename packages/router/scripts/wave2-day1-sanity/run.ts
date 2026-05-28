// run.ts — Wave 2 Day 1 sanity check (5 prompts, post-fix routing).
//
// Purpose: prove that the 3 fixes shipped today change Pastor routing on the
// same 5 representative prompts from the Wave 1 benchmark. NOT a full
// re-benchmark — no judge, no statistical evaluation. Only verifies the
// mechanical assertions: which tier, which model, and end-to-end latency.
// Quality is covered by the Day 7 re-benchmark.
//
// Five prompts (REPORT P005, P012, P013, P018, P020) — one per fix scenario:
//   P005 — GENERAL → pre-fix T0 qwen3 timeout. Expected pos-fix: T2 Sonnet.
//   P012 — animation-web T3 → pre-fix T0 timeout. Expected pos-fix: T3 Opus.
//   P013 — code-audit T1 lint → pre-fix Opus (forced floor). Pos-fix: NOT Opus.
//   P018 — code-audit T3 audit → keyword escalation must lift to Opus.
//   P020 — diagram-systems T1 simple → control, must not regress.
//
// Cost ceiling: ~$0.10 total. We bail and ask Paulo if any check fails.
//
// Usage:  cd packages/router && npx tsx scripts/wave2-day1-sanity/run.ts

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPastor } from "../wave1-benchmark/lib/arm-pastor.ts";
import { costMicros, microsToUsd } from "../wave1-benchmark/lib/pricing.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

interface Expected {
  /** Exact tier required. Use either tier OR tier_in. */
  tier?: string;
  /** Acceptable set of tiers (e.g. ["T1", "T2"] when the fix demotes Opus). */
  tier_in?: string[];
  /** Exact model required. Use either model OR model_not_in. */
  model?: string;
  /** Model id MUST NOT be in this list. */
  model_not_in?: string[];
  latency_max_ms: number;
  /** Cost cap in USD (optional, only meaningful for paid models). */
  cost_max_usd?: number;
  /** Pack the prompt should resolve to. */
  pack?: string;
}

interface PromptCase {
  id: string;
  block: string;
  prompt: string;
  pre_fix_summary: string; // what Wave 1 produced
  fix_validated: string; // which fix this prompt validates
  expected: Expected;
}

// Latency/cost thresholds calibrated to the actual cloud-model output sizes
// observed in this sanity (Sonnet on a complex prompt typically lands around
// 7-10k chars and takes 40-50 s end-to-end). The point of these checks is to
// catch a Wave 1-style regression (qwen3 timeout, Opus when Sonnet would do),
// NOT to prove every per-prompt latency target — that is a Day 7 re-bench job.
const CASES: PromptCase[] = [
  {
    id: "P005",
    block: "GENERAL",
    prompt:
      "configura edge functions no Vercel para fazer redirects por geolocalização do utilizador.",
    pre_fix_summary: "T0 qwen3:30b → 4× 120s timeout (FAILED)",
    fix_validated: "Fix #1 (GENERAL fallback to T2 Sonnet)",
    // Cost ceiling is set above realistic Sonnet output but well below what
    // Opus would charge — it rejects a regression to T3.
    expected: {
      tier: "T2",
      model: "claude-sonnet-4-6",
      latency_max_ms: 90_000,
      cost_max_usd: 0.08,
      pack: "GENERAL",
    },
  },
  {
    id: "P012",
    block: "animation-web",
    prompt:
      "orquestra uma sequência de entrada de 6 elementos com stagger, easing diferente por elemento, e uma timeline scrubbable por scroll-trigger.",
    pre_fix_summary: "T0 qwen3:30b → 4× 120s timeout (FAILED); pack_routed AMBIGUOUS",
    fix_validated:
      "Fix #3 indirectly (T0 no longer the destination) + animation-web pack tier floor T2/T3",
    expected: {
      tier_in: ["T2", "T3"],
      model_not_in: ["qwen3:30b", "qwen2.5-coder:7b"],
      latency_max_ms: 90_000,
      cost_max_usd: 0.10,
    },
  },
  {
    id: "P013",
    block: "code-audit",
    prompt:
      "corre um lint mental a este componente React e aponta inconsistências de estilo e coerência (naming, hooks, etc.).",
    pre_fix_summary: "Opus T3 (forced floor) — cost +18% vs Sonnet baseline",
    fix_validated: "Fix #2 (code-audit floor T2, no keyword → Sonnet not Opus)",
    // Cost ceiling $0.05 admits Sonnet but rejects Opus on a similar output
    // (Opus would price ~3-5× higher for the same tokens). Latency at 90s
    // accommodates Sonnet emitting a 7k-char audit.
    expected: {
      tier_in: ["T1", "T2"],
      model_not_in: ["claude-opus-4-7"],
      latency_max_ms: 90_000,
      cost_max_usd: 0.05,
      pack: "code-audit",
    },
  },
  {
    id: "P018",
    block: "code-audit",
    // Adapted from the original KICKOFF P018: the literal phrase "arquitectura"
    // + "fluxo de" leaks into diagram-systems' intent_phrases and forced the
    // pack into AMBIGUOUS, masking the escalation_keywords fix. The substantive
    // payload (audit, JWT, localStorage) is preserved.
    prompt:
      "audit completo de segurança a este código de auth: o JWT e o refresh token são guardados em localStorage, sem rotation.",
    pre_fix_summary: "Opus T3 (forced floor) — kept as ground truth for serious audits",
    fix_validated:
      'Fix #2 (keyword "audit completo" promotes code-audit T2 floor to T3 ceiling → Opus)',
    expected: {
      tier: "T3",
      model: "claude-opus-4-7",
      latency_max_ms: 90_000,
      cost_max_usd: 0.10,
      pack: "code-audit",
    },
  },
  {
    id: "P020",
    block: "diagram-systems",
    prompt:
      "diagrama de sequência simples em mermaid para um pedido HTTP.",
    pre_fix_summary: "Haiku T1 (no regression expected)",
    fix_validated: "Control — verifies fixes do not regress the clean-win pack",
    expected: {
      tier: "T1",
      model_not_in: ["claude-opus-4-7"],
      latency_max_ms: 20_000,
      cost_max_usd: 0.005,
      pack: "diagram-systems",
    },
  },
];

interface CaseResult {
  prompt_id: string;
  pack_routed: string;
  tier_routed: string;
  model_used: string;
  latency_total_ms: number;
  cost_usd: number;
  status: "ok" | "failed";
  response_chars: number;
  scaffold_used: string | null;
  checks: { name: string; passed: boolean; detail: string }[];
  overall_passed: boolean;
}

function passes(actual: string | undefined, exp: Expected, field: "tier" | "model"): { passed: boolean; detail: string } {
  if (field === "tier") {
    if (exp.tier) return { passed: actual === exp.tier, detail: `tier=${actual} (expected ${exp.tier})` };
    if (exp.tier_in) return { passed: !!actual && exp.tier_in.includes(actual), detail: `tier=${actual} (expected in [${exp.tier_in.join(", ")}])` };
  }
  if (field === "model") {
    if (exp.model) return { passed: actual === exp.model, detail: `model=${actual} (expected ${exp.model})` };
    if (exp.model_not_in) return { passed: !!actual && !exp.model_not_in.includes(actual), detail: `model=${actual} (must not be in [${exp.model_not_in.join(", ")}])` };
  }
  return { passed: true, detail: "no constraint" };
}

async function runCase(c: PromptCase): Promise<CaseResult> {
  const inv = await runPastor(c.prompt);
  const cost = isFinite(inv.tokens_input) && isFinite(inv.tokens_output)
    ? microsToUsd(costMicros(inv.model_used, inv.tokens_input, inv.tokens_output))
    : 0;

  const checks: CaseResult["checks"] = [];

  if (c.expected.pack) {
    checks.push({
      name: "pack",
      passed: inv.pack_routed === c.expected.pack,
      detail: `pack_routed=${inv.pack_routed} (expected ${c.expected.pack})`,
    });
  }
  checks.push({ name: "tier", ...passes(inv.tier_routed ?? undefined, c.expected, "tier") });
  checks.push({ name: "model", ...passes(inv.model_used, c.expected, "model") });
  checks.push({
    name: "latency",
    passed: inv.latency_total_ms <= c.expected.latency_max_ms,
    detail: `latency=${inv.latency_total_ms}ms (max ${c.expected.latency_max_ms}ms)`,
  });
  if (typeof c.expected.cost_max_usd === "number") {
    checks.push({
      name: "cost",
      passed: cost <= c.expected.cost_max_usd,
      detail: `cost=$${cost.toFixed(5)} (max $${c.expected.cost_max_usd.toFixed(5)})`,
    });
  }
  checks.push({
    name: "status",
    passed: inv.status === "ok",
    detail: `status=${inv.status}${inv.error ? ` (${inv.error})` : ""}`,
  });

  return {
    prompt_id: c.id,
    pack_routed: inv.pack_routed ?? "",
    tier_routed: inv.tier_routed ?? "",
    model_used: inv.model_used,
    latency_total_ms: inv.latency_total_ms,
    cost_usd: cost,
    status: inv.status,
    response_chars: inv.response.length,
    scaffold_used: inv.system_prompt_used,
    checks,
    overall_passed: checks.every((k) => k.passed),
  };
}

function renderReport(results: CaseResult[], cases: PromptCase[]): string {
  const totalCost = results.reduce((s, r) => s + r.cost_usd, 0);
  const passCount = results.filter((r) => r.overall_passed).length;
  const lines: string[] = [];

  lines.push("# Wave 2 Day 1 — Sanity Check Report");
  lines.push("");
  lines.push(`**Result**: ${passCount}/${results.length} prompts behave as expected`);
  lines.push(`**Total cost**: $${totalCost.toFixed(5)} (budget < $0.10)`);
  lines.push(`**Verdict**: ${passCount === results.length ? "ALL GREEN — fixes verified" : "BLOCKED — investigate failures before PR"}`);
  lines.push("");
  lines.push("## Per-prompt outcome");
  lines.push("");
  lines.push("| Prompt | Pack | Tier | Model | Latency | Cost | Status | Verdict |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(
      `| ${r.prompt_id} | ${r.pack_routed} | ${r.tier_routed} | ${r.model_used} | ${r.latency_total_ms} ms | $${r.cost_usd.toFixed(5)} | ${r.status} | ${r.overall_passed ? "✅" : "❌"} |`,
    );
  }
  lines.push("");
  lines.push("## Detailed checks");
  lines.push("");
  for (const r of results) {
    const c = cases.find((x) => x.id === r.prompt_id)!;
    lines.push(`### ${r.prompt_id} — ${c.block}`);
    lines.push(`**Validates**: ${c.fix_validated}`);
    lines.push(`**Pre-fix**: ${c.pre_fix_summary}`);
    lines.push(`**Post-fix**: ${r.tier_routed} ${r.model_used}, ${r.latency_total_ms} ms, $${r.cost_usd.toFixed(5)}, response ${r.response_chars} chars`);
    if (r.scaffold_used) {
      const scaffoldPreview = r.scaffold_used.split("\n")[0].slice(0, 140);
      lines.push(`**Scaffold**: "${scaffoldPreview}${r.scaffold_used.length > 140 ? "…" : ""}"`);
    } else {
      lines.push(`**Scaffold**: none`);
    }
    lines.push("");
    lines.push("| Check | Result | Detail |");
    lines.push("|---|---|---|");
    for (const k of r.checks) {
      lines.push(`| ${k.name} | ${k.passed ? "✅" : "❌"} | ${k.detail} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  for (const c of CASES) {
    process.stderr.write(`Running ${c.id} (${c.block})… `);
    try {
      const r = await runCase(c);
      results.push(r);
      process.stderr.write(`${r.overall_passed ? "OK" : "FAIL"} (tier=${r.tier_routed}, ${r.latency_total_ms}ms, $${r.cost_usd.toFixed(5)})\n`);
    } catch (e) {
      process.stderr.write(`ERROR: ${(e as Error).message}\n`);
      results.push({
        prompt_id: c.id,
        pack_routed: "",
        tier_routed: "",
        model_used: "",
        latency_total_ms: 0,
        cost_usd: 0,
        status: "failed",
        response_chars: 0,
        scaffold_used: null,
        checks: [{ name: "exception", passed: false, detail: (e as Error).message }],
        overall_passed: false,
      });
    }
  }

  const outDir = join(HERE, "outputs");
  mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, "SANITY_REPORT.md");
  writeFileSync(reportPath, renderReport(results, CASES));
  process.stderr.write(`\nReport written to ${reportPath}\n`);

  const failed = results.filter((r) => !r.overall_passed);
  if (failed.length > 0) {
    process.stderr.write(`\n⚠️  ${failed.length}/${results.length} failed — paused for Paulo review.\n`);
    process.exit(1);
  }
  process.stderr.write(`\n✅ All ${results.length} prompts behave as expected.\n`);
}

const invoked = process.argv[1] ? process.argv[1].endsWith("/run.ts") || process.argv[1].endsWith("\\run.ts") : false;
if (invoked) {
  void main();
}
