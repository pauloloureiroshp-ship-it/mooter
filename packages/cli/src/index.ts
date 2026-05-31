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
import { runHub } from "./commands/hub.ts";
import { runSync, runSyncReal } from "./commands/sync.ts";
import { runLogin, runLogout, authStatus } from "./commands/login.ts";
import { runAdapterList, runAdapterShow, runAdapterActivate, runAdapterDeactivate } from "./commands/adapter.ts";

const TOP_USAGE = `mooter — pack manager CLI

Usage:
  mooter init                      onboarding wizard (hardware, providers, packs, consent)
  mooter quiet [--off] [--moo-card|--moo-card-off] [--telemetry-off]   toggle badges / Moo card / telemetry
  mooter trail [--session-id <id>] [--json] [--evolution] [--safety [--by-keyword]]   provenance / 7d / safety
  mooter login [--manual|--status]   connect this terminal to your mooter.ai account (browser handshake)
  mooter logout                    remove the saved token (sync reverts to dry-run)
  mooter hub                       local activation hub (packs · safety · evolution · telemetry · suggestions)
  mooter adapter list|show <id>|activate <id>|deactivate   Adapter Forge (foundation · training ships W5 D2)
  mooter sync --dry-run            preview the remote-sync payload (zero network · Wave 4 ships real upload)
  mooter sync queue list|show <id>|clear   inspect/clear the local sync queue
  mooter sync audit list|verify    inspect/verify the signed sync audit log
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
      telemetryOff: rest.includes("--telemetry-off"),
      syncCadence: rest.find((a) => a.startsWith("--sync-cadence="))?.split("=")[1],
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
      safety: rest.includes("--safety"),
      byKeyword: rest.includes("--by-keyword"),
    });
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "hub") {
    const res = await runHub({});
    return res.exitCode;
  }

  if (command === "login") {
    if (rest.includes("--status")) {
      const res = authStatus();
      process.stdout.write(res.output + "\n");
      return res.exitCode;
    }
    const res = await runLogin({ manual: rest.includes("--manual") });
    if (res.output) process.stdout.write(res.output + "\n");
    return res.exitCode;
  }

  if (command === "logout") {
    const res = runLogout();
    process.stdout.write(res.output + "\n");
    return res.exitCode;
  }

  if (command === "adapter") {
    const [sub, arg] = rest;
    const res =
      sub === "show" ? runAdapterShow(arg ?? "") :
      sub === "activate" ? runAdapterActivate(arg ?? "") :
      sub === "deactivate" ? runAdapterDeactivate() :
      runAdapterList(); // default + "list"
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "sync") {
    const [sub, sub2] = rest;
    const isSub = sub === "queue" || sub === "audit";
    // Bare `mooter sync` (no subcommand, no --dry-run) → real mode (W4 D, async).
    if (!isSub && !rest.includes("--dry-run")) {
      const res = await runSyncReal({});
      if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
      return res.exitCode;
    }
    const res = runSync({
      dryRun: rest.includes("--dry-run"),
      queueList: sub === "queue" && (sub2 === "list" || sub2 === undefined),
      queueShow: sub === "queue" && sub2 === "show" ? rest[2] : undefined,
      queueClear: sub === "queue" && sub2 === "clear",
      auditList: sub === "audit" && (sub2 === "list" || sub2 === undefined),
      auditVerify: sub === "audit" && sub2 === "verify",
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
