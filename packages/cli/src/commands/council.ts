// `mooter council` — thin delegator to the additive @mooter/council engine.
//
// The real logic lives in packages/council/src/cli.ts (runCouncilCli). As with the
// workflow command, the engine specifier is assembled at runtime so esbuild does NOT
// bundle the council engine (it pulls cross-package deps the zero-runtime-deps CLI
// bundle must not contain). Resolves under a tsx source checkout; in the shipped
// bundle the import throws and we report it cleanly.

import type { CmdResult } from "./trail.ts";

const COUNCIL_SPECIFIER = ["..", "..", "..", "council", "src", "cli.ts"].join("/");

export async function runCouncil(args: string[]): Promise<CmdResult> {
  try {
    const mod = (await import(COUNCIL_SPECIFIER)) as {
      runCouncilCli: (a: string[]) => Promise<CmdResult>;
    };
    return await mod.runCouncilCli(args);
  } catch (e) {
    return {
      exitCode: 1,
      output: `council engine unavailable in this build: ${(e as Error).message}`,
    };
  }
}
