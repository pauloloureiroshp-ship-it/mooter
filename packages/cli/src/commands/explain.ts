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
  📚 ctx ▰▰▱▱▱▱▱▱▱▱ 23%
     ↳ context window used in the current Claude Code session
  ☁ Claude Max [▓▓▓▓░░░░░░] · 2h13m/5h · ~63% est
     ↳ ESTIMATED Anthropic 5h-window usage from local counting — \`est\` is
       deliberate (no real-time quota API); \`quota ?\` = no fresh local data
  ⏱️ session 2h47m
     ↳ how long this Claude Code session has run (explicit modes only)
  📝 $0.04 this turn · $4.21 all-time
     ↳ cost of the latest prompt · cumulative all-time cost
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
    names: ["bench", "mooterbench"],
    title: "🧪 bench ?  (or e.g. \"60% acc (50 wf, n=1)\" once a RESULTS.json exists)",
    what: "MooterBench's routing accuracy: the share of a synthetic workflow set whose tier the classifier (classify.js) labelled the same as a hand-curated gold label. The dataset is 50 representative coding workflows across 15 categories (Apache-2.0, in packages/mooter-bench). The opt-in 🧪 chip reads a RESULTS.json; the benchmark now persists that file on each run (Wave 55), so when it is absent (never run) or older than 30 days the chip reads `🧪 bench ?` rather than showing a number. The 60% figure documented in the README is a recorded snapshot, not live data.",
    interpret: "Higher is better, but read it with the caveats: SYNTHETIC accuracy on a small (N=50), single-cohort (n=1, one machine) set — not real-world routing accuracy, and per-category numbers are noisy where a category has only 1-3 workflows. `?` is not a failure; it means there is no fresh results file to read.",
    example: "60% acc (50 wf, n=1) = 30/50 workflows routed to the gold tier on the reference dataset. The chip shows `🧪 bench ?` until you run `cd packages/mooter-bench && npm run bench`, which writes RESULTS.json.",
  },
  {
    names: ["cca-f", "ccaf", "audit"],
    title: "📜 cca-f ?  (or e.g. \"78% pass (60q, n=1)\" once an audit has run)",
    what: "The pass rate of the latest CCA-F audit — Mooter's self-administered, deterministic 60-question harness (Wave 54) that routes each question on local Ollama, resolves it, and has a Sonnet self-judge grade the answer. It is NOT the official Anthropic Claude Certified Architect exam; it is an internal, reproducible (same --seed ⇒ same questions) confidence check. The opt-in 📜 chip reads the newest ~/.mooter/cca-f/audit/<session>/report.json; when no audit has run, or the latest is stale (>30 days) or malformed, it shows `📜 cca-f ?` rather than a number.",
    interpret: "Higher is better, with caveats: SINGLE cohort (n=1, your machine), a Sonnet self-judge (not a human grader), and a synthetic question set — directional confidence, not a certification. `?` means no fresh audit exists; run `mooter cca-f audit --seed 42` (needs Ollama + Claude Max; ~4-6h for the full 60q).",
    example: "78% pass (60q, n=1) = 47/60 questions the Sonnet judge graded as passing on the seed-42 set. The live chip stays `📜 cca-f ?` until the first run.",
  },
  {
    names: ["saved", "savings"],
    title: "🐮 mooter saved $X (Y%)",
    what: "Your cumulative savings this session, in dollars and as a percentage. Mooter compares what you actually spent (each prompt routed to the cheapest model that fits — Ollama, Haiku, Sonnet, or Opus) against a baseline where every prompt had gone to Opus (all-T3). The difference is the saving. It is an advisory estimate from token-cost models, not a billed figure, and it is floored at $0 (a rare short prompt can estimate above baseline). Work that Mooter delegates to subagents (local-summarizer, cheap-triage, …) counts too — those dispatches are folded into the tier mix you see in `mooter digest`.",
    interpret: "Higher is better, but read it as ADVISORY and nothing more. The % is against an all-Opus baseline, so 47% would mean you paid ~53% of that. A 2026-08-23 audit found five different savings figures in circulation across this project, all contradicting each other, and none survived: no telemetry file records tokens, so every dollar figure here is modelled from prompt length, not measured. Treat the percentage as 'what the routing plan would have cost if it had been executed' — the plan and the execution are not the same thing, and in the audited window the classifier routed 101 of 123 prompts to a cheap tier while 3,193 of 3,225 executions ran on Opus. If it reads near 0% on a heavy session, the orchestrator did the work inline on Opus instead of delegating — extended-thinking / high-effort modes lean that way.",
    example: "saved $0.31 (47%) → advisory estimate from a token-cost model, NOT a billed figure and NOT measured against all-Opus spend. The one figure with a real denominator is the Option-A hits counter, where a local answer demonstrably replaced a paid one.",
  },
  {
    names: ["tier", "model"],
    title: "T2 sonnet 0.65",
    what: "The routing decision for the current prompt: the tier, the model it maps to, and the classifier's confidence (0-1). Tiers are T0 (Ollama, local, free), T1 (Haiku), T2 (Sonnet), and T3 (Opus). The tier comes from classify.js reading your prompt's signals; the Opus orchestrator can still override it when a guardrail (e.g. ARCH_SIGNALS) fires.",
    interpret: "Low confidence (<0.6) means the classifier was unsure — the arbiter or guardrails may step in. A T3/opus on architecture work is correct, not waste.",
    example: "T2 sonnet 0.65 → routed to Sonnet with moderate confidence; fine for a bug investigation.",
  },
  {
    names: ["confidence", "conf"],
    title: "conf 0.84  (how sure Mooter is about the route)",
    what: "How sure classify.js is about the tier it picked for THIS prompt, on a 0-1 scale. It is derived from how strongly the prompt's signals matched a known routing pattern — it is not a prediction that the answer will be correct, but a measure of whether the chosen tier is the right place to spend. High confidence means the prompt looked unambiguous (clear architecture signals → T3, a clear file-op → T0). Low confidence means the signals were mixed, and the Haiku arbiter or a guardrail may step in to decide.",
    interpret: "High (>0.80) = confident routing, act normally. Medium (0.60-0.80) = reasonable, but worth a glance at the output. Low (<0.60) = uncertain — the statusline marks the decision with ⚠ and you may want to pin a tier explicitly (add an architecture signal to force T3, or `@haiku` to force cheap). Three low-confidence routes in a row flips the headline red ('router miscalibrated').",
    example: "conf 0.84 → confident about the tier; T2 sonnet ⚠ conf 0.42 → uncertain, verify the output or pin a tier.",
  },
  {
    names: ["uncertainty", "metacognition"],
    title: "🤔 uncertainty signalling",
    what: "Mooter's local subagents are asked to flag what they are NOT sure about rather than answer with false confidence. When a local route returns with low self-assessed confidence, the task either escalates to a higher tier or the uncertainty is surfaced so you can verify before acting. This mirrors a metacognition principle Anthropic emphasises: a model that knows what it does not know is safer than one that always sounds sure. It is honest signalling, not a correctness guarantee.",
    interpret: "An uncertainty flag is a feature, not a failure — it is Mooter declining to bluff. Treat a flagged area (e.g. pricing, a version number) as 'verify this part'. No flag means the route was confident; it does not mean the answer is provably correct.",
    example: "🤔 uncertainty: pricing → a local route was unsure about a pricing figure; double-check that number before relying on it.",
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
    title: "📚 ctx ▰▰▱▱▱▱▱▱▱▱ 23%",
    what: "How much of the current Claude Code context window is in use. This is runtime-only — it comes from the live session via stdin, so it appears on the statusline but not in offline views like `mooter dashboard`. As context fills, older turns risk being summarized or dropped.",
    interpret: "Watch it climb on long sessions. Near 100% is a cue to /compact before quality degrades from 'lost in the middle'.",
    example: "ctx 23% → plenty of room; no need to compact yet.",
  },
  {
    names: ["quota", "claude-max", "max", "5h", "reset", "est"],
    title: "☁ Claude Max [▓▓▓▓░░░░░░] · 2h13m/5h · ~63% est",
    what: "Mooter's ESTIMATE of your Anthropic usage in the rolling 5-hour window: the time left until the window resets (2h13m of 5h) and the share of the window already used (~63%). The `est` marker is deliberate and load-bearing: Claude Code exposes NO real-time quota API (GitHub issue anthropics/claude-code#44328), so there is no authoritative number to show. Mooter counts tokens locally into quota-state.json as prompts route, and the 5h window resets are likewise INFERRED locally from observed activity — never confirmed by Anthropic. When the local state is missing or stale (no update for over 6 hours), the chip reads `quota ?` instead of pretending the window is full. It reflects your subscription's usage allowance, not a dollar balance, and is separate from Mooter's own cost-cap (`mooter explain cost-cap`).",
    interpret: "Treat the percentage as directional, not exact — it can drift from Anthropic's real meter, because tokens spent outside Mooter's view (other tools, other machines, server-side overhead) are never counted locally, and the inferred reset time can lag the real one. Color follows usage: green under 70% used = headroom; yellow 70-90% = pace yourself; red over 90% = lean on local/cheaper tiers or wait for the reset. `quota ?` means 'Mooter does not know' — that is honesty, not breakage; it clears once fresh routing activity updates quota-state.json.",
    example: "☁ Max · 2h13m/5h · ~63% est → by local count, ~63% of the 5h window is used and ~2h13m remain until the inferred reset. `quota ?` → no fresh local data; the real quota is unknown.",
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
    title: "📝 $0.04 this turn · $4.21 all-time",
    what: "One 📝 chip with two figures: the estimated cost of the most recent turn, and the cumulative estimated cost ALL-TIME (across every session, not just this one — this label was corrected in Wave 48, it previously read a misleading 'session'). Both are estimates from per-tier token-cost models (the same ones behind the savings figure), not exact billed amounts. Local (T0) turns contribute $0.",
    interpret: "'this turn' spikes on big Opus turns and is ~$0 on local turns. 'all-time' only ever grows. Compare against 'saved' to see the value of routing.",
    example: "📝 $0.04 this turn · $4.21 all-time → the last turn was cheap; you've spent ~$4.21 across all sessions.",
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
    names: ["local-routes", "mlwr", "win-rate", "local-win-rate"],
    title: "📊 local routes 100%",
    what: "Local routes (internally MLWR — Mooter Local Win Rate): of the tasks Mooter judged a local model could own, the share where the local result held up at quality parity. It's a benchmark-derived honesty metric — how often staying local was actually good enough against an objective floor, not how often you happened to use local. Most local routes are T0 work (file ops, transforms, summaries). Relabeled from the opaque 'MLWR' in Wave 48.",
    interpret: "Higher means local routing is paying off without quality loss. A dip signals the Pastor may be over-routing to local for the kinds of tasks you're doing. Empty (`run benchmark`) means no snapshot yet — run `mooter benchmark run`.",
    example: "📊 local routes 100% → every task sent local met the quality bar in the last benchmark.",
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
  {
    names: ["embed", "embedding", "nomic"],
    title: "🧭 embed nomic 768d",
    what: "The local embedding model the Pastor uses for per-task routing (nomic-embed-text, served by Ollama). '768d' is the number of dimensions in the vector that represents a prompt's meaning. It runs entirely on your machine — zero API cost — and routing similarity is computed against it. Relabeled in Wave 48 from the cryptic 'nomic-embed-text · 768d'.",
    interpret: "Local-only and free; you never pay for embeddings. More dimensions = a richer meaning vector. If the chip is absent, no vector snapshot exists yet (run `mooter vector status`).",
    example: "🧭 embed nomic 768d → the Pastor is embedding prompts locally with a 768-dim model.",
  },
  {
    names: ["agents", "spawns"],
    title: "🐄 agents 0 active · 0 spawned · peak 4",
    what: "The local sub-agent herd, by three honest numbers: how many sub-agents (Moos) are running RIGHT NOW, how many were spawned in total this session, and the peak concurrency reached. These are the FREE local Ollama workers a Dynamic Workflow fans work out to. Relabeled in Wave 48 from the indecipherable '0/0/peak0' — there is no 'queued' counter, so none is shown.",
    interpret: "Idle (0 active) is dim/baseline. ≥3 concurrent lights a ⚡ workflow cue — a fan-out is running now. 'peak' is the high-water mark for the session.",
    example: "🐄 agents 2 active · 9 spawned · peak 4 → two Moos working now; nine ran this session; four ran at once at the busiest.",
  },
  {
    names: ["cost-cap", "limits", "spend-cap", "cap"],
    title: "🔒 cost-cap OK",
    what: "Mooter's OWN spend ceiling — the cost cap you set in ~/.mooter/limits.toml. This is NOT the Anthropic/Claude Max quota (that is the separate ☁ Claude Max chip — see `mooter explain quota`). When the enforcer has recorded live spend it shows $spent/$cap; otherwise it reads 'OK' while a cap is configured. Relabeled in Wave 48 from the vague 'limits OK'.",
    interpret: "🔒 OK = under your cap. 🔓 HIT = you crossed it (Mooter stops escalating to paid tiers). Absent = no cost cap configured.",
    example: "🔒 cost-cap $1.20/$5.00 → you've spent $1.20 of your $5.00 session cap.",
  },
  {
    names: ["tiers", "tier-system", "pricing"],
    title: "Mooter tier system (T0–T3 · T5 opt-in)",
    what: "The routing tiers and what each costs per million tokens (input / output, authoritative Anthropic pricing):\n    T0  Ollama local      $0           file ops · transforms · summaries · OCR\n    T1  Haiku 4.5         $1 / $5      cheap triage · commit msgs · regex\n    T2  Sonnet 4.6        $3 / $15     investigation · root-cause · reasoning\n    T3  Opus 4.6 / 4.8    $5 / $25     architecture · multi-file · critical (default heavy tier)\n    T5  Fable 5          $10 / $50     frontier — opt-in ONLY (\"@fable\"), never auto-routed\n  (There is no T4 — Opus 4.8 shares T3 with 4.6; the exact model shows on the statusline.)",
    interpret: "Most prompts land in T0/T1 (cheap) or T3 (architecture). T2 is the RAREST tier in real usage (~7-8%) — the mid reasoning zone is genuinely narrow, not a bug. T5 (Fable 5) is the frontier tier and is the ONLY tier the classifier never picks on its own: because it is the most expensive, you reach it deliberately with an explicit override. Mooter defaults to the cheapest tier that fits and escalates only when signals demand it.",
    example: "A 'fix this typo' prompt → T0 ($0); 'redesign the vault for multi-user' → T3 (Opus); '@fable analyse this dense chart' → T5 (Fable, opt-in).",
  },
  {
    names: ["cascade", "cascading", "fallback", "escalation"],
    title: "🪜 cascading fallback (advisory)",
    what: "An ADVISORY layer that watches for quality-floor breaches on a routed prompt and, when one fires, suggests re-running one rung up the real ladder: T0 (local Ollama) → T1 (Haiku) → T2 (Sonnet) → T3 (Opus). Three signals breach the floor: a refusal pattern in the response (e.g. \"I can't help with…\"), classifier confidence below 0.6, or 2+ tool failures. It recommends — it NEVER mutates routing: classify.js (frozen, sha CI-enforced) remains the only thing that picks tiers, and your prompts are never silently re-sent.",
    interpret: "An escalation suggestion means the cheap tier likely wasn't enough for THAT prompt — re-run it yourself at the suggested tier if you agree. The ladder tops out at T3 (Opus): there is no T4, and T5 (Fable 5, $10/$50 per Mtok) is user-opt-in ONLY — the advisory never auto-suggests crossing into the paid frontier; you reach it by typing @fable. See `mooter why-not-fable` for the per-decision cost comparison.",
    example: "T1 route returns \"I am unable to…\" → advisory: quality floor breached, consider re-running at T2 (advisory only — classify.js routing is unchanged).",
  },
  {
    names: ["vision", "multimodal", "image", "ocr"],
    title: "🖼️ vision (multimodal)",
    what: "How Mooter handles image/vision tasks (OCR, screenshots, charts, screenshot→code). Honest current state: Mooter does NOT run a local vision model by default — no Qwen2.5-VL or similar is installed, so there is no $0 local vision path yet. Vision work therefore routes to a frontier cloud model. The classifier does not auto-detect images; you opt in.",
    interpret: "For a vision task, pin the frontier tier explicitly — '@fable' (T5, Fable 5 has vision support) — or use your own cloud setup. A local vision tier (Qwen2.5-VL, ~6GB VRAM, zero API cost) is a planned addition; until it ships, this stays cloud-only and is not claimed as local.",
    example: "'@fable read the text in this screenshot' → T5 Fable (frontier vision). There is no local OCR path today.",
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
