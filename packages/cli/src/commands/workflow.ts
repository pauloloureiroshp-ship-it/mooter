// `mooter workflow` — local-first dynamic workflow engine (Wave 28).
//
// This file is a THIN delegator. The engine lives in the separate
// `@mooter/workflow` package, which declares native/heavy deps (isolated-vm,
// better-sqlite3, ink, …). To keep the CLI load-safe — every existing command
// and its tests must keep working without those deps installed — we NEVER
// statically import the engine here. `--help` / no-args / unknown subcommands
// and all argument validation are fully self-contained; only after a subcommand
// has valid args do we lazy `import()` the engine (Phase I dispatch).
//
// The engine is resolved by relative path within the monorepo and needs its
// native deps built (a source checkout, not the shipped npm bundle). Ollama host
// follows the router convention via OLLAMA_HOST (see agent.ts); nothing here
// hardcodes a URL.

import type { CmdResult } from "./trail.ts";
// Type-only import: erased at build (esbuild/tsx drop it), so it does NOT pull
// the engine — or its native deps — into the zero-runtime-deps CLI bundle.
import type { AgentRequest } from "../../../workflow/src/agent.ts";
// Wave 32 (Phase E) — pure TUI render + external control plane (no native deps).
import { buildWorkflowWatch, readControl, setRunControl, setAgentControl } from "../../../transparency/src/index.ts";

const KNOWN_SUBCOMMANDS = ["create", "list", "watch", "run", "stop", "resume"] as const;

export const WORKFLOW_USAGE = `mooter workflow — local-first dynamic workflow engine (Wave 28)

Usage:
  mooter workflow create "<task>"   write a workflow (Opus, 1 call) → plan → save
  mooter workflow list              list recent runs
  mooter workflow watch <run_id>    Ralph-style Mission Control (live agents · cost · controls)
      --pause | --resume | --kill   write a run control intent (scriptable)
      --kill-agent <label>          mark one agent for kill
  mooter workflow run <name>        run a saved/example workflow
      --target <path>               feed a directory's files to the workflow as INPUT
      --dry-run                     resolve + compile-check the script, don't execute
  mooter workflow resume <run_id>   show the resumable checkpoints of a killed run

Workers run locally on Ollama (qwen2.5-coder:7b via OLLAMA_HOST); only the script
writer and synthesis use the cloud — so a run costs ~$0.45 and your code stays
on-device. Requires a source checkout with the engine's native deps built.`;

// ── arg parsing (cheap; no engine import) ─────────────────────────────────────

interface Parsed {
  positional: string[];
  flags: Record<string, string | boolean>;
}
function parseArgs(rest: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function err(message: string): CmdResult {
  return { exitCode: 1, output: `${message}\n\n${WORKFLOW_USAGE}` };
}

// Lazy engine loader — only reached once a subcommand has valid args. The
// specifier is assembled at runtime so esbuild does NOT bundle the engine (it
// pulls native deps — isolated-vm, better-sqlite3 — that the zero-runtime-deps
// CLI bundle must not contain). Resolves under a tsx source checkout, where the
// workflow command is supported; in the shipped bundle it throws and
// runWorkflow() reports it cleanly.
const ENGINE_SPECIFIER = ["..", "..", "..", "workflow", "src", "index.ts"].join("/");
async function engine() {
  return import(ENGINE_SPECIFIER);
}

// ── host-side file gathering for --target ─────────────────────────────────────

const MAX_FILES = 12;
const MAX_BYTES = 8000;
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "out"]);

async function gatherTarget(dir: string): Promise<{ target: string; files: Array<{ path: string; content: string }> }> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const files: Array<{ path: string; content: string }> = [];
  const walk = (d: string) => {
    if (files.length >= MAX_FILES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= MAX_FILES) break;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walk(full);
      } else if (e.isFile()) {
        if (!CODE_EXT.has(path.extname(e.name))) continue;
        if (/\.(test|spec)\./.test(e.name)) continue;
        try {
          files.push({ path: full, content: fs.readFileSync(full, "utf8").slice(0, MAX_BYTES) });
        } catch {
          /* skip unreadable */
        }
      }
    }
  };
  walk(dir);
  return { target: dir, files };
}

// Resolve a workflow name to a script path: example skills dir, then ~/.mooter.
async function resolveScript(name: string): Promise<string | null> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const bare = name.endsWith(".js") ? name : `${name}.js`;
  const candidates = [
    path.resolve(process.cwd(), ".claude/skills/workflows/examples", bare),
    path.join(os.homedir(), ".mooter", "workflows", bare),
    path.resolve(process.cwd(), name), // explicit path
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* next */
    }
  }
  return null;
}

// ── subcommand handlers ───────────────────────────────────────────────────────

async function dispatchRun(rest: string[]): Promise<CmdResult> {
  const { positional, flags } = parseArgs(rest);
  const name = positional[0];
  if (!name) return err("mooter workflow run: a workflow name is required");

  const fs = await import("node:fs");
  const scriptPath = await resolveScript(name);
  if (!scriptPath) {
    return err(`mooter workflow run: no workflow named '${name}' (looked in .claude/skills/workflows/examples and ~/.mooter/workflows)`);
  }
  const script = fs.readFileSync(scriptPath, "utf8");

  const eng = await engine();

  if (flags["dry-run"]) {
    try {
      eng.assertCompiles(script);
    } catch (e) {
      return { exitCode: 1, output: `dry-run: ${name} failed to compile: ${(e as Error).message}` };
    }
    return { exitCode: 0, output: `dry-run: ${name} resolved (${scriptPath}) and compiles. ${eng.countAgentCalls(script)} agent call site(s).` };
  }

  const input = typeof flags.target === "string" ? await gatherTarget(flags.target) : null;
  const runId = `${name}-${Date.now()}`;
  const store = new eng.WorkflowStore(eng.defaultDbPath());
  store.startRun({ run_id: runId, workflow_name: name, script });
  eng.updateActiveRun({ run_id: runId, workflow_name: name, status: "running", agents_done: 0 });

  let agentsDone = 0;
  const api = {
    agent: async (req: AgentRequest) => {
      const res = await eng.agent(req);
      store.recordAgent(runId, {
        label: req.model,
        backend: res.backend,
        model: res.model,
        tokens_in: res.tokens_in,
        tokens_out: res.tokens_out,
        cost_usd: res.cost_usd,
        latency_ms: res.latency_ms,
      });
      agentsDone++;
      eng.updateActiveRun({ run_id: runId, workflow_name: name, status: "running", agents_done: agentsDone });
      return res;
    },
    checkpoint: async (n: string, d: unknown) => store.saveCheckpoint(runId, n, d),
    log: async () => {},
  };

  try {
    const result = await eng.runScript(script, { runId, input, api });
    const run = store.finishRun(runId, "completed");
    eng.clearActiveRun();
    const cost = run?.actual_cost_usd ?? 0;
    const saved = run?.estimated_savings_usd ?? 0;
    const lines = [
      `✅ ${name} · run ${runId} · completed`,
      `   agents: ${run?.num_agents_total ?? agentsDone} (${run?.num_agents_local ?? 0} local, ${run?.num_agents_cloud ?? 0} cloud) · cost $${cost.toFixed(4)} · saved $${saved.toFixed(2)}`,
      ``,
      JSON.stringify(result, null, 2),
    ];
    return { exitCode: 0, output: lines.join("\n") };
  } catch (e) {
    store.finishRun(runId, "failed");
    eng.clearActiveRun();
    return { exitCode: 1, output: `❌ ${name} · run ${runId} failed: ${(e as Error).message}` };
  } finally {
    store.close();
  }
}

async function dispatchList(): Promise<CmdResult> {
  const eng = await engine();
  const store = new eng.WorkflowStore(eng.defaultDbPath());
  try {
    const runs = store.listRuns(20);
    if (runs.length === 0) return { exitCode: 0, output: "mooter workflow: no runs yet." };
    const rows = runs.map((r) => {
      const cost = r.actual_cost_usd != null ? `$${r.actual_cost_usd.toFixed(4)}` : "—";
      return `  ${r.status.padEnd(10)} ${(r.workflow_name ?? "?").padEnd(24)} ${r.run_id}  cost ${cost}`;
    });
    return { exitCode: 0, output: ["run", ...rows].join("\n") };
  } finally {
    store.close();
  }
}

// Wave 32 (Phase E) — Ralph-style Mission Control. Read-only over the Wave 28
// run store (loadRun + resumeFrom, public getters) with an EXTERNAL control
// plane (~/.mooter/workflow-control/<run>.json) — the engine itself is INTOCADO.
function buildWatchView(store: any, runId: string) {
  const run = store.loadRun(runId);
  if (!run) return null;
  const checkpoints = store.resumeFrom(runId) as { name: string; ts: number }[];
  return {
    runId,
    status: run.status as string,
    workflowName: run.workflow_name,
    numTotal: run.num_agents_total,
    numLocal: run.num_agents_local,
    numCloud: run.num_agents_cloud,
    actualCostUsd: run.actual_cost_usd,
    agents: checkpoints.map((c) => ({ label: c.name })),
    checkpoints,
    control: readControl(runId),
  };
}

async function dispatchWatch(rest: string[]): Promise<CmdResult> {
  const { positional, flags } = parseArgs(rest);
  const runId = positional[0];
  if (!runId) return err("mooter workflow watch: a run_id is required");

  // ── Control-plane flags (no engine needed; scriptable + testable) ──────────
  if (flags.pause) { setRunControl(runId, "paused"); return { exitCode: 0, output: `⏸ pause intent written for ${runId} (enforced when the run polls the control file)` }; }
  if (flags.resume) { setRunControl(runId, "running"); return { exitCode: 0, output: `▶ resume intent written for ${runId}` }; }
  if (flags.kill) { setRunControl(runId, "kill"); return { exitCode: 0, output: `✗ kill intent written for ${runId}` }; }
  if (typeof flags["kill-agent"] === "string") {
    setAgentControl(runId, flags["kill-agent"], "kill");
    return { exitCode: 0, output: `✗ kill intent written for agent '${flags["kill-agent"]}' in ${runId}` };
  }

  const eng = await engine();
  const store = new eng.WorkflowStore(eng.defaultDbPath());
  try {
    const view = buildWatchView(store, runId);
    if (!view) return { exitCode: 1, output: `mooter workflow watch: no run '${runId}'` };

    // Non-TTY (piped / CI): render one frame and return.
    if (!process.stdout.isTTY) {
      return { exitCode: 0, output: buildWorkflowWatch(view) };
    }

    // Interactive Mission Control: alternate screen + live re-render + controls.
    await new Promise<void>((resolve) => {
      let interval: ReturnType<typeof setInterval> | null = null;
      let done = false;
      const restore = () => {
        if (interval) clearInterval(interval);
        try { process.stdin.setRawMode?.(false); process.stdin.pause(); } catch { /* ignore */ }
        process.stdout.write("\x1b[?25h\x1b[?1049l");
      };
      const finish = () => {
        if (done) return; done = true; restore();
        process.off("SIGINT", finish); process.off("SIGTERM", finish); process.off("exit", restore);
        resolve();
      };
      const render = () => {
        const v = buildWatchView(store, runId) ?? view;
        process.stdout.write("\x1b[H" + buildWorkflowWatch(v) + "\n");
      };
      process.stdout.write("\x1b[?1049h\x1b[?25l");
      process.on("exit", restore); process.on("SIGINT", finish); process.on("SIGTERM", finish);
      try {
        process.stdin.setRawMode?.(true);
        process.stdin.resume();
        process.stdin.on("data", (d: Buffer) => {
          const k = d.toString();
          if (k === "q" || k === "\x03") return finish();
          if (k === "p") setRunControl(runId, "paused");
          else if (k === "r") setRunControl(runId, "running");
          else if (k === "k") setRunControl(runId, "kill");
          render();
        });
      } catch { /* non-TTY fallback: interval still ticks */ }
      render();
      interval = setInterval(render, 1000);
    });
    return { exitCode: 0, output: "" };
  } finally {
    store.close();
  }
}

async function dispatchResume(rest: string[]): Promise<CmdResult> {
  const { positional } = parseArgs(rest);
  const runId = positional[0];
  if (!runId) return err("mooter workflow resume: a run_id is required");
  const eng = await engine();
  const store = new eng.WorkflowStore(eng.defaultDbPath());
  try {
    const run = store.loadRun(runId);
    if (!run) return { exitCode: 1, output: `mooter workflow resume: no run '${runId}'` };
    const checkpoints = store.resumeFrom(runId);
    const lines = [
      `resume ${runId} (${run.workflow_name ?? "?"}) · status ${run.status}`,
      `  ${checkpoints.length} checkpoint(s) already reached (a resumed run skips these):`,
      ...checkpoints.map((c) => `   ✓ ${c.name}`),
      ``,
      `Re-run the workflow; its checkpoint() guards skip completed phases.`,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  } finally {
    store.close();
  }
}

async function dispatchCreate(rest: string[]): Promise<CmdResult> {
  const { positional, flags } = parseArgs(rest);
  const prompt = positional.join(" ").trim();
  if (!prompt) return err('mooter workflow create: a task description is required, e.g. mooter workflow create "audit src/ for X"');
  if (!process.env.ANTHROPIC_API_KEY) {
    return { exitCode: 1, output: "mooter workflow create: ANTHROPIC_API_KEY is required (the writer uses one Opus call)." };
  }
  const eng = await engine();
  let plan;
  try {
    plan = await eng.writeWorkflow(prompt);
  } catch (e) {
    return { exitCode: 1, output: `mooter workflow create failed: ${(e as Error).message}` };
  }

  // Persist the generated script.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const os = await import("node:os");
  const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workflow";
  const dir = path.join(os.homedir(), ".mooter", "workflows");
  fs.mkdirSync(dir, { recursive: true });
  const scriptPath = path.join(dir, `${slug}.js`);
  fs.writeFileSync(scriptPath, plan.script, "utf8");

  const rendered = eng.renderPlan(plan);
  const autoAccept = flags.yes === true || flags["dangerously-skip-permissions"] === true;
  const decision = await eng.presentPlan(plan, { autoAccept, out: () => {} });

  const out = [
    rendered,
    ``,
    `saved → ${scriptPath}`,
    decision === "run"
      ? `(auto-accepted; run it with: mooter workflow run ${slug})`
      : `run it with: mooter workflow run ${slug}`,
  ].join("\n");
  return { exitCode: 0, output: out };
}

export async function runWorkflow(args: string[]): Promise<CmdResult> {
  const [sub, ...rest] = args;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: WORKFLOW_USAGE };
  }
  if (!(KNOWN_SUBCOMMANDS as readonly string[]).includes(sub)) {
    return { exitCode: 1, output: `mooter workflow: unknown subcommand '${sub}'\n\n${WORKFLOW_USAGE}` };
  }

  // `stop` needs no engine; handle it before any import.
  if (sub === "stop") {
    return { exitCode: 0, output: "mooter workflow stop: runs are synchronous in this MVP; Ctrl-C cancels. Cross-session state is in ~/.mooter/workflows/state.db." };
  }

  try {
    switch (sub) {
      case "run":
        return await dispatchRun(rest);
      case "list":
        return await dispatchList();
      case "watch":
        return await dispatchWatch(rest);
      case "resume":
        return await dispatchResume(rest);
      case "create":
        return await dispatchCreate(rest);
      default:
        return err(`mooter workflow: '${sub}' is not wired yet`);
    }
  } catch (e) {
    // Most likely the engine couldn't be loaded (shipped bundle has no native
    // deps). Report it cleanly rather than crashing the CLI.
    return {
      exitCode: 1,
      output:
        `mooter workflow: the engine is unavailable in this build.\n` +
        `  Run from a source checkout with the engine's native deps built (isolated-vm, better-sqlite3).\n` +
        `  (${(e as Error).message})`,
    };
  }
}
