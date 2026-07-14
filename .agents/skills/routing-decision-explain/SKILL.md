---
name: routing-decision-explain
description: Explain why the Mooter router chose a tier for a given prompt — run the real classifier, interpret the JSON (tier, confidence, task_category, escalation rules), and state the honest cost implication. Use when the user asks "why did the router pick T2?", "explain this routing decision", or wants the classifier's reasoning for any prompt.
---

# /routing-decision-explain <prompt>

Explain a routing decision using the **real classifier output** — never guess
what the router "would" do.

## Do this

1. Run the frozen classifier against the exact prompt:

```bash
# Inside the Mooter repo:
node tools/router/classify.js "<prompt>"
# Anywhere else:
node ~/.Codex/tools/router/classify.js "<prompt>"
```

2. Interpret the JSON fields, in this order:
   - `tier` — the routed tier (T0/T1/T2/T3). T5 (Fable 5) is NEVER auto-routed;
     it appears only on an explicit `@fable` pin. There is no T4.
   - `confidence` — below 0.6 the hook does not emit a `<router-hint>`; the
     decision is advisory only. Say so when confidence is low.
   - `task_category` — what pattern matched (e.g. `summarize`, `bug_hunt`,
     `architecture`, `ambiguous_*`).
   - escalation/guardrail fields (e.g. `safety_boost`, HIGH_RISK, user
     override, quality intent) — explain WHICH rule fired and why it beats the
     base classification (safety floor > budget cap; override > everything
     except HIGH_RISK downgrade refusal).

3. State the cost implication using the authoritative 2026-06 list pricing
   (per M tokens, in/out). **Defer to the `pricing-correto-2026` skill — do
   not restate prices from memory elsewhere:**

| Tier | Model | $/M in | $/M out |
|---|---|---|---|
| T0 | local Ollama | $0 | $0 |
| T1 | Haiku | $1 | $5 |
| T2 | Sonnet | $3 | $15 |
| T3 | Opus 4.6 | $5 | $25 |
| T5 (opt-in only) | Fable 5 | $10 | $50 |

Example framing: "Routed T1 (Haiku) instead of T3 (Opus): ~5× cheaper input,
5× cheaper output for a task the classifier matched as `commit_msg`."

## Honest caveats

- `tools/router/classify.js` is FROZEN (sha
  `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`). Never
  edit it to "fix" a routing decision — report disagreements instead.
- Show the raw JSON to the user alongside the interpretation; never paraphrase
  numbers the classifier didn't emit.
- If the classifier disagrees with what the session actually did (e.g. the
  decision log shows a different tier), say both and flag the discrepancy.
