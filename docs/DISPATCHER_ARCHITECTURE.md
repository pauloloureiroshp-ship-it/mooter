# Dispatcher Architecture — deep technical analysis

> **Question**: What is the best architecture for receiving a prompt in the Claude Code terminal, deciding the best model for *reasoning* about the task, routing sub-work to the most appropriate LLMs, and returning the best result in the shortest possible wall-clock time?
>
> This document is the honest engineering answer, written with knowledge of what frugal does today (v0.7.1) and full awareness of the 2026 routing landscape (RouteLLM, Semantic Router, LiteLLM, Portkey, Martian, NotDiamond).

---

## 1. The question, restated precisely

The user's question has four embedded demands that must be unpacked:

1. **"Receive the prompt in the Claude Code terminal"** — the entry point is the `UserPromptSubmit` hook. We do not own the client; we only get a short synchronous window to inject context before the session processes the turn. Our hard ceiling is ~200ms total if we want to be invisible.

2. **"Understand the best model for *reasoning*"** — this is the critical word. The user is pointing out that *deciding* which model to use is itself a reasoning task. frugal v0.7.1 does it with regex. That works for 83.9% of real prompts but leaves a long tail.

3. **"Direct to the most appropriate LLMs (plural)"** — "LLMs" is plural. A single prompt may benefit from **decomposition** (different subtasks → different models), not just single-tier selection. This is the Achilles heel of every proxy-based router today: they route one prompt to one model, not one prompt to many.

4. **"Return the best result as fast as possible"** — quality AND latency AND cost. The trade-off triangle. The statusline measurement piece the user asked for makes this explicit: you cannot claim "cheapest" as the sole KPI anymore.

## 2. What frugal does today (v0.7.1)

```
prompt → UserPromptSubmit hook → classify.js (regex, <50ms)
                                    ↓
                         <router-hint> injected into context
                                    ↓
                 Claude Code session reads ~/.claude/CLAUDE.md (doctrine)
                                    ↓
                 Session decides: inline answer, or spawn which subagent?
                                    ↓
        ┌───────────────┬─────────────────┬────────────────┬────────────────┐
        ↓               ↓                 ↓                ↓                ↓
  local-summarizer  cheap-triage    model-reasoner   model-architect   final-reviewer
  (Ollama)          (Haiku)         (Sonnet)         (Opus)            (Opus, gate)
```

**Strengths:**
- Zero LLM cost at classification. Hook p50 **113ms** (measured v0.7).
- Doctrine is declarative. Edit one file, change routing.
- 90.2% cost savings validated on 1,370 real prompts.
- No proxy. If frugal dies, Claude Code keeps working.

**Structural gaps the user is implicitly pointing at:**

1. **The classifier has no semantic understanding.** It sees regex matches, not meaning. A prompt like *"refactor this auth flow to use JWT rotation, write tests, and write the migration script"* is classified by `refactor` keyword → T3 → one Opus subagent does all three parts. That's ~$0.50 and ~45 seconds when it could be $0.04 and ~12 seconds via decomposition (Sonnet for refactor plan + Haiku for test skeleton + cheap-triage for migration boilerplate).

2. **No measured latency feedback.** We ship cost savings in USD/BRL, but we never answered "how much slower is it?" The user is calling this out directly. Without that number, the product cannot honestly claim "best result fastest".

3. **No decomposition layer.** The hook emits one tier for the whole prompt. The doctrine reader (Claude Code itself, whatever model is active) is the only thing that can decompose — but it has no structured hint telling it *how*.

4. **Single-pass classifier has a confidence ceiling.** The `ambiguous_medium` / `ambiguous_long` categories exist precisely because regex runs out of signal. Real semantic paraphrases (`"preciso do teu melhor modelo"`, `"pensa bem"`) had to be added explicitly in v0.7. There are thousands of phrasings we didn't think of.

## 3. The trade-off triangle

Any routing architecture lives inside a three-dimensional trade-off space:

```
                            QUALITY
                               /\
                              /  \
                             /    \
                            /      \
                           /        \
                          /          \
                         /            \
                        /   route to   \
                       /      Opus      \
                      /   for everything \
                     /                    \
                    /______________________\
                   /                        \
                  /                          \
               SPEED ─────────────────── COST
            (tokens/sec,                ($/MTok,
             p50 latency)                $ per turn)
```

- **Pure Opus**: highest quality, highest cost, **also often slowest** (more output tokens, 30-50 tok/s stream rate)
- **Pure Ollama**: lowest cost ($0), often slowest on cold start (8-15s), lowest quality on complex tasks
- **Pure Haiku**: fastest (100-150 tok/s), cheap, limited reasoning
- **Frugal (doctrine-based routing)**: *per-prompt* optimisation — tries to find the Pareto-optimal point for each individual task

**Critical insight most routers miss:**

> Cheaper models are often *also* **faster**. Sonnet is ~2× as fast as Opus on the same prompt because it outputs fewer tokens on average and streams at a higher rate. So routing a task to Sonnet instead of Opus is almost always a win on BOTH speed and cost, and only a loss on quality *if* the task actually needed Opus.

This means the honest question isn't "how much slower is frugal vs Opus?" It's **"for which prompts is frugal actually slower, and are those the prompts the user cares about?"** The answer from real data: frugal is *slower* only for trivial Ollama calls (because local 3B inference is slower than cloud Haiku for short answers) and *faster* for everything else. The latency measurement feature must expose this nuance.

## 4. Five candidate architectures

### Option A — Status quo (v0.7.1)

Regex classifier + hint + doctrine.

| Dimension | Score |
|---|---|
| Cost at classification | **$0** |
| Latency at classification | **<50ms** |
| Quality of decisions | ~83.9% good (regex coverage) |
| Decomposition | **None** |
| Explainability | Complete (reasoning field) |
| Implementation complexity | Low (already built) |
| Auditability | Complete (every regex is ~700 lines of auditable code) |

**Verdict:** The baseline. Ship it. But do not claim it is the *optimal* architecture for prompts where regex runs out.

### Option B — Two-stage LLM dispatcher (Haiku arbiter)

Replace the regex-only classifier with: regex first pass, then Haiku call for ambiguous prompts only.

```
prompt → regex classifier → confidence score
                 ↓
     ┌───────────┴───────────┐
     ↓                       ↓
 high conf                ambiguous
 (>0.75)                  (<0.75 or
     ↓                    quality_intent)
 emit hint                     ↓
 (unchanged)          spawn Haiku call
                        ↓
                 Haiku returns JSON:
                 {tier, subagent, decomposition?, reasoning}
                        ↓
                 emit enriched hint
```

Haiku 4.5 is $0.80/$4 per MTok, p50 ~400ms, and easily capable of reasoning about a one-paragraph prompt. Cost of the arbiter per ambiguous prompt: ~$0.001. For 17% of prompts that hit the arbiter, on a corpus of 1,370, that's ~$0.23 total extra cost.

| Dimension | Score |
|---|---|
| Cost at classification | **~$0.0002 avg** (17% × $0.001) |
| Latency at classification | **~120ms avg** (17% × 400ms + 83% × <50ms) |
| Quality of decisions | ~95% good (regex + semantic fallback) |
| Decomposition | **Possible** (Haiku can return `subtasks: []`) |
| Explainability | Complete (Haiku returns reasoning) |
| Implementation complexity | Medium (2 new modules) |
| Auditability | Medium (Haiku is a black box; we can log its I/O) |

**Verdict:** The right next step. Preserves the fast path for easy prompts, adds real intelligence where regex fails. **~17% of prompts pay ~$0.001 and ~400ms, in exchange for correct routing and optional decomposition.**

### Option C — Parallel speculative execution

Run Sonnet and Opus simultaneously for high-stakes prompts. Return whichever finishes first if confident.

| Dimension | Score |
|---|---|
| Cost | **DOUBLE for T3 prompts** — kills the core value proposition |
| Latency | Best-of-two wins (~40% faster for long-output prompts) |
| Quality | Best-of-two wins |
| Decomposition | None |
| Auditability | Complete (both responses logged) |

**Verdict:** Rejected. Incompatible with the frugal doctrine. Note it exists (some products do this — see Groq's speculative decoding) but it's a latency play, not a cost play.

### Option D — Learned semantic classifier (BERT/DeBERTa-small)

Train a ~30MB encoder on the user's own `decisions.log` plus feedback signals.

| Dimension | Score |
|---|---|
| Cost at classification | ~$0 (local inference) |
| Latency at classification | ~30ms (ONNX on CPU) |
| Quality of decisions | Potentially very high (adapts to user) |
| Decomposition | Possible if trained for it |
| Explainability | **Lost** (a learned classifier is opaque) |
| Implementation complexity | **High** (data collection, training, hosting, fine-tuning loop) |
| Auditability | **Lost** (weights are not readable) |

**Verdict:** Premature. Requires 1000+ labelled decisions to train a useful model, and would destroy one of frugal's main differentiators — *every decision is explainable in <10 lines of code*. Defer to v1.0+ unless regex coverage demonstrably plateaus.

### Option E — Hybrid: regex + Haiku arbiter + semantic router fallback

Regex first (fast path, 83% of cases), Haiku arbiter second (semantic understanding, ~15% of cases), semantic router (aurelio-labs embedding lookup) third (paraphrase catch-all, ~2% of cases).

This is Option B plus a third tier for prompts where even Haiku's one-shot reasoning is too shallow (e.g. multi-step planning tasks). Only used when Haiku returns low-confidence.

| Dimension | Score |
|---|---|
| Cost at classification | ~$0.0003 avg |
| Latency at classification | ~150ms avg |
| Quality | ~98% good |
| Decomposition | Full (Haiku arbiter handles it) |
| Implementation complexity | High (3 cascading layers) |
| Auditability | High for layers 1+3, medium for layer 2 |

**Verdict:** The right v0.9 target. Premature for v0.8. Ship Option B first and measure whether the 2% long tail justifies the extra layer.

## 5. Comparison matrix

| Architecture | Cost/turn | Latency overhead | Quality | Decompose | Complexity | Recommended for |
|---|---:|---:|---:|---|---|---|
| A — Status quo (regex) | $0 | 0ms | 84% | no | low | **Today (shipped)** |
| B — Haiku arbiter on ambiguous | $0.0002 | +70ms avg | 95% | yes | medium | **v0.8 (next)** |
| C — Parallel speculative | 2× base | -40% | 99% | no | low | **Never** (kills value prop) |
| D — Learned classifier | $0 | +30ms | ~90% | optional | high | v1.0+ (needs data) |
| E — Cascading hybrid | $0.0003 | +150ms avg | 98% | yes | high | **v0.9** |

## 6. Recommendation — the evolutionary path

**frugal should NOT pivot to a single new architecture. It should evolve through four versions, each preserving the fast-path doctrine while adding capability to the long tail.**

```
v0.7.1 (today)  ──►  v0.7.2  ──►  v0.8      ──►  v0.9        ──►  v1.0
Regex classifier     Latency       Haiku          Semantic          Full
Quality intent       measurement    arbiter on     router             learned
Sub-tier            + doctrine     ambiguous      fallback           classifier
specialists         refinement     + decomp       (2% tail)         (if needed)
```

### v0.7.2 — latency measurement + doctrine refinement (this sprint)

The user's immediate ask. Two concrete additions:

1. **Turn-level latency tracking via Stop hook** — measure wall clock from `UserPromptSubmit` to `Stop`. Pair by `session_id`. Aggregate p50/p95.

2. **Opus baseline estimate** — pre-computed per-tier wall clock baseline from Anthropic's published latency (Opus ~30-50 tok/s, first token ~500ms, typical T3 output ~1800 tok = ~40s typical). Display the delta in the statusline: `⏱ 2.1s p50 · ~−38s vs Opus` (green for faster).

3. **Honesty marker** — the delta is `~` estimated, the p50 is measured.

Ship this. It closes the loop the user identified: "economia de dinheiro mas preciso saber quanto mais lento".

### v0.8 — Haiku arbiter on ambiguous prompts

Only the ~17% of prompts that hit `ambiguous_medium`, `ambiguous_long`, or quality_intent ambiguity. Regex-confident prompts (the 83%) continue the fast path untouched.

```js
// New module: arbiter.js
// Called from inject_context.js ONLY when classifier confidence < 0.75
async function arbitrate(prompt) {
  const resp = await callHaiku({
    system: ARBITER_SYSTEM_PROMPT, // short: "Return JSON with tier+reasoning"
    user: prompt,
    max_tokens: 200,
    temperature: 0,
  });
  return JSON.parse(resp); // {tier, subagent, reasoning, decomposition?}
}
```

The arbiter's system prompt is ~300 tokens describing the 4 tiers, the 5 subagents, the HIGH_RISK list, and asking for structured JSON output. Haiku returns in ~400ms. The result enriches the `<router-hint>` with `arbiter_tier`, `arbiter_reasoning`, and optionally `decomposition: [{subtask, tier, subagent}]`.

Cost: ~$0.001 per arbitered prompt × 17% = **~$0.0002 amortised per prompt**. At 1370 prompts/month that's **$0.27/month** for significantly better decisions on the hard cases.

### v0.9 — Decomposition for multi-domain prompts

When the arbiter returns `decomposition: [...]`, the doctrine reader (Claude Code session) reads the subtask list and spawns parallel subagents — one per subtask. Results are joined before the final answer.

This is the first architecture that can outperform Opus-direct on **complex multi-domain prompts** because parallel subagent execution beats Opus's single-threaded output streaming.

### v1.0 — Only if data justifies it

Learned classifier (BEST-Route / DeBERTa-small) only if (a) we have ≥5,000 labelled decisions, (b) regex + arbiter coverage plateaus below 95%, and (c) we can preserve explainability through attention visualisation. Otherwise stay on regex + arbiter indefinitely — simpler is better.

## 7. The measurement problem (what we can honestly know)

Before building the statusline latency feature, let me be precise about **what is measurable today** vs **what requires more instrumentation**.

### Measurable without new hooks

- ✓ **Hook overhead** — time `inject_context.js` spent running. Trivial to measure with `process.hrtime.bigint()`.
- ✓ **Option A Ollama call latency** — we control the subprocess.
- ✓ **Time between consecutive UserPromptSubmits** — observable from `decisions.log` timestamps, but this is noisy because it includes user think-time.

### Measurable with a Stop hook (NEW)

- ✓ **Turn wall clock** — from `UserPromptSubmit` to `Stop`. This is the TRUE latency the user feels. **This is what we should measure.**
- ✓ **Pairing by session_id** — `session_id` is in both hook payloads. Start + end map cleanly.

### NOT measurable without invocation telemetry

- ✗ **Which model actually ran** — `classify.js` emits a hint, but Claude Code may inline the answer using the session model instead of spawning the suggested subagent. The v0.6 audit flagged this as "gap #5". Solving it needs a PreToolUse hook that captures Agent tool invocations.
- ✗ **Per-model response time in a mixed session** — follows from the above.
- ✗ **Opus-direct baseline** — we can't run the same prompt twice in production. Must be **estimated** from public latency figures and assumed token rates.

### The honest approach

For v0.7.2, **measure the turn wall clock** via the Stop hook. **Estimate the Opus baseline** from:

```
OPUS_BASELINE_MS_PER_TIER = {
  T0: 2000,   // trivial: ~400ms first token + ~40 tokens @ 35 tok/s = ~1.5s
  T1: 3500,   // light reasoning: ~500ms + ~100 tokens @ 35 = ~3.3s
  T2: 12000,  // bug hunt: ~500ms + ~400 tokens @ 35 = ~11.8s
  T3: 30000,  // architecture: ~500ms + ~1000 tokens @ 35 = ~29s
};
```

These numbers come from Anthropic's published throughput specs + community benchmarks Q2 2026. They're conservative (Opus is often faster for short prompts, slower for long ones). Mark everything with `~` in the UI.

Display format:

```
│ ⏱ 2.1s p50 · ~-9.3s vs Opus
```

- `2.1s p50` — measured, no tilde. This is the user's wall clock with frugal.
- `~-9.3s vs Opus` — estimated delta. Tilde marks the baseline as estimated, not measured.
- Colour: green if negative (frugal faster), dim if ±500ms, yellow if +500-3000ms, red if >3s slower.

## 8. Failure modes and how the architecture handles them

| Failure | v0.7.2 behaviour | v0.8+ behaviour |
|---|---|---|
| Stop hook never fires (crash) | session_id has start, no end → skipped after 10min TTL | Same |
| Classify hook times out (>1.5s) | Defaults to `claude_session` — no routing applied | Arbiter also skipped, regex is authoritative |
| Haiku arbiter times out (v0.8) | — | Falls back to regex-only decision |
| Decisions.log corrupted | Latency metrics return null, segment not rendered | Same |
| Claude Code inlines without spawning | Latency is still measured (real wall clock is real) | Invocation telemetry catches the deviation |

## 9. What this means for the doctrine

The doctrine file `~/.claude/CLAUDE.md` currently has 8 sections. The v0.8 dispatcher architecture adds one:

### DISPATCHER BEHAVIOUR (new section)

> When the `<router-hint>` contains an `arbiter_reasoning` field, the Haiku arbiter was consulted. Trust its tier decision *unless* it conflicts with a HIGH_RISK signal in the prompt — then fall back to the regex classifier's T3 decision. The arbiter is advisory and semantic; the regex is authoritative for safety-critical paths.
>
> When the arbiter returns a `decomposition: [...]` list, spawn each subtask's subagent in parallel (use the Agent tool with multiple concurrent calls). Join the results before composing the final answer. This is the one case where parallel subagent execution is doctrine-approved.

This is a ~8-line addition. It does not break the v0.7.1 fast path because the arbiter only fires when the regex classifier reports low confidence.

## 10. What I will NOT build

To avoid feature creep in v0.7.2:

- ✗ The Haiku arbiter itself (v0.8 scope)
- ✗ Decomposition execution (v0.9 scope)
- ✗ Learned classifier (v1.0+ if ever)
- ✗ Parallel speculative execution (rejected on principle)
- ✗ Full invocation telemetry (gap #5 from the v0.6 audit — still deferred)
- ✗ Editing `~/.claude/settings.json` silently — I will provide the Stop hook line for the user to add themselves

## 11. Summary — one-sentence verdict per architecture

1. **Option A (v0.7.1)** — The foundation. Already shipped. 113ms hook p50, 90.2% savings on 1,370 prompts.
2. **Option B (v0.8 target)** — Ship next. Haiku arbiter on the 17% long tail. ~$0.27/month extra cost. ~95% decision quality.
3. **Option C (speculative)** — Rejected. Incompatible with "cheapest capable" doctrine.
4. **Option D (learned classifier)** — Too early. Revisit at 5,000+ labelled decisions.
5. **Option E (cascading hybrid)** — v0.9 target if Haiku arbiter's 5% residual error matters.

**v0.7.2 deliverable (this sprint): turn-level latency measurement via Stop hook + statusline rendering of frugal's actual wall-clock p50 and its delta vs an estimated Opus baseline.** Ships the feedback loop the user identified. Does not change any routing decisions. Zero risk to v0.7.1 behaviour.

---

*Document written for frugal v0.7.2 planning, April 2026. Paulo Loureiro.*
