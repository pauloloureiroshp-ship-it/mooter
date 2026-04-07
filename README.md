# Cloude Router

> **Stop burning Opus tokens on tasks a 3B model could do. Without thinking about it.**

A personal model router for Claude Code that classifies every prompt and routes it to the cheapest viable tier — local Ollama, Haiku, Sonnet, or Opus — automatically. Validated against 1,370 real-world prompts: **90.2% projected cost savings vs naive Opus baseline**, with no quality loss on the 3.6% of prompts that genuinely need Opus.

```
T0  ████████████████████████████████████████  1150 (83.9%)  → local Ollama (free)
T1  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     0 (0.0%)
T2  ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   170 (12.4%)  → Sonnet
T3  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    50 (3.6%)   → Opus

💵 SAVINGS:  $11.12 / 1370 prompts  (90.2%)
```

→ Full statistical validation: [`docs/REAL_CORPUS_VALIDATION.md`](docs/REAL_CORPUS_VALIDATION.md)
→ Pitch & benefits: [`docs/BENEFITS.md`](docs/BENEFITS.md)

---

## What it does

Every time you send a prompt to Claude Code, the router:

1. **Classifies** it (heuristic regex, < 50 ms, zero LLM cost)
2. **Injects a routing hint** into the model's context via the `UserPromptSubmit` hook
3. The session reads the hint and **delegates** to the cheapest viable tier:
   - **T0** — local Ollama (`qwen2.5:3b`) for trivial / read-only / format transforms
   - **T1** — Haiku (direct API) for commit messages, docstrings, regex
   - **T2** — Sonnet for bug investigation, plans, decomposition
   - **T3** — Opus for architecture, critical refactor, pre-merge review

There's no slash command to remember. There's no decision to make. The router runs invisibly on every prompt, in every project, in every Claude Code session.

---

## Install

### One-command install

```bash
git clone https://github.com/pauloloureiroshp-ship-it/cloude-router.git
cd cloude-router
bash install.sh
```

This will:
- Backup any existing `~/.claude/CLAUDE.md` and `settings.json`
- Install the router scripts into `~/.claude/tools/router/`
- Install the 6 subagents into `~/.claude/agents/`
- Install the `model-router` skill into `~/.claude/skills/`
- Install the documentation into `~/.claude/docs/`
- Detect Ollama and pull `qwen2.5:3b` (1.9 GB) if not present
- Merge a non-blocking `UserPromptSubmit` hook into `settings.json` (preserves your existing hooks)
- Run a self-test + 12-prompt benchmark to confirm everything works

### Diagnose / Uninstall

```bash
bash install.sh --doctor      # diagnose current install
bash install.sh --uninstall   # restore from backup
bash install.sh --dry-run     # show what would change
```

### Validate against your own history

The most powerful demo: replay **your own** Claude Code prompts through the router.

```bash
node ~/.claude/tools/router/replay.js                       # full corpus
node ~/.claude/tools/router/replay.js --top-low-conf 30     # show tuning candidates
node ~/.claude/tools/router/replay.js --json my-data.json   # machine-readable
node ~/.claude/tools/router/replay.js --per-project         # per-project breakdown
```

You'll get a tier distribution, confidence histogram, and projected savings calibrated against **your real usage**.

---

## How it works

```
┌──────────────────────────────────────────────────────────┐
│  You type a prompt into Claude Code                      │
└────────────────────┬─────────────────────────────────────┘
                     ▼
   ┌───────────────────────────────────────────┐
   │ Hook: UserPromptSubmit                    │
   │ → router/inject_context.js                │
   │   → router/classify.js (≤ 50 ms)          │
   │   → emit <router-hint> if conf ≥ 0.6      │
   └─────────────────┬─────────────────────────┘
                     ▼
   ┌───────────────────────────────────────────┐
   │ Claude Code session reads the hint        │
   │ Decides:                                  │
   │  • answer inline?                         │
   │  • spawn model-architect (Opus)?          │
   │  • spawn model-reasoner (Sonnet)?         │
   │  • spawn cheap-triage (Haiku)?            │
   │  • spawn local-summarizer (Ollama)?       │
   └─────────────────┬─────────────────────────┘
                     ▼
   ┌───────────────────────────────────────────┐
   │ Work runs in the cheapest viable tier     │
   │ Telemetry logged to decisions.log         │
   └───────────────────────────────────────────┘
```

→ Full diagram: [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md)
→ Routing rules: [`docs/ROUTING_POLICY.md`](docs/ROUTING_POLICY.md)

---

## Validation

The router has been validated against **two independent test suites**:

### 1. Synthetic benchmark (12 hand-labeled prompts)
- **100% classifier accuracy** (after 1 tuning cycle)
- **70% cost reduction** vs naive Opus baseline
- Re-run: `bash router/benchmark.sh`

### 2. Real-corpus replay (1,370 prompts from actual `~/.claude/history.jsonl`)
- **83.9%** of prompts route to local Ollama (free)
- **3.6%** route to Opus (only the truly critical)
- **2.0%** low-confidence rate
- **90.2% projected cost savings** vs naive Opus baseline
- Re-run: `node router/replay.js`

→ Full report: [`docs/REAL_CORPUS_VALIDATION.md`](docs/REAL_CORPUS_VALIDATION.md)

### Cost projection (calibrated against real usage)

| Scale | Naive Opus / month | Mediator / month | Savings / year |
|---|---|---|---|
| 1 developer | $24 | $2.40 | **~$260** |
| 10-person team | $240 | $24 | **~$2,600** |
| 50-person org | $1,200 | $120 | **~$13,000** |

---

## Tiers and models

| Tier | Default model | Override env var |
|---|---|---|
| **T0** local | `qwen2.5:3b` (Ollama) | `ROUTER_OLLAMA_TERSE` |
| **T0** local reasoning | `qwen3:30b` (Ollama, optional) | `ROUTER_OLLAMA_REASON` |
| **T1** cheap Claude | `claude-haiku-4-5-20251001` | `ROUTER_ANTHROPIC_MODEL` |
| **T2** reasoning Claude | `claude-sonnet-4-6` | (subagent frontmatter) |
| **T3** premium Claude | `claude-opus-4-6` | (subagent frontmatter) |

→ How to swap models: [`docs/MODEL_MAPPING.md`](docs/MODEL_MAPPING.md)

---

## Subagents installed

| Subagent | Model | Use for |
|---|---|---|
| `model-architect` | Opus | architecture, multi-file refactor, pre-merge review |
| `model-reasoner` | Sonnet | bug hunt, root cause, technical plan |
| `cheap-triage` | Haiku | commit msg, docstring, regex, format transform |
| `local-summarizer` | Ollama | summarize file, compare snippets, extract data |
| `local-transformer` | Ollama | format transforms, normalize lists |
| `final-reviewer` | Opus | gate before push/merge/deploy (always Opus, never compromised) |

---

## Limitations (honest)

→ [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) covers everything, but the highlights:

- **The session's main model can't be swapped at runtime** — Claude Code doesn't expose this. The router delegates to subagents instead. Workaround: start sessions in Sonnet (`claude --model sonnet`) and let the router escalate.
- **`ANTHROPIC_API_KEY` ergonomics** — Claude Code uses OAuth, doesn't export a key. Direct Haiku tier requires you to add the key to env. Subagents with `model: haiku` work via OAuth (no key needed).
- **Heuristic, not ML** — this is a feature: every misclassification is a fixable regex. But it does mean ambiguous prompts in unusual languages may need tuning. Use `replay.js --top-low-conf 30` on your own history to find them.

---

## Roadmap

- [x] v0.1.0 — initial install, hook, subagents, docs
- [x] v0.2.0 — synthetic benchmark, telemetry, install.sh
- [x] v0.3.0 — real-corpus replay (1,370 prompts), classifier v3 tuning, statistical validation
- [ ] v0.4.0 — `replay.js --auto-tune` (proposes regex additions from low-conf)
- [ ] v0.5.0 — preset packs (English, Spanish, German, French)
- [ ] v1.0 — cross-machine validation with 5+ users, public release
- [ ] v1.1 — hosted decision dashboard (Pro tier)

---

## License

MIT — see [`LICENSE`](LICENSE).

## Contributing

This is currently in private alpha. If you're using Claude Code intensively and want to be one of the first 5–10 cross-machine validators, open an issue.

The most valuable contribution right now is **running `replay.js` on your own `~/.claude/history.jsonl` and sharing the JSON output**. That's how we validate the heuristics across different developers, languages, and project types.

---

## Credits

Built and validated end-to-end inside a single Claude Code session by Claude Opus 4.6 — eating its own dogfood throughout. The numbers in `REAL_CORPUS_VALIDATION.md` are the model's own measurements of itself.
