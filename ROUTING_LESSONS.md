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
