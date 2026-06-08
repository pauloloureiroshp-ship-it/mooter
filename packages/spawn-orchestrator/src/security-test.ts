// Wave 33.5 Block B.4 / D.3 — synthetic sandbox-escape test (CVE-2025-59528).
//
// Runs a REAL bubblewrap-sandboxed command and asserts the 4 layers hold:
//   1. a write INSIDE the worktree succeeds
//   2. a read of a masked secret (~/.ssh/id_rsa) is blocked
//   3. a write OUTSIDE the worktree (parent dir) is blocked
//   4. ANTHROPIC_API_KEY does NOT leak into a LOCAL spawn
// Returns a structured verdict; reused by `mooter security spawn-test`.

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
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

  // CRITICAL: fixtures must live OUTSIDE /tmp. The sandbox masks /tmp wholesale
  // (`--tmpfs /tmp`), so a secret placed there reads empty for the WRONG reason
  // and gives false assurance. We root the fake $HOME under the REAL home dir so
  // the ONLY thing masking it is the home-tmpfs we are actually testing. (We never
  // touch the real credential files — only fakes inside this throwaway dir.)
  const home = mkdtempSync(join(homedir(), ".mooter-sectest-"));
  try {
    // Seed credential stores an agent would target — the exact ones the reviewer
    // showed leaking before the wholesale home mask.
    const secrets: Array<[string, string]> = [
      [join(home, ".ssh", "id_rsa"), "SECRET-SSH-KEY"],
      [join(home, ".claude", ".credentials.json"), "SECRET-CLAUDE-OAUTH"],
      [join(home, ".mooter", ".telemetry_secret"), "SECRET-TELEMETRY-HMAC"],
      [join(home, ".config", "gh", "hosts.yml"), "oauth_token: gho_SECRET"],
    ];
    for (const [p, body] of secrets) {
      mkdirSync(join(p, ".."), { recursive: true });
      writeFileSync(p, body);
    }
    const worktree = join(home, "wt");
    mkdirSync(worktree, { recursive: true });

    const cfg = buildSandboxConfig({ worktreePath: worktree, mode: "local", tier: "T0", home });
    const env = { ...process.env, ANTHROPIC_API_KEY: "sk-should-not-leak" };
    const run = (cmd: string[]) => runIn(assembleBwrap({ config: cfg, command: cmd, sourceEnv: env }));

    const checks: SecurityCheck[] = [];

    run(["sh", "-c", `echo ok > ${join(worktree, "f.txt")}`]);
    checks.push({
      name: "L2 write inside worktree allowed",
      pass: existsSync(join(worktree, "f.txt")),
      detail: "worktree is the single writable mount (re-exposed over the home mask)",
    });

    // Every seeded secret must read back empty (home masked wholesale).
    let allSecretsBlocked = true;
    const leaked: string[] = [];
    for (const [p, body] of secrets) {
      const got = run(["sh", "-c", `cat ${p} 2>&1`]);
      if (got.includes(body)) {
        allSecretsBlocked = false;
        leaked.push(p.replace(home, "~"));
      }
    }
    checks.push({
      name: "L2 ALL credential stores blocked (~/.ssh, ~/.claude, ~/.mooter, ~/.config/gh)",
      pass: allSecretsBlocked,
      detail: allSecretsBlocked ? "whole-$HOME tmpfs mask holds" : `LEAKED: ${leaked.join(", ")}`,
    });

    // Write to a real read-only system path (NOT /tmp) → must fail (ro-root).
    run(["sh", "-c", `echo x > /etc/moo-sectest-hack 2>&1`]);
    checks.push({
      name: "L2 write outside worktree blocked",
      pass: !existsSync("/etc/moo-sectest-hack"),
      detail: "read-only root; no escape to the host filesystem",
    });

    const key = run(["sh", "-c", "printf KEY=%s ${ANTHROPIC_API_KEY:-EMPTY}"]);
    checks.push({
      name: "L3 ANTHROPIC_API_KEY not leaked to local spawn",
      pass: key.includes("KEY=EMPTY"),
      detail: "clearenv + whitelist excludes provider keys for local mode",
    });

    return { available: true, pass: checks.every((c) => c.pass), checks };
  } finally {
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

export function renderVerdict(v: SecurityVerdict): string {
  if (!v.available) return `🛡️ spawn-test SKIPPED — no sandbox backend.\n   ${v.hint ?? ""}`;
  const lines = [`🛡️ Mooter spawn-test (synthetic CVE-2025-59528)`, ""];
  for (const c of v.checks) lines.push(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
  lines.push("");
  lines.push(v.pass ? "  PASS — sandbox blocks the escape." : "  FAIL — a layer did not hold.");
  return lines.join("\n");
}
