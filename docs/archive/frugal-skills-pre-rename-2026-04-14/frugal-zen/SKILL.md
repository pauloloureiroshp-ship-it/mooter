---
name: frugal-zen
description: >
  Activates Zen Mode: caps all prompts at T1 (Haiku or Ollama). Maximum savings.
  Use when the user types "/frugal-zen", "zen mode", "modo zen", "poupança máxima",
  "tokens a zero", "estou sem créditos", "usa só o mais barato", "economia total",
  "save everything", "modo económico", "frugal-saving-mode", or any variation
  signalling they want to minimize cost at all costs.
---

# /frugal-zen — Zen Mode 🧘

Caps all prompts at T1 (Haiku/Ollama) until explicitly cleared with `/frugal-auto`.
Every token counts. Calm. Efficient. No waste.

---

## Execution

```bash
node ~/.claude/tools/router/frugal-mode.js zen
```

---

## What changes

When Zen Mode is active, `inject_context.js` reads `.frugal-mode.json` on every hook
invocation and **caps the router decision at T1**, regardless of:

- Task complexity (even architecture questions go to Haiku/Ollama)
- Escalation rules (cascade_if_needed is suppressed)
- Arbiter decisions (no upward escalation from semantic layer)

The `<router-hint>` emitted will include:

```
MODE: zen
TIER: T1 (or lower if classifier recommends T0)
TIER_MAX: T1
FORCED: true
```

**Exception**: T3-gate tasks (pre-push, pre-merge, pre-deploy) are NOT capped.
Safety guardrails override Zen Mode. If `final-reviewer` would trigger, it triggers.

---

## Output format

```
🧘 frugal — Zen Mode activado.

  Todos os prompts → máx. T1 (Haiku/Ollama) até /frugal-auto.
  Poupança máxima. Cada token conta.

  ⚠  Tarefas complexas terão qualidade reduzida.
     Para code review crítico ou arquitectura, usa /frugal-auto.

  Activo desde: 14:32
  Tokens restantes esta hora: [ler de budget-cache se disponível]
```

If Zen Mode was already active, show:

```
🧘 frugal — Zen Mode já estava activo (desde 14:32, 23min)
   Nada mudou.
```

---

## After activation

Continue the conversation normally. Acknowledge that responses may be shorter or
ask more clarifying questions than usual — Zen Mode optimizes for token efficiency.

Do NOT apologize for using cheaper models. Simply execute efficiently.
