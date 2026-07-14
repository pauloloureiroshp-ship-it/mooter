# AGENT_HANDOFF.md — Handoffs entre agentes (Claude Code · Codex · Gemini)

Registro de decisões e conflitos entre agentes. Handoffs de wave continuam em
`_handoff/` (ver `AGENTS.md § Information architecture`); este ficheiro cobre a
coordenação entre ferramentas de agente diferentes.

Criado em 2026-07-09 durante o setup do Gemini CLI.

## Gemini CLI / VS Code Setup

- Gemini será usado via Gemini CLI dentro do terminal integrado do VS Code.
- Extensão recomendada: `Google.gemini-cli-vscode-ide-companion` (Gemini CLI
  Companion — distinta do Gemini Code Assist `google.geminicodeassist`).
- Gemini não substitui Claude Code nem Codex.
- Papel: revisão, segunda opinião, validação e debugging.
- Não migrar para Antigravity IDE porque o Mooter.ai é um plugin do VS Code.
- Contexto do Gemini: `GEMINI.md` (raiz) · setup: `.ai/GEMINI_SETUP.md` ·
  workflow: `.ai/AGENT_WORKFLOW.md` · reinstalação: `scripts/setup-gemini-vscode.ps1`.
