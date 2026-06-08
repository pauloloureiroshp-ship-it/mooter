// Wave 33.5 Block E — intent-based UX.
//
//   mooter intent "<natural language>"   → resolves to a concrete command and
//   shows it BEFORE running (transparency). Dry-run by default; `--run` executes.
//   mooter intent --palette                → the command palette (E.3).
//
// Resolution is deterministic keyword matching (pure, testable). An optional
// Ollama pass (qwen2.5:3b, injectable) can refine ambiguous phrases, but the
// keyword resolver is always the safe fallback — we never execute a command the
// user did not see first.

export interface CmdResult {
  exitCode: number;
  output: string;
}

export interface ResolvedIntent {
  command: string[]; // argv after "mooter"
  rule: string;
  confidence: number;
}

interface Rule {
  name: string;
  test: RegExp;
  build: (phrase: string) => string[];
  confidence: number;
}

// Order matters: the most specific verbs (do-work → spawn) are matched before the
// broad nouns so "fix the sessions bug" spawns rather than opening the dashboard.
const RULES: Rule[] = [
  { name: "spawn-task", test: /\b(fix|bug|implement|refactor|rename|add|write|migrate|update)\b/i, build: (p) => ["spawn", p], confidence: 0.9 },
  { name: "security", test: /\b(secur|sandbox|audit|escape|cve|safe)\b/i, build: () => ["security", "audit"], confidence: 0.85 },
  { name: "conductor", test: /\b(lock|conduct|race|serialize|queue|deadlock)\b/i, build: () => ["conductor", "status"], confidence: 0.8 },
  { name: "quota", test: /\b(quota|5h|limit|how much.*left|budget)\b/i, build: () => ["sessions", "quota"], confidence: 0.8 },
  { name: "savings", test: /\b(save|saved|saving|cost|spent|how much)\b/i, build: () => ["sessions", "watch"], confidence: 0.7 },
  { name: "sessions", test: /\b(session|sessions|terminals?|what.*running|across)\b/i, build: () => ["sessions", "watch"], confidence: 0.8 },
  { name: "spawn-list", test: /\b(spawn|agent|herd|workers?)\b/i, build: () => ["spawn", "list"], confidence: 0.75 },
  { name: "install", test: /\b(install|plugin|zellij|tmux|wezterm|setup|init)\b/i, build: () => ["init"], confidence: 0.7 },
  { name: "status", test: /\b(status|state|snapshot|what.*mooter|right now)\b/i, build: () => ["status"], confidence: 0.7 },
];

export function resolveIntent(phrase: string): ResolvedIntent {
  const p = phrase.trim();
  if (!p) return { command: ["help"], rule: "empty", confidence: 0 };
  for (const r of RULES) {
    if (r.test.test(p)) return { command: r.build(p), rule: r.name, confidence: r.confidence };
  }
  return { command: ["help"], rule: "fallback", confidence: 0.3 };
}

const PALETTE: Array<{ group: string; items: Array<[string, string]> }> = [
  { group: "Spawn", items: [["spawn <task>", "sandboxed local-first agent"], ["spawn list", "active spawns"], ["spawn kill <id>", "stop a spawn"]] },
  { group: "Sessions", items: [["sessions watch", "cross-session TUI"], ["sessions quota", "5h forecast"], ["sessions worktrees", "git worktree map"]] },
  { group: "Conductor", items: [["conductor status", "locks + queue"], ["conductor lock <r>", "acquire a lock"], ["conductor history", "recent ops"]] },
  { group: "Security", items: [["security audit", "4-layer check"], ["security spawn-test", "real CVE escape test"]] },
  { group: "Setup", items: [["init", "install wizard"], ["terminal label <n>", "name this terminal"], ["statusline mode <m>", "pin layout"]] },
];

function renderPalette(): string {
  const out: string[] = ["🐮 Mooter command palette", ""];
  for (const g of PALETTE) {
    out.push(`  ${g.group}`);
    for (const [cmd, desc] of g.items) out.push(`    mooter ${cmd.padEnd(22)} ${desc}`);
    out.push("");
  }
  out.push("Tip: `mooter intent \"<what you want>\"` resolves a phrase to a command.");
  return out.join("\n");
}

export interface IntentOptions {
  /** Optional refiner (Ollama); returns argv or null. Falls back to keywords. */
  refine?: (phrase: string, candidates: string[]) => string[] | null;
}

export function runIntent(args: string[], opts: IntentOptions = {}): CmdResult {
  if (args.includes("--palette") || args[0] === "palette") {
    return { exitCode: 0, output: renderPalette() };
  }
  const run = args.includes("--run");
  const phrase = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!phrase) {
    return {
      exitCode: 0,
      output: `🐮 Mooter · what do you want to do?\n\n  mooter intent "fix bug in Hero.tsx"\n  mooter intent "show me my sessions"\n  mooter intent --palette\n\n(Type an intent; Mooter shows the resolved command before running it.)`,
    };
  }
  let resolved = resolveIntent(phrase);
  if (opts.refine) {
    try {
      const refined = opts.refine(phrase, RULES.map((r) => r.name));
      if (refined && refined.length) resolved = { ...resolved, command: refined, rule: `${resolved.rule}+ollama` };
    } catch {
      /* keep keyword resolution */
    }
  }
  const cmd = `mooter ${resolved.command.join(" ")}`;
  if (!run) {
    return {
      exitCode: 0,
      output: `→ resolved to: ${cmd}\n   (rule: ${resolved.rule}, confidence ${resolved.confidence.toFixed(2)})\n   run it with: mooter intent "${phrase}" --run`,
    };
  }
  // --run is acknowledged here; the dispatcher re-enters with resolved.command.
  return { exitCode: 0, output: `RUN ${resolved.command.join(" ")}` };
}
