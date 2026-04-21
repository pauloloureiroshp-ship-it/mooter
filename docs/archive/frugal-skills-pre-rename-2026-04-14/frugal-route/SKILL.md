---
name: frugal-route
description: >
  Classifies any task or prompt and explains which tier and model frugal would use, and why.
  Use when the user types "/frugal-route <task>", "/route <task>", "que tier para isto",
  "qual modelo para", "classifica isto", "frugal decide", or wants to understand a routing
  decision before executing a task. Also aliased as /router for backwards compatibility.
---

# /frugal-route — On-Demand Routing Decision

Classifies any task and explains the routing decision. The human-facing interface to the classifier.

---

## Execution

```bash
# Classify the provided task
node ~/.claude/tools/router/classify.js "<TASK_FROM_USER>" 2>/dev/null
```

If no task is provided after the slash command, ask: "Qual é a tarefa que queres classificar?"

---

## Reading the classifier output

```json
{
  "tier": "T2",
  "task_category": "bug_investigation",
  "confidence": 0.78,
  "recommended_model": "claude-sonnet-4-6",
  "suggested_subagent": "model-reasoner",
  "recommended_backend": "claude_subagent",
  "escalation_rule": "cascade_if_needed",
  "cascade_path": "L1→L2",
  "has_code_block": false,
  "lang_detected": "pt",
  "is_question": true
}
```

---

## Output format

Return a clear routing recommendation in PT-PT:

```
⚡ frugal — decisão de routing

Tarefa: "porque é que o websocket reconnect falha às vezes"

  Tier:      T2  (Sonnet)
  Categoria: bug_investigation
  Modelo:    claude-sonnet-4-6
  Subagent:  model-reasoner
  Confiança: 0.78  ⚠ média — arbiter Haiku será consultado

  Por quê T2 e não T3:
  A tarefa envolve investigação de bug (T2 por padrão). Não há
  sinais de arquitectura, multi-arquivo, ou decisão crítica.
  Se encontrares root cause que implique refactor estrutural,
  escala manualmente com @opus ou o final-reviewer fará isso.

  Sinais detectados:
  ✓ is_question
  ✓ lang_detected=pt
  ○ has_code_block=false
  ○ has_error_trace=false
```

### Tier cheat sheet (sempre mostrar no final):

```
T0 Ollama ($0)    → trivial, rename, resume, command paste, 1 ficheiro
T1 Haiku (~$0.01) → commit msg, docstring, regex, explica erro
T2 Sonnet (~$0.10) → bug hunt, root cause, plano, refactor simples
T3 Opus (~$1.00)  → arquitectura, multi-arquivo, pré-push, prod/secrets
```

If confidence < 0.60, add: "⚠ Confiança baixa — o arbiter Haiku vai ser consultado automaticamente. Considera dar mais contexto no teu prompt."
If confidence > 0.90, add: "✓ Alta confiança — decisão directa sem arbiter."
