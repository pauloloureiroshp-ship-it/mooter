// `mooter statusline` — Wave 32 (Phase B): pick one of four explicit statusline
// modes, or preview the current one.
//
//   mooter statusline mode <mini|compact|full|didactic|auto>
//   mooter statusline show
//
// The mode persists to ~/.mooter/preferences.json (key `statusline_mode`), the
// same file statusline-multi.js / statusline-modes.js read at render time.
// `auto` removes the key, restoring the adaptive width-based default. Writing is
// a merge so unrelated prefs (statusline_line3, hidden_chips …) are preserved.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface CmdResult {
  exitCode: number;
  output: string;
}

const MODES = ["mini", "compact", "full", "didactic"] as const;
type Mode = (typeof MODES)[number];

const DESCRIPTIONS: Record<Mode, string> = {
  mini: "1 line — headline only (savings + tier badge)",
  compact: "2 lines — headline + operational chips (default richness)",
  full: "3 lines — compact + synthesis chips (compression · pastor · limits)",
  didactic: "5 lines — human-friendly, explains every number",
};

function prefsPath(): string {
  return join(homedir(), ".mooter", "preferences.json");
}

function readPrefs(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(prefsPath(), "utf8"));
  } catch {
    return {};
  }
}

function writePrefs(prefs: Record<string, unknown>): void {
  mkdirSync(join(homedir(), ".mooter"), { recursive: true });
  writeFileSync(prefsPath(), JSON.stringify(prefs, null, 2) + "\n");
}

/** Locate the real statusline script (runtime copy first, then repo copy). */
function findStatuslineScript(): string | null {
  const candidates = [
    join(homedir(), ".claude", "tools", "router", "statusline-multi.js"),
    join(homedir(), "frugal", "tools", "router", "statusline-multi.js"),
    join(process.cwd(), "tools", "router", "statusline-multi.js"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function usage(): string {
  const lines = MODES.map((m) => `    ${m.padEnd(9)} ${DESCRIPTIONS[m]}`).join("\n");
  return (
    "usage: mooter statusline mode <mini|compact|full|didactic|auto>\n" +
    "       mooter statusline show\n\n" +
    "  modes:\n" +
    lines +
    "\n    auto      adaptive — picks layout from terminal width (default)"
  );
}

export function runStatusline(args: string[]): CmdResult {
  const [sub, value] = args;

  if (sub === "mode") {
    if (!value) {
      const cur = (readPrefs().statusline_mode as string) || "auto";
      return { exitCode: 1, output: `current mode: ${cur}\n\n${usage()}` };
    }
    if (value === "auto") {
      const prefs = readPrefs();
      delete prefs.statusline_mode;
      writePrefs(prefs);
      return { exitCode: 0, output: "statusline mode → auto (adaptive width-based default restored)" };
    }
    if (!(MODES as readonly string[]).includes(value)) {
      return { exitCode: 1, output: `unknown mode '${value}'\n\n${usage()}` };
    }
    const prefs = readPrefs();
    prefs.statusline_mode = value;
    writePrefs(prefs);
    return {
      exitCode: 0,
      output: `statusline mode → ${value}\n  ${DESCRIPTIONS[value as Mode]}`,
    };
  }

  if (sub === "show") {
    const cur = (readPrefs().statusline_mode as string) || "auto";
    const script = findStatuslineScript();
    let preview = "";
    if (script) {
      // Render a real demo line in the configured mode (env override so we don't
      // depend on the prefs file the child would otherwise read).
      const env = { ...process.env };
      if (cur !== "auto") env.MOOTER_STATUSLINE_MODE = cur;
      const r = spawnSync("node", [script, "--demo", "green"], {
        env,
        encoding: "utf8",
        timeout: 4000,
      });
      if (r.status === 0 && r.stdout) preview = "\n\npreview (demo · green):\n" + r.stdout.trimEnd();
    }
    return {
      exitCode: 0,
      output:
        `statusline mode: ${cur}\n` +
        MODES.map((m) => `  ${m === cur ? "→" : " "} ${m.padEnd(9)} ${DESCRIPTIONS[m]}`).join("\n") +
        preview,
    };
  }

  return { exitCode: sub ? 1 : 1, output: usage() };
}
