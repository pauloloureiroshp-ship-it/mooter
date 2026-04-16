# Routing Lessons — False Positives & Misroutes

Registo de casos reais onde o router ou o agente tomaram decisões sub-óptimas, para referência futura e para informar melhorias no classify.js e na doutrina.

---

## 2026-04-12 — Falso positivo de "dependência de sessão"

**Prompt**: "Aplica o fix da quality_intent vs tuned_demote no classify.js"

**Tier recomendado**: T0 (conf 0.60) — devia ter sido T2 (Sonnet via model-reasoner)

**O que aconteceu**: O agente (Opus) justificou inline com "dependência de sessão — já li o classify.js nos turns anteriores". Executou 6 tool calls em Opus (Read, Grep, Edit, Bash). Custo estimado: ~$1.54.

**O que devia ter acontecido**: Spawn `model-reasoner` (Sonnet) com prompt auto-contido: "Lê classify.js, move o bloco TUNED_DEMOTE para depois de quality_intent, adiciona guardrail !qualityIntent." O subagent lê o ficheiro do disco — não precisa do contexto da sessão. Custo estimado: ~$0.08.

**Porquê falhou**: O agente confundiu "ficheiro que já li nesta sessão" com "estado de sessão que um subagent não veria". Ficheiros no disco são acessíveis a qualquer subagent. A justificação era falsa.

**Lição**: Leitura prévia de ficheiro em sessão **não cria dependência de sessão**. Estado de sessão válido = variáveis em memória, decisões não persistidas, outputs intermédios de tool calls sem ficheiro correspondente.

**Fix aplicado**: Adicionada definição explícita de "estado de sessão" na secção GUARDRAILS do CLAUDE.md (projecto e global).

---

## 2026-04-12 — PostToolUse:Bash mostra modelo errado após subagent

**Prompt**: Qualquer turno que spawne um subagent (local-summarizer, cheap-triage, model-reasoner)

**Tier recomendado**: N/A (bug no hook, não no classifier)

**O que aconteceu**: O PostToolUse:Bash mostrava sempre `claude-opus-4-6` na statusline, mesmo quando a tarefa real correu em Ollama/Haiku/Sonnet via subagent. O user via "Opus" e concluía que a delegação não estava a funcionar.

**Causa raiz**: `PostToolUse.js` resolve o modelo via transcript JSONL → Pass 1 falha (tool_use_id do subagent não existe no transcript pai) → Pass 1.5 falha (directório `subagents/` pode não existir) → Pass 2 fallback apanha a última mensagem assistant no transcript pai → que é sempre Opus (o orquestrador).

**O que devia ter acontecido**: Após delegação, a statusline deveria mostrar o modelo do subagent activo (ex: `qwen2.5:3b`, `claude-haiku-4-5`, `claude-sonnet-4-6`).

**Fix aplicado**:
1. `inject_context.js`: escreve `last-subagent.json` com `{model, subagent, tier, ts}` após cada classificação que sugere um subagent
2. `PostToolUse.js`: novo Pass 3 — se `last-subagent.json` tem < 30s, usa esse modelo em vez do fallback Opus. Só activa quando não há `subagentType` directo no payload (evita conflito com o Pass 4 existente)

**Lição**: A statusline é a única feedback visual do routing. Se mostrar o modelo errado, invalida todo o sistema de confiança do user — parece que nada está a ser delegado.
