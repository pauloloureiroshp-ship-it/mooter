---
name: pastor-distill
description: Distil Mooter's learned routing patterns into an installable markdown skill. Use when the user wants to export what the Pastor learned, share their routing profile, or seed another agent with their tier/model preferences.
---

# Pastor Distill

Turn the Mooter Pastor's accumulated routing decisions into a portable, installable
`.skill.md`. The distilled skill encodes *this machine's* learned patterns — which task
categories route to which tier/model, the language mix, and confidence — so any agent
can reuse them. Features only: no prompts or responses are ever included.

## Commands

```bash
mooter pastor distill                       # → ~/.mooter/distilled/pastor-<date>.skill.md
mooter pastor distill --from <log>          # distil a specific decisions.log
mooter pastor distill --name my-routing     # custom skill name
mooter pastor adapters                      # list the 6 per-task LoRA adapter types
mooter pastor route "<prompt>"              # preview which adapter LORAUTER would pick (dry-run)
mooter pastor state                         # active adapter + usage summary
mooter pastor train-status                  # overnight LoRA training status
```

## How it works

1. **Read** the router decisions log (`~/.Codex/tools/router/decisions.log`, or `--from`).
2. **Extract** patterns: aggregate by `(task_category, tier)` → count, dominant model, avg
   confidence, language mix. Deterministic, no LLM.
3. **Generate** an Anthropic-compatible `.skill.md` (YAML frontmatter `name`/`description`
   + a learned-routing-rules table).
4. **Install** it anywhere: `npx skills add <path>`.

## Per-task adapter routing (LORAUTER)

`mooter pastor route` and the `mooter_pastor_adapter_suggest` MCP tool use the LORAUTER
engine: deterministic TF-IDF + cosine matching of the prompt against six per-task adapter
profiles (`coding-frontend`, `coding-backend`, `coding-data`, `prose-pt-pt`, `prose-en`,
`baseline`). The classifier's tier is a hard guardrail — LORAUTER only biases *which
adapter* runs inside the chosen tier, never the tier itself. Auto-swap is opt-in
(`MOOTER_LORA_AUTOSWAP=1`).

## Example output

See `example-distilled.md` — a real distillation of 656 routing decisions showing the
learned `architecture_or_critical → T3`, `simple_transform → T1`, `trivial_local → T0`
rules with per-category confidence.
