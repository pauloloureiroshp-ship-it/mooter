# Agent Workflow — Claude Code · Codex · Gemini

## Papéis

| Agente | Papel | Contexto |
|---|---|---|
| Claude Code | Arquiteto principal, waves, orquestração | `CLAUDE.md`, `AGENTS.md`, `_handoff/` |
| Codex | Implementação, debugging, testes | `AGENTS.md` (+ `CODEX.md` quando existir) |
| Gemini CLI | Revisor, validador, segunda opinião | `GEMINI.md`, `AGENTS.md` |

## Regras de colaboração

1. Gemini não atua como agente principal sem autorização explícita do Paulo.
2. Nenhum agente sobrescreve trabalho de outro — em conflito, registrar em
   `docs/AGENT_HANDOFF.md` e parar.
3. Invariantes de `CLAUDE.md` valem para todos: `classify.js` frozen, packages
   frozen, git adds seletivos, sem `.md` novo na raiz sem pedido.
4. Working tree é frequentemente partilhado por várias sessões (ver `SYNC.md`):
   antes de tocar em ficheiros tracked, verificar estado e preferir ficheiros novos.
5. Tarefas pequenas e reversíveis > refactors grandes.
6. Handoffs de wave vivem em `_handoff/`; ao shipar, arquivar em
   `_handoff/_archive/YYYY-MM/` (regra em `AGENTS.md § Information architecture`).

## Fluxo típico

1. Claude Code desenha o plano / masterprompt (wave brief em `_handoff/`).
2. Codex ou Claude Code implementa em branch/worktree próprio.
3. Gemini revisa: doc vs código, riscos, alternativas — devolve parecer.
4. Paulo decide gates humanos: push/merge main, deletes, secrets, dinheiro.
