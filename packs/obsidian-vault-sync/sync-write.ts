// Obsidian sync — WRITE direction (Wave 31). Pastor learnings → vault/Mooter/.
// Reads the local Pastor state (~/.mooter/pastor/adapters-active.json) + any distilled
// patterns and renders a dated, human-readable Markdown note inside the user's vault.
// Self-contained (node builtins only). Non-destructive: only writes under vault/Mooter/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function mooterHome(): string {
  return process.env.MOOTER_HOME && process.env.MOOTER_HOME.length > 0
    ? process.env.MOOTER_HOME
    : join(homedir(), ".mooter");
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export interface PastorLearnings {
  registered: number;
  active_type: string | null;
  usage: Record<string, { count: number; avg_confidence: number; last_used: string }>;
}

/** Collect Pastor learnings from local state. Pure read; empty when nothing recorded. */
export function collectLearnings(): PastorLearnings {
  const state = readJson<{ registered?: number; active_type?: string | null; usage?: PastorLearnings["usage"] }>(
    join(mooterHome(), "pastor", "adapters-active.json"),
    {},
  );
  return {
    registered: state.registered ?? 0,
    active_type: state.active_type ?? null,
    usage: state.usage ?? {},
  };
}

/** Render the learnings note (deterministic given inputs). `date` is caller-supplied. */
export function renderLearningsNote(learnings: PastorLearnings, date: string): string {
  const rows = Object.entries(learnings.usage)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, u]) => `| ${name} | ${u.count} | ${u.avg_confidence.toFixed(2)} | ${u.last_used.slice(0, 10)} |`);
  const table = rows.length
    ? ["| Adapter | Routes | Avg conf | Last used |", "|---|---|---|---|", ...rows].join("\n")
    : "_No per-task routing recorded yet._";
  return [
    `---`,
    `tags: [mooter, pastor, routing]`,
    `date: ${date}`,
    `---`,
    ``,
    `# Mooter Pastor — learnings ${date}`,
    ``,
    `> Synced by the \`obsidian-vault-sync\` pack. Features only — no prompt content leaves your machine.`,
    ``,
    `- Registered per-task adapters: **${learnings.registered}**`,
    `- Active adapter: **${learnings.active_type ?? "none"}**`,
    ``,
    `## Per-task routing`,
    ``,
    table,
    ``,
  ].join("\n");
}

export interface WriteResult {
  ok: boolean;
  path?: string;
  reason?: string;
}

/** Write the dated learnings note into `<vault>/Mooter/`. Creates the dir if needed. */
export function writeLearnings(vaultPath: string, date: string, learnings = collectLearnings()): WriteResult {
  if (!vaultPath || !existsSync(vaultPath)) {
    return { ok: false, reason: `vault path not found: ${vaultPath || "(none)"}` };
  }
  const dir = join(vaultPath, "Mooter");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `learnings-${date}.md`);
  writeFileSync(path, renderLearningsNote(learnings, date), "utf8");
  return { ok: true, path };
}
