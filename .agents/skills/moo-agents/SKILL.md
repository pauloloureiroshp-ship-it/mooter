---
name: moo-agents
description: List Mooter's subagent roster (architect · reasoner · triage · local · reviewer) with tier and live orchestration status. Use when the user types /moo-agents or asks which agents Mooter can route to.
---

# /moo-agents

Show the Mooter subagent roster and its live orchestration state. This is the
Mooter-native companion to Codex's `/agents` — it does **not** replace it.

## The roster

| Subagent | Tier · model | Role |
|---|---|---|
| `model-architect` | T3 · Opus | Architecture, multi-file refactor, critical changes |
| `model-reasoner` | T2 · Sonnet | Bug investigation, root cause, technical planning |
| `cheap-triage` | T1 · Haiku | Commit msgs, docstrings, regex, trivial tests |
| `local-summarizer` | T0 · Ollama | Summaries, comparisons, extraction (free, local) |
| `local-transformer` | T0 · Ollama | Deterministic format transforms (free, local) |
| `final-reviewer` | T3 · Opus | Pre-merge / pre-deploy / pre-release gate review |

Definitions live in `~/.Codex/agents/<name>.md`.

## Do this

Show the live orchestration state (locks · sessions · queue across terminals):

```bash
mooter conductor status
```

For cross-terminal session heartbeats use `mooter conductor heartbeats`.
