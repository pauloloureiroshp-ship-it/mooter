# GEMINI.md — Mooter.ai (contexto específico do Gemini)

> **Canon do repo = `AGENTS.md`** — o Gemini carrega-o automaticamente junto com este
> ficheiro (`.gemini/settings.json` → `context.fileName: ["AGENTS.md", "GEMINI.md"]`).
> Regra: NÃO duplicar conteúdo do `AGENTS.md` aqui — apontar. Os invariantes duros
> (classify.js frozen · packages frozen · git adds seletivos · tier ladder · T5 opt-in)
> estão lá e valem integralmente para o Gemini.

## Papel do Gemini (terceiro agente)

- Segunda opinião técnica · revisão de arquitetura · validação doc vs código real ·
  debugging · análise de riscos · sugestões alternativas.
- NÃO atuar como agente principal nem alterar código sem autorização explícita do Paulo.
- Nunca sobrescrever trabalho do Claude Code ou do Codex.
- Idioma: PT-BR na conversa, English no código e identifiers.

## Fluxo entre agentes

- Claude Code = arquiteto principal · Codex = implementação/debugging/testes ·
  Gemini = revisor/validador · Paulo = gate humano (push/merge/deletes/secrets).
- Conflito entre agentes ⇒ registrar em `docs/AGENT_HANDOFF.md` e PARAR.
- O working tree é partilhado por várias sessões: preferir análise read-only;
  escrita só em ficheiros novos ou com aprovação, sempre pequena e reversível.

## Ordem de leitura (além do AGENTS.md, já auto-carregado)

1. `CLAUDE.md` — invariantes + ponteiros (valem para todos os agentes)
2. `SYNC.md` (tail) — estado atual, sessões e handoffs
3. `docs/strategy/STRATEGY.md` → `ARCHITECTURE.md` (raiz) → `docs/foundation/SYSTEM_DESIGN.md`
4. `docs/decisions/` + `docs/adr/` · `INFRA.md` · `docs/AGENT_HANDOFF.md`

Setup e primeiro prompt: `.ai/GEMINI_SETUP.md` · workflow: `.ai/AGENT_WORKFLOW.md`.
