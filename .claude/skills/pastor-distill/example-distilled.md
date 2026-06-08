---
name: my-pastor-routing
description: Learned LLM routing patterns distilled from 656 local routing decisions (top category: architecture_or_critical). Use as a routing reference: match the task to a category below and prefer the listed tier/model.
---
# Pastor — Distilled Routing Skill

> Generated 2026-06-08 from 656 classified routing decisions on this machine.
> Privacy: features only — no prompts or responses are included.

## Tier mix

T3 48% · T1 32% · T0 18% · T2 2%

## Language mix

other 93% · pt 4% · en 3%

## Learned routing rules

When a task matches one of these categories, prefer the corresponding tier/model:

| Task category | Tier | Model | Lang | n | avg conf |
|---|---|---|---|---|---|
| architecture_or_critical | T3 | Opus | other | 203 | 0.86 |
| simple_transform_or_explain | T1 | Haiku | other | 200 | 0.86 |
| trivial_local | T0 | local (Ollama) | other | 98 | 0.80 |
| simple_transform_or_explain | T3 | Opus | other | 63 | 0.90 |
| cross_file_change | T3 | Opus | other | 45 | 0.87 |
| ambiguous_short | T0 | local (Ollama) | other | 9 | 0.65 |
| ambiguous_medium | T1 | Haiku | other | 7 | 0.60 |
| bash_command_paste | T0 | local (Ollama) | en | 7 | 0.90 |
| ambiguous_medium | T2 | Sonnet | other | 4 | 0.60 |
| ambiguous_short | T2 | Sonnet | other | 4 | 0.65 |
| reasoning_intermediate | T2 | Sonnet | other | 4 | 0.70 |
| mechanical_trivial | T0 | local (Ollama) | en | 3 | 0.90 |
| trivial_local | T3 | Opus | other | 3 | 0.80 |
| trivial_local | T2 | Sonnet | other | 3 | 0.80 |
| file_read_intent | T0 | local (Ollama) | en | 2 | 0.85 |

## How to use

1. Classify the incoming task into one of the categories above.
2. Route to the listed tier (T0 local → T3 Opus). Escalate only on HIGH_RISK signals (deploy, migration, secrets).
3. The doctrine guardrail always wins: never downgrade a HIGH_RISK task below T3.

_This skill is a snapshot. Re-run `mooter pastor distill` to refresh it as the Pastor learns more._
