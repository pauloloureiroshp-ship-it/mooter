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
import { runWorkflow } from "./commands/workflow.ts";
import { runCompression } from "./commands/compression.ts";
import { runLora } from "./commands/lora.ts";
import { runSetup } from "./commands/setup.ts";
import { runEcosystem } from "./commands/ecosystem.ts";
import { runQuality } from "./commands/quality.ts";
import { runWave } from "./commands/wave.ts";
import { runDogfood } from "./commands/dogfood.ts";
import { runMcp } from "./commands/mcp.ts";
import { runBenchmarkCmd } from "./commands/benchmark.ts";
import { runPastor } from "./commands/pastor.ts";
import { runStatusline } from "./commands/statusline.ts";
import { runEffort } from "./commands/effort.ts";
import { runSessions } from "./commands/sessions.ts";
import { runTerminal } from "./commands/terminal.ts";
import { runConductor } from "../../worktree-conductor/src/commands.ts";
import { runSpawn } from "../../spawn-orchestrator/src/commands.ts";
import { runSecurity } from "./commands/security.ts";
import { runIntent, resolveIntent } from "./commands/intent.ts";
import { runDoctor } from "./commands/doctor.ts";
import { runUninstall } from "./commands/uninstall.ts";
import { runTurboquant } from "./commands/turboquant.ts";
import { runMinimax } from "./commands/minimax.ts";
import { runMonitor } from "./commands/monitor.ts";
import { runPricingUpdate } from "./commands/pricing.ts";
import { runStatus } from "./commands/status.ts";
import { runData } from "./commands/data.ts";
import { runQuant, runVector } from "./commands/quant-vector.ts";
import { runBackend } from "./commands/backend.ts";
import { isEnabled as inlineTrackerEnabled, startTimer, buildCommandPrefix } from "../../transparency/src/index.ts";

const TOP_USAGE = `mooter — Your LLM router. Local-first. Learns forever.

Usage:
  mooter init                      onboarding wizard (hardware, providers, packs, consent)
  mooter quiet [--off] [--moo-card|--moo-card-off] [--telemetry-off] [--hide-<chip>|--show-all]   toggles
  mooter quiet [--verbose|--herd-standard|--herd-quiet|--herd-off]   herd 🐄 visibility level
  mooter explain [statusline]      educational guide to each statusline chip
  mooter statusline mode <mini|compact|full|didactic|auto>   pin the statusline layout (or show)
  mooter effort [set <low|default|high|ultramoo>|show|reset]   session-wide effort mode (ultramoo = max frugality)
  mooter sessions <list|watch|show|diff|quota|worktrees|focus|kill|export>   cross-session intelligence
  mooter conductor <status|lock|unlock|queue|heartbeats|locks|history|reap>   serialize ops across terminals
  mooter spawn <task> [--cloud|--local] | spawn <list|watch|kill|logs|artifacts>   sandboxed local-first agents
  mooter security <audit [--json]|spawn-test>   4-layer sandbox audit + synthetic CVE escape test
  mooter intent "<what you want>" [--run] | intent --palette   natural-language → command
  mooter doctor [--json]           health check (classify sha · sandbox · Ollama · multiplexers)
  mooter uninstall [--keep-data|--full] [--confirm]   remove Mooter (safe by default)
  mooter status [--didactic]       one-shot snapshot (effort · Pastor · adapters)
  mooter data <export|delete-all|forget-me> [--confirm]   GDPR data rights (export/erase)
  mooter quant status [--json]     local model quantization (real Ollama data)
  mooter vector status [--json]    embedding model dims/quant (real Ollama data)
  mooter backend [status|install vllm [--eagle3]|uninstall vllm]   opt-in vLLM backend (default Ollama; --eagle3 = speculative decoding)
  mooter turboquant [status|build [--run]|enable|disable]   opt-in 3-bit KV cache (EXPERIMENTAL, build-from-source)
  mooter minimax-m3 [check|status|install [--run]]   watch + install MiniMax M3 weights when released
  mooter monitor [providers|status|enable|disable]   opt-in arbitrage monitor (public status pages; advisory only)
  mooter pricing-update [--show]   pull latest model pricing from the hub into a local cache
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
  mooter workflow <subcommand>     local-first dynamic workflows (Ollama workers · cross-session resume)
  mooter compression <subcommand>  L12 prompt compression (opt-in · test · status)
  mooter lora <subcommand>         L13 LoRA adapters (list · show · load · infra only)
  mooter pastor <subcommand>       Pastor v2 per-task adapter routing + distill (adapters · route · distill · state)
  mooter setup <subcommand>        L14 setup intelligence (detect · show · recommend)
  mooter ecosystem <subcommand>    L15 ecosystem catalog (list · recommend · search · info)
  mooter quality <subcommand>      L16.1 decision telemetry (stats · status · features-only)
  mooter wave <subcommand>         wave lifecycle (start · status · phase · ship · sha-gate)
  mooter dogfood <subcommand>      log friction while dogfooding (log · digest · list)
  mooter mcp <subcommand>          Mooter MCP server (serve · list · install)
  mooter benchmark run             run the Showcase Benchmark v2 (MLWR · local + cloud)

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

  if (command === "statusline") {
    const res = runStatusline(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "effort") {
    const res = runEffort(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "sessions") {
    const res = runSessions(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "terminal") {
    const res = runTerminal(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "conductor") {
    const res = runConductor(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "spawn") {
    const res = await runSpawn(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "security") {
    const res = runSecurity(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "doctor") {
    const res = runDoctor(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "uninstall") {
    const res = runUninstall(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "intent") {
    // --run resolves the phrase then re-dispatches to the resolved command, so the
    // user sees the resolution AND it executes in one go (transparency preserved).
    if (rest.includes("--run")) {
      const phrase = rest.filter((a) => !a.startsWith("--")).join(" ").trim();
      const resolved = resolveIntent(phrase);
      process.stdout.write(`→ mooter ${resolved.command.join(" ")}\n`);
      return main(resolved.command);
    }
    const res = runIntent(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "turboquant") {
    const res = runTurboquant(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "minimax-m3") {
    const res = await runMinimax(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "monitor") {
    const res = await runMonitor(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "pricing-update") {
    const res = await runPricingUpdate(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "status") {
    const res = runStatus(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "data") {
    const res = await runData(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "quant") {
    const res = await runQuant(rest.filter((a) => a !== "status"));
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "vector") {
    const res = await runVector(rest.filter((a) => a !== "status"));
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "backend") {
    const res = await runBackend(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
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

  if (command === "workflow") {
    const res = await runWorkflow(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "compression") {
    const res = runCompression(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "lora") {
    const res = runLora(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "pastor") {
    const res = runPastor(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "setup") {
    const res = await runSetup(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "ecosystem") {
    const res = await runEcosystem(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "quality") {
    const res = runQuality(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "wave") {
    const res = runWave(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "dogfood") {
    const res = runDogfood(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "mcp") {
    const res = await runMcp(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  if (command === "benchmark") {
    const res = await runBenchmarkCmd(rest);
    if (res.output) process.stdout.write(res.output + (res.output.endsWith("\n") ? "" : "\n"));
    return res.exitCode;
  }

  process.stderr.write(`mooter: unknown command '${command}'\n\n${TOP_USAGE}\n`);
  return 1;
}

// Wave 32 (Phase C) — inline token-tracker prefix. OPT-IN via MOOTER_INLINE_TRACKER=1.
// Emitted to STDERR so command stdout stays byte-stable (tests/pipes unaffected).
// A pure-local CLI op calls no model → honestly [T0 🏠 local Nms · 0 tok · $0].
const __inlineTimer = startTimer();
main(process.argv.slice(2)).then((code) => {
  if (inlineTrackerEnabled()) {
    process.stderr.write(buildCommandPrefix({ ms: __inlineTimer() }) + "\n");
  }
  process.exit(code);
});
