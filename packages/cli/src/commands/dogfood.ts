// `mooter dogfood log` — capture friction while dogfooding Mooter (Wave 30 Phase E).
//
//   mooter dogfood log "<friction>" [--severity low|med|high] [--json]
//   mooter dogfood digest [--days N] [--json]      window stats (default 7d)
//   mooter dogfood list [--limit N] [--json]       recent entries
//
// Append-only JSONL at ~/.mooter/dogfood.jsonl. Local-first: entries never leave
// the machine unless the user opts in to Pastor friction signals separately.
// Each entry is auto-tagged with the active wave/phase (from central-state) so a
// digest can show where friction clustered.

import { readFileSync, existsSync } from "node:fs";
import { mooterPath, appendJsonl } from "../../../synthesis/src/config.ts";
import { summarize } from "../../../synthesis/src/state/central-state.ts";
import type { CmdResult } from "./trail.ts";

export type Severity = "low" | "med" | "high";

export interface DogfoodEntry {
  ts: string;
  text: string;
  tags: string[];
  severity: Severity;
  phase: string | null;
  wave: number | null;
}

export function dogfoodPath(): string {
  return mooterPath("dogfood.jsonl");
}

export function parseTags(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/#([a-z0-9][a-z0-9_-]*)/gi)) out.add(m[1].toLowerCase());
  return [...out];
}

export function coerceSeverity(s: string | undefined): Severity {
  const v = (s ?? "").toLowerCase();
  if (v === "high" || v === "med" || v === "low") return v;
  if (v === "medium") return "med";
  return "low";
}

export function buildEntry(
  text: string,
  opts: { severity?: string } = {},
  now: Date = new Date(),
): DogfoodEntry {
  const sum = summarize();
  return {
    ts: now.toISOString(),
    text: text.trim(),
    tags: parseTags(text),
    severity: coerceSeverity(opts.severity),
    phase: sum.active ? sum.phase : null,
    wave: sum.active ? sum.number : null,
  };
}

export function loadEntries(): DogfoodEntry[] {
  const p = dogfoodPath();
  if (!existsSync(p)) return [];
  const out: DogfoodEntry[] = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as DogfoodEntry);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

function sameUTCDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Count of entries logged "today" (UTC) — used by the Phase N statusline chip. */
export function countToday(now: Date = new Date(), entries: DogfoodEntry[] = loadEntries()): number {
  return entries.filter((e) => {
    const d = new Date(e.ts);
    return !Number.isNaN(d.getTime()) && sameUTCDay(d, now);
  }).length;
}

export interface DogfoodDigest {
  total: number;
  today: number;
  windowDays: number;
  inWindow: number;
  bySeverity: Record<Severity, number>;
  byTag: Array<{ tag: string; count: number }>;
  recent: DogfoodEntry[];
}

export function digest(
  entries: DogfoodEntry[],
  now: Date = new Date(),
  windowDays = 7,
): DogfoodDigest {
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const bySeverity: Record<Severity, number> = { low: 0, med: 0, high: 0 };
  const tagCounts = new Map<string, number>();
  let inWindow = 0;
  for (const e of entries) {
    const d = new Date(e.ts).getTime();
    if (!Number.isNaN(d) && d >= cutoff) {
      inWindow++;
      bySeverity[coerceSeverity(e.severity)]++;
      for (const t of e.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const byTag = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return {
    total: entries.length,
    today: countToday(now, entries),
    windowDays,
    inWindow,
    bySeverity,
    byTag,
    recent: entries.slice(-5).reverse(),
  };
}

function numFlag(args: string[], name: string, dflt: number): number {
  const i = args.indexOf(name);
  const eq = args.find((a) => a.startsWith(`${name}=`));
  const raw = eq ? eq.split("=")[1] : i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

export function runDogfood(args: string[]): CmdResult {
  const sub = args[0];
  const rest = args.slice(1);
  const json = rest.includes("--json");

  if (!sub || sub === "--help" || sub === "-h") {
    return {
      exitCode: 0,
      output: `mooter dogfood — log friction while dogfooding Mooter

  mooter dogfood log "<friction>" [--severity low|med|high] [--json]
  mooter dogfood digest [--days N] [--json]
  mooter dogfood list [--limit N] [--json]`,
    };
  }

  if (sub === "log") {
    // severity via --severity <v> or --severity=<v>; everything else non-flag is text
    let severity: string | undefined;
    const drop = new Set<number>();
    const sevIdx = rest.indexOf("--severity");
    if (sevIdx >= 0) {
      severity = rest[sevIdx + 1];
      drop.add(sevIdx);
      drop.add(sevIdx + 1);
    }
    const eqSev = rest.find((a) => a.startsWith("--severity="));
    if (eqSev) severity = eqSev.split("=")[1];
    const text = rest
      .filter((a, i) => !drop.has(i) && !a.startsWith("--"))
      .join(" ")
      .trim();
    if (!text) return { exitCode: 1, output: 'usage: mooter dogfood log "<friction description>"' };
    const badSeverity =
      severity !== undefined &&
      !["low", "med", "medium", "high"].includes(severity.toLowerCase());
    const entry = buildEntry(text, { severity });
    appendJsonl(dogfoodPath(), entry);
    const today = countToday();
    if (json) return { exitCode: 0, output: JSON.stringify(entry, null, 2) };
    const where = entry.wave ? ` · wave ${entry.wave} phase ${entry.phase}` : "";
    const warn = badSeverity
      ? `\n⚠ unknown severity '${severity}' → logged as low (use low|med|high)`
      : "";
    return { exitCode: 0, output: `🍖 logged [${entry.severity}]${where} · ${today} today${warn}` };
  }

  if (sub === "digest") {
    const days = numFlag(rest, "--days", 7);
    const d = digest(loadEntries(), new Date(), days);
    if (json) return { exitCode: 0, output: JSON.stringify(d, null, 2) };
    const tags = d.byTag.slice(0, 6).map((t) => `#${t.tag}(${t.count})`).join(" ") || "—";
    const lines = [
      `🍖 dogfood digest · last ${d.windowDays}d`,
      `   ${d.inWindow} in window · ${d.today} today · ${d.total} all-time`,
      `   severity: high ${d.bySeverity.high} · med ${d.bySeverity.med} · low ${d.bySeverity.low}`,
      `   top tags: ${tags}`,
    ];
    if (d.recent.length) {
      lines.push(`   recent:`);
      for (const e of d.recent.slice(0, 5)) {
        lines.push(`     · [${e.severity}] ${e.text.slice(0, 70)}`);
      }
    }
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "list") {
    const limit = numFlag(rest, "--limit", 20);
    const entries = loadEntries().slice(-limit).reverse();
    if (json) return { exitCode: 0, output: JSON.stringify(entries, null, 2) };
    if (!entries.length) return { exitCode: 0, output: "🍖 no friction logged yet" };
    return {
      exitCode: 0,
      output: entries.map((e) => `[${e.ts.slice(0, 10)}] [${e.severity}] ${e.text}`).join("\n"),
    };
  }

  return {
    exitCode: 1,
    output: `mooter dogfood: unknown subcommand '${sub}' (try: log | digest | list | --help)`,
  };
}
