// `mooter hub` — the local activation hub (Wave 3 Day 2). A full-screen TUI that
// answers "how is my Mooter doing and what should I do next?" — entirely from
// local data, ZERO network. Five sections: PACKS · SAFETY · EVOLUTION ·
// TELEMETRY · SUGGESTIONS.
//
// Honesty: every number traces to a local file (installed.json, decisions.log,
// consent.json); when a source is missing we say "no data yet" rather than
// inventing. Suggestions are DETERMINISTIC rules (not LLM-generated) and only
// fire when their data exists. Reuses the dashboard's box helpers + trail's
// safety/evolution aggregators so there is one implementation of each.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { boxTop, boxRow, boxSep, boxBottom, type CmdResult } from "./dashboard.ts";
import { buildSafety, buildEvolution, buildSafetyByKeyword } from "./trail.ts";
import { listInstalledPacks, getActivePack, mooterHomeDefault } from "../packs.ts";
import { verifyConsent, getLocalSecret, type Consent } from "../consent.ts";

export interface HubOptions {
  refreshMs?: number;
  mooterHome?: string;
  /** Override decisions.log path (tests). */
  decisionsLog?: string;
  /** Pre-supplied event lines (tests); default reads decisions.log. */
  lines?: string[];
  /** Override "now" ms for evolution windowing (tests). */
  nowMs?: number;
  /** Injected signing secret (tests). */
  secret?: string;
  width?: number;
}

function routerDir(): string {
  const claudeDir = process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || join(homedir(), ".claude");
  return join(claudeDir, "tools", "router");
}

function readLines(opts: HubOptions): string[] {
  if (opts.lines) return opts.lines;
  try {
    return readFileSync(opts.decisionsLog ?? join(routerDir(), "decisions.log"), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

interface TelemetryStatus {
  enabled: boolean;
  signedOk: boolean;
  since: string | null;
}

function readTelemetry(opts: HubOptions): TelemetryStatus {
  try {
    const home = opts.mooterHome ?? mooterHomeDefault();
    const consent = JSON.parse(readFileSync(join(home, "consent.json"), "utf8")) as Consent;
    const secret = opts.secret ?? getLocalSecret(home);
    return { enabled: consent.telemetry_enabled === true, signedOk: verifyConsent(consent, secret), since: consent.consent_timestamp_utc ?? null };
  } catch {
    return { enabled: false, signedOk: false, since: null };
  }
}

/**
 * Deterministic suggestions (rules, never an LLM). Each only fires when its data
 * exists, so the hub never invents advice.
 */
export function hubSuggestions(args: {
  telemetry: TelemetryStatus;
  byKeyword: Record<string, unknown>;
  installedCount: number;
}): string[] {
  const out: string[] = [];
  if (!args.telemetry.enabled) {
    out.push("Telemetry is off — consider opt-in (anonymous, signed): mooter init");
  }
  const bk = (args.byKeyword as any).by_keyword as Record<string, { boosted: number; seen: number; rate_pct: number; over: boolean }>;
  for (const [kw, v] of Object.entries(bk || {})) {
    if (v.over) out.push(`"${kw}" safety-boosted ${v.boosted}/${v.seen} (${v.rate_pct}%) — review safety_seeds.json for false positives`);
  }
  if (args.installedCount === 0) {
    out.push("No packs installed — run `mooter init` or `mooter pack <id>` to add one");
  }
  if (out.length === 0) out.push("Nothing needs attention — Mooter is grazing happily 🐮");
  return out;
}

/** Build the hub frame as a string. Pure given its inputs. */
export function buildHub(opts: HubOptions = {}): string {
  const width = opts.width ?? 64;
  const lines = readLines(opts);
  const installed = listInstalledPacks(opts.mooterHome);
  const active = getActivePack(opts.mooterHome);
  const safety = buildSafety(lines, 100) as { window: number; applied: number; reasons: Record<string, number> };
  const evo = buildEvolution(lines, opts.nowMs ?? Date.now()) as any;
  const byKeyword = buildSafetyByKeyword(lines, 100);
  const telemetry = readTelemetry(opts);

  const out: string[] = [];
  out.push(boxTop("🐮 Mooter Hub · local", width));

  // PACKS
  out.push(boxRow(`  PACKS INSTALLED (${installed.length})`, width));
  if (installed.length === 0) out.push(boxRow("    (none — run mooter init)", width));
  else for (const p of installed) out.push(boxRow(`    ${p === active ? "🟢" : "⚪"} ${p}`, width));
  out.push(boxRow("    usage: no per-pack usage data yet", width));
  out.push(boxSep(width));

  // SAFETY (recent)
  const pct = safety.window > 0 ? Math.round((safety.applied / safety.window) * 100) : 0;
  out.push(boxRow("  SAFETY BOOSTS (recent · last 100)", width));
  out.push(boxRow(`    applied: ${safety.applied} of ${safety.window} (${pct}%)`, width));
  for (const [k, n] of Object.entries(safety.reasons).sort((a, b) => b[1] - a[1])) out.push(boxRow(`    ${k}: ${n}`, width));
  out.push(boxSep(width));

  // EVOLUTION
  out.push(boxRow("  EVOLUTION (last 7d vs prev 7d)", width));
  out.push(boxRow(`    prompts: ${evo.prev7.prompts} → ${evo.last7.prompts}`, width));
  out.push(boxRow(`    avg conf: ${evo.prev7.avgConf === null ? "—" : evo.prev7.avgConf.toFixed(2)} → ${evo.last7.avgConf === null ? "—" : evo.last7.avgConf.toFixed(2)}`, width));
  out.push(boxSep(width));

  // TELEMETRY
  const tline = !telemetry.enabled
    ? "opt-out (default · nothing collected)"
    : `opt-in since ${telemetry.since ?? "?"} · ${telemetry.signedOk ? "signed ✓" : "signature ✗ TAMPERED"}`;
  out.push(boxRow(`  TELEMETRY · ${tline}`, width));
  out.push(boxSep(width));

  // SUGGESTIONS
  out.push(boxRow("  SUGGESTIONS", width));
  for (const s of hubSuggestions({ telemetry, byKeyword, installedCount: installed.length })) {
    // wrap long suggestions across rows at the inner width
    let rest = "    · " + s;
    const inner = width - 2;
    while (rest.length > inner) {
      out.push(boxRow(rest.slice(0, inner), width));
      rest = "      " + rest.slice(inner);
    }
    out.push(boxRow(rest, width));
  }
  out.push(boxRow("", width));
  out.push(boxRow("  Press q to exit · r refresh", width));
  out.push(boxBottom(width));
  return out.join("\n");
}

/** Imperative shell: alternate screen + refresh loop + robust cleanup. */
export async function runHub(opts: HubOptions = {}): Promise<CmdResult> {
  const refreshMs = opts.refreshMs ?? 2000;
  return new Promise<CmdResult>((resolve) => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let done = false;
    const restore = () => {
      if (interval) clearInterval(interval);
      try {
        process.stdin.setRawMode?.(false);
        process.stdin.pause();
      } catch {
        /* ignore */
      }
      process.stdout.write("\x1b[?25h\x1b[?1049l");
    };
    const finish = () => {
      if (done) return;
      done = true;
      restore();
      process.off("SIGINT", finish);
      process.off("SIGTERM", finish);
      process.off("exit", restore);
      resolve({ exitCode: 0, output: "" });
    };
    const render = () => {
      process.stdout.write("\x1b[H");
      process.stdout.write(buildHub(opts) + "\n");
    };
    process.stdout.write("\x1b[?1049h\x1b[?25l");
    process.on("exit", restore);
    process.on("SIGINT", finish);
    process.on("SIGTERM", finish);
    try {
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.on("data", (d: Buffer) => {
        const key = d.toString();
        if (key === "q" || key === "\x03") finish();
        else if (key === "r") render();
      });
    } catch {
      /* non-TTY */
    }
    render();
    interval = setInterval(render, refreshMs);
  });
}
