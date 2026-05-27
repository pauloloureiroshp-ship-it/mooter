<div align="center">

# mooter

### The Claude Code router that knows when to save.

**Zero-proxy · Doctrine-based · Self-tuning · GPU-aware · Federated-learning foundation · ~90% cost savings validated on 1,437 real prompts**

[![Version](https://img.shields.io/badge/version-v0.10.1-blue.svg)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status: Private Beta](https://img.shields.io/badge/status-private%20beta-orange.svg)](#-access)
[![Savings](https://img.shields.io/badge/savings-~90%25-brightgreen.svg)](docs/REAL_CORPUS_VALIDATION.md)
[![Classifier latency](https://img.shields.io/badge/classifier-%3C50ms-blue.svg)](#how-the-classifier-works)
[![Tests](https://img.shields.io/badge/tests-62%2F62%20passing-brightgreen.svg)](tools/router/backtest.test.js)
[![Skills](https://img.shields.io/badge/skills-11%20built--in-blue.svg)](#slash-commands-10-built-in)
[![CI](https://github.com/pauloloureiroshp-ship-it/frugal/actions/workflows/test.yml/badge.svg)](.github/workflows/test.yml)

---

```
⬆ main·a1b2 │ 🐮 mooter v0.10.1 · 🐮 Moo · CrazyMoo · LazyMoo │ [T3] ops arch 2.5s │ qwen 61% · hku 22% · son 13% · ops 4% │ 💰 $12.80 (90%) │ 💻 RTX 4090 61% │ ●●◐○○○
```

*Your statusline after a day of work: git · 🐮 brand + mode trio · current tier + classify · tier distribution · savings + budget · GPU · provider availability. No router. No proxy. No extra bill.*

**Tier emojis** — 🏠 T0 (local) · 🌸 T1 (Haiku) · 🎵 T2 (Sonnet) · 💎 T3 (Opus)

</div>

---

## 🔒 Access

**This repository is private.** Access is by invitation only while mooter is in private beta.

If you want to try it, please see **[REQUEST_ACCESS.md](REQUEST_ACCESS.md)** — it's a two-line email. Paulo reviews requests weekly.

Why private? mooter is being validated on real production usage (including my own solo-founder workflow) before it's ready for a wider audience. Source code is shared with trusted testers under the MIT license — you can use it, fork it, modify it — but you need to be let in first. See [NOTICE.md](NOTICE.md) for the full rationale.

---

## The problem

You use Claude Code. You love it. Then you look at the bill and realise you've been burning **Opus** tokens on tasks a `sed` one-liner could have handled. Renaming a variable cost you $0.12. A commit message cost you $0.08. A typo fix cost you $0.15.

Claude Code gives you the smartest model in the world by default — but **smartest ≠ cheapest for every task**. You wouldn't drive a Ferrari to buy groceries.

Existing "routers" for LLMs solve this with **proxies**: they sit between your client and Anthropic, intercepting requests and forwarding them to different providers. This creates:

- Extra latency (every request hops through a middleman)
- A single point of failure (proxy dies, Claude Code dies)
- Deployment complexity (Docker, ports, config files)
- Opaque behaviour (what did the proxy decide? why?)
- Vendor lock-in to whatever proxy service you chose

**mooter takes a different approach.**

---

## The approach — *doctrine, not proxy*

mooter doesn't intercept anything. It teaches Claude Code itself when to reach for Opus and when to delegate to Ollama, Haiku, or Sonnet. It does this through three mechanisms that work together:

1. **A classifier hook** (`inject_context.js` + `classify.js`) runs on every prompt before Claude Code processes it. Pure regex, <50 ms, zero LLM cost. It emits a `<router-hint>` with a recommended tier (T0/T1/T2/T3) and confidence score.

2. **A mediator doctrine** (`~/.claude/CLAUDE.md`) is a 165-line set of rules Claude Code reads at session start. It teaches the session how to interpret the hint, when to escalate, when to refuse, and which subagent to spawn for each tier.

3. **Subagents for each tier** — `local-summarizer` (Ollama), `cheap-triage` (Haiku), `model-reasoner` (Sonnet), `model-architect` (Opus), `final-reviewer` (Opus). Claude Code spawns them natively via the Agent tool. No ports. No external processes. No lock-in.

**The result:** Claude Code itself decides, on every prompt, which model is the cheapest capable tool for the job. The decision is explainable (the classifier returns a `reasoning` field), reversible (edit one file to override), and auditable (every decision is logged to `decisions.log`).

And because it's doctrine and not a proxy, **if mooter dies, Claude Code still works**. It falls back to default behaviour. Zero blast radius.

---

## Self-tuning loop (new in v0.5)

mooter now learns from its own decisions. Every night at 02:00, a scheduled task runs:

```
decisions.log ──► backtest.js ──► router-tuning.json ──► update-router.js ──► classify.js
     │                │                   │                       │                 │
     │          analyzes 24h          proposes new             patches the       reads TUNED
     │          of routing            regex patterns           classifier        block at
     │          decisions             + threshold              idempotently      runtime
     │                                                                           
     └─────────────────────── grows smarter without human input ─────────────────►
```

**What the backtest detects:**

- **Over-routing:** short prompts (<50 chars) consistently sent to T2/T3 — almost always noise that belongs on T0.
- **Noise signatures:** repeated prompt signatures (e.g. `"task notification"`) that cost Opus tokens 3+ times for zero value.
- **Stuck ambiguity:** prompts with `confidence < 0.6` landing on high tiers without evidence of risk.

**What it emits:**

```json
{
  "complexity_threshold": 0.25,
  "promote_to_t0_patterns": ["/\\bok\\s+vamos\\b/i"],
  "demote_from_t3_patterns": ["/\\bdecompõe\\s+o\\s+sprint\\b/i"],
  "notes": [
    "Analysed 60 prompts.",
    "Short prompts on high tier: 8 (13.3%).",
    "Estimated additional savings if patterns demoted: $0.0490."
  ]
}
```

**What the runtime does with it:** `classify.js` reads the `TUNED_DEMOTE_T3`, `TUNED_PROMOTE_T0`, and `TUNED_COMPLEXITY_THRESHOLD` constants from an auto-generated block. Two passes (demote then promote) check the current prompt against the tuned regex list. **A hard guardrail (`high === 0`)** ensures no prompt with HIGH_RISK signals (push, deploy, migration, secret, architect, merge, CI...) is ever downgraded, regardless of what the backtest learned. The guardrail is dual-enforced — both at runtime in `classify.js` *and* upstream in `backtest.js` so bad patterns never even enter the tuning file.

**Slash command:** Paulo can force a retune at any time with `/update-router` — Claude Code runs the backtest and applies the patch in one step.

---

## At a glance

| Metric | Value |
|---|---|
| Prompts validated (v0.3) | 1,370 real prompts |
| T0 routing (free/local) | 83.9% |
| T2 routing (Sonnet) | 12.4% |
| T3 routing (Opus) | 3.6% |
| Hook p50 (v0.7) | 113ms (was ~3s pre-v0.7) |
| Classifier latency | <50ms (regex, zero LLM) |
| Low-confidence rate | 2.0% |
| **Advisory savings vs naive Opus** | **~78-90%** (see methodology below) |
| Guaranteed savings (Option-A hits) | measured per-session |
| Cost model | token-estimated, [see `docs/COST_MODEL.md`](docs/COST_MODEL.md) |
| Unit tests (loop + cost model) | **59/59** passing (`node:test`) |
| Projects validated on | marleyliving (CRM), cloude-home, misc |

---

## Who is this for?

| Persona | Why mooter helps |
|---|---|
| **Solo founders** burning Claude Code credits on trivial work | 90% savings on a $200/mo budget = $180 back |
| **Small teams** sharing a company Anthropic account | Consistent routing across developers, visible spend per tier |
| **Open-source maintainers** using Claude Code in CI | Cap runaway agents at T2 automatically via the budget guardrail |
| **Researchers & tinkerers** who want a transparent, regex-based router | Every decision is explainable in <10 lines of code |
| **Budget-conscious devs** on the Anthropic 5-hour OAuth plan | Live statusline shows your budget burn in real time |

It is **not** for: production AI workloads where latency matters more than cost, or teams that need a hosted multi-tenant router. mooter is single-user, local, and opinionated.

---

## Architecture (60-second tour)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Claude Code session                            │
│                                                                         │
│   user prompt                                                           │
│       │                                                                 │
│       ▼                                                                 │
│   UserPromptSubmit hook ──► inject_context.js ──► classify.js           │
│                                                        │                │
│                                                        │ <50ms, regex   │
│                                                        ▼                │
│                                              <router-hint> injected     │
│                                                        │                │
│                                                        ▼                │
│   Claude Code reads ~/.claude/CLAUDE.md (doctrine)                      │
│                                                        │                │
│                                                        ▼                │
│   Session decides: inline, or spawn which subagent?                     │
│       │                                                                 │
│       ├─► local-summarizer   (Ollama, T0)                               │
│       ├─► cheap-triage        (Haiku,  T1)                              │
│       ├─► model-reasoner      (Sonnet, T2)                              │
│       ├─► model-architect     (Opus,   T3)                              │
│       └─► final-reviewer      (Opus,   pre-merge gate)                  │
│                                                                         │
│   Every decision → decisions.log                                        │
│   Every tool call → execution.log  (exec-logger PostToolUse hook)       │
└───────────────────────┬─────────────────────────────────────────────────┘
                        │
                        │ 02:00 daily (Windows Task Scheduler)
                        ▼
            backtest.js → router-tuning.json → update-router.js
                        │                                 │
                        │                                 │
                        └──── next prompt uses new rules ─┘
```

For a deeper walkthrough see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Provider tiers

| Tier | Provider | Cost/prompt | When it's used |
|---|---|---|---|
| **T0-general** | Ollama (qwen3:30b) | Free | Summaries, brainstorm, translations, docs |
| **T0-code** | Ollama (qwen2.5-coder:7b) | Free | Formatting, renaming, commit messages, trivial edits |
| **T0-math** | Ollama (qwen2-math:7b) | Free | Calculations, data transforms, regex |
| **T1** | Claude Haiku | ~$0.001 | Light code, explanations, translations, regex |
| **T2** | Claude Sonnet, Codex CLI | ~$0.01 | Features, debugging, refactors, planning |
| **T3** | Claude Opus | ~$0.05 | Architecture, multi-file refactors, final review, anything touching secrets/prod |

Want to swap providers? See [docs/MODEL_MAPPING.md](docs/MODEL_MAPPING.md).

---

## Budget guardrail

mooter reads your Anthropic OAuth usage and caps the maximum tier dynamically:

| 5-hour usage | Max tier | Effective ceiling |
|---|---|---|
| 0–50% | T3 | Full routing (Opus allowed) |
| 50–70% | T2 | Sonnet max, Opus blocked |
| 70–85% | T1 | Haiku max |
| 85–95% | T0 | Local / free only |
| >95% | T0 | Hard block on all paid tiers |

Runs every 2 hours in the background, displayed in the statusline as `5h:37% ↺2h14m`.

---

## Setup

**TL;DR** (once you have access — see [REQUEST_ACCESS.md](REQUEST_ACCESS.md)):

```bash
# macOS / Linux
curl -fsSL https://mooter.ai/install.sh | bash

# Windows (PowerShell)
irm https://mooter.ai/install.ps1 | iex
```

Or, from a cloned repo:

```bash
git clone git@github.com:pauloloureiroshp-ship-it/frugal.git
cd frugal
bash install.sh           # macOS / Linux
.\install.ps1             # Windows
```

Requirements:

- Claude Code (latest)
- Node.js 18+
- [Ollama](https://ollama.ai) with a model installed (optional — falls back to Haiku if missing)
- Anthropic API key (optional — only needed for the T1 Haiku direct path)

---

## Roadmap

See **[ROADMAP.md](ROADMAP.md)** for the full version timeline, completed work, and deferred items.

| Version | Status | Highlights |
|---|---|---|
| v0.1.0 | ✅ Released | classify.js v1, 6 subagents, routing docs |
| v0.2.0 | ✅ Released | Mediator doctrine, stats.js, benchmark.sh |
| v0.3.0 | ✅ Released | replay.js, 1,370-prompt validation, 90.2% savings |
| v0.4.0 | ✅ Released | Statusline OAuth, budget guardrail, multi-provider |
| v0.5.0 | ✅ Released | Auto-learning loop: backtest, TUNED wire-up, 11 tests, pct_by_model |
| v0.6.0 | ✅ Released | Honest numbers: token cost model, BRL/EUR/GBP, guaranteed vs advisory savings |
| v0.6.1 | ✅ Released | In-prompt user override (`usa o opus`, `@sonnet`, `force ollama`, `sem opus`) + HIGH_RISK guardrail on downgrades, 25 tests |
| v0.7.0 | ✅ Released | Hook p50 3s→113ms (classify cache + async budget + Ollama warmup), quality-intent detection, T0 sub-tier specialists |
| v0.7.1 | ✅ Released | Provider availability indicator in statusline (Claude/Ollama/Gemini/GPT live/dim dots) |
| v0.7.2 | ✅ Released | Turn-latency measurement via Stop hook + ~Opus baseline estimate in statusline + dispatcher architecture analysis |
| **v0.8.0** | ✅ **Released** | **Haiku arbiter for ambiguous prompts (~17% long tail) — semantic understanding, HIGH_RISK dual-enforced, 56 tests, ~$0.27/mo extra cost for ~95% decision quality** |
| v0.9.0 | 🟡 Planned | Parallel decomposition execution (arbiter already returns `decomposition` array, wire it to parallel subagent spawns) + arbiter metrics in statusline |
| v1.0 | 🟡 Planned | Learned classifier (BERT/DeBERTa-small) if corpus justifies it; public launch |
| v1.0 | 🔵 Planned | Public launch, plugin marketplace, MCP integration |

---

## Slash commands (10 built-in)

| Command | What it does |
|---|---|
| `/mooter-status` | Health check: hook active, Ollama live, hub reachable, last 5 decisions |
| `/mooter-savings` | Economic report: session savings, projected annual, tier distribution |
| `/mooter-route <task>` | Classify any task description before running it |
| `/mooter-summary` | What the router decided this session (full breakdown) |
| `/mooter-update` | Pull from GitHub + sync classifier (idempotent) |
| `/mooter-beast` | Beast Mode: forces T3 (Opus) on everything until reset |
| `/mooter-zen` | Zen Mode: caps at T1 (Haiku/Ollama) — great for focused writing |
| `/mooter-auto` | Resets to intelligent auto-routing |
| `/mooter-hello` | Onboarding walkthrough for first-time users |
| `/mooter-doctor` | Full system diagnostic: hooks, models, log permissions, --fix mode |

---

## Dynamic model pins — `/mooter-<model>`

Beyond the fixed commands above, mooter **generates one slash command per model you can actually reach**, discovered from your detected subscriptions. Run `mooter doctor` (or `mooter init`) to (re)generate them; they update automatically when a subscription appears or is revoked.

For an Anthropic subscription you get:

| Command | Pins | Tier | Subagent |
|---|---|---|---|
| `/mooter-opus-4-7` | Opus 4.7 | T3 | model-architect |
| `/mooter-opus-4-6` | Opus 4.6 | T3 | model-architect |
| `/mooter-sonnet-4-6` | Sonnet 4.6 | T2 | model-reasoner |
| `/mooter-haiku-4-5` | Haiku 4.5 | T1 | cheap-triage |

Type `/mooter-sonnet-4-6 <your prompt>` to pin Sonnet 4.6 **for that one message** — the next message returns to automatic routing. A pin that would *downgrade* a high-risk prompt (deploy / migration / secret) below its safety floor is refused, same as the router's own guardrail.

### Non-Anthropic providers (Codex, OpenAI, Ollama)

If mooter detects a ChatGPT subscription (Codex CLI), an `OPENAI_API_KEY`, or a local Ollama install, it also generates pins for those — e.g. `/mooter-codex`, `/mooter-openai-gpt-5-4`, `/mooter-qwen3-30b` (one per installed Ollama chat model).

> **⚠️ Honest UX caveat.** Claude Code's session host is Claude, not the pinned model. A non-Anthropic pin therefore runs `router-execute.js` under the hood and the reply comes back as a **tool result the agent relays** — not as a native answer from the model. It works, but it reads as quoted output rather than the model "speaking" directly. (Anthropic pins above don't have this — they dispatch to a native subagent.)

- **Single-message scope**, same as Anthropic pins.
- **No silent fallback** — if the pinned provider has no quota or fails, you get the error, never a quiet switch to a different model.
- See per-provider cost / quota any time:

  ```bash
  cat ~/.claude/tools/router/quota-state.json | jq .providers.openai_codex_cli
  ```

---

## mooter-doctor

`mooter-doctor.js` is a cross-platform diagnostic tool that runs 12 health checks and can auto-fix common issues:

```bash
node ~/.claude/hooks/mooter-doctor.js          # diagnose
node ~/.claude/hooks/mooter-doctor.js --fix    # diagnose + repair
```

Checks: hook registration in settings.json, Ollama reachability, GPU probe, decisions.log write permission, exec-logger presence, statusline segments, CLAUDE.md doctrine version, hub connectivity, and more.

---

## Documentation

| Doc | Purpose |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Deep dive into the technical design and rationale |
| [ROADMAP.md](ROADMAP.md) | Version history and what's next |
| [SETUP.md](INSTALL.md) | Install, configure, verify |
| [REQUEST_ACCESS.md](REQUEST_ACCESS.md) | How to request access to the private repo |
| [CONTRIBUTING.md](CONTRIBUTING.md) | For approved contributors |
| [SECURITY.md](SECURITY.md) | Vulnerability disclosure policy |
| [CHANGELOG.md](CHANGELOG.md) | Full version history |
| [NOTICE.md](NOTICE.md) | Legal + commercial intent |
| [docs/ROUTING_POLICY.md](docs/ROUTING_POLICY.md) | Complete tier routing rules |
| [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md) | Request lifecycle diagram |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | What mooter does *not* do |
| [docs/REAL_CORPUS_VALIDATION.md](docs/REAL_CORPUS_VALIDATION.md) | The 1,370-prompt benchmark |
| [docs/MODEL_MAPPING.md](docs/MODEL_MAPPING.md) | How to swap providers |
| [docs/COST_MODEL.md](docs/COST_MODEL.md) | How v0.6 measures savings (token-estimated) |
| [AUDIT.md](AUDIT.md) | The 13-gap audit that drove v0.6 |
| [PRIVACY.md](PRIVACY.md) | What data is collected and what stays local |
| [ONBOARDING_GUIDE.md](docs/ONBOARDING_GUIDE.md) | 5-minute install guide for Mac and Windows |

**Landing page:** [landing-five-azure-16.vercel.app](https://landing-five-azure-16.vercel.app)

---

## License

MIT — see [LICENSE](LICENSE). See [NOTICE.md](NOTICE.m