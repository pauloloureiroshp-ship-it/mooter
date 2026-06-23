# Ponte Cowork⇄CC seamless — pesquisa + decisão (2026-06-22)

## Diagnóstico (o que estava errado)
O problema **não** era "o Cowork não consegue teclar no VS Code". Era estares a correr
sessões **interactivas** do Claude Code, onde o agente chama `AskUserQuestion` e isso vira
um diálogo que tu tens de clicar. Em headless puro esse diálogo não existe — mas o
`claude -p` (CLI) que o `loop-runner.mjs` usa também não te deixa **responder** a uma
pergunta programaticamente. Faltava a peça do meio.

## Achado decisivo — `canUseTool` (Claude Agent SDK)
O **Agent SDK** (sucessor do Claude Code SDK, renomeado set/2025) expõe um único callback
`canUseTool` que dispara para **as duas** coisas: pedidos de permissão de tool **E**
perguntas `AskUserQuestion`. Ou seja, o loop **responde às próprias perguntas em processo**,
pela política — **nunca** abre diálogo. Sem clicar, sem teclar, sem UI.

| Mecanismo | O que resolve | Fonte |
|---|---|---|
| `canUseTool(tool, input)` → allow/deny/answer | responde AskUserQuestion + gateia tools, in-process | [user-input](https://code.claude.com/docs/en/agent-sdk/user-input) |
| `PermissionRequest` hook (`"behavior":"allow"`) | auto-aprova permissões mesmo no CLI/plugin | [hooks](https://code.claude.com/docs/en/hooks-guide) |
| `Stop` hook | avisa o bus no instante em que o turno acaba (zero polling) | [hooks](https://code.claude.com/docs/en/hooks-guide) |
| `resume: sessionId` | continuidade de contexto entre rondas | [overview](https://code.claude.com/docs/en/agent-sdk/overview) |
| `defer` decision | processo sai e retoma depois (gate humano sem prender CPU) | [user-input](https://code.claude.com/docs/en/agent-sdk/user-input) |

## Auth — viável sem custo extra (crítico)
Desde **2026-06-15**, o Agent SDK corre no crédito do teu plano (Max 20x = **$200/mês de
crédito SDK**), **sem API key**. O binário embebido usa o teu CC já autenticado.
([support.claude.com](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) ·
[totalum](https://www.totalum.app/blog/claude-agent-sdk-credits-2026))
⚠️ Se autenticares com API key, perdes o crédito e passa a pay-as-you-go — **não** uses API key.

## Decisão
**Construído:** `_handoff/loop/sdk-runner.mjs` — substitui o `runClaude` (CLI) do
`loop-runner.mjs` por `query()` do SDK, com:
- `canUseTool` que **responde AskUserQuestion pela STANDING_POLICY/rubrica** (via um
  micro-call Haiku "governador" + fallback determinístico) → **fim dos diálogos**;
- destrutivo (push/merge-main/deploy/secrets/rm/`classify.js`) → **deny + log em
  `DECISIONS.md`** (não bloqueia, redirige para trabalho reversível) = P4 HOTL em código;
- `resume` + `Stop` hook + stream para `transcript/` (vês tudo ao vivo).

## 3rd-party estudados (e veredicto honesto)
| Repo | O que faz | Para nós |
|---|---|---|
| [ccmanager](https://github.com/kbwo/ccmanager) | gere N sessões CC por git-worktree; **auto-aprova prompts via Haiku** | conceito que copiámos; é TUI Unix-first, fraco no Windows |
| [claude-squad](https://github.com/smtg-ai/claude-squad) | multi-agente em tmux + worktrees | tmux = Unix; não no teu Win11 |
| [ruflo / claude-flow](https://github.com/ruvnet/ruflo) | meta-harness swarm, 314 MCP tools | poderoso mas pesado; só se quiseres swarm mais tarde |

Veredicto: nenhum encaixa limpo no Windows + plugin Mooter. O **SDK runner próprio** é
mais simples, nativo e já fala o nosso file-bus. O `sdk-runner.mjs` pode spawnar **uma
`query()` por pilar/worktree** → é a frota, sem dependências externas.

## Próximo (a tua máquina — eu não consigo testar auth daqui)
1. `cd ~/frugal && npm i @anthropic-ai/claude-agent-sdk`
2. Single-writer (mata órfãos): `Get-Process node | Stop-Process -Force; pm2 delete all`
3. `node _handoff/loop/sdk-runner.mjs` (ou pm2). Smoke: `DRY_RUN=1` primeiro.
4. Se ok → empacotar como skill `cowork-cc-bridge` (skill-creator) para reuso.
