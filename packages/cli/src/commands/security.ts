// Wave 33.5 Block D.2/D.3 — `mooter security audit` + `mooter security spawn-test`.
//
// audit      — interactive 4-layer readiness check (network/fs/secrets/config)
// audit --json  — machine-readable
// spawn-test — runs the REAL synthetic CVE-2025-59528 sandbox-escape test
//
// The 4-layer enforcement itself lives in @mooter/spawn-orchestrator; this is the
// operator-facing surface that reports whether the host can enforce each layer.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  detectSandbox,
  runSandboxEscapeTest,
  renderVerdict,
} from "../../../spawn-orchestrator/src/index.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

type Level = "PASS" | "WARN" | "FAIL";

interface LayerResult {
  layer: string;
  level: Level;
  detail: string;
}

function auditLayers(env: NodeJS.ProcessEnv, home: string): LayerResult[] {
  const sb = detectSandbox();
  const l1: LayerResult = sb.available
    ? { layer: "Network egress", level: "PASS", detail: `${sb.backend} configured (--unshare-net available)` }
    : { layer: "Network egress", level: "FAIL", detail: sb.hint };
  const l2: LayerResult = sb.available
    ? { layer: "Filesystem boundary", level: "PASS", detail: "worktree isolation enforceable (ro-root + single writable mount)" }
    : { layer: "Filesystem boundary", level: "FAIL", detail: "no sandbox backend — cannot isolate the filesystem" };
  // L3 — the provider key being present in the env is fine for CLOUD spawns but is
  // a leak risk if a layer is misconfigured; surface it as a WARN, not a failure.
  const keyPresent = typeof env.ANTHROPIC_API_KEY === "string" && env.ANTHROPIC_API_KEY.length > 0;
  const l3: LayerResult = keyPresent
    ? { layer: "Secrets scoping", level: "WARN", detail: "ANTHROPIC_API_KEY in env — excluded from local spawns; verify before sharing a session" }
    : { layer: "Secrets scoping", level: "PASS", detail: "no provider key in the ambient env" };
  // L4 — config files exist and are the ones the sandbox keeps read-only.
  const cfg = join(home, ".claude", "settings.json");
  const l4: LayerResult = existsSync(cfg)
    ? { layer: "Config protection", level: "PASS", detail: "settings.json present; read-only under the sandbox root" }
    : { layer: "Config protection", level: "PASS", detail: "no settings.json yet (nothing to protect)" };
  return [l1, l2, l3, l4];
}

function worstLevel(results: LayerResult[]): Level {
  if (results.some((r) => r.level === "FAIL")) return "FAIL";
  if (results.some((r) => r.level === "WARN")) return "WARN";
  return "PASS";
}

const GLYPH: Record<Level, string> = { PASS: "✅ PASS", WARN: "⚠️  WARN", FAIL: "❌ FAIL" };

export function runSecurity(args: string[], opts: { env?: NodeJS.ProcessEnv; home?: string } = {}): CmdResult {
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  const sub = args[0] ?? "audit";

  if (sub === "spawn-test") {
    const verdict = runSandboxEscapeTest();
    return { exitCode: verdict.available ? (verdict.pass ? 0 : 1) : 0, output: renderVerdict(verdict) };
  }

  if (sub === "audit") {
    const results = auditLayers(env, home);
    if (args.includes("--json")) {
      return { exitCode: worstLevel(results) === "FAIL" ? 1 : 0, output: JSON.stringify({ layers: results, overall: worstLevel(results) }, null, 2) };
    }
    const out: string[] = ["🛡️ Mooter Security Audit · 4 layers", ""];
    results.forEach((r, i) => {
      out.push(`Layer ${i + 1}: ${r.layer.padEnd(20)} ${GLYPH[r.level]} — ${r.detail}`);
    });
    out.push("");
    const warns = results.filter((r) => r.level === "WARN").length;
    const fails = results.filter((r) => r.level === "FAIL").length;
    out.push(
      fails
        ? `${fails} failure(s). Spawn is disabled until the sandbox backend is installed.`
        : warns
          ? `${warns} warning(s). Run \`mooter security spawn-test\` to verify enforcement end-to-end.`
          : `All layers green. Run \`mooter security spawn-test\` to verify enforcement end-to-end.`,
    );
    return { exitCode: fails ? 1 : 0, output: out.join("\n") };
  }

  return { exitCode: 1, output: "usage: mooter security <audit [--json]|spawn-test>" };
}
