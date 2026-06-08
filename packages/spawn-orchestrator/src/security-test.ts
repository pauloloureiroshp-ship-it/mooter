// Wave 33.5 Block B.4 / D.3 — synthetic sandbox-escape test (CVE-2025-59528).
//
// Runs a REAL bubblewrap-sandboxed command and asserts the 4 layers hold:
//   1. a write INSIDE the worktree succeeds
//   2. a read of a masked secret (~/.ssh/id_rsa) is blocked
//   3. a write OUTSIDE the worktree (parent dir) is blocked
//   4. ANTHROPIC_API_KEY does NOT leak into a LOCAL spawn
// Returns a structured verdict; reused by `mooter security spawn-test`.

import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { buildSandboxConfig, assembleBwrap } from "./sandbox/sandbox.ts";
import { detectSandbox } from "./sandbox/detect.ts";

export interface SecurityCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface SecurityVerdict {
  available: boolean;
  pass: boolean;
  checks: SecurityCheck[];
  hint?: string;
}

function runIn(argv: string[]): string {
  try {
    return execFileSync(argv[0], argv.slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return (err.stdout ?? "") + (err.stderr ?? "");
  }
}

export function runSandboxEscapeTest(): SecurityVerdict {
  const sb = detectSandbox();
  if (!sb.available) {
    return { available: false, pass: false, checks: [], hint: sb.hint };
  }

  const home = mkdtempSync(join(tmpdir(), "moo-sec-home-"));
  mkdirSync(join(home, ".ssh"), { recursive: true });
  writeFileSync(join(home, ".ssh", "id_rsa"), "SECRET-PRIVATE-KEY");
  const parent = mkdtempSync(join(tmpdir(), "moo-sec-parent-"));
  const worktree = mkdtempSync(join(tmpdir(), "moo-sec-wt-"));

  const cfg = buildSandboxConfig({ worktreePath: worktree, mode: "local", tier: "T0", home });
  const env = { ...process.env, ANTHROPIC_API_KEY: "sk-should-not-leak" };
  const run = (cmd: string[]) => runIn(assembleBwrap({ config: cfg, command: cmd, sourceEnv: env }));

  const checks: SecurityCheck[] = [];

  run(["sh", "-c", `echo ok > ${join(worktree, "f.txt")}`]);
  checks.push({
    name: "L2 write inside worktree allowed",
    pass: existsSync(join(worktree, "f.txt")),
    detail: "worktree is the single writable mount",
  });

  const ssh = run(["sh", "-c", `cat ${join(home, ".ssh", "id_rsa")} 2>&1`]);
  checks.push({
    name: "L2 secret (~/.ssh) read blocked",
    pass: !ssh.includes("SECRET-PRIVATE-KEY"),
    detail: "masked by an empty tmpfs",
  });

  run(["sh", "-c", `echo x > ${join(parent, "hack.txt")} 2>&1`]);
  checks.push({
    name: "L2 write outside worktree blocked",
    pass: !existsSync(join(parent, "hack.txt")),
    detail: "read-only root; no escape to parent",
  });

  const key = run(["sh", "-c", "printf KEY=%s ${ANTHROPIC_API_KEY:-EMPTY}"]);
  checks.push({
    name: "L3 ANTHROPIC_API_KEY not leaked to local spawn",
    pass: key.includes("KEY=EMPTY"),
    detail: "clearenv + whitelist excludes provider keys for local mode",
  });

  return { available: true, pass: checks.every((c) => c.pass), checks };
}

export function renderVerdict(v: SecurityVerdict): string {
  if (!v.available) return `🛡️ spawn-test SKIPPED — no sandbox backend.\n   ${v.hint ?? ""}`;
  const lines = [`🛡️ Mooter spawn-test (synthetic CVE-2025-59528)`, ""];
  for (const c of v.checks) lines.push(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
  lines.push("");
  lines.push(v.pass ? "  PASS — sandbox blocks the escape." : "  FAIL — a layer did not hold.");
  return lines.join("\n");
}
