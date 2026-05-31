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
import { runInit } from "./commands/init.ts";
import { runQuiet } from "./commands/quiet.ts";
import { runTrail } from "./commands/trail.ts";
import { runDashboard } from "./commands/dashboard.ts";

const TOP_USAGE = `mooter — pack manager CLI

Usage:
  mooter init                      onboarding wizard (hardware, providers, packs, consent)
  mooter quiet [--off] [--moo-card|--moo-card-off]   toggle bash badges / Moo card
  mooter trail [--session-id <id>] [--json] [--evolution]   provenance / 7d-vs-prev-7d
  mooter dashboard [--refresh-ms <ms>] [--session-id <id>]   live TUI of the Mooter's state
  mooter pack <subcommand> [args] [--json]

${PACK_USAGE}`;

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(TOP_USAGE + "\n");
    return command ? 0 : 1;
  }

  if (command === "init") {
    const res = await runInit();
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "quiet") {
    const res = runQuiet({
      off: rest.includes("--off"),
      mooCard: rest.includes("--moo-card"),
      mooCardOff: rest.includes("--moo-card-off"),
    });
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "trail") {
    const sidIdx = rest.indexOf("--session-id");
    const res = await runTrail({
      json: rest.includes("--json"),
      sessionId: sidIdx >= 0 ? rest[sidIdx + 1] : undefined,
      evolution: rest.includes("--evolution"),
    });
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "dashboard") {
    const sidIdx = rest.indexOf("--session-id");
    const refIdx = rest.indexOf("--refresh-ms");
    const res = await runDashboard({
      sessionId: sidIdx >= 0 ? rest[sidIdx + 1] : undefined,
      refreshMs: refIdx >= 0 ? parseInt(rest[refIdx + 1], 10) : undefined,
    });
    return res.exitCode;
  }

  if (command === "pack") {
    const res = runPack(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  process.stderr.write(`mooter: unknown command '${command}'\n\n${TOP_USAGE}\n`);
  return 1;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
