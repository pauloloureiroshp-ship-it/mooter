---
name: frugal-auto
description: >
  Clears any active frugal mode and returns to intelligent auto-routing.
  Use when the user types "/frugal-auto", "auto mode", "modo auto", "volta ao normal",
  "desactiva beast mode", "desactiva zen mode", "frugal normal", "routing automático",
  "limpa o modo", "reset mode", or after a Beast/Zen session when they want the router
  to make intelligent decisions again.
---

# /frugal-auto — Auto Mode ⚡

Clears Beast or Zen mode. Returns to intelligent routing — minimum viable tier per task.

---

## Execution

```bash
node ~/.claude/tools/router/frugal-mode.js auto
```

---

## What changes

Deletes `.frugal-mode.json` from the router directory. From the next prompt onward,
`inject_context.js` finds no mode file and returns to the full routing pipeline:

1. classify.js → 11-pass regex classification
2. applyBudgetCap → budget-aware guardrails
3. arbiter.js → semantic confirmation if confidence < 0.75
4. CLAUDE.md doctrine → tier-appropriate subagent or inline execution

The `<router-hint>` will no longer include any `MODE:` or `FORCED:` fields.

---

## Output format

```
⚡ frugal — Auto Mode activado.

  Router inteligente de volta ao controlo.
  Tier mínimo viável por prompt. 90%+ de poupança esperada.

  Sessão anterior em Beast Mode: 47min
  Sessão anterior em Zen Mode:   —

  Tier cheat sheet:
    T0 Ollama  ($0)    → trivial, rename, 1 ficheiro
    T1 Haiku   (~$0.01) → commit msg, docstring, regex
    T2 Sonnet  (~$0.10) → bug hunt, plano, refactor
    T3 Opus    (~$1.00) → arquitectura, multi-arquivo, pre-push
```

If no active mode was set, show:

```
⚡ frugal — já estava em Auto Mode.
   O router inteligente nunca foi desactivado.
```

---

## After activation

Continue the conversation normally. The router will resume making cost-optimized
decisions automatically. No action needed from the user.
