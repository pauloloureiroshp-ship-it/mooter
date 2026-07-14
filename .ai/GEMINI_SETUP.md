# Gemini CLI Setup

## Estado verificado (2026-07-09)

- Gemini CLI: `@google/gemini-cli@0.36.0` global (npm prefix `AppData\Roaming\npm`)
- Node v24.14.0 · npm 11.9.0 · VS Code 1.127.0
- Extensão: `google.gemini-cli-vscode-ide-companion` v0.20.0 (Gemini CLI Companion)
  — é DIFERENTE de `google.geminicodeassist` (Gemini Code Assist), que também está instalada.

## Contexto compartilhado (harmonia CC · Codex · Gemini)

- **Canon único = `AGENTS.md`** (padrão cross-tool agents.md).
- Codex lê `AGENTS.md` nativamente (hierarquia `~/.codex/AGENTS.md` → raiz → cwd).
- Gemini lê `AGENTS.md` + `GEMINI.md` via `.gemini/settings.json`:
  `{"context": {"fileName": ["AGENTS.md", "GEMINI.md"]}}`
- Claude Code lê `CLAUDE.md` (que importa `@AGENTS.md`).
- `GEMINI.md` contém SÓ o que é específico do Gemini (papel de revisor) — nunca
  duplicar regras do `AGENTS.md`. Dentro do Gemini, `/memory show` mostra o que carregou.

## Como iniciar

No terminal integrado do VS Code (raiz do repo):

```
gemini
```

Se a integração IDE não ativar sozinha, dentro do Gemini CLI:

```
/ide enable
```

(ou `/ide install` para (re)instalar a extensão companion.)

## Experiência esperada

Gemini roda como agente terminal-first dentro do VS Code.
Com o Gemini CLI Companion, ele recebe contexto do editor, seleção,
arquivos abertos e pode exibir diffs nativos no editor.
Confirme o contexto carregado com `/memory show` (deve listar AGENTS.md e GEMINI.md).

## Painéis recomendados no VS Code

- Claude Code
- Codex (extensão `openai.chatgpt`)
- Gemini (terminal integrado)
- Mooter.ai (extensão `mooter.mooter-cockpit`)

## Primeiro prompt para Gemini

```
Leia GEMINI.md, AGENTS.md, CLAUDE.md, SYNC.md (tail), docs/strategy/STRATEGY.md
e ARCHITECTURE.md. Não altere nada ainda.
Faça onboarding completo do projeto e devolva:
1. resumo executivo
2. arquitetura atual
3. estado do código
4. riscos
5. inconsistências (documentação vs código real)
6. plano de colaboração com Claude Code e Codex
```

## Reinstalação / máquina nova

```
powershell -ExecutionPolicy Bypass -File scripts/setup-gemini-vscode.ps1
```

(idempotente — só instala o que estiver ausente, nunca sobrescreve ficheiros.)
