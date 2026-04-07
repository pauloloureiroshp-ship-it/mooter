# frugal

> **The Claude Code router that knows when to save.**

frugal is a zero-proxy, doctrine-based prompt router that lives in `~/.claude/` and auto-loads into every Claude Code session. It classifies each prompt in **<50ms** using pure regex — zero LLM cost — and routes it to the cheapest capable provider: Ollama → Haiku → Sonnet → Opus.

In production across 1,370 real prompts: **90.2% cost savings** vs naive Opus routing.

---

## Statusline

```
◈ claude-sonnet-4-6 │ ctx:23% ▓▓░░░░░░░░ │ 5h:37% ▓▓▓░░░░░░░ ↺2h14m │ 7d:12% │ $0.18 │ max:T3
```

Live in your terminal: current model, context window usage, OAuth budget consumption (5-hour + 7-day), cost this session, and active routing ceiling — all updated after every response.

---

## At a glance

| Metric | Value |
|---|---|
| Prompts validated | 1,370 real prompts |
| T0 routing (free/local) | 83.9% |
| T2 routing (Sonnet) | 12.4% |
| T3 routing (Opus) | 3.6% |
| Classifier latency | <50ms (regex, zero LLM) |
| Low-confidence rate | 2.0% |
| Savings vs naive Opus | **90.2%** |
| Mediator cost (1,370 prompts) | $1.21 |
| Naive Opus cost (same prompts) | $12.33 |
| Projects validated | marleyliving (CRM), cloude-home, misc |

---

## Why this is different

Most "routers" for LLMs are **proxies** — they sit between your client and the API, intercept requests, and forward them to the right model. This creates deployment complexity, latency overhead, and a single point of failure.

frugal is **doutrina, não proxy**. It works by:

1. A **hook** (`UserPromptSubmit`) that runs `classify.js` on every prompt before Claude Code sends it
2. A **classifier** that injects a `router-hint` into the conversation metadata (<50ms, zero API calls)
3. A **mediator doctrine** in `~/.claude/CLAUDE.md` that Claude Code reads at session start — teaching the session itself to honour the hint and select the appropriate subagent
4. **Subagents** for each tier (Ollama, Haiku, Sonnet, Opus) that Claude Code spawns natively

No proxy. No port. No extra process. The routing intelligence lives in the session itself.

---

## Provider tiers

| Tier | Provider | Cost | Use case |
|---|---|---|---|
| T0 | Ollama (qwen2.5:3b) | Free | Formatting, trivial edits, commits, renaming |
| T0 | Gemini Flash | Free (1k req/day) | Summaries, docstrings, simple Q&A |
| T1 | Claude Haiku | ~$0.001/prompt | Light code, explanations, translations |
| T2 | Claude Sonnet | ~$0.01/prompt | Feature code, debugging, refactors |
| T2 | Codex CLI | Free (ChatGPT sub) | Code generation, ChatGPT Plus fallback |
| T3 | Claude Opus | ~$0.05/prompt | Architecture, complex reasoning, final review |

---

## Budget guardrail

| 5-hour usage | Max tier allowed | Effective ceiling |
|---|---|---|
| 0–50% | T3 | Full routing (Opus allowed) |
| 50–70% | T2 | Sonnet max, Opus blocked |
| 70–85% | T1 | Haiku max |
| 85–95% | T0 | Local/free only |
| >95% | T0 | Hard block on all paid tiers |

---

## Roadmap

| Version | Status | Highlights |
|---|---|---|
| v0.1.0 | Released | classify.js, inject_context.js, 6 subagents, routing docs |
| v0.2.0 | Released | Mediator doctrine, stats.js, benchmark.sh, install.sh |
| v0.3.0 | Released | replay.js, 1,370 prompts validated, 90.2% savings, v3 classifier |
| v0.4.0 | Released | Statusline OAuth, budget guardrail, MD enrichment, multi-provider docs, rename to frugal |
| v0.5.0 | Planned | Web dashboard for decisions.log, auto-tune from feedback, team shared config |
| v1.0 | Planned | Plugin marketplace, MCP integration, Windows native installer |

---

## Quick install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/<YOUR_GITHUB_USERNAME>/frugal/main/install.sh)
```

## MD Enrichment — per-project routing

Add to your project's `CLAUDE.md`:

```markdown
## Router Context

project: my-project-name
domain: React 18, Supabase, TypeScript
complexity_bias: T2
sensitive_patterns:
  - "payment", "deploy", "secret"
fast_patterns:
  - "commit message", "rename", "format"
```

## License

MIT © 2026 — frugal contributors

> Built with Claude Code. Validated on real production prompts. No LLM was harmed in the routing of these messages.
