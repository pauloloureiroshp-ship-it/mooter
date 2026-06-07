// `mooter quality` — L16.1 prompt-quality decision telemetry (Wave 29, Vector C).
//
//   mooter quality stats [--json]    aggregate of locally-logged routing decisions
//   mooter quality status            where it's stored + the privacy guarantee
//
// Privacy: telemetry stores structured FEATURES only, never prompt content.
// Pure delegator to @mooter/synthesis.

import type { CmdResult } from "./trail.ts";
import { readDecisions, aggregateStats, mooterPath } from "../../../synthesis/src/index.ts";

export const QUALITY_USAGE = `mooter quality — L16.1 decision telemetry (opt-in, features-only)

  mooter quality stats [--json]    aggregate of locally-logged routing decisions
  mooter quality status            storage location + privacy guarantee`;

export function runQuality(args: string[]): CmdResult {
  const [sub] = args;
  const json = args.includes("--json");

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: QUALITY_USAGE };
  }

  if (sub === "status") {
    const path = mooterPath("quality", "decisions.jsonl");
    const lines = [
      "🐮 Quality telemetry (L16.1)",
      "─────────────────────────────",
      `store:    ${path}`,
      "privacy:  structured FEATURES only — NEVER prompt/response content",
      "scope:    local; hub upload (DP + k-anonymity≥50) lands in Wave 31",
      "bandit:   off (Wave 30)",
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "stats") {
    const stats = aggregateStats(readDecisions());
    if (json) return { exitCode: 0, output: JSON.stringify(stats, null, 2) };
    const lines = [
      "🐮 Decision telemetry stats (L16.1)",
      "─────────────────────────────",
      `decisions logged:  ${stats.total}`,
      `by tier:           ${Object.entries(stats.by_tier).map(([k, v]) => `${k}:${v}`).join(" ") || "—"}`,
      `by outcome:        ${Object.entries(stats.by_outcome).map(([k, v]) => `${k}:${v}`).join(" ") || "—"}`,
      `tokens in/out:     ${stats.total_tokens_in} / ${stats.total_tokens_out}`,
      `cost (usd):        ${stats.total_cost_usd.toFixed(4)}`,
      `avg confidence:    ${stats.avg_classify_confidence ?? "—"}`,
      `doctrine viol.:    ${stats.doctrine_violations}`,
    ];
    if (stats.total === 0) lines.push("", "(no decisions logged yet — telemetry is opt-in and written by the routing hooks)");
    return { exitCode: 0, output: lines.join("\n") };
  }

  return { exitCode: 1, output: `mooter quality: unknown subcommand '${sub}'\n\n${QUALITY_USAGE}` };
}
