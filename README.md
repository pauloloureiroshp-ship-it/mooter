<div align="center">

# frugal

### The Claude Code router that knows when to save.

**Zero-proxy · Doctrine-based · Self-tuning · 90.2% cost savings validated on 1,370 real prompts**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status: Private Beta](https://img.shields.io/badge/status-private%20beta-orange.svg)](#-access)
[![Savings](https://img.shields.io/badge/savings-90.2%25-brightgreen.svg)](docs/REAL_CORPUS_VALIDATION.md)
[![Classifier latency](https://img.shields.io/badge/classifier-%3C50ms-blue.svg)](#how-the-classifier-works)
[![Tests](https://img.shields.io/badge/tests-11%2F11%20passing-brightgreen.svg)](tools/router/backtest.test.js)

---

```
⬆ /gsd-update │ Opus 4.6 │ cloude-home █░░░░░░░░░ 14% │ 💰 $1.73 (77%) │ Ollama:62% Sonnet:18% Opus:20%
```

*Your statusline after a day of work. No router. No proxy. No extra bill.*

</div>

---

## 🔒 Access

**This repository is private.** Access is by invitation only while frugal is in private beta.

If you want to try it, please see **[REQUEST_ACCESS.md](REQUEST_ACCESS.md)** — it's a two-line email. Paulo reviews requests weekly.

Why private? frugal is being validated on real production usage (including my own solo-founder workflow) before it's ready for a wider audience. Source code is shared with trusted testers under the MIT license — you can use it, fork it, modify it — but you need to be let in first. See [NOTICE.md](NOTICE.md) for the full rationale.

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

**frugal takes a different approach.**

---

## The approach — *doctrine, not proxy*

frugal doesn't intercept anything. It teaches Claude Code itself when to reach for Opus and when to delegate to Ollama, Haiku, or Sonnet. It does this through three mechanisms that work together:

1. **A classifier hook** (`inject_context.js` + `classify.js`) runs on every prompt before Claude Code processes it. Pure regex, <50 ms, zero LLM cost. It emits a `<router-hint>` with a recommended tier (T0/T1/T2/T3) and confidence score.

2. **A mediator doctrine** (`~/.claude/CLAUDE.md`) is a 165-line set of rules Claude Code reads at session start. It teaches the session how to interpret the hint, when to escalate, when to refuse, and which subagent to spawn for each tier.

3. **Subagents for each tier** — `local-summarizer` (Ollama), `cheap-triage` (Haiku), `model-reasoner` (Sonnet), `model-architect` (Opus), `final-reviewer` (Opus). Claude Code spawns them natively via the Agent tool. No ports. No external processes. No lock-in.

**The result:** Claude Code itself decides, on every prompt, which model is the cheapest capable tool for the job. The decision is explainable (the classifier returns a `reasoning` field), reversible (edit one file to override), and auditable (every decision is logged to `decisions.log`).

And because it's doctrine and not a proxy, **if frugal dies, Claude Code still works**. It falls back to default behaviour. Zero blast radius.

---

## Self-tuning loop (new in v0.5)

frugal now learns from its own decisions. Every night at 02:00, a scheduled task runs:

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
| Classifier latency | <50ms (regex, zero LLM) |
| Low-confidence rate | 2.0% |
| **Savings vs naive Opus** | **90.2%** |
| Mediator cost (1,370 prompts) | $1.21 |
| Naive Opus cost (same prompts) | $12.33 |
| Unit tests (auto-learning loop) | 11/11 passing (`node:test`) |
| Projects validated on | marleyliving (CRM), cloude-home, misc |

---

## Who is this for?

| Persona | Why frugal helps |
|---|---|
| **Solo founders** burning Claude Code credits on trivial work | 90% savings on a $200/mo budget = $180 back |
| **Small teams** sharing a company Anthropic account | Consistent routing across developers, visible spend per tier |
| **Open-source maintainers** using Claude Code in CI | Cap runaway agents at T2 automatically via the budget guardrail |
| **Researchers & tinkerers** who want a transparent, regex-based router | Every decision is explainable in <10 lines of code |
| **Budget-conscious devs** on the Anthropic 5-hour OAuth plan | Live statusline shows your budget burn in real time |

It is **not** for: production AI workloads where latency matters more than cost, or teams that need a hosted multi-tenant router. frugal is single-user, local, and opinionated.

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
| **T0** | Ollama (qwen2.5:3b), Gemini Flash | Free | Formatting, renaming, commit messages, trivial edits |
| **T1** | Claude Haiku | ~$0.001 | Light code, explanations, translations, regex |
| **T2** | Claude Sonnet, Codex CLI | ~$0.01 | Features, debugging, refactors, planning |
| **T3** | Claude Opus | ~$0.05 | Architecture, multi-file refactors, final review, anything touching secrets/prod |

Want to swap providers? See [docs/MODEL_MAPPING.md](docs/MODEL_MAPPING.md).

---

## Budget guardrail

frugal reads your Anthropic OAuth usage and caps the maximum tier dynamically:

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

See **[SETUP.md](INSTALL.md)** for full instructions. TL;DR (once you have access):

```bash
git clone git@github.com:pauloloureiroshp-ship-it/frugal.git
cd frugal
bash install.sh           # copies hooks, agents, docs to ~/.claude/
```

Requirements:

- Claude Code (latest)
- Node.js 20+
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
| **v0.5.0** | ✅ **Released** | **Auto-learning loop: backtest, TUNED wire-up, 11 tests, pct_by_model** |
| v0.6.0 | 🟡 Planned | Web dashboard (Next.js) for decisions.log exploration |
| v0.7.0 | 🟡 Planned | Single-source-of-truth HIGH_RISK across classifier + backtest |
| v0.8.0 | 🟡 Planned | Team shared config via Git, per-contributor analytics |
| v1.0 | 🔵 Planned | Public launch, plugin marketplace, MCP integration |

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
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | What frugal does *not* do |
| [docs/REAL_CORPUS_VALIDATION.md](docs/REAL_CORPUS_VALIDATION.md) | The 1,370-prompt benchmark |
| [docs/MODEL_MAPPING.md](docs/MODEL_MAPPING.md) | How to swap providers |

---

## License

MIT — see [LICENSE](LICENSE). See [NOTICE.md](NOTICE.md) for why the repo is currently private despite the permissive license, and for details on commercial use.

---

<div align="center">

**Built with Claude Code. Validated on real production prompts. Dogfooded daily.**

*Paulo Loureiro · 2026 · Lisbon*

</div>
