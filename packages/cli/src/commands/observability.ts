// `mooter observability` — Wave Mega 50-51 Phase 1.A: opt-in OTLP export of
// routing decisions to any OpenTelemetry collector.
//
//   mooter observability status                  enabled? endpoint? decisions available?
//   mooter observability enable|disable
//   mooter observability export [--last N] [--dry-run]
//   mooter observability export-config           collector receiver snippet + OpenLLMetry note
//
// Honest by design: batch/on-demand export from decisions.log (NOT live
// tracing), no prompt contents ever leave the machine, cost attributes are
// only emitted when the log carries real token counts.

import { homedir } from "node:os";

import { readConfig, writeConfig, type ObservabilityConfig } from "../observability/config.ts";
import {
  readDecisionsTail,
  decisionToSpan,
  buildOtlpPayload,
  defaultDecisionsLogPath,
} from "../observability/convert.ts";
import { postOtlp, type PostFn } from "../observability/export.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface ObservabilityDeps {
  home?: string;
  decisionsLog?: string;
  post?: PostFn;
}

const USAGE = `mooter observability — OTLP export of routing decisions (opt-in)

  mooter observability status                  config + decisions available for export
  mooter observability enable                  turn export on (nothing is sent until you run export)
  mooter observability disable                 turn export off
  mooter observability export [--last N] [--dry-run]   convert + POST spans (--dry-run: no network)
  mooter observability export-config           OpenTelemetry Collector receiver snippet`;

function renderStatus(cfg: ObservabilityConfig, available: number, logPath: string): string {
  return [
    `🐮 observability: ${cfg.enabled ? "enabled" : "disabled"}`,
    `  endpoint ........ ${cfg.otlp_endpoint}`,
    `  service.name .... ${cfg.service_name}`,
    `  decisions ....... ${available} routing decision(s) available for export`,
    `  source .......... ${logPath}`,
    cfg.enabled
      ? `  ↳ run \`mooter observability export\` to POST the last 100 as OTLP spans.`
      : `  ↳ run \`mooter observability enable\` first; export is always on-demand.`,
  ].join("\n");
}

function parseLast(args: string[]): number {
  const i = args.indexOf("--last");
  if (i !== -1 && args[i + 1]) {
    const n = Number.parseInt(args[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const eq = args.find((a) => a.startsWith("--last="));
  if (eq) {
    const n = Number.parseInt(eq.split("=")[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 100;
}

const EXPORT_CONFIG_SNIPPET = `# OpenTelemetry Collector — receive Mooter routing spans
# Save as otel-collector.yaml and run:
#   otelcol --config otel-collector.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 127.0.0.1:4318

exporters:
  debug:
    verbosity: detailed
  # or point at Jaeger (all-in-one listens for OTLP on 4317/4318 since v1.35):
  # otlp/jaeger:
  #   endpoint: 127.0.0.1:4317
  #   tls:
  #     insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug]

# OpenLLMetry compatibility: Mooter spans carry gen_ai.* semantic-convention
# attributes (gen_ai.request.model, gen_ai.system) alongside mooter.*, so any
# backend that understands OpenLLMetry/OTel GenAI conventions (Traceloop,
# Jaeger, Grafana Tempo, Honeycomb…) groups them with other LLM traffic.
# Spans are batch-exported from decisions.log on demand — not live tracing —
# and never contain prompt contents.`;

export async function runObservability(args: string[], deps: ObservabilityDeps = {}): Promise<CmdResult> {
  const home = deps.home ?? homedir();
  const logPath = deps.decisionsLog ?? defaultDecisionsLogPath();
  const [sub] = args;

  if (!sub || sub === "help" || sub === "--help") {
    return { exitCode: sub ? 0 : 1, output: USAGE };
  }

  if (sub === "status") {
    const cfg = readConfig(home);
    // count every routing decision in the log (honest total, not just the tail)
    const all = readDecisionsTail(logPath, Number.MAX_SAFE_INTEGER);
    return { exitCode: 0, output: renderStatus(cfg, all.length, logPath) };
  }

  if (sub === "enable" || sub === "disable") {
    const cfg = readConfig(home);
    cfg.enabled = sub === "enable";
    writeConfig(cfg, home);
    return {
      exitCode: 0,
      output:
        sub === "enable"
          ? `✓ observability enabled (endpoint ${cfg.otlp_endpoint}). Export is on-demand: \`mooter observability export\`.`
          : `✓ observability disabled. No spans will be exported.`,
    };
  }

  if (sub === "export") {
    const cfg = readConfig(home);
    const dryRun = args.includes("--dry-run");
    const last = parseLast(args);

    if (!cfg.enabled && !dryRun) {
      return {
        exitCode: 1,
        output: `✗ observability is disabled — run \`mooter observability enable\` first (or use --dry-run to preview).`,
      };
    }

    const decisions = readDecisionsTail(logPath, last);
    if (decisions.length === 0) {
      return { exitCode: 0, output: `nothing to export — 0 routing decisions found in ${logPath}.` };
    }
    const spans = decisions.map(decisionToSpan);
    const payload = buildOtlpPayload(spans, cfg.service_name);

    if (dryRun) {
      return {
        exitCode: 0,
        output: [
          `dry-run: ${decisions.length} decision(s) → ${spans.length} span(s). No network calls made.`,
          `first span:`,
          JSON.stringify(spans[0], null, 2),
        ].join("\n"),
      };
    }

    const post = deps.post ?? postOtlp;
    const result = await post(cfg.otlp_endpoint, payload);
    if (result.ok) {
      return {
        exitCode: 0,
        output: `✓ exported ${spans.length} span(s) to ${cfg.otlp_endpoint}/v1/traces (HTTP ${result.status}).`,
      };
    }
    return {
      exitCode: 1,
      output: `✗ export failed: ${result.error ?? "unknown error"} — 0 of ${spans.length} span(s) delivered. Is a collector listening at ${cfg.otlp_endpoint}?`,
    };
  }

  if (sub === "export-config") {
    return { exitCode: 0, output: EXPORT_CONFIG_SNIPPET };
  }

  return { exitCode: 1, output: `mooter observability: unknown subcommand '${sub}'\n\n${USAGE}` };
}
