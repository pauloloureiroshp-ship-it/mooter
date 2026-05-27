#!/usr/bin/env node
// mooter CLI entry (Wave 1 Day 5).
//
// Only the `pack` command group ships in Day 5 (PASTOR §10.5):
//   mooter pack {list,show,diff,validate}
// install/publish/search/rate/run/create are explicitly out of scope (Wave 2).
//
// Commands return a CmdResult ({ exitCode, output }) instead of touching the
// process directly, so the suite can assert on them without spawning. This thin
// shell is the only place that writes to stdout / sets the exit code.

import { runPack, PACK_USAGE } from "./commands/pack.ts";

const TOP_USAGE = `mooter — pack manager CLI

Usage:
  mooter pack <subcommand> [args] [--json]

${PACK_USAGE}`;

function main(argv: string[]): number {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(TOP_USAGE + "\n");
    return command ? 0 : 1;
  }

  if (command === "pack") {
    const res = runPack(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  process.stderr.write(`mooter: unknown command '${command}'\n\n${TOP_USAGE}\n`);
  return 1;
}

process.exit(main(process.argv.slice(2)));
