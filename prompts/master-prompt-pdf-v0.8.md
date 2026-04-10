# Master prompt — generate a showcase PDF for frugal v0.8.0

> **How to use**: copy everything between the two `---` markers below, paste into a new conversation at **claude.ai** (prefer Opus 4.6 for quality), and Claude will return a ~18-page markdown document. Render to PDF via:
>
> ```bash
> pandoc output.md -o frugal-whitepaper.pdf --pdf-engine=xelatex \
>   -V mainfont="Helvetica Neue" -V geometry:margin=1in \
>   -V fontsize=10pt --highlight-style=tango --toc
> ```

---

# MASTER PROMPT — frugal v0.8.0 investor-and-engineer whitepaper

You are producing a polished, print-ready **technical whitepaper** for frugal, a Claude Code cost-optimisation router + dispatcher built by Paulo Loureiro (solo founder, Lisbon, Portugal). The output must be a single long markdown document that can be rendered directly to PDF via Pandoc/Typst without further editing. Optimise for visual hierarchy, technical rigour, and quiet confidence. No marketing fluff. No emoji except when they're in the source material.

## Product context

Paulo builds with Claude Code as primary tool. frugal is his personal router, validated on 1,370 real production prompts from his own history. Previously built Cloude Home (AI home hub) and Cloude Speaker (webapp). frugal is currently **v0.8.0**, private beta, MIT-licensed but invite-only.

## Audience

Technical founders, engineers evaluating multi-model routing for their own tooling, and potential early adopters. Readers should finish the document understanding: what it is, why it exists, how it works algorithmically, what real problem it solves, and why the approach is genuinely different from the ~7 proxy-based competitors.

## Hard constraints

1. **Language**: English primary.
2. **Tone**: Terse, confident, understated. Numbers first, narrative second. No "revolutionary", "game-changing", "cutting-edge".
3. **Structure**: `#` / `##` / `###` hierarchy, tables for numeric data, fenced code blocks for algorithms, mermaid or ASCII diagrams for architecture.
4. **Length**: 16-22 pages when rendered. Dense but scannable.
5. **Diagrams**: Mermaid preferred; ASCII fallback if the renderer doesn't support it.
6. **Code blocks**: Include 3-4 real code excerpts from v0.7/v0.8 — the classify.js quality-intent regex, the disk cache lookup, the dual-enforce HIGH_RISK pattern, and the Haiku arbiter JSON schema.
7. **Footer**: every page shows "frugal v0.8.0 · April 2026 · Paulo Loureiro · Private Beta".
8. **Cover**: title, subtitle, the three headline numbers (**90.2% savings**, **113ms hook p50**, **56/56 tests**), signature line.

## Mandatory sections

### 1. Executive Summary (1 page)

- frugal in one sentence
- Three headline numbers: **90.2% cost savings** (validated on 1,370 real prompts), **113ms p50 hook latency** (v0.7), **56/56 tests passing** (v0.8)
- Unique positioning: "doctrine, not proxy" + new in v0.8: "three-layer cascade dispatcher with Haiku semantic arbiter"
- Version status: v0.8.0 shipped April 2026

### 2. The Problem (1 page)

- Claude Code defaults to Opus 4.6 for every prompt regardless of difficulty
- Real-world mix: 83.9% of prompts are trivial but pay Opus rates
- Existing routers (RouteLLM, LiteLLM, Portkey, Martian, NotDiamond) solve this with **proxies** → latency, single point of failure, deployment complexity, vendor lock-in
- Cost at $200/month solo-founder scale: ~$140-180 is Opus tokens on tasks a $0 model could handle
- Additional insight: **cheaper Claude models are often ALSO faster** because they output fewer tokens at higher stream rates — so routing down is win-win-win on cost/speed/energy

### 3. Philosophy — Doctrine, Not Proxy (1 page)

- frugal never intercepts LLM traffic. It teaches Claude Code *itself* when to reach for cheaper models.
- Three mechanisms:
  1. Classifier hook (`inject_context.js` + `classify.js`) — pure regex, <50ms, zero LLM cost
  2. Mediator doctrine (`~/.claude/CLAUDE.md`) — rules the session reads at startup
  3. Native Claude Code subagents — dispatched via the Agent tool, no external processes
- If frugal dies, Claude Code still works.

### 4. Architecture — the v0.8 three-layer cascade (3 pages with diagrams)

Include a mermaid flowchart showing:

```
user prompt → UserPromptSubmit hook → inject_context.js
                                              ↓
                                     ┌────────┴─────────┐
                                     │ Layer 1: Regex   │
                                     │ classify.js      │
                                     │ (50ms, zero LLM) │
                                     └────────┬─────────┘
                                              ↓
                              ┌───────────────┴──────────────┐
                              │                               │
                        confident                          ambiguous
                        (>=0.75)                          (<0.75 OR
                              │                          ambiguous_*)
                              │                               │
                              │                               ↓
                              │                     ┌─────────────────┐
                              │                     │ Layer 2: Haiku  │
                              │                     │ arbiter (v0.8)  │
                              │                     │ 400ms, $0.001   │
                              │                     └────────┬────────┘
                              │                               │
                              └──────────┬────────────────────┘
                                         ↓
                               <router-hint> emitted
                                         ↓
                  Claude Code reads ~/.claude/CLAUDE.md (doctrine)
                                         ↓
                  spawn: local-summarizer | cheap-triage |
                         model-reasoner | model-architect |
                         final-reviewer
```

Then the four modules map:

| Layer | File | Cost | Latency | Coverage |
|---|---|---:|---:|---:|
| 1. Regex classifier | `classify.js` | $0 | 2-10ms | ~83% confident |
| 2. Haiku arbiter | `arbiter.js` (v0.8) | ~$0.001 | ~400ms | ~17% long tail |
| 3. Doctrine reader | `~/.claude/CLAUDE.md` | $0 | 0ms | 100% |
| 4. Subagent dispatch | Agent tool | varies | varies | 100% |

### 5. The Five Tiers + T0 Sub-tier Specialists (1 page)

| Tier | Provider | Cost / turn | Speed | When |
|---|---|---:|---:|---|
| **T0-general** | Ollama qwen2.5:3b | $0 | ~2-5s | Summarisation, trivial transforms |
| **T0-code** | Ollama qwen2.5-coder:14b-q4 | $0 | ~3-8s | Explain code, regex, simple refactors |
| **T0-math** | Ollama deepseek-r1-distill-qwen:14b | $0 | ~3-8s | Equations, proofs, step-by-step |
| **T1** | Claude Haiku 4.5 | ~$0.001-0.01 | ~1-2s | Commit messages, docstrings, regex |
| **T2** | Claude Sonnet 4.6 | ~$0.05-0.30 | ~2-5s | Bug investigation, refactoring |
| **T3** | Claude Opus 4.6 | ~$0.50-5.00 | ~15-60s | Architecture, critical changes |

Include the content-based sub-tier routing regex from `classify.js`.

### 6. The Classifier Algorithm (2 pages)

Explain the 11-pass pipeline in `classify.js`:

1. SHA-256 disk cache lookup (v0.7)
2. Fast-path early exits (bash paste, file read intent)
3. HIGH_RISK hit count (push/deploy/secret/migration/...)
4. MED_RISK hit count
5. LOW_RISK hit count
6. TRIVIAL hit count
7. Main decision tree
8. Low-confidence escalation guardrail
9. TUNED demote/promote passes (auto-learning from backtest)
10. Quality intent detection (v0.7 — 20 natural-language patterns)
11. User override detection (v0.6.1 — @opus, usa sonnet, sem opus)

Include the actual QUALITY_INTENT_PATTERNS code excerpt (10 lines).

### 7. The Haiku Arbiter — v0.8 semantic layer (2 pages)

This is the new capability. The arbiter reads the prompt with real semantic understanding when the regex can't decide. Key points:

- Fires **only** when confidence <0.75 OR task_category is ambiguous_*
- Uses Haiku 4.5 (cheapest capable model) with a ~320-token system prompt
- Returns strict JSON: `{tier, subagent, reasoning, decomposition?}`
- Cached forever by `SHA256(prompt + system_version)` in `.arbiter-cache.json`
- **Dual-enforced HIGH_RISK guardrail** — cannot downgrade a prompt matching the high-risk hint
- Fails silently to regex on any error (timeout, API down, parse error)

Include the arbiter system prompt verbatim (it's the product's IP in one block).

Economics table:

| Metric | Value |
|---|---:|
| Ambiguous prompt ratio (measured on 1,370 corpus) | ~17% |
| Cost per arbiter call (Haiku rates) | ~$0.001 |
| Amortised extra cost per prompt | ~$0.0002 |
| Expected decision quality uplift | 84% → 95% |
| Latency added on ambiguous prompts | +400ms |
| Latency added on confident prompts (83% fast path) | 0ms |
| Extra cost per month (solo-founder workload) | ~$0.27 |

### 8. Validation — 1,370 Real Prompts (2 pages)

> Not a benchmark on hand-picked prompts. The **entire user history** from `~/.claude/history.jsonl`, every prompt Paulo actually typed over months, replayed through the classifier with zero cherry-picking.

| Metric | Value |
|---:|---:|
| Total prompts replayed | **1,370** |
| Projects represented | 3 (marleyliving CRM, cloude-home, misc) |
| Tier T0 (local Ollama) | **83.9%** |
| Tier T2 (Sonnet) | 12.4% |
| Tier T3 (Opus) | **3.6%** |
| Low-confidence rate | 2.0% (down from 27% in v1) |
| Projected mediator cost | **$1.21** |
| Projected naive Opus cost | $12.33 |
| **Projected savings** | **$11.12 (90.2%)** |

Then the v0.6 honest-numbers audit — the 13 gaps that corrected the cost model from flat-per-tier to token-based. Reference `AUDIT.md`.

### 9. Performance — v0.7 Latency Sprint (1 page)

Before/after table:

| Stage | v0.6.1 blocking ms | v0.7 blocking ms |
|---|---:|---:|
| Tracker health check | 0-500 | 1-3 (pid stat) |
| classify.js spawn | 50-200 | 5-10 (cache hit) |
| Budget OAuth fetch | 0-3000 | 0-1 (async) |
| Option A Ollama | 0-9000 | 0-2000 (warm) |
| **p50 measured** | ~3000 | **113** |
| **p95 measured** | — | **407** |
| **p99 measured** | — | **1846** |

Explain the four fixes: cross-session classify cache, async budget refresh, Ollama keep-alive warmup, Option A timeout cut.

### 10. Turn Latency Measurement — v0.7.2 (1 page)

The honest measurement loop. Closes the "how much slower than Opus is this actually?" question the user asked.

- Stop hook `gsd-turn-end.js` fires when Claude Code finishes a turn
- Pairs with `classified` events from `inject_context.js` by `session_id`
- Computes p50/p95/avg wall-clock turn duration (measured)
- Compares against an **estimated** Opus baseline per tier (T0: 6s, T1: 10s, T2: 26s, T3: 51s — derived from Anthropic Q2 2026 throughput specs)
- Displays in the statusline: `⏱ 2.5s p50 · ~-23.7s vs Opus`
- The `~` on the delta marks it as estimated, the p50 has no tilde because it's measured
- Colour: green if frugal is faster, dim if equal, yellow/red if slower

**Key finding**: frugal is almost always FASTER than Opus-direct because cheaper Claude models output fewer tokens at higher stream rates. The statusline proves it with green numbers.

### 11. The Dispatcher Architecture Roadmap (1 page)

Include the five candidate architectures table:

| Architecture | Cost/turn | Latency OH | Quality | Decompose | Verdict |
|---|---:|---:|---:|---|---|
| A. Status quo (regex only) | $0 | 0ms | 84% | no | **v0.7.1 baseline** |
| B. Haiku arbiter on ambiguous | $0.0002 | +70ms avg | 95% | yes | **v0.8 (shipped)** |
| C. Parallel speculative | 2× base | -40% | 99% | no | **Rejected** (kills USP) |
| D. Learned classifier | $0 | +30ms | ~90% | optional | Premature (v1.0+) |
| E. Cascading hybrid | $0.0003 | +150ms | 98% | yes | v0.9 target |

Evolution path:

```
v0.7.0 (shipped) → v0.7.1 (providers) → v0.7.2 (latency) 
                      → v0.8.0 (arbiter — SHIPPED)
                      → v0.9.0 (parallel decomposition)
                      → v1.0 (learned classifier if data justifies)
```

### 12. Statusline — the Full Story (1 page)

Show the actual rendered statusline as a single line, then explain each segment:

```
⬆ /gsd-update │ Opus 4.6 │ frugal ██░░ 24% │ 💰 $12.80 (79%) │ Ollama:60% Sonnet:23% Opus:17% │ ⏱ 2.5s p50 · ~-23.7s vs Opus │ ⚡ Claude● Ollama● Gemini○ GPT●
```

Segments:
- Context bar (Claude Code native)
- **Savings** (v0.6) — `$` in USD with `~` if advisory, no `~` if guaranteed via Option A. Dual-currency when `FRUGAL_CURRENCY=BRL/EUR/GBP`
- **Per-model breakdown** — Ollama / Haiku / Sonnet / Opus percentages
- **Latency** (v0.7.2) — measured p50 + estimated Opus delta
- **Provider availability** (v0.7.1) — which backends are live (green), degraded (yellow), or off (dim)

### 13. Who This Is For (1 page)

| Persona | Pain | How frugal helps |
|---|---|---|
| Solo founders on $200/mo Claude Code budget | $140-180 is Opus tokens on trivial tasks | 90% routes to free/cheap models |
| Small teams sharing a company Anthropic account | No per-user visibility | Statusline + decisions.log give per-session spend |
| Open-source maintainers running Claude Code in CI | Runaway agents burn credits | Budget guardrail caps tier based on 5h OAuth usage |
| Researchers / tinkerers | Proxy routers are opaque black boxes | 700 lines of auditable regex, every decision has a reasoning field |
| Budget-conscious devs on OAuth plan | No real-time feedback | Live statusline shows USD/BRL/EUR/GBP |

### 14. Why Genuinely Different (1 page)

Every major LLM-routing competitor is a **proxy**: RouteLLM, LiteLLM, Portkey, Martian, NotDiamond, OpenRouter, Claude Code Router (community). They intercept API calls. frugal is the only major player in the "hint layer, not control layer" category.

The consequence:
- Zero blast radius (frugal dies, Claude Code works)
- Transparent (every decision has a `reasoning` field)
- Auditable (regex + arbiter system prompt, no hidden ML model)
- Composable (markdown doctrine, git-versioned, editable per-project)
- Anthropic-native (built on Claude Code's own hooks + Agent tool, no SDK)

The trade-off: frugal can only nudge, never enforce. It relies on the Claude Code session honouring the doctrine. In practice (dogfooded daily) the session honours it because the doctrine file is treated as system-level context.

### 15. Code Specimens (1-2 pages)

Four verbatim, language-tagged excerpts:

**15.1 — Quality intent regex family (excerpt)** — 10 lines showing PT-PT + EN

**15.2 — Cross-session classify cache lookup** — 10 lines showing the hash + LRU + invalidation

**15.3 — HIGH_RISK dual-enforce pattern from backtest.js** — 10 lines showing the upstream filter that prevents bad patterns from entering the tuning file

**15.4 — Haiku arbiter system prompt (v0.8)** — the full 40-line system prompt that drives the arbiter — this is the product's semantic IP in one block

### 16. Failure Modes (1 page)

Table of what happens when things break. Every answer is "the hook fails open":

| Failure | Impact | Fallback |
|---|---|---|
| classify.js times out (>1500ms) | None | Hook exits 0, Claude Code runs default |
| arbiter times out (v0.8) | None | Falls back to regex decision |
| ANTHROPIC_API_KEY absent | Arbiter skipped | Regex is authoritative |
| Ollama not installed | Option A miss | Claude Code runs normal model |
| .credentials.json expired | Budget fetch returns null | No tier cap applied, hook continues |
| router-tuning.json corrupted | TUNED arrays empty | Base heuristics used |
| Sub-tier specialist not installed | Ollama 404 | check-local-models.js surfaces the pull command |
| Disk full | Cache writes fail | Next prompt hits classifier fresh |

### 17. Roadmap (half page)

| Version | Status | Highlights |
|---|---|---|
| v0.1-0.5 | Released | Foundations, 1,370-prompt validation, 90.2% savings |
| v0.6 | Released | Honest token-based cost model, BRL/EUR/GBP |
| v0.6.1 | Released | User override (@opus, usa sonnet, sem opus) |
| v0.7.0 | Released | Latency sprint (p50 3s→113ms), quality intent, T0 sub-tier |
| v0.7.1 | Released | Provider availability indicator |
| v0.7.2 | Released | Turn-latency measurement + Opus baseline estimate |
| **v0.8.0** | **Released** | **Haiku arbiter for ambiguous prompts (dispatcher v1)** |
| v0.9.0 | Planned | Parallel decomposition execution |
| v1.0 | Planned | Public launch + optional learned classifier |

### 18. Closing (half page)

Deliver the one-sentence thesis: **frugal exists because the single most expensive question in Claude Code is "which model?", and every existing answer to that question was either manual or proxy-based — neither fit the workflow of a solo developer running Claude Code dozens of times per hour.** The doctrine-based approach is a third option: teach the tool itself when to reach for Opus.

Closing numbers:
- 90.2% savings on 1,370 real prompts
- 113ms hook p50 (v0.7)
- 56/56 tests passing (v0.8)
- 4 versions shipped in April 2026 alone
- Used in production daily
- MIT-licensed, private beta, request access via `REQUEST_ACCESS.md`

---

**End of master prompt.** Now produce the full markdown document in your next response, using sections 1-18 as the mandatory structure. Include all tables verbatim. Include all four code excerpts verbatim. Use mermaid where the renderer supports it. Do not summarise; expand. The output should be a single markdown document ready for `pandoc → PDF` without further editing.
