// Wave Mega 50-51 (2.C) — `mooter slash-commands` — install the /mooter Claude
// Code skill (a SKILL.md that maps /mooter sub-args onto real CLI calls).
//
//   install [--dry-run]  copy the template → ~/.claude/skills/mooter/SKILL.md
//                        (mkdir -p, idempotent; --dry-run prints without writing)
//   status               installed? does the installed copy differ from the template?
//
// HOME resolution honors opts.home, then $MOOTER_HOME, then $HOME (test
// isolation), then os.homedir(). The canonical template lives at
// packages/cli/skills-templates/mooter/SKILL.md; an embedded fallback keeps the
// command working from a bundled build where that file isn't shipped (a test
// asserts file and fallback stay in sync).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export const SLASH_USAGE = "usage: mooter slash-commands <install [--dry-run]|status>";

// Embedded fallback — MUST stay byte-identical to
// packages/cli/skills-templates/mooter/SKILL.md (enforced by slash-commands.test.ts).
export const SKILL_TEMPLATE = `---
name: mooter
description: Mooter router shortcuts — route a prompt, show savings, explain a chip/topic, list local models, check the sandbox tier ladder. Use when the user types /mooter <sub-command> (route · savings · explain · digest · local · why-not-fable · tier · mcp · vision · bench).
---

# /mooter <sub-command>

Map the sub-argument to the real Mooter CLI and run it. Show the command's
output verbatim — never paraphrase or invent the numbers.

## Sub-command → command

| Sub-command | Run |
|---|---|
| \`/mooter route <prompt>\` | \`node ~/.claude/tools/router/classify.js "<prompt>"\` (inside the Mooter repo use \`node tools/router/classify.js "<prompt>"\`). For a natural-language dispatch use \`mooter intent "<prompt>"\` instead. |
| \`/mooter savings\` | \`mooter digest\` |
| \`/mooter explain <topic>\` | \`mooter explain <topic>\` (e.g. \`tiers\`, \`saved\`, \`confidence\`, \`vision\`) |
| \`/mooter digest\` | \`mooter digest\` |
| \`/mooter local\` | \`mooter local-models\` |
| \`/mooter why-not-fable\` | \`mooter why-not-fable\` |
| \`/mooter tier\` | \`mooter status\` |
| \`/mooter mcp\` | \`mooter mcp status\` |
| \`/mooter vision\` | \`mooter explain vision\` |
| \`/mooter bench\` | \`cd packages/mooter-bench && npm run bench\` |

With no sub-command, run \`mooter status --didactic\`.

## Honest caveats

- \`/mooter bench\` ONLY works inside the Mooter repo checkout — the
  \`mooter-bench\` package is not installed globally. Outside the repo, say so
  instead of running it.
- The tier ladder is T0–T3 auto-routed plus T5 (Fable 5) strictly opt-in via
  an explicit \`@fable\` pin. There is no T4 — don't present one.
`;

/** Path of the canonical template inside a repo checkout, or null when absent. */
export function templatePath(): string | null {
  try {
    const here = dirname(fileURLToPath(import.meta.url)); // packages/cli/src/commands
    const p = join(here, "..", "..", "skills-templates", "mooter", "SKILL.md");
    if (existsSync(p)) return p;
  } catch {
    /* bundled build — fall through to embedded */
  }
  return null;
}

function readTemplate(): { content: string; source: string } {
  const p = templatePath();
  if (p) {
    try {
      return { content: readFileSync(p, "utf8"), source: p };
    } catch {
      /* fall through */
    }
  }
  return { content: SKILL_TEMPLATE, source: "embedded" };
}

export function installedSkillPath(home: string): string {
  return join(home, ".claude", "skills", "mooter", "SKILL.md");
}

export function runSlashCommands(
  args: string[],
  opts: { home?: string; env?: NodeJS.ProcessEnv } = {},
): CmdResult {
  const env = opts.env ?? process.env;
  const home = opts.home ?? env.MOOTER_HOME ?? env.HOME ?? homedir();
  const target = installedSkillPath(home);
  const sub = args[0] ?? "status";
  const { content: tpl, source } = readTemplate();

  if (sub === "install") {
    const dryRun = args.includes("--dry-run");
    let existing: string | null = null;
    try {
      existing = readFileSync(target, "utf8");
    } catch {
      existing = null;
    }
    if (existing === tpl) {
      return { exitCode: 0, output: `✅ /mooter skill already installed and up to date → ${target}` };
    }
    const verb = existing === null ? "install" : "update";
    if (dryRun) {
      return { exitCode: 0, output: `[dry-run] would ${verb} ${target}\n(template source: ${source})` };
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, tpl);
    return {
      exitCode: 0,
      output: [
        `${verb === "install" ? "✅ installed" : "♻️ updated"} /mooter skill → ${target}`,
        "Start a new Claude Code session (or /clear) to pick it up; then try `/mooter savings`.",
      ].join("\n"),
    };
  }

  if (sub === "status") {
    let installed: string | null = null;
    try {
      installed = readFileSync(target, "utf8");
    } catch {
      installed = null;
    }
    if (installed === null) {
      return {
        exitCode: 0,
        output: `/mooter skill: NOT installed (${target} missing)\nRun \`mooter slash-commands install\` to add it.`,
      };
    }
    const inSync = installed === tpl;
    return {
      exitCode: 0,
      output: inSync
        ? `/mooter skill: installed and in sync with the template → ${target}`
        : `/mooter skill: installed but DIFFERS from the template → ${target}\nRun \`mooter slash-commands install\` to update it.`,
    };
  }

  return { exitCode: 1, output: SLASH_USAGE };
}
