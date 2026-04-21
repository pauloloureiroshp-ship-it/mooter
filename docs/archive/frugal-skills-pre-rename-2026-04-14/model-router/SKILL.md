---
name: model-router
description: Use when the user explicitly asks "qual modelo devo usar", "rota essa tarefa", "/router", "classifica essa pergunta", or when you yourself are unsure which tier (Opus/Sonnet/Haiku/Ollama) fits a request. Returns a routing decision with rationale grounded in ~/.claude/docs/ROUTING_POLICY.md.
---

# Model Router

This skill is the human-facing interface to Paulo's personal model router. It does **not** execute the task — it tells you (or Paulo) which tier should.

## When to invoke

- The user types `/router` or `model-router` or asks "which model for this?"
- A `<router-hint>` block is missing from the turn AND the next action is non-trivial
- You are about to spawn a subagent and want a sanity check on which one

## How to run

1. Take the prompt or task description (from the user message, or ask if missing).
2. Call the classifier:
   ```bash
   node "$HOME/.claude/tools/router/classify.js" "<the task>"
   ```
3. Read the JSON result. It will look like:
   ```json
   {
     "task_category": "...",
     "tier": "T0|T1|T2|T3",
     "recommended_backend": "ollama|anthropic_api|claude_subagent",
     "recommended_model": "...",
     "suggested_subagent": "...",
     "confidence": 0.0,
     "escalation_rule": "...",
     "anthropic_key_present": false
   }
   ```
4. Translate that into a one-screen recommendation in PT-PT.

## Output format (give this back to the user)

```
## Roteamento sugerido
- **Tier:** <T0–T3>
- **Categoria:** <task_category>
- **Backend:** <ollama | anthropic_api | claude_subagent>
- **Modelo:** <recommended_model>
- **Subagent sugerido:** <suggested_subagent>
- **Confiança:** <0.00–1.00>
- **Por quê:** <one sentence>

<se confiança < 0.6, dizer: "Confiança baixa — recomendo escalar 1 tier acima ou pedir mais contexto antes de delegar.">

<se anthropic_key_present == false e tier originalmente seria T1: "Sem ANTHROPIC_API_KEY no env — Haiku indisponível, rebaixei para Ollama local.">
```

## Tier cheat sheet

| Tier | Quando | Modelo |
|---|---|---|
| **T3** | arquitetura, refator multi-arquivo, review final, mexer em prod, secrets | Opus |
| **T2** | bug investigation, root cause, plano técnico, decomposição | Sonnet |
| **T1** | commit msg, docstring, regex, explicar erro, transform de formato | Haiku (ou Ollama se sem key) |
| **T0** | triagem, sumarização curta, comparação, extração, brainstorm | Ollama qwen3:30b |

## Guardrails (não economizar de forma burra)
- Tarefas críticas → SEMPRE T3, mesmo que pareçam pequenas.
- Arquivos `.env*`, `package.json`, migrations, CI → no mínimo T3.
- Confiança < 0.5 → escalar 1 tier.
- T0 nunca para edits em arquivos de produção sem revisão T2+.

Política completa: `~/.claude/docs/ROUTING_POLICY.md`.
