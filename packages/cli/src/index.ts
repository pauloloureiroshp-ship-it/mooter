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
import { runDigest } from "./commands/digest.ts";
import { runDashboard } from "./commands/dashboard.ts";
import { runHub } from "./commands/hub.ts";
import { runSync, runSyncReal } from "./commands/sync.ts";
import { runLogin, runLogout, authStatus } from "./commands/login.ts";
import { runAdapterList, runAdapterShow, runAdapterActivate, runAdapterDeactivate } from "./commands/adapter.ts";
import { runForgeInstall, runForgeBenchmark } from "./commands/forge.ts";
import { runExplain } from "./commands/explain.ts";
import { runEnvDetect } from "./commands/env-detect.ts";
import { runFeedback, runFeedbackList } from "./commands/feedback.ts";

const TOP_USAGE = `mooter — pack manager CLI

Usage:
  mooter init                      onboarding wizard (hardware, providers, packs, consent)
  mooter quiet [--off] [--moo-card|--moo-card-off] [--telemetry-off] [--hide-<chip>|--show-all]   toggles
  mooter quiet [--verbose|--herd-standard|--herd-quiet|--herd-off]   herd 🐄 visibility level
  mooter explain [statusline]      educational guide to each statusline chip
  mooter env-detect [--json]       show this machine's OS, GPU, hw_tier and sync identity
  mooter trail [--session-id <id>] [--json] [--evolution] [--safety [--by-keyword]] [--calls]   provenance / 7d / safety / per-call
  mooter digest [--session-id <id>] [--json]   end-of-session tier-mix digest (where local did the heavy lifting)
  mooter login [--manual|--status]   connect this terminal to your mooter.ai account (browser handshake)
  mooter logout                    remove the saved token (sync reverts to dry-run)
  mooter hub                       local activation hub (packs · safety · evolution · telemetry · suggestions)
  mooter adapter list|show <id>|activate <id>|deactivate   manage installed adapters
  mooter forge install <path.gguf> --name <n> --base-model <m>   install + validate a user adapter
  mooter forge benchmark <id>      benchmark an adapter against the golden set (real metrics)
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
    const fromTokenArg = rest.find((a) => a.startsWith("--from-token="));
    const res = await runInit(fromTokenArg ? { fromToken: fromTokenArg.split("=")[1] } : {});
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "quiet") {
    const res = runQuiet({
      off: rest.includes("--off"),
      mooCard: rest.includes("--moo-card"),
      mooCardOff: rest.includes("--moo-card-off"),
      herdVisibility: rest.includes("--verbose")
        ? "verbose"
        : rest.includes("--herd-off")
          ? "silent"
          : rest.includes("--herd-quiet")
            ? "quiet"
            : rest.includes("--herd-standard")
              ? "standard"
              : undefined,
      telemetryOff: rest.includes("--telemetry-off"),
      syncCadence: rest.find((a) => a.startsWith("--sync-cadence="))?.split("=")[1],
      hideChips: rest.filter((a) => a.startsWith("--hide-")).map((a) => a.slice("--hide-".length)),
      showAll: rest.includes("--show-all"),
      badgeOff: rest.includes("--badge-off"),
      badgeAlways: rest.includes("--badge-always"),
      badgeThreshold: rest.some((a) => a.startsWith("--badge-threshold="))
        ? Number(rest.find((a) => a.startsWith("--badge-threshold="))!.split("=")[1])
        : undefined,
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
      calls: rest.includes("--calls"),
    });
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "digest") {
    const sidIdx = rest.indexOf("--session-id");
    const res = await runDigest({
      json: rest.includes("--json"),
      sessionId: sidIdx >= 0 ? rest[sidIdx + 1] : undefined,
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

  if (command === "explain") {
    const res = runExplain({ topic: rest[0] });
    process.stdout.write(res.output + "\n");
    return res.exitCode;
  }

  if (command === "env-detect") {
    const res = runEnvDetect({ json: rest.includes("--json") });
    process.stdout.write(res.output + "\n");
    return res.exitCode;
  }

  if (command === "forge") {
    const [sub] = rest;
    const flag = (name: string) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
    if (sub === "install") {
      const res = await runForgeInstall({
        ggufPath: rest[1] ?? "",
        name: flag("--name") ?? "adapter",
        baseModel: flag("--base-model") ?? "qwen2.5:3b",
        type: (flag("--type") as any) ?? "lora",
        domain: flag("--domain"),
      });
      if (res.output) process.stdout.write(res.output + "\n");
      return res.exitCode;
    }
    if (sub === "benchmark") {
      const res = await runForgeBenchmark({ id: rest[1] ?? "" });
      if (res.output) process.stdout.write(res.output + "\n");
      return res.exitCode;
    }
    process.stdout.write("usage: mooter forge install <path.gguf> --name <n> --base-model <m> [--type lora] [--domain d]\n       mooter forge benchmark <id>\n");
    return 1;
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

  if (command === "feedback") {
    // `mooter feedback "<message>" [--topic=bug] [--severity=low]` (anonymous, no login)
    // `mooter feedback --list` (admin read, needs MOOTER_ADMIN_TOKEN)
    if (rest.includes("--list")) {
      const res = await runFeedbackList({});
      if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
      return res.exitCode;
    }
    const message = rest.filter((a) => !a.startsWith("--")).join(" ");
    const topic = rest.find((a) => a.startsWith("--topic="))?.split("=")[1];
    const severity = rest.find((a) => a.startsWith("--severity="))?.split("=")[1];
    const res = await runFeedback({ message, topic, severity });
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  process.stderr.write(`mooter: unknown command '${command}'\n\n${TOP_USAGE}\n`);
  return 1;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
