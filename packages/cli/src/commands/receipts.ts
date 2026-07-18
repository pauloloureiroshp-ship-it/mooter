// `mooter receipts` — read-only projection over the existing Ledger sources.
//
// The measurement engine stays in tools/router/ledger-receipts.js beside the
// agent-sync, handoff-journal and savings-tracker sources it joins. This CLI is
// deliberately thin and lazy-loads that CommonJS module so the esbuild bundle
// does not duplicate or embed the live router.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface ReceiptsCore {
  command(args: string[]): string;
}

export interface ReceiptsDeps {
  core?: ReceiptsCore | null;
  candidates?: string[];
  home?: string;
  routerDir?: string;
}

export const RECEIPTS_USAGE = `usage: mooter receipts [--last N] [--json]
  --ledger <events.jsonl|dir>   agent-sync Ledger source
  --journal-dir <dir>          handoff-journal source
  --decisions <decisions.log>  savings-tracker route source
  --fleet-ledger <file>        Harmony Mesh checker source (n/d until available)
  --root <repo>                repo root for typed-message budgets and artifacts`;

function defaultCandidates(deps: ReceiptsDeps = {}): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerDir = deps.routerDir ?? process.env.MOOTER_ROUTER_DIR;
  const home = deps.home ?? homedir();
  return [
    routerDir ? join(routerDir, "ledger-receipts.js") : "",
    // Source run: packages/cli/src/commands -> repo root.
    join(here, "..", "..", "..", "..", "tools", "router", "ledger-receipts.js"),
    // Bundled run: packages/cli/mooter.js -> repo root.
    join(here, "..", "..", "tools", "router", "ledger-receipts.js"),
    // Installed runtime mirrored by /mooter-update.
    join(home, ".claude", "tools", "router", "ledger-receipts.js"),
  ].filter(Boolean);
}

export function loadReceiptsCore(deps: ReceiptsDeps = {}): ReceiptsCore | null {
  if (deps.core !== undefined) return deps.core;
  const req = createRequire(import.meta.url);
  for (const candidate of deps.candidates ?? defaultCandidates(deps)) {
    if (!existsSync(candidate)) continue;
    try {
      const loaded = req(candidate) as Partial<ReceiptsCore>;
      if (typeof loaded.command === "function") return loaded as ReceiptsCore;
    } catch {
      // Honest fallback: try the next repo/runtime candidate.
    }
  }
  return null;
}

export function runReceipts(args: string[], deps: ReceiptsDeps = {}): CmdResult {
  if (args.includes("--help") || args.includes("-h")) return { exitCode: 0, output: RECEIPTS_USAGE };
  const core = loadReceiptsCore(deps);
  if (!core) {
    return {
      exitCode: 1,
      output: "mooter receipts: measurement engine unavailable (tools/router/ledger-receipts.js not found)",
    };
  }
  try {
    return { exitCode: 0, output: core.command(args).replace(/\n+$/, "") };
  } catch (error) {
    return {
      exitCode: 1,
      output: `mooter receipts: ${(error as Error).message || String(error)}`,
    };
  }
}
