// `mooter why-not-fable` (Wave Mega 50-51 Phase 2.B) — per-decision honesty:
// why the frontier tier (T5 · Fable 5) was NOT used. Reads the last N
// "classified" decisions from the router's decisions.log (read-only — the
// classify.js pipeline is frozen) and, for each, prints the tier chosen, the
// confidence, the list-price gap vs Fable, and the doctrine: frontier is an
// explicit @fable opt-in, never auto-routed.

import { readDecisionsTail, defaultDecisionsLogPath, PRICE_PER_MTOK, type RawDecision } from "../observability/convert.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface WhyNotFableDeps {
  decisionsLog?: string;
}

const DOCTRINE_LINE =
  "doctrine: frontier = explicit @fable opt-in only — never auto-routed. " +
  "Free on Claude Max until 2026-06-22, then usage credits.";

const FABLE_PRICE = PRICE_PER_MTOK.T5; // $10 / $50 per Mtok

function parseLast(args: string[]): number {
  const i = args.indexOf("--last");
  if (i !== -1 && args[i + 1]) {
    const n = Number.parseInt(args[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const eq = args.find((a) => a.startsWith("--last="));
  if (eq) {
    const n = Number.parseInt(eq.split("=")[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1; // default: the most recent decision only
}

function priceLabel(tier: string): string {
  const p = PRICE_PER_MTOK[tier];
  if (!p) return "unknown list price";
  if (p.input === 0 && p.output === 0) return "$0 (local)";
  return `$${p.input}/$${p.output} per Mtok`;
}

function renderDecision(d: RawDecision): string {
  const tier = typeof d.tier === "string" ? d.tier : "?";
  const model = typeof d.recommended_model === "string" ? d.recommended_model : "unknown model";
  const conf = typeof d.confidence === "number" && Number.isFinite(d.confidence) ? d.confidence.toFixed(2) : "n/a";
  const ts = typeof d.ts === "string" ? d.ts : "unknown time";

  const lines = [
    `· ${ts} — routed ${tier} (${model}) · confidence ${conf}`,
    `    cost: Fable 5 is $${FABLE_PRICE.input}/$${FABLE_PRICE.output} per Mtok vs ${tier} at ${priceLabel(tier)}`,
  ];
  if (tier === "T5") {
    lines.push(`    Fable WAS used here — that only happens via an explicit @fable pin.`);
  } else {
    lines.push(
      `    why not Fable: the classifier picked the cheapest tier that fits (${tier}); ` +
        `T5 is the only tier it never picks on its own.`,
    );
  }
  lines.push(`    ${DOCTRINE_LINE}`);
  return lines.join("\n");
}

export function runWhyNotFable(args: string[] = [], deps: WhyNotFableDeps = {}): CmdResult {
  const logPath = deps.decisionsLog ?? defaultDecisionsLogPath();
  const last = parseLast(args);

  const classified = readDecisionsTail(logPath, Number.MAX_SAFE_INTEGER).filter((d) => d.event === "classified");

  if (classified.length === 0) {
    return {
      exitCode: 0,
      output:
        `🐮 why-not-fable: no routing decisions logged yet (${logPath}).\n` +
        `Nothing to compare — route a few prompts first.\n${DOCTRINE_LINE}`,
    };
  }

  const slice = classified.slice(-last).reverse(); // most recent first
  const header = `🐮 why-not-fable — last ${slice.length} routing decision(s), most recent first`;
  return { exitCode: 0, output: [header, ...slice.map(renderDecision)].join("\n") };
}
