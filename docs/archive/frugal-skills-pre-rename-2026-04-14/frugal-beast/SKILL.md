---
name: frugal-beast
description: >
  Activates Beast Mode: forces T3 (Opus) on all subsequent prompts regardless of task complexity.
  Use when the user types "/frugal-beast", "beast mode", "modo beast", "quero opus em tudo",
  "não me importo com dinheiro", "GSD mode", "velocidade máxima", "força opus", or any variation
  signalling they want full power with no cost restrictions. Also aliased as /frugal-gsd.
---

# /frugal-beast — Beast Mode 🦁

Forces T3 (Opus) on all prompts until explicitly cleared with `/frugal-auto`.
Cost doesn't matter. Speed and quality do. Get Shit Done.

---

## Execution

```bash
node ~/.claude/tools/router/frugal-mode.js beast
```

---

## What changes

When Beast Mode is active, `inject_context.js` reads `.frugal-mode.json` on every hook
invocation and **overrides the router decision to T3**, regardless of:

- Task complexity (even a typo fix goes to Opus)
- Budget cap (applyBudgetCap is bypassed)
- Arbiter decision (confidence checks are skipped)
- Hardware tier (Ollama T0 recommendation is ignored)

The `<router-hint>` emitted will include:

```
MODE: beast
TIER: T3
FORCED: true
```

The CLAUDE.md doctrine honors `FORCED: true` and skips subagent overhead — Claude itself
acts as the T3 model directly (since Cowork sessions run Sonnet/Opus directly).

---

## Output format

```
🦁 frugal — Beast Mode activado!

  Todos os prompts → T3 (Opus) até /frugal-auto.
  Speed > cost. GSD.

  ⚠  Lembra: isto vai queimar tokens rapidamente.
     Usa /frugal-auto quando acabares a sessão intensa.

  Activo desde: 14:32
```

If Beast Mode was already active, show:

```
🦁 frugal — Beast Mode já estava activo (desde 14:32, 23min)
   Nada mudou.
```

---

## After activation

Continue the conversation normally. The mode persists automatically across prompts
and Claude Code restarts until `/frugal-auto` is called.

Do NOT add any routing overhead or tier explanations to subsequent responses.
Just execute everything at full quality.
