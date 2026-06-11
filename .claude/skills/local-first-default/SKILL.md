---
name: local-first-default
description: Prefer FREE local Ollama execution paths (mooter workflow, local-summarizer/local-transformer subagents) for summarize/extract/transform/compare tasks before burning any cloud tokens. Use when planning how to execute a task that smells like T0 work, or when the user asks "can this run locally?".
---

# /local-first-default

Mooter's mission is local-first: route every turn to the cheapest model that
can do it well. Local Ollama costs **$0**; every cloud call costs real money.
Before executing summarize/extract/transform/compare/translate work in a cloud
model, check the local paths first.

## The smell test (apply before every inline cloud execution)

> **"Can a local model do this alone with the inputs I can hand it?"**

If yes → delegate. The 1-2s spawn overhead never outweighs cloud token cost.
The saving is only real when the delegation actually happens — otherwise the
statusline shows `∅ 0% saved (all-Opus)`.

Signals that the answer is YES:
- Summarize / explain a file or diff
- Extract fields, lists, or structure from text
- Format/syntax transforms (JSON↔YAML, table↔list, rename sweeps)
- Compare 2-3 snippets, brainstorm variants, translate
- Fan-out work across many files where each unit is independent

Signals that the answer is NO (keep the routed tier):
- Multi-file architectural judgment, tradeoff decisions
- HIGH_RISK: `.env*`, CI/CD, migrations, secrets, pre-push/merge/deploy
- The task depends on un-persisted session state a fresh worker cannot see
  (declare that dependency in one line before inlining)

## Local execution paths (in order of preference)

| Path | When |
|---|---|
| `local-summarizer` / `local-transformer` subagents | Single-unit summarize/extract/transform — spawn via Agent tool |
| `mooter workflow run "<task>"` (or `/moo-workflow`) | Many files / fan-out: free local Ollama workers + at most ONE cloud synthesis call |
| `bash ~/.claude/tools/router/ollama_call.sh --text "<prompt>"` | Quick one-shot local call from the shell |
| `mooter local-models` | List what is actually pulled locally before promising a model |

## Honest caveats

- Check Ollama is up before promising local execution
  (`curl -s --max-time 1 http://127.0.0.1:11434/api/tags`); if it's down, say
  so and fall back to the routed tier — don't silently burn Opus.
- Local-first is a default, not a ceiling: tier floors and safety boosts
  always win. Never downgrade HIGH_RISK work to local to save money.
- Quality intent (`quality_intent: high`) or an explicit user model pin
  overrides this skill.
