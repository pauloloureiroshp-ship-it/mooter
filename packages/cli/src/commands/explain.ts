// `mooter explain` (Wave 5 D3 · deepened Wave 40) — educational mode that
// describes the statusline. `mooter explain` / `mooter explain statusline` gives
// the overview; `mooter explain <chip>` gives a deep dive on one chip. Pure:
// returns text only (no I/O), so it's trivially testable and never fabricates
// live data.

export interface CmdResult {
  exitCode: number;
  output: string;
}

const STATUSLINE_GUIDE = `🐮 Mooter statusline guide

Line 1 (macro · cumulative session info):
  🐮 mooter saved $X (Y%)
     ↳ cumulative session savings vs an all-T3 (Opus) baseline
  T2 sonnet 0.65
     ↳ current tier (T0/T1/T2/T3) · model · confidence (0-1)

Line 2 (current state · wide terminals only, COLUMNS ≥ 120):
  🐂 ☁ / 🐄 🏠 …
     ↳ glyph by tier + provider (🏠 local · ☁ cloud · ⚡ max)
  🏠 local ×4
     ↳ 4 turns this session ran on a local Ollama Moo (free)
  🐄 last10: T0:1 T1:1 T2:3 T3:5
     ↳ tier distribution of the last 10 prompts
  🎮 RTX 4090 (12.1GB / 24GB)
     ↳ GPU + live VRAM used/total (nvidia-smi; omitted if unavailable)
  ctx [██░░░░░░░░] 23%
     ↳ context window used in the current Claude Code session
  ☁ Claude Max 100% · 5h reset
     ↳ Anthropic quota remaining (5h window)
  ⏱️ session 2h47m
     ↳ how long this Claude Code session has run (explicit modes only)
  this prompt $0.04 · session $4.21
     ↳ cost of the latest prompt · cumulative cost this session
  quant Q4_K_M (-72% size · ~99% quality vs FP16)
     ↳ local model quantization (smaller file, ~same quality)
  adapter ◌ baseline
     ↳ no LoRA adapter active (run \`mooter forge install\` to add one)

Statusline modes (mooter statusline mode <name>):
  mini      1 line  — headline only
  compact   2 lines — headline + operational chips
  full      3 lines — compact + synthesis chips
  didactic  5 lines — plain-language, explains every number
  auto      adaptive — picks layout from terminal width (default)
  Preview without saving: mooter statusline mode --preview <name>

To hide any chip:  mooter quiet --hide-<chip>
Available:         --hide-vram · --hide-quant · --hide-ctx · --hide-adapter · --hide-session-timer · --hide-user · --hide-sessions-count
Re-enable all:     mooter quiet --show-all

Deep dive on one chip:  mooter explain <chip>   (e.g. mooter explain saved)
List every chip:        mooter explain list`;

interface ChipExplainer {
  /** Canonical name (first) + accepted aliases. */
  names: string[];
  /** The chip as it appears on the statusline. */
  title: string;
  /** What the number/glyph is (50-100 words). */
  what: string;
  /** How to read it / what a healthy value looks like. */
  interpret: string;
  /** A concrete example reading. */
  example: string;
}

// Honest, grounded explanations — each maps to a real statusline chip and the
// data source behind it. No hyperbole.
const CHIPS: ChipExplainer[] = [
  {
    names: ["saved", "savings"],
    title: "🐮 mooter saved $X (Y%)",
    what: "Your cumulative savings this session, in dollars and as a percentage. Mooter compares what you actually spent (each prompt routed to the cheapest model that fits — Ollama, Haiku, Sonnet, or Opus) against a baseline where every prompt had gone to Opus (all-T3). The difference is the saving. It is an advisory estimate from token-cost models, not a billed figure, and it is floored at $0 (a rare short prompt can estimate above baseline).",
    interpret: "Higher is better. The % is savings vs all-Opus, so 78% means you paid ~22% of the all-Opus cost. It climbs as more prompts route to local/cheap tiers.",
    example: "saved $0.20 (78%) → you spent ~$0.06 where all-Opus would have been ~$0.28.",
  },
  {
    names: ["tier", "model", "confidence"],
    title: "T2 sonnet 0.65",
    what: "The routing decision for the current prompt: the tier, the model it maps to, and the classifier's confidence (0-1). Tiers are T0 (Ollama, local, free), T1 (Haiku), T2 (Sonnet), and T3 (Opus). The tier comes from classify.js reading your prompt's signals; the Opus orchestrator can still override it when a guardrail (e.g. ARCH_SIGNALS) fires.",
    interpret: "Low confidence (<0.6) means the classifier was unsure — the arbiter or guardrails may step in. A T3/opus on architecture work is correct, not waste.",
    example: "T2 sonnet 0.65 → routed to Sonnet with moderate confidence; fine for a bug investigation.",
  },
  {
    names: ["local", "moos", "moo", "herd"],
    title: "🏠 local ×4",
    what: "How many turns this session ran entirely on a local Ollama model (a 'Moo') instead of a paid cloud API. Local runs cost $0 — they execute on your own machine/GPU. This chip is the most direct evidence of money saved: every local turn is one you didn't pay an API for.",
    interpret: "Higher means more work stayed free and local. It grows when you do T0-style tasks (summaries, extraction, format transforms) that the local model handles well.",
    example: "🏠 local ×4 → four turns this session were free local Ollama runs.",
  },
  {
    names: ["last10", "tier-mix", "tiermix", "mix"],
    title: "🐄 last10: T0:1 T1:1 T2:3 T3:5",
    what: "The tier distribution of your last 10 prompts. It's a quick histogram of how Mooter has been routing recently: how many went to T0 (local), T1 (Haiku), T2 (Sonnet), and T3 (Opus). It reflects the shape of your recent work more than any single decision.",
    interpret: "A mix skewed to T0/T1 means lots of cheap work; skewed to T3 means heavy architecture/critical work. Neither is wrong — it should match what you've been doing.",
    example: "T0:1 T1:1 T2:3 T3:5 → recent work was mostly reasoning/architecture (5 Opus turns).",
  },
  {
    names: ["vram", "gpu", "rtx"],
    title: "🎮 RTX 4090 (12.1GB / 24GB)",
    what: "Your detected GPU and its live VRAM usage (used / total), read from nvidia-smi. VRAM determines which local models — and which quantization — can run on-device. The chip is omitted entirely when no GPU is detected, rather than showing a fake value.",
    interpret: "Used near total means little headroom for a bigger local model; lots of free VRAM means you can run larger/higher-quality local Moos.",
    example: "RTX 4090 (12.1GB / 24GB) → ~12GB free, room for a larger local model.",
  },
  {
    names: ["ctx", "context"],
    title: "ctx [██░░░░░░░░] 23%",
    what: "How much of the current Claude Code context window is in use. This is runtime-only — it comes from the live session via stdin, so it appears on the statusline but not in offline views like `mooter dashboard`. As context fills, older turns risk being summarized or dropped.",
    interpret: "Watch it climb on long sessions. Near 100% is a cue to /compact before quality degrades from 'lost in the middle'.",
    example: "ctx 23% → plenty of room; no need to compact yet.",
  },
  {
    names: ["quota", "claude-max", "max", "5h", "reset"],
    title: "☁ Claude Max 100% · 5h reset",
    what: "Your remaining Anthropic quota for the rolling 5-hour window, plus when it resets. It reflects your subscription's usage allowance, not a dollar balance. Mooter reads this so you can see how much cloud headroom you have before the window refills.",
    interpret: "100% means full headroom. If it drops low, lean on local/cheaper tiers (or wait for the reset) to avoid hitting the cap mid-task.",
    example: "Claude Max 100% · 5h reset → full quota; the window refills in 5h.",
  },
  {
    names: ["session-timer", "timer", "session-time"],
    title: "⏱️ session 2h47m",
    what: "How long the current Claude Code session has been running. It's shown only in explicit statusline modes (not auto), since not everyone wants a clock. It's a wall-clock age for the session, useful for pacing long work and knowing when a /compact or a break is due.",
    interpret: "Longer sessions accumulate context and cost — pair this with the ctx and cost chips when deciding to compact or wrap up.",
    example: "session 2h47m → you've been at this nearly three hours.",
  },
  {
    names: ["cost", "prompt-cost", "session-cost", "this-prompt"],
    title: "this prompt $0.04 · session $4.21",
    what: "Two cost chips: the estimated cost of the most recent prompt, and the cumulative estimated cost for the whole session. Both are estimates from per-tier token-cost models (the same ones behind the savings figure), not exact billed amounts. Local (T0) turns contribute $0.",
    interpret: "'this prompt' spikes on big Opus turns and is ~$0 on local turns. 'session' only ever grows. Compare against 'saved' to see the value of routing.",
    example: "this prompt $0.04 · session $4.21 → the last turn was cheap; the session has spent ~$4.21 so far.",
  },
  {
    names: ["quant", "quantization"],
    title: "quant Q4_K_M (-72% size · ~99% quality vs FP16)",
    what: "The quantization of the active local model. Quantization shrinks a model's weights (e.g. Q4_K_M is 4-bit) so it fits in less VRAM and runs faster, with a small quality cost. The chip names the scheme and its rough size/quality trade-off versus full-precision FP16.",
    interpret: "Lower-bit schemes (Q4) save the most VRAM with ~99% quality retention; if you have VRAM to spare, a higher-bit quant buys a little more quality.",
    example: "Q4_K_M (-72% size · ~99% quality) → ~a quarter the size of FP16 at near-identical quality.",
  },
  {
    names: ["adapter", "lora"],
    title: "adapter ◌ baseline",
    what: "Which LoRA adapter is active on the local model. A LoRA is a small fine-tune layer that specializes a base model for a task without retraining it. '◌ baseline' means none is active — you're running the stock model. Mooter's Pastor can train and select adapters per task (opt-in).",
    interpret: "'baseline' is the safe default. A named adapter means a specialization is applied; tier routing is unaffected — adapters only change how a local Moo behaves.",
    example: "adapter ◌ baseline → stock local model, no specialization loaded.",
  },
  {
    names: ["mlwr", "win-rate", "local-win-rate"],
    title: "MLWR 100%",
    what: "Mooter Local Win Rate — of the tasks Mooter judged a local model could own, the share where the local result held up at quality parity. It's a benchmark-derived honesty metric: it measures how often staying local was actually good enough, against an objective floor, not how often you used local.",
    interpret: "High MLWR means local routing is paying off without quality loss. A dip is a signal the Pastor may be over-routing to local for the kinds of tasks you're doing.",
    example: "MLWR 100% → every task sent local met the quality bar in the last benchmark.",
  },
  {
    names: ["user", "user-hash", "hash"],
    title: "👤 user a1b2c3d4",
    what: "An opaque 8-character hash derived from your local auth identity. It is NOT your GitHub handle, email, or any readable identifier — just a stable pseudonym so multi-device/cross-session views can group your data privately. When logged out, the chip is silently absent (it never guesses).",
    interpret: "The same hash across terminals means it's recognising you as one user. You should never see a real name or email here — that's by design.",
    example: "👤 user a1b2c3d4 → your private, non-reversible identity tag.",
  },
  {
    names: ["sessions", "sessions-count", "active"],
    title: "(2 active)",
    what: "How many Mooter sessions are currently live, counted from recent heartbeats across your terminals. It only appears when 2 or more are active, so a single-terminal user never sees clutter. Useful when you fan work across multiple Claude Code windows or worktrees.",
    interpret: "Shows up only at ≥2. If it's higher than the terminals you remember opening, you may have stale sessions still heartbeating.",
    example: "(2 active) → two Mooter sessions running right now (e.g. two terminals).",
  },
];

function findChip(topic: string): ChipExplainer | undefined {
  const t = topic.toLowerCase();
  return CHIPS.find((c) => c.names.includes(t));
}

function renderChip(c: ChipExplainer): string {
  return `🐮 mooter explain — ${c.names[0]}

  ${c.title}

What it is:
  ${c.what}

How to read it:
  ${c.interpret}

Example:
  ${c.example}

(Overview: mooter explain statusline · all chips: mooter explain list)`;
}

function renderList(): string {
  const rows = CHIPS.map((c) => `  ${c.names[0].padEnd(15)} ${c.title}`).join("\n");
  return `🐮 mooter explain — chips you can deep-dive

${rows}

Run:  mooter explain <chip>   (e.g. mooter explain saved)
Overview of the whole statusline:  mooter explain statusline`;
}

export function runExplain(opts: { topic?: string } = {}): CmdResult {
  const topic = opts.topic;
  if (!topic || topic === "statusline") {
    return { exitCode: 0, output: STATUSLINE_GUIDE };
  }
  if (topic === "list" || topic === "chips") {
    return { exitCode: 0, output: renderList() };
  }
  const chip = findChip(topic);
  if (chip) {
    return { exitCode: 0, output: renderChip(chip) };
  }
  const names = CHIPS.map((c) => c.names[0]).join(", ");
  return {
    exitCode: 1,
    output: `Unknown topic "${topic}". Available topics: statusline (overview) or a chip — ${names}. List: mooter explain list`,
  };
}
