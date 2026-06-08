// `mooter data` — Wave 32 (Phase NEW3): GDPR data rights.
//
//   mooter data export [--format json]   portable JSON dump (credentials redacted)
//   mooter data delete-all [--confirm]    wipe all local Mooter state
//   mooter data forget-me [--confirm]     ask the hub to erase your contributions
//
// Privacy-first: export is audited before printing and REFUSES to emit if a
// secret/PII leak is detected. delete-all and forget-me are destructive and
// require --confirm.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildExport, deleteAll, forgetMe } from "../../../data-rights/src/index.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

function telemetrySecret(): string[] {
  try {
    const s = readFileSync(join(homedir(), ".mooter", ".telemetry_secret"), "utf8").trim();
    return s ? [s] : [];
  } catch {
    return [];
  }
}

function routerDecisionsLog(): string {
  const claudeDir = process.env.MOOTER_CLAUDE_DIR || process.env.FRUGAL_CLAUDE_DIR || join(homedir(), ".claude");
  return join(claudeDir, "tools", "router", "decisions.log");
}

export async function runData(args: string[]): Promise<CmdResult> {
  const [sub] = args;

  if (!sub || sub === "help" || sub === "--help") {
    return {
      exitCode: sub ? 0 : 1,
      output:
        "mooter data — your GDPR data rights\n\n" +
        "  mooter data export [--format json]   portable JSON dump (credentials redacted)\n" +
        "  mooter data delete-all [--confirm]    wipe all local Mooter state\n" +
        "  mooter data forget-me [--confirm]     ask the hub to erase your contributions",
    };
  }

  if (sub === "export") {
    const r = buildExport({ knownSecrets: telemetrySecret() });
    if (!r.clean) {
      // Refuse to print a leaky export — the export is the bug.
      return {
        exitCode: 1,
        output:
          "✗ export blocked: the privacy audit found potential leaks and refused to emit.\n" +
          r.audit.map((v) => `  - ${v.kind}: ${v.sample}`).join("\n") +
          "\nThis is a bug — please report it. No data was written.",
      };
    }
    return { exitCode: 0, output: r.json };
  }

  if (sub === "delete-all") {
    const confirm = args.includes("--confirm");
    const r = deleteAll({ confirm, decisionsLog: routerDecisionsLog() });
    if (r.dryRun) {
      return {
        exitCode: 0,
        output:
          `⚠ delete-all is DESTRUCTIVE and irreversible. Re-run with --confirm to wipe:\n` +
          r.skipped.map((p) => `  - ${p}`).join("\n") +
          `\n(${r.skipped.length} item(s) would be removed)`,
      };
    }
    return { exitCode: 0, output: `✓ removed ${r.removed.length} item(s). Your local Mooter state is wiped.${r.skipped.length ? `\n  (${r.skipped.length} could not be removed)` : ""}` };
  }

  if (sub === "forget-me") {
    const confirm = args.includes("--confirm");
    const r = await forgetMe({ confirm });
    return { exitCode: r.ok ? 0 : 1, output: `${r.ok ? "✓" : "✗"} forget-me: ${r.message}${r.status ? ` (HTTP ${r.status})` : ""}` };
  }

  return { exitCode: 1, output: `mooter data: unknown subcommand '${sub}'\n\nmooter data [export|delete-all|forget-me]` };
}
